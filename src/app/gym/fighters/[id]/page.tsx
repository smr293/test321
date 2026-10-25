import Link from "next/link";
import { and, desc, eq, gte, isNull, ne, or, sql } from "drizzle-orm";
import { notFound } from "next/navigation";
import { Activity, Plus, Swords, Trophy } from "lucide-react";
import { db } from "@/db/client";
import {
  attendance,
  coachAssignments,
  coachNotes,
  fightCamps,
  fighterProfiles,
  fightRecords,
  orgMembers,
  programAssignments,
  readinessCheckins,
  trainingPrograms,
  trainingSessions,
  users,
} from "@/db/schema";
import {
  Avatar,
  Badge,
  ButtonLink,
  Card,
  CardHeader,
  Divider,
  EmptyState,
  Field,
  Input,
  KeyValue,
  PageHeader,
  Select,
  Stat,
  StatusBadge,
  Textarea,
  Callout,
} from "@/components/ui/primitives";
import { Modal, SubmitButton } from "@/components/ui/client";
import { TrendChart } from "@/components/ui/charts";
import { assertCoachOwnsFighter, requireOrgPage } from "@/lib/authz";
import { addCoachNoteAction, assignCoachAction, coachAddFightRecordAction, unassignCoachAction, verifyFightRecordAction } from "@/lib/actions/gym";
import { addDays, daysUntil, formatDate, formatDateTime, parseJson } from "@/lib/utils";

