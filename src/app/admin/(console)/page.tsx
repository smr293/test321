import Link from "next/link";
import {
  AlertTriangle,
  ArrowUpRight,
  Building2,
  CircleDollarSign,
  LifeBuoy,
  Mail,
  ShieldCheck,
  TrendingUp,
  UserPlus,
  Users,
} from "lucide-react";
import { Badge, ButtonLink, Card, CardHeader, EmptyState, KeyValue, Money, PageHeader, Stat, StatusBadge } from "@/components/ui/primitives";
import { TrendChart } from "@/components/ui/charts";
import { platformOverview, platformRevenueSeries, platformTotals, listTickets, listOrganizations } from "@/lib/saas";
import { formatDateTime, relativeTime } from "@/lib/utils";
import { db } from "@/db/client";
import { auditLogs } from "@/db/schema";
import { desc } from "drizzle-orm";

export const metadata = { title: "Platform overview" };

export default async function AdminOverviewPage() {
  const [overview, series, totals, tickets, orgs, recentAudit] = await Promise.all([
    platformOverview(),
    platformRevenueSeries(6),
    platformTotals(),
    listTickets(),
    listOrganizations(),
    db.select().from(auditLogs).orderBy(desc(auditLogs.createdAt)).limit(8),
  ]);
  const openTickets = tickets.filter((t) => t.ticket.status === "open" || t.ticket.status === "pending");
  const churn = overview.payingOrgs + overview.churnedOrgs > 0 ? (overview.churnedOrgs / (overview.payingOrgs + overview.churnedOrgs)) * 100 : 0;

  return (
    <>
      <PageHeader
        eyebrow="Platform"
        title="Everything on MMA OS"
        description={`${overview.orgs.total} gyms · ${overview.users.total} users · ${overview.fighters} fighters. Revenue, health and support in one place.`}
        actions={<ButtonLink href="/admin/orgs" size="sm"><Building2 className="h-4 w-4" /> Gyms</ButtonLink>}
      />

      <div className="mt-5 grid grid-cols-2 gap-3 lg:grid-cols-4">
        <Stat label="MRR" value={<Money cents={overview.mrrCents} />} hint={`${overview.payingOrgs} paying · ${overview.trialingOrgs} trials`} icon={<CircleDollarSign className="h-4 w-4" />} tone="accent" />
        <Stat label="ARR" value={<Money cents={overview.arrCents} />} hint="Annualised run-rate" icon={<TrendingUp className="h-4 w-4" />} />
        <Stat label="Gyms" value={overview.orgs.total} hint={`${overview.orgs.new30d} new in 30 days`} icon={<Building2 className="h-4 w-4" />} />
        <Stat label="Users" value={overview.users.total} hint={`${overview.users.new30d} new · ${overview.users.suspended} suspended`} icon={<Users className="h-4 w-4" />} />
        <Stat label="Fighters" value={overview.fighters} hint="Athlete accounts" icon={<UserPlus className="h-4 w-4" />} />
        <Stat label="Open tickets" value={openTickets.length} hint={`${overview.tickets.resolved} resolved`} icon={<LifeBuoy className="h-4 w-4" />} tone={openTickets.length ? "warn" : "neutral"} />
        <Stat label="Data requests" value={overview.dataRequests.pending} hint="GDPR queue" icon={<ShieldCheck className="h-4 w-4" />} tone={overview.dataRequests.pending ? "warn" : "neutral"} />
        <Stat label="Churn" value={`${churn.toFixed(1)}%`} hint={`${overview.churnedOrgs} cancelled`} icon={<AlertTriangle className="h-4 w-4" />} tone={churn > 5 ? "danger" : "neutral"} />
      </div>

      <div className="mt-4 grid gap-4 lg:grid-cols-[1.4fr_1fr]">
        <Card>
          <CardHeader title="Member payments across all gyms" description="Collected by gyms through MMA OS — last 6 months." />
          {series.length ? (
            <TrendChart
              data={series.map((s) => ({ label: s.month.slice(5), value: Math.round(s.amountCents / 100) }))}
              height={200}
              valueSuffix=" kr"
            />
          ) : (
            <EmptyState title="No payments yet" description="Gyms will appear here once they collect their first membership payment." />
          )}
          <div className="mt-3 grid grid-cols-2 gap-3 text-sm">
            <KeyValue label="Billed all time"><Money cents={totals.billedCents} /></KeyValue>
            <KeyValue label="Outstanding"><Money cents={totals.outstandingCents} /></KeyValue>
          </div>
        </Card>

        <Card>
          <CardHeader title="MRR by plan" description="Live subscription mix." />
          {overview.mrrByPlan.length ? (
            <ul className="mt-2 space-y-2">
              {overview.mrrByPlan.map((p) => (
                <li key={p.plan} className="flex items-center justify-between gap-2 border-b py-2 text-sm" style={{ borderColor: "var(--line)" }}>
                  <span>
                    <strong>{p.plan}</strong>
                    <span className="ml-2 text-xs" style={{ color: "var(--muted)" }}>{p.orgs} gyms · {p.seats} seats</span>
                  </span>
                  <Money cents={p.mrr} className="text-sm font-semibold" />
                </li>
              ))}
            </ul>
          ) : (
            <EmptyState title="No paying gyms" description="Assign plans from a gym page." />
          )}
          <div className="mt-3 flex flex-wrap gap-2">
            <ButtonLink href="/admin/plans" variant="secondary" size="sm">Manage plans</ButtonLink>
            <ButtonLink href="/admin/revenue" variant="ghost" size="sm">Revenue detail <ArrowUpRight className="h-3.5 w-3.5" /></ButtonLink>
          </div>
        </Card>
      </div>

      <div className="mt-4 grid gap-4 lg:grid-cols-2">
        <Card>
          <CardHeader title="Newest gyms" action={<ButtonLink href="/admin/orgs" variant="ghost" size="sm">All gyms</ButtonLink>} />
          <ul className="mt-2 divide-y" style={{ borderColor: "var(--line)" }}>
            {orgs.slice(0, 6).map((o) => (
              <li key={o.org.id} className="flex items-center justify-between gap-2 py-2.5">
                <div className="min-w-0">
                  <Link href={`/admin/orgs/${o.org.id}`} className="truncate text-sm font-medium hover:underline">{o.org.name}</Link>
                  <p className="text-xs" style={{ color: "var(--muted)" }}>{o.fighters} fighters · {o.locations} locations · {o.ownerEmail ?? "no owner"}</p>
                </div>
                <div className="flex shrink-0 items-center gap-2">
                  {o.plan ? <Badge>{o.plan.name}</Badge> : <Badge tone="warn">no plan</Badge>}
                  <StatusBadge status={o.org.status} />
                </div>
              </li>
            ))}
          </ul>
        </Card>

        <Card>
          <CardHeader title="Support queue" action={<ButtonLink href="/admin/tickets" variant="ghost" size="sm">Inbox</ButtonLink>} />
          {openTickets.length ? (
            <ul className="mt-2 divide-y" style={{ borderColor: "var(--line)" }}>
              {openTickets.slice(0, 5).map((t) => (
                <li key={t.ticket.id} className="flex items-center justify-between gap-2 py-2.5">
                  <div className="min-w-0">
                    <Link href={`/admin/tickets/${t.ticket.id}`} className="truncate text-sm font-medium hover:underline">{t.ticket.subject}</Link>
                    <p className="text-xs" style={{ color: "var(--muted)" }}>{t.userEmail ?? "anonymous"} · {t.orgName ?? "no gym"} · {relativeTime(t.ticket.createdAt)}</p>
                  </div>
                  <StatusBadge status={t.ticket.priority} />
                </li>
              ))}
            </ul>
          ) : (
            <EmptyState title="Inbox zero" description="No open support tickets." />
          )}
        </Card>
      </div>

      <Card className="mt-4">
        <CardHeader title="Recent platform activity" description="Audit trail (hash chained)." action={<ButtonLink href="/admin/audit" variant="ghost" size="sm">Open audit log</ButtonLink>} />
        <ul className="mt-2 divide-y text-sm" style={{ borderColor: "var(--line)" }}>
          {recentAudit.map((a) => (
            <li key={a.id} className="flex items-center justify-between gap-3 py-2">
              <span className="truncate">
                <span className="font-mono text-xs">{a.action}</span>
                {a.actorName ? <span style={{ color: "var(--muted)" }}> · {a.actorName}</span> : null}
              </span>
              <span className="shrink-0 text-xs" style={{ color: "var(--muted)" }}>{formatDateTime(a.createdAt)}</span>
            </li>
          ))}
        </ul>
      </Card>

      <div className="mt-4 flex flex-wrap items-center gap-2 text-xs" style={{ color: "var(--muted)" }}>
        <Mail className="h-3.5 w-3.5" /> Email outbox: {overview.email.queued} queued · {overview.email.sent} sent · {overview.email.failed} failed
      </div>
    </>
  );
}
