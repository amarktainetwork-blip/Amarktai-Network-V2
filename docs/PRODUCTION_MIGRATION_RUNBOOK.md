# Production Recovery and Migration Runbook

This is the operating procedure for bringing AmarktAI Network V2 live from either a fresh installation, a broken existing stack, or a healthy existing deployment.

It replaces the obsolete Phase 1 two-migration instructions. The repository now contains a full ordered Prisma migration history. Always use the migration files present in the exact release SHA being deployed.

## Safety rules

- Never run `prisma db push` against production.
- Never use `--accept-data-loss`.
- Never delete Docker volumes to solve a schema, login or provider problem.
- Never mark a baseline migration as applied on an empty database.
- Never deploy a branch without pinning its exact 40-character SHA.
- Back up MariaDB, artifact storage and Qdrant before changing code or schema.
- Keep the previous API, worker and dashboard images until strict post-deploy proof passes.

## 1. Choose the correct path

### Path A — healthy-stack upgrade

Use `deploy/deploy.sh` only when all current production services are healthy, the current API reports a valid rollback SHA and the deployment preflight passes.

### Path B — fresh or broken-stack recovery

Use the manual recovery procedure below when any of these is true:

- the API does not start;
- login is broken and the administrator state is unknown;
- MariaDB credentials are invalid;
- migrations are incomplete or inconsistent;
- containers or volumes are missing;
- the current API cannot report a rollback SHA;
- this is the first installation.

Do not weaken `deploy/preflight.sh` merely to force Path A through an unhealthy system.

## 2. Pin the release source

```bash
cd /var/www/Amarktai-Network-V2
git fetch --prune origin feat/production-activation-music-longform
export DEPLOY_SHA="$(git rev-parse origin/feat/production-activation-music-longform)"
[[ "$DEPLOY_SHA" =~ ^[0-9a-f]{40}$ ]]
git status --short
```

The worktree must be clean. Preserve local changes elsewhere before continuing.

For controlled recovery, detach at the exact remote commit:

```bash
git switch --detach "$DEPLOY_SHA"
[[ "$(git rev-parse HEAD)" == "$DEPLOY_SHA" ]]
export GIT_SHA="$DEPLOY_SHA"
export BUILD_TIME="$(date -u +%Y-%m-%dT%H:%M:%SZ)"
export APP_VERSION="1.0.0"
```

## 3. Validate production configuration

```bash
test -f .env
chmod 600 .env
```

Required values must be real, non-placeholder values:

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

Provider policy:

- GenX, Together and DeepInfra are backend runtime providers.
- MiMo is coding-agent-only.
- Groq is removed and must not be configured.

Validate that the MariaDB values agree. The compose runtime constructs `DATABASE_URL` from `MYSQL_USER`, `MYSQL_PASSWORD` and `MYSQL_DATABASE`; a separately written host-style `DATABASE_URL` must not point to `localhost` from inside containers.

```bash
docker compose config --quiet
```

## 4. Inventory and back up the current system

Create a timestamped backup directory:

```bash
export BACKUP_ROOT="/var/backups/amarktai/$(date -u +%Y%m%dT%H%M%SZ)-${DEPLOY_SHA:0:12}"
mkdir -p "$BACKUP_ROOT"
chmod 700 "$BACKUP_ROOT"
```

### MariaDB

When the current MariaDB container is available:

```bash
docker compose exec -T mariadb sh -c \
  'mariadb-dump -uroot -p"$MYSQL_ROOT_PASSWORD" --single-transaction --routines --events "$MYSQL_DATABASE"' \
  > "$BACKUP_ROOT/mariadb.sql"
test -s "$BACKUP_ROOT/mariadb.sql"
```

### Artifact volume

```bash
API_CONTAINER="$(docker compose ps -q api 2>/dev/null || true)"
if [ -n "$API_CONTAINER" ]; then
  ARTIFACT_VOLUME="$(docker inspect --format '{{range .Mounts}}{{if eq .Destination "/var/www/amarktai/storage"}}{{.Name}}{{end}}{{end}}' "$API_CONTAINER")"
  test -n "$ARTIFACT_VOLUME"
  docker run --rm \
    --mount "type=volume,src=$ARTIFACT_VOLUME,dst=/source,readonly" \
    --mount "type=bind,src=$BACKUP_ROOT,dst=/backup" \
    alpine:3.20 tar -C /source -cf /backup/artifacts.tar .
  tar -tf "$BACKUP_ROOT/artifacts.tar" >/dev/null
fi
```

