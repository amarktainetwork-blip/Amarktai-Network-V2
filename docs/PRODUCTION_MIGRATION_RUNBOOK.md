# Production Recovery and Migration Runbook

This is the current operating procedure for a fresh installation, a broken existing stack, or a healthy upgrade of AmarktAI Network V2.

It replaces the obsolete Phase 1 two-migration instructions. Always use the complete migration history and scripts from the exact release SHA being deployed.

## Non-negotiable safety rules

- Never run `prisma db push` in production.
- Never use `--accept-data-loss`.
- Never delete MariaDB, Redis, Qdrant or artifact volumes to solve an application error.
- Never resolve the baseline migration on an empty database.
- Never deploy an unpinned branch name.
- Back up MariaDB, artifacts and Qdrant before changing schema or services.
- Keep the previous immutable application images until strict live proof passes.

## 1. Select the correct deployment path

### Healthy-stack upgrade

Use `deploy/deploy.sh` only when the current MariaDB, Redis, Qdrant, API, worker and dashboard are healthy and the current API reports a valid rollback SHA.

### Fresh or broken-stack recovery

Use this runbook when the API will not start, login is unknown, MariaDB credentials are wrong, migrations are incomplete, containers are missing, the current build SHA is unavailable, or this is a first installation.

Do not weaken the normal production preflight to force an unhealthy stack through the upgrade path.

## 2. Pin the exact release

```bash
cd /var/www/Amarktai-Network-V2
git fetch --prune origin feat/production-activation-music-longform
export DEPLOY_SHA="$(git rev-parse origin/feat/production-activation-music-longform)"
[[ "$DEPLOY_SHA" =~ ^[0-9a-f]{40}$ ]]
test -z "$(git status --porcelain)"
git switch --detach "$DEPLOY_SHA"
[[ "$(git rev-parse HEAD)" == "$DEPLOY_SHA" ]]

export GIT_SHA="$DEPLOY_SHA"
export BUILD_TIME="$(date -u +%Y-%m-%dT%H:%M:%SZ)"
export APP_VERSION=1.0.0
```

## 3. Validate `.env`

```bash
test -f .env
chmod 600 .env
docker compose config --quiet
```

Required real values:

```text
MYSQL_ROOT_PASSWORD
MYSQL_DATABASE
MYSQL_USER
MYSQL_PASSWORD
DATABASE_URL
REDIS_URL
QDRANT_URL
JWT_SECRET
PROVIDER_KEY_ENCRYPTION_SECRET
ADMIN_EMAIL
ADMIN_PASSWORD
STORAGE_ROOT
PUBLIC_API_URL
GENX_BASE_URL
GENX_API_KEY or encrypted stored GenX credential
TOGETHER_API_KEY or encrypted stored Together credential
DEEPINFRA_API_KEY or encrypted stored DeepInfra credential
```

Provider policy is fixed:

- GenX, Together and DeepInfra are runtime providers.
- MiMo is coding-agent-only.
- Groq is removed and must not be configured.

The compose runtime uses `mariadb` as the database hostname. A `DATABASE_URL` containing `localhost` will not work from inside the API or worker containers.

## 4. Inventory and back up existing state

```bash
export BACKUP_ROOT="/var/backups/amarktai/$(date -u +%Y%m%dT%H%M%SZ)-${DEPLOY_SHA:0:12}"
mkdir -p "$BACKUP_ROOT"
chmod 700 "$BACKUP_ROOT"
docker compose ps -a
```

### MariaDB backup

When an existing MariaDB contains production data:

```bash
docker compose exec -T mariadb sh -c \
  'mariadb-dump -uroot -p"$MYSQL_ROOT_PASSWORD" --single-transaction --routines --events "$MYSQL_DATABASE"' \
  > "$BACKUP_ROOT/mariadb.sql"
test -s "$BACKUP_ROOT/mariadb.sql"
```

### Artifact-volume backup

