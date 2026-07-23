#!/usr/bin/env bash
set -Eeuo pipefail

LOG_FILE="${PRODUCTION_DEPENDENCY_AUDIT_LOG:-production-dependency-audit.log}"
MAX_ATTEMPTS="${PRODUCTION_DEPENDENCY_AUDIT_ATTEMPTS:-3}"

: > "$LOG_FILE"

is_transient_audit_failure() {
  local attempt_log="$1"
  grep -Eqi \
    'audit endpoint returned an error|npm warn audit (400|408|409|425|429|5[0-9]{2})|Bad Request - POST .*/security/audits/|ECONNRESET|ECONNREFUSED|ETIMEDOUT|EAI_AGAIN|ENETUNREACH|socket hang up' \
    "$attempt_log"
}

for attempt in $(seq 1 "$MAX_ATTEMPTS"); do
  attempt_log="$(mktemp)"
  trap 'rm -f "$attempt_log"' EXIT

  set +e
  npm audit --omit=dev 2>&1 | tee "$attempt_log"
  status=${PIPESTATUS[0]}
  set -e

  cat "$attempt_log" >> "$LOG_FILE"
  if [[ "$status" -eq 0 ]]; then
    rm -f "$attempt_log"
    trap - EXIT
    exit 0
  fi

  if ! is_transient_audit_failure "$attempt_log"; then
    echo "Production dependency audit found a non-transient failure; refusing to retry." | tee -a "$LOG_FILE" >&2
    rm -f "$attempt_log"
    trap - EXIT
    exit "$status"
  fi

  if [[ "$attempt" -ge "$MAX_ATTEMPTS" ]]; then
    echo "Production dependency audit endpoint failed after $MAX_ATTEMPTS attempts." | tee -a "$LOG_FILE" >&2
    rm -f "$attempt_log"
    trap - EXIT
    exit "$status"
  fi

  echo "Transient npm audit endpoint failure on attempt $attempt; retrying without changing dependencies." | tee -a "$LOG_FILE" >&2
  rm -f "$attempt_log"
  trap - EXIT
  sleep $((attempt * 5))
done
