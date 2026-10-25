import Link from "next/link";
import { redirect } from "next/navigation";
import { and, asc, desc, eq, gte, sql } from "drizzle-orm";
import { Dumbbell, Flame, Plus, Target, Trash2, TrendingUp } from "lucide-react";
import { db } from "@/db/client";
import { attendance, coachNotes, fighterGoals, orgMembers, programAssignments, trainingPrograms, trainingSessions, users } from "@/db/schema";
import { Badge, Card, CardHeader, EmptyState, Field, Input, PageHeader, ProgressBar, Select, Stat, Textarea } from "@/components/ui/primitives";
import { ConfirmSubmit, Modal, SubmitButton } from "@/components/ui/client";
import { ChartLegend, DonutChart, TrendChart } from "@/components/ui/charts";
import { requireOrgPage } from "@/lib/authz";
import { createGoalAction, deleteGoalAction, deleteTrainingAction, logTrainingAction, updateGoalAction } from "@/lib/actions/fighter";
import { addDays, formatDate, formatDateTime, startOfDay } from "@/lib/utils";

export const metadata = { title: "Progress" };

export default async function ProgressPage() {
  const ctx = await requireOrgPage();
  if (!ctx.membership) redirect("/app/onboarding");
  const memberId = ctx.membership.id;
  const orgId = ctx.org.id;
  const now = new Date();
  const weekStart = startOfDay(addDays(now, -((now.getDay() + 6) % 7)));

  const [sessions, weekAgg, allTime, goals, program, notes, checkins] = await Promise.all([
    db.select().from(trainingSessions).where(and(eq(trainingSessions.memberId, memberId), eq(trainingSessions.orgId, orgId))).orderBy(desc(trainingSessions.date)).limit(40),
    db
      .select({ n: sql<number>`count(*)`, minutes: sql<number>`coalesce(sum(${trainingSessions.durationMinutes}),0)` })
      .from(trainingSessions)
      .where(and(eq(trainingSessions.memberId, memberId), gte(trainingSessions.date, weekStart))),
    db
      .select({ n: sql<number>`count(*)`, minutes: sql<number>`coalesce(sum(${trainingSessions.durationMinutes}),0)` })
      .from(trainingSessions)
      .where(eq(trainingSessions.memberId, memberId)),
    db.select().from(fighterGoals).where(eq(fighterGoals.memberId, memberId)).orderBy(desc(fighterGoals.createdAt)),
    db
      .select({ assignment: programAssignments, program: trainingPrograms })
      .from(programAssignments)
      .innerJoin(trainingPrograms, eq(trainingPrograms.id, programAssignments.programId))
      .where(and(eq(programAssignments.fighterMemberId, memberId), eq(programAssignments.status, "active")))
      .limit(1),
    db
      .select({ note: coachNotes, coach: users.name })
      .from(coachNotes)
      .innerJoin(orgMembers, eq(orgMembers.id, coachNotes.coachMemberId))
      .innerJoin(users, eq(users.id, orgMembers.userId))
      .where(and(eq(coachNotes.fighterMemberId, memberId), eq(coachNotes.visibility, "fighter")))
      .orderBy(desc(coachNotes.createdAt))
      .limit(5),
    db.select().from(attendance).where(and(eq(attendance.memberId, memberId), gte(attendance.checkedInAt, addDays(now, -60)))),
  ]);

  const weekly = Array.from({ length: 8 }, (_, i) => {
    const ws = startOfDay(addDays(weekStart, -(7 - i) * 7));
    const we = addDays(ws, 7);
    const rows = sessions.filter((s) => s.date >= ws && s.date < we);
    const minutes = rows.reduce((sum, r) => sum + r.durationMinutes, 0);
    return {
      label: ws.toLocaleDateString("en-GB", { day: "numeric", month: "short" }),
      value: Math.round((minutes / 60) * 10) / 10,
    };
  });

  const byType = new Map<string, number>();
  for (const s of sessions) byType.set(s.type, (byType.get(s.type) ?? 0) + s.durationMinutes);
  const typeData = [...byType.entries()].map(([label, value]) => ({ label, value })).sort((a, b) => b.value - a.value);

  const weeklySessions = Number(weekAgg[0]?.n ?? 0);
  const weeklyMinutes = Number(weekAgg[0]?.minutes ?? 0);
  const goalSessions = program[0]?.program.sessionsPerWeek ?? 4;
  const attendanceRate = checkins.length ? Math.round((checkins.length / Math.max(1, 60 / 7 * 4)) * 100) : 0;

  return (
    <div className="space-y-4">
      <PageHeader title="Progress" description="Your training, in plain numbers." />

      <div className="grid grid-cols-2 gap-3 sm:grid-cols-4">
        <Stat label="This week" value={`${weeklySessions}`} hint="sessions" icon={<Dumbbell className="h-4 w-4" />} />
        <Stat label="Minutes" value={weeklyMinutes} hint="this week" />
        <Stat label="All time" value={Math.round(Number(allTime[0]?.minutes ?? 0) / 60)} hint="hours trained" icon={<TrendingUp className="h-4 w-4" />} />
        <Stat label="Check-ins" value={checkins.length} hint="last 60 days" icon={<Flame className="h-4 w-4" />} tone="accent" />
      </div>

      <Card>
        <CardHeader title="Training volume" description="Hours per week" action={<Badge>{attendanceRate}% attendance</Badge>} />
        <div className="mt-3"><TrendChart data={weekly} type="bar" height={200} valueSuffix=" h" /></div>
      </Card>

      <div className="grid gap-3 sm:grid-cols-2">
        <Card>
          <CardHeader title="What you train" description="Minutes by discipline" />
          <DonutChart data={typeData} centerValue={`${Math.round(Number(allTime[0]?.minutes ?? 0) / 60)}h`} centerLabel="total" />
          <ChartLegend data={typeData.slice(0, 5)} />
        </Card>

        <Card>
          <CardHeader title="Weekly focus" description={program[0] ? program[0].program.title : "No program assigned"} />
          {program[0] ? (
            <div className="mt-3">
              <ProgressBar value={program[0].assignment.progressPct} label="Program progress" />
              <p className="mt-2 text-sm" style={{ color: "var(--muted)" }}>{program[0].program.description ?? ""}</p>
              <p className="mt-1 text-xs" style={{ color: "var(--muted)" }}>
                {program[0].program.weeks} weeks · {program[0].program.sessionsPerWeek} sessions/week · due {formatDate(program[0].assignment.dueAt)}
              </p>
            </div>
          ) : (
            <EmptyState title="No program" description="Your coach can assign one." />
          )}
          <div className="mt-3">
            <ProgressBar value={Math.min(100, (weeklySessions / goalSessions) * 100)} label={`This week: ${weeklySessions}/${goalSessions} sessions`} />
          </div>
        </Card>
      </div>

      <Card>
        <CardHeader
          title="Goals"
          description="Small, specific goals work best."
          action={
            <Modal trigger={<><Plus className="h-3.5 w-3.5" /> New goal</>} title="Add a goal" triggerVariant="secondary" triggerSize="sm">
              <form action={createGoalAction} className="space-y-3">
                <Field label="Goal"><Input name="title" required placeholder="Train 5x per week" /></Field>
                <Field label="Target (optional)"><Input name="target" placeholder="20 sessions this month" /></Field>
                <Field label="Due date (optional)"><Input name="dueDate" type="date" /></Field>
                <SubmitButton>Add goal</SubmitButton>
              </form>
            </Modal>
          }
        />
        <div className="mt-3 space-y-2">
          {goals.length ? (
            goals.map((g) => (
              <div key={g.id} className="subtle p-3">
                <div className="flex flex-wrap items-start justify-between gap-2">
                  <div>
                    <p className="text-sm font-medium"><Target className="mr-1 inline h-3.5 w-3.5" style={{ color: "var(--accent)" }} />{g.title}</p>
                    <p className="text-xs" style={{ color: "var(--muted)" }}>{g.target ?? ""}{g.dueDate ? ` · due ${formatDate(g.dueDate)}` : ""}</p>
                  </div>
                  <div className="flex items-center gap-1">
                    <Badge tone={g.status === "done" ? "accent" : "neutral"}>{g.status}</Badge>
                    <form action={deleteGoalAction}>
                      <input type="hidden" name="goalId" value={g.id} />
                      <ConfirmSubmit message="Remove this goal?" variant="ghost">×</ConfirmSubmit>
                    </form>
                  </div>
                </div>
                <form action={updateGoalAction} className="mt-2 flex items-center gap-2">
                  <input type="hidden" name="goalId" value={g.id} />
                  <input type="range" name="progress" min={0} max={100} step={5} defaultValue={g.progress} className="flex-1 accent-[var(--accent)]" aria-label={`Progress for ${g.title}`} />
                  <span className="stat-value w-10 text-right text-sm">{g.progress}%</span>
                  <SubmitButton size="sm" variant="secondary">Save</SubmitButton>
                </form>
              </div>
            ))
          ) : (
            <EmptyState title="No goals yet" description="Add a goal to stay accountable." />
          )}
        </div>
      </Card>

      {notes.length ? (
        <Card>
          <CardHeader title="Notes from your coach" />
          <div className="mt-2 space-y-2">
            {notes.map((n) => (
              <div key={n.note.id} className="subtle p-2.5">
                <p className="text-sm">{n.note.body}</p>
                <p className="mt-1 text-xs" style={{ color: "var(--muted)" }}>{n.coach} · {formatDate(n.note.createdAt)}</p>
              </div>
            ))}
          </div>
        </Card>
      ) : null}

      <Card>
        <CardHeader
          title="Training log"
          description="Last 40 sessions"
          action={
            <Modal trigger={<><Plus className="h-3.5 w-3.5" /> Log training</>} title="Log a session" triggerSize="sm">
              <form action={logTrainingAction} className="space-y-3">
                <input type="hidden" name="returnTo" value="/app/progress" />
                <div className="grid grid-cols-2 gap-3">
                  <Field label="Type">
                    <Select name="type" defaultValue="BJJ">
                      {["MMA", "BJJ", "Wrestling", "Boxing", "Muay Thai", "Strength", "Conditioning", "Sparring", "Mobility", "Recovery"].map((t) => <option key={t} value={t}>{t}</option>)}
                    </Select>
                  </Field>
                  <Field label="Date"><Input type="date" name="date" defaultValue={now.toISOString().slice(0, 10)} /></Field>
                  <Field label="Minutes"><Input name="durationMinutes" type="number" min={5} max={300} defaultValue={75} required /></Field>
                  <Field label="Intensity">
                    <Select name="intensity" defaultValue="hard">
                      <option value="light">Light</option>
                      <option value="moderate">Moderate</option>
                      <option value="hard">Hard</option>
                      <option value="max">Max</option>
                    </Select>
                  </Field>
                  <Field label="RPE (1–10)"><Input name="rpe" type="number" min={1} max={10} /></Field>
                </div>
                <Field label="Notes"><Textarea name="notes" placeholder="What went well? What to improve?" /></Field>
                <SubmitButton>Log session</SubmitButton>
              </form>
            </Modal>
          }
        />
        <div className="mt-2 divide-y" style={{ borderColor: "var(--line)" }}>
          {sessions.length ? (
            sessions.map((s) => (
              <div key={s.id} className="flex items-center justify-between gap-3 py-2 text-sm">
                <div className="min-w-0">
                  <p className="font-medium">{s.type} · {s.durationMinutes} min</p>
                  <p className="truncate text-xs" style={{ color: "var(--muted)" }}>
                    {formatDateTime(s.date)} · {s.intensity}{s.rpe ? ` · RPE ${s.rpe}` : ""}{s.notes ? ` · ${s.notes}` : ""}
                  </p>
                </div>
                <form action={deleteTrainingAction}>
                  <input type="hidden" name="sessionId" value={s.id} />
                  <ConfirmSubmit message="Delete this training entry?" variant="ghost"><Trash2 className="h-3.5 w-3.5" /></ConfirmSubmit>
                </form>
              </div>
            ))
          ) : (
            <EmptyState title="Nothing logged yet" description="Log your first session — type, minutes and intensity is enough." />
          )}
        </div>
      </Card>
    </div>
  );
}
