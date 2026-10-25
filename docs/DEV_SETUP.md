# Developer setup — MMA OS

Everything you need to run, test and change this app on your own machine.
Roughly 10 minutes from clone to a running gym console.

---

## 0. What you are getting

A single Next.js 15 app (App Router) with three surfaces in one codebase:

| Surface | URL | Who |
| --- | --- | --- |
| Gym workspace | `/gym/*` | owner, manager, coach |
| Athlete app | `/app/*` | fighters / members (mobile-first) |
| Platform admin | `/admin/*` | you, the SaaS operator |
| Marketing pages | `/`, `/features`, `/pricing` | public |

Stack: **Next.js 15 · React 19 · TypeScript · Tailwind v4 · Drizzle ORM + SQLite · Argon2id · Zod**.
No external services are required to run it locally: the database is a file, email is written to
the console, and payments use the built-in sandbox provider.

---

## 1. Prerequisites

- **Node.js ≥ 22** (`node -v`) — required, the DB driver and Next 15 need it.
- **git**
- **A C compiler toolchain** — only because `better-sqlite3` is a native module:
  - **macOS:** `xcode-select --install`
  - **Windows:** use **WSL2** (Ubuntu) — do not build in plain PowerShell
  - **Linux:** `sudo apt install build-essential python3`

If you use `nvm`:

```bash
nvm install 22 && nvm use 22
```

---

## 2. Clone and run

```bash
git clone https://github.com/smr293/test321.git
cd test321
git checkout main

npm install                      # ~1 min, builds better-sqlite3
cp .env.example .env.local       # dev defaults are safe out of the box

npm run db:migrate               # create data/mma.db from drizzle/ migrations
npm run db:seed                  # two gyms with members, classes, invoices, camps
npm run dev                      # http://localhost:3000
```

Open <http://localhost:3000/login> and sign in:

| Role | Email | Password |
| --- | --- | --- |
| Gym owner | `owner@demo.mma` | `demo1234` |
| Gym manager | `manager@demo.mma` | `demo1234` |
| Coach | `coach@demo.mma` | `demo1234` |
| Fighter | `fighter@demo.mma` | `demo1234` |
| Second gym owner | `owner@southside.mma` | `demo1234` |
| Platform admin | `admin` at `/admin/login` | `admin` |

The dev admin only exists in development — production refuses it (see `src/lib/env.ts`).

`npm run dev` also migrates and seeds automatically on a fresh database, so step 4–5 are only
needed if you want to do it explicitly.

### Useful npm scripts

| Command | What it does |
| --- | --- |
| `npm run dev` | dev server on `0.0.0.0:3000` (open it from your phone over LAN too) |
| `npm run verify` | type check + 64 tests + production build — run before every PR |
| `npm test` | Vitest suite (unit + integration against a real SQLite DB) |
| `npm run lint` | `tsc --noEmit` |
| `npm run build` | production build (standalone output) |
| `npm run db:generate` | new migration after editing `src/db/schema.ts` |
| `npm run db:migrate` | apply migrations |
| `npm run db:seed` | top up demo data (idempotent) |
| `npm run db:reset` | delete the DB and rebuild + reseed |
| `npm run demo:check` | boot a production instance against a throwaway DB and print what it created |
| `npm run test:e2e` | Playwright specs (needs `npx playwright install chromium` once) |

---

## 3. Where things live

```
src/app/            routes (gym/, app/, admin/, marketing, api/)
src/components/     UI kit + shared components
src/db/             schema.ts (all tables), client.ts, migrate.ts, seed.ts
src/lib/            authz (RBAC + tenant scoping), auth, billing, audit, email, validation
src/lib/actions/    server actions ("use server" — only async exports)
drizzle/            SQL migrations (never hand-edit; generate them)
scripts/            CLI helpers: seed, dev-session, prod-boot-check, audit repair
tests/              Vitest (tenant isolation, coach relation, billing, security)
e2e/                Playwright
docs/               architecture, security, deployment, testing, demo runbook
```

