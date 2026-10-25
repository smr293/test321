import crypto from "node:crypto";
import { and, asc, count, eq, gte, inArray, isNull, lte, ne, sql } from "drizzle-orm";
import { db } from "@/db/client";
import {
  attendance,
  bookings,
  classSessions,
  classes,
  membershipPlans,
  orgMembers,
  subscriptions,
  users,
} from "@/db/schema";
import { env } from "./env";
import { checkMembershipAccess } from "./membership";
import { notify } from "./notifications";
import { addDays, parseJson } from "./utils";

export class BookingError extends Error {
  code: string;
  constructor(code: string, message: string) {
    super(message);
    this.code = code;
  }
}

/* ------------------------------------------------------------------ */
/* Session generation from recurring schedules                         */
/* ------------------------------------------------------------------ */

export type Recurrence = { days: number[]; time: string; until?: string };

export async function generateSessions(classId: string, orgId: string, weeksAhead = 8) {
  const cls = (
    await db
      .select()
      .from(classes)
      .where(and(eq(classes.id, classId), eq(classes.orgId, orgId)))
      .limit(1)
  )[0];
  if (!cls) throw new BookingError("not_found", "Class not found");
  const recurrence = parseJson<Recurrence | null>(cls.recurrence, null);
  if (!recurrence || !recurrence.days?.length) return 0;

  const [hh, mm] = (recurrence.time ?? "18:00").split(":").map(Number);
  const start = new Date();
  start.setHours(0, 0, 0, 0);
  const created: Date[] = [];
  for (let i = 0; i < weeksAhead * 7; i++) {
    const day = addDays(start, i);
    if (!recurrence.days.includes(day.getDay())) continue;
    const startsAt = new Date(day);
    startsAt.setHours(hh, mm, 0, 0);
    if (startsAt.getTime() < Date.now() - 60 * 60 * 1000) continue;
    const endsAt = new Date(startsAt.getTime() + cls.durationMinutes * 60000);
    if (recurrence.until && startsAt > new Date(recurrence.until)) continue;
    created.push(startsAt);
    await db
      .insert(classSessions)
      .values({
        orgId,
        classId: cls.id,
        locationId: cls.locationId,
        coachMemberId: cls.coachMemberId,
        startsAt,
        endsAt,
        capacity: cls.capacity,
      })
      .onConflictDoNothing();
  }
  return created.length;
}

export async function generateAllSessions(orgId: string, weeksAhead = 6) {
  const list = await db.select().from(classes).where(and(eq(classes.orgId, orgId), eq(classes.isActive, true)));
  let total = 0;
  for (const cls of list) total += await generateSessions(cls.id, orgId, weeksAhead);
  return total;
}

/* ------------------------------------------------------------------ */
/* Booking                                                             */
/* ------------------------------------------------------------------ */

export async function getSessionDetail(orgId: string, sessionId: string) {
  const rows = await db
    .select({ session: classSessions, cls: classes })
    .from(classSessions)
    .innerJoin(classes, eq(classes.id, classSessions.classId))
    .where(and(eq(classSessions.id, sessionId), eq(classSessions.orgId, orgId)))
    .limit(1);
  return rows[0] ?? null;
}

export async function bookedCount(sessionId: string) {
  const rows = await db
    .select({ n: count() })
    .from(bookings)
    .where(and(eq(bookings.sessionId, sessionId), inArray(bookings.status, ["booked", "attended"])));
  return Number(rows[0]?.n ?? 0);
}

export type BookResult = {
  status: "booked" | "waitlisted";
  position?: number;
  bookingId: string;
};

