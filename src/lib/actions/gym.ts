"use server";

import crypto from "node:crypto";
import { and, eq, inArray, isNull, sql } from "drizzle-orm";
import { cookies } from "next/headers";
import { redirect } from "next/navigation";
import { revalidatePath } from "next/cache";
import { db } from "@/db/client";
import {
  announcements,
  bookings,
  classSessions,
  classes,
  coachAssignments,
  coachNotes,
  fightCamps,
  fighterProfiles,
  fightRecords,
  gymLocations,
  invitations,
  invoices,
  membershipPlans,
  messages,
  orgMembers,
  organizations,
  saasPlans,
  saasSubscriptions,
  subscriptions,
  trainingPrograms,
  programAssignments,
  users,
} from "@/db/schema";
import { audit } from "@/lib/audit";
import {
  AuthError,
  getOrgContext,
  requireOrgPermission,
  requireUser,
  getCoachAthleteIds,
  type OrgContext,
} from "@/lib/authz";
import { BookingError, bookSession, cancelBooking, checkIn, generateAllSessions, generateSessions, verifyQrToken } from "@/lib/booking";
import { getEntitlements } from "@/lib/entitlements";
import { env, ORG_COOKIE } from "@/lib/env";
import {
  addCredits,
  cancelMembership,
  createInvoiceForSubscription,
  createMembership,
  extendMembership,
  pauseMembership,
  refundPayment,
  resumeMembership,
  schedulePlanChange,
  setSubscriptionStatus,
} from "@/lib/membership";
import { hashPassword } from "@/lib/password";
import { notify } from "@/lib/notifications";
import { sendEmail } from "@/lib/email";
import { getSession, newToken } from "@/lib/session";
import { addDays, parseJson } from "@/lib/utils";
import { firstError, parseForm, classSchema, memberSchema, planSchema, fightCampSchema, fightRecordSchema } from "@/lib/validation";

function orgIdFrom(formData: FormData) {
  const id = String(formData.get("orgId") ?? "");
  if (!id) redirect("/gym?error=Missing+gym+context");
  return id;
}

function actor(ctx: OrgContext) {
  return { id: ctx.user.id, name: ctx.user.name, role: ctx.role };
}

function fail(path: string, message: string): never {
  redirect(`${path}?error=${encodeURIComponent(message)}`);
}

function done(path: string, message: string): never {
  redirect(`${path}?ok=${encodeURIComponent(message)}`);
}

/** Uniform error handling for actions that touch domain services. */
async function guard<T>(path: string, fn: () => Promise<T>): Promise<T> {
  try {
    return await fn();
  } catch (error) {
    if (error instanceof AuthError) fail(path, error.message);
    if (error instanceof BookingError) fail(path, error.message);
    if ((error as { digest?: string }).digest?.startsWith("NEXT_REDIRECT")) throw error;
    console.error("[gym action]", error);
    fail(path, (error as Error).message || "Something went wrong");
  }
  throw new Error("unreachable");
}

/* ------------------------------------------------------------------ */
/* Members                                                             */
/* ------------------------------------------------------------------ */

export async function addMemberAction(formData: FormData) {
  const orgId = orgIdFrom(formData);
  const ctx = await requireOrgPermission(orgId, "members:write");
  const parsed = parseForm(memberSchema, formData);
  if (!parsed.success) fail("/gym/members", firstError(parsed.error));
  const input = parsed.data;

  await guard("/gym/members", async () => {
    const ent = await getEntitlements(orgId);
    if (!ent.canAddMember) throw new Error(`Your ${ent.planName} plan is limited to ${ent.maxActiveMembers} active members. Upgrade to add more.`);

    let user = (await db.select().from(users).where(eq(users.email, input.email)).limit(1))[0];
    let invited = false;
    if (!user) {
      const tempPassword = crypto.randomBytes(24).toString("base64url");
      user = (
        await db
          .insert(users)
          .values({
            email: input.email,
            name: input.name,
            passwordHash: await hashPassword(tempPassword),
            phone: input.phone || null,
            mustChangePassword: false,
          })
          .returning()
      )[0];
      invited = true;
    }
    const exists = (
      await db
        .select()
        .from(orgMembers)
        .where(and(eq(orgMembers.orgId, orgId), eq(orgMembers.userId, user.id)))
        .limit(1)
    )[0];
    if (exists && !exists.archivedAt) throw new Error("This person is already a member of your gym");
    const member = exists
      ? (
          await db
            .update(orgMembers)
            .set({ archivedAt: null, status: "active", role: input.role, notes: input.notes || null })
            .where(eq(orgMembers.id, exists.id))
            .returning()
        )[0]
      : (
          await db
            .insert(orgMembers)
            .values({
              orgId,
              userId: user.id,
              role: input.role,
              locationId: input.locationId || (ctx.locations[0]?.id ?? null),
              status: "active",
              joinedAt: new Date(),
              notes: input.notes || null,
              title: input.role === "coach" ? "Coach" : null,
            })
            .returning()
        )[0];

    if (input.role === "fighter" && input.planId) {
      await createMembership({
        orgId,
        memberId: member.id,
        planId: input.planId,
        createdById: ctx.user.id,
      });
    }

    if (invited || input.sendInvite) {
      const token = newToken();
      await db.insert(invitations).values({
        orgId,
        email: user.email,
        role: input.role,
        token,
        invitedById: ctx.user.id,
        expiresAt: addDays(new Date(), 14),
      });
      await sendEmail({
        to: user.email,
        subject: `You're invited to ${ctx.org.name} on MMA OS`,
        body: `Hi ${user.name},\n\n${ctx.user.name} added you to ${ctx.org.name} on MMA OS.\n\nSet your password and sign in: ${env.appUrl}/join/${token}\n\nThis link expires in 14 days.`,
        template: "member_invite",
      });
      await notify({
        userId: user.id,
        orgId,
        type: "system",
        title: `Welcome to ${ctx.org.name}`,
        body: "Your member account is ready. Set a password from your invite email.",
        link: `/join/${token}`,
        dedupeKey: `invite-${token}`,
        email: false,
        force: true,
      });
    }

    await audit({
      orgId,
      actor: actor(ctx),
      action: "member.created",
      targetType: "org_member",
      targetId: member.id,
      meta: { role: input.role, invited },
    });
    done(`/gym/members/${member.id}`, invited ? "Member added. Invite email queued." : "Member added");
  });
}

export async function inviteMemberAction(formData: FormData) {
  const orgId = orgIdFrom(formData);
  const ctx = await requireOrgPermission(orgId, "members:write");
  const email = String(formData.get("email") ?? "").trim().toLowerCase();
  const role = String(formData.get("role") ?? "fighter") as "fighter" | "coach" | "manager";
  if (!email.includes("@")) fail("/gym/members", "Enter a valid email address");
  await guard("/gym/members", async () => {
    const token = newToken();
    await db.insert(invitations).values({
      orgId,
      email,
      role,
      token,
      invitedById: ctx.user.id,
      expiresAt: addDays(new Date(), 14),
    });
    await sendEmail({
      to: email,
      subject: `Join ${ctx.org.name} on MMA OS`,
      body: `You've been invited to join ${ctx.org.name} as a ${role}.\n\nAccept: ${env.appUrl}/join/${token}\n\nExpires in 14 days.`,
      template: "invite",
    });
    await audit({ orgId, actor: actor(ctx), action: "member.invited", targetType: "invitation", meta: { email, role } });
    done("/gym/members", `Invitation sent to ${email}`);
  });
}

export async function revokeInvitationAction(formData: FormData) {
  const orgId = orgIdFrom(formData);
  const ctx = await requireOrgPermission(orgId, "members:write");
  const id = String(formData.get("invitationId") ?? "");
  await db
    .update(invitations)
    .set({ revokedAt: new Date() })
    .where(and(eq(invitations.id, id), eq(invitations.orgId, orgId)));
  await audit({ orgId, actor: actor(ctx), action: "invitation.revoked", targetType: "invitation", targetId: id });
  done("/gym/members", "Invitation revoked");
}

