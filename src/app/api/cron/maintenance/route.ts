import { env } from "@/lib/env";
import { applyScheduledMembershipChanges, markOverdueMemberships } from "@/lib/membership";
import { resolveNoShows } from "@/lib/booking";
import { purgeExpiredSessions } from "@/lib/session";
import { purgeOldAuditLogs } from "@/lib/audit";

export const dynamic = "force-dynamic";

/**
 * Scheduled maintenance. Set CRON_SECRET and call with
 * `Authorization: Bearer $CRON_SECRET` from your scheduler.
 */
export async function POST(request: Request) {
  const secret = process.env.CRON_SECRET ?? "";
  if (!secret) {
    return Response.json({ ok: false, message: "CRON_SECRET is not configured" }, { status: 503 });
  }
  if (request.headers.get("authorization") !== `Bearer ${secret}`) {
    return Response.json({ ok: false, message: "Unauthorized" }, { status: 401 });
  }

  const started = Date.now();
  const results: Record<string, unknown> = {};
  try {
    const { db } = await import("@/db/client");
    const { organizations } = await import("@/db/schema");
    const orgs = await db.select({ id: organizations.id }).from(organizations);
    results.overdue = await markOverdueMemberships();
    results.scheduled = await applyScheduledMembershipChanges();
    results.noShows = 0;
    for (const org of orgs) {
      results.noShows = Number(results.noShows) + (await resolveNoShows(org.id));
    }
    await purgeExpiredSessions();
    results.auditPurged = await purgeOldAuditLogs(env.retentionDays);
    results.orgs = orgs.length;
    results.durationMs = Date.now() - started;
    return Response.json({ ok: true, ...results });
  } catch (error) {
    console.error("[cron] maintenance failed", error);
    return Response.json({ ok: false, message: (error as Error).message, ...results }, { status: 500 });
  }
}
