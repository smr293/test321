import { Badge, Card, CardHeader, EmptyState, Field, Input, PageHeader, Textarea } from "@/components/ui/primitives";
import { ConfirmSubmit, SubmitButton } from "@/components/ui/client";
import { listFlags } from "@/lib/saas";
import { deleteFlagAction, saveFlagAction, toggleFlagAction } from "@/lib/actions/superadmin";
import { parseJson } from "@/lib/utils";

export const metadata = { title: "Feature flags · Platform admin" };

export default async function AdminFlagsPage() {
  const flags = await listFlags();
  return (
    <>
      <PageHeader eyebrow="Rollout" title="Feature flags" description="Enable capabilities globally or for a specific list of gyms. Flags are checked server-side." />
      <div className="mt-4 grid gap-4 lg:grid-cols-[1.3fr_1fr]">
        <Card>
          <CardHeader title="Flags" action={<Badge>{flags.length}</Badge>} />
          {flags.length ? (
            <ul className="mt-2 space-y-2">
              {flags.map((f) => {
                const allow = parseJson<string[] | null>(f.orgIds, null);
                return (
                  <li key={f.key} className="subtle p-3">
                    <div className="flex flex-wrap items-start justify-between gap-2">
                      <div className="min-w-0">
                        <p className="text-sm font-semibold">
                          {f.name} <span className="font-mono text-xs" style={{ color: "var(--muted)" }}>{f.key}</span>
                        </p>
                        <p className="text-xs" style={{ color: "var(--muted)" }}>{f.description ?? "No description"}</p>
                        <p className="mt-1 text-xs" style={{ color: "var(--muted)" }}>
                          {allow?.length ? `Limited to ${allow.length} gym(s)` : "All gyms"} · updated {new Date(f.updatedAt).toLocaleDateString()}
                        </p>
                      </div>
                      <div className="flex items-center gap-2">
                        <Badge tone={f.enabled ? "accent" : "neutral"}>{f.enabled ? "enabled" : "off"}</Badge>
                        <form action={toggleFlagAction}>
                          <input type="hidden" name="key" value={f.key} />
                          <SubmitButton variant="secondary" size="sm">{f.enabled ? "Disable" : "Enable"}</SubmitButton>
                        </form>
                        <form action={deleteFlagAction}>
                          <input type="hidden" name="key" value={f.key} />
                          <ConfirmSubmit message={`Delete flag ${f.key}? Code referencing it will fall back to disabled.`}>Delete</ConfirmSubmit>
                        </form>
                      </div>
                    </div>
                  </li>
                );
              })}
            </ul>
          ) : <EmptyState title="No flags" description="Create your first flag on the right." />}
        </Card>

        <Card>
          <CardHeader title="Create / update flag" description="Saving with an existing key updates it." />
          <form action={saveFlagAction} className="mt-3 space-y-3">
            <Field label="Key" hint="Lowercase, underscores."><Input name="key" required placeholder="advanced_analytics" /></Field>
            <Field label="Name"><Input name="name" required placeholder="Advanced analytics" /></Field>
            <Field label="Description"><Textarea name="description" rows={2} /></Field>
            <Field label="Allowed gym IDs (optional)" hint="Comma separated. Leave empty for everyone."><Textarea name="orgIds" rows={2} placeholder="org_id_1, org_id_2" /></Field>
            <label className="flex items-center gap-2 text-sm"><input type="checkbox" name="enabled" defaultChecked /> Enabled</label>
            <SubmitButton>Save flag</SubmitButton>
          </form>
        </Card>
      </div>
    </>
  );
}
