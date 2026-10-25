import Link from "next/link";
import { and, count, desc, eq, gte, inArray, sql } from "drizzle-orm";
import { AlertTriangle, Download, Receipt, Undo2 } from "lucide-react";
import { db } from "@/db/client";
import { invoices, membershipPlans, orgMembers, payments, refunds, subscriptions, users } from "@/db/schema";
import { Avatar, Badge, ButtonLink, Card, CardHeader, EmptyState, Field, Input, PageHeader, Select, Stat, StatusBadge } from "@/components/ui/primitives";
import { ConfirmSubmit, Modal, SubmitButton } from "@/components/ui/client";
import { TrendChart } from "@/components/ui/charts";
import { requireOrgPage } from "@/lib/authz";
import { markInvoicePaidAction, refundPaymentAction } from "@/lib/actions/gym";
import { addDays, formatDate, formatDateTime, formatMoney } from "@/lib/utils";

export const metadata = { title: "Payments" };

export default async function PaymentsPage() {
  const ctx = await requireOrgPage();
  const orgId = ctx.org.id;
  const monthStart = new Date(new Date().getFullYear(), new Date().getMonth(), 1);

  const [monthRevenue, invoiceRows, paymentRows, refundRows, failedCount, payingMembers, monthlySeries] = await Promise.all([
    db
      .select({ total: sql<number>`coalesce(sum(${payments.amountCents}),0)` })
      .from(payments)
      .where(and(eq(payments.orgId, orgId), eq(payments.status, "succeeded"), gte(payments.createdAt, monthStart))),
    db
      .select({ invoice: invoices, member: orgMembers, user: users })
      .from(invoices)
      .innerJoin(orgMembers, eq(orgMembers.id, invoices.memberId))
      .innerJoin(users, eq(users.id, orgMembers.userId))
      .where(eq(invoices.orgId, orgId))
      .orderBy(desc(invoices.createdAt))
      .limit(80),
    db
      .select({ payment: payments, invoice: invoices, user: users })
      .from(payments)
      .leftJoin(invoices, eq(invoices.id, payments.invoiceId))
      .leftJoin(orgMembers, eq(orgMembers.id, payments.memberId))
      .leftJoin(users, eq(users.id, orgMembers.userId))
      .where(eq(payments.orgId, orgId))
      .orderBy(desc(payments.createdAt))
      .limit(60),
    db.select().from(refunds).where(eq(refunds.orgId, orgId)).orderBy(desc(refunds.createdAt)).limit(20),
    db.select({ n: count() }).from(payments).where(and(eq(payments.orgId, orgId), eq(payments.status, "failed"))),
    db
      .select({ n: count() })
      .from(subscriptions)
      .where(and(eq(subscriptions.orgId, orgId), inArray(subscriptions.status, ["active", "trial", "cancel_scheduled"]))),
    db
      .select({ month: sql<string>`strftime('%Y-%m', ${payments.createdAt} / 1000, 'unixepoch')`, total: sql<number>`sum(${payments.amountCents})` })
      .from(payments)
      .where(and(eq(payments.orgId, orgId), eq(payments.status, "succeeded"), gte(payments.createdAt, new Date(new Date().getFullYear(), new Date().getMonth() - 5, 1))))
      .groupBy(sql`strftime('%Y-%m', ${payments.createdAt} / 1000, 'unixepoch')`),
  ]);

  const openInvoices = invoiceRows.filter((r) => r.invoice.status === "open");
  const overdueTotal = openInvoices.reduce((s, r) => s + r.invoice.amountCents, 0);
  const canBill = ctx.permissions.has("billing:manage");
  const monthNames = ["Jan", "Feb", "Mar", "Apr", "May", "Jun", "Jul", "Aug", "Sep", "Oct", "Nov", "Dec"];
  const map = new Map(monthlySeries.map((m) => [m.month, Number(m.total)]));
  const series = Array.from({ length: 6 }, (_, i) => {
    const d = new Date(new Date().getFullYear(), new Date().getMonth() - (5 - i), 1);
    const key = `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, "0")}`;
    return { label: monthNames[d.getMonth()], value: Math.round((map.get(key) ?? 0) / 100) };
  });

  return (
    <div className="space-y-5">
      <PageHeader
        title="Payments"
        description="Membership revenue for your gym. MMA OS subscription billing is separate and lives in Settings."
        actions={<ButtonLink href="/api/export/payments" variant="secondary" size="sm" prefetch={false}><Download className="h-4 w-4" /> Export CSV</ButtonLink>}
      />

      <div className="grid gap-3 sm:grid-cols-2 lg:grid-cols-4">
        <Stat label="Revenue this month" value={formatMoney(Number(monthRevenue[0]?.total ?? 0), ctx.org.currency)} tone="accent" />
        <Stat label="Paying members" value={Number(payingMembers[0]?.n ?? 0)} />
        <Stat label="Outstanding" value={formatMoney(overdueTotal, ctx.org.currency)} tone={overdueTotal ? "danger" : "neutral"} hint={`${openInvoices.length} open invoices`} icon={<AlertTriangle className="h-4 w-4" />} />
        <Stat label="Failed payments" value={Number(failedCount[0]?.n ?? 0)} hint="All time" />
      </div>

      <Card>
        <CardHeader title="Collected revenue" description="Last 6 months (sandbox or Stripe confirmed)" />
        <div className="mt-3"><TrendChart data={series} type="bar" height={200} /></div>
      </Card>

      <Card className="overflow-hidden p-0">
        <div className="p-5 pb-0"><CardHeader title="Invoices" description="Newest first · mark manual payments as paid once received" /></div>
        {invoiceRows.length ? (
          <div className="mt-3 overflow-x-auto">
            <table className="table">
              <thead><tr><th>Invoice</th><th>Member</th><th>Period</th><th>Amount</th><th>Status</th><th>Due</th><th className="text-right">Action</th></tr></thead>
              <tbody>
                {invoiceRows.map((r) => (
                  <tr key={r.invoice.id}>
                    <td className="font-mono text-xs">{r.invoice.number}</td>
                    <td><Link href={`/gym/members/${r.member.id}`} className="font-medium hover:underline">{r.user.name}</Link></td>
                    <td className="text-xs" style={{ color: "var(--muted)" }}>{formatDate(r.invoice.periodStart)} → {formatDate(r.invoice.periodEnd)}</td>
                    <td className="stat-value text-sm">{formatMoney(r.invoice.amountCents, r.invoice.currency)}</td>
                    <td><StatusBadge status={r.invoice.status} /></td>
                    <td className="text-sm">{formatDate(r.invoice.dueDate)}</td>
                    <td className="text-right">
                      {r.invoice.status === "open" && canBill ? (
                        <form action={markInvoicePaidAction}>
                          <input type="hidden" name="orgId" value={orgId} />
                          <input type="hidden" name="invoiceId" value={r.invoice.id} />
                          <input type="hidden" name="method" value="cash_or_card_at_desk" />
                          <ConfirmSubmit message={`Mark ${r.invoice.number} as paid?`} variant="secondary">Mark paid</ConfirmSubmit>
                        </form>
                      ) : null}
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        ) : (
          <div className="p-5"><EmptyState icon={<Receipt className="h-5 w-5" />} title="No invoices yet" description="Invoices are generated from member memberships." /></div>
        )}
      </Card>

      <div className="grid gap-4 lg:grid-cols-3">
        <Card className="lg:col-span-2 overflow-hidden p-0">
          <div className="p-5 pb-0"><CardHeader title="Transactions" description="Every provider-confirmed payment" /></div>
          {paymentRows.length ? (
            <div className="mt-3 overflow-x-auto">
              <table className="table">
                <thead><tr><th>Member</th><th>Amount</th><th>Provider</th><th>Status</th><th>When</th><th className="text-right" /></tr></thead>
                <tbody>
                  {paymentRows.map((r) => (
                    <tr key={r.payment.id}>
                      <td className="text-sm">{r.user?.name ?? "Walk-in"}</td>
                      <td className="stat-value text-sm">{formatMoney(r.payment.amountCents, r.payment.currency)}</td>
                      <td><Badge tone={r.payment.provider === "stripe" ? "info" : "neutral"}>{r.payment.provider}</Badge></td>
                      <td><StatusBadge status={r.payment.status} /></td>
                      <td className="text-xs" style={{ color: "var(--muted)" }}>{formatDateTime(r.payment.processedAt ?? r.payment.createdAt)}</td>
                      <td className="text-right">
                        {canBill && r.payment.status === "succeeded" ? (
                          <Modal trigger={<><Undo2 className="h-3 w-3" /> Refund</>} title="Refund payment" description="Full or partial refund. Recorded in the audit log." triggerVariant="ghost" triggerSize="sm">
                            <form action={refundPaymentAction} className="space-y-3">
                              <input type="hidden" name="orgId" value={orgId} />
                              <input type="hidden" name="paymentId" value={r.payment.id} />
                              <Field label={`Amount (max ${formatMoney(r.payment.amountCents, r.payment.currency)})`}>
                                <Input name="amount" type="number" step="0.01" min={0} max={r.payment.amountCents / 100} defaultValue={r.payment.amountCents / 100} />
                              </Field>
                              <Field label="Reason"><Input name="reason" placeholder="Goodwill, duplicate charge…" /></Field>
                              <SubmitButton variant="danger">Record refund</SubmitButton>
                            </form>
                          </Modal>
                        ) : null}
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          ) : (
            <div className="p-5"><EmptyState title="No payments yet" description="When a member pays, it appears here with provider confirmation." /></div>
          )}
        </Card>

        <Card>
          <CardHeader title="Refunds" action={<Badge>{refundRows.length}</Badge>} />
          <div className="mt-2 space-y-2">
            {refundRows.length ? (
              refundRows.map((r) => (
                <div key={r.id} className="subtle p-2.5 text-sm">
                  <div className="flex items-center justify-between">
                    <span className="stat-value">{formatMoney(r.amountCents, ctx.org.currency)}</span>
                    <span className="text-xs" style={{ color: "var(--muted)" }}>{formatDate(r.createdAt)}</span>
                  </div>
                  <p className="text-xs" style={{ color: "var(--muted)" }}>{r.reason ?? "No reason given"}</p>
                </div>
              ))
            ) : (
              <EmptyState title="No refunds" />
            )}
          </div>
        </Card>
      </div>
    </div>
  );
}
