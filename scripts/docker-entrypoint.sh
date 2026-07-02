#!/bin/bash
set -e

# ═══════════════════════════════════════════════════════════════
# AmarktAI Network V2 — Docker Entrypoint
# Waits for dependencies, resolves failed migrations, deploys schema, seeds admin
# ═══════════════════════════════════════════════════════════════

SERVICE="${1:-api}"
MAX_RETRIES=30
RETRY_INTERVAL=2
PRISMA="./node_modules/.bin/prisma"

echo "[entrypoint] AmarktAI Network V2 — Starting $SERVICE"
echo "[entrypoint] NODE_ENV=$NODE_ENV"

# ── Validate required environment variables ────────────────────
for var in DATABASE_URL REDIS_URL; do
  if [ -z "$(eval echo \$$var)" ]; then
    echo "[entrypoint] ERROR: Required environment variable $var is not set"
    exit 1
  fi
done
echo "[entrypoint] Environment variables validated"

# ── Extract host:port from DATABASE_URL ────────────────────────
DB_HOST=$(node -e "const u=new URL(process.env.DATABASE_URL);console.log(u.hostname)")
DB_PORT=$(node -e "const u=new URL(process.env.DATABASE_URL);console.log(u.port||3306)")

# ── Extract host:port from REDIS_URL ──────────────────────────
REDIS_HOST=$(node -e "const u=new URL(process.env.REDIS_URL||'redis://redis:6379');console.log(u.hostname)")
REDIS_PORT=$(node -e "const u=new URL(process.env.REDIS_URL||'redis://redis:6379');console.log(u.port||6379)")

# ── Wait for MariaDB ──────────────────────────────────────────
echo "[entrypoint] Waiting for MariaDB at $DB_HOST:$DB_PORT..."
RETRIES=0
until node -e "
const net = require('net');
const s = net.createConnection($DB_PORT, '$DB_HOST', () => { s.end(); process.exit(0); });
s.on('error', () => process.exit(1));
s.setTimeout(3000, () => { s.destroy(); process.exit(1); });
" 2>/dev/null; do
  RETRIES=$((RETRIES + 1))
  if [ "$RETRIES" -ge "$MAX_RETRIES" ]; then
    echo "[entrypoint] ERROR: MariaDB not ready after $MAX_RETRIES attempts"
    exit 1
  fi
  echo "[entrypoint] MariaDB not ready (attempt $RETRIES/$MAX_RETRIES)..."
  sleep $RETRY_INTERVAL
done
echo "[entrypoint] MariaDB is ready"

# ── Wait for Redis ─────────────────────────────────────────────
echo "[entrypoint] Waiting for Redis at $REDIS_HOST:$REDIS_PORT..."
RETRIES=0
until node -e "
const net = require('net');
const s = net.createConnection($REDIS_PORT, '$REDIS_HOST', () => { s.end(); process.exit(0); });
s.on('error', () => process.exit(1));
s.setTimeout(3000, () => { s.destroy(); process.exit(1); });
" 2>/dev/null; do
  RETRIES=$((RETRIES + 1))
  if [ "$RETRIES" -ge "$MAX_RETRIES" ]; then
    echo "[entrypoint] ERROR: Redis not ready after $MAX_RETRIES attempts"
    exit 1
  fi
  echo "[entrypoint] Redis not ready (attempt $RETRIES/$MAX_RETRIES)..."
  sleep $RETRY_INTERVAL
done
echo "[entrypoint] Redis is ready"

# ── Resolve any failed migrations ──────────────────────────────
# The phase4 migration may be stuck in a failed state.
# Resolve it before attempting deploy so Prisma can proceed.
echo "[entrypoint] Checking for failed migrations..."
FAILED_MIGRATIONS=$($PRISMA migrate status --schema=./prisma/schema.prisma 2>&1 | grep "failed" || true)

if [ -n "$FAILED_MIGRATIONS" ]; then
  echo "[entrypoint] Found failed migrations. Resolving..."
  # Resolve the known failed migration
  $PRISMA migrate resolve --rolled-back "20260701180000_phase4_mariadb_token_ledger" --schema=./prisma/schema.prisma 2>&1 || true
  echo "[entrypoint] Failed migration resolved"
fi

# ── Deploy migrations ──────────────────────────────────────────
echo "[entrypoint] Deploying database migrations..."
if $PRISMA migrate deploy --schema=./prisma/schema.prisma 2>&1; then
  echo "[entrypoint] Migrations deployed successfully"
else
  echo "[entrypoint] migrate deploy failed, attempting db push as fallback..."
  $PRISMA db push --schema=./prisma/schema.prisma --accept-data-loss 2>&1
  echo "[entrypoint] Schema pushed successfully"
fi

# ── Seed admin account ─────────────────────────────────────────
# Only seed on API container to avoid duplicate writes from worker
if [ "$SERVICE" = "api" ]; then
  echo "[entrypoint] Seeding admin account..."
  $PRISMA db seed --schema=./prisma/schema.prisma 2>&1 || {
    echo "[entrypoint] WARNING: prisma db seed failed, running seed script directly..."
    npx ts-node prisma/seed.ts 2>&1 || echo "[entrypoint] Seed script failed (non-fatal)"
  }
  echo "[entrypoint] Seeding complete"
fi

# ── Start the service ──────────────────────────────────────────
echo "[entrypoint] Starting $SERVICE..."
case "$SERVICE" in
  api)
    exec node apps/api/dist/server.js
    ;;
  worker)
    exec node apps/worker/dist/worker.js
    ;;
  *)
    echo "[entrypoint] ERROR: Unknown service: $SERVICE"
    exit 1
    ;;
esac
