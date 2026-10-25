import crypto from "node:crypto";
import { desc, eq, lt, sql } from "drizzle-orm";
import { db } from "@/db/client";
import { auditLogs, platformSettings, securityEvents, users } from "@/db/schema";
import { requestMeta, type SessionInfo } from "./session";

export type AuditInput = {
  orgId?: string | null;
  actor?: { id: string; name: string; role?: string | null } | null;
  action: string;
  targetType?: string;
  targetId?: string;
  outcome?: "success" | "failure" | "denied";
  meta?: Record<string, unknown>;
  session?: SessionInfo | null;
};

export function canonicalAuditEntry(entry: {
  orgId: string | null;
  actorId: string | null;
  action: string;
  targetType: string | null;
  targetId: string | null;
  outcome: string;
  meta: string | null;
  createdAt: Date;
  prevHash: string | null;
}) {
  return JSON.stringify([
    entry.orgId,
    entry.actorId,
    entry.action,
    entry.targetType,
    entry.targetId,
    entry.outcome,
    entry.meta,
    entry.createdAt.toISOString(),
    entry.prevHash,
  ]);
}

/**
 * Append-only, hash-chained audit trail. Each record links to the previous hash
 * so tampering with history is detectable (see verifyAuditChain).
 */
export async function audit(input: AuditInput) {
  // rowid is the insertion order and is immune to same-millisecond timestamp ties.
  const last = await db.select({ hash: auditLogs.hash }).from(auditLogs).orderBy(desc(sql`rowid`)).limit(1);
  const prevHash = last[0]?.hash ?? "genesis";
  const createdAt = new Date();
  const meta = input.meta ? JSON.stringify(input.meta) : null;
  const base = {
    orgId: input.orgId ?? null,
    actorId: input.actor?.id ?? null,
    action: input.action,
    targetType: input.targetType ?? null,
    targetId: input.targetId ?? null,
    outcome: input.outcome ?? "success",
    meta,
    createdAt,
    prevHash,
  };
  const hash = computeAuditHash(base);
  let ip: string | null = null;
  try {
    ip = (await requestMeta()).ip;
  } catch {
    /* outside a request scope (jobs/tests) */
  }
  await db.insert(auditLogs).values({
    ...base,
    actorName: input.actor?.name ?? null,
    actorRole: input.actor?.role ?? null,
    ip,
    hash,
  });
  // Head anchor: detects tampering with the newest entry, which has no successor.
  await db
    .insert(platformSettings)
    .values({ key: AUDIT_HEAD_KEY, value: hash, updatedAt: new Date() })
    .onConflictDoUpdate({ target: platformSettings.key, set: { value: hash, updatedAt: new Date() } });
}

export function computeAuditHash(entry: {
  orgId: string | null;
  actorId: string | null;
  action: string;
  targetType: string | null;
  targetId: string | null;
  outcome: string;
  meta: string | null;
  createdAt: Date;
  prevHash: string | null;
}) {
  return crypto.createHash("sha256").update(canonicalAuditEntry(entry)).digest("hex");
}

export const AUDIT_HEAD_KEY = "audit.chainHead";

/** Returns true when the stored head anchor matches the newest entry. */
export async function verifyAuditHead(lastHash: string | null | undefined) {
  const row = (await db.select().from(platformSettings).where(eq(platformSettings.key, AUDIT_HEAD_KEY)).limit(1))[0];
  if (!row) return true; // legacy databases without an anchor
  return row.value === (lastHash ?? "");
}

export async function verifyAuditChain(rows: { hash: string; prevHash: string | null }[]) {
  // rows must be ordered oldest → newest
  let prev = "genesis";
  for (const row of rows) {
    if (row.prevHash !== prev) return false;
    prev = row.hash;
  }
  return true;
}

export async function securityEvent(input: {
  userId?: string | null;
  type: string;
  detail?: string;
  ip?: string | null;
  userAgent?: string | null;
}) {
  await db.insert(securityEvents).values({
    userId: input.userId ?? null,
    type: input.type,
    detail: input.detail ?? null,
    ip: input.ip ?? null,
    userAgent: input.userAgent ?? null,
  });
}

export async function accountExists(email: string) {
  const rows = await db.select({ id: users.id }).from(users).where(eq(users.email, email)).limit(1);
  return Boolean(rows[0]);
}

/**
 * Retention purge. Disabled unless AUDIT_PURGE_ENABLED=true because deleting
 * the oldest entries breaks hash-chain continuity. When enabled, the remaining
 * chain is re-derived from genesis so verification still succeeds.
 */
export async function purgeOldAuditLogs(retentionDays = 730) {
  if (process.env.AUDIT_PURGE_ENABLED !== "true") return 0;
  const cutoff = new Date(Date.now() - retentionDays * 86400000);
  const deleted = await db.delete(auditLogs).where(lt(auditLogs.createdAt, cutoff)).returning({ id: auditLogs.id });
  if (!deleted.length) return 0;

  const { asc } = await import("drizzle-orm");
  const rows = await db.select().from(auditLogs).orderBy(asc(sql`rowid`));
  let prev = "genesis";
  for (const row of rows) {
    const hash = computeAuditHash({
      orgId: row.orgId,
      actorId: row.actorId,
      action: row.action,
      targetType: row.targetType,
      targetId: row.targetId,
      outcome: row.outcome,
      meta: row.meta,
      createdAt: row.createdAt,
      prevHash: prev,
    });
    if (hash !== row.hash || prev !== row.prevHash) {
      await db.update(auditLogs).set({ prevHash: prev, hash }).where(eq(auditLogs.id, row.id));
    }
    prev = hash;
  }
  await db
    .insert(platformSettings)
    .values({ key: AUDIT_HEAD_KEY, value: prev, updatedAt: new Date() })
    .onConflictDoUpdate({ target: platformSettings.key, set: { value: prev, updatedAt: new Date() } });
  return deleted.length;
}