Read these in this order when you start: `docs/ARCHITECTURE.md` → `src/db/schema.ts` →
`src/lib/authz.ts` → `src/lib/actions/*`.

---

## 4. Non-negotiables in this codebase

These are enforced by tests; breaking them breaks the build or the security model.

1. **Every query is org-scoped.** Use `requireOrg*` helpers from `src/lib/authz.ts`. Never query
   a tenant table without an `orgId` filter.
2. **Coaches only see their own athletes.** Use `assertCoachOwnsFighter` / `getAthleteCoaches`
   rather than ad-hoc joins.
3. **`"use server"` files export async functions only.** Types and constants go elsewhere.
4. **Money is integer cents.** Format with `<Money cents={…} currency={…} />`.
5. **Passwords:** Argon2id via `hashPassword`/`verifyPassword`. Never log or store plaintext.
6. **Audit everything destructive** with `audit({ actor, action, targetType, targetId })`.
7. **Migrations are generated**, not written by hand: edit `schema.ts` → `npm run db:generate`.

---

## 5. Git workflow

`main` is protected by convention — do not push to it directly.

```bash
git checkout main && git pull
git checkout -b feat/booking-waitlist
# …work…
npm run verify
git add -A && git commit -m "feat: waitlist auto-promotion"
git push -u origin feat/booking-waitlist
gh pr create --fill        # or open the PR in the browser
```

Then merge the PR on GitHub (`Squash and merge` is fine). Keep commits scoped; the PR body
should say what changed and how you verified it (`npm run verify` output, plus the URL you clicked).

---

## 6. Troubleshooting

| Symptom | Cause | Fix |
| --- | --- | --- |
| `gyp ERR! stack Error: not found: make` / node-gyp build error | no compiler toolchain | install Xcode CLT / build-essential, or use WSL2 on Windows |
| `FetchError … node-v22.x.x-headers.tar.gz` during `npm install` | node-gyp cannot reach nodejs.org (proxy/offline) | `npm_config_nodedir=$(dirname $(dirname $(which node))) npm install` — builds against the local Node headers |
| `no such table: organizations` | migrations never ran | `npm run db:migrate` (or delete `data/` and rerun `npm run dev`) |
| `Can't find meta/_journal.json file` | app started from a directory without `drizzle/` | run from the repo root, or set `MIGRATIONS_DIR` |
| Port 3000 in use | another dev server | `lsof -ti:3000 \| xargs kill` |
| Login says "Email or password is incorrect" | wrong DB / old seed | `npm run db:reset` |
| `UNIQUE constraint failed: users.email` | two seeds ran at once | stop servers, `npm run db:reset` |
| Weird stale behaviour after switching branches | Next cache | `rm -rf .next && npm run dev` |

Still stuck? `rm -rf .next data node_modules package-lock.json && npm install && npm run dev` fixes
most local-state problems. If it persists, check `docs/TESTING.md` for how to run the suite the
same way CI does.

---

## 7. Sharing a running instance

- **Same network:** `npm run dev` binds `0.0.0.0`, so `http://<your-lan-ip>:3000` works from a phone.
- **Quick public link:** `npx localtunnel --port 3000` (or ngrok).
- **A demo the client can keep:** `docs/DEMO.md` — GitHub Codespaces, Fly.io, Render, or a VPS
  with docker-compose. Demo mode (`DEMO_SEED=true`) seeds synthetic gyms, sets `noindex` and shows
  a "demo environment" badge so it can never be mistaken for production.
- **Real deployment:** `docs/DEPLOYMENT.md` — Docker, secrets, `/app/data` volume, health check,
  Stripe, TLS, backups.

---

## 8. Current state

`PROJECT_STATUS.md` is the source of truth (statuses, evidence, what is left). It is updated every
round; read the bottom section before starting new work so you do not duplicate an open item.