export async function importMembersAction(formData: FormData) {
  const orgId = orgIdFrom(formData);
  const ctx = await requireOrgPermission(orgId, "members:write");
  const csv = String(formData.get("csv") ?? "");
  if (!csv.trim()) fail("/gym/members/import", "Paste or upload a CSV first");

  await guard("/gym/members/import", async () => {
    const ent = await getEntitlements(orgId);
    const lines = csv.split(/\r?\n/).filter((l) => l.trim());
    const header = lines[0].toLowerCase();
    const start = header.includes("email") ? 1 : 0;
    let created = 0;
    let skipped = 0;
    for (const line of lines.slice(start)) {
      const parts = line.split(",").map((p) => p.trim().replace(/^"|"$/g, ""));
      const [emailRaw, nameRaw, phoneRaw] = parts;
      const email = emailRaw?.toLowerCase();
      if (!email || !email.includes("@") || !nameRaw) {
        skipped++;
        continue;
      }
      if (ent.usage.activeMembers + created >= ent.maxActiveMembers) {
        throw new Error(`Plan limit reached (${ent.maxActiveMembers} members). Upgrade before importing more.`);
      }
      const existing = (await db.select().from(users).where(eq(users.email, email)).limit(1))[0];
      const user =
        existing ??
        (
          await db
            .insert(users)
            .values({
              email,
              name: nameRaw,
              phone: phoneRaw || null,
              passwordHash: await hashPassword(crypto.randomBytes(24).toString("base64url")),
            })
            .returning()
        )[0];
      const already = (
        await db.select().from(orgMembers).where(and(eq(orgMembers.orgId, orgId), eq(orgMembers.userId, user.id))).limit(1)
      )[0];
      if (already) {
        skipped++;
        continue;
      }
      await db.insert(orgMembers).values({
        orgId,
        userId: user.id,
        role: "fighter",
        status: "active",
        joinedAt: new Date(),
        locationId: ctx.locations[0]?.id ?? null,
      });
      created++;
    }
    await audit({
      orgId,
      actor: actor(ctx),
      action: "member.imported",
      targetType: "organization",
      targetId: orgId,
      meta: { created, skipped },
    });
    done("/gym/members", `Imported ${created} members${skipped ? `, skipped ${skipped}` : ""}`);
  });
}

export async function updateMemberAction(formData: FormData) {
  const orgId = orgIdFrom(formData);
  const ctx = await requireOrgPermission(orgId, "members:write");
  const memberId = String(formData.get("memberId") ?? "");
  await guard(`/gym/members/${memberId}`, async () => {
    const target = (
      await db
        .select({ member: orgMembers, user: users })
        .from(orgMembers)
        .innerJoin(users, eq(users.id, orgMembers.userId))
        .where(and(eq(orgMembers.id, memberId), eq(orgMembers.orgId, orgId)))
        .limit(1)
    )[0];
    if (!target) throw new Error("Member not found in this gym");

    const name = String(formData.get("name") ?? target.user.name).trim();
    const email = String(formData.get("email") ?? target.user.email).trim().toLowerCase();
    if (email !== target.user.email) {
      const clash = (await db.select({ id: users.id }).from(users).where(eq(users.email, email)).limit(1))[0];
      if (clash) throw new Error("That email is already in use");
    }
    await db
      .update(users)
      .set({
        name,
        email,
        phone: String(formData.get("phone") ?? "") || null,
        dateOfBirth: formData.get("dateOfBirth") ? new Date(String(formData.get("dateOfBirth"))) : null,
        emergencyContactName: String(formData.get("emergencyContactName") ?? "") || null,
        emergencyContactPhone: String(formData.get("emergencyContactPhone") ?? "") || null,
      })
      .where(eq(users.id, target.user.id));
    await db
      .update(orgMembers)
      .set({
        locationId: String(formData.get("locationId") ?? "") || null,
        title: String(formData.get("title") ?? "") || null,
        notes: String(formData.get("notes") ?? "") || null,
        status: (String(formData.get("status") ?? target.member.status) as "active" | "inactive" | "invited"),
      })
      .where(eq(orgMembers.id, memberId));

    // Fighter profile details (sensitive: staff only)
    if (target.member.role === "fighter") {
      const profile = (await db.select().from(fighterProfiles).where(eq(fighterProfiles.memberId, memberId)).limit(1))[0];
      const values = {
        discipline: String(formData.get("discipline") ?? "") || null,
        weightClass: String(formData.get("weightClass") ?? "") || null,
        level: (String(formData.get("level") ?? "beginner") as "beginner" | "intermediate" | "advanced" | "competitor"),
        currentWeightKg: formData.get("currentWeightKg") ? Number(formData.get("currentWeightKg")) : null,
        heightCm: formData.get("heightCm") ? Number(formData.get("heightCm")) : null,
        goals: String(formData.get("goals") ?? "") || null,
        guardianName: String(formData.get("guardianName") ?? "") || null,
        guardianPhone: String(formData.get("guardianPhone") ?? "") || null,
        isMinor: formData.get("isMinor") === "on",
      };
      if (profile) {
        await db.update(fighterProfiles).set(values).where(eq(fighterProfiles.id, profile.id));
      } else {
        await db.insert(fighterProfiles).values({ orgId, memberId, ...values });
      }
    }
    await audit({ orgId, actor: actor(ctx), action: "member.updated", targetType: "org_member", targetId: memberId });
    done(`/gym/members/${memberId}`, "Member updated");
  });
}

export async function archiveMemberAction(formData: FormData) {
  const orgId = orgIdFrom(formData);
  const ctx = await requireOrgPermission(orgId, "members:write");
  const memberId = String(formData.get("memberId") ?? "");
  await guard("/gym/members", async () => {
    if (memberId === ctx.membership?.id) throw new Error("You cannot archive your own account");
    await db
      .update(orgMembers)
      .set({ archivedAt: new Date(), status: "archived" })
      .where(and(eq(orgMembers.id, memberId), eq(orgMembers.orgId, orgId)));
    await db
      .update(subscriptions)
      .set({ status: "cancelled", cancelledAt: new Date(), autoRenew: false })
      .where(and(eq(subscriptions.memberId, memberId), eq(subscriptions.orgId, orgId), inArray(subscriptions.status, ["active", "trial", "paused", "past_due"])));
    await audit({ orgId, actor: actor(ctx), action: "member.archived", targetType: "org_member", targetId: memberId });
    done("/gym/members", "Member archived");
  });
}

export async function restoreMemberAction(formData: FormData) {
  const orgId = orgIdFrom(formData);
  const ctx = await requireOrgPermission(orgId, "members:write");
  const memberId = String(formData.get("memberId") ?? "");
  await db
    .update(orgMembers)
    .set({ archivedAt: null, status: "active" })
    .where(and(eq(orgMembers.id, memberId), eq(orgMembers.orgId, orgId)));
  await audit({ orgId, actor: actor(ctx), action: "member.restored", targetType: "org_member", targetId: memberId });
  done(`/gym/members/${memberId}`, "Member restored");
}

export async function setMemberRoleAction(formData: FormData) {
  const orgId = orgIdFrom(formData);
  const ctx = await requireOrgPermission(orgId, "staff:manage");
  const memberId = String(formData.get("memberId") ?? "");
  const role = String(formData.get("role") ?? "") as "manager" | "coach" | "fighter";
  if (!["manager", "coach", "fighter"].includes(role)) fail(`/gym/members/${memberId}`, "Invalid role");
  if (role === "manager") {
    const ent = await getEntitlements(orgId);
    if (!ent.features.includes("analytics")) fail(`/gym/members/${memberId}`, "Managers require the Pro plan or higher");
  }
  await db
    .update(orgMembers)
    .set({ role })
    .where(and(eq(orgMembers.id, memberId), eq(orgMembers.orgId, orgId)))
    .returning();
  await audit({ orgId, actor: actor(ctx), action: "member.role_changed", targetType: "org_member", targetId: memberId, meta: { role } });
  done(`/gym/members/${memberId}`, `Role updated to ${role}`);
}

export async function updateStaffPermissionsAction(formData: FormData) {
  const orgId = orgIdFrom(formData);
  const ctx = await requireOrgPermission(orgId, "staff:manage");
  const memberId = String(formData.get("memberId") ?? "");
  const permissions = formData.getAll("permissions").map(String);
  await db
    .update(orgMembers)
    .set({ permissions: JSON.stringify(permissions) })
    .where(and(eq(orgMembers.id, memberId), eq(orgMembers.orgId, orgId), eq(orgMembers.role, "manager")));
  await audit({ orgId, actor: actor(ctx), action: "staff.permissions_updated", targetType: "org_member", targetId: memberId, meta: { permissions } });
  done("/gym/settings/team", "Manager permissions saved");
}

/* ------------------------------------------------------------------ */
/* Coach ↔ athlete                                                     */
/* ------------------------------------------------------------------ */

