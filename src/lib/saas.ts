import { and, count, desc, eq, gte, inArray, like, or, sql } from "drizzle-orm";
import { db } from "@/db/client";
import {
  auditLogs,
  dataRequests,
  emailOutbox,
  featureFlags,
  gymLocations,
  invoices,
  orgMembers,
  organizations,
  payments,
  platformSettings,
  saasPlans,
  saasSubscriptions,
  supportTickets,
  users,
} from "@/db/schema";
import { addDays, parseJson } from "./utils";

/* ------------------------------------------------------------------ */
/* Platform settings                                                   */
/* ------------------------------------------------------------------ */

export const PLATFORM_DEFAULTS = {
  platformName: "MMA OS",
  supportEmail: "support@mmaos.local",
  allowSignups: "true",
  allowNewOrgs: "true",
  trialDays: "14",
  maintenanceMode: "false",
  defaultCurrency: "SEK",
  supportResponseSla: "24",
  maxOrgsPerUser: "3",
} as const;

export type PlatformSettings = Record<keyof typeof PLATFORM_DEFAULTS, string>;

export async function getPlatformSettings(): Promise<PlatformSettings> {
  const rows = await db.select().from(platformSettings);
  const map = new Map(rows.map((r) => [r.key, r.value]));
  const out = {} as PlatformSettings;
  for (const [key, fallback] of Object.entries(PLATFORM_DEFAULTS) as [keyof PlatformSettings, string][]) {
    out[key] = map.get(key) ?? fallback;
  }
  return out;
}

export async function isSignupAllowed() {
  const settings = await getPlatformSettings();
  return settings.allowSignups === "true" && settings.maintenanceMode !== "true";
}

/* ------------------------------------------------------------------ */
/* Overview + revenue                                                  */
/* ------------------------------------------------------------------ */

export async function platformOverview() {
  const since30 = addDays(new Date(), -30);
  const [
    orgRows,
    userRows,
    memberRows,
    ticketRows,
    requestRows,
    subRows,
    newOrgs,
    newUsers,
    emailRows,
  ] = await Promise.all([
    db.select({ status: organizations.status, n: count() }).from(organizations).groupBy(organizations.status),
    db.select({ status: users.status, n: count() }).from(users).groupBy(users.status),
    db
      .select({ n: count() })
      .from(orgMembers)
      .where(and(inArray(orgMembers.status, ["active", "invited"]), inArray(orgMembers.role, ["fighter"]))),
    db.select({ status: supportTickets.status, n: count() }).from(supportTickets).groupBy(supportTickets.status),
    db.select({ status: dataRequests.status, n: count() }).from(dataRequests).groupBy(dataRequests.status),
    db
      .select({ sub: saasSubscriptions, plan: saasPlans })
      .from(saasSubscriptions)
      .innerJoin(saasPlans, eq(saasPlans.id, saasSubscriptions.planId)),
    db.select({ n: count() }).from(organizations).where(gte(organizations.createdAt, since30)),
    db.select({ n: count() }).from(users).where(gte(users.createdAt, since30)),
    db.select({ status: emailOutbox.status, n: count() }).from(emailOutbox).groupBy(emailOutbox.status),
  ]);

  const byStatus = (rows: { status: string; n: number }[]) => Object.fromEntries(rows.map((r) => [r.status, r.n]));
  const billable = subRows.filter((r) => r.sub.status === "active");
  const trialing = subRows.filter((r) => r.sub.status === "trialing");
  const pastDue = subRows.filter((r) => r.sub.status === "past_due");
  const mrrCents = billable.reduce((sum, r) => sum + r.plan.priceMonthlyCents * Math.max(1, r.sub.seats), 0);
  const mrrByPlan = new Map<string, { plan: string; mrr: number; orgs: number; seats: number }>();
  for (const row of billable) {
    const entry = mrrByPlan.get(row.plan.id) ?? { plan: row.plan.name, mrr: 0, orgs: 0, seats: 0 };
    entry.mrr += row.plan.priceMonthlyCents * Math.max(1, row.sub.seats);
    entry.orgs += 1;
    entry.seats += Math.max(1, row.sub.seats);
    mrrByPlan.set(row.plan.id, entry);
  }

  return {
    orgs: {
      total: orgRows.reduce((s, r) => s + r.n, 0),
      active: byStatus(orgRows).active ?? 0,
      suspended: byStatus(orgRows).suspended ?? 0,
      archived: byStatus(orgRows).archived ?? 0,
      new30d: newOrgs[0]?.n ?? 0,
    },
    users: {
      total: userRows.reduce((s, r) => s + r.n, 0),
      active: byStatus(userRows).active ?? 0,
      suspended: byStatus(userRows).suspended ?? 0,
      pendingDeletion: byStatus(userRows).pending_deletion ?? 0,
      new30d: newUsers[0]?.n ?? 0,
    },
    fighters: memberRows[0]?.n ?? 0,
    mrrCents,
    arrCents: mrrCents * 12,
    payingOrgs: billable.length,
    trialingOrgs: trialing.length,
    pastDueOrgs: pastDue.length,
    churnedOrgs: subRows.filter((r) => r.sub.status === "cancelled").length,
    mrrByPlan: [...mrrByPlan.values()].sort((a, b) => b.mrr - a.mrr),
    subscriptions: subRows,
    tickets: { open: byStatus(ticketRows).open ?? 0, pending: byStatus(ticketRows).pending ?? 0, resolved: byStatus(ticketRows).resolved ?? 0, closed: byStatus(ticketRows).closed ?? 0 },
    dataRequests: { pending: byStatus(requestRows).pending ?? 0 },
    email: { queued: byStatus(emailRows).queued ?? 0, sent: byStatus(emailRows).sent ?? 0, failed: byStatus(emailRows).failed ?? 0 },
  };
}