export async function bookSession(input: {
  orgId: string;
  sessionId: string;
  memberId: string;
  source?: string;
}): Promise<BookResult> {
  const detail = await getSessionDetail(input.orgId, input.sessionId);
  if (!detail) throw new BookingError("not_found", "Class not found");
  const { session, cls } = detail;
  if (session.status !== "scheduled") throw new BookingError("cancelled", "This class has been cancelled");
  if (session.startsAt.getTime() < Date.now()) throw new BookingError("started", "This class has already started");

  // Booking window
  const windowStart = session.startsAt.getTime() - cls.bookingWindowDays * 86400000;
  if (Date.now() < windowStart) {
    throw new BookingError(
      "window",
      `Booking opens ${cls.bookingWindowDays} days before the class`,
    );
  }

  const access = await checkMembershipAccess(input.orgId, input.memberId, {
    discipline: cls.discipline,
    locationId: session.locationId,
  });
  if (!access.allowed) throw new BookingError("membership", access.reason ?? "Membership required");

  // Plan eligibility list on the class
  const eligible = parseJson<string[] | null>(cls.eligiblePlanIds, null);
  if (eligible?.length && access.plan && !eligible.includes(access.plan.id)) {
    throw new BookingError("membership", "Your plan is not eligible for this class");
  }

  const result = db.transaction((tx): BookResult => {
    const existing = tx
      .select()
      .from(bookings)
      .where(and(eq(bookings.sessionId, input.sessionId), eq(bookings.memberId, input.memberId)))
      .all()[0];

    const taken = tx
      .select()
      .from(bookings)
      .where(and(eq(bookings.sessionId, input.sessionId), inArray(bookings.status, ["booked", "attended"])))
      .all().length;

    const isFull = taken >= session.capacity;

    if (existing && existing.status !== "cancelled" && existing.status !== "late_cancelled") {
      throw new BookingError("duplicate", "You already have a booking for this class");
    }

    if (existing) {
      const position = isFull
        ? tx
            .select()
            .from(bookings)
            .where(and(eq(bookings.sessionId, input.sessionId), eq(bookings.status, "waitlisted")))
            .all().length + 1
        : null;
      tx.update(bookings)
        .set({
          status: isFull ? "waitlisted" : "booked",
          position,
          bookedAt: new Date(),
          cancelledAt: null,
          checkedInAt: null,
        })
        .where(eq(bookings.id, existing.id))
        .run();
      return { status: isFull ? "waitlisted" : "booked", position: position ?? undefined, bookingId: existing.id };
    }

    const waitlistPosition = isFull
      ? tx
          .select()
          .from(bookings)
          .where(and(eq(bookings.sessionId, input.sessionId), eq(bookings.status, "waitlisted")))
          .all().length + 1
      : null;

    const inserted = tx
      .insert(bookings)
      .values({
        orgId: input.orgId,
        sessionId: input.sessionId,
        memberId: input.memberId,
        status: isFull ? "waitlisted" : "booked",
        position: waitlistPosition,
        source: input.source ?? "app",
      })
      .returning()
      .all()[0];

    return {
      status: isFull ? "waitlisted" : "booked",
      position: waitlistPosition ?? undefined,
      bookingId: inserted.id,
    };
  });

  // Entitlement bookkeeping happens after the seat is secured.
  if (result.status === "booked" && access.plan?.creditCount != null) {
    const sub = access.subscription;
    if (sub && sub.creditsRemaining != null && sub.creditsRemaining > 0) {
      await db
        .update(subscriptions)
        .set({ creditsRemaining: sub.creditsRemaining - 1 })
        .where(eq(subscriptions.id, sub.id));
    }
  }

  const member = (
    await db.select({ member: orgMembers, user: users }).from(orgMembers).innerJoin(users, eq(users.id, orgMembers.userId)).where(eq(orgMembers.id, input.memberId)).limit(1)
  )[0];
  if (member) {
    const when = session.startsAt.toLocaleString("en-GB", { weekday: "short", day: "numeric", month: "short", hour: "2-digit", minute: "2-digit" });
    await notify({
      userId: member.user.id,
      orgId: input.orgId,
      type: "class",
      title: result.status === "booked" ? `Booked: ${cls.name}` : `Waitlisted: ${cls.name}`,
      body:
        result.status === "booked"
          ? `${when}. See you on the mats.`
          : `You are #${result.position} on the waitlist for ${when}.`,
      link: "/app/schedule",
      dedupeKey: `booking-${result.bookingId}-${result.status}`,
      email: true,
    });
  }
  return result;
}

