import Link from "next/link";
import { Inbox, ShieldCheck } from "lucide-react";
import { Badge, Card, CardHeader, EmptyState, Field, PageHeader, StatusBadge, Textarea } from "@/components/ui/primitives";
import { Modal, SubmitButton } from "@/components/ui/client";
import { listDataRequests } from "@/lib/saas";
import { resolveDataRequestAction } from "@/lib/actions/superadmin";
import { formatDateTime } from "@/lib/utils";

export const metadata = { title: "Data requests · Platform admin" };

export default async function AdminDataRequestsPage() {
  const rows = await listDataRequests();
  const pending = rows.filter((r) => r.request.status === "pending");
  return (
    <>
      <PageHeader
        eyebrow="GDPR"
        title="Data requests"
        description="Export and deletion requests from members. Handle within 30 days."
        actions={<Badge tone={pending.length ? "warn" : "accent"}>{pending.length} pending</Badge>}
      />
      <Card className="mt-4">
        <CardHeader title="Queue" description="Completing a deletion request anonymises access and revokes sessions." />
        {rows.length ? (
          <div className="table-wrap mt-2">
            <table className="table">
              <thead><tr><th>Member</th><th>Type</th><th>Status</th><th>Requested</th><th>Handled</th><th>Action</th></tr></thead>
              <tbody>
                {rows.map((r) => (
                  <tr key={r.request.id}>
                    <td>
                      <Link href={`/admin/users/${r.request.userId}`} className="font-medium hover:underline">{r.userName}</Link>
                      <p className="text-xs" style={{ color: "var(--muted)" }}>{r.userEmail} · {r.userStatus}</p>
                    </td>
                    <td><Badge tone={r.request.type === "deletion" ? "danger" : "info"}>{r.request.type}</Badge></td>
                    <td><StatusBadge status={r.request.status} /></td>
                    <td className="text-xs">{formatDateTime(r.request.createdAt)}</td>
                    <td className="text-xs">{r.request.completedAt ? formatDateTime(r.request.completedAt) : "—"}<br /><span style={{ color: "var(--muted)" }}>{r.request.notes ?? ""}</span></td>
                    <td>
                      {r.request.status === "pending" ? (
                        <Modal trigger="Handle" title={`${r.request.type === "deletion" ? "Deletion" : "Export"} request`} description="Record the decision. The member is notified." triggerSize="sm" triggerVariant="secondary">
                          <form action={resolveDataRequestAction} className="space-y-3">
                            <input type="hidden" name="id" value={r.request.id} />
                            <Field label="Notes"><Textarea name="notes" rows={3} placeholder="What was delivered or why it was rejected" /></Field>
                            <div className="flex flex-wrap gap-2">
                              <SubmitButton name="decision" value="completed" size="sm"><ShieldCheck className="h-4 w-4" /> Complete</SubmitButton>
                              <SubmitButton name="decision" value="rejected" variant="secondary" size="sm">Reject</SubmitButton>
                            </div>
                          </form>
                        </Modal>
                      ) : (
                        <span className="text-xs" style={{ color: "var(--muted)" }}>Closed</span>
                      )}
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        ) : <EmptyState icon={<Inbox className="h-6 w-6" />} title="No requests" description="Members can request export or deletion from their profile." />}
      </Card>
    </>
  );
}
