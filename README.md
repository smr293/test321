# MMA OS

**Train. Fight. Improve.** A multi-tenant SaaS for MMA gyms, coaches and fighters: memberships and billing, class scheduling and attendance, fighter training logs, fight camps and records, coach↔athlete relationships, a member-facing portal, and a full platform super-admin console.

- **Stack:** Next.js 15 (App Router) · React 19 · TypeScript · Tailwind v4 · Drizzle ORM + SQLite · Argon2id · Zod · Recharts
- **Design:** mobile-first, dark premium UI with light mode; WCAG 2.2 AA targets (skip link, focus styles, labels, live regions, reduced motion)
- **Security:** tenant isolation on every query, Redis-free rate limiting, TOTP MFA, hash-chained audit log, signed Stripe webhooks, rotating QR check-in tokens

## Quick start

```bash
npm install
cp .env.example .env.local        # dev defaults work out of the box
npm run db:migrate                # apply schema
npm run db:seed                   # optional: realistic demo gyms (also auto-runs on first dev boot)
npm run dev                       # http://localhost:3000
```

First boot in development also creates a platform admin and seeds demo data if the database has no gyms.
For a hosted customer demo set `DEMO_SEED=true` in production — see [docs/DEMO.md](docs/DEMO.md).

### Demo accounts

| Role | Email | Password |
| --- | --- | --- |
| Super admin (dev only) | `admin` (or `admin@mmaos.local`) | `admin` |
| Gym owner | `owner@demo.mma` | `demo1234` |
| Gym manager | `manager@demo.mma` | `demo1234` |
| Coach | `coach@demo.mma` | `demo1234` |
| Fighter | `fighter@demo.mma` | `demo1234` |
| Second tenant owner | `owner@southside.mma` | `demo1234` |
| Second tenant member | `member@southside.mma` | `demo1234` |

The dev admin is **never** created in production; production requires `BOOTSTRAP_ADMIN_PASSWORD` and forces a password change.

## What is implemented

**Gym workspace** — dashboard, members (search, invite, import CSV, archive/restore, roles, permissions), membership plans and subscriptions (pause, resume, cancel, credits, plan change, invoices, payments, refunds), calendar with recurring sessions, classes, attendance and QR check-in, coaches and assignments, fighters and fight records, fight camps, payments, analytics, messages/announcements, settings (gym, locations, team, subscription).

**Coach ↔ athlete** — coaches are assigned to athletes; athletes see their coaches and message them; coach permissions are limited to assigned athletes (read, notes, records), enforced server-side.

**Fighter portal** — home with next class, coach and camp countdown, 14-day schedule with booking/waitlist/cancel/QR, progress (volume, disciplines, program, goals, coach notes, training log), fights (camp phases, checklist, readiness, record history), membership and billing (invoices, sandbox/Stripe payment path), profile (preferences, consents, export/deletion), notifications, messages, support, onboarding.

**Platform admin** — MRR/ARR and revenue, gyms (plan, seats, suspend/archive, support mode), users (suspend, super-admin grant/revoke, sessions, security events), SaaS plans, feature flags, platform settings, support inbox, GDPR data requests, email outbox, hash-chained audit log with verification.

## Testing

```bash
npm test              # Vitest unit + integration (auth, RBAC, tenant isolation A–E, billing, booking, QR replay, webhooks, audit chain)
npm run lint          # tsc --noEmit
npm run build         # production build
npm run test:e2e      # Playwright (requires `npx playwright install chromium`)
```

Integration tests run against a disposable SQLite database created by the real migrations and demo seed. See [docs/TESTING.md](docs/TESTING.md).

## Operations

- [docs/DEMO.md](docs/DEMO.md) — **share a live demo with a customer** (Fly.io / Render / VPS)
- [docs/DEPLOYMENT.md](docs/DEPLOYMENT.md) — Docker, environment, backups, cron, Stripe, TLS
- [docs/SECURITY.md](docs/SECURITY.md) — threat model, controls, GDPR, limitations
- [docs/ARCHITECTURE.md](docs/ARCHITECTURE.md) — modules, data model, request flow
- [PROJECT_STATUS.md](PROJECT_STATUS.md) — current completion state

## Scripts

| Command | Purpose |
| --- | --- |
| `npm run dev` | development server on `0.0.0.0:3000` |
| `npm run build` / `npm start` | production build / server |
| `npm run db:generate` | generate Drizzle migration after schema changes |
| `npm run db:migrate` | apply migrations |
| `npm run db:seed` | idempotent demo data |
| `npm run db:reset` | recreate + seed the local database |
| `npx tsx scripts/dev-session.ts <email>` | mint a session cookie token for curl smoke tests |
| `npx tsx scripts/dev-info.ts` | print demo users, roles, member/org ids |
| `npx tsx scripts/dev-admin.ts` | ensure the development super admin exists |
| `npx tsx scripts/repair-audit-chain.ts` | re-derive the audit hash chain (incident tool) |
| `npx tsx scripts/prod-boot-check.ts` | verify the production first-boot path on a throwaway DB |

## License

Proprietary. Demo data is synthetic; all payments in the demo are sandbox/test and clearly labelled.
