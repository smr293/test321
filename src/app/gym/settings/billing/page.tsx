import { eq } from "drizzle-orm";
import { CheckCircle2, CreditCard } from "lucide-react";
import { db } from "@/db/client";
import { saasPlans, saasSubscriptions } from "@/db/schema";
import { Badge, ButtonLink, Callout, Card, CardHeader, KeyValue, ProgressBar, StatusBadge } from "@/components/ui/primitives";
import { ConfirmSubmit } from "@/components/ui/client";
import { requireOrgPage } from "@/lib/authz";
import { changeSaasPlanAction } from "@/lib/actions/gym";
import { getEntitlements } from "@/lib/entitlements";
import { formatDate, formatMoney, pct, parseJson } from "@/lib/utils";

export const metadata = { title: "Subscription" };

export default async function BillingSettingsPage() {
  const ctx = await requireOrgPage();
  const [plans, sub, ent] = await Promise.all([
    db.select().from(saasPlans).orderBy(saasPlans.sortOrder),
    db
      .select({ sub: saasSubscriptions, plan: saasPlans })
      .from(saasSubscriptions)
      .innerJoin(saasPlans, eq(saasPlans.id, saasSubscriptions.planId))
      .where(eq(saasSubscriptions.orgId, ctx.org.id))
      .limit(1),
    getEntitlements(ctx.org.id),
  ]);
  const current = sub[0];
  const canChange = ctx.role === "owner";

  return (
    <div className="space-y-4">
      <Card>
        <CardHeader
          title="Your MMA OS subscription"
          description="Platform billing is separate from member membership payments."
          action={current ? <StatusBadge status={current.sub.status} /> : <Badge>no plan</Badge>}
        />
        <div className="mt-3 grid gap-x-6 sm:grid-cols-2">
          <div>
            <KeyValue label="Plan">{current?.plan.name ?? ent.planName}</KeyValue>
            <KeyValue label="Price">{current ? formatMoney(current.plan.priceMonthlyCents, current.plan.currency) : "—"}<span className="text-xs" style={{ color: "var(--muted)" }}> / month</span></KeyValue>
            <KeyValue label="Renews">{formatDate(current?.sub.currentPeriodEnd)}</KeyValue>
          </div>
          <div>
            <KeyValue label="Members">{ent.usage.activeMembers} / {ent.maxActiveMembers}</KeyValue>
            <KeyValue label="Coaches">{ent.usage.coaches} / {ent.maxCoaches}</KeyValue>
            <KeyValue label="Locations">{ent.usage.locations} / {ent.maxLocations}</KeyValue>
          </div>
        </div>
        <div className="mt-3 grid gap-3 sm:grid-cols-3">
          <ProgressBar label="Members" value={pct(ent.usage.activeMembers, ent.maxActiveMembers)} />
          <ProgressBar label="Coaches" value={pct(ent.usage.coaches, ent.maxCoaches)} />
          <ProgressBar label="Locations" value={pct(ent.usage.locations, ent.maxLocations)} />
        </div>
        <Callout tone="info">
          Payments are handled by Stripe in production. In development the app uses an explicitly labelled sandbox
          provider — no real cards, no real money.
        </Callout>
      </Card>

      <div className="grid gap-4 md:grid-cols-3">
        {plans.map((plan) => {
          const isCurrent = current?.plan.id === plan.id;
          const features = parseJson<string[]>(plan.features, []);
          return (
            <Card key={plan.id} className={isCurrent ? "glow" : undefined}>
              <div className="flex items-center justify-between">
                <h2 className="font-semibold">{plan.name}</h2>
                {isCurrent ? <Badge tone="accent">current</Badge> : null}
              </div>
              <p className="mt-1 text-sm" style={{ color: "var(--muted)" }}>{plan.description}</p>
              <p className="mt-2 text-xl font-semibold stat-value">{formatMoney(plan.priceMonthlyCents, plan.currency)}<span className="text-xs font-normal" style={{ color: "var(--muted)" }}>/mo</span></p>
              <ul className="mt-2 space-y-1 text-xs" style={{ color: "var(--muted)" }}>
                <li>{plan.maxLocations} locations · {plan.maxCoaches} coaches</li>
                <li>{plan.maxActiveMembers.toLocaleString("en-GB")} active members</li>
                {features.slice(0, 5).map((f) => <li key={f} className="flex gap-1"><CheckCircle2 className="h-3 w-3" style={{ color: "var(--accent)" }} />{f.replace(/_/g, " ")}</li>)}
              </ul>
              {canChange && !isCurrent ? (
                <form action={changeSaasPlanAction} className="mt-3">
                  <input type="hidden" name="orgId" value={ctx.org.id} />
                  <input type="hidden" name="planId" value={plan.id} />
                  <ConfirmSubmit message={`Switch to ${plan.name}? Limits apply immediately.`} variant="secondary">
                    <CreditCard className="h-3.5 w-3.5" /> Switch to {plan.name}
                  </ConfirmSubmit>
                </form>
              ) : null}
            </Card>
          );
        })}
      </div>

      <Card>
        <CardHeader title="Need more?" description="Custom plans for multi-gym groups are available." />
        <ButtonLink href="/app/support" variant="secondary" size="sm">Contact support</ButtonLink>
      </Card>
    </div>
  );
}
