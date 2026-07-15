#!/bin/bash
# ═══════════════════════════════════════════════════════════════
# AmarktAI Network V2 — Disposable MariaDB Migration Proof
# ═══════════════════════════════════════════════════════════════
# This script validates migrations against disposable MariaDB containers.
# It does NOT touch the production database.
# Requires: docker (with daemon), openssl, node, npx (prisma)
# ═══════════════════════════════════════════════════════════════

set -euo pipefail

PREFIX="amarktai-migration-proof-$(date +%s)-$$"
MARIADB_IMAGE="${MARIADB_IMAGE:-mariadb:11}"
FRESH_CONTAINER="${PREFIX}-fresh"
UNMANAGED_CONTAINER="${PREFIX}-unmanaged"
FRESH_DB="proof_fresh_${PREFIX##*-}"
UNMANAGED_DB="proof_unmanaged_${PREFIX##*-}"
NETWORK="${PREFIX}-net"
FRESH_PORT=0
UNMANAGED_PORT=0
ROOT_PASS=""
CLEANED=0
MARIADB_IMAGE_ID=""

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

# ── Stable MariaDB readiness helper ───────────────────────────
# Waits for the MariaDB container to complete initialization and
# become stably ready with two authenticated SQL checks separated
# by a delay. The official MariaDB image starts a temporary server
# during init, shuts it down, then starts the permanent server.
# A single ping is insufficient.

wait_for_mariadb_stable() {
  local CONTAINER="$1"
  local DATABASE="$2"
  local PASSWORD="$3"
  local LABEL="$4"
  local TIMEOUT=120

  echo "[$LABEL] Waiting for MariaDB to become stably ready..."

  # 1. Confirm container is still running
  if ! docker inspect --format='{{.State.Running}}' "$CONTAINER" 2>/dev/null | grep -q true; then
    echo "ERROR: [$LABEL] Container $CONTAINER is not running"
    docker logs --tail 20 "$CONTAINER" 2>&1 || true
    return 1
  fi

  # 2. Wait for initialization completion marker in container logs
  echo "[$LABEL] Waiting for initialization to complete..."
  for i in $(seq 1 "$TIMEOUT"); do
    if docker logs "$CONTAINER" 2>&1 | grep -q "MariaDB init process done. Ready for start up."; then
      echo "[$LABEL] Initialization marker found after ${i}s"
      break
    fi
    if [ "$i" -eq "$TIMEOUT" ]; then
      echo "ERROR: [$LABEL] Initialization did not complete within ${TIMEOUT}s"
      echo "[$LABEL] Recent container logs:"
      docker logs --tail 30 "$CONTAINER" 2>&1 || true
      return 1
    fi
    sleep 1
  done

  # 3. First authenticated SQL check
  echo "[$LABEL] Running first stability check..."
  local SQL_OK=0
  for i in $(seq 1 "$TIMEOUT"); do
    if docker exec "$CONTAINER" mariadb -u root -p"$PASSWORD" "$DATABASE" -N -s -e "SELECT 1" 2>/dev/null | grep -q 1; then
      SQL_OK=1
      echo "[$LABEL] First SQL check passed after ${i}s"
      break
    fi
    if [ "$i" -eq "$TIMEOUT" ]; then
      echo "ERROR: [$LABEL] First SQL check failed within ${TIMEOUT}s"
      echo "[$LABEL] Recent container logs:"
      docker logs --tail 30 "$CONTAINER" 2>&1 || true
      return 1
    fi
    sleep 1
  done

  # 4. Wait at least two seconds for stability
  sleep 2

  # 5. Second authenticated SQL check
  echo "[$LABEL] Running second stability check..."
  if ! docker exec "$CONTAINER" mariadb -u root -p"$PASSWORD" "$DATABASE" -N -s -e "SELECT 1" 2>/dev/null | grep -q 1; then
    echo "ERROR: [$LABEL] Second SQL check failed — server is not stably ready"
    echo "[$LABEL] Recent container logs:"
    docker logs --tail 30 "$CONTAINER" 2>&1 || true
    return 1
  fi

  echo "[$LABEL] MariaDB stably ready"
  return 0
}

# ── Preflight checks ───────────────────────────────────────────

echo "[preflight] Checking prerequisites..."

if ! command -v docker &>/dev/null; then
  echo "ERROR: docker is required but not found"
  exit 1
fi

if ! docker info &>/dev/null; then
  echo "ERROR: docker daemon is not reachable"
  exit 1
fi

if ! command -v openssl &>/dev/null; then
  echo "ERROR: openssl is required but not found"
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

