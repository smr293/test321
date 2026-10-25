import { ArrowDownRight, ArrowUpRight, CircleDollarSign, TrendingUp } from "lucide-react";
import { Badge, Card, CardHeader, EmptyState, KeyValue, Money, PageHeader, Stat } from "@/components/ui/primitives";
import { TrendChart, DonutChart, ChartLegend } from "@/components/ui/charts";
import { platformOverview, platformRevenueSeries, platformTotals, listOrganizations } from "@/lib/saas";
import { formatCompactMoney } from "@/lib/utils";

export const metadata = { title: "Revenue · Platform admin" };

export default async function AdminRevenuePage() {
  const [overview, series, totals, orgs] = await Promise.all([
    platformOverview(),
    platformRevenueSeries(12),
    platformTotals(),
    listOrganizations(),
  ]);
  const growth = series.length >= 2
    ? ((series[series.length - 1].amountCents - series[series.length - 2].amountCents) / Math.max(1, series[series.length - 2].amountCents)) * 100
    : 0;
  const topOrgs = [...orgs].sort((a, b) => (b.plan?.priceMonthlyCents ?? 0) - (a.plan?.priceMonthlyCents ?? 0)).slice(0, 8);
  return (
    <>
      <PageHeader eyebrow="Finance" title="Revenue" description="Platform subscription revenue and gym member payment volume." />
      <div className="mt-4 grid grid-cols-2 gap-3 lg:grid-cols-4">
        <Stat label="Platform MRR" value={<Money cents={overview.mrrCents} />} hint={`${overview.payingOrgs} paying gyms`} icon={<CircleDollarSign className="h-4 w-4" />} tone="accent" />
        <Stat label="Platform ARR" value={<Money cents={overview.arrCents} />} hint="Run-rate" icon={<TrendingUp className="h-4 w-4" />} />
        <Stat label="Billed by gyms" value={<Money cents={totals.billedCents} />} hint="All-time invoices" />
        <Stat label="Outstanding" value={<Money cents={totals.outstandingCents} />} hint="Open invoices" tone={totals.outstandingCents ? "warn" : "neutral"} />
      </div>

      <div className="mt-4 grid gap-4 lg:grid-cols-[1.5fr_1fr]">
        <Card>
          <CardHeader
            title="Member payment volume"
            description="Collected through MMA OS across all gyms."
            action={
              <Badge tone={growth >= 0 ? "accent" : "danger"}>
                {growth >= 0 ? <ArrowUpRight className="mr-1 h-3 w-3" /> : <ArrowDownRight className="mr-1 h-3 w-3" />}
                {growth.toFixed(1)}% MoM
              </Badge>
            }
          />
          {series.length ? (
            <TrendChart data={series.map((s) => ({ label: s.month.slice(2), value: Math.round(s.amountCents / 100) }))} height={220} valueSuffix=" kr" />
          ) : <EmptyState title="No payment data" description="Once gyms collect payments, volume appears here." />}
          <div className="mt-3 grid grid-cols-2 gap-2 text-sm">
            <KeyValue label="Months tracked">{series.length}</KeyValue>
            <KeyValue label="Payments">{series.reduce((s, r) => s + r.count, 0)}</KeyValue>
          </div>
        </Card>

        <Card>
          <CardHeader title="Revenue mix" description="MRR by SaaS plan." />
          {overview.mrrByPlan.length ? (
            <>
              <DonutChart data={overview.mrrByPlan.map((p) => ({ label: p.plan, value: Math.round(p.mrr / 100) }))} height={180} />
              <ChartLegend data={overview.mrrByPlan.map((p) => ({ label: p.plan, value: Math.round(p.mrr / 100) }))} />
            </>
          ) : <EmptyState title="No subscriptions" description="Assign plans to gyms." />}
        </Card>
      </div>

      <Card className="mt-4">
        <CardHeader title="Highest-value gyms" description="By monthly subscription price." />
        <div className="table-wrap mt-2">
          <table className="table">
            <thead><tr><th>Gym</th><th>Plan</th><th>Seats</th><th>Monthly</th><th>Status</th></tr></thead>
            <tbody>
              {topOrgs.map((o) => (
                <tr key={o.org.id}>
                  <td className="font-medium">{o.org.name}</td>
                  <td>{o.plan?.name ?? "—"}</td>
                  <td>{o.sub?.seats ?? "—"}</td>
                  <td>{o.plan ? <Money cents={o.plan.priceMonthlyCents * Math.max(1, o.sub?.seats ?? 1)} /> : "—"}</td>
                  <td><Badge tone={o.sub?.status === "active" ? "accent" : o.sub?.status === "past_due" ? "danger" : "neutral"}>{o.sub?.status ?? "none"}</Badge></td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
        <p className="mt-3 text-xs" style={{ color: "var(--muted)" }}>
          Platform subscription billing runs in sandbox mode in this environment. No real charges are made. Gym member payments are recorded in {formatCompactMoney(totals.billedCents)} of invoices.
        </p>
      </Card>
    </>
  );
}
