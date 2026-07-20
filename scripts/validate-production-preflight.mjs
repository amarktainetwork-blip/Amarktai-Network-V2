#!/usr/bin/env node
import { readFileSync } from 'node:fs'
import { resolve } from 'node:path'

const root = resolve(new URL('..', import.meta.url).pathname.replace(/^\/([A-Za-z]:)/, '$1'))
const preflight = readFileSync(resolve(root, 'deploy/preflight.sh'), 'utf8')
const deploy = readFileSync(resolve(root, 'deploy/deploy.sh'), 'utf8')
const nginxCheck = readFileSync(resolve(root, 'deploy/nginx-check.sh'), 'utf8')
const example = readFileSync(resolve(root, '.env.example'), 'utf8')

const checks = [
  ['exact deployment branch', preflight.includes('feat/production-activation-music-longform')],
  ['exact remote SHA', preflight.includes('git ls-remote') && preflight.includes('REMOTE_SHA')],
  ['clean worktree', preflight.includes('git status --porcelain')],
  ['rollback identity', preflight.includes('ROLLBACK_SHA')],
  ['disk check', preflight.includes('5242880')],
  ['environment permissions', preflight.includes("stat -c '%a' .env")],
  ['canonical runtime provider names', ['GENX_API_KEY', 'TOGETHER_API_KEY', 'DEEPINFRA_API_KEY'].every((key) => preflight.includes(key)) && !preflight.includes('MIMO_API_KEY') && !preflight.includes('GROQ_API_KEY')],
  ['placeholder public URL rejected', preflight.includes('example.com') && preflight.includes('PUBLIC_API_URL')],
  ['provider base URL and authenticated proof inputs checked', preflight.includes('GENX_BASE_URL') && preflight.includes('ADMIN_PASSWORD must be nonempty')],
  ['compose and least-privilege nginx validated',
    preflight.includes('docker compose config --quiet')
      && preflight.includes('validate_nginx_configuration')
      && nginxCheck.includes('sudo -v')
      && nginxCheck.includes('sudo nginx -t')
      && nginxCheck.includes('production activation requires clean output')
      && !deploy.includes('sudo bash deploy/deploy.sh')],
  ['MariaDB Redis Qdrant checked', ['mariadb-admin ping', 'redis-cli ping', '6333/healthz'].every((value) => preflight.includes(value))],
  ['artifact storage and FFmpeg checked', preflight.includes('test -w /var/www/amarktai/storage') && preflight.includes('ffmpeg -version')],
  ['read-only boundary', !/(git switch|git checkout|docker compose build|migrate deploy|docker compose up|mariadb-dump)/.test(preflight)],
  ['deployment retains exact SHA, backups and rollback', deploy.includes('DEPLOY_SHA') && deploy.includes('ROLLBACK_SHA') && deploy.includes('rollback_application') && deploy.includes('ARTIFACT_BACKUP_FILE')],
  ['deployment runs the strict release proof', deploy.includes('proof-production-release-candidate.mjs') && deploy.includes('--strict') && deploy.includes('PRODUCTION_PROOF_FILE')],
  ['example exposes public URL guard', example.includes('PUBLIC_API_URL=https://api.example.com')],
]

let failures = 0
for (const [label, ok] of checks) {
  console.log(`${ok ? 'PASS' : 'FAIL'} ${label}`)
  if (!ok) failures++
}
if (failures) process.exit(1)
