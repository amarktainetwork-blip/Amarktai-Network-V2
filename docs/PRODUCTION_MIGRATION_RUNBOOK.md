# Production Migration Runbook — Phase 1

## Overview

This runbook documents the first controlled migration of the existing unmanaged production database (fc21a6e baseline) to the Prisma-managed two-migration structure.

**Migration structure:**
1. `20250701_baseline_fc21a6e` — Represents the existing deployed schema
2. `20260711_add_job_orchestration` — Adds durable long-form orchestration fields

**Branch:** `feat/production-activation-music-longform`

---

## Pre-Deployment Checklist

### 1. Confirm Source and Migration SHAs

```bash
git rev-parse HEAD
# Verify matches expected candidate SHA
```

### 2. Verify Backup

```bash
ls -la /var/backups/amarktai/20260713_004320_fc21a6edd5af/
sha256sum -c SHA256SUMS
```

Verify:
- Valid MariaDB dump exists
- Artifact archive exists
- Qdrant archive exists
- All checksums pass

### 3. Verify Target Database Matches Baseline

```bash
# Compare live schema against the baseline migration
npx prisma migrate diff \
  --from-url "$DATABASE_URL" \
  --to-schema-datamodel prisma/schema.prisma \
  --script
```

The diff should show only the additive migration operations (8 columns, 4 indexes, 1 FK).

### 4. Capture Row Counts

```bash
mariadb -u "$DB_USER" -p"$DB_PASS" "$DB_NAME" -e "
  SELECT 'jobs' AS tbl, COUNT(*) AS cnt FROM jobs
  UNION ALL
  SELECT 'artifacts', COUNT(*) FROM artifacts
  UNION ALL
  SELECT 'brain_events', COUNT(*) FROM brain_events
  UNION ALL
  SELECT 'admin_users', COUNT(*) FROM admin_users;
"
```

Record these values for post-migration comparison.

---

## Migration Procedure

### Step 1: Check Migration Status

```bash
npx prisma migrate status
```

Expected: Both migrations should show as **not applied** (no `_prisma_migrations` table exists).

### Step 2: Mark Baseline as Applied

Because the production database already matches the baseline schema, mark it as applied **without executing it**:

```bash
npx prisma migrate resolve --applied 20250701_baseline_fc21a6e
```

> **CRITICAL:** Do NOT mark the baseline as applied on an empty database.
> Only mark it applied when the live schema already matches the baseline.

### Step 3: Apply Additive Migration

```bash
npx prisma migrate deploy
```

This applies only `20260711_add_job_orchestration`.

### Step 4: Verify Migration Status

```bash
npx prisma migrate status
```

Expected: Both migrations should show as **applied**.

### Step 5: Verify Schema

```bash
# Verify all eight columns exist
mariadb -u "$DB_USER" -p"$DB_PASS" "$DB_NAME" -e "
  SELECT COLUMN_NAME FROM information_schema.COLUMNS
  WHERE TABLE_SCHEMA = '$DB_NAME' AND TABLE_NAME = 'jobs'
  AND COLUMN_NAME IN (
    'execution_id', 'parent_job_id', 'provider_claim_at',
    'queue_job_id', 'queued_at', 'retry_count',
    'scene_number', 'workflow_phase'
  );
"

# Verify all four indexes exist
mariadb -u "$DB_USER" -p"$DB_PASS" "$DB_NAME" -e "
  SELECT INDEX_NAME FROM information_schema.STATISTICS
  WHERE TABLE_SCHEMA = '$DB_NAME' AND TABLE_NAME = 'jobs'
  AND INDEX_NAME IN (
    'jobs_parent_job_id_idx', 'jobs_execution_id_idx',
    'jobs_app_slug_execution_id_idx', 'jobs_parent_job_id_scene_number_idx'
  );
"

# Verify self-referencing foreign key
mariadb -u "$DB_USER" -p"$DB_PASS" "$DB_NAME" -e "
  SELECT CONSTRAINT_NAME FROM information_schema.TABLE_CONSTRAINTS
  WHERE TABLE_SCHEMA = '$DB_NAME' AND TABLE_NAME = 'jobs'
  AND CONSTRAINT_NAME = 'jobs_parent_job_id_fkey';
"
```

