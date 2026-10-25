import Link from "next/link";
import { notFound } from "next/navigation";
import { eq } from "drizzle-orm";
import { ArrowLeft } from "lucide-react";
import { db } from "@/db/client";
import { organizations, supportTickets, users } from "@/db/schema";
import { Badge, ButtonLink, Card, CardHeader, Field, KeyValue, PageHeader, Select, StatusBadge, Textarea } from "@/components/ui/primitives";
import { SubmitButton } from "@/components/ui/client";
import { respondTicketAction } from "@/lib/actions/superadmin";
import { formatDateTime } from "@/lib/utils";

export const metadata = { title: "Ticket · Platform admin" };

export default async function AdminTicketPage({ params }: { params: Promise<{ id: string }> }) {
  const { id } = await params;
  const row = (
    await db
      .select({ ticket: supportTickets, org: organizations, user: users })
      .from(supportTickets)
      .leftJoin(organizations, eq(organizations.id, supportTickets.orgId))
      .leftJoin(users, eq(users.id, supportTickets.userId))
      .where(eq(supportTickets.id, id))
      .limit(1)
  )[0];
  if (!row) notFound();
  return (
    <>
      <PageHeader
        eyebrow="Ticket"
        title={row.ticket.subject}
        description={`${row.user?.email ?? "anonymous"} · ${row.org?.name ?? "platform"} · ${formatDateTime(row.ticket.createdAt)}`}
        actions={<ButtonLink href="/admin/tickets" variant="ghost" size="sm"><ArrowLeft className="h-4 w-4" /> Inbox</ButtonLink>}
      />
      <div className="mt-4 grid gap-4 lg:grid-cols-[1.4fr_1fr]">
        <Card>
          <CardHeader title="Conversation" action={<StatusBadge status={row.ticket.status} />} />
          <div className="mt-3 space-y-3">
            <div className="subtle p-3">
              <p className="text-xs font-semibold" style={{ color: "var(--muted)" }}>{row.user?.name ?? "Anonymous"} · {formatDateTime(row.ticket.createdAt)}</p>
              <p className="mt-1 whitespace-pre-wrap text-sm">{row.ticket.body}</p>
            </div>
            {row.ticket.response ? (
              <div className="rounded-xl border p-3" style={{ borderColor: "color-mix(in srgb, var(--accent) 40%, transparent)", background: "color-mix(in srgb, var(--accent) 8%, transparent)" }}>
                <p className="text-xs font-semibold" style={{ color: "var(--accent)" }}>Support reply</p>
                <p className="mt-1 whitespace-pre-wrap text-sm">{row.ticket.response}</p>
              </div>
            ) : null}
          </div>
        </Card>

        <Card>
          <CardHeader title="Respond" description="Sends an in-app notification to the member." />
          <form action={respondTicketAction} className="mt-3 space-y-3">
            <input type="hidden" name="ticketId" value={row.ticket.id} />
            <div className="grid grid-cols-2 gap-3">
              <Field label="Status">
                <Select name="status" defaultValue={row.ticket.status}>
                  {["open", "pending", "resolved", "closed"].map((s) => <option key={s} value={s}>{s}</option>)}
                </Select>
              </Field>
              <Field label="Priority">
                <Select name="priority" defaultValue={row.ticket.priority}>
                  {["low", "normal", "high", "urgent"].map((p) => <option key={p} value={p}>{p}</option>)}
                </Select>
              </Field>
            </div>
            <Field label="Reply"><Textarea name="response" rows={5} defaultValue={row.ticket.response ?? ""} placeholder="Explain the resolution…" /></Field>
            <SubmitButton>Save & notify</SubmitButton>
          </form>
          <div className="mt-4 space-y-2 text-sm">
            <KeyValue label="Ticket ID"><span className="font-mono text-xs">{row.ticket.id}</span></KeyValue>
            <KeyValue label="Member">{row.user ? <Link className="underline" href={`/admin/users/${row.user.id}`}>{row.user.email}</Link> : "—"}</KeyValue>
            <KeyValue label="Gym">{row.org ? <Link className="underline" href={`/admin/orgs/${row.org.id}`}>{row.org.name}</Link> : "platform"}</KeyValue>
            <KeyValue label="Updated">{formatDateTime(row.ticket.updatedAt)}</KeyValue>
            <div><Badge>{row.ticket.priority}</Badge></div>
          </div>
        </Card>
      </div>
    </>
  );
}
