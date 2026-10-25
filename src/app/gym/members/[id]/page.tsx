import Link from "next/link";
import { notFound } from "next/navigation";
import { and, desc, eq, inArray, isNull } from "drizzle-orm";
import { CalendarCheck, FileText, Mail, Phone, Plus, ShieldAlert, Trash2, UserCog } from "lucide-react";
import { db } from "@/db/client";
import {
  attendance,
  bookings,
  classSessions,
  classes,
  coachAssignments,
  coachNotes,
  documents,
  fighterProfiles,
  fightRecords,
  gymLocations,
  invoices,
  membershipEvents,
  membershipPlans,
  orgMembers,
  payments,
  subscriptions,
  users,
} from "@/db/schema";
import {
  Avatar,
  Badge,
  ButtonLink,
  Callout,
  Card,
  CardHeader,
  Divider,
  EmptyState,
  Field,
  Input,
  KeyValue,
  PageHeader,
  Select,
  StatusBadge,
  Textarea,
} from "@/components/ui/primitives";
import { ConfirmSubmit, Modal, SubmitButton, Tabs } from "@/components/ui/client";
import { requireOrgPage } from "@/lib/authz";
import {
  addCoachNoteAction,
  addCreditsAction,
  archiveMemberAction,
  assignCoachAction,
  assignMembershipAction,
  cancelMembershipAction,
  changeSubscriptionPlanAction,
  createInvoiceAction,
  extendMembershipAction,
  markInvoicePaidAction,
  pauseMembershipAction,
  resumeMembershipAction,
  setMemberRoleAction,
  unassignCoachAction,
  updateMemberAction,
} from "@/lib/actions/gym";
import { formatDate, formatDateTime, formatMoney, formatTime, parseJson } from "@/lib/utils";

