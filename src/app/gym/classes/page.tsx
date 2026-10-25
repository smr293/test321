import Link from "next/link";
import { and, eq, gte, sql } from "drizzle-orm";
import { CalendarDays, Plus } from "lucide-react";
import { db } from "@/db/client";
import { classSessions, classes, orgMembers, users } from "@/db/schema";
import { Badge, ButtonLink, Card, CardHeader, EmptyState, PageHeader, Stat, StatusBadge } from "@/components/ui/primitives";
import { SubmitButton } from "@/components/ui/client";
import { requireOrgPage } from "@/lib/authz";
import { toggleClassAction } from "@/lib/actions/gym";
import { formatDateTime, parseJson } from "@/lib/utils";

export const metadata = { title: "Classes" };

export default async function ClassesPage() {
  const ctx = await requireOrgPage();
  const orgId = ctx.org.id;
  const rows = await db
    .select({
      cls: classes,
      coach: users.name,
      nextSession: sql<number | null>`(select min(cs.starts_at) from class_sessions cs where cs.class_id = ${classes.id} and cs.starts_at > ${Date.now()} and cs.status = 'scheduled')`,
      upcoming: sql<number>`(select count(*) from class_sessions cs where cs.class_id = ${classes.id} and cs.starts_at > ${Date.now()})`,
    })
    .from(classes)
    .leftJoin(orgMembers, eq(orgMembers.id, classes.coachMemberId))
    .leftJoin(users, eq(users.id, orgMembers.userId))
    .where(eq(classes.orgId, orgId))
    .orderBy(classes.name);

  const nextSeven = await db
    .select({ n: sql<number>`count(*)` })
    .from(classSessions)
    .where(and(eq(classSessions.orgId, orgId), gte(classSessions.startsAt, new Date()), eq(classSessions.status, "scheduled")));

  const weekday = ["Sun", "Mon", "Tue", "Wed", "Thu", "Fri", "Sat"];

  return (
    <div className="space-y-5">
      <PageHeader
        title="Classes"
        description="The recurring classes that make up your weekly schedule."
        actions={<ButtonLink href="/gym/classes/new" size="sm"><Plus className="h-4 w-4" /> New class</ButtonLink>}
      />
      <div className="grid gap-3 sm:grid-cols-3">
        <Stat label="Classes" value={rows.length} hint={`${rows.filter((r) => r.cls.isActive).length} active`} />
        <Stat label="Upcoming sessions" value={Number(nextSeven[0]?.n ?? 0)} icon={<CalendarDays className="h-4 w-4" />} />
        <Stat label="Locations" value={ctx.locations.length} />
      </div>

      <div className="grid gap-3 md:grid-cols-2 xl:grid-cols-3">
        {rows.map(({ cls, coach, nextSession, upcoming }) => {
          const rec = parseJson<{ days: number[]; time: string } | null>(cls.recurrence, null);
          return (
            <Card key={cls.id}>
              <div className="flex items-start justify-between gap-2">
                <div className="min-w-0">
                  <h2 className="truncate font-semibold">{cls.name}</h2>
                  <p className="text-xs" style={{ color: "var(--muted)" }}>{cls.discipline} · {cls.level} · {cls.durationMinutes} min</p>
                </div>
                {cls.isActive ? <Badge tone="accent">active</Badge> : <Badge>paused</Badge>}
              </div>
              <div className="mt-3 space-y-1 text-sm">
                <p style={{ color: "var(--muted)" }}>{rec ? `${rec.days.map((d) => weekday[d]).join(", ")} at ${rec.time}` : "No recurring schedule"}</p>
                <p style={{ color: "var(--muted)" }}>Coach: {coach ?? "Unassigned"}</p>
                <p style={{ color: "var(--muted)" }}>Capacity: {cls.capacity}</p>
                <p className="text-xs" style={{ color: "var(--muted)" }}>
                  {nextSession ? `Next: ${formatDateTime(new Date(Number(nextSession)))}` : "No upcoming sessions"} · {Number(upcoming)} upcoming
                </p>
              </div>
              <div className="mt-3 flex gap-1.5">
                <ButtonLink href={`/gym/classes/${cls.id}`} variant="secondary" size="sm">Edit</ButtonLink>
                <ButtonLink href="/gym/calendar" variant="ghost" size="sm">Calendar</ButtonLink>
                {ctx.permissions.has("classes:manage") ? (
                  <form action={toggleClassAction} className="ml-auto">
                    <input type="hidden" name="orgId" value={orgId} />
                    <input type="hidden" name="classId" value={cls.id} />
                    <SubmitButton variant="ghost" size="sm">{cls.isActive ? "Pause" : "Activate"}</SubmitButton>
                  </form>
                ) : null}
              </div>
            </Card>
          );
        })}
      </div>
      {!rows.length ? (
        <EmptyState
          icon={<CalendarDays className="h-5 w-5" />}
          title="No classes yet"
          description="Add your weekly classes so members can book."
          action={<ButtonLink href="/gym/classes/new" size="sm">Create your first class</ButtonLink>}
        />
      ) : null}
    </div>
  );
}
