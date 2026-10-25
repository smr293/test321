/** Dev helper: print ids for demo users/members. Usage: npx tsx scripts/dev-info.ts */
import "dotenv/config";
import { eq } from "drizzle-orm";
import { db, sqlite } from "../src/db/client";
import { organizations, orgMembers, users } from "../src/db/schema";

async function main() {
  const emails = ["owner@demo.mma", "coach@demo.mma", "fighter@demo.mma", "lina@demo.mma", "member@southside.mma"];
  for (const email of emails) {
    const user = (await db.select().from(users).where(eq(users.email, email)).limit(1))[0];
    if (!user) continue;
    const members = await db.select().from(orgMembers).where(eq(orgMembers.userId, user.id));
    for (const m of members) {
      const org = (await db.select().from(organizations).where(eq(organizations.id, m.orgId)).limit(1))[0];
      console.log(`${email}\t${org?.name}\t${m.role}\t${m.id}\t${org?.id}`);
    }
  }
  sqlite.close();
}
main();
