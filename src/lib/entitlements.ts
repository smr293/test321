import { and, count, eq, inArray, isNull } from "drizzle-orm";
import { db } from "@/db/client";
import { gymLocations, orgMembers, saasPlans, saasSubscriptions } from "@/db/schema";
import { parseJson } from "./utils";

export type Entitlements = {
  planName: string;
  planSlug: string;
  status: "active" | "trialing" | "past_due" | "cancelled" | "paused" | "none";
  maxLocations: number;
  maxActiveMembers: number;
  maxCoaches: number;
  features: string[];
  usage: { locations: number; activeMembers: number; coaches: number };
  canAddLocation: boolean;
  canAddMember: boolean;
  canAddCoach: boolean;
};

const FREE_FALLBACK = { maxLocations: 1, maxActiveMembers: 25, maxCoaches: 1, features: ["members", "classes"] };

/**
 * Backend-enforced SaaS plan limits. Never rely on the UI to hide actions —
 * every create path calls these checks.
 */
export async function getEntitlements(orgId: string): Promise<Entitlements> {
  const row = (
    await db
      .select({ sub: saasSubscriptions, plan: saasPlans })
      .from(saasSubscriptions)
      .innerJoin(saasPlans, eq(saasPlans.id, saasSubscriptions.planId))
      .where(eq(saasSubscriptions.orgId, orgId))
      .limit(1)
  )[0];

  const [locations] = await db
    .select({ n: count() })
    .from(gymLocations)
    .where(and(eq(gymLocations.orgId, orgId), isNull(gymLocations.archivedAt)));
  const [members] = await db
    .select({ n: count() })
    .from(orgMembers)
    .where(and(eq(orgMembers.orgId, orgId), eq(orgMembers.role, "fighter"), inArray(orgMembers.status, ["active", "invited"])));
  const [coaches] = await db
    .select({ n: count() })
    .from(orgMembers)
    .where(and(eq(orgMembers.orgId, orgId), eq(orgMembers.role, "coach"), inArray(orgMembers.status, ["active", "invited"])));

  const usage = {
    locations: Number(locations?.n ?? 0),
    activeMembers: Number(members?.n ?? 0),
    coaches: Number(coaches?.n ?? 0),
  };

  if (!row) {
    return {
      planName: "No plan",
      planSlug: "none",
      status: "none",
      ...FREE_FALLBACK,
      usage,
      canAddLocation: usage.locations < FREE_FALLBACK.maxLocations,
      canAddMember: usage.activeMembers < FREE_FALLBACK.maxActiveMembers,
      canAddCoach: usage.coaches < FREE_FALLBACK.maxCoaches,
    };
  }

  const suspended = ["cancelled", "paused"].includes(row.sub.status);
  return {
    planName: row.plan.name,
    planSlug: row.plan.slug,
    status: row.sub.status,
    maxLocations: row.plan.maxLocations,
    maxActiveMembers: row.plan.maxActiveMembers,
    maxCoaches: row.plan.maxCoaches,
    features: parseJson<string[]>(row.plan.features, []),
    usage,
    canAddLocation: !suspended && usage.locations < row.plan.maxLocations,
    canAddMember: !suspended && usage.activeMembers < row.plan.maxActiveMembers,
    canAddCoach: !suspended && usage.coaches < row.plan.maxCoaches,
  };
}

export function hasFeature(ent: Entitlements, feature: string) {
  return ent.features.includes(feature);
}
