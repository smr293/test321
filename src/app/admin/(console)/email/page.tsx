import { Mail } from "lucide-react";
import { Badge, Card, CardHeader, EmptyState, PageHeader, StatusBadge } from "@/components/ui/primitives";
import { SubmitButton } from "@/components/ui/client";
import { listEmailOutbox, getPlatformSettings } from "@/lib/saas";
import { updateOutboxAction } from "@/lib/actions/superadmin";
import { formatDateTime } from "@/lib/utils";

export const metadata = { title: "Email outbox · Platform admin" };

export default async function AdminEmailPage({ searchParams }: { searchParams: Promise<{ status?: string }> }) {
  const { status } = await searchParams;
  const [rows, settings] = await Promise.all([listEmailOutbox(status), getPlatformSettings()]);
  return (
    <>
      <PageHeader
        eyebrow="Deliverability"
        title="Email outbox"
        description={`Every transactional email is recorded. Provider: ${process.env.RESEND_API_KEY ? "Resend" : "dev outbox"}. Support address: ${settings.supportEmail}.`}
      />
      <div className="mt-4 flex flex-wrap gap-2">
        {[["", "All"], ["queued", "Queued"], ["sent", "Sent"], ["failed", "Failed"]].map(([value, label]) => (
          <a key={label} href={value ? `/admin/email?status=${value}` : "/admin/email"} className={`btn btn-sm ${status === value || (!status && !value) ? "btn-primary" : "btn-secondary"}`}>{label}</a>
        ))}
      </div>
      <Card className="mt-4">
        <CardHeader title="Messages" action={<Badge>{rows.length}</Badge>} />
        {rows.length ? (
          <ul className="mt-2 space-y-2">
            {rows.map((m) => (
              <li key={m.id} className="subtle p-3">
                <div className="flex flex-wrap items-start justify-between gap-2">
                  <div className="min-w-0">
                    <p className="text-sm font-medium">{m.subject}</p>
                    <p className="text-xs" style={{ color: "var(--muted)" }}>To {m.to} · {m.template ?? "custom"} · {formatDateTime(m.createdAt)}</p>
                    <p className="mt-1 line-clamp-3 whitespace-pre-wrap text-xs" style={{ color: "var(--muted)" }}>{m.body}</p>
                    {m.error ? <p className="mt-1 text-xs" style={{ color: "var(--danger)" }}>{m.error}</p> : null}
                  </div>
                  <div className="flex shrink-0 items-center gap-2">
                    <StatusBadge status={m.status} />
                    <form action={updateOutboxAction}>
                      <input type="hidden" name="id" value={m.id} />
                      <input type="hidden" name="op" value={m.status === "sent" ? "queued" : "sent"} />
                      <SubmitButton variant="ghost" size="sm">{m.status === "sent" ? "Requeue" : "Mark sent"}</SubmitButton>
                    </form>
                  </div>
                </div>
              </li>
            ))}
          </ul>
        ) : <EmptyState icon={<Mail className="h-6 w-6" />} title="Outbox is empty" description="Invites, receipts and reminders appear here." />}
      </Card>
    </>
  );
}