export async function assignCoachAction(formData: FormData) {
  const orgId = orgIdFrom(formData);
  const ctx = await requireOrgPermission(orgId, "coaches:manage");
  const coachMemberId = String(formData.get("coachMemberId") ?? "");
  const fighterMemberId = String(formData.get("fighterMemberId") ?? "");
  await guard("/gym/coaches", async () => {
    if (!coachMemberId) throw new Error("Choose a coach");
    const coach = (await db.select().from(orgMembers).where(and(eq(orgMembers.id, coachMemberId), eq(orgMembers.orgId, orgId))).limit(1))[0];
    const fighter = (await db.select().from(orgMembers).where(and(eq(orgMembers.id, fighterMemberId), eq(orgMembers.orgId, orgId))).limit(1))[0];
    if (!coach || coach.role !== "coach") throw new Error("Coach not found in this gym");
    if (!fighter) throw new Error("Fighter not found in this gym");
    await db
      .insert(coachAssignments)
      .values({
        orgId,
        coachMemberId,
        fighterMemberId,
        isPrimary: formData.get("isPrimary") === "on",
        focus: String(formData.get("focus") ?? "") || null,
        assignedById: ctx.user.id,
      })
      .onConflictDoUpdate({
        target: [coachAssignments.coachMemberId, coachAssignments.fighterMemberId],
        set: { isPrimary: formData.get("isPrimary") === "on", focus: String(formData.get("focus") ?? "") || null },
      });
    await audit({ orgId, actor: actor(ctx), action: "coach.assigned", targetType: "org_member", targetId: fighterMemberId, meta: { coachMemberId } });
    done(`/gym/fighters/${fighterMemberId}`, "Coach assigned");
  });
}

export async function unassignCoachAction(formData: FormData) {
  const orgId = orgIdFrom(formData);
  const ctx = await requireOrgPermission(orgId, "coaches:manage");
  const id = String(formData.get("assignmentId") ?? "");
  await db.delete(coachAssignments).where(and(eq(coachAssignments.id, id), eq(coachAssignments.orgId, orgId)));
  await audit({ orgId, actor: actor(ctx), action: "coach.unassigned", targetType: "coach_assignment", targetId: id });
  done(String(formData.get("returnTo") ?? "/gym/coaches"), "Coach unassigned");
}

export async function addCoachNoteAction(formData: FormData) {
  const orgId = orgIdFrom(formData);
  const ctx = await requireOrgPermission(orgId, "fighters:read");
  const fighterMemberId = String(formData.get("fighterMemberId") ?? "");
  const body = String(formData.get("body") ?? "").trim();
  if (!body) fail(`/gym/fighters/${fighterMemberId}`, "Write a note first");
  if (ctx.role !== "coach" && !ctx.permissions.has("fightcamps:manage")) {
    fail(`/gym/fighters/${fighterMemberId}`, "Only coaches can add coaching notes");
  }
  const coachMember = ctx.membership;
  if (!coachMember) fail(`/gym/fighters/${fighterMemberId}`, "Coach profile required");
  if (ctx.role === "coach") {
    const athleteIds = await getCoachAthleteIds(orgId, coachMember.id);
    if (!athleteIds.includes(fighterMemberId)) fail(`/gym/fighters/${fighterMemberId}`, "You can only add notes for athletes assigned to you.");
  }
  await db.insert(coachNotes).values({
    orgId,
    coachMemberId: coachMember.id,
    fighterMemberId,
    body,
    visibility: (String(formData.get("visibility") ?? "staff") as "private" | "staff" | "fighter"),
  });
  if (String(formData.get("visibility")) === "fighter") {
    const target = (await db.select().from(orgMembers).where(and(eq(orgMembers.id, fighterMemberId), eq(orgMembers.orgId, orgId))).limit(1))[0];
    if (target) {
      await notify({
        userId: target.userId,
        orgId,
        type: "system",
        title: "New note from your coach",
        body: body.slice(0, 140),
        link: "/app/progress",
        dedupeKey: `coach-note-${Date.now()}`,
      });
    }
  }
  await audit({ orgId, actor: actor(ctx), action: "coach.note_added", targetType: "org_member", targetId: fighterMemberId });
  done(`/gym/fighters/${fighterMemberId}`, "Note saved");
}

/* ------------------------------------------------------------------ */
/* Membership plans                                                    */
/* ------------------------------------------------------------------ */

export async function createPlanAction(formData: FormData) {
  const orgId = orgIdFrom(formData);
  const ctx = await requireOrgPermission(orgId, "org:manage");
  const parsed = parseForm(planSchema, formData);
  if (!parsed.success) fail("/gym/memberships/plans/new", firstError(parsed.error));
  const p = parsed.data;
  await db.insert(membershipPlans).values({
    orgId,
    name: p.name,
    description: p.description || null,
    category: p.category,
    priceCents: Math.round(p.price * 100),
    currency: p.currency.toUpperCase(),
    interval: p.interval,
    classLimitPerWeek: p.classLimitPerWeek || null,
    creditCount: p.creditCount || null,
    trialDays: p.trialDays ?? 0,
    signupFeeCents: Math.round((p.signupFee ?? 0) * 100),
    minCommitmentMonths: p.minCommitmentMonths ?? 0,
    noticePeriodDays: p.noticePeriodDays ?? 0,
    freezeAllowed: p.freezeAllowed ?? true,
    freezeMaxDays: p.freezeMaxDays ?? 60,
    autoRenew: p.autoRenew ?? true,
    familyDiscountBps: Math.round((p.familyDiscountPercent ?? 0) * 100),
    studentDiscountBps: Math.round((p.studentDiscountPercent ?? 0) * 100),
    allowedDisciplines: p.allowedDisciplines
      ? JSON.stringify(p.allowedDisciplines.split(",").map((s) => s.trim()).filter(Boolean))
      : null,
    terms: p.terms || null,
    cancellationPolicy: p.cancellationPolicy || null,
    isActive: p.isActive ?? true,
  });
  await audit({ orgId, actor: actor(ctx), action: "plan.created", targetType: "membership_plan", meta: { name: p.name } });
  done("/gym/memberships", `Plan “${p.name}” created`);
}

export async function updatePlanAction(formData: FormData) {
  const orgId = orgIdFrom(formData);
  const ctx = await requireOrgPermission(orgId, "org:manage");
  const planId = String(formData.get("planId") ?? "");
  const parsed = parseForm(planSchema, formData);
  if (!parsed.success) fail(`/gym/memberships/plans/${planId}`, firstError(parsed.error));
  const p = parsed.data;
  await db
    .update(membershipPlans)
    .set({
      name: p.name,
      description: p.description || null,
      category: p.category,
      priceCents: Math.round(p.price * 100),
      interval: p.interval,
      classLimitPerWeek: p.classLimitPerWeek || null,
      creditCount: p.creditCount || null,
      trialDays: p.trialDays ?? 0,
      signupFeeCents: Math.round((p.signupFee ?? 0) * 100),
      minCommitmentMonths: p.minCommitmentMonths ?? 0,
      noticePeriodDays: p.noticePeriodDays ?? 0,
      freezeAllowed: p.freezeAllowed ?? true,
      freezeMaxDays: p.freezeMaxDays ?? 60,
      autoRenew: p.autoRenew ?? true,
      familyDiscountBps: Math.round((p.familyDiscountPercent ?? 0) * 100),
      studentDiscountBps: Math.round((p.studentDiscountPercent ?? 0) * 100),
      allowedDisciplines: p.allowedDisciplines
        ? JSON.stringify(p.allowedDisciplines.split(",").map((s) => s.trim()).filter(Boolean))
        : null,
      terms: p.terms || null,
      cancellationPolicy: p.cancellationPolicy || null,
      isActive: p.isActive ?? true,
    })
    .where(and(eq(membershipPlans.id, planId), eq(membershipPlans.orgId, orgId)));
  await audit({ orgId, actor: actor(ctx), action: "plan.updated", targetType: "membership_plan", targetId: planId });
  done("/gym/memberships", "Plan updated");
}

export async function togglePlanAction(formData: FormData) {
  const orgId = orgIdFrom(formData);
  const ctx = await requireOrgPermission(orgId, "org:manage");
  const planId = String(formData.get("planId") ?? "");
  const plan = (await db.select().from(membershipPlans).where(and(eq(membershipPlans.id, planId), eq(membershipPlans.orgId, orgId))).limit(1))[0];
  if (!plan) fail("/gym/memberships", "Plan not found");
  await db.update(membershipPlans).set({ isActive: !plan.isActive }).where(eq(membershipPlans.id, planId));
  await audit({ orgId, actor: actor(ctx), action: plan.isActive ? "plan.deactivated" : "plan.activated", targetType: "membership_plan", targetId: planId });
  done("/gym/memberships", plan.isActive ? "Plan hidden from new signups" : "Plan active again");
}

/* ------------------------------------------------------------------ */
/* Memberships                                                         */
/* ------------------------------------------------------------------ */

