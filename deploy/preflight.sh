#!/usr/bin/env bash
# Read-only production preflight. It never checks out code, builds images,
# migrates a database, creates a backup, or restarts a service.
set -Eeuo pipefail

REPO_DIR="${REPO_DIR:-/var/www/Amarktai-Network-V2}"
DEPLOY_BRANCH="${DEPLOY_BRANCH:-feat/production-activation-music-longform}"
DEPLOY_SHA="${DEPLOY_SHA:-}"
BACKUP_DIR="${BACKUP_DIR:-/var/backups/amarktai}"

[[ "$DEPLOY_BRANCH" == "feat/production-activation-music-longform" ]] || { echo 'ERROR: unexpected deployment branch' >&2; exit 2; }
[[ "$DEPLOY_SHA" =~ ^[0-9a-f]{40}$ ]] || { echo 'ERROR: DEPLOY_SHA must be a 40-character SHA' >&2; exit 2; }
cd "$REPO_DIR"

[[ -z "$(git status --porcelain)" ]] || { echo 'ERROR: production worktree is not clean' >&2; git status --short >&2; exit 2; }
CURRENT_SHA="$(git rev-parse HEAD)"
REMOTE_SHA="$(git ls-remote --exit-code origin "refs/heads/$DEPLOY_BRANCH" | awk '{print $1}')"
[[ "$REMOTE_SHA" == "$DEPLOY_SHA" ]] || { echo "ERROR: target SHA is not the current remote branch head" >&2; exit 2; }

AVAILABLE_KB="$(df -Pk "$REPO_DIR" | awk 'NR==2 {print $4}')"
[[ "$AVAILABLE_KB" -ge 5242880 ]] || { echo 'ERROR: less than 5 GiB is available' >&2; exit 2; }
[[ -f .env ]] || { echo 'ERROR: .env is missing' >&2; exit 2; }
ENV_MODE="$(stat -c '%a' .env)"
[[ "$ENV_MODE" == '600' || "$ENV_MODE" == '400' || "$ENV_MODE" == '640' ]] || { echo 'ERROR: .env permissions must be 600, 400, or 640' >&2; exit 2; }
[[ -d "$BACKUP_DIR" && -w "$BACKUP_DIR" ]] || { echo 'ERROR: backup destination is absent or not writable' >&2; exit 2; }

env_value() { sed -n "s/^$1=//p" .env | tail -n 1; }
env_name_present() { grep -Eq "^$1=" .env; }
for key in DATABASE_URL MYSQL_ROOT_PASSWORD MYSQL_PASSWORD REDIS_URL QDRANT_URL JWT_SECRET PROVIDER_KEY_ENCRYPTION_SECRET STORAGE_ROOT PUBLIC_API_URL GENX_BASE_URL GENX_API_KEY GROQ_API_KEY TOGETHER_API_KEY DEEPINFRA_API_KEY ADMIN_EMAIL ADMIN_PASSWORD; do
  env_name_present "$key" || { echo "ERROR: required environment name is absent: $key" >&2; exit 2; }
done
PUBLIC_URL="$(env_value PUBLIC_API_URL)"
[[ "$PUBLIC_URL" =~ ^https:// ]] || { echo 'ERROR: PUBLIC_API_URL must be an HTTPS public URL' >&2; exit 2; }
[[ "$PUBLIC_URL" != *example.com* && "$PUBLIC_URL" != *localhost* && "$PUBLIC_URL" != *127.0.0.1* ]] || { echo 'ERROR: PUBLIC_API_URL is a placeholder or local URL' >&2; exit 2; }
GENX_URL="$(env_value GENX_BASE_URL)"
[[ "$GENX_URL" =~ ^https:// ]] || { echo 'ERROR: GENX_BASE_URL must be an HTTPS URL' >&2; exit 2; }
[[ -n "$(env_value ADMIN_PASSWORD)" ]] || { echo 'ERROR: ADMIN_PASSWORD must be nonempty for authenticated post-deploy proof' >&2; exit 2; }

command -v docker >/dev/null
docker info >/dev/null
docker compose version >/dev/null
command -v nginx >/dev/null
nginx -t
docker compose config --quiet

for service in mariadb redis qdrant api worker dashboard; do
  [[ -n "$(docker compose ps -q "$service")" ]] || { echo "ERROR: service is absent: $service" >&2; exit 2; }
done
docker compose exec -T mariadb sh -c 'mariadb-admin ping -uroot -p"$MYSQL_ROOT_PASSWORD" --silent' >/dev/null
docker compose exec -T redis redis-cli ping | grep -qx PONG
curl --fail --silent --show-error --max-time 5 http://127.0.0.1:6333/healthz >/dev/null
docker compose exec -T api sh -c 'test -d /var/www/amarktai/storage && test -w /var/www/amarktai/storage'
docker compose exec -T api ffmpeg -version >/dev/null
docker compose exec -T worker ffmpeg -version >/dev/null

API_HEALTH="$(curl --fail --silent --show-error --max-time 10 http://127.0.0.1:3001/health)"
ROLLBACK_SHA="$(printf '%s' "$API_HEALTH" | node -e "let s='';process.stdin.on('data',c=>s+=c).on('end',()=>process.stdout.write(JSON.parse(s).build?.gitSha||''))")"
[[ "$ROLLBACK_SHA" =~ ^[0-9a-f]{40}$ ]] || { echo 'ERROR: current rollback SHA is unavailable' >&2; exit 2; }

echo 'PRODUCTION_PREFLIGHT=PASS'
echo "CURRENT_SHA=$CURRENT_SHA"
echo "ROLLBACK_SHA=$ROLLBACK_SHA"
echo "TARGET_SHA=$DEPLOY_SHA"
echo "REMOTE_BRANCH=$DEPLOY_BRANCH"
echo 'ENVIRONMENT_VALUES=REDACTED'
