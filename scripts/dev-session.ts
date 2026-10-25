/**
 * Dev/testing helper: mint a session cookie for a user without going through
 * the login form. Usage: npx tsx scripts/dev-session.ts owner@demo.mma
 */
import "dotenv/config";
import { eq } from "drizzle-orm";
import { db, sqlite } from "../src/db/client";
import { sessions, users } from "../src/db/schema";
import { hashToken, newToken } from "../src/lib/session";

async function main() {
  const email = process.argv[2] ?? "owner@demo.mma";
  const user = (await db.select().from(users).where(eq(users.email, email)).limit(1))[0];
  if (!user) throw new Error(`No user ${email} — run npm run db:seed`);
  const token = newToken();
  await db.insert(sessions).values({
    id: hashToken(token),
    userId: user.id,
    expiresAt: new Date(Date.now() + 86400000),
  });
  console.log(token);
  sqlite.close();
}

main().catch((error) => {
  console.error(error);
  process.exit(1);
});
