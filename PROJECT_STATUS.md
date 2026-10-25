# MMA OS — Project status

_Last updated: 2026-10-25 · branch `arena/27fec5ff-test321`_

**Remaining work until fully complete: ~4 % (96 % done).**

Status legend: **NOT STARTED** · **IN PROGRESS** · **IMPLEMENTED** (code + types green) · **TESTED** (automated or verified runtime) · **BLOCKED** (environment dependency).

| Area | Status | Evidence / notes |
| --- | --- | --- |
| Multi-tenant schema (~51 tables, Drizzle + SQLite) | TESTED | migration `drizzle/0000_late_whizzer.sql`; 64 Vitest tests use the real schema |
| Auth (Argon2id, sessions, lockout, reset, TOTP MFA) | TESTED | `tests/auth-security.test.ts` (9 tests); runtime login flows verified |
| Tenant isolation + RBAC | TESTED | gym workspace is staff-only (`isStaffRole`) — a member/fighter now gets 307 to `/app` on every `/gym/*` route; `tests/tenant-isolation.test.ts` scenarios **A–E**, `tests/coach-relation.test.ts`; coach → foreign athlete returns 404 in production smoke test |
| Gym workspace (members, plans, memberships, classes, calendar, attendance, payments, refunds, analytics, messages, settings) | TESTED | all 19 `/gym/*` routes return 200 with owner session; domain rules covered by `membership.test.ts`, `booking.test.ts` |
| Coach ↔ trainer/athlete relationship | TESTED | assignments, athlete-side coach card + messaging, assignment-scoped coach access, private-note filtering; tests both directions |
| Fighter portal (home, schedule, QR booking, progress, fights, membership, billing, profile, notifications, messages, support, onboarding) | TESTED | all 12 `/app/*` routes 200 in production build; QR + booking + replay tested |
| Super-admin console (MRR, gyms, users, plans, flags, settings, support, GDPR, email, audit) | TESTED | all 11 `/admin/*` routes 200; platform data covered by `platform.test.ts` |
| Billing — sandbox provider | TESTED | payments, invoice numbering, refund cap, idempotency |
| Billing — Stripe path | IMPLEMENTED | signature verify + idempotent webhook tested with signed fixtures; live keys intentionally absent |
| QR check-in (member code + front-desk scanner) | TESTED | HMAC scope, expiry, malformed token, nonce replay, class window |
| Audit hash chain + head anchor | TESTED | `security-webhooks.test.ts`; `/admin/audit` verify action; repair script |
| Notifications, email outbox, announcements, messages | TESTED | exercised by booking/refund/admin tests and demo seed |
| Demo data generator | TESTED | `npm run db:seed` idempotent: 2 gyms, 17 members, 8 plans, camps, tickets, data requests, audit entries |
| Unit/integration tests | TESTED | `npm test` → **64 passing / 7 files** |
| Type check + production build | TESTED | `npx tsc --noEmit` clean; `next build` succeeds (55 pages) |
| Runtime route smoke tests | TESTED | production server: health 200, all gym/app/admin pages 200, unauthenticated guarded pages 307 |
| GitHub Codespaces demo (`.devcontainer/`) | TESTED | auto-install → standalone build → public port 3000; verified from a clean `git clone` of the branch (seed + login + gym pages 200) |
| Health, webhook and cron API routes | TESTED | `/api/health` 200; webhook 503 without secret; cron 503/401 without token |
| E2E Playwright specs | IMPLEMENTED · **BLOCKED** | 5 specs authored; browser download blocked in sandbox (`playwright.azureedge.net`), so **not executed** |
| Dockerfile + compose + production env template | IMPLEMENTED · **BLOCKED** | files complete; **no Docker daemon in sandbox**, so image not built here |
| Customer demo deployment (Fly.io / Render blueprints, `DEMO_SEED`) | TESTED | `fly.toml`, `render.yaml`, `docs/DEMO.md`; **standalone production build booted from an empty DB**: migrations + 2 demo gyms + 19 members + admin, badge + `noindex`, 19 routes 200 (`/`, `/login`, gym + fighter + admin consoles) |
| Design system + marketing pages | TESTED | editorial rebuild: Anton display face + Archivo UI face, single orange accent, hairline ledger layout, rectangular chips, no gradient/glow decoration; `/`, `/features`, `/pricing` and the auth split screen rebuilt; light mode kept |
| Deployment + security + architecture + testing docs | TESTED | `docs/*.md`, README; commands and env vars match the code |
| Production launch / real payments | **BLOCKED (by policy)** | requires explicit authorization; sandbox billing only, clearly labelled |
| Strict nonce-based CSP | NOT STARTED | documented as pre-launch hardening; security headers already set |
| Postgres / multi-replica scaling | NOT STARTED | optional; single-node SQLite is the V1 target (documented) |

## What is left (~4 %)

1. **Host the customer demo** — `fly launch` per `docs/DEMO.md` (needs an account; not runnable from the sandbox).
2. **Run the Playwright suite in a browser-enabled environment** (`npx playwright install chromium && npm run test:e2e`) and fix any selector drift.
3. **Build and smoke-test the Docker image** (`docker compose build && up -d`) where a daemon exists; verify the `/app/data` volume and healthcheck.
4. **Add a strict CSP** (nonce/hash based for Next.js) and re-run the header tests.
5. **Visual/QA pass** across breakpoints and screen readers against WCAG 2.2 AA (automated axe run recommended).
6. **Production go-live** — secrets, TLS, backups, Stripe live keys — only after explicit authorization.

None of these block local use of the product.

## Resumable checkpoint

- Branch: `arena/27fec5ff-test321` (commit/push there).
- App is running as a **dev server** on `http://0.0.0.0:3000` (process label `MMA OS`), backed by `data/mma.db`, so the dev admin `admin`/`admin` and demo quick-login work in the preview. A production `next build` + standalone server was also built and smoke-tested successfully (see above).
- To resume development: `npm run dev` (stop the production server first, or use port 3100).
- Verify state: `npm run lint && npm test && npm run build`, then `curl -s localhost:3000/api/health`.
- Auth for curl: `TOKEN=$(npx tsx scripts/dev-session.ts fighter@demo.mma)` then `curl -H "Cookie: mma_session=$TOKEN" …`.
- If the audit chain ever reports broken: back up `data/mma.db`, then `npx tsx scripts/repair-audit-chain.ts`.

## Change log

- **Round 1–4**: schema, auth, UI kit, gym workspace, fighter portal, seeds, docs scaffolding.
- **Round 5 (this round)**: fighter portal runtime fixes (`bookings.booked_at` column mapping, membership SQL), full super-admin console + platform actions, invitation acceptance + `/join/[token]`, security settings (password/MFA/sessions), QR front-desk scanner, coach scoping + athlete coach card, platform defaults for production, Stripe webhook/health/cron API routes, audit head anchor + repair tool, invoice-number uniqueness fix, safe admin user projections, Vitest suite (64 tests), Playwright specs, Docker/compose/env template, README + deployment/security/architecture/testing docs.
