"use server";

import { and, asc, count, eq, inArray, ne, sql } from "drizzle-orm";
import { redirect } from "next/navigation";
import { revalidatePath } from "next/cache";
import { db } from "@/db/client";
import {
  auditLogs,
  dataRequests,
  emailOutbox,
  featureFlags,
  orgMembers,
  organizations,
  platformSettings,
  saasPlans,
  saasSubscriptions,
  sessions,
  supportTickets,
  users,
} from "@/db/schema";
import { audit, securityEvent, verifyAuditChain, verifyAuditHead } from "@/lib/audit";
import { AuthError, requireSuperAdmin } from "@/lib/authz";
import { notify } from "@/lib/notifications";
import { slugify, parseJson } from "@/lib/utils";

function done(path: string, message: string): never {
  redirect(`${path}?ok=${encodeURIComponent(message)}`);
}
function fail(path: string, message: string): never {
  redirect(`${path}?error=${encodeURIComponent(message)}`);
}

async function actor() {
  const auth = await requireSuperAdmin();
  return { auth, user: { id: auth.user.id, name: auth.user.name, role: "super_admin" } };
}

async function guard(path: string, fn: () => Promise<never>) {
  try {
    await fn();
  } catch (error) {
    if ((error as { digest?: string }).digest?.startsWith("NEXT_REDIRECT")) throw error;
    if (error instanceof AuthError) fail("/admin", error.message);
    console.error("[superadmin action]", error);
    fail(path, (error as Error).message || "Something went wrong");
  }
}

const orgPath = (id: string) => `/admin/orgs/${id}`;

/* ------------------------------------------------------------------ */
/* Organizations                                                       */
/* ------------------------------------------------------------------ */

export async function setOrgStatusAction(formData: FormData) {
  const orgId = String(formData.get("orgId") ?? "");
  const status = String(formData.get("status") ?? "") as "active" | "suspended" | "archived";
  const reason = String(formData.get("reason") ?? "").trim() || null;
  await guard(orgPath(orgId), async () => {
    const { user } = await actor();
    if (!["active", "suspended", "archived"].includes(status)) fail(orgPath(orgId), "Invalid status");
    const org = (await db.select().from(organizations).where(eq(organizations.id, orgId)).limit(1))[0];
    if (!org) fail("/admin/orgs", "Gym not found");
    await db
      .update(organizations)
      .set({ status, suspendedReason: status === "suspended" ? reason : null, updatedAt: new Date() })
      .where(eq(organizations.id, orgId));
    if (status !== "active") {
      // Immediately revoke staff sessions so a suspended tenant cannot keep working.
      const staff = await db.select({ userId: orgMembers.userId, role: orgMembers.role }).from(orgMembers).where(and(eq(orgMembers.orgId, orgId), ne(orgMembers.role, "fighter")));
      if (staff.length) await db.update(sessions).set({ revokedAt: new Date() }).where(inArray(sessions.userId, staff.map((s) => s.userId)));
    }
    await audit({ orgId, actor: user, action: `platform.org.${status}`, targetType: "organization", targetId: orgId, meta: { reason } });
    done(orgPath(orgId), `Gym ${status === "active" ? "reactivated" : status}`);
  });
}

export async function assignOrgPlanAction(formData: FormData) {
  const orgId = String(formData.get("orgId") ?? "");
  await guard(orgPath(orgId), async () => {
    const { user } = await actor();
    const planId = String(formData.get("planId") ?? "");
    const status = String(formData.get("status") ?? "active") as "trialing" | "active" | "past_due" | "cancelled" | "paused";
    const seats = Math.max(1, Number(formData.get("seats") ?? 1));
    const plan = (await db.select().from(saasPlans).where(eq(saasPlans.id, planId)).limit(1))[0];
    if (!plan) fail(orgPath(orgId), "Plan not found");
    const existing = (await db.select().from(saasSubscriptions).where(eq(saasSubscriptions.orgId, orgId)).limit(1))[0];
    const now = new Date();
    const values = {
      planId,
      status,
      seats,
      provider: "sandbox" as const,
      currentPeriodStart: existing?.currentPeriodStart ?? now,
      currentPeriodEnd: existing?.currentPeriodEnd ?? new Date(now.getTime() + 30 * 86400000),
      updatedAt: now,
    };
    if (existing) {
      await db.update(saasSubscriptions).set(values).where(eq(saasSubscriptions.id, existing.id));
    } else {
      await db.insert(saasSubscriptions).values({ orgId, ...values });
    }
    const owner = (await db.select().from(organizations).where(eq(organizations.id, orgId)).limit(1))[0]?.ownerId;
    if (owner) {
      await notify({
        orgId,
        userId: owner,
        type: "billing",
        title: `Subscription updated to ${plan.name}`,
        body: `Status: ${status}. Seats: ${seats}.`,
        link: "/gym/settings/billing",
        force: true,
      });
    }
    await audit({ orgId, actor: user, action: "platform.subscription.updated", targetType: "saas_subscription", targetId: planId, meta: { status, seats } });
    done(orgPath(orgId), "Subscription updated");
  });
}

