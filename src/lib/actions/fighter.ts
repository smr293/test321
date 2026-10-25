"use server";

import { and, eq, sql } from "drizzle-orm";
import { redirect } from "next/navigation";
import { revalidatePath } from "next/cache";
import { db } from "@/db/client";
import {
  attendance,
  bookings,
  classSessions,
  classes,
  consents,
  dataRequests,
  fighterGoals,
  fighterProfiles,
  fightCamps,
  fightRecords,
  orgMembers,
  readinessCheckins,
  supportTickets,
  trainingSessions,
  users,
} from "@/db/schema";
import { audit } from "@/lib/audit";
import { BookingError, bookSession, cancelBooking, checkIn } from "@/lib/booking";
import { requireOrgPage, requireUser, effectivePermissions } from "@/lib/authz";
import { notify } from "@/lib/notifications";
import { parseForm, trainingSchema, fightRecordSchema, firstError } from "@/lib/validation";

function fail(path: string, message: string): never {
  redirect(`${path}?error=${encodeURIComponent(message)}`);
}
function done(path: string, message: string): never {
  redirect(`${path}?ok=${encodeURIComponent(message)}`);
}

async function fighterContext() {
  const ctx = await requireOrgPage();
  if (!ctx.membership) fail("/app/onboarding", "Join a gym first");
  if (ctx.membership.role === "owner" || ctx.membership.role === "manager" || ctx.membership.role === "coach") {
    // Staff can still use the training features with their own member record.
  }
  return ctx;
}

/* ------------------------------------------------------------------ */
/* Bookings                                                            */
/* ------------------------------------------------------------------ */

export async function bookClassAction(formData: FormData) {
  const ctx = await fighterContext();
  const sessionId = String(formData.get("sessionId") ?? "");
  const memberId = ctx.membership!.id;
  try {
    const result = await bookSession({ orgId: ctx.org.id, sessionId, memberId, source: "app" });
    done("/app/schedule", result.status === "waitlisted" ? `Class is full — you're #${result.position} on the waitlist` : "You're booked. See you on the mats!");
  } catch (error) {
    fail("/app/schedule", error instanceof BookingError ? error.message : "Could not complete the booking");
  }
}

export async function cancelMyBookingAction(formData: FormData) {
  const ctx = await fighterContext();
  const bookingId = String(formData.get("bookingId") ?? "");
  const booking = (
    await db
      .select()
      .from(bookings)
      .where(and(eq(bookings.id, bookingId), eq(bookings.orgId, ctx.org.id), eq(bookings.memberId, ctx.membership!.id)))
      .limit(1)
  )[0];
  if (!booking) fail("/app/schedule", "Booking not found");
  try {
    const result = await cancelBooking({ orgId: ctx.org.id, bookingId, actor: { id: ctx.user.id, name: ctx.user.name } });
    done("/app/schedule", result.late ? "Cancelled inside the window — recorded as a late cancellation" : "Booking cancelled");
  } catch (error) {
    fail("/app/schedule", error instanceof BookingError ? error.message : "Could not cancel");
  }
}

export async function selfCheckInAction(formData: FormData) {
  const ctx = await fighterContext();
  const sessionId = String(formData.get("sessionId") ?? "") || null;
  try {
    await checkIn({ orgId: ctx.org.id, sessionId, memberId: ctx.membership!.id, method: "self" });
    await audit({
      orgId: ctx.org.id,
      actor: { id: ctx.user.id, name: ctx.user.name, role: ctx.membership!.role },
      action: "attendance.self_checkin",
      targetType: "class_session",
      targetId: sessionId ?? undefined,
    });
    done("/app/schedule", "Checked in. Have a great session!");
  } catch (error) {
    fail("/app/schedule", error instanceof BookingError ? error.message : "Could not check in");
  }
}

/* ------------------------------------------------------------------ */
/* Training                                                            */
/* ------------------------------------------------------------------ */