export default async function FighterDetailPage({ params }: { params: Promise<{ id: string }> }) {
  const ctx = await requireOrgPage();
  const orgId = ctx.org.id;
  const { id } = await params;

  // Coaches may only open athletes assigned to them. Owners/managers are unrestricted.
  if (ctx.role === "coach" && ctx.membership) {
    try {
      await assertCoachOwnsFighter(orgId, ctx.membership.id, id);
    } catch {
      notFound();
    }
  }

  const row = (
    await db
      .select({ member: orgMembers, user: users, profile: fighterProfiles })
      .from(orgMembers)
      .innerJoin(users, eq(users.id, orgMembers.userId))
      .leftJoin(fighterProfiles, eq(fighterProfiles.memberId, orgMembers.id))
      .where(and(eq(orgMembers.id, id), eq(orgMembers.orgId, orgId), eq(orgMembers.role, "fighter")))
      .limit(1)
  )[0];
  if (!row) notFound();

  const [records, camps, sessions, visits, notes, assignments, programs, readiness, coaches] = await Promise.all([
    db.select().from(fightRecords).where(and(eq(fightRecords.orgId, orgId), eq(fightRecords.fighterMemberId, id))).orderBy(desc(fightRecords.fightDate)),
    db.select().from(fightCamps).where(and(eq(fightCamps.orgId, orgId), eq(fightCamps.fighterMemberId, id))).orderBy(desc(fightCamps.fightDate)),
    db.select().from(trainingSessions).where(and(eq(trainingSessions.orgId, orgId), eq(trainingSessions.memberId, id))).orderBy(desc(trainingSessions.date)).limit(60),
    db.select().from(attendance).where(and(eq(attendance.orgId, orgId), eq(attendance.memberId, id))).orderBy(desc(attendance.checkedInAt)).limit(60),
    db
      .select({ note: coachNotes, user: users })
      .from(coachNotes)
      .innerJoin(orgMembers, eq(orgMembers.id, coachNotes.coachMemberId))
      .innerJoin(users, eq(users.id, orgMembers.userId))
      .where(
        and(
          eq(coachNotes.orgId, orgId),
          eq(coachNotes.fighterMemberId, id),
          // Private notes are only visible to the coach who wrote them.
          ctx.role === "coach" && ctx.membership
            ? or(ne(coachNotes.visibility, "private"), eq(coachNotes.coachMemberId, ctx.membership.id))
            : ne(coachNotes.visibility, "private"),
        ),
      )
      .orderBy(desc(coachNotes.createdAt)),
    db
      .select({ assignment: coachAssignments, coach: orgMembers, user: users })
      .from(coachAssignments)
      .innerJoin(orgMembers, eq(orgMembers.id, coachAssignments.coachMemberId))
      .innerJoin(users, eq(users.id, orgMembers.userId))
      .where(and(eq(coachAssignments.orgId, orgId), eq(coachAssignments.fighterMemberId, id))),
    db
      .select({ assignment: programAssignments, program: trainingPrograms })
      .from(programAssignments)
      .innerJoin(trainingPrograms, eq(trainingPrograms.id, programAssignments.programId))
      .where(and(eq(programAssignments.orgId, orgId), eq(programAssignments.fighterMemberId, id))),
    db.select().from(readinessCheckins).where(and(eq(readinessCheckins.orgId, orgId), eq(readinessCheckins.memberId, id))).orderBy(desc(readinessCheckins.date)).limit(14),
    db
      .select({ member: orgMembers, user: users })
      .from(orgMembers)
      .innerJoin(users, eq(users.id, orgMembers.userId))
      .where(and(eq(orgMembers.orgId, orgId), eq(orgMembers.role, "coach"), isNull(orgMembers.archivedAt))),
  ]);

  const wins = records.filter((r) => r.result === "win").length;
  const losses = records.filter((r) => r.result === "loss").length;
  const draws = records.filter((r) => r.result === "draw").length;
  const nextCamp = camps.filter((c) => c.fightDate > new Date() && c.status === "active").sort((a, b) => a.fightDate.getTime() - b.fightDate.getTime())[0];
  const volume = Array.from({ length: 8 }, (_, i) => {
    const weekStart = addDays(new Date(), -(7 - i) * 7);
    const weekEnd = addDays(weekStart, 7);
    const mins = sessions
      .filter((s) => s.date >= weekStart && s.date < weekEnd)
      .reduce((sum, s) => sum + s.durationMinutes, 0);
    return { label: weekStart.toLocaleDateString("en-GB", { day: "numeric", month: "short" }), value: Math.round(mins / 60) };
  });
  const readinessSeries = [...readiness].reverse().map((r) => ({
    label: formatDate(r.date, { day: "numeric", month: "short" }),
    value: Math.round((((r.energy ?? 5) + (r.sleep ?? 5) + (10 - (r.soreness ?? 5)) + (r.mood ?? 5)) / 4) * 10) / 10,
  }));

  const canRecord = ctx.permissions.has("fightcamps:manage");
  const canManageCoaches = ctx.permissions.has("coaches:manage");
  const returnTo = `/gym/fighters/${id}`;

  return (
    <div className="space-y-5">
      <PageHeader
        eyebrow="Athlete"
        title={
          <span className="flex items-center gap-3">
            <Avatar name={row.user.name} size={40} /> {row.user.name}
          </span>
        }
        description={`${row.profile?.discipline ?? "MMA"} · ${row.profile?.level ?? "beginner"} · ${row.profile?.weightClass ?? "no weight class"}${row.profile?.isMinor ? " · minor (guardian consent required)" : ""}`}
        actions={
          <>
            <ButtonLink href={`/gym/members/${id}`} variant="secondary" size="sm">Member profile</ButtonLink>
            <ButtonLink href="/gym/fight-camps" variant="secondary" size="sm">Fight camps</ButtonLink>
          </>
        }
      />

      <div className="grid gap-3 sm:grid-cols-4">
        <Stat label="Record" value={`${wins}–${losses}–${draws}`} hint="W–L–D" icon={<Swords className="h-4 w-4" />} />
        <Stat label="Next fight" value={nextCamp ? `${daysUntil(nextCamp.fightDate)}d` : "—"} hint={nextCamp?.eventName ?? "No camp scheduled"} icon={<Trophy className="h-4 w-4" />} tone={nextCamp ? "accent" : "neutral"} />
        <Stat label="Check-ins (all time)" value={visits.length} icon={<Activity className="h-4 w-4" />} />
        <Stat label="Training volume" value={`${volume.reduce((s, v) => s + v.value, 0)}h`} hint="Last 8 weeks" />
      </div>

      <div className="grid gap-4 lg:grid-cols-3">
        <Card className="lg:col-span-2">
          <CardHeader title="Training volume" description="Hours logged per week (self-reported + classes)" />
          <div className="mt-3"><TrendChart data={volume} type="bar" height={200} valueSuffix=" h" /></div>
        </Card>
        <Card>
          <CardHeader title="Readiness" description="Subjective check-ins — not medical advice" />
          <div className="mt-3"><TrendChart data={readinessSeries} height={150} /></div>
          <Callout tone="warn">
            Readiness is a self-reported training tool. It is not medical clearance and should never be used to
            encourage rapid weight cutting.
          </Callout>
        </Card>
      </div>

      <div className="grid gap-4 lg:grid-cols-3">
        <Card className="lg:col-span-2">
          <CardHeader
            title="Fight record"
            description="Only coach-verified results are shown as verified."
            action={
              canRecord ? (
                <Modal trigger={<><Plus className="h-3.5 w-3.5" /> Add result</>} title="Add fight result" triggerVariant="secondary" triggerSize="sm">
                  <form action={coachAddFightRecordAction} className="space-y-3">
                    <input type="hidden" name="orgId" value={orgId} />
                    <input type="hidden" name="memberId" value={id} />
                    <div className="grid grid-cols-2 gap-3">
                      <Field label="Result">
                        <Select name="result" required>
                          <option value="win">Win</option><option value="loss">Loss</option><option value="draw">Draw</option><option value="no_contest">No contest</option>
                        </Select>
                      </Field>
                      <Field label="Method"><Input name="method" placeholder="Submission, KO, Decision…" /></Field>
                      <Field label="Opponent"><Input name="opponent" required /></Field>
                      <Field label="Event"><Input name="eventName" /></Field>
                      <Field label="Date"><Input name="fightDate" type="date" required defaultValue={new Date().toISOString().slice(0, 10)} /></Field>
                      <Field label="Weight class"><Input name="weightClass" defaultValue={row.profile?.weightClass ?? ""} /></Field>
                      <Field label="Level">
                        <Select name="level" defaultValue="amateur"><option value="amateur">Amateur</option><option value="professional">Professional</option></Select>
                      </Field>
                      <Field label="Rounds"><Input name="rounds" type="number" min={1} max={10} defaultValue={3} /></Field>
                    </div>
                    <SubmitButton>Save result</SubmitButton>
                  </form>
                </Modal>
              ) : null
            }
          />
          {records.length ? (
            <div className="mt-3 overflow-x-auto">
              <table className="table">
                <thead><tr><th>Result</th><th>Opponent</th><th>Event</th><th>Date</th><th>Verified</th><th /></tr></thead>
                <tbody>
                  {records.map((r) => (
                    <tr key={r.id}>
                      <td>
                        <Badge tone={r.result === "win" ? "accent" : r.result === "loss" ? "danger" : "neutral"}>
                          {r.result.replace("_", " ")}
                        </Badge>
                        <span className="ml-1 text-xs" style={{ color: "var(--muted)" }}>{r.method}</span>
                      </td>
                      <td className="font-medium">{r.opponent}</td>
                      <td className="text-sm">{r.eventName ?? "—"}</td>
                      <td className="text-sm">{formatDate(r.fightDate)}</td>
                      <td>{r.verified ? <Badge tone="accent">verified</Badge> : <Badge tone="warn">unverified</Badge>}</td>
                      <td className="text-right">
                        {!r.verified && canRecord ? (
                          <form action={verifyFightRecordAction}>
                            <input type="hidden" name="orgId" value={orgId} />
                            <input type="hidden" name="recordId" value={r.id} />
                            <input type="hidden" name="returnTo" value={returnTo} />
                            <SubmitButton size="sm" variant="secondary">Verify</SubmitButton>
                          </form>
                        ) : null}
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          ) : (
            <EmptyState title="No fights recorded" description="Add amateur or pro results to build the record." />
          )}
        </Card>

        <div className="space-y-4">
          <Card>
            <CardHeader title="Coaches" />
            <div className="mt-2 space-y-2">
              {assignments.map((a) => (
                <div key={a.assignment.id} className="subtle flex items-center gap-2 p-2.5">
                  <Avatar name={a.user.name} size={26} />
                  <div className="min-w-0 flex-1">
                    <p className="truncate text-sm font-medium">{a.user.name}</p>
                    <p className="text-xs" style={{ color: "var(--muted)" }}>{a.assignment.focus ?? "general"}{a.assignment.isPrimary ? " · primary" : ""}</p>
                  </div>
                  {canManageCoaches ? (
                    <form action={unassignCoachAction}>
                      <input type="hidden" name="orgId" value={orgId} />
                      <input type="hidden" name="assignmentId" value={a.assignment.id} />
                      <input type="hidden" name="returnTo" value={returnTo} />
                      <button type="submit" className="btn btn-ghost btn-sm" aria-label="Unassign">×</button>
                    </form>
                  ) : null}
                </div>
              ))}
              {canManageCoaches ? (
                <form action={assignCoachAction} className="mt-2 space-y-2">
                  <input type="hidden" name="orgId" value={orgId} />
                  <input type="hidden" name="fighterMemberId" value={id} />
                  <Select name="coachMemberId" required aria-label="Coach">
                    <option value="">Choose coach</option>
                    {coaches.map((c) => <option key={c.member.id} value={c.member.id}>{c.user.name}</option>)}
                  </Select>
                  <SubmitButton size="sm" variant="secondary" className="w-full">Assign coach</SubmitButton>
                </form>
              ) : null}
            </div>
          </Card>

          <Card>
            <CardHeader title="Assigned programs" />
            <div className="mt-2 space-y-2">
              {programs.length ? (
                programs.map((p) => (
                  <div key={p.assignment.id} className="subtle p-2.5">
                    <p className="text-sm font-medium">{p.program.title}</p>
                    <p className="text-xs" style={{ color: "var(--muted)" }}>{p.assignment.progressPct}% complete · {p.assignment.status}</p>
                  </div>
                ))
              ) : (
                <p className="text-sm" style={{ color: "var(--muted)" }}>No program assigned.</p>
              )}
            </div>
          </Card>

          <Card>
            <CardHeader title="Profile" />
            <KeyValue label="Weight">{row.profile?.currentWeightKg ? `${row.profile.currentWeightKg} kg` : "—"}</KeyValue>
            <KeyValue label="Height">{row.profile?.heightCm ? `${row.profile.heightCm} cm` : "—"}</KeyValue>
            <KeyValue label="Stance">{row.profile?.stance ?? "—"}</KeyValue>
            <KeyValue label="Joined">{formatDate(row.member.joinedAt ?? row.member.createdAt)}</KeyValue>
            <KeyValue label="Status"><StatusBadge status={row.member.status} /></KeyValue>
          </Card>
        </div>
      </div>

      <div className="grid gap-4 lg:grid-cols-2">
        <Card>
          <CardHeader title="Fight camps" action={<ButtonLink href="/gym/fight-camps" variant="ghost" size="sm">All camps</ButtonLink>} />
          <div className="mt-2 space-y-2">
            {camps.length ? (
              camps.map((c) => {
                const done = parseJson<{ done: boolean }[]>(c.checklist, []).filter((x) => x.done).length;
                const total = parseJson<{ done: boolean }[]>(c.checklist, []).length;
                return (
                  <Link key={c.id} href={`/gym/fight-camps/${c.id}`} className="subtle block p-2.5 hover:border-[var(--line-strong)]">
                    <div className="flex items-center justify-between gap-2">
                      <p className="truncate text-sm font-medium">{c.eventName ?? c.title}</p>
                      <StatusBadge status={c.status} />
                    </div>
                    <p className="text-xs" style={{ color: "var(--muted)" }}>
                      {formatDate(c.fightDate)} · {daysUntil(c.fightDate)} days · checklist {done}/{total}
                    </p>
                  </Link>
                );
              })
            ) : (
              <EmptyState title="No camps" description="Create a camp from the fight camps page." />
            )}
          </div>
        </Card>

        <Card>
          <CardHeader title="Coaching notes" description="Private to staff by default" />
          <div className="mt-2 space-y-2">
            {notes.slice(0, 5).map((n) => (
              <div key={n.note.id} className="subtle p-2.5">
                <p className="text-sm">{n.note.body}</p>
                <p className="mt-1 text-xs" style={{ color: "var(--muted)" }}>{n.user.name} · {formatDateTime(n.note.createdAt)} · {n.note.visibility}</p>
              </div>
            ))}
            <form action={addCoachNoteAction} className="space-y-2">
              <input type="hidden" name="orgId" value={orgId} />
              <input type="hidden" name="fighterMemberId" value={id} />
              <Textarea name="body" required placeholder="Add a coaching note…" />
              <div className="flex gap-2">
                <Select name="visibility" defaultValue="staff" className="flex-1">
                  <option value="private">Only me</option>
                  <option value="staff">All staff</option>
                  <option value="fighter">Visible to athlete</option>
                </Select>
                <SubmitButton size="sm">Save</SubmitButton>
              </div>
            </form>
          </div>
        </Card>
      </div>
    </div>
  );
}
