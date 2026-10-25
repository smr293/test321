import Link from "next/link";
import { and, count, desc, eq, gte, ilike, inArray, isNull, or, sql, type SQL } from "drizzle-orm";
import { Download, FileUp, Plus, Search, UserPlus, Users } from "lucide-react";
import { db } from "@/db/client";
import {
  attendance,
  coachAssignments,
  gymLocations,
  invoices,
  membershipPlans,
  orgMembers,
  subscriptions,
  users,
} from "@/db/schema";
import { Badge, ButtonLink, Card, EmptyState, Field, Input, PageHeader, Select, Stat, StatusBadge, Avatar } from "@/components/ui/primitives";
import { Modal, SubmitButton } from "@/components/ui/client";
import { requireOrgPage } from "@/lib/authz";
import { addMemberAction, inviteMemberAction } from "@/lib/actions/gym";
import { formatDate, formatMoney, startOfDay } from "@/lib/utils";

export const metadata = { title: "Members" };

export default async function MembersPage({
  searchParams,
}: {
  searchParams: Promise<{ q?: string; status?: string; planId?: string; payment?: string; locationId?: string; coachId?: string; filter?: string; add?: string; archived?: string }>;
}) {
  const ctx = await requireOrgPage();
  const orgId = ctx.org.id;
  const params = await searchParams;
  const showArchived = params.archived === "1";

  const conditions: SQL[] = [eq(orgMembers.orgId, orgId)];
  conditions.push(showArchived ? sql`${orgMembers.archivedAt} is not null` : isNull(orgMembers.archivedAt));
  if (params.q) {
    const term = `%${params.q}%`;
    conditions.push(or(ilike(users.name, term), ilike(users.email, term), ilike(users.phone, term))!);
  }
  if (params.locationId) conditions.push(eq(orgMembers.locationId, params.locationId));
  if (params.filter === "inactive") {
    conditions.push(
      sql`(select max(a.checked_in_at) from attendance a where a.member_id = ${orgMembers.id}) < ${Date.now() - 14 * 86400000} or (select count(*) from attendance a where a.member_id = ${orgMembers.id}) = 0`,
    );
  }
  if (params.status === "no_membership") {
    conditions.push(sql`not exists (select 1 from subscriptions s where s.member_id = ${orgMembers.id} and s.status in ('active','trial','past_due','paused','cancel_scheduled'))`);
  }

  const rows = await db
    .select({
      member: orgMembers,
      user: users,
      sub: subscriptions,
      plan: membershipPlans,
      location: gymLocations,
      lastVisit: sql<number | null>`(select max(a.checked_in_at) from attendance a where a.member_id = ${orgMembers.id})`,
      balance: sql<number>`coalesce((select sum(i.amount_cents) from invoices i where i.member_id = ${orgMembers.id} and i.status = 'open'), 0)`,
      visits: sql<number>`(select count(*) from attendance a where a.member_id = ${orgMembers.id})`,
      coaches: sql<string | null>`(select group_concat(u.name, ', ') from coach_assignments ca join org_members cm on cm.id = ca.coach_member_id join users u on u.id = cm.user_id where ca.fighter_member_id = ${orgMembers.id})`,
    })
    .from(orgMembers)
    .innerJoin(users, eq(users.id, orgMembers.userId))
    .leftJoin(subscriptions, and(eq(subscriptions.memberId, orgMembers.id), inArray(subscriptions.status, ["active", "trial", "past_due", "paused", "cancel_scheduled", "pending"])))
    .leftJoin(membershipPlans, eq(membershipPlans.id, subscriptions.planId))
    .leftJoin(gymLocations, eq(gymLocations.id, orgMembers.locationId))
    .where(and(...conditions))
    .orderBy(desc(orgMembers.createdAt))
    .limit(500);

  const filtered = rows.filter((r) => {
    if (params.planId && r.sub?.planId !== params.planId) return false;
    if (params.payment === "overdue") return Number(r.balance) > 0;
    if (params.payment === "clear") return Number(r.balance) === 0;
    if (params.coachId) return (r.coaches ?? "").length > 0;
    return true;
  });

  const [statusCounts, plans, coaches, totals] = await Promise.all([
    db
      .select({ status: subscriptions.status, n: count() })
      .from(subscriptions)
      .where(eq(subscriptions.orgId, orgId))
      .groupBy(subscriptions.status),
    db.select().from(membershipPlans).where(and(eq(membershipPlans.orgId, orgId), eq(membershipPlans.isActive, true))),
    db
      .select({ member: orgMembers, user: users })
      .from(orgMembers)
      .innerJoin(users, eq(users.id, orgMembers.userId))
      .where(and(eq(orgMembers.orgId, orgId), eq(orgMembers.role, "coach"), isNull(orgMembers.archivedAt))),
    db
      .select({ n: count() })
      .from(orgMembers)
      .where(and(eq(orgMembers.orgId, orgId), gte(orgMembers.createdAt, new Date(new Date().getFullYear(), new Date().getMonth(), 1)))),
  ]);

  const activeCount = statusCounts.filter((s) => ["active", "trial", "cancel_scheduled"].includes(s.status)).reduce((sum, s) => sum + Number(s.n), 0);
  const overdueCount = statusCounts.find((s) => s.status === "past_due")?.n ?? 0;

  const canWrite = ctx.permissions.has("members:write");

  return (
    <div className="space-y-5">
      <PageHeader
        title="Members"
        description="Everyone who trains with you — memberships, payments and attendance in one place."
        actions={
          <>
            {canWrite ? (
              <>
                <Modal trigger={<><Plus className="h-4 w-4" /> Add member</>} title="Add a member" description="Creates the account and optionally starts a membership." triggerSize="sm">
                  <form action={addMemberAction} className="space-y-3">
                    <input type="hidden" name="orgId" value={orgId} />
                    <div className="grid gap-3 sm:grid-cols-2">
                      <Field label="Full name" htmlFor="m-name"><Input id="m-name" name="name" required placeholder="Alex Nord" /></Field>
                      <Field label="Email" htmlFor="m-email"><Input id="m-email" name="email" type="email" required placeholder="alex@example.com" /></Field>
                      <Field label="Phone" htmlFor="m-phone"><Input id="m-phone" name="phone" placeholder="+46 70 000 00 00" /></Field>
                      <Field label="Role" htmlFor="m-role">
                        <Select id="m-role" name="role" defaultValue="fighter">
                          <option value="fighter">Member / fighter</option>
                          <option value="coach">Coach</option>
                          <option value="manager">Manager</option>
                        </Select>
                      </Field>
                      <Field label="Location" htmlFor="m-loc">
                        <Select id="m-loc" name="locationId">
                          {ctx.locations.map((l) => <option key={l.id} value={l.id}>{l.name}</option>)}
                        </Select>
                      </Field>
                      <Field label="Membership plan" htmlFor="m-plan" hint="Optional — can be added later.">
                        <Select id="m-plan" name="planId">
                          <option value="">No plan yet</option>
                          {plans.map((p) => <option key={p.id} value={p.id}>{p.name} · {formatMoney(p.priceCents, p.currency)}</option>)}
                        </Select>
                      </Field>
                    </div>
                    <label className="flex items-center gap-2 text-sm">
                      <input type="checkbox" name="sendInvite" defaultChecked className="h-4 w-4 accent-[var(--accent)]" />
                      Email an invitation to set their password
                    </label>
                    <SubmitButton className="w-full">Add member</SubmitButton>
                  </form>
                </Modal>
                <Modal trigger={<><UserPlus className="h-4 w-4" /> Invite</>} title="Invite by email" description="They'll get a link to join your gym." triggerVariant="secondary" triggerSize="sm">
                  <form action={inviteMemberAction} className="space-y-3">
                    <input type="hidden" name="orgId" value={orgId} />
                    <Field label="Email"><Input name="email" type="email" required placeholder="newmember@example.com" /></Field>
                    <Field label="Role">
                      <Select name="role" defaultValue="fighter">
                        <option value="fighter">Member / fighter</option>
                        <option value="coach">Coach</option>
                        <option value="manager">Manager</option>
                      </Select>
                    </Field>
                    <SubmitButton className="w-full">Send invitation</SubmitButton>
                  </form>
                </Modal>
              </>
            ) : null}
            <ButtonLink href="/api/export/members" variant="secondary" size="sm" prefetch={false}><Download className="h-4 w-4" /> Export CSV</ButtonLink>
            {canWrite ? <ButtonLink href="/gym/members/import" variant="secondary" size="sm"><FileUp className="h-4 w-4" /> Import</ButtonLink> : null}
          </>
        }
      />

      <div className="grid gap-3 sm:grid-cols-4">
        <Stat label="Active memberships" value={activeCount} icon={<Users className="h-4 w-4" />} />
        <Stat label="Overdue" value={overdueCount} tone={overdueCount ? "danger" : "neutral"} hint="Memberships past due" />
        <Stat label="New this month" value={Number(totals[0]?.n ?? 0)} />
        <Stat label="In this view" value={filtered.length} hint={showArchived ? "Archived members" : "Filtered members"} />
      </div>

      <Card className="p-3">
        <form method="get" className="grid gap-2 sm:grid-cols-2 lg:grid-cols-5">
          <div className="relative lg:col-span-2">
            <Search className="pointer-events-none absolute left-3 top-1/2 h-4 w-4 -translate-y-1/2" style={{ color: "var(--muted)" }} />
            <Input name="q" defaultValue={params.q} placeholder="Search name, email or phone" className="pl-9" aria-label="Search members" />
          </div>
          <Select name="planId" defaultValue={params.planId ?? ""} aria-label="Filter by plan">
            <option value="">All plans</option>
            {plans.map((p) => <option key={p.id} value={p.id}>{p.name}</option>)}
          </Select>
          <Select name="payment" defaultValue={params.payment ?? ""} aria-label="Filter by payment">
            <option value="">Any payment status</option>
            <option value="overdue">Outstanding balance</option>
            <option value="clear">Nothing owed</option>
          </Select>
          <Select name="locationId" defaultValue={params.locationId ?? ""} aria-label="Filter by location">
            <option value="">All locations</option>
            {ctx.locations.map((l) => <option key={l.id} value={l.id}>{l.name}</option>)}
          </Select>
          <Select name="coachId" defaultValue={params.coachId ?? ""} aria-label="Filter by coach">
            <option value="">Any coach</option>
            {coaches.map((c) => <option key={c.member.id} value={c.member.id}>{c.user.name}</option>)}
          </Select>
          <Select name="status" defaultValue={params.status ?? ""} aria-label="Filter by membership">
            <option value="">Any membership</option>
            <option value="no_membership">No membership</option>
          </Select>
          <input type="hidden" name="filter" value={params.filter ?? ""} />
          <div className="flex gap-2">
            <button type="submit" className="btn btn-secondary btn-sm flex-1">Apply</button>
            <Link href="/gym/members" className="btn btn-ghost btn-sm">Reset</Link>
          </div>
        </form>
        <div className="mt-2 flex flex-wrap gap-2">
          <Link href={`/gym/members?filter=inactive${params.q ? `&q=${encodeURIComponent(params.q)}` : ""}`} className="badge">Inactive 14+ days</Link>
          <Link href="/gym/members?archived=1" className="badge">Archived</Link>
          {showArchived ? <Link href="/gym/members" className="badge badge-accent">Back to active</Link> : null}
          {params.q ? <Badge tone="info">Search: {params.q}</Badge> : null}
        </div>
      </Card>

      <Card className="overflow-hidden p-0">
        {filtered.length ? (
          <div className="overflow-x-auto">
            <table className="table">
              <thead>
                <tr>
                  <th>Member</th>
                  <th>Membership</th>
                  <th>Status</th>
                  <th>Renews</th>
                  <th>Balance</th>
                  <th>Visits</th>
                  <th>Coach</th>
                  <th className="text-right">Actions</th>
                </tr>
              </thead>
              <tbody>
                {filtered.map((row) => {
                  const lastSeen = row.lastVisit ? new Date(Number(row.lastVisit)) : null;
                  return (
                    <tr key={row.member.id}>
                      <td>
                        <Link href={`/gym/members/${row.member.id}`} className="flex items-center gap-2.5">
                          <Avatar name={row.user.name} size={32} />
                          <span className="min-w-0">
                            <span className="block truncate font-medium">{row.user.name}</span>
                            <span className="block truncate text-xs" style={{ color: "var(--muted)" }}>{row.user.email}</span>
                          </span>
                        </Link>
                      </td>
                      <td>
                        <span className="text-sm">{row.plan?.name ?? "—"}</span>
                        <span className="block text-xs" style={{ color: "var(--muted)" }}>{row.member.role}</span>
                      </td>
                      <td><StatusBadge status={row.sub?.status ?? "none"} /></td>
                      <td className="text-sm">{row.sub ? formatDate(row.sub.currentPeriodEnd) : "—"}</td>
                      <td className="stat-value text-sm" style={{ color: Number(row.balance) > 0 ? "var(--danger)" : undefined }}>
                        {Number(row.balance) > 0 ? formatMoney(Number(row.balance), ctx.org.currency) : "—"}
                      </td>
                      <td className="text-sm">
                        {Number(row.visits)}
                        <span className="block text-xs" style={{ color: "var(--muted)" }}>
                          {lastSeen ? formatDate(lastSeen) : "never"}
                        </span>
                      </td>
                      <td className="text-sm" style={{ color: "var(--muted)" }}>{row.coaches || "—"}</td>
                      <td className="text-right">
                        <Link href={`/gym/members/${row.member.id}`} className="btn btn-secondary btn-sm">Open</Link>
                      </td>
                    </tr>
                  );
                })}
              </tbody>
            </table>
          </div>
        ) : (
          <div className="p-5">
            <EmptyState
              icon={<Users className="h-5 w-5" />}
              title="No members match this view"
              description="Try clearing the filters, or add your first member to get started."
              action={canWrite ? <ButtonLink href="/gym/members" size="sm">Clear filters</ButtonLink> : undefined}
            />
          </div>
        )}
      </Card>
    </div>
  );
}
