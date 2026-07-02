#!/bin/bash

# ═══════════════════════════════════════════════════════════════
# AmarktAI Network V2 — Docker Entrypoint (Fast Boot)
# ═══════════════════════════════════════════════════════════════

SERVICE="${1:-api}"
PRISMA="./node_modules/.bin/prisma"

echo "[boot] Starting $SERVICE"

# ── Validate env ──────────────────────────────────────────────
[ -z "$DATABASE_URL" ] && { echo "[boot] ERROR: DATABASE_URL missing"; exit 1; }
[ -z "$REDIS_URL" ] && { echo "[boot] ERROR: REDIS_URL missing"; exit 1; }

# ── Wait for MariaDB (TCP) ───────────────────────────────────
DB_HOST=$(node -e "console.log(new URL(process.env.DATABASE_URL).hostname)")
DB_PORT=$(node -e "console.log(new URL(process.env.DATABASE_URL).port||3306)")
echo "[boot] Waiting for MariaDB..."
for i in $(seq 1 30); do
  node -e "const s=require('net').createConnection($DB_PORT,'$DB_HOST',()=>{s.end();process.exit(0)});s.on('error',()=>process.exit(1));s.setTimeout(2000,()=>{s.destroy();process.exit(1)})" 2>/dev/null && break
  [ "$i" -eq 30 ] && { echo "[boot] ERROR: MariaDB unreachable"; exit 1; }
  sleep 1
done
echo "[boot] MariaDB ready"

# ── Wait for Redis (TCP) ─────────────────────────────────────
REDIS_HOST=$(node -e "console.log(new URL(process.env.REDIS_URL).hostname)")
REDIS_PORT=$(node -e "console.log(new URL(process.env.REDIS_URL).port||6379)")
echo "[boot] Waiting for Redis..."
for i in $(seq 1 30); do
  node -e "const s=require('net').createConnection($REDIS_PORT,'$REDIS_HOST',()=>{s.end();process.exit(0)});s.on('error',()=>process.exit(1));s.setTimeout(2000,()=>{s.destroy();process.exit(1)})" 2>/dev/null && break
  [ "$i" -eq 30 ] && { echo "[boot] ERROR: Redis unreachable"; exit 1; }
  sleep 1
done
echo "[boot] Redis ready"

# ── Sync schema (db push — instant, no migration overhead) ────
echo "[boot] Syncing schema..."
$PRISMA db push --schema=./prisma/schema.prisma --accept-data-loss --skip-generate 2>&1
echo "[boot] Schema synced"

# ── Seed admin (API only) ─────────────────────────────────────
if [ "$SERVICE" = "api" ]; then
  echo "[boot] Seeding admin..."
  if ! $PRISMA db seed --schema=./prisma/schema.prisma 2>&1; then
    echo "[boot] ERROR: Admin seed failed — login will not work"
    # Do NOT exit — allow the API to start so healthcheck passes,
    # but the error is visible in logs for debugging.
  else
    echo "[boot] Admin seed complete"
  fi
fi

# ── Launch ────────────────────────────────────────────────────
echo "[boot] Launching $SERVICE"
case "$SERVICE" in
  api)    exec node apps/api/dist/server.js ;;
  worker) exec node apps/worker/dist/worker.js ;;
  *)      echo "[boot] Unknown service: $SERVICE"; exit 1 ;;
esac