```bash
API_CONTAINER="$(docker compose ps -a -q api)"
if [ -n "$API_CONTAINER" ]; then
  API_IMAGE="$(docker inspect --format '{{.Image}}' "$API_CONTAINER")"
  ARTIFACT_VOLUME="$(docker inspect --format '{{range .Mounts}}{{if eq .Destination "/var/www/amarktai/storage"}}{{.Name}}{{end}}{{end}}' "$API_CONTAINER")"
  test -n "$ARTIFACT_VOLUME"
  docker run --rm --entrypoint tar \
    --mount "type=volume,src=$ARTIFACT_VOLUME,dst=/source,readonly" \
    --mount "type=bind,src=$BACKUP_ROOT,dst=/backup" \
    "$API_IMAGE" -C /source -cf /backup/artifacts.tar .
  tar -tf "$BACKUP_ROOT/artifacts.tar" >/dev/null
fi
```

### Qdrant-volume backup

Stop writes before copying Qdrant storage:

```bash
QDRANT_CONTAINER="$(docker compose ps -a -q qdrant)"
if [ -n "$QDRANT_CONTAINER" ] && [ -n "${API_IMAGE:-}" ]; then
  QDRANT_VOLUME="$(docker inspect --format '{{range .Mounts}}{{if eq .Destination "/qdrant/storage"}}{{.Name}}{{end}}{{end}}' "$QDRANT_CONTAINER")"
  test -n "$QDRANT_VOLUME"
  docker stop "$QDRANT_CONTAINER"
  docker run --rm --entrypoint tar \
    --mount "type=volume,src=$QDRANT_VOLUME,dst=/source,readonly" \
    --mount "type=bind,src=$BACKUP_ROOT,dst=/backup" \
    "$API_IMAGE" -C /source -cf /backup/qdrant.tar .
  tar -tf "$BACKUP_ROOT/qdrant.tar" >/dev/null
  docker start "$QDRANT_CONTAINER"
fi
```

Create and verify checksums:

```bash
cd "$BACKUP_ROOT"
sha256sum ./* > SHA256SUMS
sha256sum -c SHA256SUMS
cd /var/www/Amarktai-Network-V2
```

Stop if an expected backup is empty or unreadable.

## 5. Build and test the exact candidate

```bash
npm ci --ignore-scripts
npx prisma validate --schema=./prisma/schema.prisma
npx prisma generate --schema=./prisma/schema.prisma
npm run build:backend
npm test
npm run build
npm run audit
npm run proof
node scripts/proof-direct-provider-capabilities.mjs --static --strict
docker compose build --pull api worker dashboard
```

Any failure blocks deployment.

## 6. Start infrastructure

```bash
docker compose up -d mariadb redis qdrant

docker compose exec -T mariadb sh -c \
  'mariadb-admin ping -uroot -p"$MYSQL_ROOT_PASSWORD" --silent'
docker compose exec -T redis redis-cli ping | grep -qx PONG
curl --fail --silent --show-error http://127.0.0.1:6333/healthz >/dev/null
```

An existing MariaDB volume keeps the credentials created when that volume was initialized. Changing `.env` alone does not change those database users. Correct the actual MariaDB user/password before continuing when authentication fails.

## 7. Apply Prisma migrations safely

Check status:

```bash
docker compose run --rm --entrypoint npx api \
  prisma migrate status --schema=./prisma/schema.prisma || true
```

### Fresh database

Do not resolve the baseline manually. Apply the entire history:

```bash
docker compose run --rm migrate
```

### Existing Prisma-managed database

```bash
docker compose run --rm migrate
docker compose run --rm --entrypoint npx api \
  prisma migrate status --schema=./prisma/schema.prisma
```

### Existing unmanaged historical database

Only when the database is non-empty, `_prisma_migrations` is absent, a verified backup exists, and schema comparison proves it matches the historical baseline represented by `20250701_baseline_fc21a6e`:

```bash
docker compose run --rm --entrypoint npx api \
  prisma migrate resolve --applied 20250701_baseline_fc21a6e \
  --schema=./prisma/schema.prisma

docker compose run --rm migrate
```

Never edit or drop `_prisma_migrations` to hide a failed migration.

## 8. Verify the mandatory schema level

The API must require:

```text
20260718_complete_platform_recovery
```

Confirm code and database agree:

```bash
grep -n "REQUIRED_SCHEMA_MIGRATION" packages/db/src/schema-guard.ts

docker compose exec -T mariadb sh -c \
  'mariadb -uroot -p"$MYSQL_ROOT_PASSWORD" "$MYSQL_DATABASE" -Nse "SELECT migration_name FROM _prisma_migrations WHERE migration_name=\"20260718_complete_platform_recovery\" AND finished_at IS NOT NULL AND rolled_back_at IS NULL"' \
  | grep -qx 20260718_complete_platform_recovery
```

