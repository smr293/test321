import { and, eq, isNull } from "drizzle-orm";
import { MapPin } from "lucide-react";
import { db } from "@/db/client";
import { classes, gymLocations, orgMembers } from "@/db/schema";
import { Badge, Card, CardHeader, EmptyState, Field, Input, Callout } from "@/components/ui/primitives";
import { ConfirmSubmit, SubmitButton } from "@/components/ui/client";
import { requireOrgPage } from "@/lib/authz";
import { addLocationAction, archiveLocationAction } from "@/lib/actions/gym";
import { getEntitlements } from "@/lib/entitlements";

export const metadata = { title: "Locations" };

export default async function LocationsPage() {
  const ctx = await requireOrgPage();
  const locations = await db
    .select()
    .from(gymLocations)
    .where(and(eq(gymLocations.orgId, ctx.org.id), isNull(gymLocations.archivedAt)));
  const counts = await Promise.all(
    locations.map(async (l) => ({
      location: l,
      members: (await db.select({ id: orgMembers.id }).from(orgMembers).where(and(eq(orgMembers.orgId, ctx.org.id), eq(orgMembers.locationId, l.id)))).length,
      classes: (await db.select({ id: classes.id }).from(classes).where(and(eq(classes.orgId, ctx.org.id), eq(classes.locationId, l.id)))).length,
    })),
  );
  const ent = await getEntitlements(ctx.org.id);
  const canManage = ctx.permissions.has("org:manage");

  return (
    <div className="grid gap-4 lg:grid-cols-3">
      <div className="space-y-3 lg:col-span-2">
        {counts.map(({ location, members, classes: classCount }) => (
          <Card key={location.id}>
            <div className="flex items-start justify-between gap-2">
              <div>
                <p className="font-semibold">{location.name} {location.isPrimary ? <Badge tone="accent">primary</Badge> : null}</p>
                <p className="text-sm" style={{ color: "var(--muted)" }}>{[location.address, location.city].filter(Boolean).join(", ") || "No address"}</p>
                <p className="mt-1 text-xs" style={{ color: "var(--muted)" }}>{members} members · {classCount} classes · {location.timezone}</p>
              </div>
              {canManage && !location.isPrimary ? (
                <form action={archiveLocationAction}>
                  <input type="hidden" name="orgId" value={ctx.org.id} />
                  <input type="hidden" name="locationId" value={location.id} />
                  <ConfirmSubmit message={`Archive ${location.name}? Classes and members must be reassigned first.`}>Archive</ConfirmSubmit>
                </form>
              ) : null}
            </div>
          </Card>
        ))}
        {!counts.length ? <EmptyState icon={<MapPin className="h-5 w-5" />} title="No locations" /> : null}
      </div>

      <div className="space-y-4">
        <Card>
          <CardHeader title="Add a location" description={`${ent.usage.locations}/${ent.maxLocations} used on ${ent.planName}`} />
          {canManage ? (
            <form action={addLocationAction} className="mt-3 space-y-3">
              <input type="hidden" name="orgId" value={ctx.org.id} />
              <Field label="Name"><Input name="name" required placeholder="Kista" /></Field>
              <Field label="Address"><Input name="address" placeholder="Kistagången 12" /></Field>
              <Field label="City"><Input name="city" placeholder="Stockholm" /></Field>
              <Field label="Timezone"><Input name="timezone" defaultValue={ctx.org.timezone} /></Field>
              <SubmitButton>Add location</SubmitButton>
            </form>
          ) : (
            <Callout tone="warn">You do not have permission to manage locations.</Callout>
          )}
        </Card>
        {!ent.canAddLocation ? (
          <Callout tone="warn" title="Plan limit reached">
            Your {ent.planName} plan allows {ent.maxLocations} location(s). Upgrade in Subscription to add more.
          </Callout>
        ) : null}
      </div>
    </div>
  );
}