/** Monthly gym revenue (member payments) across all tenants, last `months` months. */
export async function platformRevenueSeries(months = 6) {
  const rows = await db
    .select({
      month: sql<string>`strftime('%Y-%m', ${payments.processedAt} / 1000, 'unixepoch')`,
      amount: sql<number>`coalesce(sum(${payments.amountCents}), 0)`,
      n: count(),
    })
    .from(payments)
    .where(and(eq(payments.status, "succeeded"), gte(payments.processedAt, addDays(new Date(), -31 * months))))
    .groupBy(sql`strftime('%Y-%m', ${payments.processedAt} / 1000, 'unixepoch')`)
    .orderBy(sql`strftime('%Y-%m', ${payments.processedAt} / 1000, 'unixepoch')`);
  return rows.map((r) => ({ month: r.month, amountCents: Number(r.amount), count: r.n }));
}

export async function platformTotals() {
  const [invoiceRow] = await db
    .select({
      billed: sql<number>`coalesce(sum(${invoices.amountCents} + ${invoices.taxCents}), 0)`,
      outstanding: sql<number>`coalesce(sum(case when ${invoices.status} in ('open','uncollectible') then ${invoices.amountCents} + ${invoices.taxCents} else 0 end), 0)`,
    })
    .from(invoices);
  return {
    billedCents: Number(invoiceRow?.billed ?? 0),
    outstandingCents: Number(invoiceRow?.outstanding ?? 0),
  };
}

/* ------------------------------------------------------------------ */
/* Organizations                                                       */
/* ------------------------------------------------------------------ */

export type OrgListRow = {
  org: typeof organizations.$inferSelect;
  plan: typeof saasPlans.$inferSelect | null;
  sub: typeof saasSubscriptions.$inferSelect | null;
  members: number;
  fighters: number;
  locations: number;
  ownerEmail: string | null;
  ownerName: string | null;
};

export async function listOrganizations(opts: { q?: string; status?: string } = {}): Promise<OrgListRow[]> {
  const where = [];
  if (opts.q) where.push(or(like(organizations.name, `%${opts.q}%`), like(organizations.slug, `%${opts.q}%`)));
  if (opts.status && ["active", "suspended", "archived"].includes(opts.status)) where.push(eq(organizations.status, opts.status as "active"));

  const rows = await db
    .select({
      org: organizations,
      plan: saasPlans,
      sub: saasSubscriptions,
      ownerEmail: users.email,
      ownerName: users.name,
      members: sql<number>`(select count(*) from org_members m where m.org_id = ${organizations.id} and m.status in ('active','invited'))`,
      fighters: sql<number>`(select count(*) from org_members m where m.org_id = ${organizations.id} and m.role = 'fighter' and m.status in ('active','invited'))`,
      locations: sql<number>`(select count(*) from gym_locations l where l.org_id = ${organizations.id} and l.archived_at is null)`,
    })
    .from(organizations)
    .leftJoin(users, eq(users.id, organizations.ownerId))
    .leftJoin(saasSubscriptions, eq(saasSubscriptions.orgId, organizations.id))
    .leftJoin(saasPlans, eq(saasPlans.id, saasSubscriptions.planId))
    .where(where.length ? and(...where) : undefined)
    .orderBy(desc(organizations.createdAt));
  return rows.map((r) => ({ ...r, members: Number(r.members), fighters: Number(r.fighters), locations: Number(r.locations) }));
}

