import Link from "next/link";
import { and, desc, eq, inArray, isNull, sql } from "drizzle-orm";
import { Swords, Trophy, UserPlus } from "lucide-react";
import { db } from "@/db/client";
import { coachAssignments, fightCamps, fighterProfiles, fightRecords, orgMembers, subscriptions, users } from "@/db/schema";
import { Avatar, Badge, Card, EmptyState, PageHeader, Stat, StatusBadge } from "@/components/ui/primitives";
import { Modal, SubmitButton } from "@/components/ui/client";
import { Field, Input, Select } from "@/components/ui/primitives";
import { getCoachAthleteIds, requireOrgPage } from "@/lib/authz";
import { addMemberAction } from "@/lib/actions/gym";
import { formatDate, daysUntil } from "@/lib/utils";

export const metadata = { title: "Fighters" };

export default async function FightersPage() {
  const ctx = await requireOrgPage();
  const orgId = ctx.org.id;
  const coachScope = ctx.role === "coach" && ctx.membership ? await getCoachAthleteIds(orgId, ctx.membership.id) : null;

  const rows = await db
    .select({
      member: orgMembers,
      user: users,
      profile: fighterProfiles,
      sub: subscriptions,
      coach: sql<string | null>`(select group_concat(u.name, ', ') from coach_assignments ca join org_members cm on cm.id = ca.coach_member_id join users u on u.id = cm.user_id where ca.fighter_member_id = ${orgMembers.id})`,
      wins: sql<number>`(select count(*) from fight_records fr where fr.fighter_member_id = ${orgMembers.id} and fr.result = 'win')`,
      losses: sql<number>`(select count(*) from fight_records fr where fr.fighter_member_id = ${orgMembers.id} and fr.result = 'loss')`,
      draws: sql<number>`(select count(*) from fight_records fr where fr.fighter_member_id = ${orgMembers.id} and fr.result = 'draw')`,
      nextFight: sql<number | null>`(select min(fc.fight_date) from fight_camps fc where fc.fighter_member_id = ${orgMembers.id} and fc.fight_date > ${Date.now()} and fc.status = 'active')`,
    })
    .from(orgMembers)
    .innerJoin(users, eq(users.id, orgMembers.userId))
    .leftJoin(fighterProfiles, eq(fighterProfiles.memberId, orgMembers.id))
    .leftJoin(subscriptions, and(eq(subscriptions.memberId, orgMembers.id), inArray(subscriptions.status, ["active", "trial", "past_due", "paused", "cancel_scheduled"])))
    .where(
      and(
        eq(orgMembers.orgId, orgId),
        eq(orgMembers.role, "fighter"),
        isNull(orgMembers.archivedAt),
        coachScope ? inArray(orgMembers.id, coachScope.length ? coachScope : [""]) : undefined,
      ),
    )
    .orderBy(desc(orgMembers.createdAt));

  const [campCount, recordCount] = await Promise.all([
    db.select({ n: sql<number>`count(*)` }).from(fightCamps).where(and(eq(fightCamps.orgId, orgId), eq(fightCamps.status, "active"))),
    db.select({ n: sql<number>`count(*)` }).from(fightRecords).where(eq(fightRecords.orgId, orgId)),
  ]);

  return (
    <div className="space-y-5">
      <PageHeader
        title="Fighters"
        description="Athlete profiles, fight records and coach assignments."
        actions={
          ctx.permissions.has("members:write") ? (
            <Modal trigger={<><UserPlus className="h-4 w-4" /> Add fighter</>} title="Add a fighter" triggerSize="sm">
              <form action={addMemberAction} className="space-y-3">
                <input type="hidden" name="orgId" value={orgId} />
                <input type="hidden" name="role" value="fighter" />
                <Field label="Name"><Input name="name" required /></Field>
                <Field label="Email"><Input name="email" type="email" required /></Field>
                <Field label="Location">
                  <Select name="locationId">{ctx.locations.map((l) => <option key={l.id} value={l.id}>{l.name}</option>)}</Select>
                </Field>
                <SubmitButton>Add fighter</SubmitButton>
              </form>
            </Modal>
          ) : null
        }
      />

      <div className="grid gap-3 sm:grid-cols-3">
        <Stat label="Fighters" value={rows.length} icon={<Swords className="h-4 w-4" />} />
        <Stat label="Active camps" value={Number(campCount[0]?.n ?? 0)} icon={<Trophy className="h-4 w-4" />} />
        <Stat label="Fight records" value={Number(recordCount[0]?.n ?? 0)} />
      </div>

      <div className="grid gap-3 md:grid-cols-2 xl:grid-cols-3">
        {rows.map((r) => {
          const fightIn = r.nextFight ? daysUntil(new Date(Number(r.nextFight))) : null;
          return (
            <Link key={r.member.id} href={`/gym/fighters/${r.member.id}`} className="group">
              <Card className="h-full transition-colors group-hover:border-[var(--line-strong)]">
                <div className="flex items-start gap-3">
                  <Avatar name={r.user.name} size={42} />
                  <div className="min-w-0 flex-1">
                    <p className="truncate font-semibold">{r.user.name}</p>
                    <p className="truncate text-xs" style={{ color: "var(--muted)" }}>
                      {r.profile?.discipline ?? "Discipline not set"} · {r.profile?.level ?? "beginner"}
                    </p>
                  </div>
                  <StatusBadge status={r.sub?.status ?? "none"} />
                </div>
                <div className="mt-3 flex items-center gap-2 text-sm">
                  <span className="stat-value">{Number(r.wins)}–{Number(r.losses)}–{Number(r.draws)}</span>
                  <span className="text-xs" style={{ color: "var(--muted)" }}>W–L–D</span>
                  {r.nextFight ? <Badge tone="accent" className="ml-auto">{fightIn}d to fight</Badge> : null}
                </div>
                <div className="mt-2 flex items-center justify-between text-xs" style={{ color: "var(--muted)" }}>
                  <span className="truncate">Coach: {r.coach ?? "none"}</span>
                  <span>{r.profile?.weightClass ?? "—"}</span>
                </div>
              </Card>
            </Link>
          );
        })}
      </div>
      {!rows.length ? <EmptyState title="No fighters yet" description="Invite your members or add fighters manually." /> : null}
    </div>
  );
}
