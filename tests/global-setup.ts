import fs from "node:fs";
import path from "node:path";

/**
 * Creates a disposable SQLite database, applies the real migrations and loads
 * the demo seed. Every integration test therefore runs against the same
 * schema and domain data as the running app.
 */
export default async function setup() {
  process.env.NODE_ENV = "test";
  process.env.MMA_TEST = "1";
  process.env.DATABASE_URL = "file:./data/test.db";
  process.env.AUTH_SECRET = "test-secret-do-not-use-in-production-0123456789";
  process.env.BOOTSTRAP_ADMIN_ENABLED = "false";

  const file = path.join(process.cwd(), "data/test.db");
  for (const suffix of ["", "-wal", "-shm"]) {
    if (fs.existsSync(file + suffix)) fs.unlinkSync(file + suffix);
  }
  fs.mkdirSync(path.dirname(file), { recursive: true });

  const Database = (await import("better-sqlite3")).default;
  const { drizzle } = await import("drizzle-orm/better-sqlite3");
  const { migrate } = await import("drizzle-orm/better-sqlite3/migrator");
  const sqlite = new Database(file);
  sqlite.pragma("foreign_keys = ON");
  migrate(drizzle(sqlite), { migrationsFolder: path.join(process.cwd(), "drizzle") });
  sqlite.close();

  const { seedDemo } = await import("../src/db/seed");
  await seedDemo();

  return async () => {
    // Leave the file for debugging; it is recreated on the next run.
  };
}
