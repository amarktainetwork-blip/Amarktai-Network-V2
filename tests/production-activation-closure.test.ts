import { existsSync, readFileSync } from 'node:fs'
import { resolve } from 'node:path'
import { describe, expect, it } from 'vitest'

const root = process.cwd()
const source = (path: string) => readFileSync(resolve(root, path), 'utf8')

describe('production activation closure', () => {
  it('requires the latest production recovery migration at API startup', () => {
    const guard = source('packages/db/src/schema-guard.ts')
    expect(guard).toContain("REQUIRED_SCHEMA_MIGRATION = '20260718_complete_platform_recovery'")
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
