#!/usr/bin/env bash
set -euo pipefail

usage() { printf 'Usage: %s --plan ABSOLUTE_PLAN --execute --confirm-host HOSTNAME\n' "$0" >&2; exit 2; }
PLAN=""; EXECUTE=false; CONFIRM_HOST=""
while [[ $# -gt 0 ]]; do
  case "$1" in
    --plan) PLAN="${2:-}"; shift 2 ;;
    --execute) EXECUTE=true; shift ;;
    --confirm-host) CONFIRM_HOST="${2:-}"; shift 2 ;;
    *) usage ;;
  esac
done
[[ -n "$PLAN" ]] || usage
[[ -f "$PLAN" ]] || { printf 'Plan not found: %s\n' "$PLAN" >&2; exit 1; }
[[ "$EXECUTE" == true ]] || { printf 'Dry-run is the default. No changes made. Add --execute and --confirm-host after reviewing %s.\n' "$PLAN"; exit 0; }
[[ "$CONFIRM_HOST" == "$(hostname)" ]] || { printf 'Host confirmation does not match.\n' >&2; exit 1; }
grep -q '^# amarktai-cleanup-plan-v1$' "$PLAN" || { printf 'Unrecognised plan format.\n' >&2; exit 1; }
grep -q "^# hostname=$(hostname)$" "$PLAN" || { printf 'Plan was generated for another host.\n' >&2; exit 1; }

APP_ROOT="$(readlink -m "${AMARKTAI_APP_ROOT:-/opt/amarktai}")"
RELEASE_ROOT="$(readlink -m "${AMARKTAI_RELEASE_ROOT:-$APP_ROOT/releases}")"
CURRENT=""; [[ -L "$APP_ROOT/current" ]] && CURRENT="$(readlink -f "$APP_ROOT/current")"
mapfile -t NEWEST < <(find "$RELEASE_ROOT" -mindepth 1 -maxdepth 1 -type d -printf '%T@\t%p\n' 2>/dev/null | sort -rn | head -n 2 | cut -f2- | xargs -r -n1 readlink -f)

while IFS=$'\t' read -r action target reason; do
  [[ -z "$action" || "$action" == \#* ]] && continue
  case "$action" in
    remove_release)
      resolved="$(readlink -f "$target")"
      [[ -n "$resolved" && "$resolved" == "$RELEASE_ROOT"/* ]] || { printf 'Rejected release path: %s\n' "$target" >&2; exit 1; }
      [[ "$resolved" != "$CURRENT" ]] || { printf 'Rejected current release.\n' >&2; exit 1; }
      for protected in "${NEWEST[@]}"; do [[ "$resolved" != "$protected" ]] || { printf 'Rejected current/rollback release.\n' >&2; exit 1; }; done
      [[ -f "$resolved/.amarktai-release" ]] || { printf 'Rejected unmarked release: %s\n' "$resolved" >&2; exit 1; }
      rm -rf --one-file-system -- "$resolved"
      ;;
    remove_cache_contents)
      resolved="$(readlink -f "$target")"
      case "$resolved" in /root/.cache/ms-playwright|/root/.npm/_cacache) find "$resolved" -mindepth 1 -maxdepth 1 -exec rm -rf --one-file-system -- {} + ;; *) printf 'Rejected cache path: %s\n' "$target" >&2; exit 1 ;; esac
      ;;
    docker_builder_prune)
      [[ "$target" == "-" ]] || { printf 'Rejected Docker plan target.\n' >&2; exit 1; }
      docker builder prune -f
      ;;
    *) printf 'Rejected unknown action: %s\n' "$action" >&2; exit 1 ;;
  esac
  printf 'completed=%s|target=%s|reason=%s\n' "$action" "$target" "$reason"
done < "$PLAN"
