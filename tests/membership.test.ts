import { describe, expect, it } from "vitest";
import { eq } from "drizzle-orm";
import { db } from "@/db/client";
import { invoices, payments, refunds } from "@/db/schema";
import {
  addCredits,
  checkMembershipAccess,
  createInvoiceForSubscription,
  createMembership,
  effectivePriceCents,
  getMemberSubscription,
  pauseMembership,
  recordPayment,
  refundPayment,
  resumeMembership,
  taxFor,
} from "@/lib/membership";
import { makeMember, makeOrg, makePlan } from "./helpers";

async function setup(planOverrides: Partial<Parameters<typeof makePlan>[1]> = {}) {
  const { org, owner } = await makeOrg();
  const plan = await makePlan(org.id, planOverrides);
  const { member } = await makeMember(org.id, "fighter");
  const created = await createMembership({ orgId: org.id, memberId: member.id, planId: plan.id, trial: false });
  return { org, owner, plan, member, subscription: created.subscription };
}

describe("membership lifecycle", () => {
  it("grants access to an active member and blocks a paused one", async () => {
    const { org, owner, member, subscription } = await setup();
    const active = await checkMembershipAccess(org.id, member.id);
    expect(active.allowed).toBe(true);
    expect(active.plan).toBeTruthy();

    await pauseMembership({
      orgId: org.id,
      subscriptionId: subscription.id,
      startDate: new Date(),
      endDate: new Date(Date.now() + 7 * 86400000),
      reason: "Travel",
      actor: { id: owner.id, name: owner.name },
    });
    const paused = await checkMembershipAccess(org.id, member.id);
    expect(paused.allowed).toBe(false);
    expect(paused.reason).toMatch(/paused/i);

    await resumeMembership({ orgId: org.id, subscriptionId: subscription.id, actor: { id: owner.id, name: owner.name } });
    expect((await checkMembershipAccess(org.id, member.id)).allowed).toBe(true);
  });

  it("enforces credit balances", async () => {
    const { org, owner, member, subscription } = await setup({ creditCount: 1 });
    expect(subscription.creditsRemaining).toBe(1);
    await addCredits({ orgId: org.id, subscriptionId: subscription.id, delta: -1, reason: "Class used", actor: { id: owner.id, name: owner.name } });
    const access = await checkMembershipAccess(org.id, member.id);
    expect(access.allowed).toBe(false);
    expect(access.reason).toMatch(/credits/i);
  });

  it("respects discipline restrictions", async () => {
    const { org, member } = await setup({ allowedDisciplines: JSON.stringify(["BJJ"]) });
    expect((await checkMembershipAccess(org.id, member.id, { discipline: "BJJ" })).allowed).toBe(true);
    expect((await checkMembershipAccess(org.id, member.id, { discipline: "MMA" })).allowed).toBe(false);
  });

  it("computes prices, discounts and tax in minor units", async () => {
    const { org } = await makeOrg();
    const plan = await makePlan(org.id, { priceCents: 100000, taxRateBps: 2500, introOfferCents: 49000 });
    expect(effectivePriceCents(plan)).toBe(100000);
    expect(effectivePriceCents(plan, { discountBps: 1000 })).toBe(90000);
    expect(effectivePriceCents(plan, { discountBps: 2500 })).toBe(75000);
    expect(effectivePriceCents(plan, { isFirstPeriod: true })).toBe(49000);
    expect(taxFor(plan, 100000)).toBe(25000);
  });

  it("is idempotent when creating a second active membership", async () => {
    const { org, plan, member } = await setup();
    const again = await createMembership({ orgId: org.id, memberId: member.id, planId: plan.id });
    expect(again.created).toBe(false);
  });
});

describe("invoices and payments", () => {
  it("creates sequential invoices and records a single payment", async () => {
    const { org, member, subscription } = await setup({ priceCents: 50000 });
    const invoice = await createInvoiceForSubscription({ orgId: org.id, subscriptionId: subscription.id });
    expect(invoice.amountCents).toBe(50000);
    expect(invoice.taxCents).toBe(12500);
    expect(invoice.status).toBe("open");

    const first = await recordPayment({ orgId: org.id, invoiceId: invoice.id, amountCents: 62500, provider: "sandbox" });
    expect(first.alreadyPaid).toBe(false);
    const second = await recordPayment({ orgId: org.id, invoiceId: invoice.id, amountCents: 62500, provider: "sandbox" });
    expect(second.alreadyPaid).toBe(true);
    const rows = await db.select().from(invoices).where(eq(invoices.id, invoice.id));
    expect(rows[0].status).toBe("paid");
  });

  it("rejects payments for an invoice from another gym", async () => {
    const { org, subscription } = await setup();
    const { org: other } = await makeOrg();
    const invoice = await createInvoiceForSubscription({ orgId: org.id, subscriptionId: subscription.id });
    await expect(recordPayment({ orgId: other.id, invoiceId: invoice.id, amountCents: 100, provider: "sandbox" })).rejects.toThrow(/not found/i);
  });

  it("caps refunds at the paid amount", async () => {
    const { org, owner, subscription } = await setup();
    const invoice = await createInvoiceForSubscription({ orgId: org.id, subscriptionId: subscription.id });
    const paid = await recordPayment({ orgId: org.id, invoiceId: invoice.id, amountCents: 62500, provider: "sandbox" });
    const refund = await refundPayment({ orgId: org.id, paymentId: paid.payment!.id, amountCents: 999999, actor: { id: owner.id, name: owner.name } });
    expect(refund.amountCents).toBe(62500);
    const refundRows = await db.select().from(refunds).where(eq(refunds.paymentId, paid.payment!.id));
    expect(refundRows).toHaveLength(1);
    const payRows = await db.select().from(payments).where(eq(payments.id, paid.payment!.id));
    expect(payRows[0].status).toBe("refunded");
  });

  it("rejects refunding a payment that has not succeeded", async () => {
    const { org, owner, subscription } = await setup();
    const invoice = await createInvoiceForSubscription({ orgId: org.id, subscriptionId: subscription.id });
    const pending = (
      await db.insert(payments).values({ orgId: org.id, invoiceId: invoice.id, amountCents: 1000, status: "pending", provider: "sandbox" }).returning()
    )[0];
    await expect(refundPayment({ orgId: org.id, paymentId: pending.id, actor: { id: owner.id, name: owner.name } })).rejects.toThrow(/successful/i);
  });

  it("returns history for the owning gym only", async () => {
    const { org, member } = await setup();
    const { org: other } = await makeOrg();
    expect((await getMemberSubscription(other.id, member.id)).history).toHaveLength(0);
    expect((await getMemberSubscription(org.id, member.id)).history.length).toBeGreaterThan(0);
  });
});
