import Link from "next/link";
import { notFound } from "next/navigation";
import { desc, eq } from "drizzle-orm";
import { ArrowLeft, ShieldCheck, UserX } from "lucide-react";
import { db } from "@/db/client";
import { dataRequests, orgMembers, organizations, securityEvents, sessions, users } from "@/db/schema";
import { SAFE_USER_COLUMNS } from "@/lib/saas";
import { Badge, ButtonLink, Card, CardHeader, EmptyState, Field, KeyValue, PageHeader, Select, StatusBadge } from "@/components/ui/primitives";
import { ConfirmSubmit, Modal, SubmitButton } from "@/components/ui/client";
import { setUserStatusAction, toggleSuperAdminAction } from "@/lib/actions/superadmin";
import { formatDateTime, relativeTime } from "@/lib/utils";

export const metadata = { title: "User · Platform admin" };

export default async function AdminUserDetailPage({ params }: { params: Promise<{ id: string }> }) {
  const { id } = await params;
  const user = (await db.select(SAFE_USER_COLUMNS).from(users).where(eq(users.id, id)).limit(1))[0];
  if (!user) notFound();
  const [orgs, events, activeSessions, requests] = await Promise.all([
    db
      .select({ org: organizations, member: orgMembers })
      .from(orgMembers)
      .innerJoin(organizations, eq(organizations.id, orgMembers.orgId))
      .where(eq(orgMembers.userId, id)),
    db.select().from(securityEvents).where(eq(securityEvents.userId, id)).orderBy(desc(securityEvents.createdAt)).limit(10),
    db.select().from(sessions).where(eq(sessions.userId, id)).orderBy(desc(sessions.createdAt)).limit(5),
    db.select().from(dataRequests).where(eq(dataRequests.userId, id)).orderBy(desc(dataRequests.createdAt)),
  ]);

  return (
    <>
      <PageHeader
        eyebrow="User"
        title={user.name}
        description={`${user.email} · joined ${formatDateTime(user.createdAt)}`}
        actions={<ButtonLink href="/admin/users" variant="ghost" size="sm"><ArrowLeft className="h-4 w-4" /> All users</ButtonLink>}
      />

      <div className="mt-4 grid gap-4 lg:grid-cols-2">
        <Card>
          <CardHeader title="Account" action={<StatusBadge status={user.status} />} />
          <div className="mt-3 grid gap-2 text-sm">
            <KeyValue label="User ID"><span className="font-mono text-xs">{user.id}</span></KeyValue>
            <KeyValue label="Phone">{user.phone ?? "—"}</KeyValue>
            <KeyValue label="Locale">{user.locale} · theme {user.theme}</KeyValue>
            <KeyValue label="2FA">{user.mfaEnabled ? "Enabled" : "Disabled"}</KeyValue>
            <KeyValue label="Last login">{user.lastLoginAt ? relativeTime(user.lastLoginAt) : "never"}</KeyValue>
            <KeyValue label="Super admin">{user.isSuperAdmin ? "Yes" : "No"}</KeyValue>
          </div>
          <div className="mt-4 flex flex-wrap gap-2">
            {user.status !== "active" ? (
              <form action={setUserStatusAction}>
                <input type="hidden" name="userId" value={user.id} />
                <input type="hidden" name="status" value="active" />
                <SubmitButton size="sm">Reactivate</SubmitButton>
              </form>
            ) : (
              <Modal
                trigger={<span className="flex items-center gap-1.5"><UserX className="h-4 w-4" /> Suspend user</span>}
                title="Suspend account"
                description="All sessions are revoked. The user cannot sign in until reactivated."
                triggerVariant="danger"
                triggerSize="sm"
              >
                <form action={setUserStatusAction} className="space-y-3">
                  <input type="hidden" name="userId" value={user.id} />
                  <input type="hidden" name="status" value="suspended" />
                  <p className="text-sm" style={{ color: "var(--muted)" }}>This action is audited and can be reversed.</p>
                  <SubmitButton variant="danger">Suspend {user.name}</SubmitButton>
                </form>
              </Modal>
            )}
            <form action={toggleSuperAdminAction}>
              <input type="hidden" name="userId" value={user.id} />
              <ConfirmSubmit message={`${user.isSuperAdmin ? "Revoke" : "Grant"} super admin access for ${user.email}?`} variant="secondary">
                <ShieldCheck className="h-4 w-4" /> {user.isSuperAdmin ? "Revoke super admin" : "Grant super admin"}
              </ConfirmSubmit>
            </form>
          </div>
        </Card>

        <Card>
          <CardHeader title="Gym memberships" action={<Badge>{orgs.length}</Badge>} />
          {orgs.length ? (
            <ul className="mt-2 divide-y text-sm" style={{ borderColor: "var(--line)" }}>
              {orgs.map((o) => (
                <li key={o.member.id} className="flex items-center justify-between gap-2 py-2">
                  <div>
                    <Link href={`/admin/orgs/${o.org.id}`} className="font-medium hover:underline">{o.org.name}</Link>
                    <p className="text-xs" style={{ color: "var(--muted)" }}>{o.member.title ?? o.member.role} · joined {o.member.joinedAt ? formatDateTime(o.member.joinedAt) : "—"}</p>
                  </div>
                  <div className="flex items-center gap-2"><Badge>{o.member.role}</Badge><StatusBadge status={o.member.status} /></div>
                </li>
              ))}
            </ul>
          ) : <EmptyState title="No gyms" description="This user is not a member of any gym." />}
        </Card>
      </div>

      <div className="mt-4 grid gap-4 lg:grid-cols-2">
        <Card>
          <CardHeader title="Security activity" />
          {events.length ? (
            <ul className="mt-2 space-y-1.5 text-sm">
              {events.map((e) => (
                <li key={e.id} className="flex items-center justify-between gap-2 border-b py-1.5" style={{ borderColor: "var(--line)" }}>
                  <span className="font-mono text-xs">{e.type}</span>
                  <span className="text-xs" style={{ color: "var(--muted)" }}>{formatDateTime(e.createdAt)}</span>
                </li>
              ))}
            </ul>
          ) : <EmptyState title="No events" />}
        </Card>
        <Card>
          <CardHeader title="Sessions" description="Most recent first." />
          <ul className="mt-2 space-y-1.5 text-sm">
            {activeSessions.map((s) => (
              <li key={s.id} className="flex items-center justify-between gap-2 border-b py-1.5" style={{ borderColor: "var(--line)" }}>
                <span className="truncate text-xs">{s.userAgent?.slice(0, 40) ?? "unknown device"}</span>
                <Badge tone={s.revokedAt ? "neutral" : s.expiresAt > new Date() ? "accent" : "warn"}>{s.revokedAt ? "revoked" : s.expiresAt > new Date() ? "active" : "expired"}</Badge>
              </li>
            ))}
            {activeSessions.length === 0 ? <li style={{ color: "var(--muted)" }}>No sessions.</li> : null}
          </ul>
          {requests.length ? (
            <div className="mt-4">
              <p className="label">Data requests</p>
              {requests.map((r) => (
                <p key={r.id} className="text-sm">{r.type} · <StatusBadge status={r.status} /> · {relativeTime(r.createdAt)}</p>
              ))}
            </div>
          ) : null}
        </Card>
      </div>
    </>
  );
}
