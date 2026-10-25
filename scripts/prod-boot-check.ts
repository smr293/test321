/**
 * Verifies the production first-boot path against a throwaway database:
 * migrations → platform defaults → optional demo seed → bootstrap admin.
 * Usage: NODE_ENV=production DEMO_SEED=true DATABASE_URL=file:/tmp/x.db npx tsx scripts/prod-boot-check.ts
 */
import { drizzle } from "drizzle-orm/better-sqlite3";
import { migrate } from "drizzle-orm/better-sqlite3/migrator";
import { eq } from "drizzle-orm";
import { sqlite, db } from "../src/db/client";
import { ensureBootstrap } from "../src/lib/bootstrap";
import { featureFlags, organizations, orgMembers, platformSettings, saasPlans, users } from "../src/db/schema";

async function main() {
  migrate(drizzle(sqlite), { migrationsFolder: "./drizzle" });
  await ensureBootstrap();
  const [orgs, members, admin, plans, settings, flags] = await Promise.all([
    db.select().from(organizations),
    db.select().from(orgMembers),
    db.select().from(users).where(eq(users.email, "admin@mmaos.local")),
    db.select().from(saasPlans),
    db.select().from(platformSettings),
    db.select().from(featureFlags),
  ]);
  console.log({
    orgs: orgs.map((o) => o.name),
    members: members.length,
    superAdmin: admin[0]?.isSuperAdmin,
    mustChangePassword: admin[0]?.mustChangePassword,
    plans: plans.length,
    settings: settings.length,
    flags: flags.length,
    nodeEnv: process.env.NODE_ENV,
    demoSeed: process.env.DEMO_SEED === "true",
  });
  process.exit(0);
}
main().catch((e) => { console.error(e); process.exit(1); });
