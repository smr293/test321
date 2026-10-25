import Link from "next/link";
import { ArrowUpRight } from "lucide-react";
import { SiteFooter, SiteHeader } from "@/components/site-chrome";
import { db } from "@/db/client";
import { saasPlans } from "@/db/schema";
import { Money } from "@/components/ui/primitives";

export const metadata = { title: "Pricing" };

export default async function PricingPage() {
  const plans = await db.select().from(saasPlans).orderBy(saasPlans.sortOrder).catch(() => []);
  const rows = [
    { label: "Locations", value: (p: (typeof plans)[number]) => String(p.maxLocations) },
    { label: "Coaches", value: (p: (typeof plans)[number]) => String(p.maxCoaches) },
    { label: "Active members", value: (p: (typeof plans)[number]) => p.maxActiveMembers.toLocaleString("en-GB") },
  ];

  return (
    <div className="flex min-h-dvh flex-col">
      <SiteHeader />
      <main id="main" className="mx-auto w-full max-w-[1180px] flex-1 px-5 py-12 sm:py-16">
        <p className="eyebrow">Per gym, per month</p>
        <h1 className="display mt-4 text-[clamp(2.2rem,6vw,4rem)]">
          Pricing
        </h1>
        <p className="mt-5 max-w-2xl text-base leading-relaxed" style={{ color: "var(--muted)" }}>
          Membership billing is always separate from your MMA OS subscription, and we never take a cut of it.
          Fighters join free through their gym.
        </p>

        <div className="mt-10 overflow-x-auto">
          <table className="table min-w-[720px]">
            <thead>
              <tr>
                <th scope="col">Plan</th>
                {plans.map((plan) => (
                  <th key={plan.id} scope="col" className="whitespace-nowrap">
                    {plan.name}
                  </th>
                ))}
              </tr>
            </thead>
            <tbody>
              <tr>
                <td style={{ color: "var(--muted)" }}>Monthly</td>
                {plans.map((plan) => (
                  <td key={plan.id} className="mono whitespace-nowrap text-base">
                    <Money cents={plan.priceMonthlyCents} currency={plan.currency} />
                  </td>
                ))}
              </tr>
              <tr>
                <td style={{ color: "var(--muted)" }}>Yearly</td>
                {plans.map((plan) => (
                  <td key={plan.id} className="mono whitespace-nowrap">
                    <Money cents={plan.priceAnnualCents} currency={plan.currency} />
                  </td>
                ))}
              </tr>
              {rows.map((row) => (
                <tr key={row.label}>
                  <td style={{ color: "var(--muted)" }}>{row.label}</td>
                  {plans.map((plan) => (
                    <td key={plan.id} className="mono">
                      {row.value(plan)}
                    </td>
                  ))}
                </tr>
              ))}
              <tr>
                <td style={{ color: "var(--muted)" }}>What you get</td>
                {plans.map((plan) => (
                  <td key={plan.id} className="text-sm" style={{ color: "var(--muted)" }}>
                    {plan.description}
                  </td>
                ))}
              </tr>
              <tr>
                <td />
                {plans.map((plan) => (
                  <td key={plan.id}>
                    <Link href="/register" className="arrow-link text-xs whitespace-nowrap">
                      Start 14-day trial
                    </Link>
                  </td>
                ))}
              </tr>
            </tbody>
          </table>
        </div>

        <div className="mt-12 grid gap-8 sm:grid-cols-2">
          <div className="rule-top pt-4">
            <h2 className="text-base font-semibold">Fighters</h2>
            <p className="mt-2 text-sm leading-relaxed" style={{ color: "var(--muted)" }}>
              Fighter accounts are free while your gym is on MMA OS. Individual plans exist for unaffiliated
              athletes — ask and we will set one up.
            </p>
          </div>
          <div className="rule-top pt-4">
            <h2 className="text-base font-semibold">Not sure yet?</h2>
            <p className="mt-2 text-sm leading-relaxed" style={{ color: "var(--muted)" }}>
              The demo has two full gyms with members, invoices and a camp in progress. No signup required.
            </p>
            <Link href="/login" className="arrow-link mt-4 inline-flex text-sm">
              Open the demo
              <ArrowUpRight className="h-4 w-4" aria-hidden />
            </Link>
          </div>
        </div>

        {!plans.length ? (
          <p className="mono mt-8 text-[0.7rem]" style={{ color: "var(--muted)" }}>
            Plans are created by the platform administrator.
          </p>
        ) : null}
      </main>
      <SiteFooter />
    </div>
  );
}