export async function cancelBooking(input: {
  orgId: string;
  bookingId: string;
  actor: { id: string; name: string; userId?: string };
  byStaff?: boolean;
}) {
  const row = (
    await db
      .select({ booking: bookings, session: classSessions, cls: classes, member: orgMembers })
      .from(bookings)
      .innerJoin(classSessions, eq(classSessions.id, bookings.sessionId))
      .innerJoin(classes, eq(classes.id, classSessions.classId))
      .innerJoin(orgMembers, eq(orgMembers.id, bookings.memberId))
      .where(and(eq(bookings.id, input.bookingId), eq(bookings.orgId, input.orgId)))
      .limit(1)
  )[0];
  if (!row) throw new BookingError("not_found", "Booking not found");
  if (["cancelled", "late_cancelled", "attended"].includes(row.booking.status)) {
    throw new BookingError("invalid", "This booking can no longer be cancelled");
  }
  const hoursUntil = (row.session.startsAt.getTime() - Date.now()) / 3600000;
  const late = !input.byStaff && hoursUntil < row.cls.cancellationWindowHours;

  await db
    .update(bookings)
    .set({ status: late ? "late_cancelled" : "cancelled", cancelledAt: new Date() })
    .where(eq(bookings.id, input.bookingId));

  // Return the credit for an on-time cancellation.
  if (!late) {
    const sub = (
      await db
        .select({ sub: subscriptions, plan: membershipPlans })
        .from(subscriptions)
        .innerJoin(membershipPlans, eq(membershipPlans.id, subscriptions.planId))
        .where(and(eq(subscriptions.memberId, row.member.id), inArray(subscriptions.status, ["active", "trial", "cancel_scheduled"])))
        .limit(1)
    )[0];
    if (sub?.plan.creditCount != null && sub.sub.creditsRemaining != null) {
      await db
        .update(subscriptions)
        .set({ creditsRemaining: sub.sub.creditsRemaining + 1 })
        .where(eq(subscriptions.id, sub.sub.id));
    }
  }

  // Promote the first person on the waitlist when a seat frees up.
  let promoted: { userId: string; orgId: string; bookingId: string; when: string } | null = null;
  if (row.booking.status === "booked") {
    const next = (
      await db
        .select()
        .from(bookings)
        .where(and(eq(bookings.sessionId, row.booking.sessionId), eq(bookings.status, "waitlisted")))
        .orderBy(asc(bookings.position), asc(bookings.bookedAt))
        .limit(1)
    )[0];
    if (next) {
      await db.update(bookings).set({ status: "booked", position: null }).where(eq(bookings.id, next.id));
      const promotedMember = (
        await db.select().from(orgMembers).where(eq(orgMembers.id, next.memberId)).limit(1)
      )[0];
      if (promotedMember) {
        promoted = {
          userId: promotedMember.userId,
          orgId: input.orgId,
          bookingId: next.id,
          when: row.session.startsAt.toLocaleString("en-GB", {
            weekday: "short",
            day: "numeric",
            month: "short",
            hour: "2-digit",
            minute: "2-digit",
          }),
        };
      }
    }
  }

  if (promoted) {
    await notify({
      userId: promoted.userId,
      orgId: promoted.orgId,
      type: "class",
      title: `You're in! ${row.cls.name}`,
      body: `A spot opened up for ${promoted.when}.`,
      link: "/app/schedule",
      dedupeKey: `promoted-${promoted.bookingId}`,
      email: true,
    });
  }

  const memberUser = (await db.select().from(orgMembers).where(eq(orgMembers.id, row.member.id)).limit(1))[0];
  if (memberUser && !input.byStaff) {
    await notify({
      userId: memberUser.userId,
      orgId: input.orgId,
      type: "class",
      title: late ? "Late cancellation recorded" : "Booking cancelled",
      body: `${row.cls.name} — ${late ? "cancelled inside the cancellation window." : "your seat has been released."}`,
      link: "/app/schedule",
      dedupeKey: `cancel-${input.bookingId}`,
    });
  }

  return { late, promoted: Boolean(promoted) };
}

/* ------------------------------------------------------------------ */
/* Attendance & check-in                                               */
/* ------------------------------------------------------------------ */

