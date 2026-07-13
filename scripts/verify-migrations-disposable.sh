#!/bin/bash
# ═══════════════════════════════════════════════════════════════
# AmarktAI Network V2 — Disposable MariaDB Migration Proof
# ═══════════════════════════════════════════════════════════════
# This script validates migrations against disposable MariaDB containers.
# It does NOT touch the production database.
# Requires: docker, node, npm, npx (prisma)
# ═══════════════════════════════════════════════════════════════

set -euo pipefail

PREFIX="amarktai-migration-proof-$(date +%s)-$$"
MARIADB_IMAGE="mariadb:11"
FRESH_CONTAINER="${PREFIX}-fresh"
UNMANAGED_CONTAINER="${PREFIX}-unmanaged"
FRESH_DB="proof_fresh_${PREFIX##*-}"
UNMANAGED_DB="proof_unmanaged_${PREFIX##*-}"
NETWORK="${PREFIX}-net"
FRESH_PORT=0
UNMANAGED_PORT=0
ROOT_PASS="${PREFIX}_root_pass_$(openssl rand -hex 8)"
CLEANED=0

cleanup() {
  if [ "$CLEANED" -eq 1 ]; then return; fi
  CLEANED=1
  echo "[cleanup] Removing temporary resources..."
  docker rm -f "$FRESH_CONTAINER" 2>/dev/null || true
  docker rm -f "$UNMANAGED_CONTAINER" 2>/dev/null || true
  docker network rm "$NETWORK" 2>/dev/null || true
  echo "[cleanup] Done"
}

trap cleanup EXIT INT TERM

# ── Preflight checks ───────────────────────────────────────────

echo "[preflight] Checking prerequisites..."

if ! command -v docker &>/dev/null; then
  echo "ERROR: docker is required but not found"
  exit 1
fi

if ! command -v node &>/dev/null; then
  echo "ERROR: node is required but not found"
  exit 1
fi

if ! command -v npx &>/dev/null; then
  echo "ERROR: npx is required but not found"
  exit 1
fi

echo "[preflight] All prerequisites met"

# ── Create network ─────────────────────────────────────────────

echo "[network] Creating isolated network: $NETWORK"
docker network create "$NETWORK"

# ── Find a free port helper ────────────────────────────────────
find_free_port() {
  node -e "
    const s = require('net').createServer();
    s.listen(0, '127.0.0.1', () => {
      console.log(s.address().port);
      s.close();
    });
  "
}

# ════════════════════════════════════════════════════════════════
# TEST A — FRESH DATABASE
# ════════════════════════════════════════════════════════════════

echo ""
echo "═══════════════════════════════════════════════════════════"
echo "TEST A — FRESH DATABASE"
echo "═══════════════════════════════════════════════════════════"

FRESH_PORT=$(find_free_port)
echo "[fresh] Starting MariaDB container on port $FRESH_PORT..."

docker run -d \
  --name "$FRESH_CONTAINER" \
  --network "$NETWORK" \
  -p "127.0.0.1:${FRESH_PORT}:3306" \
  -e MYSQL_ROOT_PASSWORD="$ROOT_PASS" \
  -e MYSQL_DATABASE="$FRESH_DB" \
  "$MARIADB_IMAGE"

echo "[fresh] Waiting for MariaDB to be ready..."
for i in $(seq 1 60); do
  if docker exec "$FRESH_CONTAINER" mariadb-admin ping -h localhost -u root -p"$ROOT_PASS" --silent 2>/dev/null; then
    echo "[fresh] MariaDB ready after ${i}s"
    break
  fi
  if [ "$i" -eq 60 ]; then
    echo "ERROR: MariaDB did not become ready within 60s"
    exit 1
  fi
  sleep 1
done

FRESH_DATABASE_URL="mysql://root:${ROOT_PASS}@127.0.0.1:${FRESH_PORT}/${FRESH_DB}"

echo "[fresh] Running prisma migrate deploy..."
DATABASE_URL="$FRESH_DATABASE_URL" npx prisma migrate deploy --schema=./prisma/schema.prisma

echo "[fresh] Checking migration status..."
DATABASE_URL="$FRESH_DATABASE_URL" npx prisma migrate status --schema=./prisma/schema.prisma

echo "[fresh] Verifying _prisma_migrations..."
MIGRATION_COUNT=$(docker exec "$FRESH_CONTAINER" mariadb -u root -p"$ROOT_PASS" "$FRESH_DB" -N -s -e \
  "SELECT COUNT(*) FROM _prisma_migrations")
if [ "$MIGRATION_COUNT" -ne 2 ]; then
  echo "ERROR: Expected 2 migrations, got $MIGRATION_COUNT"
  exit 1
fi

