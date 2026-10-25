/**
 * Server boot: apply pending migrations, then make sure the bootstrap admin
 * (and, with DEMO_SEED=true, the synthetic demo gyms) exist.
 *
 * This runs from the Node server only — it is invoked from the root layout and
 * the health probe, never from an edge/middleware bundle, so better-sqlite3 and
 * argon2 stay out of the edge compilation.
 */
import fs from "node:fs";
import path from "node:path";
import { drizzle } from "drizzle-orm/better-sqlite3";
import { migrate } from "drizzle-orm/better-sqlite3/migrator";
import { sqlite } from "@/db/client";
import { ensureBootstrap } from "./bootstrap";

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

let bootPromise: Promise<void> | null = null;

/** Idempotent: migrations + bootstrap run at most once per process. */
export function bootOnce(): Promise<void> {
  bootPromise ??= boot();
  return bootPromise;
}

async function boot(): Promise<void> {
  try {
    migrate(drizzle(sqlite), { migrationsFolder: migrationsFolder() });
    await ensureBootstrap();
  } catch (error) {
    // Never crash a request: /api/health reports the database state instead.
    console.error("[mma-os] bootstrap failed — check DATABASE_URL and the drizzle/ folder", error);
  }
}
