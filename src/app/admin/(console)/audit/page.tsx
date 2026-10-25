import Link from "next/link";
import { ShieldCheck } from "lucide-react";
import { Badge, Card, CardHeader, EmptyState, PageHeader, SearchInput, StatusBadge } from "@/components/ui/primitives";
import { SubmitButton } from "@/components/ui/client";
import { auditSearch } from "@/lib/saas";
import { verifyAuditChainAction } from "@/lib/actions/superadmin";
import { formatDateTime } from "@/lib/utils";

export const metadata = { title: "Audit log · Platform admin" };

export default async function AdminAuditPage({ searchParams }: { searchParams: Promise<{ q?: string; orgId?: string }> }) {
  const { q, orgId } = await searchParams;
  const rows = await auditSearch({ q, orgId });
  return (
    <>
      <PageHeader
        eyebrow="Compliance"
        title="Audit log"
        description="Append-only, hash-chained record of every privileged action across all tenants."
        actions={
          <form action={verifyAuditChainAction}>
            <SubmitButton variant="secondary" size="sm"><ShieldCheck className="h-4 w-4" /> Verify chain</SubmitButton>
          </form>
        }
      />
      <Card className="mt-4">
        <form className="flex flex-wrap items-end gap-2" action="/admin/audit">
          <div className="min-w-52 flex-1"><SearchInput defaultValue={q} placeholder="Search action, actor, target…" /></div>
          <input name="orgId" defaultValue={orgId} placeholder="Gym ID" className="input max-w-56" />
          <button type="submit" className="btn btn-secondary">Filter</button>
        </form>
        {rows.length ? (
          <div className="table-wrap mt-4">
            <table className="table">
              <thead><tr><th>When</th><th>Action</th><th>Actor</th><th>Gym</th><th>Target</th><th>Outcome</th><th>Hash</th></tr></thead>
              <tbody>
                {rows.map((a) => (
                  <tr key={a.id}>
                    <td className="whitespace-nowrap text-xs">{formatDateTime(a.createdAt)}</td>
                    <td className="font-mono text-xs">{a.action}</td>
                    <td className="text-xs">{a.actorName ?? "system"} <span style={{ color: "var(--muted)" }}>{a.actorRole ?? ""}</span></td>
                    <td className="text-xs">{a.orgId ? <Link href={`/admin/orgs/${a.orgId}`} className="underline">{a.orgId.slice(0, 8)}</Link> : "platform"}</td>
                    <td className="text-xs">{a.targetType ?? "—"} {a.targetId ? <span className="font-mono">{a.targetId.slice(0, 8)}</span> : null}</td>
                    <td><StatusBadge status={a.outcome} /></td>
                    <td className="font-mono text-[0.65rem]" style={{ color: "var(--muted)" }}>{a.hash?.slice(0, 10)}…</td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        ) : <EmptyState title="No entries" description="No audit entries match the filter." />}
        <p className="mt-3 text-xs" style={{ color: "var(--muted)" }}>
          {rows.length} most recent entries. Verification recomputes the chain from genesis; a broken chain indicates tampering.
        </p>
      </Card>
    </>
  );
}
