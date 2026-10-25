import Link from "next/link";
import { redirect } from "next/navigation";
import { and, desc, eq, gte, inArray, lte, sql } from "drizzle-orm";
import { ArrowRight, CalendarDays, Dumbbell, Flame, Plus, Swords, Ticket } from "lucide-react";
import { db } from "@/db/client";
import {
  announcements,
  attendance,
  bookings,
  classSessions,
  classes,
  fightCamps,
  notifications,
  orgMembers,
  programAssignments,
  trainingPrograms,
  trainingSessions,
} from "@/db/schema";
import { Avatar, Badge, ButtonLink, Callout, Card, CardHeader, EmptyState, ProgressBar, StatusBadge } from "@/components/ui/primitives";
import { SubmitButton } from "@/components/ui/client";
import { getAthleteCoaches, requireOrgPage } from "@/lib/authz";
import { bookClassAction, cancelMyBookingAction, logTrainingAction, selfCheckInAction } from "@/lib/actions/fighter";
import { checkMembershipAccess, getMemberSubscription } from "@/lib/membership";
import { formatDate, formatTime, daysUntil, addDays, startOfDay, formatMoney } from "@/lib/utils";

export const metadata = { title: "Home" };

export default async function FighterHome() {
  const ctx = await requireOrgPage();
  if (!ctx.membership) redirect("/app/onboarding");
  const memberId = ctx.membership.id;
  const orgId = ctx.org.id;
  const now = new Date();
  const weekStart = startOfDay(addDays(now, -((now.getDay() + 6) % 7)));

  const [access, sub, myBookings, upcoming, weekTraining, recentTraining, camp, announcementsList, unread, program, coaches] = await Promise.all([
    checkMembershipAccess(orgId, memberId),
    getMemberSubscription(orgId, memberId),
    db
      .select({ booking: bookings, session: classSessions, cls: classes })
      .from(bookings)
      .innerJoin(classSessions, eq(classSessions.id, bookings.sessionId))
      .innerJoin(classes, eq(classes.id, classSessions.classId))
      .where(and(eq(bookings.memberId, memberId), inArray(bookings.status, ["booked", "waitlisted"]), gte(classSessions.startsAt, now)))
      .orderBy(classSessions.startsAt)
      .limit(5),
    db
      .select({ session: classSessions, cls: classes, taken: sql<number>`(select count(*) from bookings b where b.session_id = ${classSessions.id} and b.status in ('booked','attended'))` })
      .from(classSessions)
      .innerJoin(classes, eq(classes.id, classSessions.classId))
      .where(and(eq(classSessions.orgId, orgId), eq(classSessions.status, "scheduled"), gte(classSessions.startsAt, now), lte(classSessions.startsAt, addDays(now, 7))))
      .orderBy(classSessions.startsAt)
      .limit(6),
    db
      .select({ total: sql<number>`coalesce(sum(${trainingSessions.durationMinutes}),0)`, n: sql<number>`count(*)` })
      .from(trainingSessions)
      .where(and(eq(trainingSessions.memberId, memberId), gte(trainingSessions.date, weekStart))),
    db.select().from(trainingSessions).where(eq(trainingSessions.memberId, memberId)).orderBy(desc(trainingSessions.date)).limit(4),
    db
      .select()
      .from(fightCamps)
      .where(and(eq(fightCamps.orgId, orgId), eq(fightCamps.fighterMemberId, memberId), eq(fightCamps.status, "active")))
      .orderBy(fightCamps.fightDate)
      .limit(1),
    db.select().from(announcements).where(eq(announcements.orgId, orgId)).orderBy(desc(announcements.createdAt)).limit(2),
    db.select({ id: notifications.id }).from(notifications).where(and(eq(notifications.userId, ctx.user.id), sql`${notifications.readAt} is null`)),
    db
      .select({ assignment: programAssignments, program: trainingPrograms })
      .from(programAssignments)
      .innerJoin(trainingPrograms, eq(trainingPrograms.id, programAssignments.programId))
      .where(and(eq(programAssignments.fighterMemberId, memberId), eq(programAssignments.status, "active")))
      .limit(1),
    getAthleteCoaches(orgId, memberId),
  ]);

  const next = myBookings[0];
  const weeklyMinutes = Number(weekTraining[0]?.total ?? 0);
  const weeklySessions = Number(weekTraining[0]?.n ?? 0);
  const goalSessions = program[0]?.program.sessionsPerWeek ?? 4;
  const fight = camp[0];
  const streak = await db
    .select({ n: sql<number>`count(distinct date(${attendance.checkedInAt} / 1000, 'unixepoch'))` })
    .from(attendance)
    .where(and(eq(attendance.memberId, memberId), gte(attendance.checkedInAt, addDays(now, -7))));

  const hour = now.getHours();
  const greeting = hour < 12 ? "Good morning" : hour < 18 ? "Good afternoon" : "Good evening";
  const membershipIssue =
    !access.allowed && sub.current
      ? { reason: access.reason, status: sub.current.subscription.status }
      : !sub.current
        ? { reason: "No membership on file yet.", status: "none" }
        : null;

  return (
    <div className="space-y-4">
      <div className="flex items-start justify-between gap-3">
        <div>
          <p className="text-sm" style={{ color: "var(--muted)" }}>{greeting},</p>
          <h1 className="text-2xl font-semibold tracking-tight">{ctx.user.name.split(" ")[0]}.</h1>
          <p className="mt-0.5 text-sm" style={{ color: "var(--muted)" }}>{ctx.org.name}</p>
        </div>
        <div className="flex items-center gap-1.5">
          <Badge tone="accent"><Flame className="h-3 w-3" /> {Number(streak[0]?.n ?? 0)} day streak</Badge>
        </div>
      </div>

      {membershipIssue ? (
        <Callout tone={membershipIssue.status === "past_due" ? "danger" : "warn"} title="Your membership needs attention">
          <p>{membershipIssue.reason}</p>
          <Link href="/app/membership" className="mt-1 inline-flex items-center gap-1 font-medium underline">
            View membership <ArrowRight className="h-3 w-3" />
          </Link>
        </Callout>
      ) : null}


      {coaches.length ? (
        <Card>
          <CardHeader title="Your coach" description="Your trainer can see your training, camps and notes." action={<Badge>{coaches.length}</Badge>} />
          <ul className="mt-2 space-y-2">
            {coaches.map((c) => (
              <li key={c.assignment.id} className="subtle flex items-center justify-between gap-2 p-2.5">
                <span className="flex min-w-0 items-center gap-2">
                  <Avatar name={c.user.name} src={c.user.avatarUrl} size={30} />
                  <span className="min-w-0">
                    <span className="block truncate text-sm font-medium">{c.user.name}</span>
                    <span className="block truncate text-xs" style={{ color: "var(--muted)" }}>
                      {c.assignment.focus ?? "Head coach"}{c.assignment.isPrimary ? " · primary" : ""}
                    </span>
                  </span>
                </span>
                <ButtonLink href={`/app/messages?with=${c.user.id}`} variant="secondary" size="sm">Message</ButtonLink>
              </li>
            ))}
          </ul>
        </Card>
      ) : null}

      {fight ? (
        <Link href="/app/fights" className="block">
          <Card className="glow border-[color-mix(in_srgb,var(--accent)_35%,transparent)]">
            <div className="flex items-center justify-between gap-3">
              <div>
                <p className="text-[0.7rem] font-semibold uppercase tracking-[0.14em]" style={{ color: "var(--accent)" }}>Next fight</p>
                <p className="mt-1 text-3xl font-semibold stat-value">{Math.max(0, daysUntil(fight.fightDate))} days</p>
                <p className="mt-1 text-sm" style={{ color: "var(--muted)" }}>
                  {fight.eventName ?? fight.title} · vs {fight.opponent ?? "TBD"} · {formatDate(fight.fightDate)}
                </p>
              </div>
              <Swords className="h-10 w-10 opacity-60" style={{ color: "var(--accent)" }} />
            </div>
          </Card>
        </Link>
      ) : null}

      <div className="grid gap-3 sm:grid-cols-2">
        <Card>
          <CardHeader title="Next training" description={next ? `${next.cls.discipline} · ${ctx.locations.find((l) => l.id === next.session.locationId)?.name ?? ""}` : "Nothing booked yet"} />
          {next ? (
            <div className="mt-3">
              <p className="text-lg font-semibold">{next.cls.name}</p>
              <p className="text-sm" style={{ color: "var(--muted)" }}>{formatDate(next.session.startsAt)} · {formatTime(next.session.startsAt)}</p>
              <div className="mt-3 flex flex-wrap gap-2">
                {next.booking.status === "booked" ? (
                  <form action={selfCheckInAction}>
                    <input type="hidden" name="sessionId" value={next.session.id} />
                    <SubmitButton size="sm">Check in</SubmitButton>
                  </form>
                ) : (
                  <Badge tone="warn">Waitlist</Badge>
                )}
                <form action={cancelMyBookingAction}>
                  <input type="hidden" name="bookingId" value={next.booking.id} />
                  <SubmitButton size="sm" variant="secondary">Cancel</SubmitButton>
                </form>
                <Link href="/app/schedule" className="btn btn-ghost btn-sm">All classes</Link>
              </div>
            </div>
          ) : (
            <div className="mt-3">
              <p className="text-sm" style={{ color: "var(--muted)" }}>Book your next session — it takes two taps.</p>
              <ButtonLink href="/app/schedule" size="sm" className="mt-3"><CalendarDays className="h-4 w-4" /> Book a class</ButtonLink>
            </div>
          )}
        </Card>

        <Card>
          <CardHeader title="This week" description={`${weeklySessions} sessions · ${Math.round(weeklyMinutes / 6) / 10}h training`} />
          <div className="mt-3">
            <ProgressBar value={Math.min(100, (weeklySessions / goalSessions) * 100)} label={`${weeklySessions} of ${goalSessions} sessions`} />
          </div>
          <div className="mt-3 flex flex-wrap gap-2">
            <form action={logTrainingAction} className="flex w-full flex-wrap items-end gap-2">
              <input type="hidden" name="returnTo" value="/app" />
              <div className="min-w-0 flex-1">
                <label className="label" htmlFor="type">Quick log</label>
                <select id="type" name="type" className="select" defaultValue="BJJ">
                  {["MMA", "BJJ", "Wrestling", "Boxing", "Muay Thai", "Strength", "Conditioning", "Sparring", "Mobility", "Recovery"].map((t) => (
                    <option key={t} value={t}>{t}</option>
                  ))}
                </select>
              </div>
              <div className="w-20">
                <label className="label" htmlFor="durationMinutes">Min</label>
                <input id="durationMinutes" name="durationMinutes" type="number" min={5} max={300} defaultValue={75} className="input" />
              </div>
              <div className="w-28">
                <label className="label" htmlFor="intensity">Intensity</label>
                <select id="intensity" name="intensity" className="select" defaultValue="hard">
                  <option value="light">Light</option>
                  <option value="moderate">Moderate</option>
                  <option value="hard">Hard</option>
                  <option value="max">Max</option>
                </select>
              </div>
              <SubmitButton size="sm"><Plus className="h-3.5 w-3.5" /> Log</SubmitButton>
            </form>
          </div>
        </Card>
      </div>

      <Card>
        <CardHeader title="Your membership" action={<Link href="/app/membership" className="btn btn-ghost btn-sm">Details</Link>} />
        {sub.current ? (
          <div className="mt-2 flex flex-wrap items-center justify-between gap-2">
            <div>
              <p className="font-medium">{sub.current.plan.name}</p>
              <p className="text-xs" style={{ color: "var(--muted)" }}>
                Renews {formatDate(sub.current.subscription.currentPeriodEnd)} · {formatMoney(sub.current.subscription.priceCents, sub.current.subscription.currency)}
              </p>
            </div>
            <StatusBadge status={sub.current.subscription.status} />
          </div>
        ) : (
          <p className="mt-2 text-sm" style={{ color: "var(--muted)" }}>No membership yet — your gym will assign one.</p>
        )}
      </Card>

      <div className="grid gap-3 sm:grid-cols-2">
        <Card>
          <CardHeader title="Upcoming classes" action={<Link href="/app/schedule" className="btn btn-ghost btn-sm">All</Link>} />
          <div className="mt-2 space-y-2">
            {upcoming.length ? (
              upcoming.map((u) => {
                const booked = myBookings.some((b) => b.session.id === u.session.id);
                const full = Number(u.taken) >= u.session.capacity;
                return (
                  <div key={u.session.id} className="subtle flex items-center justify-between gap-2 p-2.5">
                    <div className="min-w-0">
                      <p className="truncate text-sm font-medium">{u.cls.name}</p>
                      <p className="text-xs" style={{ color: "var(--muted)" }}>
                        {u.session.startsAt.toLocaleDateString("en-GB", { weekday: "short" })} {formatTime(u.session.startsAt)} · {Number(u.taken)}/{u.session.capacity}
                      </p>
                    </div>
                    {booked ? (
                      <Badge tone="accent">booked</Badge>
                    ) : (
                      <form action={bookClassAction}>
                        <input type="hidden" name="sessionId" value={u.session.id} />
                        <SubmitButton size="sm" variant="secondary">{full ? "Waitlist" : "Book"}</SubmitButton>
                      </form>
                    )}
                  </div>
                );
              })
            ) : (
              <EmptyState title="No classes scheduled" description="Ask your gym to add classes." />
            )}
          </div>
        </Card>

        <Card>
          <CardHeader title="Recent training" action={<Link href="/app/progress" className="btn btn-ghost btn-sm">Progress</Link>} />
          <div className="mt-2 space-y-1.5">
            {recentTraining.length ? (
              recentTraining.map((t) => (
                <div key={t.id} className="flex items-center justify-between text-sm">
                  <span className="flex items-center gap-2"><Dumbbell className="h-3.5 w-3.5" style={{ color: "var(--accent)" }} /> {t.type}</span>
                  <span className="text-xs" style={{ color: "var(--muted)" }}>{t.durationMinutes} min · {formatDate(t.date)}</span>
                </div>
              ))
            ) : (
              <EmptyState title="No training logged" description="Log a session above — it takes seconds." />
            )}
          </div>
        </Card>
      </div>

      {announcementsList.length ? (
        <Card>
          <CardHeader title="From your gym" action={<Link href="/app/notifications" className="btn btn-ghost btn-sm">Notifications ({unread.length})</Link>} />
          <div className="mt-2 space-y-2">
            {announcementsList.map((a) => (
              <div key={a.id} className="subtle p-2.5">
                <p className="text-sm font-medium">{a.title}</p>
                <p className="line-clamp-2 text-sm" style={{ color: "var(--muted)" }}>{a.body}</p>
              </div>
            ))}
          </div>
        </Card>
      ) : null}
    </div>
  );
}
