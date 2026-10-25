import { and, count, eq, gte, inArray, isNull, lte, sql } from "drizzle-orm";
import { BarChart3, TrendingDown, TrendingUp, Users } from "lucide-react";
import Link from "next/link";
import { db } from "@/db/client";
import { attendance, classSessions, classes, invoices, membershipPlans, orgMembers, payments, subscriptions } from "@/db/schema";
import { Callout, Card, CardHeader, EmptyState, PageHeader, Stat } from "@/components/ui/primitives";
import { ChartLegend, DonutChart, TrendChart } from "@/components/ui/charts";
import { requireOrgPage } from "@/lib/authz";
import { addDays, addMonths, formatMoney, monthRange, pct } from "@/lib/utils";

export const metadata = { title: "Analytics" };

export default async function AnalyticsPage() {
  const ctx = await requireOrgPage();
  const orgId = ctx.org.id;
  const now = new Date();
  const { start: monthStart } = monthRange(now);

  const [membersByMonth, cancelledByMonth, attendanceByDay, revenueByMonth, planMix, util, trialStats, totals] = await Promise.all([
    db
      .select({ month: sql<string>`strftime('%Y-%m', ${orgMembers.createdAt} / 1000, 'unixepoch')`, n: sql<number>`count(*)` })
      .from(orgMembers)
      .where(eq(orgMembers.orgId, orgId))
      .groupBy(sql`strftime('%Y-%m', ${orgMembers.createdAt} / 1000, 'unixepoch')`),
    db
      .select({ month: sql<string>`strftime('%Y-%m', ${subscriptions.cancelledAt} / 1000, 'unixepoch')`, n: sql<number>`count(*)` })
      .from(subscriptions)
      .where(and(eq(subscriptions.orgId, orgId), sql`${subscriptions.cancelledAt} is not null`))
      .groupBy(sql`strftime('%Y-%m', ${subscriptions.cancelledAt} / 1000, 'unixepoch')`),
    db
      .select({ day: sql<string>`date(${attendance.checkedInAt} / 1000, 'unixepoch')`, n: sql<number>`count(*)` })
      .from(attendance)
      .where(and(eq(attendance.orgId, orgId), gte(attendance.checkedInAt, addDays(now, -29))))
      .groupBy(sql`date(${attendance.checkedInAt} / 1000, 'unixepoch')`),
    db
      .select({ month: sql<string>`strftime('%Y-%m', ${payments.createdAt} / 1000, 'unixepoch')`, total: sql<number>`sum(${payments.amountCents})` })
      .from(payments)
      .where(and(eq(payments.orgId, orgId), eq(payments.status, "succeeded")))
      .groupBy(sql`strftime('%Y-%m', ${payments.createdAt} / 1000, 'unixepoch')`),
    db
      .select({ name: membershipPlans.name, n: sql<number>`count(*)` })
      .from(subscriptions)
      .innerJoin(membershipPlans, eq(membershipPlans.id, subscriptions.planId))
      .where(and(eq(subscriptions.orgId, orgId), inArray(subscriptions.status, ["active", "trial", "cancel_scheduled"])))
      .groupBy(membershipPlans.name),
    db
      .select({
        name: classes.name,
        capacity: classes.capacity,
        sessions: sql<number>`count(distinct ${classSessions.id})`,
        booked: sql<number>`(select count(*) from bookings b join class_sessions cs2 on cs2.id = b.session_id where cs2.class_id = ${classes.id} and b.status in ('booked','attended'))`,
      })
      .from(classes)
      .leftJoin(classSessions, and(eq(classSessions.classId, classes.id), gte(classSessions.startsAt, addDays(now, -30)), lte(classSessions.startsAt, now)))
      .where(eq(classes.orgId, orgId))
      .groupBy(classes.id),
    db
      .select({ status: subscriptions.status, n: count() })
      .from(subscriptions)
      .where(eq(subscriptions.orgId, orgId))
      .groupBy(subscriptions.status),
    db
      .select({ n: count() })
      .from(orgMembers)
      .where(and(eq(orgMembers.orgId, orgId), eq(orgMembers.role, "fighter"), isNull(orgMembers.archivedAt))),
  ]);

  const monthNames = ["Jan", "Feb", "Mar", "Apr", "May", "Jun", "Jul", "Aug", "Sep", "Oct", "Nov", "Dec"];
  const months = Array.from({ length: 6 }, (_, i) => {
    const d = addMonths(new Date(now.getFullYear(), now.getMonth(), 1), -(5 - i));
    return { key: `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, "0")}`, label: monthNames[d.getMonth()] };
  });
  const joined = new Map(membersByMonth.map((m) => [m.month, Number(m.n)]));
  const cancelled = new Map(cancelledByMonth.map((m) => [m.month, Number(m.n)]));
  const revenue = new Map(revenueByMonth.map((m) => [m.month, Number(m.total)]));
  const growth = months.map((m) => ({ label: m.label, value: joined.get(m.key) ?? 0 }));
  const churnSeries = months.map((m) => ({ label: m.label, value: cancelled.get(m.key) ?? 0 }));
  const revenueSeries = months.map((m) => ({ label: m.label, value: Math.round((revenue.get(m.key) ?? 0) / 100) }));

  const attendanceMap = new Map(attendanceByDay.map((d) => [d.day, Number(d.n)]));
  const attendanceSeries = Array.from({ length: 30 }, (_, i) => {
    const d = addDays(now, -(29 - i));
    return { label: d.toLocaleDateString("en-GB", { day: "numeric", month: "short" }), value: attendanceMap.get(d.toISOString().slice(0, 10)) ?? 0 };
  });

  const activeTotal = Number(totals[0]?.n ?? 0);
  const churnedLast30 = cancelledByMonth
    .filter((m) => Number(m.month.slice(0, 4)) >= now.getFullYear())
    .filter((m) => {
      const [y, mo] = m.month.split("-").map(Number);
      return y === now.getFullYear() && mo === now.getMonth() + 1;
    })
    .reduce((s, m) => s + Number(m.n), 0);
  const churnRate = pct(churnedLast30, activeTotal + churnedLast30 || 1);
  const totalAttendance = attendanceSeries.reduce((s, d) => s + d.value, 0);
  const utilization = util.map((u) => ({
    name: u.name,
    pct: u.capacity && Number(u.sessions) ? Math.min(100, Math.round((Number(u.booked) / (u.capacity * Number(u.sessions))) * 100)) : 0,
    sessions: Number(u.sessions),
  }));
  const trialCount = trialStats.find((s) => s.status === "trial")?.n ?? 0;
  const activeCount = trialStats.find((s) => s.status === "active")?.n ?? 0;
  const trialConversion = Number(activeCount) + Number(trialCount) > 0 ? pct(Number(activeCount), Number(activeCount) + Number(trialCount)) : 0;

  const overdue = await db
    .select({ total: sql<number>`coalesce(sum(${invoices.amountCents}),0)` })
    .from(invoices)
    .where(and(eq(invoices.orgId, orgId), eq(invoices.status, "open")));

  return (
    <div className="space-y-5">
      <PageHeader title="Analytics" description="Real numbers from your database — no estimates, no mock data." />

      <div className="grid gap-3 sm:grid-cols-2 lg:grid-cols-4">
        <Stat label="Members" value={activeTotal} icon={<Users className="h-4 w-4" />} hint={`${joined.get(months[5].key) ?? 0} joined this month`} />
        <Stat label="Churn (this month)" value={`${churnRate}%`} tone={churnRate > 5 ? "danger" : "neutral"} icon={<TrendingDown className="h-4 w-4" />} hint={`${churnedLast30} cancelled`} />
        <Stat label="Check-ins (30 days)" value={totalAttendance} icon={<TrendingUp className="h-4 w-4" />} hint={`${Math.round(totalAttendance / 30)} per day`} />
        <Stat label="Trial → paid" value={`${trialConversion}%`} icon={<BarChart3 className="h-4 w-4" />} hint={`${trialCount} trials active`} />
      </div>

      <div className="grid gap-4 lg:grid-cols-2">
        <Card>
          <CardHeader title="New members" description="Sign-ups per month" />
          <div className="mt-3"><TrendChart data={growth} type="bar" height={200} /></div>
        </Card>
        <Card>
          <CardHeader title="Cancellations" description="Memberships ended per month" />
          <div className="mt-3"><TrendChart data={churnSeries} type="bar" color="var(--danger)" height={200} /></div>
        </Card>
      </div>

      <Card>
        <CardHeader title="Attendance" description="Check-ins per day, last 30 days" />
        <div className="mt-3"><TrendChart data={attendanceSeries} height={220} /></div>
      </Card>

      <div className="grid gap-4 lg:grid-cols-3">
        <Card className="lg:col-span-2">
          <CardHeader title="Class utilization" description="Bookings vs capacity, last 30 days" />
          <div className="mt-3 space-y-2">
            {utilization.length ? (
              utilization.map((u) => (
                <div key={u.name}>
                  <div className="flex items-center justify-between text-sm">
                    <span>{u.name}</span>
                    <span className="stat-value text-xs">{u.pct}%</span>
                  </div>
                  <div className="mt-1 h-2 overflow-hidden rounded-full" style={{ background: "var(--card-2)" }}>
                    <div className="h-full rounded-full" style={{ width: `${u.pct}%`, background: u.pct > 85 ? "var(--warn)" : "var(--accent)" }} />
                  </div>
                </div>
              ))
            ) : (
              <EmptyState title="No classes yet" />
            )}
          </div>
        </Card>
        <Card>
          <CardHeader title="Plan popularity" />
          <DonutChart
            data={planMix.map((p) => ({ label: p.name, value: Number(p.n) }))}
            centerValue={String(planMix.reduce((s, p) => s + Number(p.n), 0))}
            centerLabel="members"
          />
          <ChartLegend data={planMix.map((p) => ({ label: p.name, value: Number(p.n) }))} />
        </Card>
      </div>

      <div className="grid gap-4 lg:grid-cols-3">
        <Card className="lg:col-span-2">
          <CardHeader title="Revenue" description={`Collected per month (${ctx.org.currency})`} action={<Link href="/gym/payments" className="btn btn-ghost btn-sm">Payments</Link>} />
          <div className="mt-3"><TrendChart data={revenueSeries} height={200} /></div>
        </Card>
        <Card>
          <CardHeader title="Revenue health" />
          <div className="mt-3 space-y-2 text-sm">
            <div className="flex justify-between"><span style={{ color: "var(--muted)" }}>Outstanding invoices</span><span className="stat-value">{formatMoney(Number(overdue[0]?.total ?? 0), ctx.org.currency)}</span></div>
            <div className="flex justify-between"><span style={{ color: "var(--muted)" }}>Members this month</span><span className="stat-value">{joined.get(months[5].key) ?? 0}</span></div>
            <div className="flex justify-between"><span style={{ color: "var(--muted)" }}>Churned this month</span><span className="stat-value">{churnedLast30}</span></div>
            <div className="flex justify-between"><span style={{ color: "var(--muted)" }}>Paid memberships</span><span className="stat-value">{activeCount}</span></div>
          </div>
          <div className="mt-3">
            <Callout tone="info" title="How these are calculated">
              Churn = memberships cancelled this month ÷ (active + cancelled). Utilisation = bookings ÷ capacity ×
              sessions in the last 30 days. Trial conversion = active memberships ÷ (active + trials).
            </Callout>
          </div>
        </Card>
      </div>
    </div>
  );
}
