import Link from "next/link";
import { ArrowUpRight } from "lucide-react";
import { SiteFooter, SiteHeader } from "@/components/site-chrome";
import { db } from "@/db/client";
import { saasPlans } from "@/db/schema";
import { Money } from "@/components/ui/primitives";
import { env } from "@/lib/env";

export const metadata = {
  title: "MMA OS — Run the room. Track the work.",
  description:
    "Memberships, invoices, class bookings, attendance, coach notes and fight camps for MMA gyms. One system for the front desk, the coaches and the fighters.",
};

const entries = [
  {
    n: "01",
    title: "Front desk",
    body: "Member directory with real search, plans with terms, pause and resume, cancellations, family accounts, CSV import.",
    tag: "members",
  },
  {
    n: "02",
    title: "Money",
    body: "Recurring invoices, payments, refunds, failed-payment recovery and a revenue view that matches the bank. Stripe in production, sandbox in dev.",
    tag: "billing",
  },
  {
    n: "03",
    title: "The mats",
    body: "Recurring schedules, capacity, waitlists and plan-aware booking rules. QR check-in at the door, no-shows tracked for you.",
    tag: "classes",
  },
  {
    n: "04",
    title: "Fighters",
    body: "Training log in seconds, weekly volume, attendance history, fight record and camps with phases, checklists and readiness check-ins.",
    tag: "athletes",
  },
  {
    n: "05",
    title: "Coaches",
    body: "Every coach owns a list of athletes. They see those fighters and nothing else — no cross-gym, no cross-coach leakage.",
    tag: "coaching",
  },
  {
    n: "06",
    title: "The platform",
    body: "Multi-tenant by construction, hash-chained audit log, rate limits, TOTP for admins, GDPR export and deletion requests.",
    tag: "security",
  },
];

const audiences = [
  {
    role: "Gym owner",
    line: "Know what you actually collected this month, and who is about to stop paying.",
    points: ["Revenue and churn from live data", "Staff roles that match the org chart", "Export anything, anytime"],
  },
  {
    role: "Coach",
    line: "Your athletes, their week, their camps. Notes that stay where you left them.",
    points: ["Only your assigned fighters", "Log sessions from the corner", "Camp plans and readiness"],
  },
  {
    role: "Fighter",
    line: "Next session, this week's training, your membership. Nothing else in the way.",
    points: ["Book and cancel in two taps", "Check in with a QR code", "Progress you can read on a phone"],
  },
];

