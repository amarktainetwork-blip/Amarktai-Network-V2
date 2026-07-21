#!/bin/bash

# AmarktAI Network V2 — Database migration script.
# Run this BEFORE starting API/worker containers.
# Can be run as a one-shot service or deployment command.

set -euo pipefail

echo "[migrate] Starting database migration"
echo "[migrate] DATABASE_URL is set: $([ -n "$DATABASE_URL" ] && echo 'yes' || echo 'NO')"

# Wait for database
DB_HOST=$(node -e "console.log(new URL(process.env.DATABASE_URL).hostname)")
DB_PORT=$(node -e "console.log(new URL(process.env.DATABASE_URL).port||3306)")
echo "[migrate] Waiting for MariaDB at $DB_HOST:$DB_PORT..."
for i in $(seq 1 30); do
  node -e "const s=require('net').createConnection($DB_PORT,'$DB_HOST',()=>{s.end();process.exit(0)});s.on('error',()=>process.exit(1));s.setTimeout(2000,()=>{s.destroy();process.exit(1)})" 2>/dev/null && break
  [ "$i" -eq 30 ] && { echo "[migrate] ERROR: MariaDB unreachable"; exit 1; }
  sleep 1
done
echo "[migrate] MariaDB ready"

# Apply migrations
echo "[migrate] Applying migrations..."
npx prisma migrate deploy --schema=./prisma/schema.prisma
echo "[migrate] Migrations applied successfully"

# Verify
echo "[migrate] Verifying migration status..."
npx prisma migrate status --schema=./prisma/schema.prisma
echo "[migrate] Done"