export async function logTrainingAction(formData: FormData) {
  const ctx = await fighterContext();
  const parsed = parseForm(trainingSchema, formData);
  if (!parsed.success) fail("/app/progress", firstError(parsed.error));
  const input = parsed.data;
  const created = (
    await db
      .insert(trainingSessions)
      .values({
        orgId: ctx.org.id,
        memberId: ctx.membership!.id,
        type: input.type,
        date: input.date ? new Date(input.date) : new Date(),
        durationMinutes: input.durationMinutes,
        intensity: input.intensity,
        rpe: input.rpe ?? null,
        notes: input.notes || null,
      })
      .returning()
  )[0];
  await audit({
    orgId: ctx.org.id,
    actor: { id: ctx.user.id, name: ctx.user.name },
    action: "training.logged",
    targetType: "training_session",
    targetId: created.id,
    meta: { type: input.type, minutes: input.durationMinutes },
  });
  const back = String(formData.get("returnTo") ?? "/app/progress");
  done(back, `Logged ${input.type} · ${input.durationMinutes} min · ${input.intensity}`);
}

export async function deleteTrainingAction(formData: FormData) {
  const ctx = await fighterContext();
  const id = String(formData.get("sessionId") ?? "");
  await db
    .delete(trainingSessions)
    .where(and(eq(trainingSessions.id, id), eq(trainingSessions.memberId, ctx.membership!.id), eq(trainingSessions.orgId, ctx.org.id)));
  done("/app/progress", "Training entry deleted");
}

export async function createGoalAction(formData: FormData) {
  const ctx = await fighterContext();
  const title = String(formData.get("title") ?? "").trim();
  if (title.length < 2) fail("/app/progress", "Give your goal a name");
  await db.insert(fighterGoals).values({
    orgId: ctx.org.id,
    memberId: ctx.membership!.id,
    title,
    target: String(formData.get("target") ?? "") || null,
    dueDate: formData.get("dueDate") ? new Date(String(formData.get("dueDate"))) : null,
  });
  done("/app/progress", "Goal added");
}

export async function updateGoalAction(formData: FormData) {
  const ctx = await fighterContext();
  const id = String(formData.get("goalId") ?? "");
  const progress = Math.max(0, Math.min(100, Number(formData.get("progress") ?? 0)));
  await db
    .update(fighterGoals)
    .set({ progress, status: progress >= 100 ? "done" : "open", updatedAt: new Date() })
    .where(and(eq(fighterGoals.id, id), eq(fighterGoals.memberId, ctx.membership!.id), eq(fighterGoals.orgId, ctx.org.id)));
  done("/app/progress", progress >= 100 ? "Goal completed — nice work" : "Goal updated");
}

export async function deleteGoalAction(formData: FormData) {
  const ctx = await fighterContext();
  const id = String(formData.get("goalId") ?? "");
  await db
    .delete(fighterGoals)
    .where(and(eq(fighterGoals.id, id), eq(fighterGoals.memberId, ctx.membership!.id), eq(fighterGoals.orgId, ctx.org.id)));
  done("/app/progress", "Goal removed");
}

export async function addMyFightRecordAction(formData: FormData) {
  const ctx = await fighterContext();
  const parsed = parseForm(fightRecordSchema, formData);
  if (!parsed.success) fail("/app/fights", firstError(parsed.error));
  const r = parsed.data;
  await db.insert(fightRecords).values({
    orgId: ctx.org.id,
    fighterMemberId: ctx.membership!.id,
    result: r.result,
    method: r.method || null,
    opponent: r.opponent,
    eventName: r.eventName || null,
    fightDate: new Date(r.fightDate),
    weightClass: r.weightClass || null,
    rounds: r.rounds ?? null,
    roundEnded: r.roundEnded ?? null,
    level: r.level,
    notes: r.notes || null,
    verified: false,
    createdById: ctx.user.id,
  });
  const coaches = await db
    .select({ userId: orgMembers.userId })
    .from(orgMembers)
    .where(and(eq(orgMembers.orgId, ctx.org.id), eq(orgMembers.role, "coach")))
    .limit(3);
  for (const coach of coaches) {
    await notify({
      userId: coach.userId,
      orgId: ctx.org.id,
      type: "system",
      title: "Fight result needs verification",
      body: `${ctx.user.name} added ${r.result} vs ${r.opponent}.`,
      link: `/gym/fighters/${ctx.membership!.id}`,
      dedupeKey: `verify-${ctx.membership!.id}-${Date.now()}`,
    });
  }
  done("/app/fights", "Result added — pending coach verification");
}

