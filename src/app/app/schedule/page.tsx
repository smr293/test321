import Link from "next/link";
import { redirect } from "next/navigation";
import { and, asc, eq, gte, inArray, lte, sql } from "drizzle-orm";
import { CalendarDays, CheckCircle2, Clock, MapPin, QrCode, Users } from "lucide-react";
import { db } from "@/db/client";
import { bookings, classSessions, classes, orgMembers, users } from "@/db/schema";
import { Badge, ButtonLink, Callout, Card, CardHeader, EmptyState, StatusBadge } from "@/components/ui/primitives";
import { SubmitButton } from "@/components/ui/client";
import { CheckinQR } from "@/components/app/checkin-qr";
import { requireOrgPage } from "@/lib/authz";
import { bookClassAction, cancelMyBookingAction, selfCheckInAction } from "@/lib/actions/fighter";
import { checkMembershipAccess } from "@/lib/membership";
import { qrToken } from "@/lib/booking";
import { addDays, formatDate, formatTime, startOfDay } from "@/lib/utils";

export const metadata = { title: "Schedule" };

export default async function SchedulePage() {
  const ctx = await requireOrgPage();
  if (!ctx.membership) redirect("/app/onboarding");
  const orgId = ctx.org.id;
  const memberId = ctx.membership.id;
  const now = new Date();
  const from = startOfDay(now);
  const to = addDays(from, 14);

  const [sessions, mine, access] = await Promise.all([
    db
      .select({
        session: classSessions,
        cls: classes,
        coach: users.name,
        taken: sql<number>`(select count(*) from bookings b where b.session_id = ${classSessions.id} and b.status in ('booked','attended'))`,
        waitlist: sql<number>`(select count(*) from bookings b where b.session_id = ${classSessions.id} and b.status = 'waitlisted')`,
      })
      .from(classSessions)
      .innerJoin(classes, eq(classes.id, classSessions.classId))
      .leftJoin(orgMembers, eq(orgMembers.id, classSessions.coachMemberId))
      .leftJoin(users, eq(users.id, orgMembers.userId))
      .where(and(eq(classSessions.orgId, orgId), gte(classSessions.startsAt, from), lte(classSessions.startsAt, to), eq(classSessions.status, "scheduled")))
      .orderBy(asc(classSessions.startsAt)),
    db.select().from(bookings).where(and(eq(bookings.memberId, memberId), inArray(bookings.status, ["booked", "waitlisted", "attended"]))),
    checkMembershipAccess(orgId, memberId),
  ]);

  const myBySession = new Map(mine.map((b) => [b.sessionId, b]));
  const days = Array.from({ length: 8 }, (_, i) => addDays(from, i));
  const token = qrToken(orgId, memberId);

  return (
    <div className="space-y-4">
      <div className="flex items-end justify-between gap-3">
        <div>
          <h1 className="text-2xl font-semibold tracking-tight">Schedule</h1>
          <p className="text-sm" style={{ color: "var(--muted)" }}>Book a class — it takes two taps.</p>
        </div>
        <ButtonLink href="/app" variant="ghost" size="sm">Home</ButtonLink>
      </div>

      {!access.allowed ? (
        <Callout tone="warn" title="You can browse, but booking is paused">
          {access.reason} <Link href="/app/membership" className="underline">Fix membership</Link>
        </Callout>
      ) : null}

      <Card>
        <CardHeader
          title="Your check-in code"
          description="Show this at the door. It refreshes every day and can only be used once per class."
          action={<Badge tone="accent"><QrCode className="h-3 w-3" /> QR</Badge>}
        />
        <div className="mt-3 flex flex-wrap items-center gap-4">
          <CheckinQR value={`MMAOS:${orgId}:${memberId}:${token}`} />
          <div className="min-w-0 flex-1 text-sm" style={{ color: "var(--muted)" }}>
            <p className="font-medium" style={{ color: "var(--ink)" }}>{ctx.user.name}</p>
            <p>Staff can scan this code, or you can tap “Check in” on a booked class within 45 minutes of the start.</p>
            <p className="mt-1 text-xs">Code: <code className="break-all">{token}</code></p>
          </div>
        </div>
      </Card>

      {days.map((day) => {
        const daySessions = sessions.filter((s) => s.session.startsAt.toDateString() === day.toDateString());
        if (!daySessions.length) return null;
        const isToday = day.toDateString() === now.toDateString();
        return (
          <section key={day.toISOString()}>
            <div className="mb-2 flex items-center gap-2">
              <h2 className="text-sm font-semibold">
                {isToday ? "Today" : day.toLocaleDateString("en-GB", { weekday: "long", day: "numeric", month: "short" })}
              </h2>
              {isToday ? <Badge tone="accent">today</Badge> : null}
            </div>
            <div className="space-y-2">
              {daySessions.map((s) => {
                const booking = myBySession.get(s.session.id);
                const full = Number(s.taken) >= s.session.capacity;
                const started = s.session.startsAt.getTime() < now.getTime();
                const inWindow = now.getTime() > s.session.startsAt.getTime() - 45 * 60000 && now.getTime() < s.session.endsAt.getTime();
                return (
                  <Card key={s.session.id} className="p-4">
                    <div className="flex flex-wrap items-start justify-between gap-3">
                      <div className="min-w-0">
                        <div className="flex items-center gap-2">
                          <p className="font-semibold">{s.cls.name}</p>
                          <Badge>{s.cls.level}</Badge>
                          {full && !booking?.status ? <Badge tone="warn">full</Badge> : null}
                        </div>
                        <div className="mt-1 flex flex-wrap items-center gap-3 text-xs" style={{ color: "var(--muted)" }}>
                          <span className="flex items-center gap-1"><Clock className="h-3 w-3" /> {formatTime(s.session.startsAt)}–{formatTime(s.session.endsAt)}</span>
                          <span className="flex items-center gap-1"><MapPin className="h-3 w-3" /> {ctx.locations.find((l) => l.id === s.session.locationId)?.name ?? "Gym"}</span>
                          <span className="flex items-center gap-1"><Users className="h-3 w-3" /> {Number(s.taken)}/{s.session.capacity}</span>
                          {s.coach ? <span>Coach {s.coach}</span> : null}
                        </div>
                      </div>
                      <div className="flex flex-wrap items-center gap-2">
                        {booking && ["booked", "waitlisted"].includes(booking.status) ? (
                          <>
                            <StatusBadge status={booking.status} />
                            {booking.status === "booked" && inWindow ? (
                              <form action={selfCheckInAction}>
                                <input type="hidden" name="sessionId" value={s.session.id} />
                                <SubmitButton size="sm"><CheckCircle2 className="h-3.5 w-3.5" /> Check in</SubmitButton>
                              </form>
                            ) : null}
                            <form action={cancelMyBookingAction}>
                              <input type="hidden" name="bookingId" value={booking.id} />
                              <SubmitButton size="sm" variant="secondary">Cancel</SubmitButton>
                            </form>
                          </>
                        ) : booking?.status === "attended" ? (
                          <Badge tone="accent">attended</Badge>
                        ) : started ? (
                          <Badge>finished</Badge>
                        ) : (
                          <form action={bookClassAction}>
                            <input type="hidden" name="sessionId" value={s.session.id} />
                            <SubmitButton size="sm" variant={full ? "secondary" : "primary"}>
                              {full ? `Join waitlist (#${Number(s.waitlist) + 1})` : "Book"}
                            </SubmitButton>
                          </form>
                        )}
                      </div>
                    </div>
                  </Card>
                );
              })}
            </div>
          </section>
        );
      })}

      {!sessions.length ? (
        <Card>
          <EmptyState
            icon={<CalendarDays className="h-5 w-5" />}
            title="No classes in the next 14 days"
            description="Your gym hasn't scheduled classes yet. Check back soon."
          />
        </Card>
      ) : null}
    </div>
  );
}