## 9. Start API, worker and dashboard

```bash
docker compose up -d --no-build api worker dashboard
docker compose ps

curl --fail --silent --show-error http://127.0.0.1:3001/health | jq .
curl --fail --silent --show-error http://127.0.0.1:3002/health | jq .
curl --fail --silent --show-error http://127.0.0.1:3000/api/build-identity | jq .
```

All three services must report the exact `DEPLOY_SHA`.

## 10. Recover an existing administrator password

Fresh databases use the normal idempotent admin bootstrap. For an existing administrator whose password is unknown, run the explicit one-shot recovery command:

```bash
export ADMIN_EMAIL='amarktainetwork@gmail.com'
export ADMIN_RESET_PASSWORD='<new-strong-password>'
export CONFIRM_ADMIN_PASSWORD_RESET="$ADMIN_EMAIL"

docker compose run --rm \
  -e ADMIN_EMAIL \
  -e ADMIN_RESET_PASSWORD \
  -e CONFIRM_ADMIN_PASSWORD_RESET \
  --entrypoint node api scripts/admin-reset-password.mjs

unset ADMIN_RESET_PASSWORD CONFIRM_ADMIN_PASSWORD_RESET
```

The command refuses to create an unknown account, requires confirmation, hashes the replacement password, re-enables the existing account and increments `tokenVersion` so previous tokens become invalid.

Verify both login paths:

```bash
export ADMIN_PASSWORD='<new-strong-password>'
LOGIN_PAYLOAD="$(node -e 'process.stdout.write(JSON.stringify({email:process.env.ADMIN_EMAIL,password:process.env.ADMIN_PASSWORD}))')"

curl --fail --silent --show-error \
  -H 'content-type: application/json' -d "$LOGIN_PAYLOAD" \
  http://127.0.0.1:3001/api/v1/auth/login | jq .

curl --fail --silent --show-error \
  -H 'content-type: application/json' -d "$LOGIN_PAYLOAD" \
  http://127.0.0.1:3000/api/auth/login | jq .
```

## 11. Verify Nginx and HTTPS

All published compose ports bind to `127.0.0.1`. Nginx is the public entry point.

```bash
nginx -t
curl --fail --silent --show-error "$PUBLIC_API_URL/api/system/health" | jq .
```

## 12. Prove real providers

```bash
export PROOF_API_URL=http://127.0.0.1:3001
npm run proof:authenticated-discovery
node scripts/proof-direct-provider-capabilities.mjs --live --strict
```

GenX, Together and DeepInfra must each pass authenticated account-aware discovery and live tests. MiMo remains coding-only. Groq must be absent.

## 13. Run the strict production release proof

```bash
PROOF_FILE="$BACKUP_ROOT/release-proof-${DEPLOY_SHA}.json"
node scripts/proof-production-release-candidate.mjs \
  --base-url http://127.0.0.1:3000 \
  --strict \
  --long-form \
  --json-output "$PROOF_FILE"
chmod 600 "$PROOF_FILE"
```

Acceptance requires zero failures and zero skips. The proof covers infrastructure, authentication, canonical truth, app grants, providers, real jobs, fallbacks, queues, authorised artifacts and long-form multimedia assembly.

## Release checklist

- [ ] Exact SHA pinned and built.
- [ ] `.env` is complete and secure.
- [ ] MariaDB backup verified.
- [ ] Artifact backup verified.
- [ ] Qdrant backup verified.
- [ ] Build, tests, audit and static proofs pass.
- [ ] All migrations are applied.
- [ ] Latest mandatory migration is present.
- [ ] API, worker and dashboard report the same SHA.
- [ ] Existing admin password recovered when required.
- [ ] API and dashboard-proxy login pass.
- [ ] Nginx and public HTTPS pass.
- [ ] GenX, Together and DeepInfra live tests pass.
- [ ] MiMo remains coding-only.
- [ ] Groq remains absent.
- [ ] Strict production proof reports zero failures and skips.
- [ ] Proof JSON and rollback images are retained.

## Rollback

Application rollback and data restoration are separate operations. For additive migrations, restore the previous immutable API, worker and dashboard images while leaving the migrated database intact. Restore MariaDB, artifact or Qdrant backups only when data integrity is damaged, with API and worker stopped and backup checksums verified.
