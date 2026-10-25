import { Field, Input, Select, Textarea, Button } from "@/components/ui/primitives";
import type { MembershipPlan } from "@/db/schema";

/** Shared create/edit form for membership plans. */
export function PlanForm({
  action,
  orgId,
  plan,
  submitLabel,
}: {
  action: (formData: FormData) => void | Promise<void>;
  orgId: string;
  plan?: MembershipPlan;
  submitLabel: string;
}) {
  return (
    <form action={action} className="space-y-4">
      <input type="hidden" name="orgId" value={orgId} />
      {plan ? <input type="hidden" name="planId" value={plan.id} /> : null}
      <div className="grid gap-3 sm:grid-cols-2">
        <Field label="Plan name" htmlFor="name" className="sm:col-span-2">
          <Input id="name" name="name" defaultValue={plan?.name} required placeholder="MMA Unlimited" />
        </Field>
        <Field label="Description" htmlFor="description" className="sm:col-span-2" hint="Shown to members when they choose a plan.">
          <Textarea id="description" name="description" defaultValue={plan?.description ?? ""} placeholder="All classes, every day." />
        </Field>
        <Field label="Type" htmlFor="category">
          <Select id="category" name="category" defaultValue={plan?.category ?? "unlimited"}>
            <option value="unlimited">Unlimited</option>
            <option value="limited">Limited classes per week</option>
            <option value="program">Single discipline</option>
            <option value="pass">Class pass (credits)</option>
            <option value="trial">Trial</option>
            <option value="team">Team</option>
            <option value="kids">Kids</option>
            <option value="annual">Annual</option>
          </Select>
        </Field>
        <Field label="Billing interval" htmlFor="interval">
          <Select id="interval" name="interval" defaultValue={plan?.interval ?? "month"}>
            <option value="month">Monthly</option>
            <option value="year">Yearly</option>
            <option value="week">Weekly</option>
            <option value="one_time">One-time</option>
          </Select>
        </Field>
        <Field label="Price" htmlFor="price" hint="In the gym's currency, e.g. 990 or 990.50">
          <Input id="price" name="price" type="number" step="0.01" min="0" defaultValue={plan ? plan.priceCents / 100 : 990} required />
        </Field>
        <Field label="Currency" htmlFor="currency">
          <Input id="currency" name="currency" defaultValue={plan?.currency ?? "SEK"} maxLength={3} required />
        </Field>
        <Field label="Signup / registration fee" htmlFor="signupFee">
          <Input id="signupFee" name="signupFee" type="number" step="0.01" min="0" defaultValue={plan ? plan.signupFeeCents / 100 : 0} />
        </Field>
        <Field label="Classes per week" htmlFor="classLimitPerWeek" hint="Leave empty for unlimited.">
          <Input id="classLimitPerWeek" name="classLimitPerWeek" type="number" min="0" max="50" defaultValue={plan?.classLimitPerWeek ?? ""} />
        </Field>
        <Field label="Class credits" htmlFor="creditCount" hint="For passes. Leave empty for none.">
          <Input id="creditCount" name="creditCount" type="number" min="0" max="500" defaultValue={plan?.creditCount ?? ""} />
        </Field>
        <Field label="Trial days" htmlFor="trialDays">
          <Input id="trialDays" name="trialDays" type="number" min="0" max="90" defaultValue={plan?.trialDays ?? 0} />
        </Field>
        <Field label="Minimum commitment (months)" htmlFor="minCommitmentMonths">
          <Input id="minCommitmentMonths" name="minCommitmentMonths" type="number" min="0" max="36" defaultValue={plan?.minCommitmentMonths ?? 0} />
        </Field>
        <Field label="Notice period (days)" htmlFor="noticePeriodDays">
          <Input id="noticePeriodDays" name="noticePeriodDays" type="number" min="0" max="180" defaultValue={plan?.noticePeriodDays ?? 30} />
        </Field>
        <Field label="Freeze maximum (days)" htmlFor="freezeMaxDays">
          <Input id="freezeMaxDays" name="freezeMaxDays" type="number" min="0" max="365" defaultValue={plan?.freezeMaxDays ?? 60} />
        </Field>
        <Field label="Family discount (%)" htmlFor="familyDiscountPercent">
          <Input id="familyDiscountPercent" name="familyDiscountPercent" type="number" min="0" max="100" defaultValue={(plan?.familyDiscountBps ?? 0) / 100} />
        </Field>
        <Field label="Student discount (%)" htmlFor="studentDiscountPercent">
          <Input id="studentDiscountPercent" name="studentDiscountPercent" type="number" min="0" max="100" defaultValue={(plan?.studentDiscountBps ?? 0) / 100} />
        </Field>
        <Field label="Allowed disciplines" htmlFor="allowedDisciplines" className="sm:col-span-2" hint="Comma separated. Leave empty for all classes.">
          <Input id="allowedDisciplines" name="allowedDisciplines" defaultValue={plan?.allowedDisciplines ? JSON.parse(plan.allowedDisciplines).join(", ") : ""} placeholder="Brazilian Jiu-Jitsu, Open Mat" />
        </Field>
      </div>
      <div className="grid gap-2 sm:grid-cols-2">
        <label className="flex items-center gap-2 text-sm">
          <input type="checkbox" name="freezeAllowed" defaultChecked={plan?.freezeAllowed ?? true} className="h-4 w-4 accent-[var(--accent)]" /> Allow freezing
        </label>
        <label className="flex items-center gap-2 text-sm">
          <input type="checkbox" name="autoRenew" defaultChecked={plan?.autoRenew ?? true} className="h-4 w-4 accent-[var(--accent)]" /> Auto-renew by default
        </label>
        <label className="flex items-center gap-2 text-sm">
          <input type="checkbox" name="isActive" defaultChecked={plan?.isActive ?? true} className="h-4 w-4 accent-[var(--accent)]" /> Available for new members
        </label>
      </div>
      <Field label="Terms" htmlFor="terms" hint="Shown on the plan and invoices. Be transparent about commitments.">
        <Textarea id="terms" name="terms" defaultValue={plan?.terms ?? ""} placeholder="Rolling monthly. Cancel with 30 days notice." />
      </Field>
      <Field label="Cancellation policy" htmlFor="cancellationPolicy">
        <Textarea id="cancellationPolicy" name="cancellationPolicy" defaultValue={plan?.cancellationPolicy ?? ""} />
      </Field>
      <Button type="submit">{submitLabel}</Button>
    </form>
  );
}