export function qrToken(orgId: string, memberId: string, date = new Date()) {
  const day = date.toISOString().slice(0, 10);
  const secret = env.authSecret || "dev-only-qr-secret";
  const sig = crypto.createHmac("sha256", secret).update(`${orgId}:${memberId}:${day}`).digest("base64url").slice(0, 24);
  return `${day}.${sig}`;
}

export function verifyQrToken(orgId: string, memberId: string, token: string) {
  const [day, sig] = String(token ?? "").split(".");
  if (!day || !sig || !/^\d{4}-\d{2}-\d{2}$/.test(day)) return false;
  const date = new Date(`${day}T12:00:00Z`);
  if (Number.isNaN(date.getTime())) return false;
  const expected = qrToken(orgId, memberId, date);
  // constant-time comparison to avoid timing leaks
  const a = Buffer.from(expected);
  const b = Buffer.from(token);
  return a.length === b.length && crypto.timingSafeEqual(a, b);
}

export async function checkIn(input: {
  orgId: string;
  sessionId?: string | null;
  memberId: string;
  method: "self" | "qr" | "staff" | "coach";
  checkedInById?: string | null;
  nonce?: string | null;
}) {
  if (input.nonce) {
    const replay = await db.select({ id: attendance.id }).from(attendance).where(eq(attendance.nonce, input.nonce)).limit(1);
    if (replay[0]) throw new BookingError("replay", "This check-in code has already been used");
  }

  let bookingId: string | null = null;
  if (input.sessionId) {
    const session = await getSessionDetail(input.orgId, input.sessionId);
    if (!session) throw new BookingError("not_found", "Class not found");
    const windowStart = session.session.startsAt.getTime() - 45 * 60000;
    const windowEnd = session.session.endsAt.getTime();
    const now = Date.now();
    if (input.method !== "staff" && (now < windowStart || now > windowEnd)) {
      throw new BookingError("window", "Check-in is open 45 minutes before class starts until it ends");
    }
    const booking = (
      await db
        .select()
        .from(bookings)
        .where(and(eq(bookings.sessionId, input.sessionId), eq(bookings.memberId, input.memberId)))
        .limit(1)
    )[0];
    if (!booking) {
      // Walk-ins are allowed when the class has room; staff check-in always allowed.
      const taken = await bookedCount(input.sessionId);
      if (input.method === "self" || input.method === "qr") {
        if (taken >= session.session.capacity) throw new BookingError("full", "This class is full");
      }
      const inserted = await db
        .insert(bookings)
        .values({
          orgId: input.orgId,
          sessionId: input.sessionId,
          memberId: input.memberId,
          status: "attended",
          checkedInAt: new Date(),
          checkInMethod: input.method,
          source: "walk_in",
        })
        .onConflictDoNothing()
        .returning();
      bookingId = inserted[0]?.id ?? null;
    } else {
      if (booking.status === "attended") throw new BookingError("duplicate", "Already checked in for this class");
      if (booking.status === "cancelled") throw new BookingError("cancelled", "You cancelled this booking");
      await db
        .update(bookings)
        .set({ status: "attended", checkedInAt: new Date(), checkInMethod: input.method })
        .where(eq(bookings.id, booking.id));
      bookingId = booking.id;
    }
  }

  try {
    const inserted = await db
      .insert(attendance)
      .values({
        orgId: input.orgId,
        memberId: input.memberId,
        sessionId: input.sessionId ?? null,
        method: input.method,
        checkedInById: input.checkedInById ?? null,
        nonce: input.nonce ?? null,
        checkedInAt: new Date(),
      })
      .returning();
    return { attendance: inserted[0], bookingId };
  } catch (error) {
    const msg = (error as Error).message ?? "";
    if (msg.includes("UNIQUE")) throw new BookingError("duplicate", "Already checked in for this class");
    throw error;
  }
}

