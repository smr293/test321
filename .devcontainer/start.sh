#!/usr/bin/env bash
# Boots the MMA OS customer demo inside a GitHub Codespace (or any Linux box).
# Idempotent: safe to run from postCreate, postStart and postAttach.
set -euo pipefail

cd "$(dirname "$0")/.."
REPO_DIR="$PWD"
PORT="${PORT:-3000}"
STATE="$HOME/.mma-os-demo.env"

if curl -sf "http://127.0.0.1:$PORT/api/health" >/dev/null 2>&1; then
  echo "[mma-os] demo already running on port $PORT"
  exit 0
fi

# --- one-time secrets (persist across codespace restarts) -------------------
if [ ! -f "$STATE" ]; then
  umask 077
  {
    echo "AUTH_SECRET=$(openssl rand -base64 48 | tr -d '\n')"
    echo "CRON_SECRET=$(openssl rand -base64 32 | tr -d '\n')"
    echo "BOOTSTRAP_ADMIN_PASSWORD=$(openssl rand -base64 24 | tr -d '\n=+/' | cut -c1-18)Ab1"
  } > "$STATE"
  chmod 600 "$STATE"
fi

set -a
# shellcheck disable=SC1090
. "$STATE"
set +a

mkdir -p "$REPO_DIR/data"
export NODE_ENV=production
export PORT HOSTNAME=0.0.0.0
export DEMO_SEED=true
export DATABASE_URL="file:$REPO_DIR/data/mma.db"
export MIGRATIONS_DIR="$REPO_DIR/.next/standalone/drizzle"
export BOOTSTRAP_ADMIN_ENABLED=true
export BOOTSTRAP_ADMIN_EMAIL="${BOOTSTRAP_ADMIN_EMAIL:-admin@mmaos.local}"

# Public URL of the forwarded port (Codespaces sets CODESPACE_NAME).
if [ -z "${APP_URL:-}" ] && [ -n "${CODESPACE_NAME:-}" ]; then
  APP_URL="https://${CODESPACE_NAME}-${PORT}.${GITHUB_CODESPACES_PORT_FORWARDING_DOMAIN:-app.github.dev}"
fi
export APP_URL="${APP_URL:-http://localhost:$PORT}"

# --- dependencies ----------------------------------------------------------
if [ ! -d node_modules ]; then
  echo "[mma-os] installing dependencies (first run, ~2 min)…"
  npm install --no-audit --no-fund
fi

# --- build (standalone bundle) --------------------------------------------
if [ ! -f .next/standalone/server.js ] || [ -n "${MMA_FORCE_BUILD:-}" ]; then
  echo "[mma-os] building…"
  npx next build
  rm -rf .next/standalone/.next/static .next/standalone/public
  mkdir -p .next/standalone/.next
  cp -r .next/static .next/standalone/.next/static
  cp -r public .next/standalone/public
  rm -rf .next/standalone/drizzle
  cp -r drizzle .next/standalone/drizzle
fi

# --- run -------------------------------------------------------------------
cd "$REPO_DIR/.next/standalone"
nohup node server.js > /tmp/mma-os.log 2>&1 &

for _ in $(seq 1 90); do
  if curl -sf "http://127.0.0.1:$PORT/api/health" >/dev/null 2>&1; then
    echo "[mma-os] demo ready → $APP_URL"
    echo "[mma-os] logins: owner@demo.mma / coach@demo.mma / fighter@demo.mma — password demo1234"
    echo "[mma-os] super admin: $BOOTSTRAP_ADMIN_EMAIL / $BOOTSTRAP_ADMIN_PASSWORD (change after first sign-in)"
    exit 0
  fi
  sleep 1
done

echo "[mma-os] server did not become healthy — last log lines:" >&2
tail -30 /tmp/mma-os.log >&2
exit 1
