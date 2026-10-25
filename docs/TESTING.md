# Testing

## Commands

```bash
npm test            # vitest run (integration + unit)
npm run lint        # tsc --noEmit
npm run build       # production build
npm run test:e2e    # Playwright, requires browsers
```

Vitest uses `tests/global-setup.ts`: it deletes `data/test.db`, applies the **real** Drizzle migrations, then runs the demo seed. Tests therefore exercise the same schema and data as the app. `tests/helpers.ts` creates isolated gyms/members per test.

## Coverage map

| Area | File | What is verified |
| --- | --- | --- |
| Passwords | `auth-security.test.ts` | Argon2id hashes, wrong-password rejection, policy |
| Sessions | `auth-security.test.ts` | 32-byte tokens, SHA-256 at rest, reset tokens hashed |
| Rate limiting | `auth-security.test.ts` | lockout, retry-after, key isolation |
| MFA | `auth-security.test.ts` | TOTP verification, drift window |
| **Tenant isolation A–E** | `tenant-isolation.test.ts` | cross-tenant member read, coach scoping, fighter escalation, billing scoping, cross-tenant booking |
| Coach↔athlete | `coach-relation.test.ts` | both directions, assignment required, unlink revokes, permission set |
| Booking | `booking.test.ts` | seat, duplicate, waitlist + promotion, membership gate, started class |
| QR check-in | `booking.test.ts` | HMAC token scope, malformed token, replay nonce, window |
| Membership | `membership.test.ts` | access, pause/resume, credits, discipline, pricing/tax, invoices, payments, refunds |
| Webhooks | `security-webhooks.test.ts` | signature, timestamp tolerance, idempotency, no side effects on failure |
| Audit | `security-webhooks.test.ts` | chain verification, tamper detection, head anchor |
| Platform | `platform.test.ts` | MRR overview, filters, inboxes, settings, entitlements, no hash leaks |

### Tenant isolation scenarios

- **A** Staff of gym A cannot load a member of gym B by id (`ForbiddenError`); a non-member has no context for another gym.
- **B** A coach only sees athletes linked via `coachAssignments`; manager/owner permissions are unavailable.
- **C** A fighter has no staff permissions, even with forged override JSON; managers cannot invent permissions.
- **D** Subscriptions/invoices are looked up by `(orgId, id)`; a plan from another gym cannot be attached.
- **E** A member of gym A cannot book gym B's session; roster queries are org-scoped.

## E2E

`e2e/*.spec.ts` covers auth, gym operations, fighter journeys, super-admin actions and security headers. **These were authored but not executed in the build sandbox**, because Chromium download (`playwright.azureedge.net`) is blocked there. Run `npx playwright install chromium && npm run test:e2e` in CI/network-enabled environments against a seeded database.

## Manual smoke checks

```bash
npm run dev
TOKEN=$(npx tsx scripts/dev-session.ts fighter@demo.mma)
curl -s -H "Cookie: mma_session=$TOKEN" http://localhost:3000/app | head
curl -s -H "Cookie: mma_session=$TOKEN" http://localhost:3000/api/nope >/dev/null
curl -s http://localhost:3000/api/health
```

All `/gym/*`, `/app/*` and `/admin/*` routes have been curl-smoke-tested with authenticated demo sessions in this build.
