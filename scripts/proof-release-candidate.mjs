#!/usr/bin/env node
import { spawnSync } from 'node:child_process'
import { resolve } from 'node:path'

const root = resolve(new URL('..', import.meta.url).pathname.replace(/^\/([A-Za-z]:)/, '$1'))
const node = process.execPath
const checks = [
  [node, ['node_modules/vitest/vitest.mjs', 'run', 'tests/release-candidate-contract.test.ts'], 'release-candidate contract tests'],
  [node, ['scripts/proof-direct-provider-capabilities.mjs', '--static', '--strict'], 'direct-provider static proof'],
  [node, ['scripts/proof-long-form-runtime.mjs', '--static-only'], 'long-form runtime static proof'],
  [node, ['scripts/proof-long-form-closure.mjs', '--static', '--strict'], 'long-form closure static proof'],
  [node, ['scripts/proof-long-form-closure.mjs', '--local-fixture', '--strict'], 'FFmpeg multimedia fixture proof'],
]

let failures = 0
for (const [command, args, label] of checks) {
  const result = spawnSync(command, args, { cwd: root, stdio: 'inherit', env: process.env, windowsHide: true })
  const ok = result.status === 0
  console.log(`${ok ? 'PASS' : 'FAIL'} ${label}`)
  if (!ok) failures++
}

const fixture = spawnSync(node, ['scripts/proof-release-fixture.mjs'], {
  cwd: root,
  stdio: 'inherit',
  windowsHide: true,
  env: process.env,
})
const fixtureOk = fixture.status === 0
console.log(`${fixtureOk ? 'PASS' : 'FAIL'} real-service release-candidate fixture and browser proof`)
if (!fixtureOk) failures++

if (failures) process.exit(1)
console.log('RELEASE_CANDIDATE_FIXTURE_PROOF=PASS')
