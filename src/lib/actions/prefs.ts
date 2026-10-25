"use server";

import { eq } from "drizzle-orm";
import { cookies } from "next/headers";
import { redirect } from "next/navigation";
import { revalidatePath } from "next/cache";
import { db } from "@/db/client";
import { notificationPreferences, users } from "@/db/schema";
import { requireUser } from "@/lib/authz";
import { ORG_COOKIE } from "@/lib/env";
import { getPreferences, markAllRead, updatePreferences } from "@/lib/notifications";

export async function setActiveOrgAction(formData: FormData) {
  const auth = await requireUser();
  const orgId = String(formData.get("orgId") ?? "");
  const allowed = auth.memberships.some((m) => m.org.id === orgId);
  if (!allowed && !auth.isSuperAdmin) return;
  const jar = await cookies();
  jar.set(ORG_COOKIE, orgId, { httpOnly: true, sameSite: "lax", path: "/", maxAge: 60 * 60 * 24 * 365 });
  const next = String(formData.get("next") ?? "");
  redirect(next && next.startsWith("/") ? next : "/gym");
}

export async function markNotificationsReadAction() {
  const auth = await requireUser();
  await markAllRead(auth.user.id);
  revalidatePath("/app");
  revalidatePath("/gym");
  revalidatePath("/app/profile");
}

export async function saveNotificationPrefsAction(formData: FormData) {
  const auth = await requireUser();
  await getPreferences(auth.user.id);
  const keys = [
    "classReminders",
    "membershipReminders",
    "paymentNotifications",
    "fightCampReminders",
    "announcements",
    "productUpdates",
    "emailEnabled",
  ] as const;
  const patch: Record<string, boolean> = {};
  for (const key of keys) patch[key] = formData.get(key) === "on";
  await updatePreferences(auth.user.id, patch);
  revalidatePath("/app/profile");
  redirect("/app/profile?ok=Notification+preferences+saved");
}

export async function saveProfileAction(formData: FormData) {
  const auth = await requireUser();
  const name = String(formData.get("name") ?? "").trim();
  if (name.length < 2) redirect("/app/profile?error=Enter+your+name");
  await db
    .update(users)
    .set({
      name,
      phone: String(formData.get("phone") ?? "") || null,
      dateOfBirth: formData.get("dateOfBirth") ? new Date(String(formData.get("dateOfBirth"))) : null,
      emergencyContactName: String(formData.get("emergencyContactName") ?? "") || null,
      emergencyContactPhone: String(formData.get("emergencyContactPhone") ?? "") || null,
      address: String(formData.get("address") ?? "") || null,
      locale: String(formData.get("locale") ?? "en"),
      marketingOptIn: formData.get("marketingOptIn") === "on",
    })
    .where(eq(users.id, auth.user.id));
  revalidatePath("/app/profile");
  redirect("/app/profile?ok=Profile+updated");
}

export async function getNotificationPrefs() {
  const auth = await requireUser();
  return getPreferences(auth.user.id);
}

export async function updatePreferenceField(userId: string, key: keyof typeof notificationPreferences.$inferSelect, value: boolean) {
  await db.update(notificationPreferences).set({ [key]: value }).where(eq(notificationPreferences.userId, userId));
}
