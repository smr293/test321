import Link from "next/link";
import { Badge, Card, EmptyState, PageHeader, SearchInput, StatusBadge } from "@/components/ui/primitives";
import { listPlatformUsers } from "@/lib/saas";
import { formatDate } from "@/lib/utils";

export const metadata = { title: "Users · Platform admin" };

export default async function AdminUsersPage({ searchParams }: { searchParams: Promise<{ q?: string }> }) {
  const { q } = await searchParams;
  const rows = await listPlatformUsers(q);
  return (
    <>
      <PageHeader eyebrow="Identity" title="Users" description={`${rows.length} accounts. Suspending revokes all sessions instantly.`} />
      <Card className="mt-4">
        <form className="flex flex-wrap items-end gap-2" action="/admin/users">
          <div className="min-w-52 flex-1"><SearchInput defaultValue={q} placeholder="Search email or name…" /></div>
          <button type="submit" className="btn btn-secondary">Search</button>
        </form>
        {rows.length ? (
          <div className="table-wrap mt-4">
            <table className="table">
              <thead><tr><th>User</th><th>Gyms</th><th>2FA</th><th>Role</th><th>Status</th><th>Last login</th><th>Created</th></tr></thead>
              <tbody>
                {rows.map((r) => (
                  <tr key={r.user.id}>
                    <td>
                      <Link href={`/admin/users/${r.user.id}`} className="font-medium hover:underline">{r.user.name}</Link>
                      <p className="text-xs" style={{ color: "var(--muted)" }}>{r.user.email}</p>
                    </td>
                    <td>{r.user.isSuperAdmin ? "—" : Number(r.orgs)}</td>
                    <td>{r.user.mfaEnabled ? <Badge tone="accent">on</Badge> : <span className="text-xs" style={{ color: "var(--muted)" }}>off</span>}</td>
                    <td>{r.user.isSuperAdmin ? <Badge tone="info">super admin</Badge> : <Badge>user</Badge>}</td>
                    <td><StatusBadge status={r.user.status} /></td>
                    <td className="text-xs" style={{ color: "var(--muted)" }}>{r.user.lastLoginAt ? formatDate(r.user.lastLoginAt) : "never"}</td>
                    <td className="text-xs" style={{ color: "var(--muted)" }}>{formatDate(r.user.createdAt)}</td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        ) : <EmptyState title="No users match" description="Try another search." />}
      </Card>
    </>
  );
}
