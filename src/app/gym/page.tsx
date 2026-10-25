import Link from "next/link";
import { and, count, desc, eq, gte, inArray, isNull, lt, lte, sql } from "drizzle-orm";
import {
  AlertTriangle,
  ArrowRight,
  CalendarClock,
  CheckCircle2,
  CircleDollarSign,
  Plus,
  TrendingUp,
  UserPlus,
  Users,
} from "lucide-react";
import { db } from "@/db/client";
import {
  attendance,
  bookings,
  classSessions,
  classes,
  invoices,
  membershipPlans,
  orgMembers,
  payments,
  subscriptions,
  users,
} from "@/db/schema";
import { PageHeader, ButtonLink, Card, CardHeader, Stat, ProgressBar, EmptyState, Badge, StatusBadge } from "@/components/ui/primitives";
import { DonutChart, ChartLegend, TrendChart } from "@/components/ui/charts";
import { getEntitlements } from "@/lib/entitlements";
import { requireOrgPage } from "@/lib/authz";
import { addDays, formatMoney, formatTime, pct, startOfDay, endOfDay } from "@/lib/utils";

export const metadata = { title: "Gym overview" };

export default async function GymDashboard() {
  const ctx = await requireOrgPage();
  const orgId = ctx.org.id;
  const now = new Date();
  const todayStart = startOfDay(now);
  const todayEnd = endOfDay(now);
  const monthStart = new Date(now.getFullYear(), now.getMonth(), 1);

  const [
    activeMembersRow,
    mrrRow,
    unpaidRow,
    todayAttendanceRow,
    newSignupsRow,
    todaysSessions,
    planPopularity,
    recentPayments,
    attendanceTrend,
    revenueTrend,
    atRisk,
  ] = await Promise.all([
    db
      .select({ n: count() })
      .from(orgMembers)
      .where(and(eq(orgMembers.orgId, orgId), eq(orgMembers.role, "fighter"), eq(orgMembers.status, "active"), isNull(orgMembers.archivedAt))),
    db
      .select({ total: sql<number>`coalesce(sum(${subscriptions.priceCents}),0)` })
      .from(subscriptions)
      .where(and(eq(subscriptions.orgId, orgId), inArray(subscriptions.status, ["active", "trial", "cancel_scheduled"]))),
    db
      .select({ total: sql<number>`coalesce(sum(${invoices.amountCents}),0)`, n: count() })
      .from(invoices)
      .where(and(eq(invoices.orgId, orgId), eq(invoices.status, "open"))),
    db
      .select({ n: count() })
      .from(attendance)
      .where(and(eq(attendance.orgId, orgId), gte(attendance.checkedInAt, todayStart), lte(attendance.checkedInAt, todayEnd))),
    db
      .select({ n: count() })
      .from(orgMembers)
      .where(and(eq(orgMembers.orgId, orgId), eq(orgMembers.role, "fighter"), gte(orgMembers.createdAt, monthStart))),
    db
      .select({ session: classSessions, cls: classes, booked: sql<number>`(select count(*) from bookings b where b.session_id = ${classSessions.id} and b.status in ('booked','attended'))` })
      .from(classSessions)
      .innerJoin(classes, eq(classes.id, classSessions.classId))
      .where(and(eq(classSessions.orgId, orgId), gte(classSessions.startsAt, todayStart), lte(classSessions.startsAt, todayEnd), eq(classSessions.status, "scheduled")))
      .orderBy(classSessions.startsAt),
    db
      .select({ name: membershipPlans.name, n: sql<number>`count(*)` })
      .from(subscriptions)
      .innerJoin(membershipPlans, eq(membershipPlans.id, subscriptions.planId))
      .where(and(eq(subscriptions.orgId, orgId), inArray(subscriptions.status, ["active", "trial", "cancel_scheduled"])))
      .groupBy(membershipPlans.name),
    db
      .select({ payment: payments, member: orgMembers, user: users })
      .from(payments)
      .leftJoin(orgMembers, eq(orgMembers.id, payments.memberId))
      .leftJoin(users, eq(users.id, orgMembers.userId))
      .where(and(eq(payments.orgId, orgId), eq(payments.status, "succeeded")))
      .orderBy(desc(payments.createdAt))
      .limit(5),
    db
      .select({ day: sql<string>`date(${attendance.checkedInAt} / 1000, 'unixepoch')`, n: sql<number>`count(*)` })
      .from(attendance)
      .where(and(eq(attendance.orgId, orgId), gte(attendance.checkedInAt, addDays(now, -13))))
      .groupBy(sql`date(${attendance.checkedInAt} / 1000, 'unixepoch')`),
    db
      .select({ month: sql<string>`strftime('%Y-%m', ${payments.createdAt} / 1000, 'unixepoch')`, total: sql<number>`sum(${payments.amountCents})` })
      .from(payments)
      .where(and(eq(payments.orgId, orgId), eq(payments.status, "succeeded"), gte(payments.createdAt, new Date(now.getFullYear(), now.getMonth() - 5, 1))))
      .groupBy(sql`strftime('%Y-%m', ${payments.createdAt} / 1000, 'unixepoch')`),
    db
      .select({ member: orgMembers, user: users, sub: subscriptions, lastSeen: sql<number>`(select max(a.checked_in_at) from attendance a where a.member_id = ${orgMembers.id})` })
      .from(orgMembers)
      .innerJoin(users, eq(users.id, orgMembers.userId))
      .leftJoin(subscriptions, and(eq(subscriptions.memberId, orgMembers.id), inArray(subscriptions.status, ["active", "trial"])))
      .where(and(eq(orgMembers.orgId, orgId), eq(orgMembers.role, "fighter"), isNull(orgMembers.archivedAt)))
      .limit(200),
  ]);

  const ent = await getEntitlements(orgId);
  const activeMembers = Number(activeMembersRow[0]?.n ?? 0);
  const mrr = Number(mrrRow[0]?.total ?? 0);
  const unpaid = { total: Number(unpaidRow[0]?.total ?? 0), n: Number(unpaidRow[0]?.n ?? 0) };
  const todayAttendance = Number(todayAttendanceRow[0]?.n ?? 0);
  const newSignups = Number(newSignupsRow[0]?.n ?? 0);

  const trendMap = new Map(attendanceTrend.map((r) => [r.day, Number(r.n)]));
  const attendanceSeries = Array.from({ length: 14 }, (_, i) => {
    const d = addDays(now, -(13 - i));
    const key = d.toISOString().slice(0, 10);
    return { label: d.toLocaleDateString("en-GB", { day: "numeric", month: "short" }), value: trendMap.get(key) ?? 0 };
  });

  const monthNames = ["Jan", "Feb", "Mar", "Apr", "May", "Jun", "Jul", "Aug", "Sep", "Oct", "Nov", "Dec"];
  const revenueMap = new Map(revenueTrend.map((r) => [r.month, Number(r.total)]));
  const revenueSeries = Array.from({ length: 6 }, (_, i) => {
    const d = new Date(now.getFullYear(), now.getMonth() - (5 - i), 1);
    const key = `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, "0")}`;
    return { label: monthNames[d.getMonth()], value: Math.round((revenueMap.get(key) ?? 0) / 100) };
  });

  const inactive = atRisk
    .filter((r) => !r.lastSeen || Number(r.lastSeen) < addDays(now, -14).getTime())
    .filter((r) => r.sub)
    .slice(0, 5);

  const setupSteps = [
    { label: "Create your gym", done: true, href: "/gym/settings" },
    { label: "Add a membership plan", done: planPopularity.length > 0 || ent.planSlug !== "none", href: "/gym/memberships/plans/new" },
    { label: "Schedule your first class", done: todaysSessions.length > 0, href: "/gym/classes/new" },
    { label: "Invite your members", done: activeMembers > 0, href: "/gym/members" },
  ];
  const setupDone = setupSteps.filter((s) => s.done).length;

  return (
    <div className="space-y-5">
      <PageHeader
        eyebrow={`${ctx.org.name} · ${ctx.locations.length} location${ctx.locations.length > 1 ? "s" : ""}`}
        title={`Good ${now.getHours() < 12 ? "morning" : now.getHours() < 18 ? "afternoon" : "evening"}, ${ctx.user.name.split(" ")[0]}`}
        description="Here's how the gym is doing today."
        actions={
          <>
            <ButtonLink href="/gym/members?add=1" variant="secondary" size="sm">
              <UserPlus className="h-4 w-4" /> Add member
            </ButtonLink>
            <ButtonLink href="/gym/calendar" size="sm">
              <CalendarClock className="h-4 w-4" /> Open calendar
            </ButtonLink>
          </>
        }
      />

      <div className="grid gap-3 sm:grid-cols-2 lg:grid-cols-4">
        <Stat label="Active members" value={activeMembers} hint={`${newSignups} new this month`} icon={<Users className="h-4 w-4" />} />
        <Stat label="Monthly revenue" value={formatMoney(mrr, ctx.org.currency)} hint="From active memberships" icon={<CircleDollarSign className="h-4 w-4" />} tone="accent" />
        <Stat label="Unpaid invoices" value={formatMoney(unpaid.total, ctx.org.currency)} hint={`${unpaid.n} invoice${unpaid.n === 1 ? "" : "s"} open`} icon={<AlertTriangle className="h-4 w-4" />} tone={unpaid.n ? "danger" : "neutral"} />
        <Stat label="Check-ins today" value={todayAttendance} hint={`${todaysSessions.length} classes today`} icon={<TrendingUp className="h-4 w-4" />} />
      </div>

      {setupDone < 4 ? (
        <Card className="border-[color-mix(in_srgb,var(--accent)_30%,transparent)]">
          <CardHeader
            title="Finish setting up your gym"
            description={`${setupDone} of 4 steps complete — takes about five minutes.`}
            action={<Badge tone="accent">{pct(setupDone, 4)}%</Badge>}
          />
          <div className="mt-3">
            <ProgressBar value={pct(setupDone, 4)} />
          </div>
          <ul className="mt-4 grid gap-2 sm:grid-cols-2">
            {setupSteps.map((step) => (
              <li key={step.label}>
                <Link href={step.href} className="subtle flex items-center gap-2 p-2.5 text-sm hover:border-[var(--line-strong)]">
                  {step.done ? (
                    <CheckCircle2 className="h-4 w-4 shrink-0" style={{ color: "var(--accent)" }} />
                  ) : (
                    <span className="flex h-4 w-4 shrink-0 items-center justify-center rounded-full border" style={{ borderColor: "var(--line-strong)" }} />
                  )}
                  <span className={step.done ? "line-through opacity-60" : ""}>{step.label}</span>
                  <ArrowRight className="ml-auto h-3.5 w-3.5 opacity-40" />
                </Link>
              </li>
            ))}
          </ul>
        </Card>
      ) : null}

      <div className="grid gap-4 lg:grid-cols-3">
        <Card className="lg:col-span-2">
          <CardHeader
            title="Attendance · last 14 days"
            description="Duplicate and replayed check-ins are rejected automatically."
            action={<Badge>{attendanceSeries.reduce((s, d) => s + d.value, 0)} check-ins</Badge>}
          />
          <div className="mt-4">
            <TrendChart data={attendanceSeries} height={230} />
          </div>
        </Card>

        <Card>
          <CardHeader title="Today's classes" action={<ButtonLink href="/gym/calendar" variant="ghost" size="sm">All</ButtonLink>} />
          <div className="mt-3 space-y-2">
            {todaysSessions.length ? (
              todaysSessions.map(({ session, cls, booked }) => (
                <Link key={session.id} href={`/gym/calendar?session=${session.id}`} className="subtle block p-3 hover:border-[var(--line-strong)]">
                  <div className="flex items-center justify-between gap-2">
                    <p className="truncate text-sm font-medium">{cls.name}</p>
                    <span className="stat-value text-sm">{formatTime(session.startsAt)}</span>
                  </div>
                  <div className="mt-1 flex items-center justify-between text-xs" style={{ color: "var(--muted)" }}>
                    <span>{ctx.locations.find((l) => l.id === session.locationId)?.name ?? "—"}</span>
                    <span>
                      {Number(booked)}/{session.capacity} booked
                    </span>
                  </div>
                </Link>
              ))
            ) : (
              <EmptyState
                icon={<CalendarClock className="h-5 w-5" />}
                title="No classes today"
                description="Add a recurring class to fill the calendar."
                action={<ButtonLink href="/gym/classes/new" size="sm"><Plus className="h-3.5 w-3.5" /> Add class</ButtonLink>}
              />
            )}
          </div>
        </Card>
      </div>

      <div className="grid gap-4 lg:grid-cols-3">
        <Card className="lg:col-span-2">
          <CardHeader title="Revenue" description={`Collected membership payments (${ctx.org.currency})`} action={<ButtonLink href="/gym/payments" variant="ghost" size="sm">Payments</ButtonLink>} />
          <div className="mt-4">
            <TrendChart data={revenueSeries} type="bar" height={200} />
          </div>
        </Card>
        <Card>
          <CardHeader title="Plan mix" description="Active memberships by plan" />
          <DonutChart
            data={planPopularity.slice(0, 6).map((p) => ({ label: p.name, value: Number(p.n) }))}
            centerValue={String(planPopularity.reduce((s, p) => s + Number(p.n), 0))}
            centerLabel="members"
          />
          <ChartLegend data={planPopularity.slice(0, 6).map((p) => ({ label: p.name, value: Number(p.n) }))} />
        </Card>
      </div>

      <div className="grid gap-4 lg:grid-cols-2">
        <Card>
          <CardHeader title="Recent payments" action={<ButtonLink href="/gym/payments" variant="ghost" size="sm">View all</ButtonLink>} />
          <div className="mt-2 divide-y" style={{ borderColor: "var(--line)" }}>
            {recentPayments.length ? (
              recentPayments.map((row) => (
                <div key={row.payment.id} className="flex items-center justify-between gap-3 py-2.5 text-sm">
                  <div className="min-w-0">
                    <p className="truncate font-medium">{row.user?.name ?? "Member"}</p>
                    <p className="text-xs" style={{ color: "var(--muted)" }}>
                      {row.payment.method ?? "card"} · {new Date(row.payment.createdAt).toLocaleDateString("en-GB")}
                    </p>
                  </div>
                  <span className="stat-value">{formatMoney(row.payment.amountCents, row.payment.currency)}</span>
                </div>
              ))
            ) : (
              <EmptyState title="No payments yet" description="Payments appear here as soon as a membership invoice is paid." />
            )}
          </div>
        </Card>

        <Card>
          <CardHeader title="Members who may need a nudge" description="No check-in in the last 14 days" action={<ButtonLink href="/gym/members?filter=inactive" variant="ghost" size="sm">Members</ButtonLink>} />
          <div className="mt-2 divide-y" style={{ borderColor: "var(--line)" }}>
            {inactive.length ? (
              inactive.map((row) => (
                <Link key={row.member.id} href={`/gym/members/${row.member.id}`} className="flex items-center justify-between gap-3 py-2.5 text-sm">
                  <div className="min-w-0">
                    <p className="truncate font-medium">{row.user.name}</p>
                    <p className="text-xs" style={{ color: "var(--muted)" }}>
                      {row.lastSeen ? `Last seen ${new Date(Number(row.lastSeen)).toLocaleDateString("en-GB")}` : "Never checked in"}
                    </p>
                  </div>
                  {row.sub ? <StatusBadge status={row.sub.status} /> : <Badge>no plan</Badge>}
                </Link>
              ))
            ) : (
              <EmptyState title="Everyone is training" description="No members have been inactive for two weeks." />
            )}
          </div>
        </Card>
      </div>

      <Card>
        <CardHeader
          title="Subscription & limits"
          description={`${ent.planName} · ${ent.usage.activeMembers}/${ent.maxActiveMembers} members · ${ent.usage.coaches}/${ent.maxCoaches} coaches · ${ent.usage.locations}/${ent.maxLocations} locations`}
          action={<ButtonLink href="/gym/settings/billing" variant="secondary" size="sm">Manage plan</ButtonLink>}
        />
        <div className="mt-3 grid gap-3 sm:grid-cols-3">
          <ProgressBar label="Active members" value={pct(ent.usage.activeMembers, ent.maxActiveMembers)} tone={ent.usage.activeMembers / ent.maxActiveMembers > 0.9 ? "warn" : "accent"} />
          <ProgressBar label="Coaches" value={pct(ent.usage.coaches, ent.maxCoaches)} tone={ent.usage.coaches / ent.maxCoaches > 0.9 ? "warn" : "accent"} />
          <ProgressBar label="Locations" value={pct(ent.usage.locations, ent.maxLocations)} tone={ent.usage.locations / ent.maxLocations > 0.9 ? "warn" : "accent"} />
        </div>
      </Card>
    </div>
  );
}