export async function assignMembershipAction(formData: FormData) {
  const orgId = orgIdFrom(formData);
  const ctx = await requireOrgPermission(orgId, "memberships:manage");
  const memberId = String(formData.get("memberId") ?? "");
  const planId = String(formData.get("planId") ?? "");
  const trial = formData.get("trial") === "on";
  const discount = Number(formData.get("discountPercent") ?? 0);
  await guard(`/gym/members/${memberId}`, async () => {
    const { subscription } = await createMembership({
      orgId,
      memberId,
      planId,
      trial,
      discountBps: Math.round(discount * 100),
      createdById: ctx.user.id,
    });
    await audit({
      orgId,
      actor: actor(ctx),
      action: "membership.created",
      targetType: "subscription",
      targetId: subscription.id,
      meta: { planId, trial },
    });
    done(`/gym/members/${memberId}`, trial ? "Trial membership started" : "Membership activated");
  });
}

export async function pauseMembershipAction(formData: FormData) {
  const orgId = orgIdFrom(formData);
  const ctx = await requireOrgPermission(orgId, "memberships:manage");
  const subscriptionId = String(formData.get("subscriptionId") ?? "");
  const memberId = String(formData.get("memberId") ?? "");
  const start = new Date(String(formData.get("startDate") ?? new Date().toISOString()));
  const end = new Date(String(formData.get("endDate") ?? addDays(new Date(), 14).toISOString()));
  await guard(`/gym/members/${memberId}`, async () => {
    if (end <= start) throw new Error("Pause end date must be after the start date");
    await pauseMembership({ orgId, subscriptionId, startDate: start, endDate: end, reason: String(formData.get("reason") ?? ""), actor: actor(ctx) });
    done(`/gym/members/${memberId}`, "Membership paused and period extended");
  });
}

export async function resumeMembershipAction(formData: FormData) {
  const orgId = orgIdFrom(formData);
  const ctx = await requireOrgPermission(orgId, "memberships:manage");
  const subscriptionId = String(formData.get("subscriptionId") ?? "");
  const memberId = String(formData.get("memberId") ?? "");
  await guard(`/gym/members/${memberId}`, async () => {
    await resumeMembership({ orgId, subscriptionId, actor: actor(ctx) });
    done(`/gym/members/${memberId}`, "Membership resumed");
  });
}

export async function cancelMembershipAction(formData: FormData) {
  const orgId = orgIdFrom(formData);
  const ctx = await requireOrgPermission(orgId, "memberships:manage");
  const subscriptionId = String(formData.get("subscriptionId") ?? "");
  const memberId = String(formData.get("memberId") ?? "");
  const immediate = formData.get("immediate") === "on";
  await guard(`/gym/members/${memberId}`, async () => {
    await cancelMembership({ orgId, subscriptionId, immediate, reason: String(formData.get("reason") ?? ""), actor: actor(ctx) });
    done(`/gym/members/${memberId}`, immediate ? "Membership cancelled immediately" : "Cancellation scheduled for period end");
  });
}

export async function extendMembershipAction(formData: FormData) {
  const orgId = orgIdFrom(formData);
  const ctx = await requireOrgPermission(orgId, "memberships:manage");
  const subscriptionId = String(formData.get("subscriptionId") ?? "");
  const memberId = String(formData.get("memberId") ?? "");
  const days = Number(formData.get("days") ?? 0);
  await guard(`/gym/members/${memberId}`, async () => {
    if (!days || days < 1 || days > 365) throw new Error("Enter 1–365 days");
    await extendMembership({ orgId, subscriptionId, days, actor: actor(ctx) });
    done(`/gym/members/${memberId}`, `Membership extended by ${days} days`);
  });
}

export async function addCreditsAction(formData: FormData) {
  const orgId = orgIdFrom(formData);
  const ctx = await requireOrgPermission(orgId, "memberships:manage");
  const subscriptionId = String(formData.get("subscriptionId") ?? "");
  const memberId = String(formData.get("memberId") ?? "");
  const delta = Number(formData.get("delta") ?? 0);
  await guard(`/gym/members/${memberId}`, async () => {
    if (!delta) throw new Error("Enter a credit amount");
    const next = await addCredits({ orgId, subscriptionId, delta, reason: String(formData.get("reason") ?? ""), actor: actor(ctx) });
    done(`/gym/members/${memberId}`, `Credits updated — balance ${next}`);
  });
}

export async function changeSubscriptionPlanAction(formData: FormData) {
  const orgId = orgIdFrom(formData);
  const ctx = await requireOrgPermission(orgId, "memberships:manage");
  const subscriptionId = String(formData.get("subscriptionId") ?? "");
  const memberId = String(formData.get("memberId") ?? "");
  const newPlanId = String(formData.get("newPlanId") ?? "");
  const applyNow = formData.get("applyNow") === "on";
  await guard(`/gym/members/${memberId}`, async () => {
    await schedulePlanChange({
      orgId,
      subscriptionId,
      newPlanId,
      effectiveAt: formData.get("effectiveAt") ? new Date(String(formData.get("effectiveAt"))) : new Date(),
      actor: actor(ctx),
      applyNow,
    });
    done(`/gym/members/${memberId}`, applyNow ? "Plan changed" : "Plan change scheduled");
  });
}

export async function activateMembershipAction(formData: FormData) {
  const orgId = orgIdFrom(formData);
  const ctx = await requireOrgPermission(orgId, "memberships:manage");
  const subscriptionId = String(formData.get("subscriptionId") ?? "");
  const memberId = String(formData.get("memberId") ?? "");
  await guard(`/gym/members/${memberId}`, async () => {
    await setSubscriptionStatus(orgId, subscriptionId, "active", actor(ctx), { reason: "staff_activated" });
    done(`/gym/members/${memberId}`, "Membership activated");
  });
}

/* ------------------------------------------------------------------ */
/* Invoices & payments                                                 */
/* ------------------------------------------------------------------ */

export async function createInvoiceAction(formData: FormData) {
  const orgId = orgIdFrom(formData);
  const ctx = await requireOrgPermission(orgId, "billing:manage");
  const subscriptionId = String(formData.get("subscriptionId") ?? "");
  const memberId = String(formData.get("memberId") ?? "");
  await guard(`/gym/members/${memberId}`, async () => {
    const invoice = await createInvoiceForSubscription({ orgId, subscriptionId });
    await audit({ orgId, actor: actor(ctx), action: "invoice.created", targetType: "invoice", targetId: invoice.id });
    done(`/gym/members/${memberId}`, `Invoice ${invoice.number} created`);
  });
}

export async function markInvoicePaidAction(formData: FormData) {
  const orgId = orgIdFrom(formData);
  const ctx = await requireOrgPermission(orgId, "billing:manage");
  const invoiceId = String(formData.get("invoiceId") ?? "");
  const method = String(formData.get("method") ?? "manual");
  await guard("/gym/payments", async () => {
    const invoice = (await db.select().from(invoices).where(and(eq(invoices.id, invoiceId), eq(invoices.orgId, orgId))).limit(1))[0];
    if (!invoice) throw new Error("Invoice not found");
    await (await import("@/lib/membership")).recordPayment({
      orgId,
      invoiceId,
      amountCents: invoice.amountCents,
      provider: "manual",
      providerPaymentId: `manual_${invoice.id}_${Date.now()}`,
      method,
    });
    await audit({
      orgId,
      actor: actor(ctx),
      action: "invoice.marked_paid",
      targetType: "invoice",
      targetId: invoiceId,
      meta: { method, amountCents: invoice.amountCents },
    });
    done("/gym/payments", `Invoice ${invoice.number} marked paid`);
  });
}

export async function refundPaymentAction(formData: FormData) {
  const orgId = orgIdFrom(formData);
  const ctx = await requireOrgPermission(orgId, "billing:manage");
  const paymentId = String(formData.get("paymentId") ?? "");
  const amount = formData.get("amount") ? Math.round(Number(formData.get("amount")) * 100) : undefined;
  await guard("/gym/payments", async () => {
    await refundPayment({ orgId, paymentId, amountCents: amount, reason: String(formData.get("reason") ?? ""), actor: actor(ctx) });
    done("/gym/payments", "Refund recorded");
  });
}

/* ------------------------------------------------------------------ */
/* Classes & schedule                                                  */
/* ------------------------------------------------------------------ */

