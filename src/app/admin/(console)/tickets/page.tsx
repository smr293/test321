import Link from "next/link";
import { LifeBuoy } from "lucide-react";
import { Badge, Card, CardHeader, EmptyState, PageHeader, StatusBadge } from "@/components/ui/primitives";
import { listTickets } from "@/lib/saas";
import { relativeTime } from "@/lib/utils";

export const metadata = { title: "Support · Platform admin" };

export default async function AdminTicketsPage({ searchParams }: { searchParams: Promise<{ status?: string }> }) {
  const { status } = await searchParams;
  const all = await listTickets();
  const rows = status ? all.filter((t) => t.ticket.status === status) : all;
  const open = all.filter((t) => t.ticket.status === "open").length;
  return (
    <>
      <PageHeader
        eyebrow="Support"
        title="Support inbox"
        description={`${open} open · ${all.length} total. Replies notify the member in-app.`}
        actions={<Badge tone={open ? "warn" : "accent"}>{open} open</Badge>}
      />
      <div className="mt-4 flex flex-wrap gap-2">
        {["", "open", "pending", "resolved", "closed"].map((s) => (
          <Link key={s || "all"} href={s ? `/admin/tickets?status=${s}` : "/admin/tickets"} className={`btn btn-sm ${status === s || (!status && !s) ? "btn-primary" : "btn-secondary"}`}>
            {s || "All"}
          </Link>
        ))}
      </div>
      <Card className="mt-4">
        <CardHeader title="Tickets" action={<Badge>{rows.length}</Badge>} />
        {rows.length ? (
          <div className="table-wrap mt-2">
            <table className="table">
              <thead><tr><th>Subject</th><th>From</th><th>Gym</th><th>Priority</th><th>Status</th><th>Age</th></tr></thead>
              <tbody>
                {rows.map((t) => (
                  <tr key={t.ticket.id}>
                    <td><Link href={`/admin/tickets/${t.ticket.id}`} className="font-medium hover:underline">{t.ticket.subject}</Link></td>
                    <td className="text-xs">{t.userName ?? "—"}<br /><span style={{ color: "var(--muted)" }}>{t.userEmail ?? ""}</span></td>
                    <td className="text-xs">{t.orgName ?? "platform"}</td>
                    <td><StatusBadge status={t.ticket.priority} /></td>
                    <td><StatusBadge status={t.ticket.status} /></td>
                    <td className="text-xs" style={{ color: "var(--muted)" }}>{relativeTime(t.ticket.createdAt)}</td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        ) : <EmptyState icon={<LifeBuoy className="h-6 w-6" />} title="No tickets" description="Nothing in this queue." />}
      </Card>
    </>
  );
}