/* ------------------------------------------------------------------ */
/* SaaS plans                                                          */
/* ------------------------------------------------------------------ */

export async function saveSaasPlanAction(formData: FormData) {
  const id = String(formData.get("id") ?? "");
  const path = id ? `/admin/plans` : "/admin/plans/new";
  await guard(path, async () => {
    const { user } = await actor();
    const name = String(formData.get("name") ?? "").trim();
    const slug = slugify(String(formData.get("slug") ?? name));
    const features = String(formData.get("features") ?? "")
      .split(/[,\n]/)
      .map((f) => f.trim())
      .filter(Boolean);
    if (!name) fail(path, "Plan name is required");
    const values = {
      name,
      slug,
      description: String(formData.get("description") ?? "").trim() || null,
      priceMonthlyCents: Math.max(0, Math.round(Number(formData.get("priceMonthly") ?? 0) * 100)),
      priceAnnualCents: Math.max(0, Math.round(Number(formData.get("priceAnnual") ?? 0) * 100)),
      currency: String(formData.get("currency") ?? "SEK"),
      maxLocations: Math.max(1, Number(formData.get("maxLocations") ?? 1)),
      maxActiveMembers: Math.max(1, Number(formData.get("maxActiveMembers") ?? 50)),
      maxCoaches: Math.max(1, Number(formData.get("maxCoaches") ?? 3)),
      features: JSON.stringify(features),
      sortOrder: Number(formData.get("sortOrder") ?? 0),
      isActive: formData.get("isActive") === "on",
    };
    if (id) {
      await db.update(saasPlans).set(values).where(eq(saasPlans.id, id));
      await audit({ actor: user, action: "platform.plan.updated", targetType: "saas_plan", targetId: id, meta: { slug } });
      done("/admin/plans", `${name} updated`);
    } else {
      const dup = (await db.select().from(saasPlans).where(eq(saasPlans.slug, slug)).limit(1))[0];
      if (dup) fail(path, "A plan with that slug already exists");
      const row = (await db.insert(saasPlans).values(values).returning())[0];
      await audit({ actor: user, action: "platform.plan.created", targetType: "saas_plan", targetId: row.id, meta: { slug } });
      done("/admin/plans", `${name} created`);
    }
  });
}

export async function toggleSaasPlanAction(formData: FormData) {
  await guard("/admin/plans", async () => {
    const { user } = await actor();
    const id = String(formData.get("id") ?? "");
    const plan = (await db.select().from(saasPlans).where(eq(saasPlans.id, id)).limit(1))[0];
    if (!plan) fail("/admin/plans", "Plan not found");
    await db.update(saasPlans).set({ isActive: !plan.isActive }).where(eq(saasPlans.id, id));
    await audit({ actor: user, action: plan.isActive ? "platform.plan.archived" : "platform.plan.activated", targetType: "saas_plan", targetId: id });
    done("/admin/plans", `${plan.name} ${plan.isActive ? "archived" : "activated"}`);
  });
}

/* ------------------------------------------------------------------ */
/* Users                                                               */
/* ------------------------------------------------------------------ */

