#!/usr/bin/env bash
# Exact-SHA production deployment for AmarktAI Network V2.
# Usage:
#   DEPLOY_SHA=<40-char remote branch SHA> \
#   ADMIN_PASSWORD='<secret>' \
#   bash deploy/deploy.sh

set -Eeuo pipefail
umask 077

REPO_DIR="${REPO_DIR:-/var/www/Amarktai-Network-V2}"
DEPLOY_BRANCH="${DEPLOY_BRANCH:-feat/production-activation-music-longform}"
BACKUP_DIR="${BACKUP_DIR:-/var/backups/amarktai}"
ADMIN_EMAIL="${ADMIN_EMAIL:-amarktainetwork@gmail.com}"
DEPLOY_SHA="${DEPLOY_SHA:-}"
APP_VERSION="${APP_VERSION:-1.0.0}"

[[ "$DEPLOY_SHA" =~ ^[0-9a-f]{40}$ ]] || {
  echo "ERROR: DEPLOY_SHA must be the exact 40-character commit on origin/$DEPLOY_BRANCH" >&2
  exit 2
}
: "${ADMIN_PASSWORD:?ADMIN_PASSWORD is required for authenticated post-deploy proof}"

export REPO_DIR DEPLOY_BRANCH BACKUP_DIR DEPLOY_SHA
bash "$REPO_DIR/deploy/preflight.sh"

cd "$REPO_DIR"
git rev-parse --is-inside-work-tree >/dev/null

if [[ -n "$(git status --porcelain)" ]]; then
  echo "ERROR: deployment worktree is not clean; refusing to overwrite local work" >&2
  git status --short >&2
  exit 2
fi

CURRENT_REPO_SHA="$(git rev-parse HEAD)"
export GIT_SHA="$DEPLOY_SHA"
export BUILD_TIME="preflight"
export APP_VERSION ADMIN_EMAIL ADMIN_PASSWORD

echo "[preflight] repository SHA: $CURRENT_REPO_SHA"
echo "[preflight] requested branch: origin/$DEPLOY_BRANCH"
echo "[preflight] requested SHA: $DEPLOY_SHA"

git fetch --prune origin "$DEPLOY_BRANCH"
REMOTE_SHA="$(git rev-parse "origin/$DEPLOY_BRANCH")"
[[ "$REMOTE_SHA" == "$DEPLOY_SHA" ]] || {
  echo "ERROR: requested SHA does not equal current origin/$DEPLOY_BRANCH ($REMOTE_SHA)" >&2
  exit 2
}
git cat-file -e "$DEPLOY_SHA^{commit}"

# Confirm host and current infrastructure before changing code or schema.
AVAILABLE_KB="$(df -Pk "$REPO_DIR" | awk 'NR==2 {print $4}')"
[[ "$AVAILABLE_KB" -ge 5242880 ]] || {
  echo "ERROR: less than 5 GiB free on the deployment filesystem" >&2
  exit 2
}
docker info >/dev/null
docker compose version >/dev/null
nginx -t

for service in mariadb redis qdrant api worker dashboard; do
  container="$(docker compose ps -q "$service")"
  [[ -n "$container" ]] || {
    echo "ERROR: current production service is absent: $service" >&2
    exit 2
  }
done

docker compose exec -T mariadb sh -c 'mariadb-admin ping -uroot -p"$MYSQL_ROOT_PASSWORD" --silent' >/dev/null
docker compose exec -T redis redis-cli ping | grep -qx PONG
curl --fail --silent --show-error --max-time 5 http://127.0.0.1:6333/healthz >/dev/null

CURRENT_API_HEALTH="$(curl --fail --silent --show-error --max-time 10 http://127.0.0.1:3001/health)"
DETECTED_ROLLBACK_SHA="$(printf '%s' "$CURRENT_API_HEALTH" | node -e "let s='';process.stdin.on('data',c=>s+=c).on('end',()=>{const v=JSON.parse(s).build?.gitSha||'';process.stdout.write(v)})")"
ROLLBACK_SHA="${ROLLBACK_SHA:-$DETECTED_ROLLBACK_SHA}"
[[ "$ROLLBACK_SHA" =~ ^[0-9a-f]{40}$ ]] || {
  echo "ERROR: current production SHA is unavailable; set ROLLBACK_SHA explicitly" >&2
  exit 2
}
echo "[preflight] rollback SHA: $ROLLBACK_SHA"

