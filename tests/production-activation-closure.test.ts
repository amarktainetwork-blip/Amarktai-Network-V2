import { existsSync, readFileSync } from 'node:fs'
import { resolve } from 'node:path'
import { describe, expect, it } from 'vitest'

const root = process.cwd()
const source = (path: string) => readFileSync(resolve(root, path), 'utf8')

describe('production activation closure', () => {
  it('requires the latest production recovery migration at API startup', () => {
    const guard = source('packages/db/src/schema-guard.ts')
    expect(guard).toContain("REQUIRED_SCHEMA_MIGRATION = '20260720_split_genx_video_contracts'")
    expect(guard).not.toContain("REQUIRED_SCHEMA_MIGRATION = '20260714_release_candidate'")
  })

  it('provides an explicit guarded administrator password recovery command', () => {
    const script = source('scripts/admin-reset-password.mjs')
    expect(script).toContain("required('ADMIN_EMAIL')")
    expect(script).toContain("required('ADMIN_RESET_PASSWORD')")
    expect(script).toContain("required('CONFIRM_ADMIN_PASSWORD_RESET')")
    expect(script).toContain('confirmation !== email')
    expect(script).toContain('password.length < 12')
    expect(script).toContain('await hash(password, 12)')
    expect(script).toContain('passwordHash')
    expect(script).toContain('enabled: true')
    expect(script).toContain('tokenVersion: { increment: 1 }')
    expect(script).toContain('Administrator does not exist')
    expect(script).not.toContain('console.log(password)')
    expect(script).not.toContain('console.error(password)')
    expect(script).not.toContain('${password}')
  })

  it('exposes the reset command and includes it in the production runtime image', () => {
    const pkg = JSON.parse(source('package.json'))
    expect(pkg.scripts['admin:reset-password']).toBe('node scripts/admin-reset-password.mjs')
    const dockerfile = source('Dockerfile')
    expect(dockerfile).toContain('COPY scripts/admin-reset-password.mjs scripts/admin-reset-password.mjs')
  })

  it('keeps removed Groq credentials out of the production environment template', () => {
    const env = source('.env.example')
    expect(env).not.toContain('GROQ_API_KEY=')
    expect(env).toContain('Groq has been removed')
    expect(env).toContain('GENX_API_KEY=')
    expect(env).toContain('TOGETHER_API_KEY=')
    expect(env).toContain('DEEPINFRA_API_KEY=')
  })

  it('binds stateful services and application ports to localhost behind nginx', () => {
    const compose = source('docker-compose.yml')
    for (const port of ['3306:3306', '6379:6379', '6333:6333', '6334:6334', '3001:3001', '3002:3002', '3000:3000']) {
      expect(compose).toContain(`127.0.0.1:${port}`)
    }
    expect(compose).not.toMatch(/-\s*["']?(3306|6379|6333|6334|3001|3002|3000):\1["']?\s*$/m)
  })

  it('validates nginx with least privilege and rejects warning-bearing configuration', () => {
    const validator = source('deploy/nginx-check.sh')
    const preflight = source('deploy/preflight.sh')
    const deploy = source('deploy/deploy.sh')

    expect(validator).toContain('validate_nginx_configuration()')
    expect(validator).toContain('sudo -v')
    expect(validator).toContain('sudo nginx -t')
    expect(validator).toContain("\\[(warn|alert|emerg|crit)\\]")
    expect(validator).toContain('production activation requires clean output')
    expect(validator).toContain('syntax is ok')
    expect(validator).toContain('test is successful')

    expect(preflight).toContain('source "$REPO_DIR/deploy/nginx-check.sh"')
    expect(preflight).toContain('validate_nginx_configuration')
    expect(preflight).not.toMatch(/^\s*nginx -t\s*$/m)

    expect(deploy).toContain('source "$REPO_DIR/deploy/nginx-check.sh"')
    expect(deploy).toContain('validate_nginx_configuration')
    expect(deploy).not.toMatch(/^\s*nginx -t\s*$/m)
    expect(deploy).not.toContain('sudo bash deploy/deploy.sh')
  })

  it('provides an isolated idempotent host repair for deprecated nginx http2 syntax', () => {
    const repair = source('deploy/fix-nginx-http2.sh')

    expect(repair).toContain('NGINX_SITE:-/etc/nginx/sites-available/webdock')
    expect(repair).toContain('listen 443 ssl;')
    expect(repair).toContain('listen [::]:443 ssl;')
    expect(repair).toContain('http2 on;')
    expect(repair).toContain('ALREADY_CURRENT')
    expect(repair).toContain('restore_backup')
    expect(repair).toContain('sudo nginx -t')
    expect(repair).toContain('sudo systemctl reload nginx')
    expect(repair).toContain('NGINX_HTTP2_REPAIR=PASS')
    expect(repair).not.toContain('sudo bash deploy/deploy.sh')
  })

  it('reclaims unused Docker storage while preserving persistent data, live services, and rollback images', () => {
    const prepare = source('deploy/prepare-production-host.sh')

    expect(prepare).toContain('MIN_AVAILABLE_KB="${MIN_AVAILABLE_KB:-16777216}"')
    expect(prepare).toContain('ROLLBACK_SHA="${ROLLBACK_SHA:-}"')
    expect(prepare).toContain('guard_rollback_image()')
    expect(prepare).toContain('docker image inspect "$image"')
    expect(prepare).toContain('docker create --name "$guard" "$image" true')
    expect(prepare).toContain('amarktai/api:$ROLLBACK_SHA')
    expect(prepare).toContain('amarktai/worker:$ROLLBACK_SHA')
    expect(prepare).toContain('amarktai/dashboard:$ROLLBACK_SHA')
    expect(prepare).toContain('docker image prune --all --force')
    expect(prepare).toContain('docker builder prune --all --force')
    expect(prepare.indexOf('docker image prune --all --force')).toBeLessThan(prepare.indexOf('docker builder prune --all --force'))
    expect(prepare).toContain('cleanup_prune_guards')
    expect(prepare).toContain('npm ci --ignore-scripts --cache "$NPM_CONFIG_CACHE"')
    expect(prepare).toContain('npx playwright install chromium')
    expect(prepare).toContain("chromium.launch({ headless: true })")
    expect(prepare).toContain('PRODUCTION_HOST_PREPARE=PASS')
    expect(prepare).toContain('/var/tmp/amarktai-deploy-${HOST_UID}')
    expect(prepare).toContain('NPM_CONFIG_CACHE')
    expect(prepare).toContain('PLAYWRIGHT_BROWSERS_PATH')
    expect(prepare).toContain('! -O "$DEPLOY_CACHE_ROOT"')
    expect(prepare).not.toContain('/home/admin/.npm')
    expect(prepare).not.toContain('sudo chown')
    expect(prepare).not.toContain('docker volume prune')
    expect(prepare).not.toContain('docker system prune')
    expect(prepare).not.toContain('/var/backups/amarktai')
    expect(prepare).not.toContain('docker container prune')
  })

  it('pins the active rollback images before host cleanup and propagates isolated caches into deployment', () => {
    const activate = source('deploy/activate-production.sh')
    const composeInspection = 'container="$(docker compose ps -q "$service")"'

    expect(activate).toContain('git fetch --prune origin "$DEPLOY_BRANCH"')
    expect(activate).toContain('export GIT_SHA="$DEPLOY_SHA"')
    expect(activate).toContain('export BUILD_TIME="${BUILD_TIME:-activation-preflight}"')
    expect(activate).toContain('http://127.0.0.1:3001/health')
    expect(activate).toContain("JSON.parse(s).build?.gitSha")
    expect(activate).toContain('for service in api worker dashboard')
    expect(activate).toContain(composeInspection)
    expect(activate).toContain("docker inspect --format '{{.Image}}' \"$container\"")
    expect(activate).toContain('docker tag "$image_id" "amarktai/$service:$ROLLBACK_SHA"')
    expect(activate).toContain('[activation] rollback images pinned')
    expect(activate).toContain('git switch --detach "$DEPLOY_SHA"')
    expect(activate).toContain('/var/tmp/amarktai-deploy-${HOST_UID}')
    expect(activate).toContain('NPM_CONFIG_CACHE')
    expect(activate).toContain('PLAYWRIGHT_BROWSERS_PATH')
    expect(activate).toContain('export REPO_DIR DEPLOY_BRANCH DEPLOY_SHA ROLLBACK_SHA')
    expect(activate).toContain('export DEPLOY_CACHE_ROOT NPM_CONFIG_CACHE PLAYWRIGHT_BROWSERS_PATH')
    expect(activate).toContain('bash "$REPO_DIR/deploy/prepare-production-host.sh"')
    expect(activate).toContain("read -rsp 'Administrator password for production proof: '")
    expect(activate).toContain('exec bash "$REPO_DIR/deploy/deploy.sh"')
    expect(activate.indexOf('export GIT_SHA="$DEPLOY_SHA"')).toBeLessThan(activate.indexOf(composeInspection))
    expect(activate.indexOf('export BUILD_TIME="${BUILD_TIME:-activation-preflight}"')).toBeLessThan(activate.indexOf(composeInspection))
    expect(activate.indexOf('rollback images pinned')).toBeLessThan(activate.indexOf('bash "$REPO_DIR/deploy/prepare-production-host.sh"'))
    expect(activate.indexOf('bash "$REPO_DIR/deploy/prepare-production-host.sh"')).toBeLessThan(activate.indexOf('Administrator password for production proof'))
    expect(activate).not.toContain('sudo chown')
  })

  it('keeps the disposable Docker fixture in CI and out of VPS deployment', () => {
    const pkg = JSON.parse(source('package.json'))
    const deploy = source('deploy/deploy.sh')
    const deploymentProof = source('scripts/proof-deployment-static.mjs')

    expect(pkg.scripts.proof).toBe('node scripts/proof-release-fixture.mjs')
    expect(pkg.scripts['proof:deployment-static']).toBe('node scripts/proof-deployment-static.mjs')
    expect(deploy).toContain('npm run proof:deployment-static')
    expect(deploy).not.toMatch(/^\s*npm run proof\s*$/m)
    expect(deploy).not.toContain('proof-release-fixture.mjs')
    expect(deploymentProof).toContain('DEPLOYMENT_STATIC_PROOF=PASS')
    expect(deploymentProof).toContain('proof-direct-provider-capabilities.mjs')
    expect(deploymentProof).toContain('proof-long-form-closure.mjs')
    expect(deploymentProof).toContain('music-reference-workflow-contract.test.js')
    expect(deploymentProof).not.toContain('proof-release-fixture.mjs')
    expect(deploymentProof).not.toContain('docker compose')
  })

  it('restricts production cors instead of reflecting every origin', () => {
    const server = source('apps/api/src/server.ts')
    expect(server).toContain('CORS_ALLOWED_ORIGINS')
    expect(server).toContain('PUBLIC_API_URL')
    expect(server).toContain('allowedCorsOrigins.has(origin)')
    expect(server).toContain("process.env.NODE_ENV !== 'production'")
    expect(server).not.toContain('origin: true')
  })

  it('keeps one canonical operational README and a current recovery runbook', () => {
    const readme = source('README.md')
    const runbook = source('docs/PRODUCTION_MIGRATION_RUNBOOK.md')
    expect(readme).toContain('| **Groq** | Removed.')
    expect(readme).toContain('docs/PRODUCTION_MIGRATION_RUNBOOK.md')
    expect(readme).toContain('admin-reset-password.mjs')
    expect(runbook).toContain('Fresh or broken-stack recovery')
    expect(runbook).toContain('20260718_complete_platform_recovery')
    expect(runbook).toContain('ADMIN_RESET_PASSWORD')
    expect(runbook).not.toContain('Production Migration Runbook — Phase 1')
  })

  it('uses the current strict production verifier instead of the obsolete script', () => {
    const readme = source('README.md')
    expect(existsSync(resolve(root, 'deploy/verify.sh'))).toBe(false)
    expect(readme).toContain('proof-production-release-candidate.mjs')
    expect(readme).not.toContain('deploy/verify.sh')
  })
})
