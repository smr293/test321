# Security

## Threat model

Assets: member PII, payment records, training/fight records, gym financial data, platform administration.

Adversaries considered: unauthenticated Internet users, authenticated members of one gym attempting to reach another gym, a coach attempting manager actions, a compromised member session, forged payment webhooks, replayed check-in QR codes, and insider misuse of platform admin powers.

## Authentication

- Passwords hashed with **Argon2id** (`@node-rs/argon2`, m=19456, t=2, p=1). Plaintext is never stored or logged.
- Password policy: ≥ 8 characters for members, stronger required for production bootstrap admins (≥ 12).
- Sessions: opaque 32-byte token, stored **only** as SHA-256; httpOnly, SameSite=Lax, Secure in production; 14-day expiry, 12-hour idle timeout; revocable individually or all at once.
- Login throttling: 10 attempts / 10 minutes per identifier+IP; 8 consecutive failures lock the account for 15 minutes.
- Password reset: single-use tokens, stored hashed, 60-minute expiry, enumeration-safe responses.
- MFA: TOTP (RFC 6238, SHA-1, 6 digits, ±1 step). Required for platform administrators in production policy; users can enable it at `/settings/security`.
- The development bootstrap admin (`admin`/`admin`) is created only when `NODE_ENV !== production`; production requires `BOOTSTRAP_ADMIN_PASSWORD` and forces rotation.

## Authorisation & tenant isolation

- Every tenant table has `orgId`. Repository helpers and page loads take `orgId` from the verified context, never from user input alone.
- `getOrgContext()` returns `null` unless the user is a member of the active gym (or a super admin in audited, read-only support mode).
- `getTenantMember(orgId, memberId)` and domain services (`createMembership`, `createInvoiceForSubscription`, `recordPayment`, `refundPayment`, `bookSession`, `cancelBooking`, `checkIn`) all filter by `orgId` and throw when the object belongs elsewhere.
- RBAC: `owner` (all), `manager` (configurable subset), `coach` (training/attendance/messages only, **and only for assigned athletes**), `fighter` (no staff permissions). Permission overrides are validated against the known permission list, so unknown strings cannot escalate.
- Coaches: `assertCoachOwnsFighter` guards athlete detail pages and coaching-note writes; the fighters list is scoped to assignments. Private notes are visible only to their author.
- Platform admin: `requireSuperAdmin()` on every page/action; suspending a gym revokes staff sessions immediately; support mode is time-boxed (4 h) and audited.

Scenario tests A–E in `tests/tenant-isolation.test.ts` cover these paths, plus `tests/coach-relation.test.ts`.

## Input handling

- All mutations parse `FormData` with Zod schemas (`src/lib/validation.ts`); failures return field-level messages.
- Drizzle parameterises every query; the few raw SQL fragments interpolate bound parameters.
- CSV import is parsed line-by-line with validation and per-row error reporting; no `eval`/dynamic SQL.
- Uploads are not part of V1 (avatar/logo URLs only), avoiding file-upload attack surface.

## Payments

- Money is integer minor units. Refunds are capped at the captured amount and require staff permission.
- `recordPayment` is only called by staff actions or verified provider events — never from a client "success" page.
- Stripe webhooks verify the raw body against `STRIPE_WEBHOOK_SECRET` with a 300-second tolerance and constant-time comparison; events are idempotent per `(provider, eventId)` (unique index).
- Sandbox mode is explicit in the UI ("test payment") and never contacts Stripe unless keys are configured.

## QR check-in

- Token: `YYYY-MM-DD.<HMAC-SHA256(orgId:memberId:date)>` (base64url, 24 chars), signed with `AUTH_SECRET`.
- Verification uses constant-time comparison and rejects malformed tokens.
- Front desk scan enforces: same org, today's date, valid HMAC, member belongs to the org, unique scan nonce → replay blocked by a unique index.
- Self check-in is limited to 45 minutes before class until class end.

## Audit & monitoring

- `audit_logs` is append-only with `prevHash`/`hash` (SHA-256 over canonical fields) and a `audit.chainHead` anchor stored in `platform_settings`; both linkage and head are verified by the admin UI.
- Security events (`security_events`) record login success/failure, admin denials, suspensions, MFA changes and super-admin grants.
- Privileged actions record actor, role, target, outcome, IP and metadata.
- Incident tool: `npx tsx scripts/repair-audit-chain.ts` re-derives the chain (use only after a confirmed bug, and preserve a copy of the DB first).

## Rate limiting

DB-backed fixed-window counters (`src/lib/rate-limit.ts`) guard login, registration, password reset, invites and booking spam. Counters are per key with retry-after. For multi-replica deployments, move this to shared storage.

## Headers & browser hardening

`X-Frame-Options: SAMEORIGIN`, `X-Content-Type-Options: nosniff`, `Referrer-Policy: strict-origin-when-cross-origin`, `Permissions-Policy` limiting camera/mic/geolocation. Cookies are httpOnly and SameSite=Lax. Add HSTS at the reverse proxy. A nonce-based CSP is recommended before public launch; Next.js inline bootstrap scripts make this environment-specific.

## Privacy / GDPR

- Data export and deletion requests are self-service from the member profile and queued in `data_requests` for platform staff.
- Completing a deletion request sets `users.status = pending_deletion` and revokes sessions; purge of rows follows the documented retention runbook (`DATA_RETENTION_DAYS`, default 730).
- Consent records are stored per type with timestamps.
- Email bodies live in `email_outbox` for audit/deliverability; treat the database as sensitive.
- Logs avoid passwords, tokens and full payment identifiers.

## Known limitations

- Single-node SQLite; no row-level encryption (rely on volume encryption).
- CSP not shipped as a strict nonce policy (see above).
- Email delivery requires a provider key; otherwise messages stay in the outbox.
- Playwright E2E could not be executed in the build sandbox (browser download blocked).
- Screenshot/visual regression testing is not included.

## Reporting

Security issues: `security@mmaos.local` (replace with your real address before launch). Include reproduction steps and impact. Do not test against production data without written authorisation.
