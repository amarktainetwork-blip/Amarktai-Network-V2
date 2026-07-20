#!/usr/bin/env bash
# Canonical production activation entry point.
# It pins the current production rollback images, prepares only disposable host
# state, then delegates to deploy/deploy.sh.
set -Eeuo pipefail
umask 077

REPO_DIR="${REPO_DIR:-/var/www/Amarktai-Network-V2}"
DEPLOY_BRANCH="${DEPLOY_BRANCH:-feat/production-activation-music-longform}"
DEPLOY_SHA="${DEPLOY_SHA:-}"
ROLLBACK_SHA="${ROLLBACK_SHA:-}"
HOST_UID="$(id -u)"
DEPLOY_CACHE_ROOT="${DEPLOY_CACHE_ROOT:-/var/tmp/amarktai-deploy-${HOST_UID}}"
NPM_CONFIG_CACHE="${NPM_CONFIG_CACHE:-$DEPLOY_CACHE_ROOT/npm}"
PLAYWRIGHT_BROWSERS_PATH="${PLAYWRIGHT_BROWSERS_PATH:-$DEPLOY_CACHE_ROOT/playwright}"

fail() {
  echo "ERROR: $*" >&2
  exit 2
}

[[ "$DEPLOY_SHA" =~ ^[0-9a-f]{40}$ ]] || fail 'DEPLOY_SHA must be the exact 40-character release SHA'
[[ -z "$ROLLBACK_SHA" || "$ROLLBACK_SHA" =~ ^[0-9a-f]{40}$ ]] || fail 'ROLLBACK_SHA must be empty or a 40-character SHA'

# docker-compose.yml requires these values during interpolation even for read-only
# commands such as `docker compose ps`. deploy/deploy.sh replaces BUILD_TIME with
# the actual release timestamp before any image build or service activation.
export GIT_SHA="$DEPLOY_SHA"
export BUILD_TIME="${BUILD_TIME:-activation-preflight}"

cd "$REPO_DIR"
test -z "$(git status --porcelain)" || {
  echo 'ERROR: production worktree is not clean' >&2
  git status --short >&2
  exit 2
}
command -v docker >/dev/null || fail 'docker is required'
docker info >/dev/null || fail 'Docker daemon is unavailable'
docker compose version >/dev/null || fail 'Docker Compose is unavailable'

git fetch --prune origin "$DEPLOY_BRANCH"
REMOTE_SHA="$(git rev-parse "origin/$DEPLOY_BRANCH")"
[[ "$REMOTE_SHA" == "$DEPLOY_SHA" ]] || fail "origin/$DEPLOY_BRANCH moved to $REMOTE_SHA"

# Resolve the active release identity before any unused-image cleanup. The
# operator may supply ROLLBACK_SHA explicitly; otherwise the running API health
# response is authoritative.
if [[ -z "$ROLLBACK_SHA" ]]; then
  CURRENT_API_HEALTH="$(curl --fail --silent --show-error --max-time 10 http://127.0.0.1:3001/health)" || fail 'current production API health is unavailable'
  ROLLBACK_SHA="$(printf '%s' "$CURRENT_API_HEALTH" | node -e "let s='';process.stdin.on('data',c=>s+=c).on('end',()=>{const v=JSON.parse(s).build?.gitSha||'';process.stdout.write(v)})")"
fi
[[ "$ROLLBACK_SHA" =~ ^[0-9a-f]{40}$ ]] || fail 'current production SHA is unavailable; set ROLLBACK_SHA explicitly'

# Ensure immutable rollback tags exist before host preparation pins them with
# temporary guard containers and removes every other unused image.
for service in api worker dashboard; do
  container="$(docker compose ps -q "$service")"
  [[ -n "$container" ]] || fail "current production service is absent: $service"
  image_id="$(docker inspect --format '{{.Image}}' "$container")"
  [[ -n "$image_id" ]] || fail "current production image could not be resolved: $service"
  docker tag "$image_id" "amarktai/$service:$ROLLBACK_SHA"
done
echo "[activation] rollback images pinned for $ROLLBACK_SHA"

git switch --detach "$DEPLOY_SHA"
[[ "$(git rev-parse HEAD)" == "$DEPLOY_SHA" ]]
test -z "$(git status --porcelain)"

export REPO_DIR DEPLOY_BRANCH DEPLOY_SHA ROLLBACK_SHA
export DEPLOY_CACHE_ROOT NPM_CONFIG_CACHE PLAYWRIGHT_BROWSERS_PATH
bash "$REPO_DIR/deploy/prepare-production-host.sh"

if [[ -z "${ADMIN_PASSWORD:-}" ]]; then
  read -rsp 'Administrator password for production proof: ' ADMIN_PASSWORD
  echo
fi
[[ -n "$ADMIN_PASSWORD" ]] || fail 'administrator password is empty'
export ADMIN_PASSWORD

exec bash "$REPO_DIR/deploy/deploy.sh"
