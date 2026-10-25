import { and, eq, isNull, sql } from "drizzle-orm";
import { db } from "@/db/client";
import { notificationPreferences, notifications, users } from "@/db/schema";
import { sendEmail } from "./email";

export type NotificationType =
  | "class"
  | "membership"
  | "billing"
  | "fightcamp"
  | "announcement"
  | "message"
  | "system"
  | "training";

type PrefKey = "classReminders" | "membershipReminders" | "paymentNotifications" | "fightCampReminders" | "announcements" | "productUpdates";

const TYPE_TO_PREF: Record<NotificationType, PrefKey | null> = {
  class: "classReminders",
  membership: "membershipReminders",
  billing: "paymentNotifications",
  fightcamp: "fightCampReminders",
  announcement: "announcements",
  message: "classReminders",
  system: null,
  training: null,
};

export async function getPreferences(userId: string) {
  const rows = await db.select().from(notificationPreferences).where(eq(notificationPreferences.userId, userId)).limit(1);
  if (rows[0]) return rows[0];
  const inserted = await db.insert(notificationPreferences).values({ userId }).returning();
  return inserted[0];
}

export async function updatePreferences(userId: string, patch: Partial<Record<PrefKey | "emailEnabled", boolean>>) {
  await getPreferences(userId);
  await db
    .update(notificationPreferences)
    .set({ ...patch, updatedAt: new Date() })
    .where(eq(notificationPreferences.userId, userId));
}

/**
 * Creates an in-app notification (optionally emailing it) with preference and
 * duplicate protection. Dedupe keys make scheduled jobs idempotent.
 */
export async function notify(input: {
  userId: string;
  orgId?: string | null;
  type: NotificationType;
  title: string;
  body?: string;
  link?: string;
  dedupeKey?: string;
  email?: boolean;
  force?: boolean;
}) {
  const prefKey = TYPE_TO_PREF[input.type];
  let prefs = null as Awaited<ReturnType<typeof getPreferences>> | null;
  if (prefKey || !input.force) {
    prefs = await getPreferences(input.userId);
    if (prefKey && !input.force && prefs[prefKey] === false) return null;
  }
  if (input.dedupeKey) {
    const existing = await db
      .select({ id: notifications.id })
      .from(notifications)
      .where(and(eq(notifications.userId, input.userId), eq(notifications.dedupeKey, input.dedupeKey)))
      .limit(1);
    if (existing[0]) return null;
  }
  const inserted = await db
    .insert(notifications)
    .values({
      userId: input.userId,
      orgId: input.orgId ?? null,
      type: input.type,
      title: input.title,
      body: input.body ?? null,
      link: input.link ?? null,
      dedupeKey: input.dedupeKey ?? null,
      emailStatus: input.email && prefs?.emailEnabled ? "pending" : "skipped",
    })
    .returning();
  const row = inserted[0];

  if (input.email && prefs?.emailEnabled) {
    const user = (await db.select().from(users).where(eq(users.id, input.userId)).limit(1))[0];
    if (user) {
      const result = await sendEmail({
        to: user.email,
        subject: input.title,
        body: `${input.body ?? ""}\n\nOpen MMA OS: ${process.env.APP_URL ?? "http://localhost:3000"}${input.link ?? ""}`,
        template: input.type,
      });
      await db
        .update(notifications)
        .set({ emailStatus: result.delivered ? "sent" : "failed" })
        .where(eq(notifications.id, row.id));
    }
  }
  return row;
}

export async function markAllRead(userId: string) {
  await db
    .update(notifications)
    .set({ readAt: new Date() })
    .where(and(eq(notifications.userId, userId)));
}

export async function markRead(userId: string, id: string) {
  await db
    .update(notifications)
    .set({ readAt: new Date() })
    .where(and(eq(notifications.userId, userId), eq(notifications.id, id)));
}

export async function unreadCount(userId: string) {
  const rows = await db
    .select({ n: sql<number>`count(*)` })
    .from(notifications)
    .where(and(eq(notifications.userId, userId), isNull(notifications.readAt)));
  return Number(rows[0]?.n ?? 0);
}
