import { existsSync, readFileSync } from 'node:fs'
import { resolve } from 'node:path'
import { describe, expect, it } from 'vitest'

const root = process.cwd()
const source = (path: string) => readFileSync(resolve(root, path), 'utf8')
const containsAll = (text: string, values: string[]) => values.forEach((value) => expect(text).toContain(value))

describe('production activation closure', () => {
  it('requires the latest guarded production schema migration', () => {
    const guard = source('packages/db/src/schema-guard.ts')
    expect(guard).toContain("REQUIRED_SCHEMA_MIGRATION = '20260722_specialist_workflow_closure'")
    expect(guard).not.toContain("REQUIRED_SCHEMA_MIGRATION = '20260714_release_candidate'")
  })

  it('provides a guarded administrator password reset without secret output', () => {
    const script = source('scripts/admin-reset-password.mjs')
    containsAll(script, [
      "required('ADMIN_EMAIL')", "required('ADMIN_RESET_PASSWORD')",
      "required('CONFIRM_ADMIN_PASSWORD_RESET')", 'confirmation !== email',
      'password.length < 12', 'await hash(password, 12)', 'passwordHash',
      'enabled: true', 'tokenVersion: { increment: 1 }', 'Administrator does not exist',
    ])
    expect(script).not.toMatch(/console\.(log|error)\(password\)|\$\{password\}/)
    const pkg = JSON.parse(source('package.json'))
    expect(pkg.scripts['admin:reset-password']).toBe('node scripts/admin-reset-password.mjs')
    expect(source('Dockerfile')).toContain('COPY scripts/admin-reset-password.mjs scripts/admin-reset-password.mjs')
  })

  it('keeps runtime providers canonical and Groq removed', () => {
    const env = source('.env.example')
    expect(env).not.toContain('GROQ_API_KEY=')
    containsAll(env, ['Groq has been removed', 'GENX_API_KEY=', 'TOGETHER_API_KEY=', 'DEEPINFRA_API_KEY='])
  })

  it('binds stateful and application ports to localhost behind nginx', () => {
    const compose = source('docker-compose.yml')
    for (const port of ['3306', '6379', '6333', '6334', '3001', '3002', '3000']) {
      expect(compose).toContain(`127.0.0.1:${port}:${port}`)
    }
    expect(compose).not.toMatch(/-\s*["']?(3306|6379|6333|6334|3001|3002|3000):\1["']?\s*$/m)
  })

  it('validates and repairs nginx with least privilege and clean output', () => {
    const validator = source('deploy/nginx-check.sh')
    containsAll(validator, [
      'validate_nginx_configuration()', 'sudo -v', 'sudo nginx -t',
      "\\[(warn|alert|emerg|crit)\\]", 'production activation requires clean output',
      'syntax is ok', 'test is successful',
    ])
    for (const path of ['deploy/preflight.sh', 'deploy/deploy.sh']) {
      const text = source(path)
      containsAll(text, ['source "$REPO_DIR/deploy/nginx-check.sh"', 'validate_nginx_configuration'])
      expect(text).not.toMatch(/^\s*nginx -t\s*$/m)
    }
    const repair = source('deploy/fix-nginx-http2.sh')
    containsAll(repair, [
      'NGINX_SITE:-/etc/nginx/sites-available/webdock', 'listen 443 ssl;',
      'listen [::]:443 ssl;', 'http2 on;', 'ALREADY_CURRENT', 'restore_backup',
      'sudo nginx -t', 'sudo systemctl reload nginx', 'NGINX_HTTP2_REPAIR=PASS',
    ])
  })

  it('cleans disposable Docker storage while preserving data and rollback images', () => {
    const prepare = source('deploy/prepare-production-host.sh')
    containsAll(prepare, [
      'MIN_AVAILABLE_KB="${MIN_AVAILABLE_KB:-16777216}"', 'ROLLBACK_SHA="${ROLLBACK_SHA:-}"',
      'guard_rollback_image()', 'docker image inspect "$image"',
      'docker create --name "$guard" "$image" true', 'amarktai/api:$ROLLBACK_SHA',
      'amarktai/worker:$ROLLBACK_SHA', 'amarktai/dashboard:$ROLLBACK_SHA',
      'docker image prune --all --force', 'docker builder prune --all --force',
      'cleanup_prune_guards', 'npm ci --ignore-scripts --cache "$NPM_CONFIG_CACHE"',
      'npx playwright install chromium', "chromium.launch({ headless: true })",
      'PRODUCTION_HOST_PREPARE=PASS', '/var/tmp/amarktai-deploy-${HOST_UID}',
    ])
    expect(prepare).not.toMatch(/docker (volume|system|container) prune|sudo chown|\/var\/backups\/amarktai|\/home\/admin\/\.npm/)
  })

  it('pins exact rollback images before cleanup and deployment', () => {
    const activate = source('deploy/activate-production.sh')
    containsAll(activate, [
      'git fetch --prune origin "$DEPLOY_BRANCH"', 'export GIT_SHA="$DEPLOY_SHA"',
      'export BUILD_TIME="${BUILD_TIME:-activation-preflight}"', 'http://127.0.0.1:3001/health',
      'for service in api worker dashboard', "docker inspect --format '{{.Image}}' \"$container\"",
      'docker tag "$image_id" "amarktai/$service:$ROLLBACK_SHA"',
      '[activation] rollback images pinned', 'git switch --detach "$DEPLOY_SHA"',
      'bash "$REPO_DIR/deploy/prepare-production-host.sh"',
      "read -rsp 'Administrator password for production proof: '",
      'exec bash "$REPO_DIR/deploy/deploy.sh"',
    ])
    expect(activate.indexOf('rollback images pinned')).toBeLessThan(activate.indexOf('prepare-production-host.sh'))
  })

  it('keeps fixture proof in CI and static proof in VPS deployment', () => {
    const pkg = JSON.parse(source('package.json'))
    const deploy = source('deploy/deploy.sh')
    const proof = source('scripts/proof-deployment-static.mjs')
    expect(pkg.scripts.proof).toBe('node scripts/proof-release-fixture.mjs')
    expect(pkg.scripts['proof:deployment-static']).toBe('node scripts/proof-deployment-static.mjs')
    expect(deploy).toContain('npm run proof:deployment-static')
    expect(deploy).not.toContain('proof-release-fixture.mjs')
    containsAll(proof, ['DEPLOYMENT_STATIC_PROOF=PASS', 'proof-direct-provider-capabilities.mjs', 'proof-long-form-closure.mjs'])
    expect(proof).not.toMatch(/proof-release-fixture\.mjs|docker compose/)
  })

  it('restricts production cors', () => {
    const server = source('apps/api/src/server.ts')
    containsAll(server, ['CORS_ALLOWED_ORIGINS', 'PUBLIC_API_URL', 'allowedCorsOrigins.has(origin)', "process.env.NODE_ENV !== 'production'"])
    expect(server).not.toContain('origin: true')
  })

  it('keeps canonical operational and recovery documentation current', () => {
    const readme = source('README.md')
    const runbook = source('docs/PRODUCTION_MIGRATION_RUNBOOK.md')
    containsAll(readme, ['| **Groq** | Removed.', 'docs/PRODUCTION_MIGRATION_RUNBOOK.md', 'proof-production-release-candidate.mjs'])
    containsAll(runbook, ['Fresh or broken-stack recovery', '20260718_complete_platform_recovery', 'ADMIN_RESET_PASSWORD'])
    expect(runbook).not.toContain('Production Migration Runbook — Phase 1')
    expect(existsSync(resolve(root, 'deploy/verify.sh'))).toBe(false)
    expect(readme).not.toContain('deploy/verify.sh')
  })
})
