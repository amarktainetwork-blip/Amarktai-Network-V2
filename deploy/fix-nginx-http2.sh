#!/usr/bin/env bash
# Safely migrate the production Nginx HTTP/2 directives to current syntax.
# Run as: bash deploy/fix-nginx-http2.sh
# This script may exit non-zero without changing the caller's shell options.
set -Eeuo pipefail
umask 077

SITE="${NGINX_SITE:-/etc/nginx/sites-available/webdock}"
STAMP="$(date -u +%Y%m%dT%H%M%SZ)"
BACKUP="${SITE}.backup-${STAMP}"
CHANGED=false

fail() {
  echo "ERROR: $*" >&2
  exit 2
}

[[ -f "$SITE" ]] || fail "Nginx site file does not exist: $SITE"
command -v sudo >/dev/null || fail 'sudo is required'
command -v python3 >/dev/null || fail 'python3 is required'
command -v nginx >/dev/null || fail 'nginx is required'
command -v systemctl >/dev/null || fail 'systemctl is required'

sudo -v || fail 'sudo authentication failed'

restore_backup() {
  if [[ "$CHANGED" == true && -f "$BACKUP" ]]; then
    echo '[rollback] restoring original Nginx configuration' >&2
    sudo cp -a "$BACKUP" "$SITE"
    sudo nginx -t >&2 || true
  fi
}

on_error() {
  local code=$?
  restore_backup
  exit "$code"
}
trap on_error ERR

echo "[nginx] site: $SITE"
sudo cp -a "$SITE" "$BACKUP"
echo "[nginx] backup: $BACKUP"

RESULT="$(sudo python3 - "$SITE" <<'PY'
from pathlib import Path
import re
import sys

path = Path(sys.argv[1])
text = path.read_text()

legacy_v4 = re.compile(r'^(?P<indent>\s*)listen\s+443\s+ssl\s+http2;\s*$', re.MULTILINE)
legacy_v6 = re.compile(r'^(?P<indent>\s*)listen\s+\[::\]:443\s+ssl\s+http2;\s*$', re.MULTILINE)
modern_v4 = re.compile(r'^\s*listen\s+443\s+ssl;\s*$', re.MULTILINE)
modern_v6 = re.compile(r'^\s*listen\s+\[::\]:443\s+ssl;\s*$', re.MULTILINE)
http2_on = re.compile(r'^\s*http2\s+on;\s*$', re.MULTILINE)

legacy_v4_matches = list(legacy_v4.finditer(text))
legacy_v6_matches = list(legacy_v6.finditer(text))
modern = bool(modern_v4.search(text) and modern_v6.search(text) and http2_on.search(text))

if modern and not legacy_v4_matches and not legacy_v6_matches:
    print('ALREADY_CURRENT')
    raise SystemExit(0)

if len(legacy_v4_matches) != 1 or len(legacy_v6_matches) != 1:
    raise SystemExit(
        f'Expected exactly one legacy IPv4 and one legacy IPv6 HTTP/2 directive; '
        f'found IPv4={len(legacy_v4_matches)} IPv6={len(legacy_v6_matches)}'
    )

if http2_on.search(text):
    raise SystemExit("Refusing mixed legacy/current HTTP/2 configuration")

v4_indent = legacy_v4_matches[0].group('indent')
v6_indent = legacy_v6_matches[0].group('indent')
text = legacy_v4.sub(f'{v4_indent}listen 443 ssl;', text, count=1)
text = legacy_v6.sub(
    f'{v6_indent}listen [::]:443 ssl;\n{v6_indent}http2 on;',
    text,
    count=1,
)
path.write_text(text)
print('UPDATED')
PY
)"

echo "[nginx] configuration result: $RESULT"
if [[ "$RESULT" == 'UPDATED' ]]; then
  CHANGED=true
elif [[ "$RESULT" != 'ALREADY_CURRENT' ]]; then
  fail "unexpected repair result: $RESULT"
fi

set +e
NGINX_OUTPUT="$(sudo nginx -t 2>&1)"
NGINX_STATUS=$?
set -e
printf '%s\n' "$NGINX_OUTPUT"

if [[ "$NGINX_STATUS" -ne 0 ]]; then
  fail 'Nginx configuration test failed'
fi
if grep -Eq '\[(warn|alert|emerg|crit)\]' <<<"$NGINX_OUTPUT"; then
  fail 'Nginx configuration still emits warnings or errors'
fi
grep -Fq 'syntax is ok' <<<"$NGINX_OUTPUT" || fail 'Nginx did not confirm valid syntax'
grep -Fq 'test is successful' <<<"$NGINX_OUTPUT" || fail 'Nginx did not confirm successful validation'

if [[ "$CHANGED" == true ]]; then
  sudo systemctl reload nginx
fi
sudo systemctl is-active --quiet nginx || fail 'Nginx is not active after validation/reload'

trap - ERR
CHANGED=false

echo 'NGINX_HTTP2_REPAIR=PASS'
echo "NGINX_BACKUP=$BACKUP"
