import { PageHeader, Card } from "@/components/ui/primitives";
import { PlanForm } from "@/components/gym/plan-form";
import { requireOrgPage } from "@/lib/authz";
import { createPlanAction } from "@/lib/actions/gym";
import { redirect } from "next/navigation";

export const metadata = { title: "New membership plan" };

export default async function NewPlanPage() {
  const ctx = await requireOrgPage();
  if (!ctx.permissions.has("org:manage")) redirect("/gym/memberships?error=Only+owners+and+managers+with+permission+can+edit+plans");
  return (
    <div className="mx-auto max-w-3xl space-y-5">
      <PageHeader title="New membership plan" description="Set clear terms — members see exactly what they get." />
      <Card>
        <PlanForm action={createPlanAction} orgId={ctx.org.id} submitLabel="Create plan" />
      </Card>
    </div>
  );
}
