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
- Never run the complete deployment script with `sudo`; only the Nginx configuration test receives controlled elevation.
- Production activation requires `sudo nginx -t` to complete with no warnings, alerts or errors.

## 1. Select the correct deployment path

### Healthy-stack upgrade

Use `deploy/deploy.sh` only when the current MariaDB, Redis, Qdrant, API, worker and dashboard are healthy and the current API reports a valid rollback SHA.

Before deployment, validate the host Nginx configuration as root-readable production configuration:

```bash
sudo -v
sudo nginx -t
```

The expected result is clean output ending in both `syntax is ok` and `test is successful`. Fix deprecated directives such as `listen ... http2` before deployment; warnings are release blockers.

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

```bash
QDRANT_CONTAINER="$(docker compose ps -a -q qdrant)"
if [ -n "$QDRANT_CONTAINER" ]; then
  QDRANT_IMAGE="$(docker inspect --format '{{.Image}}' "$QDRANT_CONTAINER")"
  QDRANT_VOLUME="$(docker inspect --format '{{range .Mounts}}{{if eq .Destination "/qdrant/storage"}}{{.Name}}{{end}}{{end}}' "$QDRANT_CONTAINER")"
  test -n "$QDRANT_VOLUME"
  docker run --rm --entrypoint tar \
    --mount "type=volume,src=$QDRANT_VOLUME,dst=/source,readonly" \
    --mount "type=bind,src=$BACKUP_ROOT,dst=/backup" \
    "$QDRANT_IMAGE" -C /source -cf /backup/qdrant.tar .
  tar -tf "$BACKUP_ROOT/qdrant.tar" >/dev/null
fi
```

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
bash -n deploy/nginx-check.sh
bash -n deploy/preflight.sh
bash -n deploy/deploy.sh
docker compose config --quiet
docker compose build --pull api worker dashboard
```

Do not continue if any command fails.

## 6. Apply migrations normally

Inspect current migration state:

```bash
docker compose run --rm --entrypoint npx api prisma migrate status --schema=./prisma/schema.prisma || true
```

Apply the complete checked-in migration history:

```bash
docker compose run --rm --entrypoint npx api prisma migrate deploy --schema=./prisma/schema.prisma
docker compose run --rm --entrypoint npx api prisma migrate status --schema=./prisma/schema.prisma
```

The current recovery migration chain must include `20260718_complete_platform_recovery` and every later checked-in migration required by the release SHA.

For a disposable proof of fresh and previously unmanaged database recovery, run:

```bash
bash scripts/verify-migrations-disposable.sh
```

Required result:

```text
FRESH_DATABASE_PROOF=PASS
UNMANAGED_DATABASE_PROOF=PASS
```

## 7. Start application services

```bash
export GIT_SHA="$DEPLOY_SHA"
export BUILD_TIME="$(date -u +%Y-%m-%dT%H:%M:%SZ)"
docker compose up -d --no-build api worker dashboard
```

Wait for health:

```bash
for url in \
  http://127.0.0.1:3001/health \
  http://127.0.0.1:3002/health \
  http://127.0.0.1:3000/api/build-identity
 do
  for _ in $(seq 1 60); do
    curl -fsS --max-time 5 "$url" >/dev/null && break
    sleep 2
  done
  curl -fsS --max-time 5 "$url"
done
```

Confirm all three services report the exact release SHA.

## 8. Recover administrator access only when required

The normal path is to use the existing administrator password. Do not reset it unless login is genuinely unavailable.

For an existing administrator only:

```bash
read -rsp 'New administrator password: ' ADMIN_RESET_PASSWORD
echo
export ADMIN_RESET_PASSWORD
export ADMIN_EMAIL='amarktainetwork@gmail.com'
export CONFIRM_ADMIN_PASSWORD_RESET="$ADMIN_EMAIL"
docker compose exec -T \
  -e ADMIN_EMAIL="$ADMIN_EMAIL" \
  -e ADMIN_RESET_PASSWORD="$ADMIN_RESET_PASSWORD" \
  -e CONFIRM_ADMIN_PASSWORD_RESET="$CONFIRM_ADMIN_PASSWORD_RESET" \
  api npm run admin:reset-password
unset ADMIN_RESET_PASSWORD CONFIRM_ADMIN_PASSWORD_RESET
```

The reset command:

- refuses to create a missing administrator;
- requires an explicit email confirmation value;
- requires a password of at least 12 characters;
- stores only a bcrypt hash;
- increments the token version to revoke old sessions;
- never prints the password.

Verify login directly through the API and through the dashboard proxy before continuing.

## 9. Verify provider truth

The approved provider truth must show:

- GenX configured and runtime-eligible when its credential is valid;
- Together configured and runtime-eligible when its credential is valid;
- DeepInfra configured and runtime-eligible when its credential is valid;
- MiMo stored-configuration truth separately from its coding-only runtime restriction;
- Groq absent from active provider truth.

Run authenticated model discovery and confirm provider status consistency before capability proof.

## 10. Run strict production proof

```bash
export PROOF_API_URL=http://127.0.0.1:3001
npm run proof:authenticated-discovery
node scripts/proof-direct-provider-capabilities.mjs --live --strict
npm run proof
node scripts/proof-production-release-candidate.mjs \
  --base-url http://127.0.0.1:3000 \
  --strict \
  --long-form \
  --json-output "$BACKUP_ROOT/release-proof.json"
chmod 600 "$BACKUP_ROOT/release-proof.json"
```

Required result:

- zero failed required capabilities;
- zero skipped required capabilities;
- exact provider, model and executor evidence;
- real required artifacts;
- authenticated artifact preview and download;
- administrator login through API and dashboard;
- provider truth agreement;
- public HTTPS, dashboard assets and Studio execution verified.

## 11. Roll back application images on failure

Keep MariaDB, Redis, Qdrant and artifact volumes unchanged. Restore only the previously tagged immutable API, worker and dashboard images:

```bash
export GIT_SHA="$ROLLBACK_SHA"
export BUILD_TIME="rollback-$ROLLBACK_SHA"
docker compose up -d --no-build api worker dashboard
```

Additive migrations remain in place only when they are backward compatible with the rollback application. Confirm API, worker and dashboard health after rollback.
