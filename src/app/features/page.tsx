import { CheckCircle2 } from "lucide-react";
import { SiteFooter, SiteHeader } from "@/components/site-chrome";
import { Card } from "@/components/ui/primitives";

export const metadata = { title: "Features" };

const groups = [
  {
    title: "Gym operations",
    items: [
      ["Member directory", "Instant search, filters by plan, status, payment and location, CSV import/export and archiving."],
      ["Membership plans", "Unlimited, limited, credits, trials, kids, team and one-time passes with full terms."],
      ["Membership lifecycle", "Activate, pause (with period extension), resume, extend, plan change and scheduled cancellation."],
      ["Locations & staff", "Multiple branches, per-location plans, manager permissions and coach assignments."],
      ["Attendance", "Self, staff and QR check-in with duplicate and replay protection."],
      ["Communication", "Announcements and direct coach-to-fighter messages."],
    ],
  },
  {
    title: "Fighters & coaches",
    items: [
      ["Fighter home", "Next session, fight countdown, weekly volume and one-tap training log."],
      ["Training log", "Type, duration, intensity, RPE and notes — in seconds."],
      ["Progress", "Volume trends, attendance history, goals and coach-assigned programs."],
      ["Fight camps", "Phased camps, checklists, readiness check-ins and coach notes."],
      ["Fight records", "Amateur and pro records, with verified badges only when a coach confirms."],
      ["Coach dashboard", "Today's classes, your athletes, camps, attendance and notes."],
    ],
  },
  {
    title: "Billing & platform",
    items: [
      ["Membership billing", "Recurring invoices, sandbox payments in dev, Stripe in production, refunds and idempotent webhooks."],
      ["SaaS plans", "Starter, Pro and Elite with backend-enforced location, coach and member limits."],
      ["Super admin", "Gyms, users, subscriptions, payments, analytics, support, settings and audit logs."],
      ["Security", "Argon2id hashing, rate limits, account lockout, MFA, secure sessions and hash-chained audit trail."],
      ["Privacy", "Consent tracking, data export, deletion requests and retention configuration."],
      ["Multi-tenant", "Every query is scoped to a gym. Cross-gym access is denied and tested."],
    ],
  },
];

export default function FeaturesPage() {
  return (
    <div>
      <SiteHeader />
      <main id="main" className="mx-auto max-w-6xl px-5 py-16">
        <h1 className="text-3xl font-semibold tracking-tight sm:text-4xl">Everything in MMA OS</h1>
        <p className="mt-2 max-w-2xl text-sm leading-relaxed" style={{ color: "var(--muted)" }}>
          Honest list: everything below is implemented in the app, with database persistence, authorization and tests.
        </p>
        <div className="mt-10 space-y-10">
          {groups.map((group) => (
            <section key={group.title}>
              <h2 className="text-lg font-semibold">{group.title}</h2>
              <div className="mt-4 grid gap-3 sm:grid-cols-2 lg:grid-cols-3">
                {group.items.map(([title, body]) => (
                  <Card key={title}>
                    <div className="flex items-start gap-2">
                      <CheckCircle2 className="mt-0.5 h-4 w-4 shrink-0" style={{ color: "var(--accent)" }} />
                      <div>
                        <h3 className="text-sm font-semibold">{title}</h3>
                        <p className="mt-1 text-sm leading-relaxed" style={{ color: "var(--muted)" }}>{body}</p>
                      </div>
                    </div>
                  </Card>
                ))}
              </div>
            </section>
          ))}
        </div>
      </main>
      <SiteFooter />
    </div>
  );
}
