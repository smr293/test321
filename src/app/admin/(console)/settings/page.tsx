import { Card, CardHeader, Callout, Field, Input, PageHeader } from "@/components/ui/primitives";
import { SubmitButton } from "@/components/ui/client";
import { getPlatformSettings } from "@/lib/saas";
import { savePlatformSettingsAction } from "@/lib/actions/superadmin";
import { env } from "@/lib/env";

export const metadata = { title: "Platform settings · Platform admin" };

export default async function AdminSettingsPage() {
  const s = await getPlatformSettings();
  return (
    <>
      <PageHeader eyebrow="Configuration" title="Platform settings" description="Applies across every gym. Changes are audited." />
      <div className="mt-4 grid gap-4 lg:grid-cols-[1.4fr_1fr]">
        <Card>
          <CardHeader title="General" />
          <form action={savePlatformSettingsAction} className="mt-3 space-y-3">
            <div className="grid gap-3 sm:grid-cols-2">
              <Field label="Platform name"><Input name="platformName" defaultValue={s.platformName} required /></Field>
              <Field label="Support email"><Input name="supportEmail" type="email" defaultValue={s.supportEmail} required /></Field>
              <Field label="Trial length (days)"><Input name="trialDays" type="number" min={0} max={90} defaultValue={s.trialDays} /></Field>
              <Field label="Default currency"><Input name="defaultCurrency" maxLength={3} defaultValue={s.defaultCurrency} /></Field>
              <Field label="Support SLA (hours)"><Input name="supportResponseSla" type="number" min={1} defaultValue={s.supportResponseSla} /></Field>
              <Field label="Max gyms per user"><Input name="maxOrgsPerUser" type="number" min={1} defaultValue={s.maxOrgsPerUser} /></Field>
            </div>
            <div className="space-y-2">
              <label className="flex items-center gap-2 text-sm"><input type="checkbox" name="allowSignups" defaultChecked={s.allowSignups === "true"} /> Allow public signups</label>
              <label className="flex items-center gap-2 text-sm"><input type="checkbox" name="allowNewOrgs" defaultChecked={s.allowNewOrgs === "true"} /> Allow new gyms to be created</label>
              <label className="flex items-center gap-2 text-sm"><input type="checkbox" name="maintenanceMode" defaultChecked={s.maintenanceMode === "true"} /> Maintenance mode (blocks signups)</label>
            </div>
            <SubmitButton>Save settings</SubmitButton>
          </form>
        </Card>
        <div className="space-y-4">
          <Callout tone="warn" title="Maintenance mode">
            Blocks new signups and gym registrations. Existing sessions keep working so staff can finish critical tasks.
          </Callout>
          <Card>
            <CardHeader title="Runtime" />
            <ul className="mt-2 space-y-1 text-sm">
              <li>Environment: <strong>{env.nodeEnv}</strong></li>
              <li>App URL: <span className="font-mono text-xs">{env.appUrl}</span></li>
              <li>Email provider: {env.email.resendApiKey ? "Resend" : "outbox (dev)"}</li>
              <li>Billing: {env.stripe.secretKey ? "Stripe configured" : "sandbox (test)"}</li>
            </ul>
            <p className="mt-3 text-xs" style={{ color: "var(--muted)" }}>
              Secrets are read from environment variables only and never stored in the database.
            </p>
          </Card>
        </div>
      </div>
    </>
  );
}
