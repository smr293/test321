import { eq } from "drizzle-orm";
import { db } from "@/db/client";
import { featureFlags, platformSettings, saasPlans } from "@/db/schema";
import { PLATFORM_DEFAULTS } from "./saas";

/**
 * Production-safe baseline: SaaS catalog, platform settings and feature flags.
 * Unlike the demo seed this never creates gyms or members, so it is safe to run
 * against an empty production database.
 */
export async function ensurePlatformDefaults() {
  const plans = [
    {
      slug: "starter",
      name: "Starter",
      description: "One location, memberships and class scheduling.",
      priceMonthlyCents: 49000,
      priceAnnualCents: 490000,
      maxLocations: 1,
      maxActiveMembers: 75,
      maxCoaches: 3,
      features: JSON.stringify(["members", "plans", "classes", "bookings", "attendance"]),
      sortOrder: 0,
    },
    {
      slug: "pro",
      name: "Pro",
      description: "Multiple coaches, fighter tracking, payments and analytics.",
      priceMonthlyCents: 99000,
      priceAnnualCents: 990000,
      maxLocations: 3,
      maxActiveMembers: 400,
      maxCoaches: 15,
      features: JSON.stringify([
        "members",
        "plans",
        "classes",
        "bookings",
        "attendance",
        "fighters",
        "fight_camps",
        "payments",
        "analytics",
        "messages",
        "programs",
      ]),
      sortOrder: 1,
    },
    {
      slug: "elite",
      name: "Elite",
      description: "Unlimited scale for multi-location fight gyms and teams.",
      priceMonthlyCents: 199000,
      priceAnnualCents: 1990000,
      maxLocations: 20,
      maxActiveMembers: 5000,
      maxCoaches: 100,
      features: JSON.stringify([
        "members",
        "plans",
        "classes",
        "bookings",
        "attendance",
        "fighters",
        "fight_camps",
        "payments",
        "analytics",
        "messages",
        "programs",
        "advanced_reports",
        "api",
        "sso",
      ]),
      sortOrder: 2,
    },
  ];
  for (const plan of plans) {
    const existing = await db.select({ id: saasPlans.id }).from(saasPlans).where(eq(saasPlans.slug, plan.slug)).limit(1);
    if (!existing[0]) await db.insert(saasPlans).values(plan);
  }

  for (const [key, value] of Object.entries(PLATFORM_DEFAULTS)) {
    await db
      .insert(platformSettings)
      .values({ key, value })
      .onConflictDoNothing({ target: platformSettings.key });
  }

  const flags = [
    { key: "fighter_portal", name: "Fighter portal", description: "Member-facing training, schedule and fight camp portal.", enabled: true },
    { key: "qr_checkin", name: "QR check-in", description: "Rotating QR codes at the door.", enabled: true },
    { key: "stripe_billing", name: "Stripe billing", description: "Card payments via Stripe. Sandbox when keys are absent.", enabled: false },
    { key: "advanced_analytics", name: "Advanced analytics", description: "Cohort, retention and revenue analytics.", enabled: false },
  ];
  for (const flag of flags) {
    await db.insert(featureFlags).values(flag).onConflictDoNothing({ target: featureFlags.key });
  }
}
