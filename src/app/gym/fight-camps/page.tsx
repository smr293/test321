import Link from "next/link";
import { and, desc, eq, inArray, isNull } from "drizzle-orm";
import { Plus, Swords, Trophy } from "lucide-react";
import { db } from "@/db/client";
import { fightCamps, orgMembers, readinessCheckins, users } from "@/db/schema";
import { Avatar, Badge, ButtonLink, Card, CardHeader, EmptyState, Field, Input, PageHeader, Select, Stat, StatusBadge } from "@/components/ui/primitives";
import { Modal, SubmitButton } from "@/components/ui/client";
import { requireOrgPage } from "@/lib/authz";
import { createFightCampAction } from "@/lib/actions/gym";
import { daysUntil, formatDate, parseJson } from "@/lib/utils";

export const metadata = { title: "Fight camps" };

export default async function FightCampsPage() {
  const ctx = await requireOrgPage();
  const orgId = ctx.org.id;

  const [camps, fighters] = await Promise.all([
    db
      .select({ camp: fightCamps, fighter: orgMembers, user: users })
      .from(fightCamps)
      .innerJoin(orgMembers, eq(orgMembers.id, fightCamps.fighterMemberId))
      .innerJoin(users, eq(users.id, orgMembers.userId))
      .where(eq(fightCamps.orgId, orgId))
      .orderBy(desc(fightCamps.fightDate)),
    db
      .select({ member: orgMembers, user: users })
      .from(orgMembers)
      .innerJoin(users, eq(users.id, orgMembers.userId))
      .where(and(eq(orgMembers.orgId, orgId), eq(orgMembers.role, "fighter"), isNull(orgMembers.archivedAt)))
      .orderBy(users.name),
  ]);

  const active = camps.filter((c) => c.camp.status === "active" && c.camp.fightDate > new Date());
  const canManage = ctx.permissions.has("fightcamps:manage");

  return (
    <div className="space-y-5">
      <PageHeader
        title="Fight camps"
        description="Preparation, phased plans and readiness — all in one place."
        actions={
          canManage ? (
            <Modal trigger={<><Plus className="h-4 w-4" /> New camp</>} title="Create a fight camp" description="The athlete sees a countdown and checklist immediately." triggerSize="sm">
              <form action={createFightCampAction} className="space-y-3">
                <input type="hidden" name="orgId" value={orgId} />
                <Field label="Fighter">
                  <Select name="fighterMemberId" required>
                    <option value="">Choose fighter</option>
                    {fighters.map((f) => <option key={f.member.id} value={f.member.id}>{f.user.name}</option>)}
                  </Select>
                </Field>
                <div className="grid grid-cols-2 gap-3">
                  <Field label="Opponent"><Input name="opponent" placeholder="T. Virtanen" /></Field>
                  <Field label="Event"><Input name="eventName" placeholder="Nordic Fight Night 12" /></Field>
                  <Field label="Fight date"><Input name="fightDate" type="date" required /></Field>
                  <Field label="Weight class"><Input name="weightClass" /></Field>
                  <Field label="Camp start"><Input name="campStart" type="date" defaultValue={new Date().toISOString().slice(0, 10)} /></Field>
                </div>
                <Field label="Notes for the athlete"><Input name="coachNotes" /></Field>
                <SubmitButton>Create camp</SubmitButton>
              </form>
            </Modal>
          ) : null
        }
      />

      <div className="grid gap-3 sm:grid-cols-3">
        <Stat label="Active camps" value={active.length} icon={<Swords className="h-4 w-4" />} tone="accent" />
        <Stat label="Total camps" value={camps.length} icon={<Trophy className="h-4 w-4" />} />
        <Stat label="Next fight" value={active[0] ? `${daysUntil(active[0].camp.fightDate)} days` : "—"} hint={active[0]?.user.name ?? "No camp scheduled"} />
      </div>

      <div className="grid gap-3 md:grid-cols-2 xl:grid-cols-3">
        {camps.map(({ camp, user }) => {
          const checklist = parseJson<{ label: string; done: boolean }[]>(camp.checklist, []);
          const done = checklist.filter((c) => c.done).length;
          const fightIn = daysUntil(camp.fightDate);
          return (
            <Link key={camp.id} href={`/gym/fight-camps/${camp.id}`} className="group">
              <Card className="h-full transition-colors group-hover:border-[var(--line-strong)]">
                <div className="flex items-start justify-between gap-2">
                  <div className="min-w-0">
                    <p className="truncate font-semibold">{camp.eventName ?? camp.title}</p>
                    <p className="text-xs" style={{ color: "var(--muted)" }}>{user.name} · {camp.weightClass ?? "weight class TBD"}</p>
                  </div>
                  <StatusBadge status={camp.status} />
                </div>
                <div className="mt-3 flex items-center justify-between">
                  <div className="flex items-center gap-2">
                    <Avatar name={user.name} size={26} />
                    <span className="text-sm">vs {camp.opponent ?? "TBD"}</span>
                  </div>
                  <Badge tone={fightIn >= 0 ? "accent" : "neutral"}>{fightIn >= 0 ? `${fightIn}d` : "past"}</Badge>
                </div>
                <p className="mt-2 text-xs" style={{ color: "var(--muted)" }}>{formatDate(camp.fightDate)} · checklist {done}/{checklist.length}</p>
                <div className="mt-2 h-1.5 overflow-hidden rounded-full" style={{ background: "var(--card-2)" }}>
                  <div className="h-full rounded-full" style={{ width: `${checklist.length ? (done / checklist.length) * 100 : 0}%`, background: "var(--accent)" }} />
                </div>
              </Card>
            </Link>
          );
        })}
      </div>
      {!camps.length ? (
        <Card><EmptyState icon={<Swords className="h-5 w-5" />} title="No fight camps" description="Create a camp to prepare an athlete for competition." /></Card>
      ) : null}
    </div>
  );
}
