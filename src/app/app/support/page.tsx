import { redirect } from "next/navigation";
import { desc, eq } from "drizzle-orm";
import { LifeBuoy } from "lucide-react";
import { db } from "@/db/client";
import { supportTickets } from "@/db/schema";
import { Badge, Card, CardHeader, EmptyState, Field, Input, PageHeader, Select, StatusBadge, Textarea } from "@/components/ui/primitives";
import { SubmitButton } from "@/components/ui/client";
import { getAuth, getOrgContext } from "@/lib/authz";
import { fighterSupportTicketAction } from "@/lib/actions/fighter";
import { formatDateTime } from "@/lib/utils";

export const metadata = { title: "Support" };

export default async function SupportPage() {
  const auth = await getAuth();
  if (!auth) redirect("/login?next=/app/support");
  const ctx = await getOrgContext();
  const tickets = await db
    .select()
    .from(supportTickets)
    .where(eq(supportTickets.userId, auth.user.id))
    .orderBy(desc(supportTickets.createdAt))
    .limit(20);

  return (
    <div className="space-y-4">
      <PageHeader title="Support" description="Questions about your membership or the app? Ask us." />
      <Card>
        <CardHeader title="Send a message" description="We usually reply within one business day." />
        <form action={fighterSupportTicketAction} className="mt-3 space-y-3">
          {ctx ? <input type="hidden" name="orgId" value={ctx.org.id} /> : null}
          <Field label="Subject"><Input name="subject" required placeholder="Invoice question" /></Field>
          <Field label="Message"><Textarea name="body" required placeholder="Describe what you need help with…" /></Field>
          <Field label="Priority">
            <Select name="priority" defaultValue="normal">
              <option value="low">Low</option><option value="normal">Normal</option><option value="high">High</option><option value="urgent">Urgent</option>
            </Select>
          </Field>
          <SubmitButton><LifeBuoy className="h-4 w-4" /> Send to support</SubmitButton>
        </form>
      </Card>
      <Card>
        <CardHeader title="Your requests" />
        <div className="mt-2 space-y-2">
          {tickets.length ? (
            tickets.map((t) => (
              <div key={t.id} className="subtle p-2.5 text-sm">
                <div className="flex items-center justify-between gap-2">
                  <p className="font-medium">{t.subject}</p>
                  <StatusBadge status={t.status} />
                </div>
                <p className="mt-1 whitespace-pre-wrap" style={{ color: "var(--muted)" }}>{t.body}</p>
                {t.response ? <p className="mt-2 rounded-lg border p-2" style={{ borderColor: "var(--line)" }}><strong>Reply:</strong> {t.response}</p> : null}
                <p className="mt-1 text-xs" style={{ color: "var(--muted)" }}>{formatDateTime(t.createdAt)} · <Badge>{t.priority}</Badge></p>
              </div>
            ))
          ) : (
            <EmptyState title="No requests yet" />
          )}
        </div>
      </Card>
    </div>
  );
}
