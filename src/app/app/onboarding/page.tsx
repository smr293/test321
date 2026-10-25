import Link from "next/link";
import { redirect } from "next/navigation";
import { and, eq } from "drizzle-orm";
import { Dumbbell, Users } from "lucide-react";
import { db } from "@/db/client";
import { organizations } from "@/db/schema";
import { Card, CardHeader, Callout, Field, Input, PageHeader, Select, Textarea, Badge } from "@/components/ui/primitives";
import { SubmitButton } from "@/components/ui/client";
import { getAuth, getOrgContext } from "@/lib/authz";
import { joinGymAction } from "@/lib/actions/gym";
import { completeFighterOnboardingAction } from "@/lib/actions/fighter";

export const metadata = { title: "Get started" };

export default async function FighterOnboardingPage() {
  const auth = await getAuth();
  if (!auth) redirect("/login?next=/app/onboarding");
  const ctx = await getOrgContext();
  const gyms = await db.select({ name: organizations.name, slug: organizations.slug }).from(organizations).where(eq(organizations.status, "active")).limit(20);

  return (
    <div className="space-y-4">
      <div className="text-center">
        <span className="badge badge-accent mx-auto"><Dumbbell className="h-3 w-3" /> Welcome to MMA OS</span>
        <h1 className="mt-3 text-2xl font-semibold tracking-tight">Let&apos;s get you training</h1>
        <p className="mt-1 text-sm" style={{ color: "var(--muted)" }}>Two quick steps. You can fill in the rest later.</p>
      </div>

      {ctx?.membership ? (
        <Card>
          <CardHeader title="Step 2 · Your fighter profile" description="Optional, but helps your coach plan your camp." />
          <form action={completeFighterOnboardingAction} className="mt-3 grid gap-3 sm:grid-cols-2">
            <Field label="Phone"><Input name="phone" defaultValue={auth.user.phone ?? ""} /></Field>
            <Field label="Date of birth"><Input name="dateOfBirth" type="date" defaultValue={auth.user.dateOfBirth?.toISOString().slice(0, 10) ?? ""} /></Field>
            <Field label="Main discipline">
              <Select name="discipline" defaultValue="MMA">
                {["MMA", "BJJ", "Muay Thai", "Boxing", "Wrestling", "Strength"].map((d) => <option key={d}>{d}</option>)}
              </Select>
            </Field>
            <Field label="Weight class"><Input name="weightClass" placeholder="Lightweight" /></Field>
            <Field label="Current weight (kg)"><Input name="currentWeightKg" type="number" step="0.1" /></Field>
            <Field label="Goals" className="sm:col-span-2"><Textarea name="goals" placeholder="What do you want to achieve this year?" /></Field>
            <div className="sm:col-span-2"><SubmitButton>Finish and open my dashboard</SubmitButton></div>
          </form>
        </Card>
      ) : (
        <>
          <Card>
            <CardHeader title="Step 1 · Join your gym" description="Ask your gym for the gym code, or use an invite link from your email." />
            <form action={joinGymAction} className="mt-3 space-y-3">
              <Field label="Gym code" hint="Looks like nordic-fight-lab">
                <Input name="gymCode" required placeholder="nordic-fight-lab" autoCapitalize="none" />
              </Field>
              <SubmitButton><Users className="h-4 w-4" /> Join gym</SubmitButton>
            </form>
            {gyms.length ? (
              <div className="mt-3">
                <p className="text-xs font-semibold uppercase tracking-wide" style={{ color: "var(--muted)" }}>Gyms on MMA OS</p>
                <div className="mt-2 flex flex-wrap gap-1.5">
                  {gyms.map((g) => <Badge key={g.slug}>{g.name}</Badge>)}
                </div>
              </div>
            ) : null}
          </Card>
          <Callout tone="info">
            Don&apos;t have a code?{" "}
            <Link href="/app/support" className="underline">Contact support</Link> and we&apos;ll help you find your gym.
          </Callout>
        </>
      )}

      <p className="text-center text-xs" style={{ color: "var(--muted)" }}>
        <Link href="/app/profile" className="underline">Profile settings</Link> · <Link href="/logout" className="underline">Sign out</Link>
      </p>
    </div>
  );
}
