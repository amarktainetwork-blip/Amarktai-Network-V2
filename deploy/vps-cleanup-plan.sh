#!/usr/bin/env bash
set -euo pipefail

APP_ROOT="${AMARKTAI_APP_ROOT:-/opt/amarktai}"
RELEASE_ROOT="${AMARKTAI_RELEASE_ROOT:-$APP_ROOT/releases}"
OUTPUT="${1:-./amarktai-cleanup.plan}"
CURRENT=""
[[ -L "$APP_ROOT/current" ]] && CURRENT="$(readlink -f "$APP_ROOT/current")"
mapfile -t RELEASES < <(find "$RELEASE_ROOT" -mindepth 1 -maxdepth 1 -type d -printf '%T@\t%p\n' 2>/dev/null | sort -rn | cut -f2-)

{
  printf '# amarktai-cleanup-plan-v1\n'
  printf '# generated_at=%s\n# hostname=%s\n# dry_run=true\n' "$(date -u +%Y-%m-%dT%H:%M:%SZ)" "$(hostname)"
  printf '# protected_current=%s\n' "$CURRENT"
  printf '# ACTION<TAB>ABSOLUTE_PATH<TAB>REASON\n'
  for index in "${!RELEASES[@]}"; do
    release="${RELEASES[$index]}"
    resolved="$(readlink -f "$release")"
    if [[ "$resolved" == "$CURRENT" || "$index" -lt 2 ]]; then
      printf '# protected_release=%s\n' "$resolved"
      continue
    fi
    if [[ -f "$resolved/.amarktai-release" ]]; then printf 'remove_release\t%s\tolder_than_current_and_rollback\n' "$resolved"; fi
  done
  for cache in /root/.cache/ms-playwright /root/.npm/_cacache; do
    if [[ -d "$cache" ]]; then printf 'remove_cache_contents\t%s\tregenerable_tool_cache\n' "$(readlink -f "$cache")"; fi
  done
  if command -v docker >/dev/null 2>&1; then printf 'docker_builder_prune\t-\tunused_build_cache_only\n'; fi
} > "$OUTPUT"

printf 'Dry-run cleanup plan written to %s. Nothing was deleted. Review every non-comment line before guarded execution.\n' "$OUTPUT"
