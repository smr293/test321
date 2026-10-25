import Link from "next/link";
import { redirect } from "next/navigation";
import { desc, eq } from "drizzle-orm";
import { Bell, CheckCheck } from "lucide-react";
import { db } from "@/db/client";
import { announcements, notifications } from "@/db/schema";
import { Badge, Card, CardHeader, EmptyState, PageHeader, StatusBadge } from "@/components/ui/primitives";
import { SubmitButton } from "@/components/ui/client";
import { getAuth } from "@/lib/authz";
import { markNotificationsReadAction } from "@/lib/actions/prefs";
import { formatDateTime } from "@/lib/utils";

export const metadata = { title: "Notifications" };

export default async function NotificationsPage() {
  const auth = await getAuth();
  if (!auth) redirect("/login?next=/app/notifications");
  const [rows, announcementsList] = await Promise.all([
    db.select().from(notifications).where(eq(notifications.userId, auth.user.id)).orderBy(desc(notifications.createdAt)).limit(60),
    db.select().from(announcements).orderBy(desc(announcements.createdAt)).limit(10),
  ]);
  const unread = rows.filter((r) => !r.readAt).length;

  return (
    <div className="space-y-4">
      <PageHeader
        title="Notifications"
        description={unread ? `${unread} unread` : "You're all caught up."}
        actions={
          <form action={markNotificationsReadAction}>
            <SubmitButton size="sm" variant="secondary"><CheckCheck className="h-4 w-4" /> Mark all read</SubmitButton>
          </form>
        }
      />
      <Card>
        <CardHeader title="Your notifications" />
        <div className="mt-2 divide-y" style={{ borderColor: "var(--line)" }}>
          {rows.length ? (
            rows.map((n) => (
              <Link key={n.id} href={n.link ?? "/app"} className="flex items-start gap-3 py-3">
                <span className="mt-0.5 flex h-8 w-8 items-center justify-center rounded-lg" style={{ background: "var(--card-2)" }}>
                  <Bell className="h-4 w-4" style={{ color: n.readAt ? "var(--muted)" : "var(--accent)" }} />
                </span>
                <span className="min-w-0 flex-1">
                  <span className="flex items-center gap-2">
                    <span className="text-sm font-medium">{n.title}</span>
                    {!n.readAt ? <Badge tone="accent">new</Badge> : null}
                  </span>
                  {n.body ? <span className="mt-0.5 block text-sm" style={{ color: "var(--muted)" }}>{n.body}</span> : null}
                  <span className="mt-1 block text-xs" style={{ color: "var(--muted)" }}>{formatDateTime(n.createdAt)} · {n.type}</span>
                </span>
              </Link>
            ))
          ) : (
            <EmptyState icon={<Bell className="h-5 w-5" />} title="No notifications" description="Bookings, payments and camp reminders show up here." />
          )}
        </div>
      </Card>

      <Card>
        <CardHeader title="Gym announcements" />
        <div className="mt-2 space-y-2">
          {announcementsList.length ? (
            announcementsList.map((a) => (
              <div key={a.id} className="subtle p-3">
                <p className="text-sm font-medium">{a.title}</p>
                <p className="mt-1 whitespace-pre-wrap text-sm" style={{ color: "var(--muted)" }}>{a.body}</p>
                <p className="mt-1 text-xs" style={{ color: "var(--muted)" }}>{formatDateTime(a.createdAt)}</p>
              </div>
            ))
          ) : (
            <EmptyState title="No announcements yet" />
          )}
        </div>
      </Card>
    </div>
  );
}
