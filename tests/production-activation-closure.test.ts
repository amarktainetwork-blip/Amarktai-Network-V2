import { readFileSync } from 'node:fs'
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
    expect(script).not.toMatch(/console\.(log|error)\([^\n]*password/i)
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

  it('keeps one canonical operational README and a current recovery runbook', () => {
    const readme = source('README.md')
    const runbook = source('docs/PRODUCTION_MIGRATION_RUNBOOK.md')
    expect(readme).toContain('Groq — removed')
    expect(readme).toContain('Broken or fresh-stack recovery')
    expect(runbook).toContain('Path B — fresh or broken-stack recovery')
    expect(runbook).toContain('20260718_complete_platform_recovery')
    expect(runbook).not.toContain('Production Migration Runbook — Phase 1')
  })
})
