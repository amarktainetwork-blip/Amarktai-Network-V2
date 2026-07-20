#!/usr/bin/env bash
# Prepare a production host for an exact-SHA deployment without touching
# persistent service volumes, live containers, backups, or tagged rollback images.
set -Eeuo pipefail
umask 077

REPO_DIR="${REPO_DIR:-/var/www/Amarktai-Network-V2}"
MIN_AVAILABLE_KB="${MIN_AVAILABLE_KB:-5242880}"

fail() {
  echo "ERROR: $*" >&2
  exit 2
}

cd "$REPO_DIR"
command -v node >/dev/null || fail 'node is required'
command -v npm >/dev/null || fail 'npm is required'
command -v docker >/dev/null || fail 'docker is required'
docker info >/dev/null || fail 'Docker daemon is unavailable'

echo '[host-prepare] disk before cleanup:'
df -h "$REPO_DIR"
echo '[host-prepare] Docker usage before cleanup:'
docker system df || true

rm -rf -- \
  .next \
  coverage \
  playwright-report \
  test-results \
  release-fixture-output \
  apps/api/dist \
  apps/worker/dist \
  packages/*/dist

# Remove only disposable BuildKit cache and dangling images.
docker builder prune --all --force >/dev/null
docker image prune --force >/dev/null
npm cache clean --force >/dev/null 2>&1 || true

AVAILABLE_KB="$(df -Pk "$REPO_DIR" | awk 'NR==2 {print $4}')"
[[ "$AVAILABLE_KB" -ge "$MIN_AVAILABLE_KB" ]] || {
  echo "ERROR: less than $((MIN_AVAILABLE_KB / 1024 / 1024)) GiB is available after safe cleanup" >&2
  df -h "$REPO_DIR" >&2
  docker system df >&2 || true
  exit 2
}

echo '[host-prepare] installing locked Node dependencies'
npm ci --ignore-scripts

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
