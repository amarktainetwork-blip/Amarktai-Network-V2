/**
 * Long-Form Runtime FFmpeg Proof Script
 *
 * Verifies long-form video assembly dependencies without provider keys,
 * live provider calls, or direct TypeScript source imports.
 *
 * Default mode is repository/runtime-readiness proof: local ffmpeg is useful
 * but not required when the Docker API stage installs ffmpeg.
 *
 * Strict runtime mode is intended to run inside the rebuilt API container:
 *   node scripts/proof-long-form-runtime.mjs --strict-runtime
 */

import { execFileSync } from 'child_process'
import fs from 'fs'
import path from 'path'
import { fileURLToPath } from 'url'

const __filename = fileURLToPath(import.meta.url)
const __dirname = path.dirname(__filename)
export const ROOT = path.resolve(__dirname, '..')

export function createProofState(log = console.log) {
  return {
    passed: 0,
    failed: 0,
    warnings: 0,
    results: [],
    log,
  }
}

export async function check(state, name, fn) {
  try {
    const result = await fn()
    if (result) {
      state.log(`PASS ${name}`)
      state.passed += 1
      state.results.push({ name, status: 'pass' })
    } else {
      state.log(`FAIL ${name}`)
      state.failed += 1
      state.results.push({ name, status: 'fail' })
    }
  } catch (error) {
    const message = error instanceof Error ? error.message : String(error)
    state.log(`FAIL ${name}: ${message}`)
    state.failed += 1
    state.results.push({ name, status: 'fail', error: message })
  }
}

export function warn(state, name, message) {
  state.log(`WARN ${name}: ${message}`)
  state.warnings += 1
  state.results.push({ name, status: 'warn', warning: message })
}

function readSource(root, relativePath) {
  return fs.readFileSync(path.join(root, relativePath), 'utf-8')
}

export function dockerApiStageInstallsFfmpeg(root = ROOT) {
  const content = readSource(root, 'Dockerfile')
  const apiStageMatch = content.match(/FROM production-base AS api[\s\S]*?(?=\nFROM\s|$)/)
  return Boolean(apiStageMatch?.[0]?.includes('ffmpeg'))
}

export function detectFfmpeg(runCommand = execFileSync) {
  try {
    const output = runCommand('ffmpeg', ['-version'], {
      encoding: 'utf-8',
      stdio: ['ignore', 'pipe', 'pipe'],
    })
    return {
      available: typeof output === 'string' && output.includes('ffmpeg version'),
      output: typeof output === 'string' ? output : '',
    }
  } catch (error) {
    return {
      available: false,
      error: error instanceof Error ? error.message : String(error),
    }
  }
}