export async function setUserStatusAction(formData: FormData) {
  const userId = String(formData.get("userId") ?? "");
  const path = `/admin/users/${userId}`;
  await guard(path, async () => {
    const { user } = await actor();
    const status = String(formData.get("status") ?? "") as "active" | "suspended" | "pending_deletion";
    if (!["active", "suspended", "pending_deletion"].includes(status)) fail(path, "Invalid status");
    if (userId === user.id && status !== "active") fail(path, "You cannot suspend your own account");
    const target = (await db.select().from(users).where(eq(users.id, userId)).limit(1))[0];
    if (!target) fail("/admin/users", "User not found");
    await db.update(users).set({ status, updatedAt: new Date() }).where(eq(users.id, userId));
    if (status !== "active") await db.update(sessions).set({ revokedAt: new Date() }).where(eq(sessions.userId, userId));
    await securityEvent({ userId, type: `user.${status}`, detail: `Set by ${user.name}` });
    await audit({ actor: user, action: `platform.user.${status}`, targetType: "user", targetId: userId, meta: { email: target.email } });
    done(path, `User ${status === "active" ? "reactivated" : status}`);
  });
}

export async function toggleSuperAdminAction(formData: FormData) {
  const userId = String(formData.get("userId") ?? "");
  const path = `/admin/users/${userId}`;
  await guard(path, async () => {
    const { user } = await actor();
    const target = (await db.select().from(users).where(eq(users.id, userId)).limit(1))[0];
    if (!target) fail("/admin/users", "User not found");
    if (target.id === user.id) fail(path, "You cannot change your own super-admin flag");
    if (target.isSuperAdmin) {
      const [{ n }] = await db.select({ n: count() }).from(users).where(eq(users.isSuperAdmin, true));
      if (n <= 1) fail(path, "At least one super admin must remain");
    }
    await db.update(users).set({ isSuperAdmin: !target.isSuperAdmin, updatedAt: new Date() }).where(eq(users.id, userId));
    await securityEvent({ userId, type: "superadmin.toggle", detail: `${!target.isSuperAdmin ? "granted" : "revoked"} by ${user.name}` });
    await audit({ actor: user, action: "platform.superadmin.toggle", targetType: "user", targetId: userId, outcome: "success", meta: { granted: !target.isSuperAdmin } });
    done(path, target.isSuperAdmin ? "Super admin access revoked" : "Super admin access granted");
  });
}

/* ------------------------------------------------------------------ */
/* Feature flags + platform settings                                   */
/* ------------------------------------------------------------------ */

export async function saveFlagAction(formData: FormData) {
  await guard("/admin/flags", async () => {
    const { user } = await actor();
    const key = slugify(String(formData.get("key") ?? "")).replace(/-/g, "_");
    const name = String(formData.get("name") ?? "").trim();
    if (!key || !name) fail("/admin/flags", "Key and name are required");
    const orgIds = String(formData.get("orgIds") ?? "")
      .split(/[,\s]+/)
      .map((s) => s.trim())
      .filter(Boolean);
    const values = {
      name,
      description: String(formData.get("description") ?? "").trim() || null,
      enabled: formData.get("enabled") === "on",
      orgIds: orgIds.length ? JSON.stringify(orgIds) : null,
      updatedAt: new Date(),
    };
    await db.insert(featureFlags).values({ key, ...values }).onConflictDoUpdate({ target: featureFlags.key, set: values });
    await audit({ actor: user, action: "platform.flag.saved", targetType: "feature_flag", targetId: key, meta: { enabled: values.enabled, orgIds } });
    done("/admin/flags", `Flag ${key} saved`);
  });
}

export async function toggleFlagAction(formData: FormData) {
  await guard("/admin/flags", async () => {
    const { user } = await actor();
    const key = String(formData.get("key") ?? "");
    const flag = (await db.select().from(featureFlags).where(eq(featureFlags.key, key)).limit(1))[0];
    if (!flag) fail("/admin/flags", "Flag not found");
    await db.update(featureFlags).set({ enabled: !flag.enabled, updatedAt: new Date() }).where(eq(featureFlags.key, key));
    await audit({ actor: user, action: "platform.flag.toggled", targetType: "feature_flag", targetId: key, meta: { enabled: !flag.enabled } });
    done("/admin/flags", `${key} ${flag.enabled ? "disabled" : "enabled"}`);
  });
}