/** Marks no-shows for finished classes and closes attendance. */
export async function resolveNoShows(orgId: string, now = new Date()) {
  const finished = await db
    .select({ id: classSessions.id })
    .from(classSessions)
    .where(and(eq(classSessions.orgId, orgId), lte(classSessions.endsAt, now), eq(classSessions.status, "scheduled")));
  let marked = 0;
  for (const session of finished) {
    const rows = await db
      .select()
      .from(bookings)
      .where(and(eq(bookings.sessionId, session.id), eq(bookings.status, "booked")));
    for (const row of rows) {
      await db.update(bookings).set({ status: "no_show" }).where(eq(bookings.id, row.id));
      marked++;
    }
    await db.update(classSessions).set({ status: "completed" }).where(eq(classSessions.id, session.id));
  }
  return marked;
}

export async function sessionRoster(sessionId: string) {
  return db
    .select({
      booking: bookings,
      member: orgMembers,
      user: users,
    })
    .from(bookings)
    .innerJoin(orgMembers, eq(orgMembers.id, bookings.memberId))
    .innerJoin(users, eq(users.id, orgMembers.userId))
    .where(eq(bookings.sessionId, sessionId))
    .orderBy(asc(bookings.status), asc(bookings.position));
}

export async function upcomingSessions(orgId: string, opts?: { from?: Date; to?: Date; coachMemberId?: string }) {
  const from = opts?.from ?? new Date();
  const to = opts?.to ?? addDays(from, 14);
  return db
    .select({ session: classSessions, cls: classes })
    .from(classSessions)
    .innerJoin(classes, eq(classes.id, classSessions.classId))
    .where(
      and(
        eq(classSessions.orgId, orgId),
        gte(classSessions.startsAt, from),
        lte(classSessions.startsAt, to),
        eq(classSessions.status, "scheduled"),
        opts?.coachMemberId ? eq(classSessions.coachMemberId, opts.coachMemberId) : sql`1=1`,
      ),
    )
    .orderBy(asc(classSessions.startsAt));
}

export async function memberBookings(orgId: string, memberId: string, opts?: { upcomingOnly?: boolean }) {
  const now = new Date();
  return db
    .select({ booking: bookings, session: classSessions, cls: classes })
    .from(bookings)
    .innerJoin(classSessions, eq(classSessions.id, bookings.sessionId))
    .innerJoin(classes, eq(classes.id, classSessions.classId))
    .where(
      and(
        eq(bookings.orgId, orgId),
        eq(bookings.memberId, memberId),
        opts?.upcomingOnly
          ? and(gte(classSessions.startsAt, now), inArray(bookings.status, ["booked", "waitlisted"]))
          : ne(bookings.status, "cancelled"),
      ),
    )
    .orderBy(asc(classSessions.startsAt));
}

export async function attendanceHistory(orgId: string, memberId: string, limit = 30) {
  return db
    .select({ att: attendance, session: classSessions, cls: classes })
    .from(attendance)
    .leftJoin(classSessions, eq(classSessions.id, attendance.sessionId))
    .leftJoin(classes, eq(classes.id, classSessions.classId))
    .where(and(eq(attendance.orgId, orgId), eq(attendance.memberId, memberId)))
    .orderBy(sql`${attendance.checkedInAt} desc`)
    .limit(limit);
}

export async function todayAttendanceCount(orgId: string, now = new Date()) {
  const start = new Date(now);
  start.setHours(0, 0, 0, 0);
  const end = new Date(start);
  end.setDate(end.getDate() + 1);
  const rows = await db
    .select({ n: count() })
    .from(attendance)
    .where(and(eq(attendance.orgId, orgId), gte(attendance.checkedInAt, start), lte(attendance.checkedInAt, end)));
  return Number(rows[0]?.n ?? 0);
}

export async function activeBookingsForSession(sessionId: string) {
  return db
    .select()
    .from(bookings)
    .where(and(eq(bookings.sessionId, sessionId), inArray(bookings.status, ["booked", "attended"])));
}

export async function findMyActiveBooking(sessionId: string, memberId: string) {
  const rows = await db
    .select()
    .from(bookings)
    .where(
      and(
        eq(bookings.sessionId, sessionId),
        eq(bookings.memberId, memberId),
        inArray(bookings.status, ["booked", "waitlisted", "attended"]),
      ),
    )
    .limit(1);
  return rows[0] ?? null;
}
