import { eq, sql } from "drizzle-orm";
import { Download, ShieldCheck } from "lucide-react";
import { db } from "@/db/client";
import { auditLogs, organizations } from "@/db/schema";
import { ButtonLink, Callout, Card, CardHeader, Field, Input, Select, Textarea, KeyValue, Badge } from "@/components/ui/primitives";
import { SubmitButton } from "@/components/ui/client";
import { requireOrgPage } from "@/lib/authz";
import { setOrgStatusForOwnerAction, updateGymSettingsAction } from "@/lib/actions/gym";
import { formatDateTime } from "@/lib/utils";

export const metadata = { title: "Gym settings" };

export default async function SettingsPage() {
  const ctx = await requireOrgPage();
  if (!ctx.permissions.has("org:manage")) {
    return <Callout tone="warn">Only the gym owner (or a manager with permission) can change gym settings.</Callout>;
  }
  const org = (await db.select().from(organizations).where(eq(organizations.id, ctx.org.id)).limit(1))[0];
  const recentAudit = await db
    .select({ log: auditLogs })
    .from(auditLogs)
    .where(eq(auditLogs.orgId, ctx.org.id))
    .orderBy(sql`${auditLogs.createdAt} desc`)
    .limit(8);

  return (
    <div className="grid gap-4 lg:grid-cols-3">
      <Card className="lg:col-span-2">
        <CardHeader title="Gym profile" description="Shown to members in the app and on receipts." />
        <form action={updateGymSettingsAction} className="mt-4 space-y-3">
          <input type="hidden" name="orgId" value={ctx.org.id} />
          <div className="grid gap-3 sm:grid-cols-2">
            <Field label="Gym name" htmlFor="name"><Input id="name" name="name" defaultValue={org.name} required /></Field>
            <Field label="Contact email" htmlFor="contactEmail"><Input id="contactEmail" name="contactEmail" type="email" defaultValue={org.contactEmail ?? ""} /></Field>
            <Field label="Phone" htmlFor="contactPhone"><Input id="contactPhone" name="contactPhone" defaultValue={org.contactPhone ?? ""} /></Field>
            <Field label="Website" htmlFor="website"><Input id="website" name="website" defaultValue={org.website ?? ""} /></Field>
            <Field label="Currency" htmlFor="currency" hint="ISO code, e.g. SEK, EUR, USD"><Input id="currency" name="currency" maxLength={3} defaultValue={org.currency} /></Field>
            <Field label="Country" htmlFor="country" hint="ISO code, e.g. SE"><Input id="country" name="country" maxLength={2} defaultValue={org.country} /></Field>
            <Field label="Tax rate (%)" htmlFor="taxRate" hint="Applied to membership invoices"><Input id="taxRate" name="taxRate" type="number" step="0.01" min={0} max={50} defaultValue={(org.taxRateBps / 100).toString()} /></Field>
            <Field label="Brand color" htmlFor="brandColor"><Input id="brandColor" name="brandColor" type="color" defaultValue={org.brandColor} className="h-10 p-1" /></Field>
            <Field label="Timezone" htmlFor="timezone">
              <Select id="timezone" name="timezone" defaultValue={org.timezone}>
                {["Europe/Stockholm", "Europe/London", "Europe/Berlin", "UTC", "America/New_York"].map((tz) => <option key={tz} value={tz}>{tz}</option>)}
              </Select>
            </Field>
            <Field label="Public gym code" htmlFor="slug" hint="Members use this to join your gym."><Input id="slug" defaultValue={org.slug} readOnly /></Field>
          </div>
          <Field label="Description" htmlFor="description"><Textarea id="description" name="description" defaultValue={org.description ?? ""} /></Field>
          <SubmitButton>Save settings</SubmitButton>
        </form>
      </Card>

      <div className="space-y-4">
        <Card>
          <CardHeader title="Membership & payments" />
          <KeyValue label="Currency">{org.currency}</KeyValue>
          <KeyValue label="Tax rate">{(org.taxRateBps / 100).toFixed(2)}%</KeyValue>
          <KeyValue label="Country">{org.country}</KeyValue>
          <KeyValue label="Payment provider">{process.env.STRIPE_SECRET_KEY ? "Stripe" : "Sandbox (test mode)"}</KeyValue>
          <Callout tone="info">
            Stripe keys and webhooks are configured by environment variables. Member card details never touch MMA OS.
          </Callout>
        </Card>

        <Card>
          <CardHeader title="Privacy & data" />
          <ButtonLink href="/api/export/members" variant="secondary" size="sm" prefetch={false} className="mb-2 w-full"><Download className="h-4 w-4" /> Export members (CSV)</ButtonLink>
          <ButtonLink href="/api/export/payments" variant="secondary" size="sm" prefetch={false} className="w-full"><Download className="h-4 w-4" /> Export payments (CSV)</ButtonLink>
          <p className="mt-2 text-xs" style={{ color: "var(--muted)" }}>
            Data exports include contact details and membership status. Handle them as personal data under GDPR.
          </p>
        </Card>

        <Card>
          <CardHeader title="Recent audit events" action={<Badge><ShieldCheck className="h-3 w-3" /> hash-chained</Badge>} />
          <ul className="mt-2 space-y-1.5 text-xs">
            {recentAudit.map(({ log }) => (
              <li key={log.id} className="flex items-start justify-between gap-2 border-b pb-1.5" style={{ borderColor: "var(--line)" }}>
                <span className="min-w-0">
                  <span className="block truncate font-medium">{log.action}</span>
                  <span className="block truncate" style={{ color: "var(--muted)" }}>{log.actorName ?? "system"} → {log.targetType ?? "—"}</span>
                </span>
                <span className="shrink-0" style={{ color: "var(--muted)" }}>{formatDateTime(log.createdAt)}</span>
              </li>
            ))}
            {!recentAudit.length ? <li style={{ color: "var(--muted)" }}>No events yet.</li> : null}
          </ul>
        </Card>

        <Card className="border-[color-mix(in_srgb,var(--danger)_30%,transparent)]">
          <CardHeader title="Close this gym’s account" description="This logs a request for our team. Data is retained per policy." />
          <form action={setOrgStatusForOwnerAction} className="mt-3 space-y-2">
            <input type="hidden" name="orgId" value={ctx.org.id} />
            <label className="flex items-center gap-2 text-sm">
              <input type="checkbox" name="confirm" className="h-4 w-4 accent-[var(--danger)]" /> I understand this requests account closure
            </label>
            <SubmitButton variant="danger" size="sm">Request closure</SubmitButton>
          </form>
        </Card>
      </div>
    </div>
  );
}