export async function deleteFlagAction(formData: FormData) {
  await guard("/admin/flags", async () => {
    const { user } = await actor();
    const key = String(formData.get("key") ?? "");
    await db.delete(featureFlags).where(eq(featureFlags.key, key));
    await audit({ actor: user, action: "platform.flag.deleted", targetType: "feature_flag", targetId: key });
    done("/admin/flags", "Flag deleted");
  });
}

export async function savePlatformSettingsAction(formData: FormData) {
  await guard("/admin/settings", async () => {
    const { user } = await actor();
    const entries: [string, string][] = [];
    for (const key of ["platformName", "supportEmail", "trialDays", "defaultCurrency", "supportResponseSla", "maxOrgsPerUser"]) {
      const value = formData.get(key);
      if (value !== null) entries.push([key, String(value).trim()]);
    }
    for (const key of ["allowSignups", "allowNewOrgs", "maintenanceMode"]) {
      entries.push([key, formData.get(key) === "on" ? "true" : "false"]);
    }
    const supportEmail = entries.find(([k]) => k === "supportEmail")?.[1];
    if (supportEmail && !supportEmail.includes("@")) fail("/admin/settings", "Support email is invalid");
    for (const [key, value] of entries) {
      await db
        .insert(platformSettings)
        .values({ key, value, updatedAt: new Date() })
        .onConflictDoUpdate({ target: platformSettings.key, set: { value, updatedAt: new Date() } });
    }
    await audit({ actor: user, action: "platform.settings.updated", targetType: "platform_settings", meta: Object.fromEntries(entries) });
    done("/admin/settings", "Platform settings saved");
  });
}

/* ------------------------------------------------------------------ */
/* Support inbox                                                       */
/* ------------------------------------------------------------------ */

export async function respondTicketAction(formData: FormData) {
  const ticketId = String(formData.get("ticketId") ?? "");
  const path = `/admin/tickets/${ticketId}`;
  await guard(path, async () => {
    const { user } = await actor();
    const ticket = (await db.select().from(supportTickets).where(eq(supportTickets.id, ticketId)).limit(1))[0];
    if (!ticket) fail("/admin/tickets", "Ticket not found");
    const status = String(formData.get("status") ?? ticket.status) as "open" | "pending" | "resolved" | "closed";
    const priority = String(formData.get("priority") ?? ticket.priority) as "low" | "normal" | "high" | "urgent";
    const response = String(formData.get("response") ?? "").trim();
    await db
      .update(supportTickets)
      .set({ status, priority, response: response || ticket.response, updatedAt: new Date() })
      .where(eq(supportTickets.id, ticketId));
    if (response && ticket.userId) {
      await notify({
        orgId: ticket.orgId,
        userId: ticket.userId,
        type: "system",
        title: `Reply from support: ${ticket.subject}`,
        body: response.slice(0, 240),
        link: "/app/support",
        force: true,
      });
    }
    await audit({ orgId: ticket.orgId, actor: user, action: "platform.ticket.updated", targetType: "support_ticket", targetId: ticketId, meta: { status, priority, replied: Boolean(response) } });
    done(path, response ? "Reply sent" : "Ticket updated");
  });
}

/* ------------------------------------------------------------------ */
/* GDPR data requests                                                  */
/* ------------------------------------------------------------------ */

export async function resolveDataRequestAction(formData: FormData) {
  await guard("/admin/data-requests", async () => {
    const { user } = await actor();
    const id = String(formData.get("id") ?? "");
    const decision = String(formData.get("decision") ?? "");
    const notes = String(formData.get("notes") ?? "").trim() || null;
    const request = (await db.select().from(dataRequests).where(eq(dataRequests.id, id)).limit(1))[0];
    if (!request) fail("/admin/data-requests", "Request not found");
    if (!["completed", "rejected"].includes(decision)) fail("/admin/data-requests", "Invalid decision");
    await db
      .update(dataRequests)
      .set({ status: decision as "completed" | "rejected", handledById: user.id, notes, completedAt: new Date() })
      .where(eq(dataRequests.id, id));
    if (request.type === "deletion" && decision === "completed") {
      await db.update(users).set({ status: "pending_deletion", updatedAt: new Date() }).where(eq(users.id, request.userId));
      await db.update(sessions).set({ revokedAt: new Date() }).where(eq(sessions.userId, request.userId));
    }
    await audit({ actor: user, action: `platform.data_request.${decision}`, targetType: "data_request", targetId: id, meta: { type: request.type, userId: request.userId, notes } });
    await notify({
      userId: request.userId,
      type: "system",
      title: request.type === "deletion" ? "Data deletion request reviewed" : "Data export reviewed",
      body: decision === "completed" ? "Your request has been completed. Contact support with any questions." : "Your request needs more information. Support will follow up.",
      link: "/app/profile",
      force: true,
    });
    done("/admin/data-requests", `Request ${decision}`);
  });
}

