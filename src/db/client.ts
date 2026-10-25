import Database from "better-sqlite3";
import { drizzle } from "drizzle-orm/better-sqlite3";
import fs from "node:fs";
import path from "node:path";
import * as schema from "./schema";

const url = process.env.DATABASE_URL ?? "file:./data/mma.db";
const file = url.replace(/^file:/, "");
const abs = path.isAbsolute(file) ? file : path.join(process.cwd(), file);

function open() {
  fs.mkdirSync(path.dirname(abs), { recursive: true });
  const sqlite = new Database(abs);
  sqlite.pragma("journal_mode = WAL");
  sqlite.pragma("foreign_keys = ON");
  sqlite.pragma("busy_timeout = 5000");
  return sqlite;
}

const globalForDb = globalThis as unknown as {
  __mmaSqlite?: Database.Database;
};

export const sqlite = globalForDb.__mmaSqlite ?? open();
if (process.env.NODE_ENV !== "production") globalForDb.__mmaSqlite = sqlite;

export const db = drizzle(sqlite, { schema });
export { schema };
export type DB = typeof db;