### Step 6: Verify Data Integrity

```bash
mariadb -u "$DB_USER" -p"$DB_PASS" "$DB_NAME" -e "
  SELECT 'jobs' AS tbl, COUNT(*) AS cnt FROM jobs
  UNION ALL
  SELECT 'artifacts', COUNT(*) FROM artifacts
  UNION ALL
  SELECT 'brain_events', COUNT(*) FROM brain_events;
"
```

Compare with pre-migration counts. All counts must match.

### Step 7: Verify Schema Diff is Empty

```bash
npx prisma migrate diff \
  --from-url "$DATABASE_URL" \
  --to-schema-datamodel prisma/schema.prisma \
  --script
```

Required: empty output (no pending changes).

---

## Post-Migration Verification

### Start Application Services

```bash
# Start API
docker compose up -d api

# Verify API health
curl -s http://localhost:3001/health | jq .

# Start Worker
docker compose up -d worker

# Verify Worker health
docker compose logs worker --tail 20
```

### Verify Build Identity

```bash
curl -s http://localhost:3001/health | jq '.build'
```

Expected:
```json
{
  "gitSha": "<actual commit SHA>",
  "buildTime": "<ISO timestamp>",
  "serviceName": "amarktai-api",
  "version": "<package version>"
}
```

---

## Safety Rules

| Rule | Enforcement |
|------|------------|
| Never run `db push` in production | Script checks, tests |
| Never use `accept-data-loss` | Script checks, tests |
| API/worker do not run migrations | Entrypoint only checks `migrate status` |
| Migration deploy is a distinct operator action | Separate script/service |
| Prisma does not provide automatic down migrations | Manual restore required |
| Baseline must never be marked applied on empty DB | Operator judgment |
| Additive migration must not be applied if operations exist | `migrate resolve` + `migrate deploy` |

---

## Rollback Guidance

> **Important:** Application rollback and database restore are separate operations.

### Application Rollback (No Database Restore Required)

If the migration succeeded but the application has issues:

1. Stop the new application version
2. Restore previous immutable application image
3. Restart with the previous image
4. No database changes needed (additive columns are nullable/defaulted)

### Database Restore (If Migration Failed or Data Integrity Issues)

1. Stop all application services (API, worker)
2. Restore from validated backup:
   ```bash
   mariadb -u root -p"$ROOT_PASS" "$DB_NAME" < /var/backups/amarktai/20260713_004320_fc21a6edd5af/dump.sql
   ```
3. Clear Prisma migration history if corrupted:
   ```bash
   mariadb -u root -p"$ROOT_PASS" "$DB_NAME" -e "DROP TABLE IF EXISTS _prisma_migrations;"
   ```
4. Re-run the migration procedure from Step 1
5. Restart application services

### Do NOT:

- Guess or manually delete migration history
- Use `db push` to "fix" schema
- Use `accept-data-loss` under any circumstances
- Skip backup verification before attempting restore

---

## Emergency Contacts

- Database admin: [your DBA]
- DevOps: [your DevOps team]
- Application owner: [your name]

---

## Checklist Summary

- [ ] Backup verified (SHA256SUMS pass)
- [ ] Target database matches fc21a6e baseline
- [ ] Row counts captured
- [ ] `prisma migrate status` checked
- [ ] Baseline marked as applied (not executed)
- [ ] Additive migration deployed
- [ ] All 8 columns verified
- [ ] All 4 indexes verified
- [ ] Foreign key verified
- [ ] Row counts match pre-migration
- [ ] Schema diff is empty
- [ ] API health verified
- [ ] Worker health verified
- [ ] Build identity verified