/* ------------------------------------------------------------------ */
/* Email outbox                                                        */
/* ------------------------------------------------------------------ */

export async function updateOutboxAction(formData: FormData) {
  await guard("/admin/email", async () => {
    const { user } = await actor();
    const id = String(formData.get("id") ?? "");
    const action = String(formData.get("op") ?? "sent") as "sent" | "queued";
    const row = (await db.select().from(emailOutbox).where(eq(emailOutbox.id, id)).limit(1))[0];
    if (!row) fail("/admin/email", "Email not found");
    await db
      .update(emailOutbox)
      .set({ status: action, sentAt: action === "sent" ? new Date() : null, error: action === "sent" ? null : row.error })
      .where(eq(emailOutbox.id, id));
    await audit({ actor: user, action: `platform.email.${action}`, targetType: "email_outbox", targetId: id, meta: { to: row.to } });
    done("/admin/email", `Email marked ${action}`);
  });
}

/* ------------------------------------------------------------------ */
/* Audit integrity                                                     */
/* ------------------------------------------------------------------ */

export async function verifyAuditChainAction() {
  await guard("/admin/audit", async () => {
    const rows = await db
      .select({ hash: auditLogs.hash, prevHash: auditLogs.prevHash })
      .from(auditLogs)
      .orderBy(asc(sql`rowid`));
    const linked = await verifyAuditChain(rows.map((r) => ({ hash: r.hash ?? "", prevHash: r.prevHash })));
    const headOk = await verifyAuditHead(rows[rows.length - 1]?.hash);
    const ok = linked && headOk;
    const { user } = await actor();
    await audit({ actor: user, action: "platform.audit.verified", outcome: ok ? "success" : "failure", meta: { entries: rows.length, linked, headOk } });
    done("/admin/audit", ok ? `Chain verified across ${rows.length} entries` : `Chain broken among ${rows.length} entries — investigate immediately`);
  });
}

/* ------------------------------------------------------------------ */
/* Support mode                                                        */
/* ------------------------------------------------------------------ */

export async function enterSupportModeAction(formData: FormData) {
  const orgId = String(formData.get("orgId") ?? "");
  await guard("/admin/orgs", async () => {
    const { user } = await actor();
    const org = (await db.select().from(organizations).where(eq(organizations.id, orgId)).limit(1))[0];
    if (!org) fail("/admin/orgs", "Gym not found");
    const { cookies } = await import("next/headers");
    const { ORG_COOKIE } = await import("@/lib/env");
    const jar = await cookies();
    jar.set(ORG_COOKIE, orgId, { httpOnly: true, sameSite: "lax", path: "/", maxAge: 60 * 60 * 4 });
    await audit({ orgId, actor: user, action: "platform.support_mode.enter", targetType: "organization", targetId: orgId, meta: { readOnly: true } });
    done("/gym", `Support mode: ${org.name}`);
  });
}

export async function exitSupportModeAction(formData: FormData) {
  const next = String(formData.get("next") ?? "/admin/orgs");
  await guard(next, async () => {
    const { cookies } = await import("next/headers");
    const { ORG_COOKIE } = await import("@/lib/env");
    const jar = await cookies();
    jar.delete(ORG_COOKIE);
    done(next, "Exited support mode");
  });
}

/** Used by the admin overview to surface flags that are enabled for everyone. */
export async function globalFlags() {
  await requireSuperAdmin();
  const rows = await db.select().from(featureFlags);
  return rows.filter((f) => f.enabled && !parseJson<string[] | null>(f.orgIds, null));
}
