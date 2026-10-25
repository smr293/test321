# Architecture

## Modules

```
src/
  app/                 Next.js App Router
    (public)           /, /features, /pricing, /login, /register, /join/[token]
    gym/               staff workspace (owner, manager, coach)
    app/               fighter portal
    admin/             super-admin console
    settings/security  password, MFA, sessions
    api/               health, Stripe webhook, cron maintenance
  components/          UI kit, shells, feature forms
  db/                  schema, client, migrations, demo seed
  lib/                 domain services, authz, actions
drizzle/               generated SQL migrations
tests/                 Vitest integration suite
e2e/                   Playwright specs
```

## Request flow

1. **Session** — opaque 32-byte token in an httpOnly `mma_session` cookie. Only its SHA-256 hash is stored (`sessions.id`). 14-day expiry, 12-hour idle timeout, revocable.
2. **Tenant context** — `getOrgContext(orgId?)` resolves the active gym from the `mma_org` cookie and verifies the user is a member (or a super admin in audited support mode). It returns `null` for non-members.
3. **Authorisation** — `requireOrgPermission(orgId, permission)` combines the member's role with per-manager overrides. Coaches additionally pass `assertCoachOwnsFighter` for athlete-scoped actions.
4. **Domain service** — booking, membership, notifications, audit. All money is integer minor units; all timestamps are UTC.
5. **Audit** — privileged mutations append to a hash-chained log (`prevHash` + SHA-256 of canonical fields) and update the `audit.chainHead` anchor.

## Data model (high level)

- `users`, `sessions`, `securityEvents`, `loginAttempts`, `passwordResets`, `consents`
- `organizations` → `gymLocations`, `orgMembers` (role, permissions, status), `coachAssignments`, `coachNotes`, `fighterProfiles`
- `membershipPlans` → `subscriptions` → `subscriptionEvents`, `pauses`; `invoices` → `payments` → `refunds`
- `saasPlans` → `saasSubscriptions` (platform billing per gym)
- `classes` → `classSessions` → `bookings` / `attendance`
- `trainingSessions`, `fighterGoals`, `trainingPrograms`, `programAssignments`
- `fightCamps`, `fightRecords`, `readinessCheckins`
- `notifications`, `notificationPreferences`, `messages`, `announcements`
- `auditLogs`, `billingEvents`, `idempotencyKeys`, `featureFlags`, `platformSettings`, `supportTickets`, `emailOutbox`, `dataRequests`

Every tenant-owned table carries `orgId`; queries are always scoped by it. See `src/db/schema.ts` for the full ~51-table schema.

## Key invariants

- Money: integer minor units, never floats. Tax computed from plan or org rate.
- Invoices: globally unique `INV-{year}-{seq}`.
- Bookings: capacity and waitlist computed inside a SQLite transaction; cancellation promotes the first waitlisted member.
- Check-in: 45-minute pre-class window for self/QR; staff can override; a unique scan nonce blocks replay.
- Webhooks: raw-body signature verification, 300-second tolerance, idempotent per `(provider, eventId)`.
- Entitlements: SaaS plan limits are enforced server-side (`src/lib/entitlements.ts`), not by hiding UI.

## Rendering / UX

Server Components fetch data and enforce access; Client Components handle modals, tabs, charts, QR rendering and theme toggling. Feedback is delivered through `?ok=` / `?error=` flash messages. Theme is a cookie + CSS variable switch (`.light`). No client-side data fetching of protected data.