API_IMAGE_ID="$(docker inspect --format '{{.Image}}' "$(docker compose ps -q api)")"
WORKER_IMAGE_ID="$(docker inspect --format '{{.Image}}' "$(docker compose ps -q worker)")"
DASHBOARD_IMAGE_ID="$(docker inspect --format '{{.Image}}' "$(docker compose ps -q dashboard)")"
docker tag "$API_IMAGE_ID" "amarktai/api:$ROLLBACK_SHA"
docker tag "$WORKER_IMAGE_ID" "amarktai/worker:$ROLLBACK_SHA"
docker tag "$DASHBOARD_IMAGE_ID" "amarktai/dashboard:$ROLLBACK_SHA"

DEPLOY_STARTED=false
rollback_application() {
  echo "[rollback] restoring immutable application images for $ROLLBACK_SHA" >&2
  export GIT_SHA="$ROLLBACK_SHA"
  export BUILD_TIME="rollback-$ROLLBACK_SHA"
  docker compose up -d --no-build api worker dashboard || true
  echo "[rollback] additive database migration was retained for backward compatibility" >&2
}
on_error() {
  code=$?
  echo "ERROR: deployment failed with exit code $code" >&2
  if [[ "${DEPLOY_STARTED:-false}" == true ]]; then
    rollback_application
  fi
  echo "Recovery: cd '$REPO_DIR' && GIT_SHA='$ROLLBACK_SHA' BUILD_TIME='rollback-$ROLLBACK_SHA' docker compose up -d --no-build api worker dashboard" >&2
  exit "$code"
}
trap on_error ERR

confirm_mount() {
  local service="$1"
  local destination="$2"
  local container
  container="$(docker compose ps -q "$service")"
  docker inspect --format '{{range .Mounts}}{{println .Destination}}{{end}}' "$container" | grep -Fxq "$destination" || {
    echo "ERROR: required persistent mount is absent: $service:$destination" >&2
    exit 2
  }
}
confirm_mount mariadb /var/lib/mysql
confirm_mount redis /data
confirm_mount qdrant /qdrant/storage
confirm_mount api /var/www/amarktai/storage
docker compose exec -T api sh -c 'test -d /var/www/amarktai/storage && test -w /var/www/amarktai/storage'

key_present() {
  local key="$1"
  [[ -n "${!key:-}" ]] || [[ -f .env && "$(grep -Ec "^${key}=.+" .env)" -gt 0 ]]
}

for key in MYSQL_ROOT_PASSWORD MYSQL_PASSWORD; do
  key_present "$key" || {
    echo "ERROR: required deployment credential is missing: $key" >&2
    exit 2
  }
  echo "[preflight] $key: present (value redacted)"
done
for key in GENX_API_KEY GROQ_API_KEY TOGETHER_API_KEY DEEPINFRA_API_KEY; do
  if key_present "$key"; then
    echo "[preflight] $key: present in environment (value redacted)"
  else
    echo "[preflight] $key: not in environment; authenticated discovery must confirm stored credential"
  fi
done

mkdir -p "$BACKUP_DIR"
BACKUP_FILE="$BACKUP_DIR/mariadb-${ROLLBACK_SHA}-$(date -u +%Y%m%dT%H%M%SZ).sql"
docker compose exec -T mariadb sh -c 'mariadb-dump -uroot -p"$MYSQL_ROOT_PASSWORD" --single-transaction --routines --events "$MYSQL_DATABASE"' > "$BACKUP_FILE"
[[ -s "$BACKUP_FILE" ]] || {
  echo "ERROR: MariaDB backup is empty" >&2
  exit 2
}
echo "[preflight] MariaDB backup: $BACKUP_FILE"

ARTIFACT_BACKUP_FILE="$BACKUP_DIR/artifacts-${ROLLBACK_SHA}-$(date -u +%Y%m%dT%H%M%SZ).tar"
docker compose exec -T api tar -C /var/www/amarktai/storage -cf - . > "$ARTIFACT_BACKUP_FILE"
[[ -s "$ARTIFACT_BACKUP_FILE" ]] || {
  echo "ERROR: persistent artifact-volume backup is empty" >&2
  exit 2
}
echo "[preflight] Artifact-volume backup: $ARTIFACT_BACKUP_FILE"

