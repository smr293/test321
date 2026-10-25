import { eq } from "drizzle-orm";
import { db } from "@/db/client";
import { organizations, users } from "@/db/schema";
import { env } from "./env";
import { hashPassword } from "./password";
import { ensurePlatformDefaults } from "./platform-defaults";

let ran: Promise<void> | null = null;

/**
 * Idempotent bootstrap run at server start. Guarantees the development admin
 * exists (admin/admin only in non-production) and fills an empty database with
 * labelled demo data so the app is immediately usable.
 */
export async function ensureBootstrap() {
  if (ran) return ran;
  ran = (async () => {
    const existing = await db.select({ id: users.id }).from(users).where(eq(users.email, env.bootstrap.email)).limit(1);
    if (!existing[0] && env.bootstrap.enabled) {
      const password = env.isProd
        ? env.bootstrap.password
        : env.bootstrap.password || "admin";
      if (env.isProd && password.length < 12) {
        throw new Error("BOOTSTRAP_ADMIN_PASSWORD must be a strong secret in production");
      }
      const passwordHash = await hashPassword(password);
      await db.insert(users).values({
        email: env.bootstrap.email,
        name: "Platform Admin",
        passwordHash,
        isSuperAdmin: true,
        mustChangePassword: env.isProd,
      });
      console.info(`[mma-os] bootstrap super admin created: ${env.bootstrap.email}`);
    }

    // Demo data is keyed on the absence of any gym, not on platform settings.
    // In production it only loads when DEMO_SEED=true is set explicitly.
    const hasOrg = await db.select({ id: organizations.id }).from(organizations).limit(1);
    const wantsDemo = (env.isDev && !env.isTest) || env.demoSeed;
    if (!hasOrg[0] && wantsDemo) {
      // Imported lazily so the demo generator never lands in the edge bundle.
      const { seedDemo } = await import("@/db/seed");
      await seedDemo();
      console.info(
        env.isProd
          ? "[mma-os] DEMO_SEED=true — synthetic demo gyms created. Do not use for real customer data."
          : "[mma-os] demo data seeded",
      );
    }
    await ensurePlatformDefaults();
  })();
  return ran;
}

/** Used by tests and the login flow to guarantee the dev admin on demand. */
export async function ensureDevAdmin() {
  if (env.isProd) return;
  const email = env.bootstrap.email;
  const existing = await db.select({ id: users.id }).from(users).where(eq(users.email, email)).limit(1);
  if (existing[0]) return existing[0].id;
  const passwordHash = await hashPassword(env.bootstrap.password || "admin");
  const created = await db
    .insert(users)
    .values({ email, name: "Platform Admin", passwordHash, isSuperAdmin: true })
    .returning();
  return created[0].id;
}
