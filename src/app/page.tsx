import Link from "next/link";
import {
  ArrowRight,
  BarChart3,
  CalendarDays,
  CheckCircle2,
  CreditCard,
  Dumbbell,
  ShieldCheck,
  Sparkles,
  Swords,
  Users,
} from "lucide-react";
import { SiteFooter, SiteHeader } from "@/components/site-chrome";
import { db } from "@/db/client";
import { saasPlans } from "@/db/schema";
import { Badge, ButtonLink, Card } from "@/components/ui/primitives";
import { Money } from "@/components/ui/primitives";

export default async function LandingPage() {
  const plans = await db.select().from(saasPlans).orderBy(saasPlans.sortOrder).catch(() => []);
  return (
    <div className="min-h-dvh">
      <SiteHeader />
      <main id="main">
        <section className="relative overflow-hidden border-b">
          <div className="pointer-events-none absolute inset-0 grid-lines opacity-60" aria-hidden />
          <div
            className="pointer-events-none absolute -top-40 left-1/2 h-[420px] w-[820px] -translate-x-1/2 rounded-full blur-3xl"
            style={{ background: "radial-gradient(ellipse, color-mix(in srgb, var(--accent) 14%, transparent), transparent 70%)" }}
            aria-hidden
          />
          <div className="relative mx-auto max-w-6xl px-5 py-20 sm:py-28">
            <div className="mx-auto max-w-3xl text-center">
              <span className="badge badge-accent mx-auto">
                <Sparkles className="h-3 w-3" /> Built for MMA gyms and fighters
              </span>
              <h1 className="mt-5 text-balance text-4xl font-semibold tracking-tight sm:text-6xl">
                Run your gym.
                <br />
                <span style={{ color: "var(--accent)" }}>Train. Fight. Improve.</span>
              </h1>
              <p className="mx-auto mt-5 max-w-2xl text-balance text-base leading-relaxed sm:text-lg" style={{ color: "var(--muted)" }}>
                Memberships, payments, class bookings, attendance, coaching and fight camps — in one calm,
                fast platform your fighters actually understand.
              </p>
              <div className="mt-8 flex flex-wrap items-center justify-center gap-3">
                <ButtonLink href="/register" size="lg">
                  Start free <ArrowRight className="h-4 w-4" />
                </ButtonLink>
                <ButtonLink href="/login" size="lg" variant="secondary">
                  Sign in
                </ButtonLink>
              </div>
              <p className="mt-3 text-xs" style={{ color: "var(--muted)" }}>
                14-day trial · No card required · Import your members in minutes
              </p>
            </div>

            <div className="relative mx-auto mt-14 max-w-5xl">
              <div className="card overflow-hidden p-0">
                <div className="flex items-center gap-2 border-b px-4 py-2.5" style={{ borderColor: "var(--line)" }}>
                  <span className="h-2.5 w-2.5 rounded-full" style={{ background: "#ff5f57" }} />
                  <span className="h-2.5 w-2.5 rounded-full" style={{ background: "#febc2e" }} />
                  <span className="h-2.5 w-2.5 rounded-full" style={{ background: "#28c840" }} />
                  <span className="ml-2 text-xs" style={{ color: "var(--muted)" }}>app.mmaos.com/gym</span>
                </div>
                <div className="grid gap-4 p-4 sm:grid-cols-4 sm:p-6">
                  {[
                    { label: "Active members", value: "148", hint: "+12 this month" },
                    { label: "Monthly revenue", value: "128 420 kr", hint: "96% collected" },
                    { label: "Today's check-ins", value: "37", hint: "4 classes running" },
                    { label: "Fight camps", value: "3", hint: "Next fight in 28 days" },
                  ].map((stat) => (
                    <div key={stat.label} className="subtle p-3">
                      <p className="text-[0.7rem] uppercase tracking-wide" style={{ color: "var(--muted)" }}>{stat.label}</p>
                      <p className="stat-value mt-1 text-xl">{stat.value}</p>
                      <p className="text-[0.7rem]" style={{ color: "var(--accent)" }}>{stat.hint}</p>
                    </div>
                  ))}
                  <div className="subtle col-span-full flex flex-wrap items-center gap-2 p-3">
                    {["MMA Fundamentals 18:00", "BJJ 07:00", "Sparring 12:00", "Kids MMA 16:30"].map((c) => (
                      <span key={c} className="badge">
                        <CalendarDays className="h-3 w-3" /> {c}
                      </span>
                    ))}
                    <span className="badge badge-accent ml-auto">Waitlist 2</span>
                  </div>
                </div>
              </div>
            </div>
          </div>
        </section>

        <section className="mx-auto max-w-6xl px-5 py-20">
          <div className="max-w-2xl">
            <h2 className="text-2xl font-semibold tracking-tight sm:text-3xl">Everything the gym floor needs. Nothing it doesn&apos;t.</h2>
            <p className="mt-2 text-sm leading-relaxed" style={{ color: "var(--muted)" }}>
              One system for the front desk, the coaches and the fighters. No spreadsheets, no double bookings,
              no chasing payments.
            </p>
          </div>
          <div className="mt-8 grid gap-4 sm:grid-cols-2 lg:grid-cols-3">
            {[
              { icon: <Users className="h-5 w-5" />, title: "Member management", body: "Search instantly, see balances, pause or cancel, family accounts and CSV import." },
              { icon: <CreditCard className="h-5 w-5" />, title: "Membership billing", body: "Recurring invoices, failed-payment recovery and a clear revenue view. Sandbox in dev, Stripe in prod." },
              { icon: <CalendarDays className="h-5 w-5" />, title: "Classes & bookings", body: "Recurring schedules, capacity, waitlists and plan-aware booking rules." },
              { icon: <CheckCircle2 className="h-5 w-5" />, title: "Attendance", body: "QR or staff check-in in seconds, no-shows tracked automatically." },
              { icon: <Swords className="h-5 w-5" />, title: "Fight camps", body: "Countdown, phased plans, readiness check-ins and coach notes." },
              { icon: <BarChart3 className="h-5 w-5" />, title: "Real analytics", body: "Membership growth, churn, occupancy and revenue from your live data." },
            ].map((f) => (
              <Card key={f.title} className="transition-colors hover:border-[var(--line-strong)]">
                <span className="flex h-10 w-10 items-center justify-center rounded-xl" style={{ background: "var(--card-2)", color: "var(--accent)" }}>
                  {f.icon}
                </span>
                <h3 className="mt-3 text-base font-semibold">{f.title}</h3>
                <p className="mt-1 text-sm leading-relaxed" style={{ color: "var(--muted)" }}>{f.body}</p>
              </Card>
            ))}
          </div>
        </section>

        <section className="border-y" style={{ background: "var(--surface)" }}>
          <div className="mx-auto grid max-w-6xl gap-8 px-5 py-20 lg:grid-cols-2 lg:items-center">
            <div>
              <Badge tone="accent">Fighter first</Badge>
              <h2 className="mt-3 text-2xl font-semibold tracking-tight sm:text-3xl">A fighter understands it in 30 seconds</h2>
              <p className="mt-3 text-sm leading-relaxed" style={{ color: "var(--muted)" }}>
                Home shows the next session, your fight countdown, this week&apos;s training and your membership.
                Five sections. Big touch targets. Log a session in three taps.
              </p>
              <ul className="mt-5 space-y-2.5 text-sm">
                {[
                  "Book and cancel classes from your phone",
                  "Check in with a QR code at the door",
                  "Log training in seconds — BJJ, 75 min, hard",
                  "Track progress without drowning in charts",
                  "Your membership and invoices in one place",
                ].map((item) => (
                  <li key={item} className="flex items-start gap-2">
                    <CheckCircle2 className="mt-0.5 h-4 w-4 shrink-0" style={{ color: "var(--accent)" }} />
                    <span>{item}</span>
                  </li>
                ))}
              </ul>
            </div>
            <div className="card p-5">
              <p className="text-sm" style={{ color: "var(--muted)" }}>Good evening, Alex.</p>
              <div className="mt-1 flex items-end justify-between">
                <h3 className="text-xl font-semibold">You&apos;re fight ready.</h3>
                <span className="badge badge-accent">28 days</span>
              </div>
              <div className="mt-4 space-y-3">
                <div className="subtle flex items-center justify-between p-3">
                  <div>
                    <p className="text-xs" style={{ color: "var(--muted)" }}>Next training</p>
                    <p className="text-sm font-medium">MMA Advanced · 19:30</p>
                  </div>
                  <span className="badge badge-accent">Booked</span>
                </div>
                <div className="subtle p-3">
                  <div className="flex items-center justify-between text-xs" style={{ color: "var(--muted)" }}>
                    <span>This week</span><span>4 of 5 sessions</span>
                  </div>
                  <div className="mt-2 h-2 overflow-hidden rounded-full" style={{ background: "var(--card)" }}>
                    <div className="h-full rounded-full" style={{ width: "80%", background: "var(--accent)" }} />
                  </div>
                </div>
                <div className="flex gap-2">
                  {["BJJ", "Sparring", "Strength"].map((t) => (
                    <span key={t} className="badge flex-1 justify-center py-2"><Dumbbell className="h-3 w-3" /> {t}</span>
                  ))}
                </div>
              </div>
            </div>
          </div>
        </section>

        <section id="pricing" className="mx-auto max-w-6xl px-5 py-20">
          <div className="text-center">
            <h2 className="text-2xl font-semibold tracking-tight sm:text-3xl">Simple gym pricing</h2>
            <p className="mt-2 text-sm" style={{ color: "var(--muted)" }}>14-day free trial. Cancel anytime. Fighters join free through their gym.</p>
          </div>
          <div className="mt-8 grid gap-4 md:grid-cols-3">
            {plans.map((plan) => (
              <Card key={plan.id} className={plan.slug === "pro" ? "glow relative" : "relative"}>
                {plan.slug === "pro" ? <span className="badge badge-accent absolute right-4 top-4">Most popular</span> : null}
                <h3 className="text-lg font-semibold">{plan.name}</h3>
                <p className="mt-1 min-h-10 text-sm" style={{ color: "var(--muted)" }}>{plan.description}</p>
                <p className="mt-4 flex items-baseline gap-1">
                  <span className="stat-value text-3xl"><Money cents={plan.priceMonthlyCents} currency={plan.currency} /></span>
                  <span className="text-sm" style={{ color: "var(--muted)" }}>/ month</span>
                </p>
                <ul className="mt-4 space-y-2 text-sm">
                  <li className="flex gap-2"><CheckCircle2 className="h-4 w-4 shrink-0" style={{ color: "var(--accent)" }} />{plan.maxLocations} location{plan.maxLocations > 1 ? "s" : ""}</li>
                  <li className="flex gap-2"><CheckCircle2 className="h-4 w-4 shrink-0" style={{ color: "var(--accent)" }} />Up to {plan.maxCoaches} coaches</li>
                  <li className="flex gap-2"><CheckCircle2 className="h-4 w-4 shrink-0" style={{ color: "var(--accent)" }} />{plan.maxActiveMembers.toLocaleString("en-GB")} active members</li>
                  <li className="flex gap-2"><CheckCircle2 className="h-4 w-4 shrink-0" style={{ color: "var(--accent)" }} />All core gym tools</li>
                </ul>
                <ButtonLink href="/register" variant={plan.slug === "pro" ? "primary" : "secondary"} className="mt-5 w-full">
                  Start with {plan.name}
                </ButtonLink>
              </Card>
            ))}
          </div>
        </section>

        <section className="mx-auto max-w-6xl px-5 pb-24">
          <Card className="flex flex-col items-start justify-between gap-4 sm:flex-row sm:items-center">
            <div className="flex items-start gap-3">
              <ShieldCheck className="mt-0.5 h-5 w-5" style={{ color: "var(--accent)" }} />
              <div>
                <p className="font-semibold">Private by default</p>
                <p className="text-sm" style={{ color: "var(--muted)" }}>
                  Strict per-gym data isolation, role-based permissions, audit logs and GDPR tools.
                </p>
              </div>
            </div>
            <ButtonLink href="/features" variant="secondary">See all features</ButtonLink>
          </Card>
        </section>
      </main>
      <SiteFooter />
    </div>
  );
}
