export async function register() {
  if (process.env.NEXT_RUNTIME !== "nodejs") return;
  const { ensureBootstrap } = await import("./src/lib/bootstrap");
  const { sqlite } = await import("./src/db/client");
  const { drizzle } = await import("drizzle-orm/better-sqlite3");
  const { migrate } = await import("drizzle-orm/better-sqlite3/migrator");
  const path = await import("node:path");
  try {
    migrate(drizzle(sqlite), { migrationsFolder: path.join(process.cwd(), "drizzle") });
    await ensureBootstrap();
  } catch (error) {
    console.error("[mma-os] bootstrap failed", error);
  }
}
