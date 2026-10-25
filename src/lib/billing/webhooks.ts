import { and, eq } from "drizzle-orm";
import { db } from "@/db/client";
import {
  billingEvents,
  invoices,
  saasPlans,
  orgMembers,
  payments,
  saasSubscriptions,
  subscriptions,
} from "@/db/schema";
import { audit } from "../audit";
import { env } from "../env";
import { logMembershipEvent, recordPayment } from "../membership";
import { notify } from "../notifications";
import { verifyStripeSignature } from "./stripe";

export type WebhookResult = {
  ok: boolean;
  duplicate?: boolean;
  handled?: string;
  status?: number;
  message?: string;
};

/** Finds a local invoice by provider invoice id or by metadata reference. */
async function findInvoiceByProviderRef(ref: string | null | undefined, orgId?: string | null) {
  if (!ref) return null;
  const byProvider = (
    await db
      .select()
      .from(invoices)
      .where(and(eq(invoices.provider, "stripe"), eq(invoices.providerInvoiceId, ref)))
      .limit(1)
  )[0];
  if (byProvider) return byProvider;
  const byId = (await db.select().from(invoices).where(eq(invoices.id, ref)).limit(1))[0];
  if (byId && (!orgId || byId.orgId === orgId)) return byId;
  return null;
}

/**
 * Processes a Stripe webhook exactly once. The event id is inserted into an
 * idempotency ledger keyed on (provider, event_id) before any side effects.
 */
export async function handleStripeWebhook(rawBody: string, signature: string | null): Promise<WebhookResult> {
  if (!env.stripe.webhookSecret) {
    return { ok: false, status: 503, message: "Webhook secret not configured" };
  }
  const valid = await verifyStripeSignature(rawBody, signature, env.stripe.webhookSecret);
  if (!valid) return { ok: false, status: 400, message: "Invalid signature" };

  let event: { id: string; type: string; data: { object: Record<string, unknown> } };
  try {
    event = JSON.parse(rawBody);
  } catch {
    return { ok: false, status: 400, message: "Invalid JSON" };
  }
  if (!event?.id || !event?.type) return { ok: false, status: 400, message: "Malformed event" };

  const inserted = await db
    .insert(billingEvents)
    .values({ provider: "stripe", eventId: event.id, type: event.type, payload: rawBody.slice(0, 20000) })
    .onConflictDoNothing()
    .returning();

  if (!inserted[0]) {
    const existing = (
      await db
        .select()
        .from(billingEvents)
        .where(and(eq(billingEvents.provider, "stripe"), eq(billingEvents.eventId, event.id)))
        .limit(1)
    )[0];
    if (existing?.status === "processed") return { ok: true, duplicate: true, handled: existing.type };
    // A previous attempt failed — retry it below using the existing ledger row.
  }

  try {
    const handled = await dispatchStripeEvent(event);
    await db
      .update(billingEvents)
      .set({ status: "processed", processedAt: new Date(), attempts: 1, error: null })
      .where(and(eq(billingEvents.provider, "stripe"), eq(billingEvents.eventId, event.id)));
    return { ok: true, handled };
  } catch (error) {
    await db
      .update(billingEvents)
      .set({ status: "failed", error: (error as Error).message, attempts: 1 })
      .where(and(eq(billingEvents.provider, "stripe"), eq(billingEvents.eventId, event.id)));
    // 500 tells Stripe to retry later.
    return { ok: false, status: 500, message: (error as Error).message };
  }
}

