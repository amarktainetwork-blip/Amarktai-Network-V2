#!/bin/bash
set -e

# ═══════════════════════════════════════════════════════════════
# AmarktAI Network V2 — Docker Entrypoint
# Waits for dependencies, runs migrations, starts the service
# ═══════════════════════════════════════════════════════════════

SERVICE="${1:-api}"
MAX_RETRIES=30
RETRY_INTERVAL=2

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

# ── Sync database schema ──────────────────────────────────────
# Try migrate deploy first (for databases with migration history)
# Fall back to db push for fresh databases
echo "[entrypoint] Syncing database schema..."
PRISMA="./node_modules/.bin/prisma"

if $PRISMA migrate deploy --schema=./prisma/schema.prisma 2>&1; then
  echo "[entrypoint] Migrations applied successfully"
else
  echo "[entrypoint] No migration history found, pushing schema directly..."
  $PRISMA db push --schema=./prisma/schema.prisma --accept-data-loss 2>&1
  echo "[entrypoint] Schema pushed successfully"
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
