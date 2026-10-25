import Link from "next/link";
import { and, desc, eq } from "drizzle-orm";
import { notFound } from "next/navigation";
import { CalendarClock, CheckCircle2, Circle, Swords } from "lucide-react";
import { db } from "@/db/client";
import { fightCamps, orgMembers, readinessCheckins, trainingSessions, users } from "@/db/schema";
import { Avatar, Badge, Card, CardHeader, Divider, EmptyState, Field, PageHeader, Stat, StatusBadge, Textarea, Callout } from "@/components/ui/primitives";
import { SubmitButton } from "@/components/ui/client";
import { TrendChart } from "@/components/ui/charts";
import { requireOrgPage } from "@/lib/authz";
import { addCampNoteAction, updateCampChecklistAction } from "@/lib/actions/gym";
import { daysUntil, formatDate, formatDateTime, parseJson } from "@/lib/utils";

export default async function CampDetailPage({ params }: { params: Promise<{ id: string }> }) {
  const ctx = await requireOrgPage();
  const { id } = await params;
  const row = (
    await db
      .select({ camp: fightCamps, fighter: orgMembers, user: users })
      .from(fightCamps)
      .innerJoin(orgMembers, eq(orgMembers.id, fightCamps.fighterMemberId))
      .innerJoin(users, eq(users.id, orgMembers.userId))
      .where(and(eq(fightCamps.id, id), eq(fightCamps.orgId, ctx.org.id)))
      .limit(1)
  )[0];
  if (!row) notFound();

  const [checkins, sessions] = await Promise.all([
    db.select().from(readinessCheckins).where(and(eq(readinessCheckins.orgId, ctx.org.id), eq(readinessCheckins.memberId, row.fighter.id))).orderBy(desc(readinessCheckins.date)).limit(21),
    db.select().from(trainingSessions).where(and(eq(trainingSessions.orgId, ctx.org.id), eq(trainingSessions.memberId, row.fighter.id))).orderBy(desc(trainingSessions.date)).limit(20),
  ]);

  const checklist = parseJson<{ label: string; done: boolean }[]>(row.camp.checklist, []);
  const phases = parseJson<{ name: string; focus?: string; start?: string; end?: string }[]>(row.camp.phases, []);
  const targets = parseJson<Record<string, number>>(row.camp.weeklyTargets, {});
  const fightIn = daysUntil(row.camp.fightDate);
  const canManage = ctx.permissions.has("fightcamps:manage");
  const readiness = [...checkins].reverse().map((c) => ({
    label: formatDate(c.date, { day: "numeric", month: "short" }),
    value: Math.round((((c.energy ?? 5) + (c.sleep ?? 5) + (10 - (c.soreness ?? 5)) + (c.mood ?? 5)) / 4) * 10) / 10,
  }));

  return (
    <div className="space-y-5">
      <PageHeader
        eyebrow="Fight camp"
        title={row.camp.eventName ?? row.camp.title}
        description={`${row.user.name} vs ${row.camp.opponent ?? "TBD"} · ${formatDate(row.camp.fightDate)} · ${row.camp.weightClass ?? "weight class TBD"}`}
        actions={<Link href="/gym/fight-camps" className="btn btn-ghost btn-sm">← All camps</Link>}
      />

      <div className="grid gap-3 sm:grid-cols-4">
        <Stat label="Fight in" value={`${fightIn} days`} tone="accent" />
        <Stat label="Checklist" value={`${checklist.filter((c) => c.done).length}/${checklist.length}`} />
        <Stat label="Sessions logged" value={sessions.length} hint="Recent camp sessions" />
        <Stat label="Status" value={<StatusBadge status={row.camp.status} />} />
      </div>

      <div className="grid gap-4 lg:grid-cols-3">
        <Card className="lg:col-span-2">
          <CardHeader title="Preparation checklist" description="Shared with the athlete in their app" />
          <ul className="mt-3 space-y-1.5">
            {checklist.map((item, index) => (
              <li key={item.label} className="flex items-center justify-between gap-2 rounded-lg border p-2.5 text-sm" style={{ borderColor: "var(--line)" }}>
                <span className="flex items-center gap-2">
                  {item.done ? <CheckCircle2 className="h-4 w-4" style={{ color: "var(--accent)" }} /> : <Circle className="h-4 w-4" style={{ color: "var(--muted)" }} />}
                  <span className={item.done ? "line-through opacity-60" : ""}>{item.label}</span>
                </span>
                {canManage ? (
                  <form action={updateCampChecklistAction}>
                    <input type="hidden" name="orgId" value={ctx.org.id} />
                    <input type="hidden" name="campId" value={row.camp.id} />
                    <input type="hidden" name="index" value={index} />
                    <SubmitButton size="sm" variant="ghost">{item.done ? "Undo" : "Done"}</SubmitButton>
                  </form>
                ) : null}
              </li>
            ))}
          </ul>
          <Divider />
          <CardHeader title="Phases" />
          <div className="mt-2 grid gap-2 sm:grid-cols-3">
            {phases.map((phase) => (
              <div key={phase.name} className="subtle p-3">
                <p className="text-sm font-semibold">{phase.name}</p>
                <p className="text-xs" style={{ color: "var(--muted)" }}>{phase.focus}</p>
                {phase.start ? <p className="mt-1 text-[0.7rem]" style={{ color: "var(--muted)" }}>{formatDate(phase.start)} → {formatDate(phase.end ?? "")}</p> : null}
              </div>
            ))}
          </div>
          <Divider />
          <CardHeader title="Coach notes" description="Visible to the athlete" />
          <form action={addCampNoteAction} className="mt-2 space-y-2">
            <input type="hidden" name="orgId" value={ctx.org.id} />
            <input type="hidden" name="campId" value={row.camp.id} />
            <Textarea name="notes" defaultValue={row.camp.coachNotes ?? ""} placeholder="Keep the weight cut gradual. Review readiness every Monday." />
            {canManage ? <SubmitButton size="sm">Save notes</SubmitButton> : null}
          </form>
        </Card>

        <div className="space-y-4">
          <Card>
            <CardHeader title="Weekly targets" />
            <div className="mt-2 space-y-1.5 text-sm">
              {Object.entries(targets).map(([key, value]) => (
                <div key={key} className="flex items-center justify-between">
                  <span style={{ color: "var(--muted)" }}>{key.replace(/_/g, " ")}</span>
                  <span className="stat-value">{value}</span>
                </div>
              ))}
            </div>
          </Card>
          <Card>
            <CardHeader title="Readiness trend" description="Subjective, not medical" />
            <TrendChart data={readiness} height={140} />
            <Callout tone="warn">Use readiness to adjust load — never to justify dangerous weight cutting.</Callout>
          </Card>
          <Card>
            <CardHeader title="Fighter" />
            <Link href={`/gym/fighters/${row.fighter.id}`} className="mt-2 flex items-center gap-2 text-sm hover:underline">
              <Avatar name={row.user.name} size={30} /> {row.user.name}
            </Link>
            <p className="mt-2 text-xs" style={{ color: "var(--muted)" }}>Camp started {formatDate(row.camp.campStart)}</p>
          </Card>
        </div>
      </div>

      <Card>
        <CardHeader title="Training log during camp" description="Latest sessions the athlete logged" />
        {sessions.length ? (
          <div className="mt-3 divide-y" style={{ borderColor: "var(--line)" }}>
            {sessions.slice(0, 8).map((s) => (
              <div key={s.id} className="flex items-center justify-between gap-2 py-2 text-sm">
                <span className="flex items-center gap-2"><Swords className="h-3.5 w-3.5" style={{ color: "var(--accent)" }} /> {s.type} · {s.durationMinutes} min · {s.intensity}</span>
                <span className="text-xs" style={{ color: "var(--muted)" }}>{formatDateTime(s.date)}</span>
              </div>
            ))}
          </div>
        ) : (
          <EmptyState icon={<CalendarClock className="h-4 w-4" />} title="No sessions logged yet" />
        )}
      </Card>
    </div>
  );
}
