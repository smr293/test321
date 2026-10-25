import Link from "next/link";
import { and, eq, isNull } from "drizzle-orm";
import { ArrowRight, CheckCircle2, Circle } from "lucide-react";
import { db } from "@/db/client";
import { classes, gymLocations, membershipPlans, orgMembers, users } from "@/db/schema";
import { Badge, ButtonLink, Callout, Card, CardHeader, Field, Input, PageHeader, ProgressBar, Select } from "@/components/ui/primitives";
import { CopyButton, SubmitButton } from "@/components/ui/client";
import { requireOrgPage } from "@/lib/authz";
import { completeOnboardingStepAction, createClassAction, createInviteLinkAction, createPlanAction, updateGymSettingsAction } from "@/lib/actions/gym";
import { pct } from "@/lib/utils";

export const metadata = { title: "Set up your gym" };

export default async function OnboardingPage() {
  const ctx = await requireOrgPage();
  const orgId = ctx.org.id;
  const [plans, classRows, coaches, members] = await Promise.all([
    db.select({ id: membershipPlans.id }).from(membershipPlans).where(eq(membershipPlans.orgId, orgId)),
    db.select({ id: classes.id }).from(classes).where(eq(classes.orgId, orgId)),
    db
      .select({ member: orgMembers, user: users })
      .from(orgMembers)
      .innerJoin(users, eq(users.id, orgMembers.userId))
      .where(and(eq(orgMembers.orgId, orgId), eq(orgMembers.role, "coach"), isNull(orgMembers.archivedAt))),
    db.select({ id: orgMembers.id }).from(orgMembers).where(and(eq(orgMembers.orgId, orgId), eq(orgMembers.role, "fighter"))),
  ]);

  const steps = [
    { title: "Create your gym", done: Boolean(ctx.org.name), hint: "Name, currency and contact details." },
    { title: "Add your first membership plan", done: plans.length > 0, hint: "Unlimited, 2x/week, a class pass or a trial." },
    { title: "Schedule your first class", done: classRows.length > 0, hint: "Pick days and a time — sessions generate automatically." },
    { title: "Invite your members", done: members.length > 0, hint: "Send an email invitation or share your gym code." },
  ];
  const done = steps.filter((s) => s.done).length;

  return (
    <div className="mx-auto max-w-3xl space-y-5">
      <PageHeader eyebrow="Setup" title="Let's get your gym running" description="Four steps, about five minutes. You can invite the rest later." />
      <Card>
        <div className="flex items-center justify-between">
          <p className="text-sm font-medium">{done} of 4 complete</p>
          <Badge tone="accent">{pct(done, 4)}%</Badge>
        </div>
        <div className="mt-2"><ProgressBar value={pct(done, 4)} /></div>
        <ul className="mt-3 space-y-1.5">
          {steps.map((s) => (
            <li key={s.title} className="flex items-center gap-2 text-sm">
              {s.done ? <CheckCircle2 className="h-4 w-4" style={{ color: "var(--accent)" }} /> : <Circle className="h-4 w-4" style={{ color: "var(--muted)" }} />}
              <span className={s.done ? "line-through opacity-60" : ""}>{s.title}</span>
              <span className="ml-auto text-xs" style={{ color: "var(--muted)" }}>{s.hint}</span>
            </li>
          ))}
        </ul>
      </Card>

      <Card>
        <CardHeader title="1 · Gym details" description="Everything here appears in the member app." />
        <form action={updateGymSettingsAction} className="mt-3 grid gap-3 sm:grid-cols-2">
          <input type="hidden" name="orgId" value={orgId} />
          <Field label="Gym name"><Input name="name" defaultValue={ctx.org.name} required /></Field>
          <Field label="Contact email"><Input name="contactEmail" type="email" defaultValue={ctx.org.contactEmail ?? ""} /></Field>
          <Field label="Currency"><Input name="currency" defaultValue={ctx.org.currency} maxLength={3} /></Field>
          <Field label="Country"><Input name="country" defaultValue={ctx.org.country} maxLength={2} /></Field>
          <div className="sm:col-span-2"><SubmitButton>Save gym details</SubmitButton></div>
        </form>
      </Card>

      <Card>
        <CardHeader title="2 · First membership plan" description="Start with your most popular plan — you can add more later." />
        <form action={createPlanAction} className="mt-3 grid gap-3 sm:grid-cols-2">
          <input type="hidden" name="orgId" value={orgId} />
          <input type="hidden" name="category" value="unlimited" />
          <input type="hidden" name="interval" value="month" />
          <input type="hidden" name="currency" value={ctx.org.currency} />
          <Field label="Plan name"><Input name="name" defaultValue="MMA Unlimited" required /></Field>
          <Field label="Monthly price"><Input name="price" type="number" min={0} step="1" defaultValue={990} required /></Field>
          <Field label="Description" className="sm:col-span-2"><Input name="description" defaultValue="All classes, every day." /></Field>
          <div className="sm:col-span-2"><SubmitButton>Create plan</SubmitButton></div>
        </form>
      </Card>

      <Card>
        <CardHeader title="3 · First class" description="We generate sessions eight weeks ahead." />
        <form action={createClassAction} className="mt-3 grid gap-3 sm:grid-cols-2">
          <input type="hidden" name="orgId" value={orgId} />
          <input type="hidden" name="durationMinutes" value="60" />
          <input type="hidden" name="level" value="all" />
          <Field label="Class name"><Input name="name" defaultValue="MMA Fundamentals" required /></Field>
          <Field label="Discipline"><Input name="discipline" defaultValue="MMA" required /></Field>
          <Field label="Days (0=Sun … 6=Sat)"><Input name="days" defaultValue="1,3" /></Field>
          <Field label="Start time"><Input name="time" type="time" defaultValue="18:00" /></Field>
          <Field label="Capacity"><Input name="capacity" type="number" defaultValue={20} min={1} max={200} /></Field>
          <Field label="Coach">
            <Select name="coachMemberId">
              <option value="">Assign later</option>
              {coaches.map((c) => <option key={c.member.id} value={c.member.id}>{c.user.name}</option>)}
            </Select>
          </Field>
          <div className="sm:col-span-2"><SubmitButton>Create class</SubmitButton></div>
        </form>
      </Card>

      <Card>
        <CardHeader title="4 · Invite your members" description="Each person gets a secure link to set their password." />
        <form action={createInviteLinkAction} className="mt-3 flex flex-wrap items-end gap-2">
          <input type="hidden" name="orgId" value={orgId} />
          <div className="min-w-0 flex-1"><Field label="Email"><Input name="email" type="email" required placeholder="member@example.com" /></Field></div>
          <SubmitButton>Send invite</SubmitButton>
        </form>
        <div className="mt-3 flex flex-wrap items-center gap-2 text-sm">
          <span style={{ color: "var(--muted)" }}>Gym code members can use to join:</span>
          <code className="rounded bg-[var(--card-2)] px-2 py-1 text-xs">{ctx.org.slug}</code>
          <CopyButton value={ctx.org.slug} label="Copy code" />
        </div>
        <div className="mt-4 flex flex-wrap gap-2">
          <form action={completeOnboardingStepAction}>
            <input type="hidden" name="orgId" value={orgId} />
            <input type="hidden" name="step" value={4} />
            <SubmitButton variant={done >= 3 ? "primary" : "secondary"}>Finish setup <ArrowRight className="h-4 w-4" /></SubmitButton>
          </form>
          <ButtonLink href="/gym" variant="ghost">Go to dashboard</ButtonLink>
        </div>
      </Card>

      <Callout tone="info" title="Optional later">
        Add locations, coach permissions, Stripe billing and fight camps whenever you're ready. Nothing else is
        required to start taking bookings. <Link href="/gym/settings" className="underline">Open settings</Link>
      </Callout>
    </div>
  );
}
