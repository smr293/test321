import { CheckCircle2 } from "lucide-react";
import { SiteFooter, SiteHeader } from "@/components/site-chrome";
import { ButtonLink, Card } from "@/components/ui/primitives";
import { db } from "@/db/client";
import { saasPlans } from "@/db/schema";
import { Money } from "@/components/ui/primitives";

export const metadata = { title: "Pricing" };

export default async function PricingPage() {
  const plans = await db.select().from(saasPlans).orderBy(saasPlans.sortOrder).catch(() => []);
  return (
    <div>
      <SiteHeader />
      <main id="main" className="mx-auto max-w-6xl px-5 py-16">
        <h1 className="text-3xl font-semibold tracking-tight sm:text-4xl">Pricing that scales with the gym</h1>
        <p className="mt-2 max-w-2xl text-sm" style={{ color: "var(--muted)" }}>
          Billing for gym memberships is always separate from your MMA OS subscription. We never take a cut of
          membership revenue.
        </p>
        <div className="mt-10 grid gap-4 md:grid-cols-3">
          {plans.map((plan) => {
            const features = JSON.parse(plan.features || "[]") as string[];
            return (
              <Card key={plan.id} className={plan.slug === "pro" ? "glow" : undefined}>
                <h2 className="text-lg font-semibold">{plan.name}</h2>
                <p className="mt-1 min-h-10 text-sm" style={{ color: "var(--muted)" }}>{plan.description}</p>
                <p className="mt-4 flex items-baseline gap-1">
                  <span className="stat-value text-3xl"><Money cents={plan.priceMonthlyCents} currency={plan.currency} /></span>
                  <span className="text-sm" style={{ color: "var(--muted)" }}>/ month</span>
                </p>
                <p className="mt-1 text-xs" style={{ color: "var(--muted)" }}>
                  or <Money cents={plan.priceAnnualCents} currency={plan.currency} /> / year
                </p>
                <ul className="mt-4 space-y-2 text-sm">
                  <li className="flex gap-2"><CheckCircle2 className="h-4 w-4" style={{ color: "var(--accent)" }} />{plan.maxLocations} location{plan.maxLocations > 1 ? "s" : ""}</li>
                  <li className="flex gap-2"><CheckCircle2 className="h-4 w-4" style={{ color: "var(--accent)" }} />Up to {plan.maxCoaches} coaches</li>
                  <li className="flex gap-2"><CheckCircle2 className="h-4 w-4" style={{ color: "var(--accent)" }} />{plan.maxActiveMembers.toLocaleString("en-GB")} active members</li>
                  {features.filter((f) => !["members", "plans"].includes(f)).map((f) => (
                    <li key={f} className="flex gap-2"><CheckCircle2 className="h-4 w-4" style={{ color: "var(--accent)" }} />{f.replace(/_/g, " ")}</li>
                  ))}
                </ul>
                <ButtonLink href="/register" variant={plan.slug === "pro" ? "primary" : "secondary"} className="mt-5 w-full">
                  Start 14-day trial
                </ButtonLink>
              </Card>
            );
          })}
        </div>
        <div className="mt-10 card p-5">
          <h2 className="font-semibold">Fighters</h2>
          <p className="mt-1 text-sm" style={{ color: "var(--muted)" }}>
            Fighter accounts are free when your gym is on MMA OS — you only manage your own training. Individual
            fighter plans are available on request for unaffiliated athletes.
          </p>
        </div>
      </main>
      <SiteFooter />
    </div>
  );
}
