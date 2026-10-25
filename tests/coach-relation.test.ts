import { describe, expect, it } from "vitest";
import { ForbiddenError, assertCoachOwnsFighter, effectivePermissions, getAthleteCoaches, getCoachAthleteIds } from "@/lib/authz";
import { makeMember, makeOrg, linkCoach } from "./helpers";

/**
 * "Elev och tränare" — the coach ↔ athlete relationship is a first-class
 * domain concept: coaches own athletes, athletes see their coach, and coach
 * powers are limited to the athletes they are assigned.
 */
describe("coach ↔ athlete relationship", () => {
  it("links a coach to an athlete and exposes the relationship from both sides", async () => {
    const { org } = await makeOrg("coach-rel");
    const { member: coach, user: coachUser } = await makeMember(org.id, "coach", "rel-coach");
    const { member: athlete, user: athleteUser } = await makeMember(org.id, "fighter", "rel-athlete");
    await linkCoach(org.id, coach.id, athlete.id);

    const athleteIds = await getCoachAthleteIds(org.id, coach.id);
    expect(athleteIds).toContain(athlete.id);

    const coaches = await getAthleteCoaches(org.id, athlete.id);
    expect(coaches).toHaveLength(1);
    expect(coaches[0].user.id).toBe(coachUser.id);
    expect(coaches[0].member.id).toBe(coach.id);
    expect(coaches[0].assignment.fighterMemberId).toBe(athlete.id);
    void athleteUser;
  });

  it("allows a coach to act on an assigned athlete", async () => {
    const { org } = await makeOrg("coach-allow");
    const { member: coach } = await makeMember(org.id, "coach", "allow-coach");
    const { member: athlete } = await makeMember(org.id, "fighter", "allow-athlete");
    await linkCoach(org.id, coach.id, athlete.id);
    await expect(assertCoachOwnsFighter(org.id, coach.id, athlete.id)).resolves.toBeUndefined();
  });

  it("blocks a coach from an unassigned athlete in the same gym", async () => {
    const { org } = await makeOrg("coach-deny");
    const { member: coach } = await makeMember(org.id, "coach", "deny-coach");
    const { member: other } = await makeMember(org.id, "fighter", "deny-athlete");
    await expect(assertCoachOwnsFighter(org.id, coach.id, other.id)).rejects.toBeInstanceOf(ForbiddenError);
    expect(await getCoachAthleteIds(org.id, coach.id)).not.toContain(other.id);
  });

  it("blocks a coach from an athlete in another gym even if an assignment id matches", async () => {
    const { org: orgA } = await makeOrg("coach-x1");
    const { org: orgB } = await makeOrg("coach-x2");
    const { member: coach } = await makeMember(orgA.id, "coach", "x-coach");
    const { member: athleteB } = await makeMember(orgB.id, "fighter", "x-athlete");
    await expect(assertCoachOwnsFighter(orgA.id, coach.id, athleteB.id)).rejects.toBeInstanceOf(ForbiddenError);
    expect(await getAthleteCoaches(orgA.id, athleteB.id)).toHaveLength(0);
  });

  it("gives coaches training permissions but no billing or staff management", () => {
    const perms = effectivePermissions("coach");
    for (const allowed of ["fighters:read", "classes:manage", "bookings:manage", "attendance:manage", "programs:manage", "fightcamps:manage", "messages:send"] as const) {
      expect(perms.has(allowed)).toBe(true);
    }
    for (const denied of ["org:manage", "staff:manage", "members:write", "memberships:manage", "billing:read", "billing:manage"] as const) {
      expect(perms.has(denied)).toBe(false);
    }
  });

  it("removes access when the assignment is deleted", async () => {
    const { org } = await makeOrg("coach-unlink");
    const { member: coach } = await makeMember(org.id, "coach", "unlink-coach");
    const { member: athlete } = await makeMember(org.id, "fighter", "unlink-athlete");
    const assignment = await linkCoach(org.id, coach.id, athlete.id);
    const { db } = await import("@/db/client");
    const { coachAssignments } = await import("@/db/schema");
    const { eq } = await import("drizzle-orm");
    await db.delete(coachAssignments).where(eq(coachAssignments.id, assignment.id));
    await expect(assertCoachOwnsFighter(org.id, coach.id, athlete.id)).rejects.toBeInstanceOf(ForbiddenError);
    expect(await getAthleteCoaches(org.id, athlete.id)).toHaveLength(0);
  });
});
