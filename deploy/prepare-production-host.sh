#!/usr/bin/env bash
# Prepare a production host for an exact-SHA deployment without touching
# persistent service volumes, live containers, backups, or tagged rollback images.
set -Eeuo pipefail
umask 077

REPO_DIR="${REPO_DIR:-/var/www/Amarktai-Network-V2}"
MIN_AVAILABLE_KB="${MIN_AVAILABLE_KB:-16777216}"
ROLLBACK_SHA="${ROLLBACK_SHA:-}"
HOST_UID="$(id -u)"
DEPLOY_CACHE_ROOT="${DEPLOY_CACHE_ROOT:-/var/tmp/amarktai-deploy-${HOST_UID}}"
NPM_CONFIG_CACHE="${NPM_CONFIG_CACHE:-$DEPLOY_CACHE_ROOT/npm}"
PLAYWRIGHT_BROWSERS_PATH="${PLAYWRIGHT_BROWSERS_PATH:-$DEPLOY_CACHE_ROOT/playwright}"
PRUNE_GUARD_PREFIX="amarktai-prune-guard-${HOST_UID}-$$"
PRUNE_GUARDS=()

fail() {
  echo "ERROR: $*" >&2
  exit 2
}

cleanup_prune_guards() {
  local guard
  for guard in "${PRUNE_GUARDS[@]:-}"; do
    [[ -n "$guard" ]] || continue
    docker rm -f "$guard" >/dev/null 2>&1 || true
  done
}
trap cleanup_prune_guards EXIT

guard_rollback_image() {
  local image="$1"
  local guard="${PRUNE_GUARD_PREFIX}-${#PRUNE_GUARDS[@]}"
  docker image inspect "$image" >/dev/null 2>&1 || fail "rollback image is missing: $image"
  docker create --name "$guard" "$image" true >/dev/null
  PRUNE_GUARDS+=("$guard")
  echo "[host-prepare] protected rollback image: $image"
}

cd "$REPO_DIR"
command -v node >/dev/null || fail 'node is required'
command -v npm >/dev/null || fail 'npm is required'
command -v docker >/dev/null || fail 'docker is required'
docker info >/dev/null || fail 'Docker daemon is unavailable'

if [[ -e "$DEPLOY_CACHE_ROOT" && ! -O "$DEPLOY_CACHE_ROOT" ]]; then
  fail "deployment cache exists but is not owned by uid $HOST_UID: $DEPLOY_CACHE_ROOT"
fi
mkdir -p "$NPM_CONFIG_CACHE" "$PLAYWRIGHT_BROWSERS_PATH"
[[ -w "$NPM_CONFIG_CACHE" ]] || fail "npm deployment cache is not writable: $NPM_CONFIG_CACHE"
[[ -w "$PLAYWRIGHT_BROWSERS_PATH" ]] || fail "Playwright deployment cache is not writable: $PLAYWRIGHT_BROWSERS_PATH"
export DEPLOY_CACHE_ROOT NPM_CONFIG_CACHE PLAYWRIGHT_BROWSERS_PATH

if [[ -n "$ROLLBACK_SHA" ]]; then
  [[ "$ROLLBACK_SHA" =~ ^[0-9a-f]{40}$ ]] || fail 'ROLLBACK_SHA must be empty or a 40-character SHA'
  guard_rollback_image "amarktai/api:$ROLLBACK_SHA"
  guard_rollback_image "amarktai/worker:$ROLLBACK_SHA"
  guard_rollback_image "amarktai/dashboard:$ROLLBACK_SHA"
fi

echo '[host-prepare] disk before cleanup:'
df -h "$REPO_DIR"
echo '[host-prepare] Docker usage before cleanup:'
docker system df || true
echo "[host-prepare] isolated npm cache: $NPM_CONFIG_CACHE"
echo "[host-prepare] isolated Playwright path: $PLAYWRIGHT_BROWSERS_PATH"

rm -rf -- \
  .next \
  coverage \
  playwright-report \
  test-results \
  release-fixture-output \
  apps/api/dist \
  apps/worker/dist \
  packages/*/dist

# Rollback images are pinned above. Docker image prune --all removes only images
# that are not referenced by any container, so live services and the guarded
# rollback set remain intact. Removing image references first also lets the
# following BuildKit prune reclaim cache records that were previously active.
docker image prune --all --force >/dev/null
docker builder prune --all --force >/dev/null
npm cache clean --force >/dev/null 2>&1 || true
cleanup_prune_guards
PRUNE_GUARDS=()

AVAILABLE_KB="$(df -Pk "$REPO_DIR" | awk 'NR==2 {print $4}')"
[[ "$AVAILABLE_KB" -ge "$MIN_AVAILABLE_KB" ]] || {
  echo "ERROR: less than $((MIN_AVAILABLE_KB / 1024 / 1024)) GiB is available after safe cleanup" >&2
  df -h "$REPO_DIR" >&2
  docker system df >&2 || true
  exit 2
}

echo '[host-prepare] installing locked Node dependencies'
npm ci --ignore-scripts --cache "$NPM_CONFIG_CACHE"

PLAYWRIGHT_VERSION="$(node -p "require('playwright/package.json').version")"
PLAYWRIGHT_REVISION="$(node -e "const fs=require('node:fs'),p=require('node:path');const d=p.dirname(require.resolve('playwright-core/package.json'));const b=JSON.parse(fs.readFileSync(p.join(d,'browsers.json'),'utf8')).browsers.find(x=>x.name==='chromium');process.stdout.write(String(b?.revision||''))")"
PLAYWRIGHT_EXECUTABLE="$(node -e "process.stdout.write(require('playwright').chromium.executablePath())")"

[[ -n "$PLAYWRIGHT_REVISION" ]] || fail 'required Playwright Chromium revision could not be determined'
if [[ ! -x "$PLAYWRIGHT_EXECUTABLE" ]]; then
  echo "[host-prepare] installing Playwright $PLAYWRIGHT_VERSION Chromium revision $PLAYWRIGHT_REVISION"
  npx playwright install chromium
  PLAYWRIGHT_EXECUTABLE="$(node -e "process.stdout.write(require('playwright').chromium.executablePath())")"
fi
[[ -x "$PLAYWRIGHT_EXECUTABLE" ]] || fail "Playwright Chromium executable is absent: $PLAYWRIGHT_EXECUTABLE"

node --input-type=module <<'NODE'
import { chromium } from 'playwright'
const browser = await chromium.launch({ headless: true })
const page = await browser.newPage()
await page.setContent('<title>amarktai-host-proof</title>')
if ((await page.title()) !== 'amarktai-host-proof') {
  throw new Error('Playwright Chromium launch proof returned the wrong page title')
}
await browser.close()
NODE

echo '[host-prepare] disk after preparation:'
df -h "$REPO_DIR"
echo '[host-prepare] Docker usage after preparation:'
docker system df || true
echo "[host-prepare] Playwright $PLAYWRIGHT_VERSION Chromium revision $PLAYWRIGHT_REVISION: ready"
echo 'PRODUCTION_HOST_PREPARE=PASS'
