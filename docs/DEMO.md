# Dela en live-demo med en kund

Arena-förhandsvisningen (`https://<port>-<sandbox>.e2b.app`) är bara kopplad till den här sessionen. Den fungerar **inte** som kundlänk — den slocknar när sessionen stängs och kan inte skickas vidare. För en riktig delbar URL, deploya containern (5–10 minuter).

## Rekommenderad väg: Fly.io (gratis att testa, persistent volym)

```bash
# 1. Engångs: logga in
fly auth signup           # eller: fly auth login
fly launch --copy-config --no-image --name mma-os-demo --region arn

# 2. Persistent volym för SQLite (måste finnas innan deploy)
fly volumes create mma_data --size 3 --region arn

# 3. Hemligheter (DEMO_SEED sätter igång demoläget)
fly secrets set \
  AUTH_SECRET="$(openssl rand -base64 48)" \
  BOOTSTRAP_ADMIN_PASSWORD="$(openssl rand -base64 24)" \
  BOOTSTRAP_ADMIN_EMAIL="du@dindomän.se" \
  DEMO_SEED=true \
  APP_URL="https://mma-os-demo.fly.dev"

# 4. Deploya
fly deploy
fly open
```

Första starten gör automatiskt: migrationer → SaaS-planer/inställningar/flags → demo-gym (Nordic Fight Lab + Southside MMA) → din admin.

**Skicka till kunden:**

```
Länk:   https://mma-os-demo.fly.dev
Gymägare:   owner@demo.mma     / demo1234
Coach:      coach@demo.mma     / demo1234
Atlet:      fighter@demo.mma   / demo1234
Admin:      /admin/login  (dina egna uppgifter)
```

## Alternativ: Render (blueprint)

1. Pusha repot till GitHub.
2. Render → **New → Blueprint** → välj repot (`render.yaml` läses in).
3. Fyll i `BOOTSTRAP_ADMIN_PASSWORD` och sätt `APP_URL` till din Render-URL.
4. Deploy. Volymen `mma-data` (5 GB) monteras på `/app/data`.

## Alternativ: egen VPS med Docker

```bash
git clone <repo> && cd mma-os
cp .env.production.example .env      # fyll i AUTH_SECRET, APP_URL, DEMO_SEED=true
docker compose up -d --build
```

Sätt Caddy/nginx framför för TLS (`docs/DEPLOYMENT.md`, avsnitt 4).

## Skydda demon (rekommenderas)

Demoläget är öppet för alla med länken. Skydda det med basic auth hos proxyn:

```caddyfile
demo.dindomän.se {
  basicauth {
    kund <BCRYPT_HASH>      # caddy hash-password --plaintext 'valfritt-lösenord'
  }
  reverse_proxy 127.0.0.1:3000
}
```

På Fly kan du i stället sätta `min_machines_running = 0` (maskinen sover när ingen använder den) och rotera `BOOTSTRAP_ADMIN_PASSWORD` mellan kunder.

## Alternativ 0 — GitHub Codespaces (snabbast, kräver GitHub-konto)

Repo:t innehåller `.devcontainer/` som gör hela jobbet:

1. Öppna <https://codespaces.new/smr293/test321/tree/arena/27fec5ff-test321?quickstart=1>
2. Vänta ~3 min (install → build → server startar)
3. Portfliken 3000 har **public** visibility → URL:en `https://<codespace>-3000.app.github.dev` kan delas med kunden
4. Inloggning: `owner@demo.mma` / `coach@demo.mma` / `fighter@demo.mma` med lösenord `demo1234`;
   superadmin-lösenordet skrivs ut i terminalen vid första starten (sparas i `~/.mma-os-demo.env`)

Bra för kunddemo på minuter. Begränsningar: codespacen stängs av efter inaktivitet (ställ in
`--idle-timeout`, max 4 h) och drar av din Codespaces-kvot. För en permanent domän: använd Fly.io nedan.

Starta om manuellt i en codespace: `bash .devcontainer/start.sh` (idempotent).

## Verifierat i den här versionen

Produktionsbygget (standalone, `NODE_ENV=production`) startades mot en tom databas med `DEMO_SEED=true` och gjorde allt själv på första starten:

- migrationer applicerade, `[mma-os] bootstrap super admin created`
- demo-data: **Nordic Fight Lab + Southside MMA, 19 medlemmar, 26 fakturor**
- `/api/health` → 200, badge "Demo environment" visas, `robots: noindex, nofollow`
- alla kontroller: `/`, `/login`, `/admin/login`, `/gym`, `/gym/members`, `/gym/analytics`, `/gym/payments`, `/app`, `/app/schedule`, `/app/progress`, `/app/fights`, `/admin`, `/admin/orgs`, `/admin/revenue`, `/admin/tickets` → 200

Kör samma kontroll själv utan att deploya:

```bash
npm run demo:check      # engångskontroll mot en tillfällig databas
```

## Felsökning

| Symptom | Orsak | Åtgärd |
| --- | --- | --- |
| `Can't find meta/_journal.json file` | appen startad utan `drizzle/` bredvid sig | sätt `MIGRATIONS_DIR=/app/drizzle` (redan gjort i Dockerfile) |
| `no such table: organizations` | ingen databas/volym monterad | kontrollera `DATABASE_URL` och att volymen ligger på `/app/data` |
| `Insecure configuration` vid start | svag `AUTH_SECRET` eller `BOOTSTRAP_ADMIN_PASSWORD` | använd `openssl rand -base64 48` |
| Ingen demolänk-data | `DEMO_SEED` inte satt till `"true"` (sträng) | `fly secrets set DEMO_SEED=true` |
| Volymen "försvinner" | `fly volumes create` gjordes efter deploy | skapa volymen först, deploya sedan |

## Vad demoläget gör — och inte gör

| Gör | Gör inte |
| --- | --- |
| Skapar två syntetiska gym med 19 medlemmar, klasser, camps, fakturor, supportärenden | Skickar riktiga e-postmeddelanden (outbox utan nyckel) |
| Visar en "Demo environment"-bricka längre ner till vänster | Tar riktiga betalningar (sandbox-provider, märkt som test) |
| Sätter `noindex, nofollow` | Indexeras av sökmotorer |
| Kräver starkt `BOOTSTRAP_ADMIN_PASSWORD` (vägrar starta med `admin`) | Skapar dev-admin `admin/admin` |

## Säkerhetschecklista före du skickar länken

- [ ] `AUTH_SECRET` är slumpad (32+ tecken) och inte delad
- [ ] `BOOTSTRAP_ADMIN_PASSWORD` är starkt och byts efter demon
- [ ] `DEMO_SEED=true` (och att du **inte** använder samma instans för riktig gymdata)
- [ ] TLS aktiverat (Fly/Render gör det automatiskt)
- [ ] `APP_URL` pekar på den publika URL:en (annars blir inbjudnings-/återställningslänkar fel)
- [ ] Du är OK med att demodata är publik — den innehåller inga riktiga personuppgifter

## Stänga/återställa demon

```bash
fly apps destroy mma-os-demo            # ta bort allt
# eller: börja om från tom databas
fly ssh console -C "rm -f /app/data/mma.db*" && fly apps restart mma-os-demo
```

## När kunden vill köra skarpt

1. Sätt `DEMO_SEED=false`, `BOOTSTRAP_ADMIN_ENABLED=false` (efter att du skapat din admin).
2. Följ `docs/DEPLOYMENT.md` — backuper, cron, Stripe-nycklar, HSTS.
3. Kör `npx tsx scripts/repair-audit-chain.ts --dry-run` för hälsokontroll och verifiera kedjan under **/admin/audit**.