export default async function LandingPage() {
  const plans = await db
    .select()
    .from(saasPlans)
    .orderBy(saasPlans.sortOrder)
    .catch(() => []);

  return (
    <div className="flex min-h-dvh flex-col">
      <SiteHeader />

      <main id="main" className="flex-1">
        {/* Demo strip — tells reviewers exactly what this deployment is. */}
        {env.demoSeed ? (
          <div className="border-b" style={{ borderColor: "var(--line)" }}>
            <div className="eyebrow mx-auto flex max-w-[1180px] flex-wrap items-center gap-x-3 gap-y-1 px-5 py-2">
              <span className="flex items-center gap-1.5" style={{ color: "var(--accent)" }}>
                <span className="h-1.5 w-1.5" style={{ background: "var(--accent)" }} aria-hidden />
                demo build
              </span>
              <span>owner@demo.mma</span>
              <span aria-hidden style={{ color: "var(--line-strong)" }}>
                /
              </span>
              <span>demo1234</span>
              <span className="ml-auto hidden sm:block">synthetic data · payments in test mode</span>
            </div>
          </div>
        ) : null}

        {/* Hero */}
        <section className="border-b" style={{ borderColor: "var(--line)" }}>
          <div className="mx-auto max-w-[1180px] px-5 pb-14 pt-12 sm:pt-20 lg:pb-20">
            <div className="grid gap-12 lg:grid-cols-12 lg:gap-10">
              <div className="lg:col-span-8">
                <p className="eyebrow">Gym operating system</p>
                <h1 className="display mt-4 text-[clamp(2.9rem,8.4vw,6.4rem)]">
                  Run the room.
                  <br />
                  Track the work.
                </h1>
                <p className="mt-6 max-w-xl text-base leading-relaxed sm:text-[1.0625rem]" style={{ color: "var(--muted)" }}>
                  Memberships, invoices, class bookings, attendance, coach notes and fight camps in one system.
                  It still makes sense at 21:40 on a Friday, when the front desk is three people deep and the
                  last class hasn&apos;t started.
                </p>
                <div className="mt-9 flex flex-wrap items-center gap-x-7 gap-y-4">
                  <Link href="/login" className="btn btn-primary btn-lg">
                    Open the demo
                    <ArrowUpRight className="h-4 w-4" />
                  </Link>
                  <Link href="/register" className="arrow-link text-sm">
                    Start a gym account
                  </Link>
                </div>
                <p className="eyebrow mt-7">14 days free · no card · member import included</p>
              </div>

              <aside className="lg:col-span-4 lg:pl-8">
                <p className="eyebrow">Sign in as</p>
                <ul className="mt-3">
                  {[
                    { n: "01", title: "Gym console", note: "owner@demo.mma", href: "/login" },
                    { n: "02", title: "Coach desk", note: "coach@demo.mma", href: "/login" },
                    { n: "03", title: "Athlete app", note: "fighter@demo.mma", href: "/login" },
                    { n: "04", title: "Platform admin", note: "super admin", href: "/admin/login" },
                  ].map((item) => (
                    <li key={item.n} className="rule-top">
                      <Link href={item.href} className="ledger-row group flex items-baseline gap-3 py-3 pl-3">
                        <span className="mono text-[0.68rem]" style={{ color: "var(--accent)" }}>
                          {item.n}
                        </span>
                        <span className="min-w-0 flex-1">
                          <span className="block text-sm font-semibold">{item.title}</span>
                          <span className="mono block text-[0.7rem]" style={{ color: "var(--muted)" }}>
                            {item.note}
                          </span>
                        </span>
                        <ArrowUpRight
                          className="h-3.5 w-3.5 shrink-0 opacity-30 transition-opacity group-hover:opacity-100"
                          aria-hidden
                        />
                      </Link>
                    </li>
                  ))}
                </ul>
                <p className="mono mt-4 text-[0.68rem] leading-relaxed" style={{ color: "var(--muted)" }}>
                  Password for all three demo accounts: <span style={{ color: "var(--ink)" }}>demo1234</span>
                </p>
              </aside>
            </div>
          </div>
        </section>

        {/* What is inside — a ledger, not a card grid. */}
        <section className="border-b" style={{ borderColor: "var(--line)" }}>
          <div className="mx-auto max-w-[1180px] px-5 py-14 sm:py-20">
            <div className="flex flex-wrap items-baseline justify-between gap-3">
              <h2 className="display text-[clamp(1.75rem,4vw,2.75rem)]">What&apos;s inside</h2>
              <p className="eyebrow">Six areas · one login</p>
            </div>
            <ul className="mt-8">
              {entries.map((entry) => (
                <li key={entry.n} className="rule-top">
                  <div className="ledger-row grid gap-2 py-5 pl-3 sm:grid-cols-12 sm:items-baseline sm:gap-5">
                    <span className="mono text-[0.7rem] sm:col-span-1" style={{ color: "var(--muted)" }}>
                      {entry.n}
                    </span>
                    <h3 className="text-lg font-semibold tracking-tight sm:col-span-3">{entry.title}</h3>
                    <p className="text-sm leading-relaxed sm:col-span-6" style={{ color: "var(--muted)" }}>
                      {entry.body}
                    </p>
                    <span className="mono text-[0.65rem] uppercase tracking-[0.16em] sm:col-span-2 sm:text-right" style={{ color: "var(--muted)" }}>
                      {entry.tag}
                    </span>
                  </div>
                </li>
              ))}
            </ul>
          </div>
        </section>

        {/* Coach ↔ athlete, stated plainly. */}
        <section className="border-b" style={{ borderColor: "var(--line)", background: "var(--surface)" }}>
          <div className="mx-auto grid max-w-[1180px] gap-10 px-5 py-14 sm:py-20 lg:grid-cols-12 lg:gap-12">
            <div className="lg:col-span-6">
              <p className="eyebrow">Coach and athlete</p>
              <h2 className="display mt-4 text-[clamp(1.9rem,4.4vw,3.1rem)]">
                A coach is not a
                <br />
                second admin.
              </h2>
              <p className="mt-5 max-w-lg text-sm leading-relaxed sm:text-base" style={{ color: "var(--muted)" }}>
                The coach–athlete relationship is a real object in the database, not a permission flag. The
                coach is assigned by the gym, the athlete sees who their coach is, and every query is filtered
                by that assignment before it reaches a screen.
              </p>
              <Link href="/login" className="arrow-link mt-7 inline-flex text-sm">
                Try it as coach@demo.mma
              </Link>
            </div>
            <div className="lg:col-span-6">
              <ul className="grid gap-px" style={{ background: "var(--line)" }}>
                {[
                  ["Coach can", "see and edit only their assigned fighters, and write session notes for them"],
                  ["Coach cannot", "open another coach's athlete, another gym, billing or platform settings"],
                  ["Athlete sees", "their coach's name, upcoming sessions, their own log and membership"],
                  ["Owner controls", "who coaches whom, and can reassign an athlete at any time"],
                ].map(([label, text]) => (
                  <li key={label} className="grid gap-1 p-4 sm:grid-cols-[9rem_1fr] sm:gap-4" style={{ background: "var(--bg)" }}>
                    <span className="mono text-[0.65rem] uppercase tracking-[0.14em]" style={{ color: "var(--accent)" }}>
                      {label}
                    </span>
                    <span className="text-sm leading-relaxed">{text}</span>
                  </li>
                ))}
              </ul>
            </div>
          </div>
        </section>

        {/* Who it is for */}
        <section className="border-b" style={{ borderColor: "var(--line)" }}>
          <div className="mx-auto max-w-[1180px] px-5 py-14 sm:py-20">
            <h2 className="display text-[clamp(1.75rem,4vw,2.75rem)]">Three people, one screen each</h2>
            <div className="mt-9 grid gap-8 sm:grid-cols-3 sm:gap-6">
              {audiences.map((audience) => (
                <div key={audience.role} className="rule-top pt-4">
                  <h3 className="text-base font-semibold">{audience.role}</h3>
                  <p className="mt-2 text-sm leading-relaxed" style={{ color: "var(--muted)" }}>
                    {audience.line}
                  </p>
                  <ul className="mt-4 space-y-1.5">
                    {audience.points.map((point) => (
                      <li key={point} className="flex gap-2 text-sm">
                        <span aria-hidden style={{ color: "var(--accent)" }}>
                          —
                        </span>
                        <span>{point}</span>
                      </li>
                    ))}
                  </ul>
                </div>
              ))}
            </div>
          </div>
        </section>

        {/* Pricing as a spec sheet. */}
        <section id="pricing" className="border-b" style={{ borderColor: "var(--line)" }}>
          <div className="mx-auto max-w-[1180px] px-5 py-14 sm:py-20">
            <div className="flex flex-wrap items-baseline justify-between gap-3">
              <h2 className="display text-[clamp(1.75rem,4vw,2.75rem)]">Pricing</h2>
              <p className="eyebrow">Per gym · membership billing stays yours</p>
            </div>
            <div className="mt-8 overflow-x-auto">
              <table className="table min-w-[640px]">
                <thead>
                  <tr>
                    <th scope="col">Plan</th>
                    <th scope="col">Monthly</th>
                    <th scope="col">Yearly</th>
                    <th scope="col">Locations</th>
                    <th scope="col">Coaches</th>
                    <th scope="col">Members</th>
                    <th scope="col" />
                  </tr>
                </thead>
                <tbody>
                  {plans.map((plan) => (
                    <tr key={plan.id}>
                      <td>
                        <span className="block font-semibold">{plan.name}</span>
                        <span className="block text-xs" style={{ color: "var(--muted)" }}>
                          {plan.description}
                        </span>
                      </td>
                      <td className="mono whitespace-nowrap">
                        <Money cents={plan.priceMonthlyCents} currency={plan.currency} />
                      </td>
                      <td className="mono whitespace-nowrap" style={{ color: "var(--muted)" }}>
                        <Money cents={plan.priceAnnualCents} currency={plan.currency} />
                      </td>
                      <td className="mono">{plan.maxLocations}</td>
                      <td className="mono">{plan.maxCoaches}</td>
                      <td className="mono">{plan.maxActiveMembers.toLocaleString("en-GB")}</td>
                      <td className="text-right">
                        <Link href="/register" className="arrow-link text-xs whitespace-nowrap">
                          Start
                        </Link>
                      </td>
                    </tr>
                  ))}
                  {plans.length === 0 ? (
                    <tr>
                      <td colSpan={7} className="text-sm" style={{ color: "var(--muted)" }}>
                        Plans are created by the platform admin.
                      </td>
                    </tr>
                  ) : null}
                </tbody>
              </table>
            </div>
            <p className="mono mt-4 text-[0.7rem]" style={{ color: "var(--muted)" }}>
              14-day trial · cancel anytime · fighters join free through their gym
            </p>
          </div>
        </section>

        {/* Closing */}
        <section>
          <div className="mx-auto max-w-[1180px] px-5 py-16 sm:py-24">
            <div className="grid gap-8 lg:grid-cols-12 lg:items-end">
              <div className="lg:col-span-8">
                <h2 className="display text-[clamp(2.1rem,6vw,4.5rem)]">
                  Book the mat.
                  <br />
                  Get paid. Repeat.
                </h2>
              </div>
              <div className="lg:col-span-4">
                <p className="text-sm leading-relaxed" style={{ color: "var(--muted)" }}>
                  Two synthetic gyms, nineteen members, live invoices and a fight camp in progress are waiting
                  in the demo. Poke at anything.
                </p>
                <div className="mt-5 flex flex-wrap items-center gap-x-6 gap-y-3">
                  <Link href="/login" className="btn btn-primary">
                    Open the demo
                    <ArrowUpRight className="h-4 w-4" />
                  </Link>
                  <Link href="/features" className="arrow-link text-sm">
                    Every feature
                  </Link>
                </div>
              </div>
            </div>
          </div>
        </section>
      </main>

      <SiteFooter />
    </div>
  );
}
