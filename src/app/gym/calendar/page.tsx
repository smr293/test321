import Link from "next/link";
import { and, asc, eq, gte, inArray, isNull, lte, sql } from "drizzle-orm";
import { CalendarDays, ChevronLeft, ChevronRight, RefreshCw, Users, XCircle } from "lucide-react";
import { db } from "@/db/client";
import { bookings, classSessions, classes, orgMembers, users } from "@/db/schema";
import {
  Avatar,
  Badge,
  ButtonLink,
  Card,
  CardHeader,
  EmptyState,
  Field,
  PageHeader,
  Select,
  StatusBadge,
  Divider,
  Callout,
} from "@/components/ui/primitives";
import { ConfirmSubmit, Modal, SubmitButton } from "@/components/ui/client";
import { requireOrgPage } from "@/lib/authz";
import { cancelSessionAction, staffBookAction, staffCancelBookingAction, markAttendanceAction, generateScheduleAction } from "@/lib/actions/gym";
import { addDays, formatDate, formatTime, startOfDay } from "@/lib/utils";

export const metadata = { title: "Calendar" };

function mondayOf(date: Date) {
  const d = startOfDay(date);
  const day = (d.getDay() + 6) % 7;
  return addDays(d, -day);
}

export default async function CalendarPage({
  searchParams,
}: {
  searchParams: Promise<{ week?: string; session?: string; view?: string }>;
}) {
  const ctx = await requireOrgPage();
  const orgId = ctx.org.id;
  const params = await searchParams;
  const booked = params.week ? new Date(`${params.week}T12:00:00`) : new Date();
  const weekStart = mondayOf(Number.isNaN(booked.getTime()) ? new Date() : booked);
  const weekEnd = addDays(weekStart, 7);
  const days = Array.from({ length: 7 }, (_, i) => addDays(weekStart, i));
  const prevWeek = addDays(weekStart, -7).toISOString().slice(0, 10);
  const nextWeek = addDays(weekStart, 7).toISOString().slice(0, 10);

  const sessions = await db
    .select({
      session: classSessions,
      cls: classes,
      coach: users.name,
      booked: sql<number>`(select count(*) from bookings b where b.session_id = ${classSessions.id} and b.status in ('booked','attended'))`,
      waitlist: sql<number>`(select count(*) from bookings b where b.session_id = ${classSessions.id} and b.status = 'waitlisted')`,
    })
    .from(classSessions)
    .innerJoin(classes, eq(classes.id, classSessions.classId))
    .leftJoin(orgMembers, eq(orgMembers.id, classSessions.coachMemberId))
    .leftJoin(users, eq(users.id, orgMembers.userId))
    .where(and(eq(classSessions.orgId, orgId), gte(classSessions.startsAt, weekStart), lte(classSessions.startsAt, weekEnd), eq(classSessions.status, "scheduled")))
    .orderBy(asc(classSessions.startsAt));

  const detail = params.session
    ? (
        await db
          .select({ session: classSessions, cls: classes, coach: users.name })
          .from(classSessions)
          .innerJoin(classes, eq(classes.id, classSessions.classId))
          .leftJoin(orgMembers, eq(orgMembers.id, classSessions.coachMemberId))
          .leftJoin(users, eq(users.id, orgMembers.userId))
          .where(and(eq(classSessions.id, params.session), eq(classSessions.orgId, orgId)))
          .limit(1)
      )[0]
    : null;

  const roster = detail
    ? await db
        .select({ booking: bookings, member: orgMembers, user: users })
        .from(bookings)
        .innerJoin(orgMembers, eq(orgMembers.id, bookings.memberId))
        .innerJoin(users, eq(users.id, orgMembers.userId))
        .where(eq(bookings.sessionId, detail.session.id))
        .orderBy(asc(bookings.status), asc(bookings.position))
    : [];

  const members = detail
    ? await db
        .select({ member: orgMembers, user: users })
        .from(orgMembers)
        .innerJoin(users, eq(users.id, orgMembers.userId))
        .where(and(eq(orgMembers.orgId, orgId), isNull(orgMembers.archivedAt)))
        .orderBy(users.name)
    : [];

  const returnTo = `/gym/calendar?week=${weekStart.toISOString().slice(0, 10)}${detail ? `&session=${detail.session.id}` : ""}`;
  const canBook = ctx.permissions.has("bookings:manage");
  const canAttend = ctx.permissions.has("attendance:manage");

  return (
    <div className="space-y-5">
      <PageHeader
        title="Calendar"
        description="Your weekly schedule. Click a class to see who's booked."
        actions={
          <>
            <form action={generateScheduleAction}>
              <input type="hidden" name="orgId" value={orgId} />
              <SubmitButton variant="secondary" size="sm"><RefreshCw className="h-3.5 w-3.5" /> Refresh schedule</SubmitButton>
            </form>
            <ButtonLink href="/gym/classes/new" size="sm">+ Add class</ButtonLink>
          </>
        }
      />

      <Card className="p-3">
        <div className="flex flex-wrap items-center justify-between gap-2">
          <div className="flex items-center gap-1">
            <Link href={`/gym/calendar?week=${prevWeek}`} className="btn btn-secondary btn-sm" aria-label="Previous week"><ChevronLeft className="h-4 w-4" /></Link>
            <Link href="/gym/calendar" className="btn btn-secondary btn-sm">Today</Link>
            <Link href={`/gym/calendar?week=${nextWeek}`} className="btn btn-secondary btn-sm" aria-label="Next week"><ChevronRight className="h-4 w-4" /></Link>
          </div>
          <p className="text-sm font-medium">
            {formatDate(weekStart)} – {formatDate(addDays(weekStart, 6))}
          </p>
          <div className="flex items-center gap-2 text-xs" style={{ color: "var(--muted)" }}>
            <span>{sessions.length} classes</span>
            <span>·</span>
            <span>{sessions.reduce((s, r) => s + Number(r.booked), 0)} bookings</span>
          </div>
        </div>
      </Card>

      <div className="grid gap-3 md:grid-cols-7">
        {days.map((day) => {
          const daySessions = sessions.filter((s) => s.session.startsAt.toDateString() === day.toDateString());
          const isToday = day.toDateString() === new Date().toDateString();
          return (
            <div key={day.toISOString()} className="min-w-0">
              <div className="mb-1.5 flex items-center justify-between px-1">
                <p className="text-xs font-semibold uppercase tracking-wide" style={{ color: isToday ? "var(--accent)" : "var(--muted)" }}>
                  {day.toLocaleDateString("en-GB", { weekday: "short" })}
                </p>
                <p className="stat-value text-sm" style={{ color: isToday ? "var(--accent)" : undefined }}>{day.getDate()}</p>
              </div>
              <div className="space-y-2">
                {daySessions.map(({ session, cls, coach, booked: bookedN, waitlist }) => (
                  <Link
                    key={session.id}
                    href={`/gym/calendar?week=${weekStart.toISOString().slice(0, 10)}&session=${session.id}`}
                    className="block rounded-xl border p-2.5 transition-colors hover:border-[var(--line-strong)]"
                    style={{
                      background: params.session === session.id ? "var(--card-2)" : "var(--card)",
                      borderColor: params.session === session.id ? "var(--accent)" : "var(--line)",
                      borderLeftWidth: 3,
                      borderLeftColor: cls.color,
                    }}
                  >
                    <p className="text-xs font-semibold" style={{ color: "var(--muted)" }}>{formatTime(session.startsAt)}</p>
                    <p className="mt-0.5 line-clamp-2 text-sm font-medium">{cls.name}</p>
                    <p className="mt-1 truncate text-[0.7rem]" style={{ color: "var(--muted)" }}>{coach ?? "Unassigned"}</p>
                    <div className="mt-1.5 flex items-center justify-between text-[0.7rem]">
                      <span style={{ color: Number(bookedN) >= session.capacity ? "var(--warn)" : "var(--muted)" }}>
                        {Number(bookedN)}/{session.capacity}
                      </span>
                      {Number(waitlist) ? <Badge tone="warn">+{Number(waitlist)}</Badge> : null}
                    </div>
                  </Link>
                ))}
                {!daySessions.length ? (
                  <div className="rounded-lg border border-dashed py-6 text-center text-[0.7rem]" style={{ borderColor: "var(--line)", color: "var(--muted)" }}>
                    —
                  </div>
                ) : null}
              </div>
            </div>
          );
        })}
      </div>

      {detail ? (
        <Card id="session-detail">
          <CardHeader
            title={`${detail.cls.name} · ${formatDate(detail.session.startsAt)} ${formatTime(detail.session.startsAt)}`}
            description={`${detail.coach ?? "Unassigned coach"} · ${ctx.locations.find((l) => l.id === detail.session.locationId)?.name ?? "—"} · ${roster.filter((r) => ["booked", "attended"].includes(r.booking.status)).length}/${detail.session.capacity} booked`}
            action={
              <div className="flex gap-1.5">
                <Link href={`/gym/calendar?week=${weekStart.toISOString().slice(0, 10)}`} className="btn btn-ghost btn-sm">Close</Link>
                {ctx.permissions.has("classes:manage") ? (
                  <form action={cancelSessionAction}>
                    <input type="hidden" name="orgId" value={orgId} />
                    <input type="hidden" name="sessionId" value={detail.session.id} />
                    <input type="hidden" name="returnTo" value={returnTo} />
                    <ConfirmSubmit message="Cancel this session? Everyone booked will be notified.">
                      <XCircle className="h-3.5 w-3.5" /> Cancel class
                    </ConfirmSubmit>
                  </form>
                ) : null}
              </div>
            }
          />
          <div className="mt-4 grid gap-4 lg:grid-cols-3">
            <div className="lg:col-span-2">
              <div className="overflow-x-auto">
                <table className="table">
                  <thead><tr><th>Member</th><th>Status</th><th>Booked</th><th className="text-right">Attendance</th></tr></thead>
                  <tbody>
                    {roster.length ? (
                      roster.map((r) => (
                        <tr key={r.booking.id}>
                          <td>
                            <div className="flex items-center gap-2">
                              <Avatar name={r.user.name} size={26} />
                              <Link href={`/gym/members/${r.member.id}`} className="font-medium hover:underline">{r.user.name}</Link>
                            </div>
                          </td>
                          <td><StatusBadge status={r.booking.status} /></td>
                          <td className="text-xs" style={{ color: "var(--muted)" }}>{formatDate(r.booking.bookedAt)}</td>
                          <td>
                            <div className="flex justify-end gap-1">
                              {canAttend && !["attended", "no_show"].includes(r.booking.status) ? (
                                <>
                                  <form action={markAttendanceAction}>
                                    <input type="hidden" name="orgId" value={orgId} />
                                    <input type="hidden" name="sessionId" value={detail.session.id} />
                                    <input type="hidden" name="memberId" value={r.member.id} />
                                    <input type="hidden" name="returnTo" value={returnTo} />
                                    <input type="hidden" name="status" value="attended" />
                                    <SubmitButton size="sm" variant="secondary">Attended</SubmitButton>
                                  </form>
                                  <form action={markAttendanceAction}>
                                    <input type="hidden" name="orgId" value={orgId} />
                                    <input type="hidden" name="sessionId" value={detail.session.id} />
                                    <input type="hidden" name="memberId" value={r.member.id} />
                                    <input type="hidden" name="returnTo" value={returnTo} />
                                    <input type="hidden" name="status" value="no_show" />
                                    <SubmitButton size="sm" variant="ghost">No-show</SubmitButton>
                                  </form>
                                </>
                              ) : null}
                              {canBook && ["booked", "waitlisted"].includes(r.booking.status) ? (
                                <form action={staffCancelBookingAction}>
                                  <input type="hidden" name="orgId" value={orgId} />
                                  <input type="hidden" name="bookingId" value={r.booking.id} />
                                  <input type="hidden" name="returnTo" value={returnTo} />
                                  <ConfirmSubmit message={`Cancel ${r.user.name}'s booking?`} variant="ghost">×</ConfirmSubmit>
                                </form>
                              ) : null}
                            </div>
                          </td>
                        </tr>
                      ))
                    ) : (
                      <tr><td colSpan={4}><EmptyState title="No bookings yet" description="Book a member in manually or share the schedule." /></td></tr>
                    )}
                  </tbody>
                </table>
              </div>
            </div>
            <div className="space-y-3">
              {canBook ? (
                <div className="subtle p-3">
                  <p className="text-sm font-medium">Add a member</p>
                  <form action={staffBookAction} className="mt-2 space-y-2">
                    <input type="hidden" name="orgId" value={orgId} />
                    <input type="hidden" name="sessionId" value={detail.session.id} />
                    <input type="hidden" name="returnTo" value={returnTo} />
                    <Select name="memberId" required aria-label="Member">
                      <option value="">Choose member</option>
                      {members.map((m) => <option key={m.member.id} value={m.member.id}>{m.user.name}</option>)}
                    </Select>
                    <SubmitButton size="sm" className="w-full">Book member</SubmitButton>
                  </form>
                  <p className="mt-2 text-xs" style={{ color: "var(--muted)" }}>
                    Membership entitlements and capacity are checked server-side. Full classes go to the waitlist.
                  </p>
                </div>
              ) : null}
              <Callout tone="info" title="Booking rules">
                Members can book {detail.cls.bookingWindowDays} days ahead and cancel up to {detail.cls.cancellationWindowHours}h before.
                {detail.cls.eligiblePlanIds ? " Restricted to selected plans." : ""}
              </Callout>
              <ButtonLink href={`/gym/classes/${detail.cls.id}`} variant="secondary" size="sm" className="w-full">Edit class</ButtonLink>
            </div>
          </div>
          <Divider />
          <p className="text-xs" style={{ color: "var(--muted)" }}>
            <Users className="mr-1 inline h-3 w-3" /> Waitlist promotes automatically when someone cancels.
          </p>
        </Card>
      ) : (
        <Card className="p-4">
          <div className="flex items-center gap-2 text-sm" style={{ color: "var(--muted)" }}>
            <CalendarDays className="h-4 w-4" /> Select a class to view the roster, check members in, or cancel the session.
          </div>
        </Card>
      )}
    </div>
  );
}