### Qdrant volume

```bash
QDRANT_CONTAINER="$(docker compose ps -q qdrant 2>/dev/null || true)"
if [ -n "$QDRANT_CONTAINER" ]; then
  QDRANT_VOLUME="$(docker inspect --format '{{range .Mounts}}{{if eq .Destination "/qdrant/storage"}}{{.Name}}{{end}}{{end}}' "$QDRANT_CONTAINER")"
  test -n "$QDRANT_VOLUME"
  docker run --rm \
    --mount "type=volume,src=$QDRANT_VOLUME,dst=/source,readonly" \
    --mount "type=bind,src=$BACKUP_ROOT,dst=/backup" \
    alpine:3.20 tar -C /source -cf /backup/qdrant.tar .
  tar -tf "$BACKUP_ROOT/qdrant.tar" >/dev/null
fi
```

Create checksums:

```bash
cd "$BACKUP_ROOT"
sha256sum ./* > SHA256SUMS
sha256sum -c SHA256SUMS
cd /var/www/Amarktai-Network-V2
```

Do not continue when an expected backup is empty or unreadable.

## 5. Build the exact release

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

## 6. Start infrastructure only

```bash
docker compose up -d mariadb redis qdrant
```

Verify:

```bash
docker compose exec -T mariadb sh -c 'mariadb-admin ping -uroot -p"$MYSQL_ROOT_PASSWORD" --silent'
docker compose exec -T redis redis-cli ping | grep -qx PONG
curl --fail --silent --show-error http://127.0.0.1:6333/healthz >/dev/null
```

If MariaDB authentication fails, correct `MYSQL_ROOT_PASSWORD`, `MYSQL_USER`, `MYSQL_PASSWORD` and the existing database user before attempting Prisma migrations. Recreating application containers does not change credentials stored in an existing MariaDB volume.

## 7. Determine database state

```bash
docker compose run --rm --entrypoint npx api \
  prisma migrate status --schema=./prisma/schema.prisma || true
```

### Fresh database

A fresh database should contain no application tables. Do not resolve the baseline manually. Apply the entire migration history normally:

```bash
docker compose run --rm migrate
```

### Existing Prisma-managed database

When `_prisma_migrations` exists, run:

```bash
docker compose run --rm migrate
docker compose run --rm --entrypoint npx api \
  prisma migrate status --schema=./prisma/schema.prisma
```

### Existing unmanaged baseline database

Only use baseline resolution when all of the following are true:

1. the production database contains the historical application schema;
2. `_prisma_migrations` is absent;
3. a verified MariaDB backup exists;
4. schema inspection proves the database matches the repository baseline represented by `20250701_baseline_fc21a6e`;
5. the database is not empty.

Then mark only the baseline as applied without executing it:

```bash
docker compose run --rm --entrypoint npx api \
  prisma migrate resolve --applied 20250701_baseline_fc21a6e \
  --schema=./prisma/schema.prisma
```

Apply every later migration in order:

```bash
docker compose run --rm migrate
docker compose run --rm --entrypoint npx api \
  prisma migrate status --schema=./prisma/schema.prisma
```

If Prisma reports a failed migration, schema drift or an unexpected operation, stop. Do not edit `_prisma_migrations`, drop the table or use `db push` as a shortcut.

## 8. Verify the latest required migration

The API schema guard must name the latest production-required migration in `packages/db/src/schema-guard.ts`. It must not stop at an older release migration while newer required migrations exist.

Check the latest migration directory:

```bash
LATEST_MIGRATION="$(find prisma/migrations -mindepth 1 -maxdepth 1 -type d -printf '%f\n' | sort | tail -n 1)"
echo "$LATEST_MIGRATION"
grep -n "REQUIRED_SCHEMA_MIGRATION" packages/db/src/schema-guard.ts
```

Before release, these must agree with the intended latest mandatory migration. Then confirm it is applied:

```bash
docker compose exec -T mariadb sh -c \
  'mariadb -uroot -p"$MYSQL_ROOT_PASSWORD" "$MYSQL_DATABASE" -Nse "SELECT migration_name FROM _prisma_migrations WHERE finished_at IS NOT NULL AND rolled_back_at IS NULL ORDER BY migration_name"' \
  | tail
```