export async function readinessCheckInAction(formData: FormData) {
  const ctx = await fighterContext();
  const camp = (
    await db
      .select()
      .from(fightCamps)
      .where(and(eq(fightCamps.orgId, ctx.org.id), eq(fightCamps.fighterMemberId, ctx.membership!.id), eq(fightCamps.status, "active")))
      .limit(1)
  )[0];
  const clamp = (v: unknown) => Math.max(1, Math.min(10, Number(v ?? 5)));
  await db.insert(readinessCheckins).values({
    orgId: ctx.org.id,
    campId: camp?.id ?? null,
    memberId: ctx.membership!.id,
    date: new Date(),
    sleep: clamp(formData.get("sleep")),
    soreness: clamp(formData.get("soreness")),
    energy: clamp(formData.get("energy")),
    mood: clamp(formData.get("mood")),
    weightKg: formData.get("weightKg") ? Number(formData.get("weightKg")) : null,
    notes: String(formData.get("notes") ?? "") || null,
  });
  done("/app/fights", "Readiness check-in saved");
}

export async function toggleCampTaskAction(formData: FormData) {
  const ctx = await fighterContext();
  const campId = String(formData.get("campId") ?? "");
  const index = Number(formData.get("index") ?? -1);
  const camp = (
    await db
      .select()
      .from(fightCamps)
      .where(and(eq(fightCamps.id, campId), eq(fightCamps.orgId, ctx.org.id), eq(fightCamps.fighterMemberId, ctx.membership!.id)))
      .limit(1)
  )[0];
  if (!camp) fail("/app/fights", "Camp not found");
  let items: { label: string; done: boolean }[] = [];
  try {
    items = JSON.parse(camp!.checklist ?? "[]");
  } catch {
    items = [];
  }
  if (items[index]) items[index].done = !items[index].done;
  await db.update(fightCamps).set({ checklist: JSON.stringify(items) }).where(eq(fightCamps.id, campId));
  done("/app/fights", "Checklist updated");
}

/* ------------------------------------------------------------------ */
/* Profile, consents, privacy                                          */
/* ------------------------------------------------------------------ */

export async function updateFighterProfileAction(formData: FormData) {
  const ctx = await fighterContext();
  const profile = (await db.select().from(fighterProfiles).where(eq(fighterProfiles.memberId, ctx.membership!.id)).limit(1))[0];
  const publicProfile = formData.get("publicProfile") === "on";
  const values = {
    nickname: String(formData.get("nickname") ?? "") || null,
    discipline: String(formData.get("discipline") ?? "") || null,
    weightClass: String(formData.get("weightClass") ?? "") || null,
    currentWeightKg: formData.get("currentWeightKg") ? Number(formData.get("currentWeightKg")) : null,
    targetWeightKg: formData.get("targetWeightKg") ? Number(formData.get("targetWeightKg")) : null,
    heightCm: formData.get("heightCm") ? Number(formData.get("heightCm")) : null,
    stance: String(formData.get("stance") ?? "") || null,
    goals: String(formData.get("goals") ?? "") || null,
    publicProfile,
    publicConsentAt: publicProfile ? (profile?.publicConsentAt ?? new Date()) : null,
    guardianName: String(formData.get("guardianName") ?? "") || null,
    guardianPhone: String(formData.get("guardianPhone") ?? "") || null,
  };
  if (profile) {
    await db.update(fighterProfiles).set(values).where(eq(fighterProfiles.id, profile.id));
  } else {
    await db.insert(fighterProfiles).values({ orgId: ctx.org.id, memberId: ctx.membership!.id, ...values });
  }
  await audit({
    orgId: ctx.org.id,
    actor: { id: ctx.user.id, name: ctx.user.name },
    action: "fighter.profile_updated",
    targetType: "org_member",
    targetId: ctx.membership!.id,
  });
  done("/app/profile", "Profile updated");
}

export async function updateMyAccountAction(formData: FormData) {
  const auth = await requireUser();
  const name = String(formData.get("name") ?? "").trim();
  if (name.length < 2) fail("/app/profile", "Enter your name");
  await db
    .update(users)
    .set({
      name,
      phone: String(formData.get("phone") ?? "") || null,
      dateOfBirth: formData.get("dateOfBirth") ? new Date(String(formData.get("dateOfBirth"))) : null,
      emergencyContactName: String(formData.get("emergencyContactName") ?? "") || null,
      emergencyContactPhone: String(formData.get("emergencyContactPhone") ?? "") || null,
      address: String(formData.get("address") ?? "") || null,
    })
    .where(eq(users.id, auth.user.id));
  done("/app/profile", "Account details saved");
}