if [ ! -f prisma/schema.prisma ]; then
  echo "ERROR: prisma/schema.prisma not found — run from repository root"
  exit 1
fi

if [ ! -f prisma/migrations/20250701_baseline_fc21a6e/migration.sql ]; then
  echo "ERROR: baseline migration SQL not found"
  exit 1
fi

EXPECTED_MIGRATION_COUNT=0
for migration_dir in prisma/migrations/*; do
  [ -d "$migration_dir" ] || continue
  [ -f "$migration_dir/migration.sql" ] || { echo "ERROR: migration SQL missing in $migration_dir"; exit 1; }
  EXPECTED_MIGRATION_COUNT=$((EXPECTED_MIGRATION_COUNT + 1))
done
[ "$EXPECTED_MIGRATION_COUNT" -gt 1 ] || { echo 'ERROR: migration history is incomplete'; exit 1; }

# Generate password AFTER all command checks pass
ROOT_PASS="${PREFIX}_root_pass_$(openssl rand -hex 8)"

# Record image identity for reproducibility
MARIADB_IMAGE_ID=$(docker image inspect --format='{{.Id}}' "$MARIADB_IMAGE" 2>/dev/null | sed 's/sha256://' || echo "unavailable")

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

wait_for_mariadb_stable "$FRESH_CONTAINER" "$FRESH_DB" "$ROOT_PASS" "fresh"

FRESH_DATABASE_URL="mysql://root:${ROOT_PASS}@127.0.0.1:${FRESH_PORT}/${FRESH_DB}"

echo "[fresh] Running prisma migrate deploy..."
DATABASE_URL="$FRESH_DATABASE_URL" npx prisma migrate deploy --schema=./prisma/schema.prisma

echo "[fresh] Checking migration status..."
DATABASE_URL="$FRESH_DATABASE_URL" npx prisma migrate status --schema=./prisma/schema.prisma

echo "[fresh] Verifying _prisma_migrations..."
MIGRATION_COUNT=$(docker exec "$FRESH_CONTAINER" mariadb -u root -p"$ROOT_PASS" "$FRESH_DB" -N -s -e \
  "SELECT COUNT(*) FROM _prisma_migrations")
if [ "$MIGRATION_COUNT" -ne "$EXPECTED_MIGRATION_COUNT" ]; then
  echo "ERROR: Expected $EXPECTED_MIGRATION_COUNT migrations, got $MIGRATION_COUNT"
  exit 1
fi

for MIGRATION in 20260711_add_job_orchestration 20260714_add_app_capability_grants 20260714_foundational_provider_runtime 20260714_release_candidate 20260715_expand_app_connection_capabilities 20260715_expand_job_prompt; do
  RECORDED=$(docker exec "$FRESH_CONTAINER" mariadb -u root -p"$ROOT_PASS" "$FRESH_DB" -N -s -e \
    "SELECT COUNT(*) FROM _prisma_migrations WHERE migration_name = '$MIGRATION'")
  [ "$RECORDED" -eq 1 ] || { echo "ERROR: Migration not recorded: $MIGRATION"; exit 1; }
done

ALLOWED_CAPABILITIES_LENGTH=$(docker exec "$FRESH_CONTAINER" mariadb -u root -p"$ROOT_PASS" "$FRESH_DB" -N -s -e \
  "SELECT CHARACTER_MAXIMUM_LENGTH FROM information_schema.COLUMNS WHERE TABLE_SCHEMA='$FRESH_DB' AND TABLE_NAME='app_connections' AND COLUMN_NAME='allowed_capabilities'")
[ "${ALLOWED_CAPABILITIES_LENGTH:-0}" -ge 4096 ] || { echo 'ERROR: app_connections.allowed_capabilities is too small'; exit 1; }

JOB_PROMPT_TYPE=$(docker exec "$FRESH_CONTAINER" mariadb -u root -p"$ROOT_PASS" "$FRESH_DB" -N -s -e \
  "SELECT DATA_TYPE FROM information_schema.COLUMNS WHERE TABLE_SCHEMA='$FRESH_DB' AND TABLE_NAME='jobs' AND COLUMN_NAME='prompt'")
[ "$JOB_PROMPT_TYPE" = "text" ] || { echo "ERROR: jobs.prompt has unsafe type $JOB_PROMPT_TYPE"; exit 1; }

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

for COL in enabled token_version; do
  EXISTS=$(docker exec "$FRESH_CONTAINER" mariadb -u root -p"$ROOT_PASS" "$FRESH_DB" -N -s -e \
    "SELECT COUNT(*) FROM information_schema.COLUMNS WHERE TABLE_SCHEMA='$FRESH_DB' AND TABLE_NAME='admin_users' AND COLUMN_NAME='$COL'")
  [ "$EXISTS" -eq 1 ] || { echo "ERROR: admin_users.$COL does not exist"; exit 1; }
done
BOOTSTRAP_TABLE=$(docker exec "$FRESH_CONTAINER" mariadb -u root -p"$ROOT_PASS" "$FRESH_DB" -N -s -e \
  "SELECT COUNT(*) FROM information_schema.TABLES WHERE TABLE_SCHEMA='$FRESH_DB' AND TABLE_NAME='platform_bootstrap_runs'")
[ "$BOOTSTRAP_TABLE" -eq 1 ] || { echo 'ERROR: platform_bootstrap_runs does not exist'; exit 1; }

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
FRESH_DIFF_EXIT=0
FRESH_DIFF=$(DATABASE_URL="$FRESH_DATABASE_URL" npx prisma migrate diff \
  --exit-code \
  --from-url "$FRESH_DATABASE_URL" \
  --to-schema-datamodel ./prisma/schema.prisma \
  --script 2>&1) || FRESH_DIFF_EXIT=$?

if [ "$FRESH_DIFF_EXIT" -eq 2 ]; then
  echo "ERROR: Schema diff is not empty:"
  echo "$FRESH_DIFF"
  exit 1
elif [ "$FRESH_DIFF_EXIT" -ne 0 ]; then
  echo "ERROR: prisma migrate diff failed with exit code $FRESH_DIFF_EXIT"
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

wait_for_mariadb_stable "$UNMANAGED_CONTAINER" "$UNMANAGED_DB" "$ROOT_PASS" "unmanaged"

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

echo "[unmanaged] Verifying all post-baseline migrations were applied..."
MIGRATION_COUNT=$(docker exec "$UNMANAGED_CONTAINER" mariadb -u root -p"$ROOT_PASS" "$UNMANAGED_DB" -N -s -e \
  "SELECT COUNT(*) FROM _prisma_migrations")
if [ "$MIGRATION_COUNT" -ne "$EXPECTED_MIGRATION_COUNT" ]; then
  echo "ERROR: Expected $EXPECTED_MIGRATION_COUNT migrations recorded, got $MIGRATION_COUNT"
  exit 1
fi

for MIGRATION in 20260711_add_job_orchestration 20260714_add_app_capability_grants 20260714_foundational_provider_runtime 20260714_release_candidate 20260715_expand_app_connection_capabilities 20260715_expand_job_prompt; do
  RECORDED=$(docker exec "$UNMANAGED_CONTAINER" mariadb -u root -p"$ROOT_PASS" "$UNMANAGED_DB" -N -s -e \
    "SELECT COUNT(*) FROM _prisma_migrations WHERE migration_name = '$MIGRATION'")
  [ "$RECORDED" -eq 1 ] || { echo "ERROR: Migration not applied: $MIGRATION"; exit 1; }
done

ALLOWED_CAPABILITIES_LENGTH=$(docker exec "$UNMANAGED_CONTAINER" mariadb -u root -p"$ROOT_PASS" "$UNMANAGED_DB" -N -s -e \
  "SELECT CHARACTER_MAXIMUM_LENGTH FROM information_schema.COLUMNS WHERE TABLE_SCHEMA='$UNMANAGED_DB' AND TABLE_NAME='app_connections' AND COLUMN_NAME='allowed_capabilities'")
[ "${ALLOWED_CAPABILITIES_LENGTH:-0}" -ge 4096 ] || { echo 'ERROR: app_connections.allowed_capabilities is too small after migration'; exit 1; }

JOB_PROMPT_TYPE=$(docker exec "$UNMANAGED_CONTAINER" mariadb -u root -p"$ROOT_PASS" "$UNMANAGED_DB" -N -s -e \
  "SELECT DATA_TYPE FROM information_schema.COLUMNS WHERE TABLE_SCHEMA='$UNMANAGED_DB' AND TABLE_NAME='jobs' AND COLUMN_NAME='prompt'")
[ "$JOB_PROMPT_TYPE" = "text" ] || { echo "ERROR: jobs.prompt has unsafe type $JOB_PROMPT_TYPE after migration"; exit 1; }

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

for COL in enabled token_version; do
  EXISTS=$(docker exec "$UNMANAGED_CONTAINER" mariadb -u root -p"$ROOT_PASS" "$UNMANAGED_DB" -N -s -e \
    "SELECT COUNT(*) FROM information_schema.COLUMNS WHERE TABLE_SCHEMA='$UNMANAGED_DB' AND TABLE_NAME='admin_users' AND COLUMN_NAME='$COL'")
  [ "$EXISTS" -eq 1 ] || { echo "ERROR: admin_users.$COL does not exist after migration"; exit 1; }
done
BOOTSTRAP_TABLE=$(docker exec "$UNMANAGED_CONTAINER" mariadb -u root -p"$ROOT_PASS" "$UNMANAGED_DB" -N -s -e \
  "SELECT COUNT(*) FROM information_schema.TABLES WHERE TABLE_SCHEMA='$UNMANAGED_DB' AND TABLE_NAME='platform_bootstrap_runs'")
[ "$BOOTSTRAP_TABLE" -eq 1 ] || { echo 'ERROR: platform_bootstrap_runs does not exist after migration'; exit 1; }

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
UNMANAGED_DIFF_EXIT=0
UNMANAGED_DIFF=$(DATABASE_URL="$UNMANAGED_DATABASE_URL" npx prisma migrate diff \
  --exit-code \
  --from-url "$UNMANAGED_DATABASE_URL" \
  --to-schema-datamodel ./prisma/schema.prisma \
  --script 2>&1) || UNMANAGED_DIFF_EXIT=$?

if [ "$UNMANAGED_DIFF_EXIT" -eq 2 ]; then
  echo "ERROR: Schema diff is not empty:"
  echo "$UNMANAGED_DIFF"
  exit 1
elif [ "$UNMANAGED_DIFF_EXIT" -ne 0 ]; then
  echo "ERROR: prisma migrate diff failed with exit code $UNMANAGED_DIFF_EXIT"
  echo "$UNMANAGED_DIFF"
  exit 1
fi

echo ""
echo "UNMANAGED_DATABASE_PROOF=PASS"
echo "SAMPLE_DATA_SURVIVAL=PASS"

# ════════════════════════════════════════════════════════════════
# CLEANUP VERIFICATION
# ════════════════════════════════════════════════════════════════

echo ""
echo "═══════════════════════════════════════════════════════════"
echo "CLEANUP VERIFICATION"
echo "═══════════════════════════════════════════════════════════"

# Explicitly call cleanup before printing overall success
cleanup

CLEANUP_OK=1

if docker inspect "$FRESH_CONTAINER" &>/dev/null; then
  echo "ERROR: Fresh container still exists after cleanup"
  CLEANUP_OK=0
fi

if docker inspect "$UNMANAGED_CONTAINER" &>/dev/null; then
  echo "ERROR: Unmanaged container still exists after cleanup"
  CLEANUP_OK=0
fi

if docker network inspect "$NETWORK" &>/dev/null; then
  echo "ERROR: Temporary network still exists after cleanup"
  CLEANUP_OK=0
fi

if [ "$CLEANUP_OK" -ne 1 ]; then
  echo "TEMPORARY_RESOURCES_CLEANED=FAIL"
  exit 1
fi

# ════════════════════════════════════════════════════════════════
# SUMMARY
# ════════════════════════════════════════════════════════════════

echo ""
echo "═══════════════════════════════════════════════════════════"
echo "MIGRATION PROOF SUMMARY"
echo "═══════════════════════════════════════════════════════════"
echo "MIGRATION_PROOF_VERSION=1"
echo "MARIADB_IMAGE=$MARIADB_IMAGE"
echo "MARIADB_IMAGE_ID=$MARIADB_IMAGE_ID"
echo "BASELINE_MIGRATION=20250701_baseline_fc21a6e"
echo "ADDITIVE_MIGRATION=20260711_add_job_orchestration"
echo "RELEASE_CANDIDATE_MIGRATION=20260714_release_candidate"
echo "APP_CONNECTION_CAPABILITIES_MIGRATION=20260715_expand_app_connection_capabilities"
echo "JOB_PROMPT_MIGRATION=20260715_expand_job_prompt"
echo "MIGRATION_COUNT=$EXPECTED_MIGRATION_COUNT"
echo "FRESH_DATABASE_PROOF=PASS"
echo "UNMANAGED_DATABASE_PROOF=PASS"
echo "SAMPLE_DATA_SURVIVAL=PASS"
echo "FRESH_SCHEMA_DIFF=EMPTY"
echo "UNMANAGED_SCHEMA_DIFF=EMPTY"
echo "TEMPORARY_RESOURCES_CLEANED=PASS"
echo "OVERALL_MIGRATION_PROOF=PASS"
echo "═══════════════════════════════════════════════════════════"