export async function createClassAction(formData: FormData) {
  const orgId = orgIdFrom(formData);
  const ctx = await requireOrgPermission(orgId, "classes:manage");
  const parsed = parseForm(classSchema, formData);
  if (!parsed.success) fail("/gym/classes/new", firstError(parsed.error));
  const c = parsed.data;
  const days = (c.days ?? "")
    .split(",")
    .map((d) => Number(d.trim()))
    .filter((d) => Number.isInteger(d) && d >= 0 && d <= 6);
  const created = (
    await db
      .insert(classes)
      .values({
        orgId,
        name: c.name,
        discipline: c.discipline,
        description: c.description || null,
        coachMemberId: c.coachMemberId || null,
        locationId: c.locationId || (ctx.locations[0]?.id ?? null),
        capacity: c.capacity,
        durationMinutes: c.durationMinutes,
        level: c.level,
        bookingWindowDays: c.bookingWindowDays ?? 14,
        cancellationWindowHours: c.cancellationWindowHours ?? 4,
        recurrence: c.time ? JSON.stringify({ days: days.length ? days : [1], time: c.time }) : null,
      })
      .returning()
  )[0];
  if (c.time) await generateSessions(created.id, orgId, 8);
  await audit({ orgId, actor: actor(ctx), action: "class.created", targetType: "class", targetId: created.id, meta: { name: c.name } });
  done("/gym/classes", `Class “${c.name}” created with sessions in the calendar`);
}

export async function updateClassAction(formData: FormData) {
  const orgId = orgIdFrom(formData);
  const ctx = await requireOrgPermission(orgId, "classes:manage");
  const classId = String(formData.get("classId") ?? "");
  const parsed = parseForm(classSchema, formData);
  if (!parsed.success) fail(`/gym/classes/${classId}`, firstError(parsed.error));
  const c = parsed.data;
  const days = (c.days ?? "")
    .split(",")
    .map((d) => Number(d.trim()))
    .filter((d) => Number.isInteger(d) && d >= 0 && d <= 6);
  await db
    .update(classes)
    .set({
      name: c.name,
      discipline: c.discipline,
      description: c.description || null,
      coachMemberId: c.coachMemberId || null,
      locationId: c.locationId || null,
      capacity: c.capacity,
      durationMinutes: c.durationMinutes,
      level: c.level,
      bookingWindowDays: c.bookingWindowDays ?? 14,
      cancellationWindowHours: c.cancellationWindowHours ?? 4,
      recurrence: c.time ? JSON.stringify({ days: days.length ? days : [1], time: c.time }) : null,
    })
    .where(and(eq(classes.id, classId), eq(classes.orgId, orgId)));
  if (c.time) await generateSessions(classId, orgId, 8);
  await audit({ orgId, actor: actor(ctx), action: "class.updated", targetType: "class", targetId: classId });
  done("/gym/classes", "Class updated");
}

export async function toggleClassAction(formData: FormData) {
  const orgId = orgIdFrom(formData);
  const ctx = await requireOrgPermission(orgId, "classes:manage");
  const classId = String(formData.get("classId") ?? "");
  const row = (await db.select().from(classes).where(and(eq(classes.id, classId), eq(classes.orgId, orgId))).limit(1))[0];
  if (!row) fail("/gym/classes", "Class not found");
  await db.update(classes).set({ isActive: !row.isActive }).where(eq(classes.id, classId));
  await audit({ orgId, actor: actor(ctx), action: row.isActive ? "class.deactivated" : "class.activated", targetType: "class", targetId: classId });
  done("/gym/classes", row.isActive ? "Class paused" : "Class active again");
}

export async function regenerateSessionsAction(formData: FormData) {
  const orgId = orgIdFrom(formData);
  const ctx = await requireOrgPermission(orgId, "classes:manage");
  await guard("/gym/calendar", async () => {
    const total = await generateAllSessions(orgId, 8);
    done("/gym/calendar", `Schedule refreshed (${total} sessions checked)`);
  });
  await audit({ orgId, actor: actor(ctx), action: "schedule.generated" });
}

export async function cancelSessionAction(formData: FormData) {
  const orgId = orgIdFrom(formData);
  const ctx = await requireOrgPermission(orgId, "classes:manage");
  const sessionId = String(formData.get("sessionId") ?? "");
  await guard(String(formData.get("returnTo") ?? "/gym/calendar"), async () => {
    const session = (await db.select().from(classSessions).where(and(eq(classSessions.id, sessionId), eq(classSessions.orgId, orgId))).limit(1))[0];
    if (!session) throw new Error("Session not found");
    await db.update(classSessions).set({ status: "cancelled" }).where(eq(classSessions.id, sessionId));
    const affected = await db.select().from(bookings).where(and(eq(bookings.sessionId, sessionId), inArray(bookings.status, ["booked", "waitlisted"])));
    for (const b of affected) {
      const member = (await db.select().from(orgMembers).where(eq(orgMembers.id, b.memberId)).limit(1))[0];
      if (member) {
        await notify({
          userId: member.userId,
          orgId,
          type: "class",
          title: "Class cancelled",
          body: "A class you booked has been cancelled. Your credit is unaffected.",
          link: "/app/schedule",
          dedupeKey: `session-cancel-${sessionId}-${member.id}`,
          email: true,
        });
      }
    }
    await audit({ orgId, actor: actor(ctx), action: "session.cancelled", targetType: "class_session", targetId: sessionId, meta: { affected: affected.length } });
    done(String(formData.get("returnTo") ?? "/gym/calendar"), `Session cancelled. ${affected.length} member(s) notified.`);
  });
}

export async function staffBookAction(formData: FormData) {
  const orgId = orgIdFrom(formData);
  const ctx = await requireOrgPermission(orgId, "bookings:manage");
  const sessionId = String(formData.get("sessionId") ?? "");
  const memberId = String(formData.get("memberId") ?? "");
  await guard(String(formData.get("returnTo") ?? "/gym/calendar"), async () => {
    const result = await bookSession({ orgId, sessionId, memberId, source: "staff" });
    await audit({ orgId, actor: actor(ctx), action: "booking.created_by_staff", targetType: "class_session", targetId: sessionId, meta: { memberId, status: result.status } });
    done(String(formData.get("returnTo") ?? "/gym/calendar"), result.status === "waitlisted" ? "Class full — member added to waitlist" : "Member booked");
  });
}

export async function staffCancelBookingAction(formData: FormData) {
  const orgId = orgIdFrom(formData);
  const ctx = await requireOrgPermission(orgId, "bookings:manage");
  const bookingId = String(formData.get("bookingId") ?? "");
  await guard(String(formData.get("returnTo") ?? "/gym/calendar"), async () => {
    await cancelBooking({ orgId, bookingId, actor: { id: ctx.user.id, name: ctx.user.name }, byStaff: true });
    await audit({ orgId, actor: actor(ctx), action: "booking.cancelled_by_staff", targetType: "booking", targetId: bookingId });
    done(String(formData.get("returnTo") ?? "/gym/calendar"), "Booking cancelled");
  });
}

export async function markAttendanceAction(formData: FormData) {
  const orgId = orgIdFrom(formData);
  const ctx = await requireOrgPermission(orgId, "attendance:manage");
  const sessionId = String(formData.get("sessionId") ?? "");
  const memberId = String(formData.get("memberId") ?? "");
  const status = String(formData.get("status") ?? "attended");
  await guard(String(formData.get("returnTo") ?? "/gym/attendance"), async () => {
    const booking = (await db.select().from(bookings).where(and(eq(bookings.sessionId, sessionId), eq(bookings.memberId, memberId))).limit(1))[0];
    if (status === "no_show") {
      if (!booking) throw new Error("No booking found");
      await db.update(bookings).set({ status: "no_show" }).where(eq(bookings.id, booking.id));
    } else {
      await checkIn({ orgId, sessionId, memberId, method: "staff", checkedInById: ctx.user.id });
    }
    await audit({ orgId, actor: actor(ctx), action: `attendance.${status}`, targetType: "class_session", targetId: sessionId, meta: { memberId } });
    done(String(formData.get("returnTo") ?? "/gym/attendance"), status === "no_show" ? "Marked as no-show" : "Checked in");
  });
}


/** Front-desk scan of a member's rotating QR code (payload: MMAOS:{orgId}:{memberId}:{date}.{sig}). */
export async function qrCheckInAction(formData: FormData) {
  const orgId = orgIdFrom(formData);
  const ctx = await requireOrgPermission(orgId, "attendance:manage");
  const payload = String(formData.get("payload") ?? "").trim();
  const sessionId = String(formData.get("sessionId") ?? "") || null;
  await guard("/gym/attendance", async () => {
    const parts = payload.split(":");
    if (parts.length !== 4 || parts[0] !== "MMAOS") fail("/gym/attendance", "Unrecognised QR code. Ask the member to refresh their code.");
    const [, tokenOrgId, memberId, token] = parts;
    if (tokenOrgId !== orgId) fail("/gym/attendance", "This code belongs to a different gym.");
    const today = new Date().toISOString().slice(0, 10);
    if (!token.startsWith(`${today}.`)) fail("/gym/attendance", "This check-in code has expired. Ask the member to refresh it.");
    if (!verifyQrToken(orgId, memberId, token)) fail("/gym/attendance", "Invalid check-in code.");
    const member = await getTenantMemberForAction(orgId, memberId);
    const result = await checkIn({
      orgId,
      sessionId,
      memberId,
      method: "qr",
      checkedInById: ctx.user.id,
      nonce: `qr:${token}:${memberId}`,
    });
    await audit({
      orgId,
      actor: actor(ctx),
      action: "attendance.qr_checkin",
      targetType: "org_member",
      targetId: member.id,
      meta: { sessionId, nonce: token.slice(0, 10) },
    });
    done("/gym/attendance", `${member.name} checked in`);
  });
}

