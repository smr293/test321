import { Card, PageHeader } from "@/components/ui/primitives";
import { saveSaasPlanAction } from "@/lib/actions/superadmin";
import { Field, Input, Textarea } from "@/components/ui/primitives";
import { SubmitButton } from "@/components/ui/client";

export const metadata = { title: "New SaaS plan" };

export default function NewPlanPage() {
  return (
    <>
      <PageHeader eyebrow="Monetisation" title="New SaaS plan" description="Limits apply immediately to gyms assigned this plan." />
      <Card className="mt-4 max-w-2xl">
        <form action={saveSaasPlanAction} className="space-y-3">
          <div className="grid gap-3 sm:grid-cols-2">
            <Field label="Name"><Input name="name" required placeholder="Growth" /></Field>
            <Field label="Slug"><Input name="slug" placeholder="growth" /></Field>
          </div>
          <Field label="Description"><Textarea name="description" rows={2} /></Field>
          <div className="grid gap-3 sm:grid-cols-2">
            <Field label="Monthly price (SEK)"><Input name="priceMonthly" type="number" min={0} defaultValue={0} /></Field>
            <Field label="Annual price (SEK)"><Input name="priceAnnual" type="number" min={0} defaultValue={0} /></Field>
          </div>
          <div className="grid grid-cols-2 gap-3 sm:grid-cols-4">
            <Field label="Locations"><Input name="maxLocations" type="number" min={1} defaultValue={1} /></Field>
            <Field label="Members"><Input name="maxActiveMembers" type="number" min={1} defaultValue={100} /></Field>
            <Field label="Coaches"><Input name="maxCoaches" type="number" min={1} defaultValue={3} /></Field>
            <Field label="Sort order"><Input name="sortOrder" type="number" defaultValue={10} /></Field>
          </div>
          <Field label="Features (comma separated)"><Textarea name="features" rows={2} placeholder="analytics, fight_camps" /></Field>
          <label className="flex items-center gap-2 text-sm"><input type="checkbox" name="isActive" defaultChecked /> Active</label>
          <SubmitButton>Create plan</SubmitButton>
        </form>
      </Card>
    </>
  );
}