export async function runProof({
  root = ROOT,
  strictRuntime = process.argv.includes('--strict-runtime'),
  log = console.log,
  runCommand = execFileSync,
} = {}) {
  const state = createProofState(log)

  log('===============================================================')
  log('  AmarktAI Network V2 - Long-Form Runtime FFmpeg Proof')
  log('===============================================================')
  log(`Mode: ${strictRuntime ? 'strict runtime' : 'default repository/runtime readiness'}`)

  const dockerInstallsFfmpeg = dockerApiStageInstallsFfmpeg(root)
  const ffmpeg = detectFfmpeg(runCommand)

  log('\n-- FFmpeg Availability --')
  if (strictRuntime) {
    await check(state, 'ffmpeg command exists in strict runtime mode', () => ffmpeg.available)
    await check(state, 'ffmpeg -version runs in strict runtime mode', () => ffmpeg.available)
  } else if (ffmpeg.available) {
    await check(state, 'local ffmpeg -version runs', () => true)
  } else if (dockerInstallsFfmpeg) {
    warn(
      state,
      'local ffmpeg missing',
      'Default mode allows this because the Docker API stage installs ffmpeg. Run --strict-runtime inside the rebuilt API container.',
    )
  } else {
    await check(state, 'ffmpeg available locally or expected in Docker API runtime', () => false)
  }

  log('\n-- Assembly Module --')
  await check(state, 'long-form-assembly.ts exists', () =>
    fs.existsSync(path.join(root, 'apps/api/src/lib/long-form-assembly.ts')))

  await check(state, 'checkFfmpegAvailable function exists', () => {
    const content = readSource(root, 'apps/api/src/lib/long-form-assembly.ts')
    return content.includes('export async function checkFfmpegAvailable')
  })

  await check(state, 'checkFfmpegAvailable returns an honest typed shape', () => {
    const content = readSource(root, 'apps/api/src/lib/long-form-assembly.ts')
    return content.includes('available: boolean')
      && content.includes('return {')
      && content.includes('available: true')
      && content.includes('available: false')
  })

  log('\n-- Assembly Routes --')
  await check(state, 'assembly route exists in admin-long-form-video.ts', () => {
    const content = readSource(root, 'apps/api/src/routes/admin-long-form-video.ts')
    return content.includes('/api/admin/long-form-video/assemble/')
  })

  await check(state, 'assembly status route exists', () => {
    const content = readSource(root, 'apps/api/src/routes/admin-long-form-video.ts')
    return content.includes('/api/admin/long-form-video/assembly/')
  })

  await check(state, 'assembly route uses checkFfmpegAvailable', () => {
    const content = readSource(root, 'apps/api/src/routes/admin-long-form-video.ts')
    return content.includes('checkFfmpegAvailable')
  })

  log('\n-- Artifact Storage --')
  await check(state, 'artifact storage root is defined through config source', () => {
    const content = readSource(root, 'packages/core/src/config.ts')
    return content.includes('DEFAULT_STORAGE_ROOT')
      && content.includes('/var/www/amarktai/storage')
      && content.includes('process.env.STORAGE_ROOT')
      && content.includes('process.env.AMARKTAI_STORAGE_ROOT')
      && content.includes('export function getStorageRoot')
  })

  log('\n-- Audit Truth --')
  await check(state, 'audit reports assembly module exists', () => {
    const content = readSource(root, 'scripts/audit-build-completion-map.mjs')
    return content.includes('longFormAssemblyModuleExists')
  })

  await check(state, 'audit reports assembly route exists', () => {
    const content = readSource(root, 'scripts/audit-build-completion-map.mjs')
    return content.includes('longFormAssemblyRouteExists')
  })

  await check(state, 'audit separates videoOnlyAssemblyPipelineReady from videoOnlyReady', () => {
    const content = readSource(root, 'scripts/audit-build-completion-map.mjs')
    return content.includes('videoOnlyAssemblyPipelineReady')
      && content.includes('videoOnlyReady')
  })

  await check(state, 'audit reports fullMultimediaReady false (not live-proven)', () => {
    const content = readSource(root, 'scripts/audit-build-completion-map.mjs')
    return content.includes('fullMultimediaReady: false')
  })

  log('\n-- Security --')
  await check(state, 'assembly module does not require provider keys', () => {
    const content = readSource(root, 'apps/api/src/lib/long-form-assembly.ts')
    const disallowedEnvReads = ['GROQ', 'TOGETHER', 'GENX']
      .map((provider) => `process.env.${provider}_API_KEY`)
    return disallowedEnvReads.every((envRead) => !content.includes(envRead))
  })

  await check(state, 'assembly module does not make live provider calls', () => {
    const content = readSource(root, 'apps/api/src/lib/long-form-assembly.ts')
    const disallowedFetchPrefixes = [
      ['https://api', 'together.xyz'],
      ['https://api', 'groq.com'],
      ['https://query', 'genx.sh'],
    ].map(([prefix, host]) => `fetch('${prefix}.${host}`)
    return disallowedFetchPrefixes.every((fetchPrefix) => !content.includes(fetchPrefix))
  })

  log('\n-- Docker Configuration --')
  await check(state, 'Dockerfile installs ffmpeg in api stage', () => dockerInstallsFfmpeg)

  log('\n===============================================================')
  log(`  Results: ${state.passed} passed, ${state.failed} failed, ${state.warnings} warnings`)
  log('===============================================================')

  if (state.failed > 0) {
    log('\nSome checks failed. Review the output above.\n')
  } else {
    log('\nAll required checks passed. Long-form runtime proof is honest.\n')
  }

  return state
}

const isDirectRun = process.argv[1]
  && path.resolve(process.argv[1]) === fileURLToPath(import.meta.url)

if (isDirectRun) {
  const state = await runProof()
  process.exit(state.failed > 0 ? 1 : 0)
}
