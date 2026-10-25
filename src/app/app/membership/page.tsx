import Link from "next/link";
import { redirect } from "next/navigation";
import { and, eq } from "drizzle-orm";
import { CreditCard, PauseCircle, ShieldCheck } from "lucide-react";
import { db } from "@/db/client";
import { invoices, membershipPauses, membershipPlans } from "@/db/schema";
import { Badge, ButtonLink, Callout, Card, CardHeader, Divider, EmptyState, Field, Input, KeyValue, PageHeader, StatusBadge, Textarea } from "@/components/ui/primitives";
import { Modal, SubmitButton } from "@/components/ui/client";
import { requireOrgPage } from "@/lib/authz";
import { membershipSummary } from "@/lib/membership";
import { requestMembershipChangeAction } from "@/lib/actions/fighter";
import { formatDate, formatMoney, formatDateTime } from "@/lib/utils";

export const metadata = { title: "My membership" };

export default async function MembershipPage() {
  const ctx = await requireOrgPage();
  if (!ctx.membership) redirect("/app/onboarding");
  const orgId = ctx.org.id;
  const memberId = ctx.membership.id;

  const [summary, plans, pauses, invoiceRows] = await Promise.all([
    membershipSummary(orgId, memberId),
    db.select().from(membershipPlans).where(and(eq(membershipPlans.orgId, orgId), eq(membershipPlans.isActive, true))).orderBy(membershipPlans.sortOrder),
    db.select().from(membershipPauses).where(eq(membershipPauses.orgId, orgId)),
    db.select().from(invoices).where(and(eq(invoices.orgId, orgId), eq(invoices.memberId, memberId))).limit(10),
  ]);

  const current = summary.current;
  const myPauses = pauses.filter((p) => p.subscriptionId === current?.subscription.id);

  return (
    <div className="space-y-4">
      <PageHeader title="Your membership" description="Everything about your plan, payments and access." actions={<ButtonLink href="/app/billing" variant="secondary" size="sm">Billing</ButtonLink>} />

      {current ? (
        <Card>
          <div className="flex flex-wrap items-start justify-between gap-3">
            <div>
              <p className="text-lg font-semibold">{current.plan.name}</p>
              <p className="text-sm" style={{ color: "var(--muted)" }}>{current.plan.description}</p>
            </div>
            <StatusBadge status={current.subscription.status} />
          </div>
          <Divider />
          <div className="grid gap-x-6 sm:grid-cols-2">
            <div>
              <KeyValue label="Price">{formatMoney(current.subscription.priceCents, current.subscription.currency)} <span style={{ color: "var(--muted)" }}>/ {current.plan.interval}</span></KeyValue>
              <KeyValue label="Started">{formatDate(current.subscription.startDate)}</KeyValue>
              <KeyValue label="Renews">{formatDate(current.subscription.currentPeriodEnd)}</KeyValue>
            </div>
            <div>
              <KeyValue label="Credits">{current.subscription.creditsRemaining ?? "Unlimited"}</KeyValue>
              <KeyValue label="Classes">{current.plan.classLimitPerWeek ? `${current.plan.classLimitPerWeek} per week` : "Unlimited"}</KeyValue>
              <KeyValue label="Auto-renew">{current.subscription.autoRenew ? "On" : "Off"}</KeyValue>
            </div>
          </div>
          {current.subscription.status === "paused" ? (
            <Callout tone="warn" title="Paused">Your membership resumes {formatDate(current.subscription.resumeAt)}. Access is off until then.</Callout>
          ) : null}
          {summary.balanceCents > 0 ? (
            <Callout tone="danger" title="Outstanding balance">
              {formatMoney(summary.balanceCents, current.subscription.currency)} is due.{" "}
              <Link href="/app/billing" className="underline">Pay now</Link>
            </Callout>
          ) : null}
          <div className="mt-3 flex flex-wrap gap-2">
            <Modal trigger={<><PauseCircle className="h-4 w-4" /> Request pause</>} title="Request a pause" description="Your gym will confirm. The paid period is extended by the pause length." triggerVariant="secondary" triggerSize="sm">
              <form action={requestMembershipChangeAction} className="space-y-3">
                <input type="hidden" name="request" value="pause" />
                <Field label="When and why?"><Textarea name="message" placeholder="Travel from 12–26 Nov." required /></Field>
                <SubmitButton>Send request</SubmitButton>
              </form>
            </Modal>
            <Modal trigger={<>Request cancellation</>} title="Request cancellation" description="Notice and commitment terms from your plan apply." triggerVariant="danger" triggerSize="sm">
              <form action={requestMembershipChangeAction} className="space-y-3">
                <input type="hidden" name="request" value="cancel" />
                <Callout tone="warn" title="Before you cancel">
                  {current.plan.cancellationPolicy ?? "Standard cancellation policy applies."} Notice period: {current.plan.noticePeriodDays} days.
                </Callout>
                <Field label="Reason (optional)"><Input name="message" /></Field>
                <SubmitButton variant="danger">Send cancellation request</SubmitButton>
              </form>
            </Modal>
            <Modal trigger={<>Change plan</>} title="Ask to change plan" triggerVariant="secondary" triggerSize="sm">
              <form action={requestMembershipChangeAction} className="space-y-3">
                <input type="hidden" name="request" value="plan_change" />
                <div className="max-h-64 space-y-2 overflow-y-auto">
                  {plans.map((p) => (
                    <label key={p.id} className="flex cursor-pointer items-center justify-between gap-2 rounded-lg border p-2.5 text-sm" style={{ borderColor: "var(--line)" }}>
                      <span>
                        <span className="block font-medium">{p.name}</span>
                        <span className="block text-xs" style={{ color: "var(--muted)" }}>{p.description}</span>
                      </span>
                      <span className="flex items-center gap-2">
                        <span className="stat-value text-sm">{formatMoney(p.priceCents, p.currency)}</span>
                        {p.id === current.plan.id ? <Badge tone="accent">current</Badge> : <input type="radio" name="message" value={`Change to ${p.name}`} className="h-4 w-4 accent-[var(--accent)]" />}
                      </span>
                    </label>
                  ))}
                </div>
                <Field label="Anything else?"><Textarea name="message" placeholder="Optional" /></Field>
                <SubmitButton>Send request</SubmitButton>
              </form>
            </Modal>
          </div>
        </Card>
      ) : (
        <Card>
          <EmptyState icon={<CreditCard className="h-5 w-5" />} title="No active membership" description="Ask your gym to assign a plan. You can still see your training history." />
        </Card>
      )}

      {myPauses.length ? (
        <Card>
          <CardHeader title="Pauses" />
          <div className="mt-2 space-y-2 text-sm">
            {myPauses.map((p) => (
              <div key={p.id} className="subtle flex items-center justify-between p-2.5">
                <span>{formatDate(p.startDate)} → {formatDate(p.endDate)}</span>
                <span style={{ color: "var(--muted)" }}>{p.reason ?? "—"}</span>
              </div>
            ))}
          </div>
        </Card>
      ) : null}

      <Card>
        <CardHeader title="Plan includes" description="Access rules for your plan" />
        <ul className="mt-2 space-y-1.5 text-sm">
          <li>✓ {current?.plan.classLimitPerWeek ? `${current.plan.classLimitPerWeek} classes per week` : "All classes"}</li>
          <li>✓ {current?.plan.allowedDisciplines ? JSON.parse(current.plan.allowedDisciplines).join(", ") : "Every discipline at the gym"}</li>
          <li>✓ {current?.plan.freezeAllowed ? `Freeze up to ${current.plan.freezeMaxDays} days` : "No freezes on this plan"}</li>
          <li>✓ {current?.plan.minCommitmentMonths ? `${current.plan.minCommitmentMonths} month minimum commitment` : "No lock-in"}</li>
          <li>✓ Notice period: {current?.plan.noticePeriodDays ?? 0} days</li>
          <li>✓ {current?.plan.autoRenew ? "Renews automatically" : "Does not renew automatically"}</li>
        </ul>
        {current?.plan.terms ? (
          <div className="mt-3"><Callout tone="info" title="Terms">{current.plan.terms}</Callout></div>
        ) : null}
      </Card>

      <Card className="overflow-hidden p-0">
        <div className="p-5 pb-0"><CardHeader title="Recent invoices" action={<ButtonLink href="/app/billing" variant="ghost" size="sm">All</ButtonLink>} /></div>
        {invoiceRows.length ? (
          <div className="mt-3 overflow-x-auto">
            <table className="table">
              <thead><tr><th>Invoice</th><th>Amount</th><th>Status</th><th>Date</th></tr></thead>
              <tbody>
                {invoiceRows.slice(0, 5).map((i) => (
                  <tr key={i.id}>
                    <td className="font-mono text-xs">{i.number}</td>
                    <td className="stat-value text-sm">{formatMoney(i.amountCents, i.currency)}</td>
                    <td><StatusBadge status={i.status} /></td>
                    <td className="text-xs" style={{ color: "var(--muted)" }}>{formatDateTime(i.paidAt ?? i.createdAt)}</td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        ) : (
          <div className="p-5"><EmptyState title="No invoices yet" /></div>
        )}
      </Card>

      <p className="flex items-center gap-2 text-xs" style={{ color: "var(--muted)" }}>
        <ShieldCheck className="h-3.5 w-3.5" /> Your plan and price are set by your gym. All changes are logged.
      </p>
    </div>
  );
}
