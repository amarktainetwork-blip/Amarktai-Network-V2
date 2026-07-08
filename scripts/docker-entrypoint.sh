#!/bin/bash

# AmarktAI Network V2 Docker entrypoint.

SERVICE="${1:-api}"

echo "[boot] Starting $SERVICE"

[ -z "$DATABASE_URL" ] && { echo "[boot] ERROR: DATABASE_URL missing"; exit 1; }
[ -z "$REDIS_URL" ] && { echo "[boot] ERROR: REDIS_URL missing"; exit 1; }

DB_HOST=$(node -e "console.log(new URL(process.env.DATABASE_URL).hostname)")
DB_PORT=$(node -e "console.log(new URL(process.env.DATABASE_URL).port||3306)")
echo "[boot] Waiting for MariaDB..."
for i in $(seq 1 30); do
  node -e "const s=require('net').createConnection($DB_PORT,'$DB_HOST',()=>{s.end();process.exit(0)});s.on('error',()=>process.exit(1));s.setTimeout(2000,()=>{s.destroy();process.exit(1)})" 2>/dev/null && break
  [ "$i" -eq 30 ] && { echo "[boot] ERROR: MariaDB unreachable"; exit 1; }
  sleep 1
done
echo "[boot] MariaDB ready"

REDIS_HOST=$(node -e "console.log(new URL(process.env.REDIS_URL).hostname)")
REDIS_PORT=$(node -e "console.log(new URL(process.env.REDIS_URL).port||6379)")
echo "[boot] Waiting for Redis..."
for i in $(seq 1 30); do
  node -e "const s=require('net').createConnection($REDIS_PORT,'$REDIS_HOST',()=>{s.end();process.exit(0)});s.on('error',()=>process.exit(1));s.setTimeout(2000,()=>{s.destroy();process.exit(1)})" 2>/dev/null && break
  [ "$i" -eq 30 ] && { echo "[boot] ERROR: Redis unreachable"; exit 1; }
  sleep 1
done
echo "[boot] Redis ready"

echo "[boot] Syncing schema..."
node scripts/prisma-db-push-safe.mjs
echo "[boot] Schema synced"

if [ "$SERVICE" = "api" ]; then
  echo "[boot] Admin bootstrap is handled idempotently by the API runtime"
fi

echo "[boot] Launching $SERVICE"
case "$SERVICE" in
  api)    exec node apps/api/dist/server.js ;;
  worker) exec node apps/worker/dist/worker.js ;;
  *)      echo "[boot] Unknown service: $SERVICE"; exit 1 ;;
esac