export async function recordConsentsAction(formData: FormData) {
  const auth = await requireUser();
  const types: { key: string; type: string }[] = [
    { key: "terms", type: "terms" },
    { key: "privacy", type: "privacy" },
    { key: "photo", type: "photo" },
    { key: "marketing", type: "marketing" },
  ];
  for (const { key, type } of types) {
    const granted = formData.get(key) === "on";
    const existing = (
      await db
        .select()
        .from(consents)
        .where(and(eq(consents.userId, auth.user.id), eq(consents.type, type)))
        .limit(1)
    )[0];
    if (existing) {
      await db
        .update(consents)
        .set({ granted, grantedAt: granted ? new Date() : existing.grantedAt, revokedAt: granted ? null : new Date() })
        .where(eq(consents.id, existing.id));
    } else {
      await db.insert(consents).values({ userId: auth.user.id, type, granted, grantedAt: granted ? new Date() : null });
    }
  }
  await db.update(users).set({ marketingOptIn: formData.get("marketing") === "on" }).where(eq(users.id, auth.user.id));
  done("/app/profile", "Consent preferences updated");
}

export async function requestDataExportAction() {
  const auth = await requireUser();
  await db.insert(dataRequests).values({ userId: auth.user.id, type: "export" });
  await audit({ actor: { id: auth.user.id, name: auth.user.name }, action: "privacy.export_requested", targetType: "user", targetId: auth.user.id });
  done("/app/profile", "Export requested. We'll email a copy of your data.");
}

export async function requestAccountDeletionAction() {
  const auth = await requireUser();
  await db.insert(dataRequests).values({ userId: auth.user.id, type: "deletion", notes: "Member requested deletion from profile" });
  await db.update(users).set({ status: "pending_deletion" }).where(eq(users.id, auth.user.id));
  await audit({ actor: { id: auth.user.id, name: auth.user.name }, action: "privacy.deletion_requested", targetType: "user", targetId: auth.user.id });
  redirect("/login?info=Your+deletion+request+is+recorded.+You+have+been+signed+out.");
}

export async function fighterSupportTicketAction(formData: FormData) {
  const auth = await requireUser();
  const subject = String(formData.get("subject") ?? "").trim();
  const body = String(formData.get("body") ?? "").trim();
  if (!subject || !body) fail("/app/support", "Add a subject and a message");
  const membership = (await db.select().from(orgMembers).where(eq(orgMembers.userId, auth.user.id)).limit(1))[0];
  await db.insert(supportTickets).values({
    orgId: membership?.orgId ?? null,
    userId: auth.user.id,
    subject,
    body,
    priority: (String(formData.get("priority") ?? "normal") as "low" | "normal" | "high" | "urgent"),
  });
  done("/app/support", "Message sent to support");
}

export async function completeFighterOnboardingAction(formData: FormData) {
  const auth = await requireUser();
  const ctx = await requireOrgPage();
  if (!auth) fail("/login", "Please sign in");
  const phone = String(formData.get("phone") ?? "") || null;
  const dateOfBirth = formData.get("dateOfBirth") ? new Date(String(formData.get("dateOfBirth"))) : null;
  await db.update(users).set({ phone, dateOfBirth }).where(eq(users.id, auth.user.id));
  if (ctx.membership) {
    const profile = (await db.select().from(fighterProfiles).where(eq(fighterProfiles.memberId, ctx.membership.id)).limit(1))[0];
    const values = {
      discipline: String(formData.get("discipline") ?? "") || null,
      weightClass: String(formData.get("weightClass") ?? "") || null,
      currentWeightKg: formData.get("currentWeightKg") ? Number(formData.get("currentWeightKg")) : null,
      goals: String(formData.get("goals") ?? "") || null,
    };
    if (profile) await db.update(fighterProfiles).set(values).where(eq(fighterProfiles.id, profile.id));
    else await db.insert(fighterProfiles).values({ orgId: ctx.org.id, memberId: ctx.membership.id, ...values });
  }
  done("/app", "You're all set. Welcome to the mats!");
}

