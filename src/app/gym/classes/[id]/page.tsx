import { and, eq, isNull } from "drizzle-orm";
import { notFound } from "next/navigation";
import { db } from "@/db/client";
import { classes, orgMembers, users } from "@/db/schema";
import { Card, PageHeader } from "@/components/ui/primitives";
import { ClassForm } from "@/components/gym/class-form";
import { requireOrgPage } from "@/lib/authz";
import { updateClassAction } from "@/lib/actions/gym";

export default async function EditClassPage({ params }: { params: Promise<{ id: string }> }) {
  const ctx = await requireOrgPage();
  const { id } = await params;
  const cls = (await db.select().from(classes).where(and(eq(classes.id, id), eq(classes.orgId, ctx.org.id))).limit(1))[0];
  if (!cls) notFound();
  const coaches = await db
    .select({ member: orgMembers, user: users })
    .from(orgMembers)
    .innerJoin(users, eq(users.id, orgMembers.userId))
    .where(and(eq(orgMembers.orgId, ctx.org.id), eq(orgMembers.role, "coach"), isNull(orgMembers.archivedAt)));
  return (
    <div className="mx-auto max-w-3xl space-y-5">
      <PageHeader title={`Edit ${cls.name}`} description="Changes apply to future generated sessions." />
      <Card>
        <ClassForm
          action={updateClassAction}
          orgId={ctx.org.id}
          coaches={coaches.map((c) => ({ id: c.member.id, name: c.user.name }))}
          locations={ctx.locations.map((l) => ({ id: l.id, name: l.name }))}
          cls={cls}
          submitLabel="Save class"
        />
      </Card>
    </div>
  );
}
