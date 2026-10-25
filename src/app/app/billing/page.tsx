import { redirect } from "next/navigation";
import { and, desc, eq } from "drizzle-orm";
import { CreditCard, Download, ShieldCheck } from "lucide-react";
import { db } from "@/db/client";
import { invoices, payments, subscriptions, users } from "@/db/schema";
import { Badge, Callout, Card, CardHeader, EmptyState, KeyValue, PageHeader, StatusBadge } from "@/components/ui/primitives";
import { SubmitButton } from "@/components/ui/client";
import { requireOrgPage } from "@/lib/authz";
import { membershipSummary } from "@/lib/membership";
import { payInvoiceAction } from "@/lib/actions/fighter";
import { stripeEnabled } from "@/lib/billing/stripe";
import { formatDate, formatDateTime, formatMoney } from "@/lib/utils";

export const metadata = { title: "Billing" };

export default async function BillingPage() {
  const ctx = await requireOrgPage();
  if (!ctx.membership) redirect("/app/onboarding");
  const orgId = ctx.org.id;
  const memberId = ctx.membership.id;

  const [summary, invoiceRows, paymentRows] = await Promise.all([
    membershipSummary(orgId, memberId),
    db.select().from(invoices).where(and(eq(invoices.orgId, orgId), eq(invoices.memberId, memberId))).orderBy(desc(invoices.createdAt)).limit(30),
    db.select().from(payments).where(and(eq(payments.orgId, orgId), eq(payments.memberId, memberId))).orderBy(desc(payments.createdAt)).limit(20),
  ]);

  const liveStripe = stripeEnabled();
  const open = invoiceRows.filter((i) => i.status === "open");

  return (
    <div className="space-y-4">
      <PageHeader title="Billing" description="Invoices and payments for your gym membership." />

      <Card>
        <div className="flex flex-wrap items-center justify-between gap-3">
          <div>
            <p className="text-sm" style={{ color: "var(--muted)" }}>Balance due</p>
            <p className="stat-value text-2xl" style={{ color: summary.balanceCents > 0 ? "var(--danger)" : undefined }}>
              {formatMoney(summary.balanceCents, ctx.org.currency)}
            </p>
          </div>
          <div className="text-right text-sm">
            <p>{summary.current?.plan.name ?? "No plan"}</p>
            <p style={{ color: "var(--muted)" }}>{summary.current ? formatMoney(summary.current.subscription.priceCents, summary.current.subscription.currency) : "—"} / {summary.current?.plan.interval ?? ""}</p>
          </div>
        </div>
        <div className="mt-3 grid gap-x-6 sm:grid-cols-2">
          <KeyValue label="Payment method">{summary.current?.subscription.paymentMethodLabel ?? "Not set"}</KeyValue>
          <KeyValue label="Next renewal">{formatDate(summary.current?.subscription.currentPeriodEnd)}</KeyValue>
        </div>
        <Callout tone={liveStripe ? "info" : "warn"} title={liveStripe ? "Secure card payments" : "Sandbox mode"}>
          {liveStripe
            ? "Card details are handled by Stripe. MMA OS never stores raw card data."
            : "This environment uses the sandbox payment provider. Paying here records a test payment and moves no real money."}
        </Callout>
      </Card>

      <Card>
        <CardHeader title="Open invoices" action={<Badge tone={open.length ? "warn" : "accent"}>{open.length}</Badge>} />
        {open.length ? (
          <div className="mt-3 space-y-2">
            {open.map((inv) => (
              <div key={inv.id} className="subtle flex flex-wrap items-center justify-between gap-2 p-3">
                <div>
                  <p className="text-sm font-medium">{inv.number} · {inv.description}</p>
                  <p className="text-xs" style={{ color: "var(--muted)" }}>Due {formatDate(inv.dueDate)} · period {formatDate(inv.periodStart)} → {formatDate(inv.periodEnd)}</p>
                </div>
                <div className="flex items-center gap-2">
                  <span className="stat-value">{formatMoney(inv.amountCents, inv.currency)}</span>
                  <form action={payInvoiceAction}>
                    <input type="hidden" name="invoiceId" value={inv.id} />
                    <SubmitButton size="sm"><CreditCard className="h-3.5 w-3.5" /> {liveStripe ? "Pay now" : "Pay (test)"}</SubmitButton>
                  </form>
                </div>
              </div>
            ))}
          </div>
        ) : (
          <EmptyState title="Nothing due" description="You're all paid up." />
        )}
      </Card>

      <Card className="overflow-hidden p-0">
        <div className="p-5 pb-0"><CardHeader title="Invoice history" /></div>
        {invoiceRows.length ? (
          <div className="mt-3 overflow-x-auto">
            <table className="table">
              <thead><tr><th>Invoice</th><th>Period</th><th>Amount</th><th>Status</th><th>Date</th></tr></thead>
              <tbody>
                {invoiceRows.map((i) => (
                  <tr key={i.id}>
                    <td className="font-mono text-xs">{i.number}</td>
                    <td className="text-xs">{formatDate(i.periodStart)} → {formatDate(i.periodEnd)}</td>
                    <td className="stat-value text-sm">{formatMoney(i.amountCents, i.currency)}</td>
                    <td><StatusBadge status={i.status} /></td>
                    <td className="text-xs" style={{ color: "var(--muted)" }}>{formatDate(i.paidAt ?? i.createdAt)}</td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        ) : (
          <div className="p-5"><EmptyState title="No invoices yet" /></div>
        )}
      </Card>

      <Card>
        <CardHeader title="Payments" action={<Download className="h-4 w-4 opacity-50" aria-hidden />} />
        {paymentRows.length ? (
          <div className="mt-2 space-y-1.5 text-sm">
            {paymentRows.map((p) => (
              <div key={p.id} className="flex items-center justify-between border-b py-1.5" style={{ borderColor: "var(--line)" }}>
                <span>{formatDateTime(p.createdAt)} · {p.method ?? "card"}</span>
                <span className="flex items-center gap-2">
                  <span className="stat-value">{formatMoney(p.amountCents, p.currency)}</span>
                  <StatusBadge status={p.status} />
                </span>
              </div>
            ))}
          </div>
        ) : (
          <EmptyState title="No payments yet" />
        )}
        <p className="mt-3 flex items-center gap-1.5 text-xs" style={{ color: "var(--muted)" }}>
          <ShieldCheck className="h-3.5 w-3.5" /> Payments are confirmed by the provider, never by this screen.
        </p>
      </Card>
    </div>
  );
}
