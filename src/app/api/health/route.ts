import { sql } from "drizzle-orm";
import { db } from "@/db/client";
import { bootOnce } from "@/lib/boot";
import { env } from "@/lib/env";

export const dynamic = "force-dynamic";

/** Liveness + readiness probe used by Docker/Kubernetes. */
export async function GET() {
  const started = Date.now();
  try {
    await bootOnce();
    await db.get(sql`select 1`);
    return Response.json(
      {
        status: "ok",
        env: env.nodeEnv,
        database: "ok",
        latencyMs: Date.now() - started,
        time: new Date().toISOString(),
      },
      { headers: { "cache-control": "no-store" } },
    );
  } catch (error) {
    return Response.json(
      { status: "degraded", database: "error", message: (error as Error).message, time: new Date().toISOString() },
      { status: 503, headers: { "cache-control": "no-store" } },
    );
  }
}
