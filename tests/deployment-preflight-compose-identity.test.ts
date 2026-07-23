import { readFileSync } from 'node:fs'
import { describe, expect, it } from 'vitest'

const preflight = readFileSync('deploy/preflight.sh', 'utf8')

describe('production deployment preflight compose identity', () => {
  it('derives required Compose identity from the validated deployment SHA', () => {
    const shaValidation = preflight.indexOf('DEPLOY_SHA must be a 40-character SHA')
    const gitShaExport = preflight.indexOf('export GIT_SHA="$DEPLOY_SHA"')
    const buildTimeExport = preflight.indexOf('export BUILD_TIME="${BUILD_TIME:-preflight-$DEPLOY_SHA}"')
    const composeConfig = preflight.indexOf('docker compose config --quiet')

    expect(shaValidation).toBeGreaterThanOrEqual(0)
    expect(gitShaExport).toBeGreaterThan(shaValidation)
    expect(buildTimeExport).toBeGreaterThan(gitShaExport)
    expect(composeConfig).toBeGreaterThan(buildTimeExport)
  })

  it('keeps controlled deployment branches explicit and fail closed', () => {
    expect(preflight).toContain('feat/production-activation-music-longform|feat/batch-b-platform-closure')
    expect(preflight).toContain("echo 'ERROR: unexpected deployment branch'")
  })
})
