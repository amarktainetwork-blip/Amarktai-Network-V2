#!/usr/bin/env bash
set -euo pipefail

APP_ROOT="${AMARKTAI_APP_ROOT:-/opt/amarktai}"
RELEASE_ROOT="${AMARKTAI_RELEASE_ROOT:-$APP_ROOT/releases}"
ARTIFACT_ROOT="${AMARKTAI_ARTIFACT_ROOT:-$APP_ROOT/artifacts}"

printf 'inventory_generated_at=%s\n' "$(date -u +%Y-%m-%dT%H:%M:%SZ)"
printf 'hostname=%s\n' "$(hostname)"
printf 'app_root=%s\nrelease_root=%s\nartifact_root=%s\n' "$APP_ROOT" "$RELEASE_ROOT" "$ARTIFACT_ROOT"
df -hT
for path in "$APP_ROOT" "$RELEASE_ROOT" "$ARTIFACT_ROOT" /var/lib/docker /var/log /var/cache /root/.cache /root/.npm; do
  if [[ -e "$path" ]]; then du -shx "$path" 2>/dev/null || true; fi
done
find "$APP_ROOT" -maxdepth 3 -type d -name .git -printf 'repository=%h\n' 2>/dev/null || true
find "$RELEASE_ROOT" -mindepth 1 -maxdepth 1 -type d -printf 'release=%p\n' 2>/dev/null | sort || true
if [[ -L "$APP_ROOT/current" ]]; then printf 'current_release=%s\n' "$(readlink -f "$APP_ROOT/current")"; fi
if command -v docker >/dev/null 2>&1; then
  docker ps -a --format 'container={{.ID}}|{{.Names}}|{{.Image}}|{{.Status}}'
  docker images --digests --format 'image={{.ID}}|{{.Repository}}|{{.Tag}}|{{.Digest}}|{{.Size}}'
  docker volume ls --format 'volume={{.Name}}|{{.Driver}}'
  docker system df -v || true
fi
for service in mariadb mysql redis-server qdrant nginx; do
  if command -v systemctl >/dev/null 2>&1; then printf 'service_%s=%s\n' "$service" "$(systemctl is-active "$service" 2>/dev/null || true)"; fi
done
find "$APP_ROOT" /var/backups -maxdepth 4 -type f \( -iname '*.sql*' -o -iname '*.bak' -o -iname '*.tar*' \) -printf 'backup=%p|bytes=%s|mtime=%TY-%Tm-%TdT%TH:%TM:%TSZ\n' 2>/dev/null || true
find "$APP_ROOT" /var/log -maxdepth 4 -type f -size +100M -printf 'large_file=%p|bytes=%s|mtime=%TY-%Tm-%TdT%TH:%TM:%TSZ\n' 2>/dev/null || true
find /root/.cache /root/.npm -maxdepth 3 -type d \( -iname '*playwright*' -o -iname '_cacache' \) -printf 'package_cache=%p\n' 2>/dev/null || true
printf 'protected=current_application,active_database_volume,redis_volume,qdrant_volume,artifact_storage,ssl,nginx,current_release,one_rollback_release,required_backups\n'