BASELINE_RECORDED=$(docker exec "$FRESH_CONTAINER" mariadb -u root -p"$ROOT_PASS" "$FRESH_DB" -N -s -e \
  "SELECT COUNT(*) FROM _prisma_migrations WHERE migration_name = '20250701_baseline_fc21a6e'")
if [ "$BASELINE_RECORDED" -ne 1 ]; then
  echo "ERROR: Baseline migration not recorded"
  exit 1
fi

ADDITIVE_RECORDED=$(docker exec "$FRESH_CONTAINER" mariadb -u root -p"$ROOT_PASS" "$FRESH_DB" -N -s -e \
  "SELECT COUNT(*) FROM _prisma_migrations WHERE migration_name = '20260711_add_job_orchestration'")
if [ "$ADDITIVE_RECORDED" -ne 1 ]; then
  echo "ERROR: Additive migration not recorded"
  exit 1
fi

echo "[fresh] Verifying eight orchestration columns..."
for COL in execution_id parent_job_id provider_claim_at queue_job_id queued_at retry_count scene_number workflow_phase; do
  EXISTS=$(docker exec "$FRESH_CONTAINER" mariadb -u root -p"$ROOT_PASS" "$FRESH_DB" -N -s -e \
    "SELECT COUNT(*) FROM information_schema.COLUMNS WHERE TABLE_SCHEMA='$FRESH_DB' AND TABLE_NAME='jobs' AND COLUMN_NAME='$COL'")
  if [ "$EXISTS" -ne 1 ]; then
    echo "ERROR: Column $COL does not exist"
    exit 1
  fi
  echo "[fresh]   ✓ $COL"
done

echo "[fresh] Verifying four orchestration indexes..."
for IDX in jobs_parent_job_id_idx jobs_execution_id_idx jobs_app_slug_execution_id_idx jobs_parent_job_id_scene_number_idx; do
  EXISTS=$(docker exec "$FRESH_CONTAINER" mariadb -u root -p"$ROOT_PASS" "$FRESH_DB" -N -s -e \
    "SELECT COUNT(*) FROM information_schema.STATISTICS WHERE TABLE_SCHEMA='$FRESH_DB' AND TABLE_NAME='jobs' AND INDEX_NAME='$IDX'")
  if [ "$EXISTS" -lt 1 ]; then
    echo "ERROR: Index $IDX does not exist"
    exit 1
  fi
  echo "[fresh]   ✓ $IDX"
done

echo "[fresh] Verifying jobs_parent_job_id_fkey..."
FK_EXISTS=$(docker exec "$FRESH_CONTAINER" mariadb -u root -p"$ROOT_PASS" "$FRESH_DB" -N -s -e \
  "SELECT COUNT(*) FROM information_schema.TABLE_CONSTRAINTS WHERE CONSTRAINT_SCHEMA='$FRESH_DB' AND TABLE_NAME='jobs' AND CONSTRAINT_NAME='jobs_parent_job_id_fkey'")
if [ "$FK_EXISTS" -ne 1 ]; then
  echo "ERROR: Foreign key jobs_parent_job_id_fkey does not exist"
  exit 1
fi
echo "[fresh]   ✓ jobs_parent_job_id_fkey"

echo "[fresh] Running prisma migrate diff..."
FRESH_DIFF=$(DATABASE_URL="$FRESH_DATABASE_URL" npx prisma migrate diff \
  --from-url "$FRESH_DATABASE_URL" \
  --to-schema-datamodel ./prisma/schema.prisma \
  --script 2>&1 || true)
if [ -n "$FRESH_DIFF" ]; then
  echo "ERROR: Schema diff is not empty:"
  echo "$FRESH_DIFF"
  exit 1
fi

echo ""
echo "FRESH_DATABASE_PROOF=PASS"

# ════════════════════════════════════════════════════════════════
# TEST B — UNMANAGED FC21A6E-LIKE DATABASE
# ════════════════════════════════════════════════════════════════

echo ""
echo "═══════════════════════════════════════════════════════════"
echo "TEST B — UNMANAGED FC21A6E-LIKE DATABASE"
echo "═══════════════════════════════════════════════════════════"

UNMANAGED_PORT=$(find_free_port)
echo "[unmanaged] Starting MariaDB container on port $UNMANAGED_PORT..."

docker run -d \
  --name "$UNMANAGED_CONTAINER" \
  --network "$NETWORK" \
  -p "127.0.0.1:${UNMANAGED_PORT}:3306" \
  -e MYSQL_ROOT_PASSWORD="$ROOT_PASS" \
  -e MYSQL_DATABASE="$UNMANAGED_DB" \
  "$MARIADB_IMAGE"