export default async function MemberProfilePage({ params }: { params: Promise<{ id: string }> }) {
  const ctx = await requireOrgPage();
  const { id } = await params;
  const orgId = ctx.org.id;

  const row = (
    await db
      .select({ member: orgMembers, user: users, location: gymLocations })
      .from(orgMembers)
      .innerJoin(users, eq(users.id, orgMembers.userId))
      .leftJoin(gymLocations, eq(gymLocations.id, orgMembers.locationId))
      .where(and(eq(orgMembers.id, id), eq(orgMembers.orgId, orgId)))
      .limit(1)
  )[0];
  if (!row) notFound();

  const [subs, plans, memberInvoices, memberPayments, visits, bookingsList, profile, assignments, notes, records, docs] = await Promise.all([
    db
      .select({ sub: subscriptions, plan: membershipPlans })
      .from(subscriptions)
      .innerJoin(membershipPlans, eq(membershipPlans.id, subscriptions.planId))
      .where(and(eq(subscriptions.orgId, orgId), eq(subscriptions.memberId, id)))
      .orderBy(desc(subscriptions.createdAt)),
    db.select().from(membershipPlans).where(and(eq(membershipPlans.orgId, orgId), eq(membershipPlans.isActive, true))),
    db.select().from(invoices).where(and(eq(invoices.orgId, orgId), eq(invoices.memberId, id))).orderBy(desc(invoices.createdAt)),
    db.select().from(payments).where(and(eq(payments.orgId, orgId), eq(payments.memberId, id))).orderBy(desc(payments.createdAt)).limit(20),
    db
      .select({ att: attendance, session: classSessions, cls: classes })
      .from(attendance)
      .leftJoin(classSessions, eq(classSessions.id, attendance.sessionId))
      .leftJoin(classes, eq(classes.id, classSessions.classId))
      .where(and(eq(attendance.orgId, orgId), eq(attendance.memberId, id)))
      .orderBy(desc(attendance.checkedInAt))
      .limit(40),
    db
      .select({ booking: bookings, session: classSessions, cls: classes })
      .from(bookings)
      .innerJoin(classSessions, eq(classSessions.id, bookings.sessionId))
      .innerJoin(classes, eq(classes.id, classSessions.classId))
      .where(and(eq(bookings.orgId, orgId), eq(bookings.memberId, id)))
      .orderBy(desc(classSessions.startsAt))
      .limit(20),
    db.select().from(fighterProfiles).where(eq(fighterProfiles.memberId, id)).limit(1),
    db
      .select({ assignment: coachAssignments, coach: orgMembers, user: users })
      .from(coachAssignments)
      .innerJoin(orgMembers, eq(orgMembers.id, coachAssignments.coachMemberId))
      .innerJoin(users, eq(users.id, orgMembers.userId))
      .where(and(eq(coachAssignments.orgId, orgId), eq(coachAssignments.fighterMemberId, id))),
    db
      .select({ note: coachNotes, coach: orgMembers, user: users })
      .from(coachNotes)
      .innerJoin(orgMembers, eq(orgMembers.id, coachNotes.coachMemberId))
      .innerJoin(users, eq(users.id, orgMembers.userId))
      .where(and(eq(coachNotes.orgId, orgId), eq(coachNotes.fighterMemberId, id)))
      .orderBy(desc(coachNotes.createdAt)),
    db.select().from(fightRecords).where(and(eq(fightRecords.orgId, orgId), eq(fightRecords.fighterMemberId, id))).orderBy(desc(fightRecords.fightDate)),
    db.select().from(documents).where(and(eq(documents.orgId, orgId), eq(documents.memberId, id))),
  ]);

  const events = await db
    .select()
    .from(membershipEvents)
    .where(and(eq(membershipEvents.orgId, orgId), eq(membershipEvents.subscriptionId, subs[0]?.sub.id ?? "")))
    .orderBy(desc(membershipEvents.createdAt))
    .limit(30);

  const coaches = await db
    .select({ member: orgMembers, user: users })
    .from(orgMembers)
    .innerJoin(users, eq(users.id, orgMembers.userId))
    .where(and(eq(orgMembers.orgId, orgId), eq(orgMembers.role, "coach"), isNull(orgMembers.archivedAt)));

  const current = subs.find((s) => ["active", "trial", "past_due", "paused", "cancel_scheduled", "pending"].includes(s.sub.status));
  const balance = memberInvoices.filter((i) => i.status === "open").reduce((sum, i) => sum + i.amountCents, 0);
  const canManageMemberships = ctx.permissions.has("memberships:manage");
  const canManageBilling = ctx.permissions.has("billing:manage");
  const canManageStaff = ctx.permissions.has("staff:manage");
  const fighter = profile[0];

  const memberPath = `/gym/members/${id}`;

  const overview = (
    <div className="grid gap-4 lg:grid-cols-3">
      <div className="space-y-4 lg:col-span-2">
        <Card>
          <CardHeader title="Contact details" description="Staff-visible information" action={<Badge>{row.member.role}</Badge>} />
          <div className="mt-3 grid gap-x-6 sm:grid-cols-2">
            <div>
              <KeyValue label="Email"><a href={`mailto:${row.user.email}`} className="underline-offset-4 hover:underline">{row.user.email}</a></KeyValue>
              <KeyValue label="Phone">{row.user.phone ?? "—"}</KeyValue>
              <KeyValue label="Date of birth">{formatDate(row.user.dateOfBirth)}</KeyValue>
              <KeyValue label="Location">{row.location?.name ?? "—"}</KeyValue>
            </div>
            <div>
              <KeyValue label="Joined">{formatDate(row.member.joinedAt ?? row.member.createdAt)}</KeyValue>
              <KeyValue label="Emergency contact">{row.user.emergencyContactName ?? "—"}</KeyValue>
              <KeyValue label="Emergency phone">{row.user.emergencyContactPhone ?? "—"}</KeyValue>
              <KeyValue label="Status"><StatusBadge status={row.member.archivedAt ? "archived" : row.member.status} /></KeyValue>
            </div>
          </div>
          {row.member.notes ? (
            <>
              <Divider />
              <p className="text-xs uppercase tracking-wide" style={{ color: "var(--muted)" }}>Staff notes</p>
              <p className="mt-1 whitespace-pre-wrap text-sm">{row.member.notes}</p>
            </>
          ) : null}
          <div className="mt-4 flex flex-wrap gap-2">
            <Modal
              trigger={<>Edit profile</>}
              title="Edit member"
              description="Only gym staff can see this information."
              triggerVariant="secondary"
              triggerSize="sm"
              wide
            >
              <form action={updateMemberAction} className="space-y-4">
                <input type="hidden" name="orgId" value={orgId} />
                <input type="hidden" name="memberId" value={id} />
                <div className="grid gap-3 sm:grid-cols-2">
                  <Field label="Name"><Input name="name" defaultValue={row.user.name} required /></Field>
                  <Field label="Email"><Input name="email" type="email" defaultValue={row.user.email} required /></Field>
                  <Field label="Phone"><Input name="phone" defaultValue={row.user.phone ?? ""} /></Field>
                  <Field label="Date of birth"><Input name="dateOfBirth" type="date" defaultValue={row.user.dateOfBirth?.toISOString().slice(0, 10) ?? ""} /></Field>
                  <Field label="Emergency contact"><Input name="emergencyContactName" defaultValue={row.user.emergencyContactName ?? ""} /></Field>
                  <Field label="Emergency phone"><Input name="emergencyContactPhone" defaultValue={row.user.emergencyContactPhone ?? ""} /></Field>
                  <Field label="Location">
                    <Select name="locationId" defaultValue={row.member.locationId ?? ""}>
                      <option value="">No location</option>
                      {ctx.locations.map((l) => <option key={l.id} value={l.id}>{l.name}</option>)}
                    </Select>
                  </Field>
                  <Field label="Status">
                    <Select name="status" defaultValue={row.member.status}>
                      <option value="active">Active</option>
                      <option value="inactive">Inactive</option>
                    </Select>
                  </Field>
                  {row.member.role === "coach" ? <Field label="Title"><Input name="title" defaultValue={row.member.title ?? ""} /></Field> : null}
                </div>
                {row.member.role === "fighter" ? (
                  <div className="grid gap-3 sm:grid-cols-2">
                    <Field label="Discipline"><Input name="discipline" defaultValue={fighter?.discipline ?? ""} /></Field>
                    <Field label="Level">
                      <Select name="level" defaultValue={fighter?.level ?? "beginner"}>
                        <option value="beginner">Beginner</option>
                        <option value="intermediate">Intermediate</option>
                        <option value="advanced">Advanced</option>
                        <option value="competitor">Competitor</option>
                      </Select>
                    </Field>
                    <Field label="Weight class"><Input name="weightClass" defaultValue={fighter?.weightClass ?? ""} /></Field>
                    <Field label="Current weight (kg)"><Input name="currentWeightKg" type="number" step="0.1" defaultValue={fighter?.currentWeightKg ?? ""} /></Field>
                    <Field label="Height (cm)"><Input name="heightCm" type="number" defaultValue={fighter?.heightCm ?? ""} /></Field>
                    <Field label="Guardian name (if minor)"><Input name="guardianName" defaultValue={fighter?.guardianName ?? ""} /></Field>
                    <Field label="Guardian phone"><Input name="guardianPhone" defaultValue={fighter?.guardianPhone ?? ""} /></Field>
                    <label className="flex items-center gap-2 self-end text-sm">
                      <input type="checkbox" name="isMinor" defaultChecked={fighter?.isMinor ?? false} className="h-4 w-4 accent-[var(--accent)]" />
                      Under 18 (guardian required)
                    </label>
                  </div>
                ) : null}
                <Field label="Notes"><Textarea name="notes" defaultValue={row.member.notes ?? ""} /></Field>
                <SubmitButton>Save changes</SubmitButton>
              </form>
            </Modal>
            {ctx.permissions.has("members:write") ? (
              <form action={archiveMemberAction}>
                <input type="hidden" name="orgId" value={orgId} />
                <input type="hidden" name="memberId" value={id} />
                <ConfirmSubmit message={`Archive ${row.user.name}? Their active memberships will be cancelled.`}>
                  <Trash2 className="h-3.5 w-3.5" /> Archive
                </ConfirmSubmit>
              </form>
            ) : null}
            {canManageStaff && row.member.role !== "owner" ? (
              <Modal trigger={<>Change role</>} title="Change role" triggerVariant="ghost" triggerSize="sm">
                <form action={setMemberRoleAction} className="space-y-3">
                  <input type="hidden" name="orgId" value={orgId} />
                  <input type="hidden" name="memberId" value={id} />
                  <Field label="Role">
                    <Select name="role" defaultValue={row.member.role}>
                      <option value="fighter">Member / fighter</option>
                      <option value="coach">Coach</option>
                      <option value="manager">Manager</option>
                    </Select>
                  </Field>
                  <SubmitButton>Update role</SubmitButton>
                </form>
              </Modal>
            ) : null}
          </div>
        </Card>

        <Card>
          <CardHeader title="Recent attendance" description={`${visits.length} check-ins recorded`} action={<ButtonLink href="/gym/attendance" variant="ghost" size="sm">Attendance console</ButtonLink>} />
          {visits.length ? (
            <div className="mt-2 divide-y" style={{ borderColor: "var(--line)" }}>
              {visits.slice(0, 8).map((v) => (
                <div key={v.att.id} className="flex items-center justify-between gap-3 py-2 text-sm">
                  <div>
                    <p className="font-medium">{v.cls?.name ?? "Open gym / walk-in"}</p>
                    <p className="text-xs" style={{ color: "var(--muted)" }}>{formatDateTime(v.att.checkedInAt)} · {v.att.method}</p>
                  </div>
                  <Badge tone="accent">checked in</Badge>
                </div>
              ))}
            </div>
          ) : (
            <EmptyState title="No check-ins yet" description="Check-ins appear here automatically." />
          )}
        </Card>

        <Card>
          <CardHeader title="Bookings" description="Latest 20 classes" />
          {bookingsList.length ? (
            <div className="mt-2 overflow-x-auto">
              <table className="table">
                <thead><tr><th>Class</th><th>When</th><th>Status</th></tr></thead>
                <tbody>
                  {bookingsList.slice(0, 8).map((b) => (
                    <tr key={b.booking.id}>
                      <td className="font-medium">{b.cls.name}</td>
                      <td className="text-sm">{formatDate(b.session.startsAt)} · {formatTime(b.session.startsAt)}</td>
                      <td><StatusBadge status={b.booking.status} /></td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          ) : (
            <EmptyState title="No bookings" />
          )}
        </Card>
      </div>

      <div className="space-y-4">
        <Card>
          <CardHeader title="Membership" action={current ? <StatusBadge status={current.sub.status} /> : <Badge>None</Badge>} />
          {current ? (
            <div className="mt-3 space-y-1">
              <p className="text-lg font-semibold">{current.plan.name}</p>
              <p className="text-sm" style={{ color: "var(--muted)" }}>
                {formatMoney(current.sub.priceCents, current.sub.currency)} · {current.plan.interval === "one_time" ? "one-time" : `per ${current.plan.interval}`}
              </p>
              <Divider />
              <KeyValue label="Started">{formatDate(current.sub.startDate)}</KeyValue>
              <KeyValue label="Current period">{formatDate(current.sub.currentPeriodStart)} → {formatDate(current.sub.currentPeriodEnd)}</KeyValue>
              <KeyValue label="Credits">{current.sub.creditsRemaining ?? "Unlimited"}</KeyValue>
              <KeyValue label="Auto-renew">{current.sub.autoRenew ? "On" : "Off"}</KeyValue>
              {current.sub.status === "paused" ? <KeyValue label="Resumes">{formatDate(current.sub.resumeAt)}</KeyValue> : null}
              <KeyValue label="Balance">
                <span style={{ color: balance > 0 ? "var(--danger)" : undefined }}>{formatMoney(balance, current.sub.currency)}</span>
              </KeyValue>
              {canManageMemberships ? (
                <div className="mt-3 flex flex-wrap gap-1.5">
                  {current.sub.status === "paused" ? (
                    <form action={resumeMembershipAction}>
                      <input type="hidden" name="orgId" value={orgId} />
                      <input type="hidden" name="memberId" value={id} />
                      <input type="hidden" name="subscriptionId" value={current.sub.id} />
                      <SubmitButton size="sm">Resume</SubmitButton>
                    </form>
                  ) : (
                    <Modal trigger={<>Pause</>} title="Pause membership" description="The paid period is extended by the pause length." triggerVariant="secondary" triggerSize="sm">
                      <form action={pauseMembershipAction} className="space-y-3">
                        <input type="hidden" name="orgId" value={orgId} />
                        <input type="hidden" name="memberId" value={id} />
                        <input type="hidden" name="subscriptionId" value={current.sub.id} />
                        <Field label="From"><Input type="date" name="startDate" defaultValue={new Date().toISOString().slice(0, 10)} required /></Field>
                        <Field label="Until"><Input type="date" name="endDate" required /></Field>
                        <Field label="Reason"><Input name="reason" placeholder="Injury, travel…" /></Field>
                        <SubmitButton>Pause membership</SubmitButton>
                      </form>
                    </Modal>
                  )}
                  <Modal trigger={<>Extend</>} title="Extend membership" triggerVariant="secondary" triggerSize="sm">
                    <form action={extendMembershipAction} className="space-y-3">
                      <input type="hidden" name="orgId" value={orgId} />
                      <input type="hidden" name="memberId" value={id} />
                      <input type="hidden" name="subscriptionId" value={current.sub.id} />
                      <Field label="Days"><Input name="days" type="number" min={1} max={365} defaultValue={7} required /></Field>
                      <SubmitButton>Extend</SubmitButton>
                    </form>
                  </Modal>
                  <Modal trigger={<>Credits</>} title="Adjust class credits" triggerVariant="secondary" triggerSize="sm">
                    <form action={addCreditsAction} className="space-y-3">
                      <input type="hidden" name="orgId" value={orgId} />
                      <input type="hidden" name="memberId" value={id} />
                      <input type="hidden" name="subscriptionId" value={current.sub.id} />
                      <Field label="Change" hint="Use a negative number to remove credits."><Input name="delta" type="number" defaultValue={1} required /></Field>
                      <Field label="Reason"><Input name="reason" /></Field>
                      <SubmitButton>Apply</SubmitButton>
                    </form>
                  </Modal>
                  <Modal trigger={<>Change plan</>} title="Change membership plan" triggerVariant="secondary" triggerSize="sm">
                    <form action={changeSubscriptionPlanAction} className="space-y-3">
                      <input type="hidden" name="orgId" value={orgId} />
                      <input type="hidden" name="memberId" value={id} />
                      <input type="hidden" name="subscriptionId" value={current.sub.id} />
                      <Field label="New plan">
                        <Select name="newPlanId" defaultValue={current.plan.id}>
                          {plans.map((p) => <option key={p.id} value={p.id}>{p.name} · {formatMoney(p.priceCents, p.currency)}</option>)}
                        </Select>
                      </Field>
                      <Field label="Effective date"><Input type="date" name="effectiveAt" defaultValue={new Date().toISOString().slice(0, 10)} /></Field>
                      <label className="flex items-center gap-2 text-sm">
                        <input type="checkbox" name="applyNow" defaultChecked className="h-4 w-4 accent-[var(--accent)]" /> Apply immediately
                      </label>
                      <SubmitButton>Update plan</SubmitButton>
                    </form>
                  </Modal>
                  <Modal trigger={<>Cancel</>} title="Cancel membership" description="Cancellation is logged and auditable." triggerVariant="danger" triggerSize="sm">
                    <form action={cancelMembershipAction} className="space-y-3">
                      <input type="hidden" name="orgId" value={orgId} />
                      <input type="hidden" name="memberId" value={id} />
                      <input type="hidden" name="subscriptionId" value={current.sub.id} />
                      <Field label="Reason"><Input name="reason" placeholder="Moving away, injury…" /></Field>
                      <label className="flex items-center gap-2 text-sm">
                        <input type="checkbox" name="immediate" className="h-4 w-4 accent-[var(--danger)]" /> Cancel immediately (otherwise at period end)
                      </label>
                      <SubmitButton variant="danger">Cancel membership</SubmitButton>
                    </form>
                  </Modal>
                  {canManageBilling ? (
                    <form action={createInvoiceAction}>
                      <input type="hidden" name="orgId" value={orgId} />
                      <input type="hidden" name="memberId" value={id} />
                      <input type="hidden" name="subscriptionId" value={current.sub.id} />
                      <SubmitButton variant="ghost" size="sm">+ Invoice</SubmitButton>
                    </form>
                  ) : null}
                </div>
              ) : null}
            </div>
          ) : (
            <div className="mt-3">
              <EmptyState title="No active membership" description="Assign a plan to give access to bookings." />
              {canManageMemberships ? (
                <Modal trigger={<><Plus className="h-4 w-4" /> Assign plan</>} title="Assign membership" triggerSize="sm" triggerClassName="mt-3 w-full">
                  <form action={assignMembershipAction} className="space-y-3">
                    <input type="hidden" name="orgId" value={orgId} />
                    <input type="hidden" name="memberId" value={id} />
                    <Field label="Plan">
                      <Select name="planId" required>
                        {plans.map((p) => <option key={p.id} value={p.id}>{p.name} · {formatMoney(p.priceCents, p.currency)}</option>)}
                      </Select>
                    </Field>
                    <Field label="Discount %"><Input name="discountPercent" type="number" min={0} max={100} defaultValue={0} /></Field>
                    <label className="flex items-center gap-2 text-sm">
                      <input type="checkbox" name="trial" className="h-4 w-4 accent-[var(--accent)]" /> Start as trial
                    </label>
                    <SubmitButton>Assign membership</SubmitButton>
                  </form>
                </Modal>
              ) : null}
            </div>
          )}
        </Card>

        <Card>
          <CardHeader title="Assigned coach" description="Elev och tränare" />
          <div className="mt-2 space-y-2">
            {assignments.length ? (
              assignments.map((a) => (
                <div key={a.assignment.id} className="subtle flex items-center gap-2 p-2.5">
                  <Avatar name={a.user.name} size={28} />
                  <div className="min-w-0 flex-1">
                    <p className="truncate text-sm font-medium">{a.user.name}</p>
                    <p className="truncate text-xs" style={{ color: "var(--muted)" }}>{a.assignment.focus ?? a.coach.title ?? "Coach"}{a.assignment.isPrimary ? " · primary" : ""}</p>
                  </div>
                  {canManageStaff ? (
                    <form action={unassignCoachAction}>
                      <input type="hidden" name="orgId" value={orgId} />
                      <input type="hidden" name="assignmentId" value={a.assignment.id} />
                      <input type="hidden" name="returnTo" value={memberPath} />
                      <button type="submit" className="btn btn-ghost btn-sm" aria-label={`Unassign ${a.user.name}`}>×</button>
                    </form>
                  ) : null}
                </div>
              ))
            ) : (
              <p className="text-sm" style={{ color: "var(--muted)" }}>No coach assigned.</p>
            )}
            {canManageStaff ? (
              <form action={assignCoachAction} className="mt-2 flex flex-wrap items-end gap-2">
                <input type="hidden" name="orgId" value={orgId} />
                <input type="hidden" name="fighterMemberId" value={id} />
                <div className="min-w-0 flex-1">
                  <label className="label" htmlFor="coachMemberId">Assign coach</label>
                  <Select id="coachMemberId" name="coachMemberId" required>
                    <option value="">Choose coach</option>
                    {coaches.map((c) => <option key={c.member.id} value={c.member.id}>{c.user.name}</option>)}
                  </Select>
                </div>
                <SubmitButton size="sm" variant="secondary">Assign</SubmitButton>
              </form>
            ) : null}
          </div>
        </Card>

        <Card>
          <CardHeader title="Coaching notes" action={<Badge>{notes.length}</Badge>} />
          <div className="mt-2 space-y-2">
            {notes.slice(0, 4).map((n) => (
              <div key={n.note.id} className="subtle p-2.5">
                <p className="text-sm">{n.note.body}</p>
                <p className="mt-1 text-xs" style={{ color: "var(--muted)" }}>
                  {n.user.name} · {formatDate(n.note.createdAt)} · {n.note.visibility}
                </p>
              </div>
            ))}
            {ctx.permissions.has("fighters:read") ? (
              <form action={addCoachNoteAction} className="mt-2 space-y-2">
                <input type="hidden" name="orgId" value={orgId} />
                <input type="hidden" name="fighterMemberId" value={id} />
                <Textarea name="body" placeholder="Add a coaching note…" required />
                <div className="flex gap-2">
                  <Select name="visibility" defaultValue="staff" className="flex-1">
                    <option value="private">Only me</option>
                    <option value="staff">All staff</option>
                    <option value="fighter">Visible to athlete</option>
                  </Select>
                  <SubmitButton size="sm">Save note</SubmitButton>
                </div>
              </form>
            ) : null}
          </div>
        </Card>

        <Card>
          <CardHeader title="Sensitive information" description="Restricted to staff with member access." />
          <div className="mt-2">
            <Callout tone="warn" title="Privacy">
              Emergency contacts and health-related notes must only be used for safety. Never share them with other
              members. {fighter?.isMinor ? "This athlete is under 18 — guardian consent is required for photos and public profiles." : ""}
            </Callout>
            {docs.length ? (
              <ul className="mt-3 space-y-1.5 text-sm">
                {docs.map((d) => (
                  <li key={d.id} className="flex items-center gap-2"><FileText className="h-3.5 w-3.5" /> {d.name} <Badge>{d.kind}</Badge></li>
                ))}
              </ul>
            ) : (
              <p className="mt-3 text-sm" style={{ color: "var(--muted)" }}>No signed documents on file.</p>
            )}
          </div>
        </Card>
      </div>
    </div>
  );

  const billing = (
    <div className="space-y-4">
      <Card>
        <CardHeader title="Invoices" description={`${memberInvoices.filter((i) => i.status === "open").length} open`} action={balance > 0 ? <Badge tone="danger">{formatMoney(balance, ctx.org.currency)} outstanding</Badge> : <Badge tone="accent">No balance</Badge>} />
        {memberInvoices.length ? (
          <div className="mt-3 overflow-x-auto">
            <table className="table">
              <thead><tr><th>Invoice</th><th>Period</th><th>Amount</th><th>Status</th><th>Due</th><th /></tr></thead>
              <tbody>
                {memberInvoices.map((inv) => (
                  <tr key={inv.id}>
                    <td className="font-mono text-xs">{inv.number}</td>
                    <td className="text-sm">{formatDate(inv.periodStart)} → {formatDate(inv.periodEnd)}</td>
                    <td className="stat-value text-sm">{formatMoney(inv.amountCents, inv.currency)}</td>
                    <td><StatusBadge status={inv.status} /></td>
                    <td className="text-sm">{formatDate(inv.dueDate)}</td>
                    <td className="text-right">
                      {inv.status === "open" && canManageBilling ? (
                        <form action={markInvoicePaidAction}>
                          <input type="hidden" name="orgId" value={orgId} />
                          <input type="hidden" name="invoiceId" value={inv.id} />
                          <input type="hidden" name="method" value="cash_or_card_at_desk" />
                          <ConfirmSubmit message={`Record ${formatMoney(inv.amountCents, inv.currency)} as paid?`} variant="secondary">Mark paid</ConfirmSubmit>
                        </form>
                      ) : null}
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        ) : (
          <EmptyState title="No invoices" description="Invoices are created with each billing period." />
        )}
      </Card>

      <Card>
        <CardHeader title="Payments" description="Provider-confirmed transactions" />
        {memberPayments.length ? (
          <div className="mt-3 overflow-x-auto">
            <table className="table">
              <thead><tr><th>Date</th><th>Amount</th><th>Method</th><th>Provider</th><th>Status</th></tr></thead>
              <tbody>
                {memberPayments.map((p) => (
                  <tr key={p.id}>
                    <td className="text-sm">{formatDate(p.processedAt ?? p.createdAt)}</td>
                    <td className="stat-value text-sm">{formatMoney(p.amountCents, p.currency)}</td>
                    <td className="text-sm">{p.method ?? "—"}</td>
                    <td className="text-sm">{p.provider}</td>
                    <td><StatusBadge status={p.status} /></td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        ) : (
          <EmptyState title="No payments yet" />
        )}
      </Card>

      <Card>
        <CardHeader title="Membership history" description="Every change is audited" />
        {events.length ? (
          <ul className="mt-3 space-y-2 text-sm">
            {events.map((e) => (
              <li key={e.id} className="flex items-start justify-between gap-3 border-b pb-2" style={{ borderColor: "var(--line)" }}>
                <div>
                  <p className="font-medium">{e.action.replace(/_/g, " ")}</p>
                  <p className="text-xs" style={{ color: "var(--muted)" }}>{e.fromStatus ? `${e.fromStatus} → ` : ""}{e.toStatus ?? ""}</p>
                </div>
                <span className="text-xs" style={{ color: "var(--muted)" }}>{formatDateTime(e.createdAt)}</span>
              </li>
            ))}
          </ul>
        ) : (
          <EmptyState title="No membership events" />
        )}
      </Card>
    </div>
  );

  const training = (
    <div className="space-y-4">
      <Card>
        <CardHeader title="Fighter profile" action={<Badge>{fighter?.level ?? "not set"}</Badge>} />
        <div className="mt-3 grid gap-x-6 sm:grid-cols-2">
          <KeyValue label="Discipline">{fighter?.discipline ?? "—"}</KeyValue>
          <KeyValue label="Weight class">{fighter?.weightClass ?? "—"}</KeyValue>
          <KeyValue label="Current weight">{fighter?.currentWeightKg ? `${fighter.currentWeightKg} kg` : "—"}</KeyValue>
          <KeyValue label="Height">{fighter?.heightCm ? `${fighter.heightCm} cm` : "—"}</KeyValue>
          <KeyValue label="Stance">{fighter?.stance ?? "—"}</KeyValue>
          <KeyValue label="Guardian">{fighter?.guardianName ?? "—"}</KeyValue>
        </div>
        {fighter?.goals ? <p className="mt-3 text-sm"><span style={{ color: "var(--muted)" }}>Goals: </span>{fighter.goals}</p> : null}
        {fighter?.isMinor ? <div className="mt-3"><Callout tone="warn" title="Minor account">Guardian consent is required for photos, public profiles and competition entries.</Callout></div> : null}
      </Card>

      <Card>
        <CardHeader title="Fight record" description="Verified records are confirmed by a coach" />
        {records.length ? (
          <div className="mt-3 space-y-2">
            {records.map((r) => (
              <div key={r.id} className="subtle flex flex-wrap items-center justify-between gap-2 p-2.5 text-sm">
                <div>
                  <p className="font-medium">
                    <span style={{ color: r.result === "win" ? "var(--accent)" : r.result === "loss" ? "var(--danger)" : undefined }}>
                      {r.result.toUpperCase()}
                    </span>{" "}
                    vs {r.opponent}
                  </p>
                  <p className="text-xs" style={{ color: "var(--muted)" }}>
                    {r.method ?? "—"} · {r.eventName ?? "—"} · {formatDate(r.fightDate)} · {r.level}
                  </p>
                </div>
                {r.verified ? <Badge tone="accent">verified</Badge> : <Badge tone="warn">unverified</Badge>}
              </div>
            ))}
          </div>
        ) : (
          <EmptyState title="No fights recorded" />
        )}
      </Card>

      <Card>
        <CardHeader title="Attendance history" description="Last 40 check-ins" />
        {visits.length ? (
          <ul className="mt-3 space-y-1.5 text-sm">
            {visits.map((v) => (
              <li key={v.att.id} className="flex items-center justify-between border-b py-1.5" style={{ borderColor: "var(--line)" }}>
                <span className="flex items-center gap-2">
                  <CalendarCheck className="h-3.5 w-3.5" style={{ color: "var(--accent)" }} />
                  {v.cls?.name ?? "Open gym"}
                </span>
                <span className="text-xs" style={{ color: "var(--muted)" }}>{formatDateTime(v.att.checkedInAt)} · {v.att.method}</span>
              </li>
            ))}
          </ul>
        ) : (
          <EmptyState title="No attendance yet" />
        )}
      </Card>
    </div>
  );

  return (
    <div className="space-y-5">
      <div className="flex flex-wrap items-start justify-between gap-4">
        <div className="flex items-start gap-3">
          <Avatar name={row.user.name} src={row.user.avatarUrl} size={56} />
          <div>
            <div className="flex flex-wrap items-center gap-2">
              <h1 className="text-2xl font-semibold tracking-tight">{row.user.name}</h1>
              <Badge>{row.member.role}</Badge>
              {fighter?.isMinor ? <Badge tone="warn"><ShieldAlert className="h-3 w-3" /> minor</Badge> : null}
              {row.member.archivedAt ? <Badge tone="danger">archived</Badge> : null}
            </div>
            <div className="mt-1 flex flex-wrap items-center gap-3 text-sm" style={{ color: "var(--muted)" }}>
              <span className="flex items-center gap-1"><Mail className="h-3.5 w-3.5" /> {row.user.email}</span>
              {row.user.phone ? <span className="flex items-center gap-1"><Phone className="h-3.5 w-3.5" /> {row.user.phone}</span> : null}
              <span className="flex items-center gap-1"><UserCog className="h-3.5 w-3.5" /> {row.location?.name ?? "No location"}</span>
            </div>
          </div>
        </div>
        <div className="flex flex-wrap gap-2">
          <ButtonLink href="/gym/members" variant="ghost" size="sm">← All members</ButtonLink>
          {current ? <ButtonLink href={`/gym/members/${id}?tab=billing`} variant="secondary" size="sm">Billing</ButtonLink> : null}
        </div>
      </div>

      <Tabs
        tabs={[
          { id: "overview", label: "Overview", content: overview },
          { id: "training", label: "Training", content: training },
          { id: "billing", label: "Billing", content: billing },
        ]}
      />
    </div>
  );
}
