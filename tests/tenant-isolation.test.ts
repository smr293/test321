import { describe, expect, it } from "vitest";
import { eq } from "drizzle-orm";
import { db } from "@/db/client";
import { invoices, orgMembers } from "@/db/schema";
import { ForbiddenError, can, effectivePermissions, getCoachAthleteIds, getMemberForUser, getTenantMember, isStaffRole, PERMISSIONS } from "@/lib/authz";
import { createInvoiceForSubscription, createMembership, getMemberSubscription } from "@/lib/membership";
import { bookSession, BookingError } from "@/lib/booking";
import { makeClassWithSession, makeMember, makeOrg, makePlan, memberByEmail, seededOrg } from "./helpers";

/**
 * Tenant isolation scenarios A–E.
 *
 * A  cross-tenant member read by id
 * B  coach scoping to assigned athletes only
 * C  fighter privilege escalation
 * D  cross-tenant billing / membership objects
 * E  cross-tenant booking + query scoping
 */
describe("tenant isolation", () => {
  it("A: rejects reading a member from another gym by id", async () => {
    const { org: orgA } = await makeOrg("iso-a1");
    const { org: orgB } = await makeOrg("iso-a2");
    const { member: memberB } = await makeMember(orgB.id, "fighter", "a-target");
    await expect(getTenantMember(orgA.id, memberB.id)).rejects.toBeInstanceOf(ForbiddenError);
    const ok = await getTenantMember(orgB.id, memberB.id);
    expect(ok.member.id).toBe(memberB.id);
  });

  it("A: does not resolve the active gym for a non-member", async () => {
    const { org: orgA, owner } = await makeOrg("iso-a3");
    const { org: orgB } = await makeOrg("iso-a4");
    expect(await getMemberForUser(owner.id, orgA.id)).not.toBeNull();
    expect(await getMemberForUser(owner.id, orgB.id)).toBeNull();
  });

  it("B: coach sees only assigned athletes", async () => {
    const { org } = await makeOrg("iso-b");
    const { member: coach } = await makeMember(org.id, "coach", "b-coach");
    const { member: athlete1 } = await makeMember(org.id, "fighter", "b-f1");
    const { member: athlete2 } = await makeMember(org.id, "fighter", "b-f2");
    const { coachAssignments } = await import("@/db/schema");
    await db.insert(coachAssignments).values({ orgId: org.id, coachMemberId: coach.id, fighterMemberId: athlete1.id });
    const ids = await getCoachAthleteIds(org.id, coach.id);
    expect(ids).toEqual([athlete1.id]);
    expect(ids).not.toContain(athlete2.id);
  });

  it("B: coach cannot use manager-only permissions", () => {
    const perms = effectivePermissions("coach");
    expect(perms.has("fighters:read")).toBe(true);
    expect(perms.has("members:write")).toBe(false);
    expect(perms.has("billing:manage")).toBe(false);
    expect(perms.has("staff:manage")).toBe(false);
    expect(can("coach", "org:manage")).toBe(false);
  });

  it("C: fighter role has no staff permissions, even with forged overrides", () => {
    for (const permission of PERMISSIONS) {
      expect(can("fighter", permission)).toBe(false);
      expect(can("fighter", permission, JSON.stringify(PERMISSIONS))).toBe(false);
    }
  });

  it("C: the gym workspace is staff-only (fighter is never a staff role)", () => {
    expect(isStaffRole("owner")).toBe(true);
    expect(isStaffRole("manager")).toBe(true);
    expect(isStaffRole("coach")).toBe(true);
    expect(isStaffRole("fighter")).toBe(false);
  });

  it("C: manager permission overrides cannot invent unknown permissions", () => {
    const perms = effectivePermissions("manager", JSON.stringify(["members:read", "root:everything"]));
    expect(perms.has("members:read")).toBe(true);
    expect(perms.size).toBeLessThan(PERMISSIONS.length);
    expect([...perms].every((p) => (PERMISSIONS as readonly string[]).includes(p))).toBe(true);
  });

  it("C: owners always receive the full permission set", () => {
    expect(effectivePermissions("owner").size).toBe(PERMISSIONS.length);
  });

  it("D: subscriptions and invoices are scoped to their own gym", async () => {
    const { org: orgA } = await makeOrg("iso-d1");
    const { org: orgB } = await makeOrg("iso-d2");
    const planA = await makePlan(orgA.id);
    const { member: memberA } = await makeMember(orgA.id, "fighter", "d-member");
    const { subscription } = await createMembership({ orgId: orgA.id, memberId: memberA.id, planId: planA.id });

    const wrong = await getMemberSubscription(orgB.id, memberA.id);
    expect(wrong.current).toBeNull();
    const right = await getMemberSubscription(orgA.id, memberA.id);
    expect(right.current?.subscription.id).toBe(subscription.id);

    await expect(createInvoiceForSubscription({ orgId: orgB.id, subscriptionId: subscription.id })).rejects.toThrow(/Subscription not found/);
    const invoice = await createInvoiceForSubscription({ orgId: orgA.id, subscriptionId: subscription.id });
    expect(invoice.number).toMatch(/^INV-\d{4}-\d{5}$/);
    const scoped = await db.select().from(invoices).where(eq(invoices.id, invoice.id));
    expect(scoped[0]?.orgId).toBe(orgA.id);
  });

  it("D: creating a membership with a plan from another gym fails", async () => {
    const { org: orgA } = await makeOrg("iso-d3");
    const { org: orgB } = await makeOrg("iso-d4");
    const planB = await makePlan(orgB.id);
    const { member: memberA } = await makeMember(orgA.id, "fighter", "d-m2");
    await expect(createMembership({ orgId: orgA.id, memberId: memberA.id, planId: planB.id })).rejects.toThrow(/plan not found/i);
  });

  it("E: a member of gym A cannot book a class in gym B", async () => {
    const { org: orgA } = await makeOrg("iso-e1");
    const { org: orgB } = await makeOrg("iso-e2");
    const { member: memberA } = await makeMember(orgA.id, "fighter", "e-member");
    const planA = await makePlan(orgA.id);
    await createMembership({ orgId: orgA.id, memberId: memberA.id, planId: planA.id });
    const { session } = await makeClassWithSession(orgB.id);
    await expect(bookSession({ orgId: orgB.id, sessionId: session.id, memberId: memberA.id })).rejects.toBeInstanceOf(BookingError);
  });

  it("E: roster queries never leak members from another tenant", async () => {
    const seeded = await seededOrg();
    const { org: other } = await makeOrg("iso-e3");
    const rows = await db.select().from(orgMembers).where(eq(orgMembers.orgId, seeded.id));
    expect(rows.length).toBeGreaterThan(0);
    expect(rows.every((r) => r.orgId === seeded.id)).toBe(true);
    const otherRows = await db.select().from(orgMembers).where(eq(orgMembers.orgId, other.id));
    expect(otherRows.every((r) => r.orgId === other.id)).toBe(true);
    expect(rows.some((r) => otherRows.some((o) => o.id === r.id))).toBe(false);
  });

  it("seeds two distinct tenants with separate memberships", async () => {
    const nordic = await seededOrg("Nordic Fight Lab");
    const southside = await seededOrg("Southside MMA");
    expect(nordic.id).not.toBe(southside.id);
    const nordicFighter = await memberByEmail(nordic.id, "fighter@demo.mma");
    const southsideFighter = await memberByEmail(southside.id, "member@southside.mma");
    expect(nordicFighter.member.orgId).toBe(nordic.id);
    expect(southsideFighter.member.orgId).toBe(southside.id);
    await expect(getTenantMember(nordic.id, southsideFighter.member.id)).rejects.toBeInstanceOf(ForbiddenError);
  });
});
