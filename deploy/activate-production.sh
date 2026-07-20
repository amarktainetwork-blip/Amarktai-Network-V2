#!/usr/bin/env bash
# Canonical production activation entry point.
# It prepares only disposable host state, then delegates to deploy/deploy.sh.
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

[[ "$DEPLOY_SHA" =~ ^[0-9a-f]{40}$ ]] || {
  echo 'ERROR: DEPLOY_SHA must be the exact 40-character release SHA' >&2
  exit 2
}
[[ -z "$ROLLBACK_SHA" || "$ROLLBACK_SHA" =~ ^[0-9a-f]{40}$ ]] || {
  echo 'ERROR: ROLLBACK_SHA must be empty or a 40-character SHA' >&2
  exit 2
}

cd "$REPO_DIR"
test -z "$(git status --porcelain)" || {
  echo 'ERROR: production worktree is not clean' >&2
  git status --short >&2
  exit 2
}

git fetch --prune origin "$DEPLOY_BRANCH"
REMOTE_SHA="$(git rev-parse "origin/$DEPLOY_BRANCH")"
[[ "$REMOTE_SHA" == "$DEPLOY_SHA" ]] || {
  echo "ERROR: origin/$DEPLOY_BRANCH moved to $REMOTE_SHA" >&2
  exit 2
}

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
[[ -n "$ADMIN_PASSWORD" ]] || {
  echo 'ERROR: administrator password is empty' >&2
  exit 2
}
export ADMIN_PASSWORD

exec bash "$REPO_DIR/deploy/deploy.sh"
