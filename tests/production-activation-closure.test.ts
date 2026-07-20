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

  it('prepares the host without pruning persistent data or rollback images', () => {
    const prepare = source('deploy/prepare-production-host.sh')

    expect(prepare).toContain('docker builder prune --all --force')
    expect(prepare).toContain('docker image prune --force')
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
    expect(prepare).not.toContain('docker image prune -a')
    expect(prepare).not.toContain('/var/backups/amarktai')
    expect(prepare).not.toContain('docker container prune')
  })

  it('uses one canonical activation wrapper and propagates isolated caches into deployment', () => {
    const activate = source('deploy/activate-production.sh')

    expect(activate).toContain('git fetch --prune origin "$DEPLOY_BRANCH"')
    expect(activate).toContain('git switch --detach "$DEPLOY_SHA"')
    expect(activate).toContain('/var/tmp/amarktai-deploy-${HOST_UID}')
    expect(activate).toContain('NPM_CONFIG_CACHE')
    expect(activate).toContain('PLAYWRIGHT_BROWSERS_PATH')
    expect(activate).toContain('export DEPLOY_CACHE_ROOT NPM_CONFIG_CACHE PLAYWRIGHT_BROWSERS_PATH')
    expect(activate).toContain('bash "$REPO_DIR/deploy/prepare-production-host.sh"')
    expect(activate).toContain("read -rsp 'Administrator password for production proof: '")
    expect(activate).toContain('exec bash "$REPO_DIR/deploy/deploy.sh"')
    expect(activate.indexOf('prepare-production-host.sh')).toBeLessThan(activate.indexOf('Administrator password for production proof'))
    expect(activate).not.toContain('sudo chown')
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
    expect(readme.replaceAll('**', '')).toContain('Groq — removed')
    expect(readme).toContain('Broken or fresh-stack recovery')
    expect(readme).toContain('admin-reset-password.mjs')
    expect(runbook).toContain('Fresh or broken-stack recovery')
    expect(runbook).toContain('20260718_complete_platform_recovery')
    expect(runbook).toContain('ADMIN_RESET_PASSWORD')
    expect(runbook).not.toContain('Production Migration Runbook — Phase 1')
  })

  it('removes the obsolete hardcoded production verifier', () => {
    expect(existsSync(resolve(root, 'deploy/verify.sh'))).toBe(false)
    expect(source('README.md')).toContain('deploy/verify.sh` was removed')
  })
})