/** Tenant-checked member lookup used by QR check-in. */
async function getTenantMemberForAction(orgId: string, memberId: string) {
  const row = (
    await db
      .select({ id: orgMembers.id, name: users.name })
      .from(orgMembers)
      .innerJoin(users, eq(users.id, orgMembers.userId))
      .where(and(eq(orgMembers.id, memberId), eq(orgMembers.orgId, orgId)))
      .limit(1)
  )[0];
  if (!row) fail("/gym/attendance", "Member not found in this gym.");
  return row;
}

export async function staffCheckInAction(formData: FormData) {
  const orgId = orgIdFrom(formData);
  const ctx = await requireOrgPermission(orgId, "attendance:manage");
  const memberId = String(formData.get("memberId") ?? "");
  const sessionId = String(formData.get("sessionId") ?? "") || null;
  await guard("/gym/attendance", async () => {
    await checkIn({ orgId, sessionId, memberId, method: "staff", checkedInById: ctx.user.id });
    await audit({ orgId, actor: actor(ctx), action: "attendance.staff_checkin", targetType: "org_member", targetId: memberId, meta: { sessionId } });
    done("/gym/attendance", "Checked in");
  });
}

/* ------------------------------------------------------------------ */
/* Fight camps, records, programs                                      */
/* ------------------------------------------------------------------ */

export async function createFightCampAction(formData: FormData) {
  const orgId = orgIdFrom(formData);
  const ctx = await requireOrgPermission(orgId, "fightcamps:manage");
  const parsed = parseForm(fightCampSchema, formData);
  if (!parsed.success) fail("/gym/fight-camps", firstError(parsed.error));
  const c = parsed.data;
  await guard("/gym/fight-camps", async () => {
    const fighter = (
      await db
        .select({ member: orgMembers, user: users })
        .from(orgMembers)
        .innerJoin(users, eq(users.id, orgMembers.userId))
        .where(and(eq(orgMembers.id, c.fighterMemberId), eq(orgMembers.orgId, orgId)))
        .limit(1)
    )[0];
    if (!fighter) throw new Error("Fighter not found in this gym");
    const camp = (
      await db
        .insert(fightCamps)
        .values({
          orgId,
          fighterMemberId: c.fighterMemberId,
          coachMemberId: ctx.membership?.role === "coach" ? ctx.membership.id : null,
          title: `${c.eventName || "Fight camp"} — ${fighter.user.name}`,
          opponent: c.opponent || null,
          eventName: c.eventName || null,
          fightDate: new Date(c.fightDate),
          weightClass: c.weightClass || null,
          campStart: c.campStart ? new Date(c.campStart) : new Date(),
          phases: JSON.stringify([
            { name: "Base", focus: "Volume and fundamentals" },
            { name: "Sharpen", focus: "Sparring and tactics" },
            { name: "Taper", focus: "Recovery" },
          ]),
          weeklyTargets: JSON.stringify({ sessions: 5, sparring: 2, strength: 2 }),
          checklist: JSON.stringify([
            { label: "Medical check booked", done: false },
            { label: "Opponent reviewed", done: false },
            { label: "Weight check scheduled", done: false },
          ]),
          coachNotes: c.coachNotes || null,
          status: "active",
        })
        .returning()
    )[0];
    await notify({
      userId: fighter.member.userId,
      orgId,
      type: "fightcamp",
      title: "Fight camp created",
      body: `${c.eventName || "Your fight"} · ${new Date(c.fightDate).toLocaleDateString("en-GB")}`,
      link: "/app/fights",
      dedupeKey: `camp-${camp.id}`,
      email: true,
    });
    await audit({ orgId, actor: actor(ctx), action: "fightcamp.created", targetType: "fight_camp", targetId: camp.id });
    done(`/gym/fight-camps/${camp.id}`, "Fight camp created");
  });
}

export async function updateCampChecklistAction(formData: FormData) {
  const orgId = orgIdFrom(formData);
  const ctx = await requireOrgPermission(orgId, "fightcamps:manage");
  const campId = String(formData.get("campId") ?? "");
  const index = Number(formData.get("index") ?? -1);
  const camp = (await db.select().from(fightCamps).where(and(eq(fightCamps.id, campId), eq(fightCamps.orgId, orgId))).limit(1))[0];
  if (!camp) fail("/gym/fight-camps", "Camp not found");
  const checklist = parseJson<{ label: string; done: boolean }[]>(camp.checklist, []);
  if (checklist[index]) checklist[index].done = !checklist[index].done;
  await db.update(fightCamps).set({ checklist: JSON.stringify(checklist) }).where(eq(fightCamps.id, campId));
  await audit({ orgId, actor: actor(ctx), action: "fightcamp.checklist", targetType: "fight_camp", targetId: campId });
  done(`/gym/fight-camps/${campId}`, "Checklist updated");
}

export async function addCampNoteAction(formData: FormData) {
  const orgId = orgIdFrom(formData);
  const ctx = await requireOrgPermission(orgId, "fightcamps:manage");
  const campId = String(formData.get("campId") ?? "");
  const notes = String(formData.get("notes") ?? "");
  await db.update(fightCamps).set({ coachNotes: notes }).where(and(eq(fightCamps.id, campId), eq(fightCamps.orgId, orgId)));
  await audit({ orgId, actor: actor(ctx), action: "fightcamp.notes", targetType: "fight_camp", targetId: campId });
  done(`/gym/fight-camps/${campId}`, "Camp notes saved");
}

export async function coachAddFightRecordAction(formData: FormData) {
  const orgId = orgIdFrom(formData);
  const ctx = await requireOrgPermission(orgId, "fightcamps:manage");
  const memberId = String(formData.get("memberId") ?? "");
  const parsed = parseForm(fightRecordSchema, formData);
  if (!parsed.success) fail(`/gym/fighters/${memberId}`, firstError(parsed.error));
  const r = parsed.data;
  await db.insert(fightRecords).values({
    orgId,
    fighterMemberId: memberId,
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
    verified: true,
    verifiedById: ctx.user.id,
    verifiedAt: new Date(),
    createdById: ctx.user.id,
  });
  await audit({ orgId, actor: actor(ctx), action: "fightrecord.created", targetType: "org_member", targetId: memberId });
  done(`/gym/fighters/${memberId}`, "Fight record added");
}

export async function verifyFightRecordAction(formData: FormData) {
  const orgId = orgIdFrom(formData);
  const ctx = await requireOrgPermission(orgId, "fightcamps:manage");
  const recordId = String(formData.get("recordId") ?? "");
  await db
    .update(fightRecords)
    .set({ verified: true, verifiedById: ctx.user.id, verifiedAt: new Date() })
    .where(and(eq(fightRecords.id, recordId), eq(fightRecords.orgId, orgId)));
  await audit({ orgId, actor: actor(ctx), action: "fightrecord.verified", targetType: "fight_record", targetId: recordId });
  done(String(formData.get("returnTo") ?? "/gym/fighters"), "Fight record verified");
}

export async function createProgramAction(formData: FormData) {
  const orgId = orgIdFrom(formData);
  const ctx = await requireOrgPermission(orgId, "programs:manage");
  const title = String(formData.get("title") ?? "").trim();
  if (title.length < 3) fail("/gym/coaches", "Give the program a title");
  const created = (
    await db
      .insert(trainingPrograms)
      .values({
        orgId,
        coachMemberId: ctx.membership?.id ?? String(formData.get("coachMemberId") ?? ""),
        title,
        description: String(formData.get("description") ?? "") || null,
        discipline: String(formData.get("discipline") ?? "") || null,
        weeks: Number(formData.get("weeks") ?? 4),
        sessionsPerWeek: Number(formData.get("sessionsPerWeek") ?? 3),
      })
      .returning()
  )[0];
  await audit({ orgId, actor: actor(ctx), action: "program.created", targetType: "training_program", targetId: created.id });
  done("/gym/coaches", "Program created");
}