## 9. Start the application services

```bash
docker compose up -d --no-build api worker dashboard
```

Verify all services:

```bash
docker compose ps
curl --fail --silent --show-error http://127.0.0.1:3001/health | jq .
curl --fail --silent --show-error http://127.0.0.1:3002/health | jq .
curl --fail --silent --show-error http://127.0.0.1:3000/api/build-identity | jq .
```

API, worker and dashboard must report the same `GIT_SHA`.

## 10. Recover administrator access

On a fresh database the API creates the configured administrator when `ADMIN_BOOTSTRAP_POLICY=required_if_missing` and `ADMIN_PASSWORD` is present.

On an existing database, changing `.env` does not change an existing administrator password. Use the repository's explicit administrator password-reset command once it is implemented; do not delete the administrator row or the database.

Until that command exists, administrator password recovery is a release blocker for any deployment where the existing password is unknown.

Verify login after recovery:

```bash
export ADMIN_EMAIL ADMIN_PASSWORD
LOGIN_PAYLOAD="$(node -e 'process.stdout.write(JSON.stringify({email:process.env.ADMIN_EMAIL,password:process.env.ADMIN_PASSWORD}))')"

curl --fail --silent --show-error \
  -H 'content-type: application/json' \
  -d "$LOGIN_PAYLOAD" \
  http://127.0.0.1:3001/api/v1/auth/login | jq .

curl --fail --silent --show-error \
  -H 'content-type: application/json' \
  -d "$LOGIN_PAYLOAD" \
  http://127.0.0.1:3000/api/auth/login | jq .
```

## 11. Verify Nginx and public HTTPS

```bash
nginx -t
curl --fail --silent --show-error "$PUBLIC_API_URL/api/system/health" | jq .
```

Only Nginx should accept public HTTP/HTTPS traffic. MariaDB, Redis and Qdrant must not be internet-exposed.

## 12. Run authenticated discovery and real provider tests

```bash
export PROOF_API_URL="http://127.0.0.1:3001"
npm run proof:authenticated-discovery
node scripts/proof-direct-provider-capabilities.mjs --live --strict
```

Expected runtime providers are GenX, Together and DeepInfra. MiMo is coding-only. Groq must not appear.

Configuration alone is not proof. Every runtime provider must return a successful authenticated live test with a usable account-accessible model.

## 13. Run strict production proof

```bash
PROOF_FILE="$BACKUP_ROOT/release-proof-${DEPLOY_SHA}.json"
node scripts/proof-production-release-candidate.mjs \
  --base-url http://127.0.0.1:3000 \
  --strict \
  --long-form \
  --json-output "$PROOF_FILE"
chmod 600 "$PROOF_FILE"
```

Strict mode must finish with zero failures and zero skips. It validates infrastructure, authentication, canonical truth, grants, live provider tests, release capabilities, queues, artifacts, fallback evidence and long-form multimedia assembly.

## 14. Promotion checklist

- [ ] Exact release SHA checked out.
- [ ] `.env` contains no placeholders and has secure permissions.
- [ ] MariaDB backup verified.
- [ ] Artifact backup verified.
- [ ] Qdrant backup verified.
- [ ] Static build and test gate passed.
- [ ] All Prisma migrations applied successfully.
- [ ] Schema guard points to the latest required migration.
- [ ] API, worker and dashboard report the same SHA.
- [ ] Administrator login works through API and dashboard proxy.
- [ ] Nginx and HTTPS work.
- [ ] GenX live test passes.
- [ ] Together live test passes.
- [ ] DeepInfra live test passes.
- [ ] MiMo remains coding-only.
- [ ] Groq is absent.
- [ ] Strict production proof has zero failures and skips.
- [ ] Release proof JSON is stored securely.
- [ ] Previous immutable images and backups remain available.

## Rollback

Application rollback and database restore are separate decisions.

When migrations are additive and data remains valid, restore the previous immutable API, worker and dashboard images while leaving the migrated database intact.

Restore MariaDB, artifact or Qdrant backups only when data or migration integrity is damaged. Stop API and worker first, verify the chosen backup checksums, restore all dependent state consistently, and then run migration status and health checks before reopening traffic.
