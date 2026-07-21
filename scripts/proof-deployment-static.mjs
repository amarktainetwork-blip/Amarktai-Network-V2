#!/usr/bin/env node
import { spawnSync } from 'node:child_process'
import { resolve } from 'node:path'

const root = resolve(new URL('..', import.meta.url).pathname.replace(/^\/([A-Za-z]:)/, '$1'))
const node = process.execPath

// Production activation must not rebuild the disposable Docker release fixture.
// That authoritative real-service fixture is mandatory in CI for the exact SHA.
// These checks are deliberately host-local and non-containerized; live provider,
// application, artifact, and long-form proof runs after the production images start.
const checks = [
  [node, ['node_modules/vitest/vitest.mjs', 'run', 'tests/release-candidate-contract.test.ts'], 'release-candidate contract tests'],
  [node, ['scripts/proof-direct-provider-capabilities.mjs', '--static', '--strict'], 'direct-provider static proof'],
  [node, ['scripts/proof-long-form-runtime.mjs', '--static-only'], 'long-form runtime static proof'],
  [node, ['scripts/proof-long-form-closure.mjs', '--static', '--strict'], 'long-form closure static proof'],
  [node, ['scripts/proof-long-form-closure.mjs', '--local-fixture', '--strict'], 'local FFmpeg multimedia fixture proof'],
  [node, ['node_modules/vitest/vitest.mjs', 'run',
    'tests/genx-music-contract.test.js',
    'tests/music-generation-foundation.test.js',
    'tests/music-reference-workflow-contract.test.js'], 'music regression proof'],
]

let failures = 0
for (const [command, args, label] of checks) {
  const result = spawnSync(command, args, {
    cwd: root,
    stdio: 'inherit',
    env: process.env,
    windowsHide: true,
  })
  const ok = result.status === 0
  console.log(`${ok ? 'PASS' : 'FAIL'} ${label}`)
  if (!ok) failures++
}

if (failures > 0) process.exit(1)
console.log('DEPLOYMENT_STATIC_PROOF=PASS')