async function dispatchStripeEvent(event: {
  id: string;
  type: string;
  data: { object: Record<string, unknown> };
}): Promise<string> {
  const obj = event.data.object;

  switch (event.type) {
    case "invoice.paid":
    case "invoice.payment_succeeded": {
      const invoiceRef = (obj.metadata as Record<string, string> | undefined)?.invoice_id ?? (obj.id as string);
      const invoice = await findInvoiceByProviderRef(invoiceRef);
      if (!invoice) return "invoice_not_found";
      const amount = Number(obj.amount_paid ?? obj.amount_due ?? invoice.amountCents);
      await recordPayment({
        orgId: invoice.orgId,
        invoiceId: invoice.id,
        amountCents: Number.isFinite(amount) && amount > 0 ? amount : invoice.amountCents,
        provider: "stripe",
        providerPaymentId: String(obj.payment_intent ?? obj.id),
        method: "card",
      });
      return "invoice_paid";
    }

    case "invoice.payment_failed": {
      const invoiceRef = (obj.metadata as Record<string, string> | undefined)?.invoice_id ?? (obj.id as string);
      const invoice = await findInvoiceByProviderRef(invoiceRef);
      if (!invoice) return "invoice_not_found";
      const attempt = Number(obj.attempt_count ?? 1);
      await db.insert(payments).values({
        orgId: invoice.orgId,
        invoiceId: invoice.id,
        memberId: invoice.memberId,
        amountCents: invoice.amountCents,
        currency: invoice.currency,
        status: "failed",
        provider: "stripe",
        providerPaymentId: `${String(obj.id)}-fail-${attempt}`,
        failureReason: String((obj.last_finalization_error as { message?: string } | undefined)?.message ?? "payment_failed"),
      });
      if (invoice.subscriptionId) {
        await db
          .update(subscriptions)
          .set({ status: "past_due", statusReason: "payment_failed" })
          .where(eq(subscriptions.id, invoice.subscriptionId));
        const sub = (
          await db.select().from(subscriptions).where(eq(subscriptions.id, invoice.subscriptionId)).limit(1)
        )[0];
        if (sub) {
          await logMembershipEvent({
            orgId: invoice.orgId,
            subscriptionId: sub.id,
            action: "payment_failed",
            toStatus: "past_due",
            meta: { invoiceId: invoice.id, attempt },
          });
          const member = (await db.select().from(orgMembers).where(eq(orgMembers.id, sub.memberId)).limit(1))[0];
          if (member) {
            await notify({
              userId: member.userId,
              orgId: invoice.orgId,
              type: "billing",
              title: "Payment failed",
              body: `We couldn't charge your membership. Update your payment method to keep training.`,
              link: "/app/billing",
              dedupeKey: `failed-${invoice.id}-${attempt}`,
              email: true,
            });
          }
        }
      }
      return "invoice_payment_failed";
    }

    case "customer.subscription.deleted": {
      const subId = String(obj.id);
      const local = (
        await db.select().from(subscriptions).where(eq(subscriptions.providerSubscriptionId, subId)).limit(1)
      )[0];
      if (local) {
        await db
          .update(subscriptions)
          .set({ status: "cancelled", cancelledAt: new Date(), endedAt: new Date() })
          .where(eq(subscriptions.id, local.id));
        await logMembershipEvent({
          orgId: local.orgId,
          subscriptionId: local.id,
          action: "cancelled_by_provider",
          fromStatus: local.status,
          toStatus: "cancelled",
        });
      }
      const saas = (await db.select().from(saasSubscriptions).where(eq(saasSubscriptions.providerSubscriptionId, subId)).limit(1))[0];
      if (saas) {
        await db.update(saasSubscriptions).set({ status: "cancelled" }).where(eq(saasSubscriptions.id, saas.id));
      }
      return "subscription_deleted";
    }

    case "customer.subscription.updated": {
      const subId = String(obj.id);
      const status = String(obj.status ?? "active");
      const mapped = status === "active" ? "active" : status === "trialing" ? "trialing" : status === "past_due" ? "past_due" : status === "canceled" ? "cancelled" : "active";
      const saas = (await db.select().from(saasSubscriptions).where(eq(saasSubscriptions.providerSubscriptionId, subId)).limit(1))[0];
      if (saas) await db.update(saasSubscriptions).set({ status: mapped }).where(eq(saasSubscriptions.id, saas.id));
      return "subscription_updated";
    }

    case "checkout.session.completed": {
      const ref = (obj.client_reference_id as string) ?? (obj.metadata as Record<string, string> | undefined)?.reference;
      const invoice = await findInvoiceByProviderRef(ref);
      if (invoice) {
        await recordPayment({
          orgId: invoice.orgId,
          invoiceId: invoice.id,
          amountCents: invoice.amountCents,
          provider: "stripe",
          providerPaymentId: String(obj.payment_intent ?? obj.id),
          method: "card",
        });
        return "checkout_completed";
      }
      // SaaS checkout: activate the organization plan
      const orgId = (obj.metadata as Record<string, string> | undefined)?.org_id;
      const planId = (obj.metadata as Record<string, string> | undefined)?.saas_plan_id;
      if (orgId && planId) {
        await db
          .update(saasSubscriptions)
          .set({ planId, status: "active", provider: "stripe", providerSubscriptionId: String(obj.subscription ?? "") })
          .where(eq(saasSubscriptions.orgId, orgId));
        await audit({ orgId, action: "saas.checkout_completed", meta: { planId } });
        return "saas_checkout_completed";
      }
      return "checkout_no_reference";
    }

    case "charge.refunded": {
      const paymentIntent = String(obj.payment_intent ?? "");
      const payment = (
        await db
          .select()
          .from(payments)
          .where(and(eq(payments.provider, "stripe"), eq(payments.providerPaymentId, paymentIntent)))
          .limit(1)
      )[0];
      if (!payment) return "payment_not_found";
      const refunded = Number(obj.amount_refunded ?? 0);
      const fully = refunded >= Number(obj.amount ?? payment.amountCents);
      await db.update(payments).set({ status: fully ? "refunded" : "succeeded" }).where(eq(payments.id, payment.id));
      if (payment.invoiceId && fully) {
        await db.update(invoices).set({ status: "refunded" }).where(eq(invoices.id, payment.invoiceId));
      }
      return "charge_refunded";
    }

    case "charge.dispute.created": {
      const paymentIntent = String(obj.payment_intent ?? "");
      await db
        .update(payments)
        .set({ status: "disputed" })
        .where(and(eq(payments.provider, "stripe"), eq(payments.providerPaymentId, paymentIntent)));
      return "dispute_created";
    }

    default:
      return "ignored";
  }
}

/** Platform (SaaS) MRR from active org subscriptions. */
export async function platformMrrCents() {
  const rows = await db
    .select({ sub: saasSubscriptions, plan: saasPlans })
    .from(saasSubscriptions)
    .innerJoin(saasPlans, eq(saasPlans.id, saasSubscriptions.planId));
  return rows
    .filter((r) => r.sub.status === "active" || r.sub.status === "trialing")
    .reduce((sum, r) => sum + (r.sub.status === "trialing" ? 0 : r.plan.priceMonthlyCents), 0);
}