# The worktree is clean and the remote branch head was pinned above. A detached
# checkout prevents any implicit branch merge or reset while deploying that SHA.
git switch --detach "$DEPLOY_SHA"
[[ "$(git rev-parse HEAD)" == "$DEPLOY_SHA" ]]

npm ci --ignore-scripts
npx prisma validate --schema=./prisma/schema.prisma
npx prisma generate --schema=./prisma/schema.prisma
npm test
npm run build:backend
npm run build
npm run audit
npm run proof
node scripts/proof-direct-provider-capabilities.mjs --static --strict

export BUILD_TIME="$(date -u +%Y-%m-%dT%H:%M:%SZ)"
docker compose config >/dev/null
docker compose build --pull api worker dashboard

echo "[migration] current status (pending migrations are expected before deploy):"
docker compose run --rm --entrypoint npx api prisma migrate status --schema=./prisma/schema.prisma || true
docker compose run --rm --entrypoint npx api prisma migrate deploy --schema=./prisma/schema.prisma
docker compose run --rm --entrypoint npx api prisma migrate status --schema=./prisma/schema.prisma

DEPLOY_STARTED=true
docker compose up -d --no-build api worker dashboard

wait_for_health() {
  local name="$1"
  local url="$2"
  for _ in $(seq 1 60); do
    if curl --fail --silent --show-error --max-time 5 "$url" >/dev/null 2>&1; then
      echo "[verify] $name healthy"
      return 0
    fi
    sleep 2
  done
  echo "ERROR: $name did not become healthy: $url" >&2
  return 1
}

wait_for_health api http://127.0.0.1:3001/health
wait_for_health worker http://127.0.0.1:3002/health
wait_for_health dashboard http://127.0.0.1:3000/api/build-identity

assert_identity() {
  local name="$1"
  local url="$2"
  local payload
  payload="$(curl --fail --silent --show-error --max-time 10 "$url")"
  printf '%s' "$payload" | node -e "let s='';process.stdin.on('data',c=>s+=c).on('end',()=>{const j=JSON.parse(s);if(j.build?.gitSha!==process.argv[1]){console.error('identity mismatch');process.exit(1)}})" "$DEPLOY_SHA"
  echo "[verify] $name reports exact SHA $DEPLOY_SHA"
}

assert_identity api http://127.0.0.1:3001/health
assert_identity worker http://127.0.0.1:3002/health
assert_identity dashboard http://127.0.0.1:3000/api/build-identity

docker compose exec -T mariadb sh -c 'mariadb-admin ping -uroot -p"$MYSQL_ROOT_PASSWORD" --silent' >/dev/null
docker compose exec -T redis redis-cli ping | grep -qx PONG
curl --fail --silent --show-error --max-time 5 http://127.0.0.1:6333/healthz >/dev/null
docker compose exec -T api sh -c 'p=/var/www/amarktai/storage/.deploy-write-proof; printf proof > "$p"; test -s "$p"; rm -f "$p"'
nginx -t

export PROOF_API_URL="${PROOF_API_URL:-http://127.0.0.1:3001}"
DISCOVERY_OUTPUT_ROOT="$(mktemp -d)"
AMARKTAI_DISCOVERY_OUTPUT_ROOT="$DISCOVERY_OUTPUT_ROOT" npm run discover:models:live
npm run proof:authenticated-discovery
node scripts/proof-direct-provider-capabilities.mjs --live --strict
npm run proof
npm run proof
npm run proof

PRODUCTION_PROOF_FILE="$BACKUP_DIR/release-proof-${DEPLOY_SHA}-$(date -u +%Y%m%dT%H%M%SZ).json"
node scripts/proof-production-release-candidate.mjs \
  --base-url http://127.0.0.1:3000 \
  --strict \
  --long-form \
  --json-output "$PRODUCTION_PROOF_FILE"
chmod 600 "$PRODUCTION_PROOF_FILE"

trap - ERR
echo "DEPLOYMENT_COMPLETE"
echo "DEPLOY_SHA=$DEPLOY_SHA"
echo "ROLLBACK_SHA=$ROLLBACK_SHA"
echo "BACKUP_FILE=$BACKUP_FILE"
echo "ARTIFACT_BACKUP_FILE=$ARTIFACT_BACKUP_FILE"
echo "PRODUCTION_PROOF_FILE=$PRODUCTION_PROOF_FILE"
rm -rf "$DISCOVERY_OUTPUT_ROOT"