echo "[unmanaged] Waiting for MariaDB to be ready..."
for i in $(seq 1 60); do
  if docker exec "$UNMANAGED_CONTAINER" mariadb-admin ping -h localhost -u root -p"$ROOT_PASS" --silent 2>/dev/null; then
    echo "[unmanaged] MariaDB ready after ${i}s"
    break
  fi
  if [ "$i" -eq 60 ]; then
    echo "ERROR: MariaDB did not become ready within 60s"
    exit 1
  fi
  sleep 1
done

UNMANAGED_DATABASE_URL="mysql://root:${ROOT_PASS}@127.0.0.1:${UNMANAGED_PORT}/${UNMANAGED_DB}"

echo "[unmanaged] Applying baseline SQL directly..."
docker exec -i "$UNMANAGED_CONTAINER" mariadb -u root -p"$ROOT_PASS" "$UNMANAGED_DB" < prisma/migrations/20250701_baseline_fc21a6e/migration.sql

echo "[unmanaged] Verifying _prisma_migrations is absent or empty..."
HAS_TABLE=$(docker exec "$UNMANAGED_CONTAINER" mariadb -u root -p"$ROOT_PASS" "$UNMANAGED_DB" -N -s -e \
  "SELECT COUNT(*) FROM information_schema.TABLES WHERE TABLE_SCHEMA='$UNMANAGED_DB' AND TABLE_NAME='_prisma_migrations'" 2>/dev/null || echo "0")
if [ "$HAS_TABLE" -eq 1 ]; then
  MIGRATION_HISTORY_COUNT=$(docker exec "$UNMANAGED_CONTAINER" mariadb -u root -p"$ROOT_PASS" "$UNMANAGED_DB" -N -s -e \
    "SELECT COUNT(*) FROM _prisma_migrations" 2>/dev/null || echo "0")
  if [ "$MIGRATION_HISTORY_COUNT" -ne 0 ]; then
    echo "ERROR: _prisma_migrations should be empty for unmanaged database"
    exit 1
  fi
fi

echo "[unmanaged] Inserting sample data..."
docker exec "$UNMANAGED_CONTAINER" mariadb -u root -p"$ROOT_PASS" "$UNMANAGED_DB" -e "
INSERT INTO jobs (id, app_slug, capability, prompt, input_json, metadata_json, trace_id, status, provider, model, progress, created_at, updated_at)
VALUES ('sample-job-001', 'test-app', 'chat', 'test prompt', '{}', '{}', 'trace-001', 'completed', 'groq', 'llama-3.1-8b-instant', 100, NOW(3), NOW(3));
"

echo "[unmanaged] Verifying jobs table does NOT have orchestration columns..."
for COL in execution_id parent_job_id provider_claim_at queue_job_id queued_at retry_count scene_number workflow_phase; do
  EXISTS=$(docker exec "$UNMANAGED_CONTAINER" mariadb -u root -p"$ROOT_PASS" "$UNMANAGED_DB" -N -s -e \
    "SELECT COUNT(*) FROM information_schema.COLUMNS WHERE TABLE_SCHEMA='$UNMANAGED_DB' AND TABLE_NAME='jobs' AND COLUMN_NAME='$COL'")
  if [ "$EXISTS" -ne 0 ]; then
    echo "ERROR: Column $COL should not exist yet"
    exit 1
  fi
done
echo "[unmanaged]   ✓ No orchestration columns present before migration"

echo "[unmanaged] Marking baseline as applied..."
DATABASE_URL="$UNMANAGED_DATABASE_URL" npx prisma migrate resolve \
  --applied 20250701_baseline_fc21a6e \
  --schema=./prisma/schema.prisma

echo "[unmanaged] Running prisma migrate deploy..."
DATABASE_URL="$UNMANAGED_DATABASE_URL" npx prisma migrate deploy --schema=./prisma/schema.prisma

echo "[unmanaged] Verifying only additive migration was applied..."
MIGRATION_COUNT=$(docker exec "$UNMANAGED_CONTAINER" mariadb -u root -p"$ROOT_PASS" "$UNMANAGED_DB" -N -s -e \
  "SELECT COUNT(*) FROM _prisma_migrations")
if [ "$MIGRATION_COUNT" -ne 2 ]; then
  echo "ERROR: Expected 2 migrations recorded, got $MIGRATION_COUNT"
  exit 1
fi

ADDITIVE_APPLIED=$(docker exec "$UNMANAGED_CONTAINER" mariadb -u root -p"$ROOT_PASS" "$UNMANAGED_DB" -N -s -e \
  "SELECT COUNT(*) FROM _prisma_migrations WHERE migration_name = '20260711_add_job_orchestration'")
if [ "$ADDITIVE_APPLIED" -ne 1 ]; then
  echo "ERROR: Additive migration was not applied"
  exit 1
fi

