import Link from "next/link";
import { and, count, eq, gte, inArray, isNull, lte, sql } from "drizzle-orm";
import { GraduationCap, Plus, UserCog, Users } from "lucide-react";
import { db } from "@/db/client";
import { classSessions, classes, coachAssignments, orgMembers, programAssignments, trainingPrograms, users } from "@/db/schema";
import { Avatar, Badge, ButtonLink, Card, CardHeader, EmptyState, Field, Input, PageHeader, Select, Stat, Textarea } from "@/components/ui/primitives";
import { Modal, SubmitButton } from "@/components/ui/client";
import { requireOrgPage } from "@/lib/authz";
import { addDays, formatDate, startOfDay } from "@/lib/utils";
import { assignCoachAction, assignProgramAction, createProgramAction, inviteMemberAction } from "@/lib/actions/gym";
import { getEntitlements } from "@/lib/entitlements";

export const metadata = { title: "Coaches" };

export default async function CoachesPage() {
  const ctx = await requireOrgPage();
  const orgId = ctx.org.id;
  const weekEnd = addDays(new Date(), 7);

  const [coaches, assignments, fighterList, programs, entitlements] = await Promise.all([
    db
      .select({ member: orgMembers, user: users })
      .from(orgMembers)
      .innerJoin(users, eq(users.id, orgMembers.userId))
      .where(and(eq(orgMembers.orgId, orgId), eq(orgMembers.role, "coach"), isNull(orgMembers.archivedAt))),
    db
      .select({ assignment: coachAssignments, fighter: orgMembers, user: users })
      .from(coachAssignments)
      .innerJoin(orgMembers, eq(orgMembers.id, coachAssignments.fighterMemberId))
      .innerJoin(users, eq(users.id, orgMembers.userId))
      .where(eq(coachAssignments.orgId, orgId)),
    db
      .select({ member: orgMembers, user: users })
      .from(orgMembers)
      .innerJoin(users, eq(users.id, orgMembers.userId))
      .where(and(eq(orgMembers.orgId, orgId), eq(orgMembers.role, "fighter"), isNull(orgMembers.archivedAt)))
      .orderBy(users.name),
    db
      .select({
        program: trainingPrograms,
        assigned: sql<number>`(select count(*) from program_assignments pa where pa.program_id = ${trainingPrograms.id} and pa.status = 'active')`,
      })
      .from(trainingPrograms)
      .where(eq(trainingPrograms.orgId, orgId))
      .orderBy(trainingPrograms.createdAt),
    getEntitlements(orgId),
  ]);

  const weekSessions = await db
    .select({ coachMemberId: classSessions.coachMemberId, n: count() })
    .from(classSessions)
    .where(and(eq(classSessions.orgId, orgId), gte(classSessions.startsAt, new Date()), lte(classSessions.startsAt, weekEnd), eq(classSessions.status, "scheduled")))
    .groupBy(classSessions.coachMemberId);

  const canManage = ctx.permissions.has("coaches:manage");
  const canProgram = ctx.permissions.has("programs:manage");

  return (
    <div className="space-y-5">
      <PageHeader
        title="Coaches"
        description="Your coaching team and who they look after. Every athlete can have a primary coach."
        actions={
          canManage ? (
            <Modal trigger={<><Plus className="h-4 w-4" /> Invite coach</>} title="Invite a coach" description={`${entitlements.usage.coaches}/${entitlements.maxCoaches} coach seats used on ${entitlements.planName}.`} triggerSize="sm">
              <form action={inviteMemberAction} className="space-y-3">
                <input type="hidden" name="orgId" value={orgId} />
                <input type="hidden" name="role" value="coach" />
                <Field label="Email"><Input name="email" type="email" required placeholder="coach@example.com" /></Field>
                <SubmitButton>Send coach invitation</SubmitButton>
              </form>
            </Modal>
          ) : null
        }
      />

      <div className="grid gap-3 sm:grid-cols-3">
        <Stat label="Coaches" value={coaches.length} hint={`${entitlements.usage.coaches}/${entitlements.maxCoaches} seats`} icon={<UserCog className="h-4 w-4" />} />
        <Stat label="Assigned athletes" value={new Set(assignments.map((a) => a.fighter.id)).size} icon={<Users className="h-4 w-4" />} />
        <Stat label="Programs" value={programs.length} icon={<GraduationCap className="h-4 w-4" />} />
      </div>

      <div className="grid gap-4 md:grid-cols-2 xl:grid-cols-3">
        {coaches.map(({ member, user }) => {
          const athletes = assignments.filter((a) => a.assignment.coachMemberId === member.id);
          const sessions = weekSessions.find((s) => s.coachMemberId === member.id);
          return (
            <Card key={member.id}>
              <div className="flex items-start gap-3">
                <Avatar name={user.name} size={42} />
                <div className="min-w-0 flex-1">
                  <Link href={`/gym/members/${member.id}`} className="truncate font-semibold hover:underline">{user.name}</Link>
                  <p className="truncate text-xs" style={{ color: "var(--muted)" }}>{member.title ?? "Coach"} · {user.email}</p>
                </div>
                <Badge tone="accent">{athletes.length} athletes</Badge>
              </div>
              <div className="mt-3 text-sm" style={{ color: "var(--muted)" }}>
                <p>{Number(sessions?.n ?? 0)} classes in the next 7 days</p>
              </div>
              <div className="mt-2 flex flex-wrap gap-1">
                {athletes.slice(0, 4).map((a) => <Badge key={a.assignment.id}>{a.user.name.split(" ")[0]}</Badge>)}
                {athletes.length > 4 ? <Badge>+{athletes.length - 4}</Badge> : null}
              </div>
              {canManage ? (
                <div className="mt-3">
                  <Modal trigger={<>Assign athlete</>} title={`Assign an athlete to ${user.name}`} triggerVariant="secondary" triggerSize="sm">
                    <form action={assignCoachAction} className="space-y-3">
                      <input type="hidden" name="orgId" value={orgId} />
                      <input type="hidden" name="coachMemberId" value={member.id} />
                      <Field label="Athlete">
                        <Select name="fighterMemberId" required>
                          <option value="">Choose athlete</option>
                          {fighterList.map((f) => <option key={f.member.id} value={f.member.id}>{f.user.name}</option>)}
                        </Select>
                      </Field>
                      <Field label="Focus"><Input name="focus" placeholder="Striking, wrestling, conditioning…" /></Field>
                      <label className="flex items-center gap-2 text-sm">
                        <input type="checkbox" name="isPrimary" className="h-4 w-4 accent-[var(--accent)]" /> Primary coach
                      </label>
                      <SubmitButton>Assign</SubmitButton>
                    </form>
                  </Modal>
                </div>
              ) : null}
            </Card>
          );
        })}
        {!coaches.length ? (
          <div className="md:col-span-2 xl:col-span-3">
            <EmptyState icon={<UserCog className="h-5 w-5" />} title="No coaches yet" description="Invite a coach so athletes can be assigned and programs created." />
          </div>
        ) : null}
      </div>

      <div className="grid gap-4 lg:grid-cols-2">
        <Card>
          <CardHeader title="Coach ↔ athlete assignments" description="Visible to staff only" />
          <div className="mt-3 space-y-2">
            {assignments.length ? (
              assignments.map((a) => (
                <div key={a.assignment.id} className="subtle flex items-center justify-between gap-2 p-2.5 text-sm">
                  <span className="min-w-0 truncate">
                    <Link href={`/gym/members/${a.fighter.id}`} className="font-medium hover:underline">{a.user.name}</Link>
                    <span style={{ color: "var(--muted)" }}> → {coaches.find((c) => c.member.id === a.assignment.coachMemberId)?.user.name ?? "coach"}</span>
                  </span>
                  <div className="flex items-center gap-1">
                    {a.assignment.isPrimary ? <Badge tone="accent">primary</Badge> : null}
                    <Badge>{a.assignment.focus ?? "general"}</Badge>
                  </div>
                </div>
              ))
            ) : (
              <EmptyState title="No assignments yet" description="Assign athletes from a coach card." />
            )}
          </div>
        </Card>

        <Card>
          <CardHeader
            title="Training programs"
            description="Reusable programs assigned to athletes"
            action={
              canProgram ? (
                <Modal trigger={<><Plus className="h-3.5 w-3.5" /> New program</>} title="Create a training program" triggerVariant="secondary" triggerSize="sm">
                  <form action={createProgramAction} className="space-y-3">
                    <input type="hidden" name="orgId" value={orgId} />
                    <Field label="Title"><Input name="title" required placeholder="8-week MMA base camp" /></Field>
                    <Field label="Discipline"><Input name="discipline" placeholder="MMA" /></Field>
                    <div className="grid grid-cols-2 gap-3">
                      <Field label="Weeks"><Input name="weeks" type="number" min={1} max={52} defaultValue={4} /></Field>
                      <Field label="Sessions / week"><Input name="sessionsPerWeek" type="number" min={1} max={14} defaultValue={3} /></Field>
                    </div>
                    <Field label="Description"><Textarea name="description" /></Field>
                    <SubmitButton>Create program</SubmitButton>
                  </form>
                </Modal>
              ) : null
            }
          />
          <div className="mt-3 space-y-2">
            {programs.length ? (
              programs.map(({ program, assigned }) => (
                <div key={program.id} className="subtle p-2.5">
                  <div className="flex items-start justify-between gap-2">
                    <div className="min-w-0">
                      <p className="truncate text-sm font-medium">{program.title}</p>
                      <p className="text-xs" style={{ color: "var(--muted)" }}>{program.weeks} weeks · {program.sessionsPerWeek}/week · {Number(assigned)} active</p>
                    </div>
                    {canProgram ? (
                      <Modal trigger={<>Assign</>} title="Assign program" triggerVariant="ghost" triggerSize="sm">
                        <form action={assignProgramAction} className="space-y-3">
                          <input type="hidden" name="orgId" value={orgId} />
                          <input type="hidden" name="programId" value={program.id} />
                          <Field label="Athlete">
                            <Select name="fighterMemberId" required>
                              <option value="">Choose athlete</option>
                              {fighterList.map((f) => <option key={f.member.id} value={f.member.id}>{f.user.name}</option>)}
                            </Select>
                          </Field>
                          <SubmitButton>Assign program</SubmitButton>
                        </form>
                      </Modal>
                    ) : null}
                  </div>
                </div>
              ))
            ) : (
              <EmptyState title="No programs" description="Create a program and assign it to an athlete." />
            )}
          </div>
        </Card>
      </div>
    </div>
  );
}
