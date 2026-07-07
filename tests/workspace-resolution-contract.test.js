import fs from 'node:fs'
import path from 'node:path'
import { describe, expect, it } from 'vitest'

const ROOT = process.cwd()

describe('clean workspace test resolution', () => {
  it('aliases workspace packages to source for Vitest instead of requiring dist', () => {
    const config = fs.readFileSync(path.join(ROOT, 'vitest.config.mjs'), 'utf8')

    expect(config).toContain("'@amarktai/core': fromRoot('./packages/core/src/index.ts')")
    expect(config).toContain("'@amarktai/db': fromRoot('./packages/db/src/index.ts')")
    expect(config).toContain("'@amarktai/providers': fromRoot('./packages/providers/src/index.ts')")
    expect(config).toContain("'@amarktai/artifacts': fromRoot('./packages/artifacts/src/index.ts')")
  })

  it('keeps production workspace exports pointed at built dist files', () => {
    for (const packagePath of [
      'packages/core/package.json',
      'packages/db/package.json',
      'packages/providers/package.json',
      'packages/artifacts/package.json',
    ]) {
      const pkg = JSON.parse(fs.readFileSync(path.join(ROOT, packagePath), 'utf8'))

      expect(pkg.exports['.'].import).toBe('./dist/index.js')
      expect(pkg.exports['.'].types).toBe('./dist/index.d.ts')
    }
  })
})
