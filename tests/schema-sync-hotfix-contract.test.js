import fs from 'node:fs'
import path from 'node:path'
import { describe, expect, it } from 'vitest'

const ROOT = process.cwd()

describe('Docker schema sync hotfix contract', () => {
  it('uses the safe Prisma db push wrapper during Docker boot', () => {
    const entrypoint = fs.readFileSync(path.join(ROOT, 'scripts/docker-entrypoint.sh'), 'utf8')

    expect(entrypoint).toContain('node scripts/prisma-db-push-safe.mjs')
    expect(entrypoint).not.toContain('prisma db push --schema=./prisma/schema.prisma --accept-data-loss --skip-generate 2>&1')
  })

  it('handles only the known credential_usage_policy duplicate-column case idempotently', () => {
    const script = fs.readFileSync(path.join(ROOT, 'scripts/prisma-db-push-safe.mjs'), 'utf8')

    expect(script).toContain('credential_usage_policy')
    expect(script).toContain('Duplicate column name')
    expect(script).toContain('continuing without destructive reset')
    expect(script).not.toContain('db reset')
    expect(script).not.toContain('migrate reset')
    expect(script).not.toContain('DROP DATABASE')
  })
})
