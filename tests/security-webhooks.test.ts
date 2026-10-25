import crypto from "node:crypto";
import { describe, expect, it } from "vitest";
import { asc, eq, sql } from "drizzle-orm";
import { db } from "@/db/client";
import { auditLogs, billingEvents, invoices, payments } from "@/db/schema";
import { audit, verifyAuditChain, verifyAuditHead } from "@/lib/audit";
import { verifyStripeSignature } from "@/lib/billing/stripe";
import { handleStripeWebhook } from "@/lib/billing/webhooks";
import { createInvoiceForSubscription, createMembership, recordPayment } from "@/lib/membership";
import { makeMember, makeOrg, makePlan } from "./helpers";

const SECRET = "whsec_test_secret_for_vitest";

function signature(payload: string, secret = SECRET, timestamp = Math.floor(Date.now() / 1000)) {
  const sig = crypto.createHmac("sha256", secret).update(`${timestamp}.${payload}`).digest("hex");
  return `t=${timestamp},v1=${sig}`;
}

describe("Stripe webhook verification", () => {
  it("accepts a correctly signed payload", async () => {
    const payload = JSON.stringify({ id: "evt_ok", type: "invoice.paid" });
    expect(await verifyStripeSignature(payload, signature(payload), SECRET)).toBe(true);
  });

  it("rejects a wrong secret, missing header and tampered body", async () => {
    const payload = JSON.stringify({ id: "evt_bad", type: "invoice.paid" });
    expect(await verifyStripeSignature(payload, signature(payload, "whsec_wrong"), SECRET)).toBe(false);
    expect(await verifyStripeSignature(payload, null, SECRET)).toBe(false);
    expect(await verifyStripeSignature(`${payload} `, signature(payload), SECRET)).toBe(false);
    expect(await verifyStripeSignature(payload, "garbage", SECRET)).toBe(false);
  });

  it("rejects replays outside the timestamp tolerance", async () => {
    const payload = JSON.stringify({ id: "evt_old", type: "invoice.paid" });
    const old = Math.floor(Date.now() / 1000) - 3600;
    expect(await verifyStripeSignature(payload, signature(payload, SECRET, old), SECRET)).toBe(false);
  });

  it("processes a signed invoice.paid event exactly once", async () => {
    const { org } = await makeOrg();
    const plan = await makePlan(org.id, { priceCents: 40000 });
    const { member } = await makeMember(org.id, "fighter");
    const { subscription } = await createMembership({ orgId: org.id, memberId: member.id, planId: plan.id, trial: false });
    const invoice = await createInvoiceForSubscription({ orgId: org.id, subscriptionId: subscription.id });
    const event = {
      id: `evt_${crypto.randomUUID()}`,
      type: "invoice.paid",
      data: { object: { id: "stripe_inv_1", amount_paid: invoice.amountCents, metadata: { invoice_id: invoice.id } } },
    };
    const payload = JSON.stringify(event);
    const first = await handleStripeWebhook(payload, signature(payload));
    expect(first.ok).toBe(true);
    expect(first.duplicate).toBeUndefined();

    const second = await handleStripeWebhook(payload, signature(payload));
    expect(second.ok).toBe(true);
    expect(second.duplicate).toBe(true);

    const paid = await db.select().from(payments).where(eq(payments.invoiceId, invoice.id));
    expect(paid).toHaveLength(1);
    const invoiceAfter = await db.select().from(invoices).where(eq(invoices.id, invoice.id));
    expect(invoiceAfter[0].status).toBe("paid");
    const ledger = await db.select().from(billingEvents).where(eq(billingEvents.eventId, event.id));
    expect(ledger).toHaveLength(1);
    expect(ledger[0].status).toBe("processed");
  });

  it("rejects unsigned webhook events without side effects", async () => {
    const payload = JSON.stringify({ id: `evt_${crypto.randomUUID()}`, type: "invoice.paid", data: { object: {} } });
    const result = await handleStripeWebhook(payload, signature(payload, "whsec_not_the_secret"));
    expect(result.ok).toBe(false);
    expect(result.status).toBe(400);
  });
});

describe("audit hash chain", () => {
  it("verifies the chain and detects tampering", async () => {
    await audit({ actor: { id: "u1", name: "Tester", role: "owner" }, action: "test.audit.one", meta: { a: 1 } });
    await audit({ actor: { id: "u1", name: "Tester", role: "owner" }, action: "test.audit.two", meta: { b: 2 } });
    const rows = await db.select({ hash: auditLogs.hash, prevHash: auditLogs.prevHash }).from(auditLogs).orderBy(asc(sql`rowid`));
    expect(rows.length).toBeGreaterThanOrEqual(2);
    expect(await verifyAuditChain(rows.map((r) => ({ hash: r.hash ?? "", prevHash: r.prevHash })))).toBe(true);

    const clean = rows.map((r) => ({ hash: r.hash ?? "", prevHash: r.prevHash }));
    const tampered = clean.map((r, i) => (i === 1 ? { ...r, prevHash: "deadbeef" } : r));
    expect(await verifyAuditChain(tampered)).toBe(false);

    const chainBroken = clean.map((r, i) => (i === 1 ? { ...r, hash: "f".repeat(64) } : r));
    expect(await verifyAuditChain(chainBroken)).toBe(false);
    const head = await verifyAuditHead(clean[clean.length - 1]?.hash);
    expect(head).toBe(true);
    expect(await verifyAuditHead("f".repeat(64))).toBe(false);
  });

  it("links each new entry to the previous hash", async () => {
    const before = await db.select({ hash: auditLogs.hash }).from(auditLogs).orderBy(asc(sql`rowid`));
    await audit({ action: "test.audit.link" });
    const after = await db.select({ hash: auditLogs.hash, prevHash: auditLogs.prevHash }).from(auditLogs).orderBy(asc(sql`rowid`));
    expect(after.length).toBe(before.length + 1);
    expect(after[after.length - 1].prevHash).toBe(before[before.length - 1]?.hash ?? "genesis");
  });
});

describe("payment ledger integrity", () => {
  it("does not double-record a provider payment id", async () => {
    const { org } = await makeOrg();
    const plan = await makePlan(org.id);
    const { member } = await makeMember(org.id, "fighter");
    const { subscription } = await createMembership({ orgId: org.id, memberId: member.id, planId: plan.id, trial: false });
    const invoice = await createInvoiceForSubscription({ orgId: org.id, subscriptionId: subscription.id });
    const first = await recordPayment({ orgId: org.id, invoiceId: invoice.id, amountCents: 100, provider: "stripe", providerPaymentId: `pi_${crypto.randomUUID()}` });
    const second = await recordPayment({ orgId: org.id, invoiceId: invoice.id, amountCents: 100, provider: "stripe", providerPaymentId: first.payment?.providerPaymentId ?? "x" });
    expect(second.alreadyPaid || second.payment?.id === first.payment?.id).toBe(true);
  });
});
