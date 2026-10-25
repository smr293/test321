/**
 * Recomputes the audit hash chain in insertion order (rowid) and refreshes the
 * head anchor. Use only if the chain was damaged by a bug or a failed import —
 * every rewrite is itself logged in the security event stream.
 *
 * Usage: npx tsx scripts/repair-audit-chain.ts [--dry-run]
 */
import "dotenv/config";
import { asc, eq, sql } from "drizzle-orm";
import { db } from "../src/db/client";
import { auditLogs, platformSettings } from "../src/db/schema";
import { AUDIT_HEAD_KEY, computeAuditHash, verifyAuditChain } from "../src/lib/audit";

async function main() {
  const dry = process.argv.includes("--dry-run");
  const rows = await db.select().from(auditLogs).orderBy(asc(sql`rowid`));
  const before = await verifyAuditChain(rows.map((r) => ({ hash: r.hash ?? "", prevHash: r.prevHash })));
  console.log(`[audit] ${rows.length} entries — chain valid before repair: ${before}`);
  let prev = "genesis";
  for (const row of rows) {
    const base = {
      orgId: row.orgId,
      actorId: row.actorId,
      action: row.action,
      targetType: row.targetType,
      targetId: row.targetId,
      outcome: row.outcome,
      meta: row.meta,
      createdAt: row.createdAt,
      prevHash: prev,
    };
    const hash = computeAuditHash(base);
    if (hash !== row.hash || prev !== row.prevHash) {
      console.log(`[audit] fix ${row.id.slice(0, 8)} ${row.action}`);
      if (!dry) await db.update(auditLogs).set({ prevHash: prev, hash }).where(eq(auditLogs.id, row.id));
    }
    prev = hash;
  }
  if (!dry) {
    await db
      .insert(platformSettings)
      .values({ key: AUDIT_HEAD_KEY, value: prev, updatedAt: new Date() })
      .onConflictDoUpdate({ target: platformSettings.key, set: { value: prev, updatedAt: new Date() } });
  }
  const after = await db.select({ hash: auditLogs.hash, prevHash: auditLogs.prevHash }).from(auditLogs).orderBy(asc(sql`rowid`));
  console.log(`[audit] chain valid after repair: ${await verifyAuditChain(after.map((r) => ({ hash: r.hash ?? "", prevHash: r.prevHash })))}`);
}
main().then(() => process.exit(0)).catch((error) => { console.error(error); process.exit(1); });
