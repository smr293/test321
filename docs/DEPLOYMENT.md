# Deployment

MMA OS ships as a single Next.js standalone container with a SQLite database on a persistent volume. Nothing else is required for a small single-node deployment.

## 1. Requirements

- Docker 24+ with Compose v2 (recommended), or Node.js 22+ for bare-metal
- A persistent volume for `/app/data`
- TLS termination (Caddy, Traefik, nginx or your cloud load balancer)
- Optional: Stripe account (test mode first), Resend API key

## 2. Configure

```bash
cp .env.production.example .env
openssl rand -base64 48     # AUTH_SECRET
openssl rand -hex 32        # CRON_SECRET
```

Minimum production values:

| Variable | Required | Notes |
| --- | --- | --- |
| `AUTH_SECRET` | yes | 32+ random bytes; signs QR tokens and is mixed into session hashes |
| `APP_URL` | yes | public HTTPS origin, used in invite/reset links and webhooks |
| `DATABASE_URL` | yes | `file:./data/mma.db` |
| `BOOTSTRAP_ADMIN_EMAIL` / `BOOTSTRAP_ADMIN_PASSWORD` | first boot | password ≥ 12 chars; disable after creating personal admins |
| `FORCE_ADMIN_PASSWORD_CHANGE` | recommended | `true` in production |
| `CRON_SECRET` | if using cron endpoint | bearer token |
| `STRIPE_*` | optional | leave blank for sandbox billing (no real charges) |
| `RESEND_API_KEY` | optional | without it, email is logged to the outbox only |

The app **fails closed** in production when secrets are weak or missing (`assertSecureConfig`).

## 3. Run with Docker Compose

```bash
docker compose build
docker compose up -d
docker compose logs -f mma-os
curl -fsS http://localhost:3000/api/health
```

On startup the container:

1. applies pending migrations (`instrumentation.ts`),
2. ensures the SaaS plan catalog, platform settings and feature flags exist,
3. creates the bootstrap super admin if `BOOTSTRAP_ADMIN_ENABLED=true`,
4. serves the app on `0.0.0.0:3000`.

The demo seed **never** runs in production (`NODE_ENV=production`).

### Data volume

`mma_data` is mounted at `/app/data`. Back it up, not the container:

```bash
docker run --rm -v mmaos_mma_data:/data -v "$PWD":/backup alpine \
  tar czf /backup/mma-os-$(date +%F).tgz -C /data .
```

SQLite runs in WAL mode; for a consistent copy stop the app or use `sqlite3 data/mma.db ".backup '/backup/mma.db'"`.

## 4. Reverse proxy (Caddy example)

```caddyfile
app.example.com {
  encode zstd gzip
  reverse_proxy 127.0.0.1:3000
  header {
    Strict-Transport-Security "max-age=31536000; includeSubDomains"
  }
}
```

The app already sets `X-Frame-Options`, `X-Content-Type-Options`, `Referrer-Policy` and `Permissions-Policy`. Add HSTS at the proxy, and a CSP appropriate to your asset origins (Recharts/Next inline styles require care).

## 5. Scheduled maintenance

Call `POST /api/cron/maintenance` hourly with `Authorization: Bearer $CRON_SECRET`. It:

- marks overdue memberships, applies scheduled pauses/cancellations/plan changes,
- resolves no-shows for finished classes,
- purges expired sessions,
- optionally purges audit logs older than `DATA_RETENTION_DAYS` **only if** `AUDIT_PURGE_ENABLED=true` (remaining chain is re-derived).

Example crontab:

```
0 * * * * curl -fsS -X POST -H "Authorization: Bearer $CRON_SECRET" https://app.example.com/api/cron/maintenance >/dev/null
```

## 6. Stripe

1. Create products/prices for Starter, Pro and Elite; copy price ids to `STRIPE_PRICE_*`.
2. Set `STRIPE_SECRET_KEY` and `STRIPE_WEBHOOK_SECRET`.
3. Add webhook endpoint `https://app.example.com/api/webhooks/stripe` for:
   - `invoice.paid`, `invoice.payment_succeeded`, `invoice.payment_failed`
   - `customer.subscription.updated`, `customer.subscription.deleted`
4. Until keys are present the app uses the **sandbox** provider and labels payments as tests. No live charge is possible without keys.

## 7. Bare metal

```bash
npm ci
npm run build
NODE_ENV=production AUTH_SECRET=... APP_URL=... npm start
```

Use a process manager (systemd) with `WorkingDirectory`, `EnvironmentFile=/etc/mma-os.env`, and a writable `data/` directory. Run migrations automatically at boot via instrumentation, or explicitly with `npm run db:migrate`.

## 8. Health & monitoring

- `GET /api/health` → `{status:"ok",database:"ok",latencyMs}` (503 if the DB is unreachable)
- Container healthcheck is built into the Dockerfile/compose
- Watch: 5xx rate, `email_outbox` failures, `billing_events` failures, audit verification result, DB file size

## 9. Upgrades

1. Back up the database.
2. Pull the new image / code.
3. `npm run db:generate` (dev) and commit the migration.
4. Restart — migrations apply automatically.
5. Verify `/api/health`, sign in, open `/admin/audit` and run **Verify chain**.

Migrations are additive by convention; SQLite has limited `ALTER` support, so destructive changes require a data migration.

## 10. Scaling notes

SQLite handles a single-node gym group well. For horizontal scale, move to Postgres (Drizzle schema is portable with type mapping), externalise rate limiting/session cache, and run migrations as a separate job. Until then, run exactly **one** app replica against a given database file.

## Production checklist

- [ ] `AUTH_SECRET`, `APP_URL`, `CRON_SECRET` set
- [ ] Bootstrap admin password rotated; `BOOTSTRAP_ADMIN_ENABLED=false` afterwards
- [ ] MFA enabled for every super admin
- [ ] TLS + HSTS at the proxy
- [ ] `data/` on a backed-up volume, restore tested
- [ ] Hourly maintenance cron configured and authenticated
- [ ] Stripe webhook signature secret configured (if billing live)
- [ ] `/admin/audit` chain verified
- [ ] Retention settings reviewed (GDPR)
