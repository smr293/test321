import Link from "next/link";
import { and, count, desc, eq, inArray, isNull, sql } from "drizzle-orm";
import { CreditCard, Plus, Users } from "lucide-react";
import { db } from "@/db/client";
import { membershipPlans, orgMembers, subscriptions, users } from "@/db/schema";
import { Badge, ButtonLink, Card, CardHeader, EmptyState, PageHeader, Stat, StatusBadge, Avatar } from "@/components/ui/primitives";
import { SubmitButton } from "@/components/ui/client";
import { requireOrgPage } from "@/lib/authz";
import { togglePlanAction } from "@/lib/actions/gym";
import { formatDate, formatMoney } from "@/lib/utils";

export const metadata = { title: "Memberships" };

export default async function MembershipsPage() {
  const ctx = await requireOrgPage();
  const orgId = ctx.org.id;

  const [plans, subs] = await Promise.all([
    db.select().from(membershipPlans).where(eq(membershipPlans.orgId, orgId)).orderBy(membershipPlans.sortOrder, membershipPlans.name),
    db
      .select({ sub: subscriptions, plan: membershipPlans, member: orgMembers, user: users })
      .from(subscriptions)
      .innerJoin(membershipPlans, eq(membershipPlans.id, subscriptions.planId))
      .innerJoin(orgMembers, eq(orgMembers.id, subscriptions.memberId))
      .innerJoin(users, eq(users.id, orgMembers.userId))
      .where(and(eq(subscriptions.orgId, orgId), inArray(subscriptions.status, ["active", "trial", "past_due", "paused", "cancel_scheduled", "pending"])))
      .orderBy(desc(subscriptions.createdAt)),
  ]);

  const counts = new Map<string, number>();
  for (const s of subs) counts.set(s.plan.id, (counts.get(s.plan.id) ?? 0) + 1);
  const mrr = subs.filter((s) => ["active", "trial", "cancel_scheduled"].includes(s.sub.status)).reduce((sum, s) => sum + s.sub.priceCents, 0);

  return (
    <div className="space-y-5">
      <PageHeader
        title="Memberships"
        description="Plans, prices and every active membership. Transparent terms, no surprises."
        actions={ctx.permissions.has("org:manage") ? <ButtonLink href="/gym/memberships/plans/new" size="sm"><Plus className="h-4 w-4" /> New plan</ButtonLink> : null}
      />

      <div className="grid gap-3 sm:grid-cols-3">
        <Stat label="Active plans" value={plans.filter((p) => p.isActive).length} icon={<CreditCard className="h-4 w-4" />} />
        <Stat label="Members on a plan" value={subs.length} icon={<Users className="h-4 w-4" />} />
        <Stat label="Recurring value" value={formatMoney(mrr, ctx.org.currency)} tone="accent" hint="Active memberships / month" />
      </div>

      <div className="grid gap-4 md:grid-cols-2 xl:grid-cols-3">
        {plans.map((plan) => (
          <Card key={plan.id} className="flex flex-col">
            <div className="flex items-start justify-between gap-2">
              <div>
                <h2 className="font-semibold">{plan.name}</h2>
                <p className="mt-0.5 text-xs" style={{ color: "var(--muted)" }}>{plan.category} · {plan.interval.replace("_", "-")}</p>
              </div>
              {plan.isActive ? <Badge tone="accent">active</Badge> : <Badge>hidden</Badge>}
            </div>
            <p className="mt-2 min-h-10 text-sm" style={{ color: "var(--muted)" }}>{plan.description ?? "—"}</p>
            <p className="mt-2 text-xl font-semibold stat-value">
              {formatMoney(plan.priceCents, plan.currency)}
              <span className="ml-1 text-xs font-normal" style={{ color: "var(--muted)" }}>{plan.interval === "one_time" ? "one-time" : `/${plan.interval}`}</span>
            </p>
            <ul className="mt-3 space-y-1 text-xs" style={{ color: "var(--muted)" }}>
              <li>{plan.classLimitPerWeek ? `${plan.classLimitPerWeek} classes / week` : plan.creditCount ? `${plan.creditCount} credits` : "Unlimited classes"}</li>
              {plan.signupFeeCents ? <li>Signup fee {formatMoney(plan.signupFeeCents, plan.currency)}</li> : null}
              {plan.trialDays ? <li>{plan.trialDays}-day trial included</li> : null}
              <li>{plan.minCommitmentMonths ? `${plan.minCommitmentMonths} month commitment` : "No lock-in"}{plan.noticePeriodDays ? ` · ${plan.noticePeriodDays} days notice` : ""}</li>
              <li>{plan.freezeAllowed ? `Freeze up to ${plan.freezeMaxDays} days` : "No freezes"}</li>
            </ul>
            <div className="mt-auto flex items-center justify-between gap-2 pt-4">
              <span className="badge">{counts.get(plan.id) ?? 0} members</span>
              <div className="flex gap-1">
                <ButtonLink href={`/gym/memberships/plans/${plan.id}`} variant="secondary" size="sm">Edit</ButtonLink>
                {ctx.permissions.has("org:manage") ? (
                  <form action={togglePlanAction}>
                    <input type="hidden" name="orgId" value={orgId} />
                    <input type="hidden" name="planId" value={plan.id} />
                    <SubmitButton variant="ghost" size="sm">{plan.isActive ? "Hide" : "Show"}</SubmitButton>
                  </form>
                ) : null}
              </div>
            </div>
          </Card>
        ))}
        {!plans.length ? (
          <div className="md:col-span-2 xl:col-span-3">
            <EmptyState
              icon={<CreditCard className="h-5 w-5" />}
              title="No plans yet"
              description="Create your first membership plan — unlimited, classes per week, a class pass or a trial."
              action={<ButtonLink href="/gym/memberships/plans/new" size="sm">Create plan</ButtonLink>}
            />
          </div>
        ) : null}
      </div>

      <Card className="overflow-hidden p-0">
        <div className="p-5 pb-0">
          <CardHeader title="Active memberships" description="Pause, cancel or change a plan from the member profile." />
        </div>
        {subs.length ? (
          <div className="mt-3 overflow-x-auto">
            <table className="table">
              <thead>
                <tr><th>Member</th><th>Plan</th><th>Status</th><th>Price</th><th>Period ends</th><th /></tr>
              </thead>
              <tbody>
                {subs.map((s) => (
                  <tr key={s.sub.id}>
                    <td>
                      <Link href={`/gym/members/${s.member.id}`} className="flex items-center gap-2">
                        <Avatar name={s.user.name} size={28} />
                        <span className="font-medium">{s.user.name}</span>
                      </Link>
                    </td>
                    <td className="text-sm">{s.plan.name}</td>
                    <td><StatusBadge status={s.sub.status} /></td>
                    <td className="stat-value text-sm">{formatMoney(s.sub.priceCents, s.sub.currency)}</td>
                    <td className="text-sm">{formatDate(s.sub.currentPeriodEnd)}</td>
                    <td className="text-right"><Link href={`/gym/members/${s.member.id}`} className="btn btn-secondary btn-sm">Manage</Link></td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        ) : (
          <div className="p-5"><EmptyState title="No active memberships" description="Assign a plan from a member profile." /></div>
        )}
      </Card>
    </div>
  );
}
