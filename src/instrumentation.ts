import fs from "node:fs";
import path from "node:path";

/** Locates the Drizzle migrations folder across dev, standalone and container layouts. */
function migrationsFolder(): string {
  const cwd = process.cwd();
  const candidates = [
    process.env.MIGRATIONS_DIR,
    path.join(cwd, "drizzle"),
    path.join(cwd, "..", "..", "drizzle"),
    path.join(cwd, "..", "drizzle"),
  ].filter(Boolean) as string[];
  for (const candidate of candidates) {
    if (fs.existsSync(path.join(candidate, "meta", "_journal.json"))) return candidate;
  }
  return path.join(cwd, "drizzle");
}

export async function register() {
  if (process.env.NEXT_RUNTIME !== "nodejs") return;
  const { ensureBootstrap } = await import("./lib/bootstrap");
  const { sqlite } = await import("./db/client");
  const { drizzle } = await import("drizzle-orm/better-sqlite3");
  const { migrate } = await import("drizzle-orm/better-sqlite3/migrator");
  try {
    const folder = migrationsFolder();
    migrate(drizzle(sqlite), { migrationsFolder: folder });
    await ensureBootstrap();
  } catch (error) {
    // Never crash the server: /api/health reports the database state instead.
    console.error("[mma-os] bootstrap failed — check DATABASE_URL and the drizzle/ folder", error);
  }
}
