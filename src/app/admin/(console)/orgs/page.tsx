import Link from "next/link";
import { Building2, Search } from "lucide-react";
import { Badge, ButtonLink, Card, EmptyState, Money, PageHeader, SearchInput, StatusBadge } from "@/components/ui/primitives";
import { listOrganizations } from "@/lib/saas";
import { formatDate } from "@/lib/utils";

export const metadata = { title: "Gyms · Platform admin" };

export default async function AdminOrgsPage({ searchParams }: { searchParams: Promise<{ q?: string; status?: string }> }) {
  const { q, status } = await searchParams;
  const orgs = await listOrganizations({ q, status });
  return (
    <>
      <PageHeader
        eyebrow="Tenants"
        title="Gyms"
        description={`${orgs.length} organizations registered on MMA OS.`}
        actions={<ButtonLink href="/admin/orgs?status=suspended" variant="secondary" size="sm">Suspended</ButtonLink>}
      />
      <Card className="mt-4">
        <form className="flex flex-wrap items-end gap-2" action="/admin/orgs">
          <div className="min-w-52 flex-1"><SearchInput defaultValue={q} placeholder="Search name or slug…" /></div>
          <button type="submit" className="btn btn-secondary"><Search className="h-4 w-4" /> Filter</button>
        </form>
        {orgs.length ? (
          <div className="table-wrap mt-4">
            <table className="table">
              <thead>
                <tr>
                  <th>Gym</th>
                  <th>Plan</th>
                  <th>Members</th>
                  <th>Fighters</th>
                  <th>Locations</th>
                  <th>MRR</th>
                  <th>Status</th>
                  <th>Created</th>
                </tr>
              </thead>
              <tbody>
                {orgs.map((o) => (
                  <tr key={o.org.id}>
                    <td>
                      <Link href={`/admin/orgs/${o.org.id}`} className="font-medium hover:underline">{o.org.name}</Link>
                      <p className="text-xs" style={{ color: "var(--muted)" }}>{o.org.slug} · {o.ownerEmail ?? "no owner"}</p>
                    </td>
                    <td>{o.plan ? <Badge tone={o.sub?.status === "active" ? "accent" : "neutral"}>{o.plan.name}</Badge> : <Badge tone="warn">none</Badge>}</td>
                    <td>{o.members}</td>
                    <td>{o.fighters}</td>
                    <td>{o.locations}</td>
                    <td>{o.plan && o.sub?.status !== "cancelled" ? <Money cents={o.plan.priceMonthlyCents * Math.max(1, o.sub?.seats ?? 1)} /> : "—"}</td>
                    <td><StatusBadge status={o.org.status} /></td>
                    <td className="text-xs" style={{ color: "var(--muted)" }}>{formatDate(o.org.createdAt)}</td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        ) : (
          <EmptyState icon={<Building2 className="h-6 w-6" />} title="No gyms match" description="Try a different search or clear filters." />
        )}
      </Card>
    </>
  );
}
