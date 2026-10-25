import Link from "next/link";
import { Badge, ButtonLink, Card, CardHeader, EmptyState, Field, Input, Money, PageHeader, Textarea } from "@/components/ui/primitives";
import { ConfirmSubmit, Modal, SubmitButton } from "@/components/ui/client";
import { listSaasPlans } from "@/lib/saas";
import { saveSaasPlanAction, toggleSaasPlanAction } from "@/lib/actions/superadmin";

export const metadata = { title: "SaaS plans · Platform admin" };

function PlanForm({ plan }: { plan?: Awaited<ReturnType<typeof listSaasPlans>>[number] }) {
  return (
    <form action={saveSaasPlanAction} className="space-y-3">
      {plan ? <input type="hidden" name="id" value={plan.id} /> : null}
      <div className="grid gap-3 sm:grid-cols-2">
        <Field label="Name"><Input name="name" defaultValue={plan?.name} required /></Field>
        <Field label="Slug"><Input name="slug" defaultValue={plan?.slug} placeholder="auto from name" /></Field>
      </div>
      <Field label="Description"><Textarea name="description" rows={2} defaultValue={plan?.description ?? ""} /></Field>
      <div className="grid gap-3 sm:grid-cols-2">
        <Field label="Monthly price (SEK)"><Input name="priceMonthly" type="number" min={0} step="1" defaultValue={((plan?.priceMonthlyCents ?? 0) / 100).toString()} /></Field>
        <Field label="Annual price (SEK)"><Input name="priceAnnual" type="number" min={0} step="1" defaultValue={((plan?.priceAnnualCents ?? 0) / 100).toString()} /></Field>
      </div>
      <div className="grid grid-cols-2 gap-3 sm:grid-cols-4">
        <Field label="Locations"><Input name="maxLocations" type="number" min={1} defaultValue={plan?.maxLocations ?? 1} /></Field>
        <Field label="Members"><Input name="maxActiveMembers" type="number" min={1} defaultValue={plan?.maxActiveMembers ?? 50} /></Field>
        <Field label="Coaches"><Input name="maxCoaches" type="number" min={1} defaultValue={plan?.maxCoaches ?? 2} /></Field>
        <Field label="Sort order"><Input name="sortOrder" type="number" defaultValue={plan?.sortOrder ?? 0} /></Field>
      </div>
      <Field label="Features (comma separated)" hint="Feature keys gate modules in the gym workspace.">
        <Textarea name="features" rows={2} defaultValue={plan?.features.join(", ") ?? ""} placeholder="analytics, fight_camps, advanced_reports" />
      </Field>
      <label className="flex items-center gap-2 text-sm">
        <input type="checkbox" name="isActive" defaultChecked={plan?.isActive ?? true} /> Active (available for assignment)
      </label>
      <SubmitButton size="sm">{plan ? "Save plan" : "Create plan"}</SubmitButton>
    </form>
  );
}

export default async function AdminPlansPage() {
  const plans = await listSaasPlans();
  const mrr = plans.reduce((sum, p) => sum + (p.isActive ? p.priceMonthlyCents * p.orgs : 0), 0);
  return (
    <>
      <PageHeader
        eyebrow="Monetisation"
        title="SaaS plans"
        description="The plans gyms subscribe to. Limits are enforced server-side by entitlements."
        actions={<ButtonLink href="/admin/plans/new" size="sm">New plan</ButtonLink>}
      />
      <div className="mt-4 grid gap-3 md:grid-cols-2 xl:grid-cols-3">
        {plans.map((p) => (
          <Card key={p.id}>
            <CardHeader title={p.name} description={p.description ?? `${p.maxActiveMembers} members · ${p.maxCoaches} coaches`} action={<Badge tone={p.isActive ? "accent" : "neutral"}>{p.isActive ? "active" : "archived"}</Badge>} />
            <div className="mt-2 flex items-end gap-2">
              <Money cents={p.priceMonthlyCents} className="text-xl font-semibold" />
              <span className="text-xs" style={{ color: "var(--muted)" }}>/{p.currency}/mo · {p.orgs} gyms</span>
            </div>
            <ul className="mt-2 space-y-0.5 text-xs" style={{ color: "var(--muted)" }}>
              <li>{p.maxLocations} locations · {p.maxActiveMembers} active members · {p.maxCoaches} coaches</li>
              <li>{p.features.length ? p.features.join(", ") : "No feature flags"}</li>
              <li>Annual: <Money cents={p.priceAnnualCents} /></li>
            </ul>
            <div className="mt-3 flex gap-2">
              <Modal trigger="Edit" title={`Edit ${p.name}`} triggerVariant="secondary" triggerSize="sm" wide>
                <PlanForm plan={p} />
              </Modal>
              <form action={toggleSaasPlanAction}>
                <input type="hidden" name="id" value={p.id} />
                <ConfirmSubmit variant="ghost" message={`${p.isActive ? "Archive" : "Activate"} ${p.name}?`}>{p.isActive ? "Archive" : "Activate"}</ConfirmSubmit>
              </form>
            </div>
          </Card>
        ))}
        {plans.length === 0 ? <Card><EmptyState title="No plans yet" description="Create the first SaaS plan to onboard gyms." /></Card> : null}
      </div>
      <p className="mt-4 text-sm" style={{ color: "var(--muted)" }}>
        Current plan MRR: <Money cents={mrr} className="font-semibold" /> · <Link href="/admin/revenue" className="underline">revenue detail</Link>
      </p>
    </>
  );
}