export async function getOrgForAdmin(orgId: string) {
  const row = (
    await db
      .select({ org: organizations, plan: saasPlans, sub: saasSubscriptions, ownerEmail: users.email, ownerName: users.name })
      .from(organizations)
      .leftJoin(users, eq(users.id, organizations.ownerId))
      .leftJoin(saasSubscriptions, eq(saasSubscriptions.orgId, organizations.id))
      .leftJoin(saasPlans, eq(saasPlans.id, saasSubscriptions.planId))
      .where(eq(organizations.id, orgId))
      .limit(1)
  )[0];
  if (!row) return null;
  const [members, locations, revenue, staff] = await Promise.all([
    db.select({ role: orgMembers.role, status: orgMembers.status, n: count() }).from(orgMembers).where(eq(orgMembers.orgId, orgId)).groupBy(orgMembers.role, orgMembers.status),
    db.select().from(gymLocations).where(eq(gymLocations.orgId, orgId)),
    db
      .select({ paid: sql<number>`coalesce(sum(${payments.amountCents}), 0)`, n: count() })
      .from(payments)
      .innerJoin(invoices, eq(invoices.id, payments.invoiceId))
      .where(and(eq(invoices.orgId, orgId), eq(payments.status, "succeeded"))),
    db
      .select({ member: orgMembers, user: users })
      .from(orgMembers)
      .innerJoin(users, eq(users.id, orgMembers.userId))
      .where(and(eq(orgMembers.orgId, orgId), inArray(orgMembers.role, ["owner", "manager", "coach"])))
      .limit(20),
  ]);
  return {
    ...row,
    memberBreakdown: members,
    locations,
    collectedCents: Number(revenue[0]?.paid ?? 0),
    paymentCount: revenue[0]?.n ?? 0,
    staff,
  };
}

/* ------------------------------------------------------------------ */
/* Users, plans, flags, audit, inboxes                                 */
/* ------------------------------------------------------------------ */

/** Safe projection: never selects password hashes, MFA secrets or reset tokens. */
export const SAFE_USER_COLUMNS = {
  id: users.id,
  email: users.email,
  name: users.name,
  phone: users.phone,
  status: users.status,
  isSuperAdmin: users.isSuperAdmin,
  mfaEnabled: users.mfaEnabled,
  mustChangePassword: users.mustChangePassword,
  lastLoginAt: users.lastLoginAt,
  lockedUntil: users.lockedUntil,
  theme: users.theme,
  locale: users.locale,
  createdAt: users.createdAt,
  updatedAt: users.updatedAt,
};

export async function listPlatformUsers(q?: string) {
  const where = q ? or(like(users.email, `%${q}%`), like(users.name, `%${q}%`)) : undefined;
  return db
    .select({
      user: SAFE_USER_COLUMNS,
      orgs: sql<number>`(select count(*) from org_members m where m.user_id = ${users.id} and m.status <> 'archived')`,
    })
    .from(users)
    .where(where)
    .orderBy(desc(users.createdAt))
    .limit(200);
}

export async function listSaasPlans() {
  const rows = await db.select().from(saasPlans).orderBy(saasPlans.sortOrder, saasPlans.name);
  const counts = await db
    .select({ planId: saasSubscriptions.planId, n: count() })
    .from(saasSubscriptions)
    .where(inArray(saasSubscriptions.status, ["active", "trialing", "past_due"]))
    .groupBy(saasSubscriptions.planId);
  const map = new Map(counts.map((c) => [c.planId, c.n]));
  return rows.map((p) => ({ ...p, orgs: map.get(p.id) ?? 0, features: parseJson<string[]>(p.features, []) }));
}

export async function listFlags() {
  return db.select().from(featureFlags).orderBy(featureFlags.key);
}

export async function auditSearch(opts: { q?: string; orgId?: string; action?: string } = {}) {
  const where = [];
  if (opts.q) where.push(or(like(auditLogs.action, `%${opts.q}%`), like(auditLogs.actorName, `%${opts.q}%`), like(auditLogs.targetId, `%${opts.q}%`)));
  if (opts.orgId) where.push(eq(auditLogs.orgId, opts.orgId));
  if (opts.action) where.push(eq(auditLogs.action, opts.action));
  return db.select().from(auditLogs).where(where.length ? and(...where) : undefined).orderBy(desc(auditLogs.createdAt)).limit(200);
}

export async function listTickets() {
  return db
    .select({ ticket: supportTickets, orgName: organizations.name, userEmail: users.email, userName: users.name })
    .from(supportTickets)
    .leftJoin(organizations, eq(organizations.id, supportTickets.orgId))
    .leftJoin(users, eq(users.id, supportTickets.userId))
    .orderBy(desc(supportTickets.createdAt))
    .limit(200);
}

export async function listDataRequests() {
  return db
    .select({ request: dataRequests, userEmail: users.email, userName: users.name, userStatus: users.status })
    .from(dataRequests)
    .innerJoin(users, eq(users.id, dataRequests.userId))
    .orderBy(desc(dataRequests.createdAt))
    .limit(200);
}

export async function listEmailOutbox(status?: string) {
  const where = status && ["queued", "sent", "failed"].includes(status) ? eq(emailOutbox.status, status as "queued") : undefined;
  return db.select().from(emailOutbox).where(where).orderBy(desc(emailOutbox.createdAt)).limit(200);
}
