import { redirect } from "next/navigation";
import { and, desc, eq } from "drizzle-orm";
import { CheckCircle2, Circle, Plus, ShieldAlert, Swords } from "lucide-react";
import { db } from "@/db/client";
import { fightCamps, fighterProfiles, fightRecords, readinessCheckins } from "@/db/schema";
import { Badge, Callout, Card, CardHeader, EmptyState, Field, Input, PageHeader, ProgressBar, Select, Stat, Textarea } from "@/components/ui/primitives";
import { Modal, SubmitButton } from "@/components/ui/client";
import { TrendChart } from "@/components/ui/charts";
import { requireOrgPage } from "@/lib/authz";
import { addMyFightRecordAction, readinessCheckInAction, toggleCampTaskAction } from "@/lib/actions/fighter";
import { daysUntil, formatDate, parseJson } from "@/lib/utils";

export const metadata = { title: "Fights" };

export default async function FightsPage() {
  const ctx = await requireOrgPage();
  if (!ctx.membership) redirect("/app/onboarding");
  const memberId = ctx.membership.id;

  const [camps, records, profile, checkins] = await Promise.all([
    db
      .select()
      .from(fightCamps)
      .where(and(eq(fightCamps.orgId, ctx.org.id), eq(fightCamps.fighterMemberId, memberId)))
      .orderBy(desc(fightCamps.fightDate)),
    db
      .select()
      .from(fightRecords)
      .where(and(eq(fightRecords.orgId, ctx.org.id), eq(fightRecords.fighterMemberId, memberId)))
      .orderBy(desc(fightRecords.fightDate)),
    db.select().from(fighterProfiles).where(eq(fighterProfiles.memberId, memberId)).limit(1),
    db
      .select()
      .from(readinessCheckins)
      .where(and(eq(readinessCheckins.orgId, ctx.org.id), eq(readinessCheckins.memberId, memberId)))
      .orderBy(desc(readinessCheckins.date))
      .limit(14),
  ]);

  const nextCamp = camps.find((c) => c.fightDate > new Date() && c.status === "active") ?? camps[0];
  const checklist = parseJson<{ label: string; done: boolean }[]>(nextCamp?.checklist, []);
  const targets = parseJson<Record<string, number>>(nextCamp?.weeklyTargets, {});
  const phases = parseJson<{ name: string; focus?: string }[]>(nextCamp?.phases, []);
  const done = checklist.filter((c) => c.done).length;
  const wins = records.filter((r) => r.result === "win").length;
  const losses = records.filter((r) => r.result === "loss").length;
  const draws = records.filter((r) => r.result === "draw").length;
  const readiness = [...checkins].reverse().map((c) => ({
    label: formatDate(c.date, { day: "numeric", month: "short" }),
    value: Math.round((((c.energy ?? 5) + (c.sleep ?? 5) + (10 - (c.soreness ?? 5)) + (c.mood ?? 5)) / 4) * 10) / 10,
  }));

  return (
    <div className="space-y-4">
      <PageHeader title="Fights" description="Camp plan, readiness and your record." />

      <div className="grid grid-cols-3 gap-3">
        <Stat label="Record" value={`${wins}–${losses}–${draws}`} hint="W–L–D" icon={<Swords className="h-4 w-4" />} />
        <Stat label="Fights" value={records.length} hint="all levels" />
        <Stat label="Camps" value={camps.length} />
      </div>

      {nextCamp ? (
        <>
          <Card className="glow">
            <div className="flex flex-wrap items-start justify-between gap-3">
              <div>
                <p className="text-[0.7rem] font-semibold uppercase tracking-[0.14em]" style={{ color: "var(--accent)" }}>
                  {daysUntil(nextCamp.fightDate) >= 0 ? "Next fight" : "Last camp"}
                </p>
                <p className="mt-1 text-4xl font-semibold stat-value">{Math.abs(daysUntil(nextCamp.fightDate))} days</p>
                <p className="mt-1 text-sm" style={{ color: "var(--muted)" }}>
                  {nextCamp.eventName ?? nextCamp.title} · {formatDate(nextCamp.fightDate)} · vs {nextCamp.opponent ?? "TBD"}
                </p>
              </div>
              <div className="text-right">
                <Badge tone="accent">{nextCamp.weightClass ?? "weight TBD"}</Badge>
                <p className="mt-2 text-xs" style={{ color: "var(--muted)" }}>Camp started {formatDate(nextCamp.campStart)}</p>
              </div>
            </div>
            <div className="mt-3 grid gap-3 sm:grid-cols-3">
              {phases.map((p) => (
                <div key={p.name} className="subtle p-2.5">
                  <p className="text-sm font-medium">{p.name}</p>
                  <p className="text-xs" style={{ color: "var(--muted)" }}>{p.focus}</p>
                </div>
              ))}
            </div>
            {nextCamp.coachNotes ? (
              <div className="mt-3"><Callout tone="info" title="Coach notes">{nextCamp.coachNotes}</Callout></div>
            ) : null}
          </Card>

          <div className="grid gap-3 sm:grid-cols-2">
            <Card>
              <CardHeader title="Camp checklist" description={`${done}/${checklist.length} complete`} />
              <div className="mt-2"><ProgressBar value={checklist.length ? (done / checklist.length) * 100 : 0} /></div>
              <ul className="mt-3 space-y-1.5">
                {checklist.map((item, index) => (
                  <li key={item.label}>
                    <form action={toggleCampTaskAction} className="flex items-center justify-between gap-2 rounded-lg border p-2 text-sm" style={{ borderColor: "var(--line)" }}>
                      <input type="hidden" name="campId" value={nextCamp.id} />
                      <input type="hidden" name="index" value={index} />
                      <span className="flex items-center gap-2">
                        {item.done ? <CheckCircle2 className="h-4 w-4" style={{ color: "var(--accent)" }} /> : <Circle className="h-4 w-4" style={{ color: "var(--muted)" }} />}
                        <span className={item.done ? "line-through opacity-60" : ""}>{item.label}</span>
                      </span>
                      <SubmitButton size="sm" variant="ghost">{item.done ? "Undo" : "Done"}</SubmitButton>
                    </form>
                  </li>
                ))}
              </ul>
              {Object.keys(targets).length ? (
                <div className="mt-3 text-xs" style={{ color: "var(--muted)" }}>
                  Weekly targets: {Object.entries(targets).map(([k, v]) => `${v} ${k.replace(/_/g, " ")}`).join(" · ")}
                </div>
              ) : null}
            </Card>

            <Card>
              <CardHeader title="Readiness check-in" description="How do you feel today?" />
              <form action={readinessCheckInAction} className="mt-3 grid grid-cols-2 gap-3">
                <Field label="Sleep (1–10)"><Input name="sleep" type="number" min={1} max={10} defaultValue={7} /></Field>
                <Field label="Soreness (1–10)"><Input name="soreness" type="number" min={1} max={10} defaultValue={4} /></Field>
                <Field label="Energy (1–10)"><Input name="energy" type="number" min={1} max={10} defaultValue={7} /></Field>
                <Field label="Mood (1–10)"><Input name="mood" type="number" min={1} max={10} defaultValue={7} /></Field>
                <Field label="Weight (kg)" className="col-span-2"><Input name="weightKg" type="number" step="0.1" defaultValue={profile[0]?.currentWeightKg ?? ""} /></Field>
                <div className="col-span-2"><SubmitButton size="sm">Save check-in</SubmitButton></div>
              </form>
              {readiness.length ? <div className="mt-3"><TrendChart data={readiness} height={120} /></div> : null}
              <Callout tone="warn">
                Readiness is subjective. It never replaces medical advice and should not be used for rapid weight cuts.
              </Callout>
            </Card>
          </div>
        </>
      ) : (
        <Card>
          <EmptyState icon={<Swords className="h-5 w-5" />} title="No fight camp yet" description="When your coach creates a camp, the countdown and plan appear here." />
        </Card>
      )}

      <Card>
        <CardHeader
          title="Your record"
          description="Unverified results need coach confirmation before they count as verified."
          action={
            <Modal trigger={<><Plus className="h-3.5 w-3.5" /> Add result</>} title="Add a fight result" description="Your coach will be asked to verify it." triggerVariant="secondary" triggerSize="sm">
              <form action={addMyFightRecordAction} className="space-y-3">
                <div className="grid grid-cols-2 gap-3">
                  <Field label="Result">
                    <Select name="result" required>
                      <option value="win">Win</option><option value="loss">Loss</option><option value="draw">Draw</option><option value="no_contest">No contest</option>
                    </Select>
                  </Field>
                  <Field label="Level"><Select name="level" defaultValue="amateur"><option value="amateur">Amateur</option><option value="professional">Professional</option></Select></Field>
                  <Field label="Opponent"><Input name="opponent" required /></Field>
                  <Field label="Method"><Input name="method" placeholder="Submission, KO, Decision" /></Field>
                  <Field label="Event"><Input name="eventName" /></Field>
                  <Field label="Date"><Input name="fightDate" type="date" required defaultValue={new Date().toISOString().slice(0, 10)} /></Field>
                  <Field label="Weight class"><Input name="weightClass" defaultValue={profile[0]?.weightClass ?? ""} /></Field>
                  <Field label="Rounds"><Input name="rounds" type="number" min={1} max={10} defaultValue={3} /></Field>
                </div>
                <Field label="Notes"><Textarea name="notes" /></Field>
                <SubmitButton>Add result</SubmitButton>
              </form>
            </Modal>
          }
        />
        {records.length ? (
          <div className="mt-3 space-y-2">
            {records.map((r) => (
              <div key={r.id} className="subtle flex flex-wrap items-center justify-between gap-2 p-2.5 text-sm">
                <div>
                  <p className="font-medium">
                    <span style={{ color: r.result === "win" ? "var(--accent)" : r.result === "loss" ? "var(--danger)" : undefined }}>{r.result.toUpperCase()}</span> vs {r.opponent}
                  </p>
                  <p className="text-xs" style={{ color: "var(--muted)" }}>{r.method ?? "—"} · {r.eventName ?? "—"} · {formatDate(r.fightDate)} · {r.level}</p>
                </div>
                {r.verified ? <Badge tone="accent">verified</Badge> : <Badge tone="warn">pending coach check</Badge>}
              </div>
            ))}
          </div>
        ) : (
          <EmptyState title="No records yet" description="Add amateur or pro results — your coach verifies them." />
        )}
        <div className="mt-3 flex items-start gap-2 text-xs" style={{ color: "var(--muted)" }}>
          <ShieldAlert className="mt-0.5 h-3.5 w-3.5" />
          Results you add are marked unverified. Only your gym can confirm official results.
        </div>
      </Card>
    </div>
  );
}
