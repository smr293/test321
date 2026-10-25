import Link from "next/link";
import { notFound } from "next/navigation";
import { ArrowLeft, ExternalLink, ShieldAlert, ShieldCheck } from "lucide-react";
import { Badge, ButtonLink, Callout, Card, CardHeader, EmptyState, Field, Input, KeyValue, Money, PageHeader, Select, Stat, StatusBadge, Textarea } from "@/components/ui/primitives";
import { ConfirmSubmit, Modal, SubmitButton } from "@/components/ui/client";
import { getOrgForAdmin, listSaasPlans } from "@/lib/saas";
import { assignOrgPlanAction, enterSupportModeAction, setOrgStatusAction } from "@/lib/actions/superadmin";
import { formatDate, formatDateTime } from "@/lib/utils";

export const metadata = { title: "Gym detail · Platform admin" };

export default async function AdminOrgDetailPage({ params }: { params: Promise<{ id: string }> }) {
  const { id } = await params;
  const [org, plans] = await Promise.all([getOrgForAdmin(id), listSaasPlans()]);
  if (!org) notFound();
  const memberTotal = org.memberBreakdown.filter((m) => m.status !== "archived").reduce((s, m) => s + m.n, 0);

  return (
    <>
      <PageHeader
        eyebrow="Gym"
        title={org.org.name}
        description={`${org.org.slug} · created ${formatDate(org.org.createdAt)} · ${org.org.country} · ${org.org.currency}`}
        actions={
          <>
            <ButtonLink href="/admin/orgs" variant="ghost" size="sm"><ArrowLeft className="h-4 w-4" /> All gyms</ButtonLink>
            <form action={enterSupportModeAction}>
              <input type="hidden" name="orgId" value={org.org.id} />
              <SubmitButton variant="secondary" size="sm"><ExternalLink className="h-4 w-4" /> Open gym (support mode)</SubmitButton>
            </form>
          </>
        }
      />

      {org.org.status !== "active" ? (
        <div className="mt-4">
          <Callout tone="warn" title={`Gym is ${org.org.status}`}>
            {org.org.suspendedReason ?? "No reason recorded."} Staff sessions were revoked.
          </Callout>
        </div>
      ) : null}

      <div className="mt-4 grid grid-cols-2 gap-3 lg:grid-cols-4">
        <Stat label="Members" value={memberTotal} hint={`${org.staff.length} staff accounts`} />
        <Stat label="Locations" value={org.locations.filter((l) => !l.archivedAt).length} hint={org.locations.map((l) => l.name).join(", ").slice(0, 60)} />
        <Stat label="Collected" value={<Money cents={org.collectedCents} />} hint={`${org.paymentCount} payments`} tone="accent" />
        <Stat label="Plan" value={org.plan?.name ?? "None"} hint={org.sub ? `${org.sub.status} · ${org.sub.seats} seats` : "No subscription"} />
      </div>

      <div className="mt-4 grid gap-4 lg:grid-cols-2">
        <Card>
          <CardHeader title="Subscription" description="Platform-level plan and seats." />
          <form action={assignOrgPlanAction} className="mt-3 space-y-3">
            <input type="hidden" name="orgId" value={org.org.id} />
            <Field label="Plan">
              <Select name="planId" defaultValue={org.sub?.planId ?? plans.find((p) => p.isActive)?.id}>
                {plans.map((p) => (
                  <option key={p.id} value={p.id}>{p.name} — {p.currency} {(p.priceMonthlyCents / 100).toFixed(0)}/mo · {p.maxActiveMembers} members</option>
                ))}
              </Select>
            </Field>
            <div className="grid grid-cols-2 gap-3">
              <Field label="Status">
                <Select name="status" defaultValue={org.sub?.status ?? "active"}>
                  {["trialing", "active", "past_due", "paused", "cancelled"].map((s) => <option key={s} value={s}>{s}</option>)}
                </Select>
              </Field>
              <Field label="Seats"><Input name="seats" type="number" min={1} defaultValue={org.sub?.seats ?? 1} /></Field>
            </div>
            <SubmitButton size="sm">Save subscription</SubmitButton>
          </form>
          <div className="mt-3 grid grid-cols-2 gap-2 text-sm">
            <KeyValue label="Period start">{org.sub?.currentPeriodStart ? formatDate(org.sub.currentPeriodStart) : "—"}</KeyValue>
            <KeyValue label="Renews">{org.sub?.currentPeriodEnd ? formatDate(org.sub.currentPeriodEnd) : "—"}</KeyValue>
          </div>
        </Card>

        <Card>
          <CardHeader title="Access control" description="Suspending revokes staff sessions immediately." />
          <div className="mt-3 flex flex-wrap gap-2">
            {org.org.status !== "active" ? (
              <form action={setOrgStatusAction}>
                <input type="hidden" name="orgId" value={org.org.id} />
                <input type="hidden" name="status" value="active" />
                <SubmitButton size="sm"><ShieldCheck className="h-4 w-4" /> Reactivate gym</SubmitButton>
              </form>
            ) : null}
            {org.org.status !== "suspended" ? (
              <Modal trigger={<span className="flex items-center gap-1.5"><ShieldAlert className="h-4 w-4" /> Suspend gym</span>} title="Suspend gym" description="All staff sessions are revoked and the workspace is locked." triggerVariant="danger" triggerSize="sm">
                <form action={setOrgStatusAction} className="space-y-3">
                  <input type="hidden" name="orgId" value={org.org.id} />
                  <input type="hidden" name="status" value="suspended" />
                  <Field label="Reason (visible to the gym)"><Textarea name="reason" rows={3} required /></Field>
                  <SubmitButton variant="danger">Suspend gym</SubmitButton>
                </form>
              </Modal>
            ) : null}
            {org.org.status !== "archived" ? (
              <form action={setOrgStatusAction}>
                <input type="hidden" name="orgId" value={org.org.id} />
                <input type="hidden" name="status" value="archived" />
                <ConfirmSubmit message="Archive this gym? Data is retained but the workspace is closed.">Archive</ConfirmSubmit>
              </form>
            ) : null}
          </div>
          <div className="mt-4 space-y-2 text-sm">
            <KeyValue label="Owner">{org.ownerName} · {org.ownerEmail}</KeyValue>
            <KeyValue label="Contact">{org.org.contactEmail ?? "—"} {org.org.contactPhone ? `· ${org.org.contactPhone}` : ""}</KeyValue>
            <KeyValue label="Tax rate">{(org.org.taxRateBps / 100).toFixed(2)}%</KeyValue>
            <KeyValue label="Onboarded">{org.org.onboardedAt ? formatDateTime(org.org.onboardedAt) : "not yet"}</KeyValue>
          </div>
        </Card>
      </div>

      <Card className="mt-4">
        <CardHeader title="Staff" description="Owners, managers and coaches." action={<Badge>{org.staff.length}</Badge>} />
        {org.staff.length ? (
          <div className="table-wrap mt-2">
            <table className="table">
              <thead><tr><th>Name</th><th>Email</th><th>Role</th><th>Status</th><th>Joined</th></tr></thead>
              <tbody>
                {org.staff.map((s) => (
                  <tr key={s.member.id}>
                    <td>{s.user.name}</td>
                    <td className="text-xs">{s.user.email}</td>
                    <td><Badge>{s.member.role}</Badge></td>
                    <td><StatusBadge status={s.member.status} /></td>
                    <td className="text-xs" style={{ color: "var(--muted)" }}>{s.member.joinedAt ? formatDate(s.member.joinedAt) : "—"}</td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        ) : <EmptyState title="No staff" description="This gym has no owner, manager or coach accounts." />}
      </Card>

      <Card className="mt-4">
        <CardHeader title="Locations" />
        {org.locations.length ? (
          <ul className="mt-2 grid gap-2 sm:grid-cols-2">
            {org.locations.map((l) => (
              <li key={l.id} className="subtle p-3 text-sm">
                <p className="font-medium">{l.name} {l.isPrimary ? <Badge tone="accent" className="ml-1">primary</Badge> : null}</p>
                <p className="text-xs" style={{ color: "var(--muted)" }}>{l.address ?? "No address"} · {l.city ?? ""} · {l.timezone}</p>
              </li>
            ))}
          </ul>
        ) : <EmptyState title="No locations" description="This gym has not added a location yet." />}
      </Card>

      <p className="mt-6 text-sm" style={{ color: "var(--muted)" }}>
        <Link href="/admin/audit" className="underline">View this gym&apos;s audit trail</Link> · Tenant data is visible to platform staff for support only.
      </p>
    </>
  );
}
