import Link from "next/link";
import { redirect } from "next/navigation";
import { and, desc, eq, sql } from "drizzle-orm";
import { Download, KeyRound, LogOut, MessageSquare, Shield, ShieldCheck, Trash2 } from "lucide-react";
import { db } from "@/db/client";
import { consents, fighterProfiles, orgMembers, organizations, users } from "@/db/schema";
import { Avatar, Badge, ButtonLink, Callout, Card, CardHeader, Divider, Field, Input, KeyValue, PageHeader, Select, StatusBadge, Textarea } from "@/components/ui/primitives";
import { ConfirmSubmit, SubmitButton, ThemeToggle } from "@/components/ui/client";
import { getAuth, getOrgContext } from "@/lib/authz";
import { logoutAction } from "@/lib/actions/auth";
import { saveNotificationPrefsAction } from "@/lib/actions/prefs";
import {
  recordConsentsAction,
  requestAccountDeletionAction,
  requestDataExportAction,
  updateFighterProfileAction,
  updateMyAccountAction,
} from "@/lib/actions/fighter";
import { getPreferences } from "@/lib/notifications";
import { formatDate } from "@/lib/utils";

export const metadata = { title: "Profile" };

export default async function ProfilePage() {
  const auth = await getAuth();
  if (!auth) redirect("/login?next=/app/profile");
  const ctx = await getOrgContext();
  const prefs = await getPreferences(auth.user.id);
  const profile = ctx?.membership
    ? (await db.select().from(fighterProfiles).where(eq(fighterProfiles.memberId, ctx.membership.id)).limit(1))[0]
    : undefined;
  const myConsents = await db.select().from(consents).where(eq(consents.userId, auth.user.id));
  const consentFor = (type: string) => myConsents.find((c) => c.type === type)?.granted ?? false;
  const memberships = await db
    .select({ member: orgMembers, org: organizations })
    .from(orgMembers)
    .innerJoin(organizations, eq(organizations.id, orgMembers.orgId))
    .where(eq(orgMembers.userId, auth.user.id));

  return (
    <div className="space-y-4">
      <PageHeader title="Profile" description="Your details, membership, notifications and privacy." />

      <Card>
        <div className="flex items-center gap-3">
          <Avatar name={auth.user.name} src={auth.user.avatarUrl} size={52} />
          <div className="min-w-0">
            <p className="font-semibold">{auth.user.name}</p>
            <p className="truncate text-sm" style={{ color: "var(--muted)" }}>{auth.user.email}</p>
            {ctx ? <Badge className="mt-1">{ctx.org.name} · {ctx.membership?.role}</Badge> : null}
          </div>
          <div className="ml-auto flex items-center gap-1">
            <ThemeToggle initialTheme={auth.user.theme} />
            <form action={logoutAction}><button type="submit" className="btn btn-ghost btn-sm" aria-label="Sign out"><LogOut className="h-4 w-4" /></button></form>
          </div>
        </div>
        <div className="mt-3 flex flex-wrap gap-2">
          <ButtonLink href="/app/membership" variant="secondary" size="sm">Membership</ButtonLink>
          <ButtonLink href="/app/billing" variant="secondary" size="sm">Billing</ButtonLink>
          <ButtonLink href="/app/messages" variant="secondary" size="sm"><MessageSquare className="h-3.5 w-3.5" /> Messages</ButtonLink>
          <ButtonLink href="/settings/security" variant="secondary" size="sm"><KeyRound className="h-3.5 w-3.5" /> Security</ButtonLink>
          <ButtonLink href="/app/support" variant="ghost" size="sm">Support</ButtonLink>
        </div>
      </Card>

      <Card>
        <CardHeader title="Account details" description="Only your gym's staff can see your phone and emergency contact." />
        <form action={updateMyAccountAction} className="mt-3 grid gap-3 sm:grid-cols-2">
          <Field label="Name"><Input name="name" defaultValue={auth.user.name} required /></Field>
          <Field label="Phone"><Input name="phone" defaultValue={auth.user.phone ?? ""} /></Field>
          <Field label="Date of birth"><Input name="dateOfBirth" type="date" defaultValue={auth.user.dateOfBirth?.toISOString().slice(0, 10) ?? ""} /></Field>
          <Field label="Address"><Input name="address" defaultValue={auth.user.address ?? ""} /></Field>
          <Field label="Emergency contact"><Input name="emergencyContactName" defaultValue={auth.user.emergencyContactName ?? ""} /></Field>
          <Field label="Emergency phone"><Input name="emergencyContactPhone" defaultValue={auth.user.emergencyContactPhone ?? ""} /></Field>
          <div className="sm:col-span-2"><SubmitButton>Save details</SubmitButton></div>
        </form>
      </Card>

      {ctx?.membership ? (
        <Card>
          <CardHeader title="Fighter profile" description="Used for fight camps and matchmaking notes." />
          <form action={updateFighterProfileAction} className="mt-3 grid gap-3 sm:grid-cols-2">
            <Field label="Nickname"><Input name="nickname" defaultValue={profile?.nickname ?? ""} /></Field>
            <Field label="Discipline"><Input name="discipline" defaultValue={profile?.discipline ?? ""} /></Field>
            <Field label="Weight class"><Input name="weightClass" defaultValue={profile?.weightClass ?? ""} /></Field>
            <Field label="Stance">
              <Select name="stance" defaultValue={profile?.stance ?? "Orthodox"}>
                <option value="Orthodox">Orthodox</option><option value="Southpaw">Southpaw</option><option value="Switch">Switch</option>
              </Select>
            </Field>
            <Field label="Current weight (kg)"><Input name="currentWeightKg" type="number" step="0.1" defaultValue={profile?.currentWeightKg ?? ""} /></Field>
            <Field label="Target weight (kg)"><Input name="targetWeightKg" type="number" step="0.1" defaultValue={profile?.targetWeightKg ?? ""} /></Field>
            <Field label="Height (cm)"><Input name="heightCm" type="number" defaultValue={profile?.heightCm ?? ""} /></Field>
            <Field label="Guardian name (if under 18)"><Input name="guardianName" defaultValue={profile?.guardianName ?? ""} /></Field>
            <Field label="Guardian phone"><Input name="guardianPhone" defaultValue={profile?.guardianPhone ?? ""} /></Field>
            <Field label="Goals" className="sm:col-span-2"><Textarea name="goals" defaultValue={profile?.goals ?? ""} placeholder="Compete in 2026, train 5x/week…" /></Field>
            <label className="flex items-start gap-2 text-sm sm:col-span-2">
              <input type="checkbox" name="publicProfile" defaultChecked={profile?.publicProfile ?? false} className="mt-0.5 h-4 w-4 accent-[var(--accent)]" />
              <span>
                Make my fighter profile public (name and verified record only).
                <span className="block text-xs" style={{ color: "var(--muted)" }}>Off by default. You can turn this off at any time.</span>
              </span>
            </label>
            <div className="sm:col-span-2"><SubmitButton>Save fighter profile</SubmitButton></div>
          </form>
        </Card>
      ) : null}

      <Card>
        <CardHeader title="Your gyms" description="You can belong to more than one gym." />
        <div className="mt-2 space-y-2">
          {memberships.map((m) => (
            <div key={m.member.id} className="subtle flex items-center justify-between gap-2 p-2.5 text-sm">
              <div>
                <p className="font-medium">{m.org.name}</p>
                <p className="text-xs" style={{ color: "var(--muted)" }}>{m.member.role} · joined {formatDate(m.member.joinedAt ?? m.member.createdAt)}</p>
              </div>
              {ctx?.org.id === m.org.id ? <Badge tone="accent">active</Badge> : <span className="text-xs" style={{ color: "var(--muted)" }}>Switch from the gym code below</span>}
            </div>
          ))}
        </div>
        <Divider />
        <form method="get" action="/app/onboarding" className="flex gap-2">
          <button type="submit" className="btn btn-secondary btn-sm">Join another gym</button>
        </form>
      </Card>

      <Card>
        <CardHeader title="Notifications" description="Choose what you want to hear about." />
        <form action={saveNotificationPrefsAction} className="mt-2 space-y-1">
          {[
            ["classReminders", "Class reminders", prefs.classReminders],
            ["membershipReminders", "Membership and renewal reminders", prefs.membershipReminders],
            ["paymentNotifications", "Payment and invoice updates", prefs.paymentNotifications],
            ["fightCampReminders", "Fight camp reminders", prefs.fightCampReminders],
            ["announcements", "Gym announcements", prefs.announcements],
            ["productUpdates", "MMA OS product updates", prefs.productUpdates],
            ["emailEnabled", "Also send me email", prefs.emailEnabled],
          ].map(([name, label, checked]) => (
            <label key={String(name)} className="flex items-center justify-between gap-3 rounded-lg px-2 py-2 text-sm hover:bg-[var(--card-2)]">
              <span>{label}</span>
              <input type="checkbox" name={String(name)} defaultChecked={Boolean(checked)} className="h-4 w-4 accent-[var(--accent)]" />
            </label>
          ))}
          <div className="pt-2"><SubmitButton size="sm">Save preferences</SubmitButton></div>
        </form>
      </Card>

      <Card>
        <CardHeader title="Consents & privacy" description="You control what your gym can use." />
        <form action={recordConsentsAction} className="mt-2 space-y-1">
          {[
            ["terms", "Terms of service", consentFor("terms")],
            ["privacy", "Privacy policy (required to use MMA OS)", consentFor("privacy")],
            ["photo", "Photos and video for gym social media", consentFor("photo")],
            ["marketing", "Marketing emails", consentFor("marketing")],
          ].map(([key, label, checked]) => (
            <label key={String(key)} className="flex items-center justify-between gap-3 rounded-lg px-2 py-2 text-sm hover:bg-[var(--card-2)]">
              <span>{label}</span>
              <input type="checkbox" name={String(key)} defaultChecked={Boolean(checked)} className="h-4 w-4 accent-[var(--accent)]" />
            </label>
          ))}
          <div className="pt-2"><SubmitButton size="sm" variant="secondary">Save consents</SubmitButton></div>
        </form>
        <Divider />
        <div className="flex flex-wrap gap-2">
          <form action={requestDataExportAction}>
            <SubmitButton size="sm" variant="secondary"><Download className="h-3.5 w-3.5" /> Export my data</SubmitButton>
          </form>
          <form action={requestAccountDeletionAction}>
            <ConfirmSubmit message="Request deletion of your account? Your gym will need to process membership obligations first.">
              <Trash2 className="h-3.5 w-3.5" /> Request account deletion
            </ConfirmSubmit>
          </form>
        </div>
        <p className="mt-2 text-xs" style={{ color: "var(--muted)" }}>
          Deletion requests are reviewed to keep billing and legal records accurate. You'll be signed out immediately.
        </p>
      </Card>

      <p className="flex items-center gap-2 text-xs" style={{ color: "var(--muted)" }}>
        <Shield className="h-3.5 w-3.5" /> Your data is only visible to you and the staff of your gym.
        <ShieldCheck className="h-3.5 w-3.5" /> Sessions expire automatically.
      </p>
    </div>
  );
}