echo "[unmanaged] Verifying eight orchestration columns now exist..."
for COL in execution_id parent_job_id provider_claim_at queue_job_id queued_at retry_count scene_number workflow_phase; do
  EXISTS=$(docker exec "$UNMANAGED_CONTAINER" mariadb -u root -p"$ROOT_PASS" "$UNMANAGED_DB" -N -s -e \
    "SELECT COUNT(*) FROM information_schema.COLUMNS WHERE TABLE_SCHEMA='$UNMANAGED_DB' AND TABLE_NAME='jobs' AND COLUMN_NAME='$COL'")
  if [ "$EXISTS" -ne 1 ]; then
    echo "ERROR: Column $COL does not exist after migration"
    exit 1
  fi
  echo "[unmanaged]   ✓ $COL"
done

echo "[unmanaged] Verifying four indexes..."
for IDX in jobs_parent_job_id_idx jobs_execution_id_idx jobs_app_slug_execution_id_idx jobs_parent_job_id_scene_number_idx; do
  EXISTS=$(docker exec "$UNMANAGED_CONTAINER" mariadb -u root -p"$ROOT_PASS" "$UNMANAGED_DB" -N -s -e \
    "SELECT COUNT(*) FROM information_schema.STATISTICS WHERE TABLE_SCHEMA='$UNMANAGED_DB' AND TABLE_NAME='jobs' AND INDEX_NAME='$IDX'")
  if [ "$EXISTS" -lt 1 ]; then
    echo "ERROR: Index $IDX does not exist"
    exit 1
  fi
  echo "[unmanaged]   ✓ $IDX"
done

echo "[unmanaged] Verifying jobs_parent_job_id_fkey..."
FK_EXISTS=$(docker exec "$UNMANAGED_CONTAINER" mariadb -u root -p"$ROOT_PASS" "$UNMANAGED_DB" -N -s -e \
  "SELECT COUNT(*) FROM information_schema.TABLE_CONSTRAINTS WHERE CONSTRAINT_SCHEMA='$UNMANAGED_DB' AND TABLE_NAME='jobs' AND CONSTRAINT_NAME='jobs_parent_job_id_fkey'")
if [ "$FK_EXISTS" -ne 1 ]; then
  echo "ERROR: Foreign key jobs_parent_job_id_fkey does not exist"
  exit 1
fi
echo "[unmanaged]   ✓ jobs_parent_job_id_fkey"

echo "[unmanaged] Verifying sample data survived..."
SAMPLE_STATUS=$(docker exec "$UNMANAGED_CONTAINER" mariadb -u root -p"$ROOT_PASS" "$UNMANAGED_DB" -N -s -e \
  "SELECT status FROM jobs WHERE id = 'sample-job-001'")
if [ "$SAMPLE_STATUS" != "completed" ]; then
  echo "ERROR: Sample data did not survive migration (status=$SAMPLE_STATUS)"
  exit 1
fi
echo "[unmanaged]   ✓ Sample job survived with status=completed"

echo "[unmanaged] Checking migration status..."
DATABASE_URL="$UNMANAGED_DATABASE_URL" npx prisma migrate status --schema=./prisma/schema.prisma

echo "[unmanaged] Running prisma migrate diff..."
UNMANAGED_DIFF=$(DATABASE_URL="$UNMANAGED_DATABASE_URL" npx prisma migrate diff \
  --from-url "$UNMANAGED_DATABASE_URL" \
  --to-schema-datamodel ./prisma/schema.prisma \
  --script 2>&1 || true)
if [ -n "$UNMANAGED_DIFF" ]; then
  echo "ERROR: Schema diff is not empty:"
  echo "$UNMANAGED_DIFF"
  exit 1
fi

echo ""
echo "UNMANAGED_DATABASE_PROOF=PASS"
echo "SAMPLE_DATA_SURVIVAL=PASS"

# ════════════════════════════════════════════════════════════════
# SUMMARY
# ════════════════════════════════════════════════════════════════

echo ""
echo "═══════════════════════════════════════════════════════════"
echo "MIGRATION PROOF SUMMARY"
echo "═══════════════════════════════════════════════════════════"
echo "MIGRATION_PROOF_VERSION=1"
echo "MARIADB_IMAGE=$MARIADB_IMAGE"
echo "BASELINE_MIGRATION=20250701_baseline_fc21a6e"
echo "ADDITIVE_MIGRATION=20260711_add_job_orchestration"
echo "FRESH_DATABASE_PROOF=PASS"
echo "UNMANAGED_DATABASE_PROOF=PASS"
echo "SAMPLE_DATA_SURVIVAL=PASS"
echo "FRESH_SCHEMA_DIFF=EMPTY"
echo "UNMANAGED_SCHEMA_DIFF=EMPTY"
echo "TEMPORARY_RESOURCES_CLEANED=PENDING"
echo "OVERALL_MIGRATION_PROOF=PASS"
echo "═══════════════════════════════════════════════════════════"