export async function assignProgramAction(formData: FormData) {
  const orgId = orgIdFrom(formData);
  const ctx = await requireOrgPermission(orgId, "programs:manage");
  const programId = String(formData.get("programId") ?? "");
  const fighterMemberId = String(formData.get("fighterMemberId") ?? "");
  await guard("/gym/coaches", async () => {
    const program = (await db.select().from(trainingPrograms).where(and(eq(trainingPrograms.id, programId), eq(trainingPrograms.orgId, orgId))).limit(1))[0];
    const fighter = (await db.select().from(orgMembers).where(and(eq(orgMembers.id, fighterMemberId), eq(orgMembers.orgId, orgId))).limit(1))[0];
    if (!program || !fighter) throw new Error("Program or fighter not found");
    await db.insert(programAssignments).values({
      orgId,
      programId,
      fighterMemberId,
      assignedById: ctx.user.id,
      dueAt: addDays(new Date(), program.weeks * 7),
    });
    await notify({
      userId: fighter.userId,
      orgId,
      type: "training",
      title: "New training program",
      body: program.title,
      link: "/app/progress",
      dedupeKey: `program-${programId}-${fighterMemberId}`,
    });
    await audit({ orgId, actor: actor(ctx), action: "program.assigned", targetType: "training_program", targetId: programId, meta: { fighterMemberId } });
    done("/gym/coaches", "Program assigned");
  });
}

/* ------------------------------------------------------------------ */
/* Communication                                                       */
/* ------------------------------------------------------------------ */

export async function sendAnnouncementAction(formData: FormData) {
  const orgId = orgIdFrom(formData);
  const ctx = await requireOrgPermission(orgId, "announcements:send");
  const title = String(formData.get("title") ?? "").trim();
  const body = String(formData.get("body") ?? "").trim();
  const audience = String(formData.get("audience") ?? "all") as "all" | "fighters" | "coaches" | "staff";
  if (!title || !body) fail("/gym/messages", "Add a title and message");
  const created = (
    await db.insert(announcements).values({ orgId, authorId: ctx.user.id, title, body, audience }).returning()
  )[0];
  const audienceRoles: ("fighter" | "coach" | "manager" | "owner")[] =
    audience === "all"
      ? ["fighter", "coach", "manager", "owner"]
      : audience === "fighters"
        ? ["fighter"]
        : audience === "coaches"
          ? ["coach"]
          : ["manager", "owner"];
  const recipients = await db
    .select({ userId: orgMembers.userId })
    .from(orgMembers)
    .where(and(eq(orgMembers.orgId, orgId), inArray(orgMembers.role, audienceRoles), isNull(orgMembers.archivedAt)));
  for (const r of recipients) {
    await notify({
      userId: r.userId,
      orgId,
      type: "announcement",
      title,
      body: body.slice(0, 180),
      link: "/app/notifications",
      dedupeKey: `announcement-${created.id}-${r.userId}`,
      email: true,
    });
  }
  await audit({ orgId, actor: actor(ctx), action: "announcement.sent", targetType: "announcement", targetId: created.id, meta: { audience, recipients: recipients.length } });
  done("/gym/messages", `Announcement sent to ${recipients.length} people`);
}

export async function sendMessageAction(formData: FormData) {
  const auth = await requireUser();
  const orgId = orgIdFrom(formData);
  const ctx = await getOrgContext(orgId);
  if (!ctx) fail("/app", "Gym not found");
  const recipientMemberId = String(formData.get("recipientId") ?? "");
  const body = String(formData.get("body") ?? "").trim();
  if (!body) fail(String(formData.get("returnTo") ?? "/app/messages"), "Write a message first");
  const recipient = (
    await db
      .select({ member: orgMembers, user: users })
      .from(orgMembers)
      .innerJoin(users, eq(users.id, orgMembers.userId))
      .where(and(eq(orgMembers.id, recipientMemberId), eq(orgMembers.orgId, orgId)))
      .limit(1)
  )[0];
  if (!recipient) fail(String(formData.get("returnTo") ?? "/app/messages"), "Recipient not found in this gym");
  await db.insert(messages).values({ orgId, senderId: auth.user.id, recipientId: recipient.user.id, body });
  await notify({
    userId: recipient.user.id,
    orgId,
    type: "message",
    title: `New message from ${auth.user.name}`,
    body: body.slice(0, 160),
    link: "/app/messages",
    dedupeKey: `message-${Date.now()}-${auth.user.id}`,
    email: true,
  });
  done(String(formData.get("returnTo") ?? "/gym/messages"), "Message sent");
}

/* ------------------------------------------------------------------ */
/* Settings, locations, SaaS plan, onboarding                          */
/* ------------------------------------------------------------------ */

export async function updateGymSettingsAction(formData: FormData) {
  const orgId = orgIdFrom(formData);
  const ctx = await requireOrgPermission(orgId, "org:manage");
  const name = String(formData.get("name") ?? "").trim();
  if (name.length < 2) fail("/gym/settings", "Gym name is too short");
  await db
    .update(organizations)
    .set({
      name,
      contactEmail: String(formData.get("contactEmail") ?? "") || null,
      contactPhone: String(formData.get("contactPhone") ?? "") || null,
      website: String(formData.get("website") ?? "") || null,
      description: String(formData.get("description") ?? "") || null,
      currency: String(formData.get("currency") ?? "SEK").toUpperCase().slice(0, 3),
      country: String(formData.get("country") ?? "SE").toUpperCase().slice(0, 2),
      taxRateBps: Math.round(Number(formData.get("taxRate") ?? 25) * 100),
      brandColor: String(formData.get("brandColor") ?? "#B8F36B"),
      timezone: String(formData.get("timezone") ?? "Europe/Stockholm"),
    })
    .where(eq(organizations.id, orgId));
  await audit({ orgId, actor: actor(ctx), action: "gym.settings_updated", targetType: "organization", targetId: orgId });
  done("/gym/settings", "Gym settings saved");
}

export async function addLocationAction(formData: FormData) {
  const orgId = orgIdFrom(formData);
  const ctx = await requireOrgPermission(orgId, "org:manage");
  const name = String(formData.get("name") ?? "").trim();
  if (!name) fail("/gym/settings/locations", "Location name is required");
  await guard("/gym/settings/locations", async () => {
    const ent = await getEntitlements(orgId);
    if (!ent.canAddLocation) throw new Error(`Your ${ent.planName} plan allows ${ent.maxLocations} location(s). Upgrade to add another.`);
    await db.insert(gymLocations).values({
      orgId,
      name,
      address: String(formData.get("address") ?? "") || null,
      city: String(formData.get("city") ?? "") || null,
      timezone: String(formData.get("timezone") ?? ctx.org.timezone),
    });
    await audit({ orgId, actor: actor(ctx), action: "location.created", targetType: "gym_location", meta: { name } });
    done("/gym/settings/locations", "Location added");
  });
}

export async function archiveLocationAction(formData: FormData) {
  const orgId = orgIdFrom(formData);
  const ctx = await requireOrgPermission(orgId, "org:manage");
  const locationId = String(formData.get("locationId") ?? "");
  const count = await db.select({ id: gymLocations.id }).from(gymLocations).where(and(eq(gymLocations.orgId, orgId), isNull(gymLocations.archivedAt)));
  if (count.length <= 1) fail("/gym/settings/locations", "Keep at least one location");
  await db
    .update(gymLocations)
    .set({ archivedAt: new Date() })
    .where(and(eq(gymLocations.id, locationId), eq(gymLocations.orgId, orgId)));
  await audit({ orgId, actor: actor(ctx), action: "location.archived", targetType: "gym_location", targetId: locationId });
  done("/gym/settings/locations", "Location archived");
}

export async function changeSaasPlanAction(formData: FormData) {
  const orgId = orgIdFrom(formData);
  const ctx = await requireOrgPermission(orgId, "org:manage");
  const planId = String(formData.get("planId") ?? "");
  await guard("/gym/settings/billing", async () => {
    const plan = (await db.select().from(saasPlans).where(eq(saasPlans.id, planId)).limit(1))[0];
    if (!plan) throw new Error("Plan not found");
    const current = await getEntitlements(orgId);
    if (current.usage.locations > plan.maxLocations) throw new Error(`${plan.name} allows ${plan.maxLocations} locations. Remove locations first.`);
    const existing = (await db.select().from(saasSubscriptions).where(eq(saasSubscriptions.orgId, orgId)).limit(1))[0];
    if (existing) {
      await db
        .update(saasSubscriptions)
        .set({ planId, status: env.stripe.secretKey ? existing.status : "active", updatedAt: new Date() })
        .where(eq(saasSubscriptions.id, existing.id));
    } else {
      await db.insert(saasSubscriptions).values({
        orgId,
        planId,
        status: "active",
        currentPeriodStart: new Date(),
        currentPeriodEnd: addDays(new Date(), 30),
      });
    }
    await audit({ orgId, actor: actor(ctx), action: "saas.plan_changed", targetType: "saas_subscription", meta: { planId, plan: plan.slug } });
    done("/gym/settings/billing", `Subscription switched to ${plan.name}`);
  });
}

