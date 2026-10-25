import { and, eq } from "drizzle-orm";
import { notFound } from "next/navigation";
import { db } from "@/db/client";
import { membershipPlans } from "@/db/schema";
import { PageHeader, Card } from "@/components/ui/primitives";
import { PlanForm } from "@/components/gym/plan-form";
import { requireOrgPage } from "@/lib/authz";
import { updatePlanAction } from "@/lib/actions/gym";

export default async function EditPlanPage({ params }: { params: Promise<{ id: string }> }) {
  const ctx = await requireOrgPage();
  const { id } = await params;
  const plan = (
    await db.select().from(membershipPlans).where(and(eq(membershipPlans.id, id), eq(membershipPlans.orgId, ctx.org.id))).limit(1)
  )[0];
  if (!plan) notFound();
  return (
    <div className="mx-auto max-w-3xl space-y-5">
      <PageHeader title={plan.name} description="Plan details, pricing and contract terms." />
      <Card>
        <PlanForm action={updatePlanAction} orgId={ctx.org.id} plan={plan} submitLabel="Save plan" />
      </Card>
    </div>
  );
}