export async function syncMyAttendanceAction() {
  const ctx = await fighterContext();
  const rows = await db
    .select({ sessionId: bookings.sessionId, status: bookings.status })
    .from(bookings)
    .innerJoin(classSessions, eq(classSessions.id, bookings.sessionId))
    .where(and(eq(bookings.memberId, ctx.membership!.id), eq(bookings.status, "attended")));
  let created = 0;
  for (const row of rows) {
    const exists = await db
      .select({ id: attendance.id })
      .from(attendance)
      .where(and(eq(attendance.memberId, ctx.membership!.id), eq(attendance.sessionId, row.sessionId)))
      .limit(1);
    if (!exists[0]) {
      await db.insert(attendance).values({
        orgId: ctx.org.id,
        memberId: ctx.membership!.id,
        sessionId: row.sessionId,
        method: "self",
      });
      created++;
    }
  }
  revalidatePath("/app/progress");
  done("/app/progress", created ? `Synced ${created} attendance records` : "Attendance already up to date");
}

export async function refreshPermissionSet() {
  const ctx = await requireOrgPage();
  return [...effectivePermissions(ctx.role, ctx.membership?.permissions ?? null)];
}

export const _unusedSql = sql;

/* ------------------------------------------------------------------ */
/* Membership requests & payments                                      */
/* ------------------------------------------------------------------ */

export async function requestMembershipChangeAction(formData: FormData) {
  const ctx = await fighterContext();
  const request = String(formData.get("request") ?? "cancel");
  const message = String(formData.get("message") ?? "");
  const owners = await db
    .select({ userId: orgMembers.userId })
    .from(orgMembers)
    .where(and(eq(orgMembers.orgId, ctx.org.id), eq(orgMembers.role, "owner")));
  for (const owner of owners) {
    await notify({
      userId: owner.userId,
      orgId: ctx.org.id,
      type: "membership",
      title: `Membership request: ${request}`,
      body: `${ctx.user.name}: ${message || "No message"}`,
      link: `/gym/members/${ctx.membership!.id}`,
      dedupeKey: `membership-request-${ctx.membership!.id}-${Date.now()}`,
      email: true,
    });
  }
  await db.insert(supportTickets).values({
    orgId: ctx.org.id,
    userId: ctx.user.id,
    subject: `Membership request: ${request}`,
    body: message || `Member requested: ${request}`,
    priority: "normal",
    status: "open",
  });
  await audit({
    orgId: ctx.org.id,
    actor: { id: ctx.user.id, name: ctx.user.name },
    action: `membership.request.${request}`,
    targetType: "org_member",
    targetId: ctx.membership!.id,
  });
  done("/app/membership", "Request sent to your gym. They'll get back to you.");
}

export async function payInvoiceAction(formData: FormData) {
  const ctx = await fighterContext();
  const invoiceId = String(formData.get("invoiceId") ?? "");
  const { invoices } = await import("@/db/schema");
  const invoice = (
    await db
      .select()
      .from(invoices)
      .where(and(eq(invoices.id, invoiceId), eq(invoices.orgId, ctx.org.id), eq(invoices.memberId, ctx.membership!.id)))
      .limit(1)
  )[0];
  if (!invoice) fail("/app/billing", "Invoice not found");
  if (invoice!.status === "paid") done("/app/billing", "This invoice is already paid");

  const { stripeEnabled, createCheckoutSession } = await import("@/lib/billing/stripe");
  if (stripeEnabled()) {
    try {
      const session = await createCheckoutSession({
        priceId: "",
        mode: "payment",
        customerEmail: ctx.user.email,
        successUrl: `${process.env.APP_URL ?? "http://localhost:3000"}/app/billing?ok=Payment+received`,
        cancelUrl: `${process.env.APP_URL ?? "http://localhost:3000"}/app/billing`,
        clientReferenceId: invoice!.id,
      });
      redirect(session.url);
    } catch {
      fail("/app/billing", "Could not start checkout. Please try again or pay at the gym.");
    }
  }

  // Sandbox provider: creates a clearly-labelled test payment, never a real charge.
  const { recordPayment } = await import("@/lib/membership");
  await recordPayment({
    orgId: ctx.org.id,
    invoiceId: invoice!.id,
    amountCents: invoice!.amountCents,
    provider: "sandbox",
    providerPaymentId: `sandbox_${invoice!.id}`,
    method: "sandbox_card",
  });
  done("/app/billing", "Test payment recorded (sandbox mode — no money moved)");
}
