import Link from "next/link";
import { ArrowUpRight } from "lucide-react";
import { SiteFooter, SiteHeader } from "@/components/site-chrome";

export const metadata = { title: "Features" };

const groups = [
  {
    n: "01",
    title: "Gym operations",
    items: [
      ["Member directory", "Instant search, filters by plan, status, payment and location, CSV import/export and archiving."],
      ["Membership plans", "Unlimited, limited, credits, trials, kids, team and one-time passes with full terms."],
      ["Membership lifecycle", "Activate, pause with period extension, resume, extend, plan change and scheduled cancellation."],
      ["Locations and staff", "Multiple branches, per-location plans, manager permissions and coach assignments."],
      ["Attendance", "Self, staff and QR check-in with duplicate and replay protection."],
      ["Communication", "Announcements and direct coach-to-fighter messages."],
    ],
  },
  {
    n: "02",
    title: "Fighters and coaches",
    items: [
      ["Fighter home", "Next session, fight countdown, weekly volume and one-tap training log."],
      ["Training log", "Type, duration, intensity, RPE and notes — in seconds."],
      ["Progress", "Volume trends, attendance history, goals and coach-assigned programs."],
      ["Fight camps", "Phased camps, checklists, readiness check-ins and coach notes."],
      ["Fight records", "Amateur and pro records, with verified badges only when a coach confirms."],
      ["Coach dashboard", "Today's classes, your athletes, camps, attendance and notes — scoped to your roster."],
    ],
  },
  {
    n: "03",
    title: "Billing and platform",
    items: [
      ["Membership billing", "Recurring invoices, sandbox payments in dev, Stripe in production, refunds and idempotent webhooks."],
      ["SaaS plans", "Starter, Pro and Elite with backend-enforced location, coach and member limits."],
      ["Super admin", "Gyms, users, subscriptions, payments, analytics, support, settings and audit logs."],
      ["Security", "Argon2id hashing, rate limits, account lockout, MFA, secure sessions and a hash-chained audit trail."],
      ["Privacy", "Consent tracking, data export, deletion requests and retention configuration."],
      ["Multi-tenant", "Every query is scoped to a gym. Cross-gym access is denied and tested."],
    ],
  },
];

export default function FeaturesPage() {
  return (
    <div className="flex min-h-dvh flex-col">
      <SiteHeader />
      <main id="main" className="mx-auto w-full max-w-[1180px] flex-1 px-5 py-12 sm:py-16">
        <p className="eyebrow">Everything in the build</p>
        <h1 className="display mt-4 text-[clamp(2.2rem,6vw,4rem)]">
          Features
        </h1>
        <p className="mt-5 max-w-2xl text-base leading-relaxed" style={{ color: "var(--muted)" }}>
          An honest list. Everything below is implemented in this codebase — with database persistence,
          authorization on the server and tests behind it. If it is on this page, you can click it in the demo.
        </p>

        <div className="mt-12 space-y-14">
          {groups.map((group) => (
            <section key={group.n}>
              <div className="rule-top flex items-baseline gap-3 pt-3">
                <span className="mono text-[0.7rem]" style={{ color: "var(--accent)" }}>
                  {group.n}
                </span>
                <h2 className="text-lg font-semibold tracking-tight">{group.title}</h2>
                <span className="eyebrow ml-auto">{group.items.length} areas</span>
              </div>
              <ul className="mt-2">
                {group.items.map(([title, body]) => (
                  <li key={title}>
                    <div className="ledger-row grid gap-1 py-4 pl-3 sm:grid-cols-12 sm:gap-5">
                      <h3 className="text-sm font-semibold sm:col-span-4">{title}</h3>
                      <p className="text-sm leading-relaxed sm:col-span-8" style={{ color: "var(--muted)" }}>
                        {body}
                      </p>
                    </div>
                  </li>
                ))}
              </ul>
            </section>
          ))}
        </div>

        <div className="rule-top mt-14 flex flex-wrap items-center justify-between gap-4 pt-6">
          <p className="display text-[clamp(1.4rem,3.4vw,2.2rem)]">See it on the mats</p>
          <Link href="/login" className="arrow-link text-sm">
            Open the demo
            <ArrowUpRight className="h-4 w-4" aria-hidden />
          </Link>
        </div>
      </main>
      <SiteFooter />
    </div>
  );
}