export async function completeOnboardingStepAction(formData: FormData) {
  const orgId = orgIdFrom(formData);
  const ctx = await requireOrgPermission(orgId, "org:manage");
  const step = Number(formData.get("step") ?? 0);
  await db.update(organizations).set({ onboardingStep: step, onboardedAt: step >= 4 ? new Date() : null }).where(eq(organizations.id, orgId));
  revalidatePath("/gym/onboarding");
  revalidatePath("/gym");
  done("/gym/onboarding", step >= 4 ? "Setup complete — welcome to MMA OS" : "Progress saved");
}

export async function createInviteLinkAction(formData: FormData) {
  const orgId = orgIdFrom(formData);
  const ctx = await requireOrgPermission(orgId, "org:manage");
  const email = String(formData.get("email") ?? "").trim().toLowerCase();
  if (!email.includes("@")) fail("/gym/onboarding", "Enter an email to invite");
  const token = newToken();
  await db.insert(invitations).values({ orgId, email, role: "fighter", token, invitedById: ctx.user.id, expiresAt: addDays(new Date(), 14) });
  await sendEmail({
    to: email,
    subject: `Join ${ctx.org.name} on MMA OS`,
    body: `Accept your invite: ${env.appUrl}/join/${token}`,
    template: "invite",
  });
  await audit({ orgId, actor: actor(ctx), action: "invitation.created", targetType: "invitation", meta: { email } });
  done("/gym/onboarding", "Invite sent");
}

export async function setOrgStatusForOwnerAction(formData: FormData) {
  const orgId = orgIdFrom(formData);
  const ctx = await requireOrgPermission(orgId, "org:manage");
  if (formData.get("confirm") !== "on") fail("/gym/settings", "Confirm the change first");
  await audit({ orgId, actor: actor(ctx), action: "gym.owner_requested_closure", targetType: "organization", targetId: orgId });
  done("/gym/settings", "Closure request logged. Support will contact you within one business day.");
}

/** Helper used by join pages to consume an invitation. */
export async function acceptInvitationForCurrentUser(token: string) {
  const auth = await requireUser();
  const invite = (
    await db
      .select()
      .from(invitations)
      .where(and(eq(invitations.token, token), isNull(invitations.acceptedAt), isNull(invitations.revokedAt)))
      .limit(1)
  )[0];
  if (!invite || invite.expiresAt < new Date()) throw new Error("This invitation is no longer valid");
  const existing = (
    await db.select().from(orgMembers).where(and(eq(orgMembers.orgId, invite.orgId), eq(orgMembers.userId, auth.user.id))).limit(1)
  )[0];
  if (!existing) {
    await db.insert(orgMembers).values({
      orgId: invite.orgId,
      userId: auth.user.id,
      role: invite.role,
      status: "active",
      joinedAt: new Date(),
    });
  }
  await db.update(invitations).set({ acceptedAt: new Date() }).where(eq(invitations.id, invite.id));
  await audit({ orgId: invite.orgId, actor: { id: auth.user.id, name: auth.user.name }, action: "invitation.accepted", targetType: "invitation", targetId: invite.id });
  return invite;
}

export async function joinGymAction(formData: FormData) {
  const auth = await requireUser();
  const gymCode = String(formData.get("gymCode") ?? "").trim().toLowerCase();
  const org = (await db.select().from(organizations).where(sql`lower(${organizations.slug}) = ${gymCode}`).limit(1))[0];
  if (!org) fail("/app/onboarding", "No gym found with that code");
  const exists = (await db.select().from(orgMembers).where(and(eq(orgMembers.orgId, org.id), eq(orgMembers.userId, auth.user.id))).limit(1))[0];
  if (exists) {
    done("/app", "You are already a member of this gym");
  }
  const ent = await getEntitlements(org.id);
  if (!ent.canAddMember) fail("/app/onboarding", "This gym is not accepting new members right now");
  await db.insert(orgMembers).values({
    orgId: org.id,
    userId: auth.user.id,
    role: "fighter",
    status: "active",
    joinedAt: new Date(),
  });
  const owner = (await db.select().from(orgMembers).where(and(eq(orgMembers.orgId, org.id), eq(orgMembers.role, "owner"))).limit(1))[0];
  if (owner) {
    await notify({
      userId: owner.userId,
      orgId: org.id,
      type: "system",
      title: "New member joined",
      body: `${auth.user.name} joined with gym code.`,
      link: "/gym/members",
      dedupeKey: `joined-${org.id}-${auth.user.id}`,
    });
  }
  await audit({ orgId: org.id, actor: { id: auth.user.id, name: auth.user.name }, action: "member.joined_via_code", targetType: "organization", targetId: org.id });
  done("/app", `Welcome to ${org.name}!`);
}

export async function submitSupportTicketAction(formData: FormData) {
  const auth = await getSession();
  const { supportTickets } = await import("@/db/schema");
  const subject = String(formData.get("subject") ?? "").trim();
  const body = String(formData.get("body") ?? "").trim();
  if (!subject || !body) fail("/app/support", "Add a subject and a message");
  await db.insert(supportTickets).values({
    orgId: String(formData.get("orgId") ?? "") || null,
    userId: auth?.user.id ?? null,
    subject,
    body,
    priority: (String(formData.get("priority") ?? "normal") as "low" | "normal" | "high" | "urgent"),
  });
  done("/app/support", "Support request sent");
}

export async function generateScheduleAction(formData: FormData) {
  const orgId = orgIdFrom(formData);
  const ctx = await requireOrgPermission(orgId, "classes:manage");
  const total = await generateAllSessions(orgId, 8);
  await audit({ orgId, actor: actor(ctx), action: "schedule.regenerated" });
  done("/gym/calendar", `Calendar refreshed (${total} sessions)`);
}

/* ------------------------------------------------------------------ */
/* Invitations accepted by the invited person                          */
/* ------------------------------------------------------------------ */

export async function acceptInviteAction(formData: FormData) {
  const token = String(formData.get("token") ?? "").trim();
  const path = `/join/${token}`;
  if (!token) fail("/login", "Missing invitation token");
  await guard("/login", async () => {
    const auth = await requireUser();
    const row = (
      await db
        .select({ invite: invitations, org: organizations })
        .from(invitations)
        .innerJoin(organizations, eq(organizations.id, invitations.orgId))
        .where(and(eq(invitations.token, token), isNull(invitations.acceptedAt), isNull(invitations.revokedAt)))
        .limit(1)
    )[0];
    if (!row) fail(path, "Invitation not found or already used");
    if (row.invite.expiresAt < new Date()) fail(path, "Invitation has expired. Ask your gym for a new one.");
    if (row.invite.email.trim().toLowerCase() !== auth.user.email.trim().toLowerCase()) {
      fail(path, `This invitation was sent to ${row.invite.email}. Sign in with that address to accept.`);
    }
    const existing = await db
      .select()
      .from(orgMembers)
      .where(and(eq(orgMembers.orgId, row.invite.orgId), eq(orgMembers.userId, auth.user.id)))
      .limit(1);
    const now = new Date();
    if (existing[0]) {
      await db
        .update(orgMembers)
        .set({ status: "active", archivedAt: null, role: row.invite.role, joinedAt: existing[0].joinedAt ?? now, updatedAt: now })
        .where(eq(orgMembers.id, existing[0].id));
    } else {
      await db.insert(orgMembers).values({
        orgId: row.invite.orgId,
        userId: auth.user.id,
        role: row.invite.role,
        status: "active",
        joinedAt: now,
        invitedById: row.invite.invitedById,
      });
    }
    await db.update(invitations).set({ acceptedAt: now }).where(eq(invitations.id, row.invite.id));
    await audit({
      orgId: row.invite.orgId,
      actor: { id: auth.user.id, name: auth.user.name, role: row.invite.role },
      action: "invitation.accepted",
      targetType: "invitation",
      targetId: row.invite.id,
      meta: { email: auth.user.email, role: row.invite.role },
    });
    await notify({
      orgId: row.invite.orgId,
      userId: auth.user.id,
      title: `Welcome to ${row.org.name}`,
      body: "Your invitation was accepted. Complete your profile to get started.",
      link: row.invite.role === "fighter" ? "/app/onboarding" : "/gym",
      type: "system",
      force: true,
    });
    const jar = await cookies();
    jar.set(ORG_COOKIE, row.invite.orgId, { httpOnly: true, sameSite: "lax", path: "/", maxAge: 60 * 60 * 24 * 365, secure: env.isProd });
    done(row.invite.role === "fighter" ? "/app/onboarding" : "/gym", `You joined ${row.org.name}`);
  });
}
