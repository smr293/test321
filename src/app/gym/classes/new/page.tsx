import { and, eq, isNull } from "drizzle-orm";
import { db } from "@/db/client";
import { orgMembers, users } from "@/db/schema";
import { Card, PageHeader } from "@/components/ui/primitives";
import { ClassForm } from "@/components/gym/class-form";
import { requireOrgPage } from "@/lib/authz";
import { createClassAction } from "@/lib/actions/gym";

export const metadata = { title: "New class" };

export default async function NewClassPage() {
  const ctx = await requireOrgPage();
  const coaches = await db
    .select({ member: orgMembers, user: users })
    .from(orgMembers)
    .innerJoin(users, eq(users.id, orgMembers.userId))
    .where(and(eq(orgMembers.orgId, ctx.org.id), eq(orgMembers.role, "coach"), isNull(orgMembers.archivedAt)));
  return (
    <div className="mx-auto max-w-3xl space-y-5">
      <PageHeader title="New class" description="Set the weekly pattern — sessions are generated automatically." />
      <Card>
        <ClassForm
          action={createClassAction}
          orgId={ctx.org.id}
          coaches={coaches.map((c) => ({ id: c.member.id, name: c.user.name }))}
          locations={ctx.locations.map((l) => ({ id: l.id, name: l.name }))}
          submitLabel="Create class"
        />
      </Card>
    </div>
  );
}
