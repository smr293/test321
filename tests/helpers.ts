import { and, eq } from "drizzle-orm";
import { db } from "@/db/client";
import {
  coachAssignments,
  membershipPlans,
  orgMembers,
  organizations,
  saasPlans,
  saasSubscriptions,
  users,
} from "@/db/schema";
import { hashPassword } from "@/lib/password";

let counter = 0;
const uniq = () => `${Date.now().toString(36)}-${(counter += 1)}`;

export async function seededOrg(name = "Nordic Fight Lab") {
  const org = (await db.select().from(organizations).where(eq(organizations.name, name)).limit(1))[0];
  if (!org) throw new Error(`Seed org ${name} missing — run npm run db:seed`);
  return org;
}

export async function userWithPassword(email: string, password = "demo1234", opts: { superAdmin?: boolean } = {}) {
  const existing = (await db.select().from(users).where(eq(users.email, email)).limit(1))[0];
  if (existing) return existing;
  return (
    await db
      .insert(users)
      .values({ email, name: email.split("@")[0], passwordHash: await hashPassword(password), isSuperAdmin: opts.superAdmin ?? false })
      .returning()
  )[0];
}

export async function makeOrg(label = uniq()) {
  const owner = await userWithPassword(`owner-${label}@test.mma`);
  const org = (
    await db.insert(organizations).values({ name: `Test Gym ${label}`, slug: `test-gym-${label}`, ownerId: owner.id }).returning()
  )[0];
  const ownerMember = (
    await db.insert(orgMembers).values({ orgId: org.id, userId: owner.id, role: "owner", status: "active", joinedAt: new Date() }).returning()
  )[0];
  return { org, owner, ownerMember };
}

export async function makeMember(orgId: string, role: "manager" | "coach" | "fighter", label = uniq()) {
  const user = await userWithPassword(`${role}-${label}@test.mma`);
  const member = (
    await db.insert(orgMembers).values({ orgId, userId: user.id, role, status: "active", joinedAt: new Date() }).returning()
  )[0];
  return { user, member };
}

export async function makePlan(orgId: string, overrides: Partial<typeof membershipPlans.$inferInsert> = {}) {
  return (
    await db
      .insert(membershipPlans)
      .values({ orgId, name: `Plan ${uniq()}`, priceCents: 50000, currency: "SEK", interval: "month", ...overrides })
      .returning()
  )[0];
}

export async function assignPlan(orgId: string, planId: string, seats = 1, status: "active" | "trialing" | "past_due" = "active") {
  const existing = (await db.select().from(saasSubscriptions).where(eq(saasSubscriptions.orgId, orgId)).limit(1))[0];
  if (existing) {
    return (await db.update(saasSubscriptions).set({ planId, seats, status }).where(eq(saasSubscriptions.id, existing.id)).returning())[0];
  }
  return (await db.insert(saasSubscriptions).values({ orgId, planId, seats, status }).returning())[0];
}

export async function linkCoach(orgId: string, coachMemberId: string, fighterMemberId: string) {
  const existing = (
    await db
      .select()
      .from(coachAssignments)
      .where(and(eq(coachAssignments.coachMemberId, coachMemberId), eq(coachAssignments.fighterMemberId, fighterMemberId)))
      .limit(1)
  )[0];
  if (existing) return existing;
  return (await db.insert(coachAssignments).values({ orgId, coachMemberId, fighterMemberId }).returning())[0];
}

export async function saasPlanBySlug(slug: string) {
  const row = (await db.select().from(saasPlans).where(eq(saasPlans.slug, slug)).limit(1))[0];
  if (!row) throw new Error(`SaaS plan ${slug} missing`);
  return row;
}

export async function memberByEmail(orgId: string, email: string) {
  const row = (
    await db
      .select({ member: orgMembers, user: users })
      .from(orgMembers)
      .innerJoin(users, eq(users.id, orgMembers.userId))
      .where(and(eq(orgMembers.orgId, orgId), eq(users.email, email)))
      .limit(1)
  )[0];
  if (!row) throw new Error(`Member ${email} not found in org`);
  return row;
}

export async function makeClassWithSession(orgId: string, opts: { capacity?: number; startsInHours?: number; creditCount?: number } = {}) {
  const { classes, classSessions, gymLocations } = await import("@/db/schema");
  const location = (await db.select().from(gymLocations).where(eq(gymLocations.orgId, orgId)).limit(1))[0];
  const cls = (
    await db
      .insert(classes)
      .values({
        orgId,
        locationId: location?.id ?? null,
        name: `Test class ${uniq()}`,
        discipline: "MMA",
        capacity: opts.capacity ?? 2,
        durationMinutes: 60,
        bookingWindowDays: 14,
      })
      .returning()
  )[0];
  const startsAt = new Date(Date.now() + (opts.startsInHours ?? 24) * 3600000);
  const session = (
    await db
      .insert(classSessions)
      .values({ orgId, classId: cls.id, locationId: location?.id ?? null, startsAt, endsAt: new Date(startsAt.getTime() + 3600000), capacity: opts.capacity ?? 2 })
      .returning()
  )[0];
  return { cls, session };
}
