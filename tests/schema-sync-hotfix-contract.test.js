import fs from 'node:fs'
import path from 'node:path'
import { describe, expect, it } from 'vitest'

const ROOT = process.cwd()

describe('Docker entrypoint safety contract', () => {
  it('API and worker startup never run schema mutation', () => {
    const entrypoint = fs.readFileSync(path.join(ROOT, 'scripts/docker-entrypoint.sh'), 'utf8')

    // Must NOT contain any schema mutation commands
    expect(entrypoint).not.toContain('prisma db push')
    expect(entrypoint).not.toContain('--accept-data-loss')
    expect(entrypoint).not.toContain('prisma-db-push-safe')
    expect(entrypoint).not.toContain('prisma-migrate-deploy')

    // Must use read-only migration status check
    expect(entrypoint).toContain('prisma migrate status')
  })

  it('migration deploy script exists and uses migrate deploy', () => {
    const scriptPath = path.join(ROOT, 'scripts/prisma-migrate-deploy.mjs')
    expect(fs.existsSync(scriptPath)).toBe(true)

    const script = fs.readFileSync(scriptPath, 'utf8')
    expect(script).toContain('migrate')
    expect(script).toContain('deploy')
    expect(script).not.toContain('db push')
    expect(script).not.toContain('--accept-data-loss')
  })

  it('Dockerfile does not reference prisma-db-push-safe', () => {
    const dockerfile = fs.readFileSync(path.join(ROOT, 'Dockerfile'), 'utf8')
    expect(dockerfile).not.toContain('prisma-db-push-safe')
    expect(dockerfile).toContain('prisma-migrate-deploy')
  })

  it('Dockerfile declares GIT_SHA and BUILD_TIME build args', () => {
    const dockerfile = fs.readFileSync(path.join(ROOT, 'Dockerfile'), 'utf8')
    expect(dockerfile).toContain('ARG GIT_SHA')
    expect(dockerfile).toContain('ARG BUILD_TIME')
  })

  it('Dockerfile generates build-info.json', () => {
    const dockerfile = fs.readFileSync(path.join(ROOT, 'Dockerfile'), 'utf8')
    expect(dockerfile).toContain('build-info.json')
  })

  it('docker-compose.yml passes GIT_SHA and BUILD_TIME build args', () => {
    const compose = fs.readFileSync(path.join(ROOT, 'docker-compose.yml'), 'utf8')
    expect(compose).toContain('GIT_SHA')
    expect(compose).toContain('BUILD_TIME')
  })

  it('disposable migration proof script exists', () => {
    const scriptPath = path.join(ROOT, 'scripts/verify-migrations-disposable.sh')
    expect(fs.existsSync(scriptPath)).toBe(true)

    const script = fs.readFileSync(scriptPath, 'utf8')
    expect(script).toContain('set -euo pipefail')
    expect(script).toContain('FRESH_DATABASE_PROOF=PASS')
    expect(script).toContain('UNMANAGED_DATABASE_PROOF=PASS')
    expect(script).toContain('SAMPLE_DATA_SURVIVAL=PASS')
    expect(script).toContain('prisma migrate deploy')
    expect(script).toContain('prisma migrate resolve')
    expect(script).not.toContain('prisma db push')
    expect(script).not.toContain('--accept-data-loss')
  })

  it('disposable proof script does not expose credentials', () => {
    const script = fs.readFileSync(path.join(ROOT, 'scripts/verify-migrations-disposable.sh'), 'utf8')
    // Should not print DATABASE_URL or passwords
    expect(script).not.toMatch(/echo.*DATABASE_URL/)
    expect(script).not.toMatch(/echo.*ROOT_PASS/)
    expect(script).not.toMatch(/echo.*password/i)
  })

  it('production migration runbook exists', () => {
    const runbookPath = path.join(ROOT, 'docs/PRODUCTION_MIGRATION_RUNBOOK.md')
    expect(fs.existsSync(runbookPath)).toBe(true)

    const runbook = fs.readFileSync(runbookPath, 'utf8')
    expect(runbook).toContain('prisma migrate resolve')
    expect(runbook).toContain('prisma migrate deploy')
    expect(runbook).not.toContain('prisma db push')
    expect(runbook).not.toContain('--accept-data-loss')
    expect(runbook).toContain('20250701_baseline_fc21a6e')
    expect(runbook).toContain('20260711_add_job_orchestration')
  })
})
