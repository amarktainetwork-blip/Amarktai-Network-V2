#!/usr/bin/env node
import { randomBytes } from 'node:crypto'
import { mkdir, readFile, rm, writeFile } from 'node:fs/promises'
import { tmpdir } from 'node:os'
import { join, resolve } from 'node:path'
import { spawnSync } from 'node:child_process'
import { fileURLToPath } from 'node:url'
import { proveRagReleaseFixture } from './lib/proof-rag-release-fixture.mjs'
import { proveResearchReleaseFixture } from './lib/proof-research-release-fixture.mjs'
import { proveVoiceAvatarProfileReleaseFixture } from './lib/proof-voice-avatar-profile-release-fixture.mjs'
import { proveSocialAdReleaseFixture } from './lib/proof-social-ad-release-fixture.mjs'
import { proveSpecialistWorkflowReleaseFixture } from './lib/proof-specialist-workflow-release-fixture.mjs'

const root = resolve(fileURLToPath(new URL('..', import.meta.url)))
const composeFile = join(root, 'docker-compose.release-fixture.yml')
const envFile = join(tmpdir(), `amarktai-release-fixture-${process.pid}.env`)
const proofReportFile = join(tmpdir(), `amarktai-release-proof-${process.pid}.json`)
const configuredOutputDir = process.env.RELEASE_FIXTURE_OUTPUT_DIR?.trim()
const outputDir = configuredOutputDir ? resolve(root, configuredOutputDir) : ''
const docker = process.platform === 'win32' ? 'docker.exe' : 'docker'
const npm = process.platform === 'win32' ? 'npm.cmd' : 'npm'
const tsx = join(root, 'node_modules', '.bin', process.platform === 'win32' ? 'tsx.cmd' : 'tsx')

function run(command, args, options = {}) {
  const result = spawnSync(command, args, {
    cwd: root,
    stdio: options.capture ? ['ignore', 'pipe', 'pipe'] : 'inherit',
    encoding: options.capture ? 'utf8' : undefined,
    env: { ...process.env, ...options.env },
    windowsHide: true,
  })
  if (result.error) throw result.error
  if (result.status !== 0) {
    const detail = options.capture ? `${result.stdout || ''}${result.stderr || ''}`.trim() : ''
    throw new Error(`${command} ${args.join(' ')} failed${detail ? `: ${detail}` : ''}`)
  }
  return result
}

function invariant(condition, message) {
  if (!condition) throw new Error(message)
}

function delay(milliseconds) {
  return new Promise((resolveDelay) => setTimeout(resolveDelay, milliseconds))
}

async function waitForApiReachable(timeoutMs = 120_000) {
  const deadline = Date.now() + timeoutMs
  while (Date.now() < deadline) {
    try {
      await fetch('http://127.0.0.1:3211/health', { signal: AbortSignal.timeout(3000) })
      return
    } catch {
      await delay(1000)
    }
  }
  throw new Error('Fixture API did not restart within the recovery-proof timeout')
}

const dockerVersion = spawnSync(docker, ['compose', 'version'], { cwd: root, stdio: 'ignore', windowsHide: true })
if (dockerVersion.status !== 0) {
  console.error('FIXTURE_STACK=BLOCKED Docker Compose is required for the real API/worker/dashboard fixture stack')
  process.exit(1)
}

const sha = run('git', ['rev-parse', 'HEAD'], { capture: true }).stdout.trim()
const generated = {
  FIXTURE_DB_ROOT_PASSWORD: process.env.FIXTURE_DB_ROOT_PASSWORD || randomBytes(24).toString('hex'),
  FIXTURE_DB_PASSWORD: process.env.FIXTURE_DB_PASSWORD || randomBytes(24).toString('hex'),
  FIXTURE_JWT_SECRET: process.env.FIXTURE_JWT_SECRET || randomBytes(40).toString('hex'),
  FIXTURE_ADMIN_PASSWORD: process.env.FIXTURE_ADMIN_PASSWORD || randomBytes(24).toString('base64url'),
  FIXTURE_GIT_SHA: process.env.FIXTURE_GIT_SHA || sha,
  FIXTURE_BUILD_TIME: process.env.FIXTURE_BUILD_TIME || new Date().toISOString(),
}
await writeFile(envFile, `${Object.entries(generated).map(([key, value]) => `${key}=${value}`).join('\n')}\n`, { mode: 0o600 })

const compose = ['compose', '--env-file', envFile, '-f', composeFile]

function redact(value) {
  let redacted = String(value || '')
  for (const secret of [
    generated.FIXTURE_DB_ROOT_PASSWORD,
    generated.FIXTURE_DB_PASSWORD,
    generated.FIXTURE_JWT_SECRET,
    generated.FIXTURE_ADMIN_PASSWORD,
  ]) {
    if (secret) redacted = redacted.replaceAll(secret, '[redacted]')
  }
  return redacted.replace(/((?:password|secret|api[_-]?key|authorization|bearer)\s*[:=]\s*)\S+/gi, '$1[redacted]')
}

function capture(command, args) {
  const result = spawnSync(command, args, {
    cwd: root,
    stdio: ['ignore', 'pipe', 'pipe'],
    encoding: 'utf8',
    env: process.env,
    windowsHide: true,
  })
  return redact(`${result.stdout || ''}${result.stderr || ''}`)
}

async function persistFixtureDiagnostics() {
  if (!outputDir) return
  await mkdir(outputDir, { recursive: true })
  const report = await readFile(proofReportFile, 'utf8').catch(() => '')
  if (report) await writeFile(join(outputDir, 'proof-report.json'), redact(report), { mode: 0o600 })
  await writeFile(join(outputDir, 'docker-compose-status.log'), capture(docker, [...compose, 'ps', '--all']), { mode: 0o600 })
  for (const service of ['mariadb', 'redis', 'qdrant', 'searxng', 'migrate', 'api', 'worker', 'dashboard']) {
    const logs = capture(docker, [...compose, 'logs', '--no-color', '--timestamps', service])
    await writeFile(join(outputDir, `${service}.log`), logs, { mode: 0o600 })
  }
}

async function apiRequest(path, token, init = {}) {
  const headers = new Headers(init.headers || {})
  if (token) headers.set('Authorization', `Bearer ${token}`)
  const response = await fetch(`http://127.0.0.1:3211${path}`, {
    ...init,
    headers,
    signal: init.signal || AbortSignal.timeout(30_000),
  })
  const body = await response.json().catch(() => ({}))
  return { response, body }
}

async function loginFixtureAdmin() {
  const result = await apiRequest('/api/v1/auth/login', '', {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ email: 'fixture-admin@invalid.example', password: generated.FIXTURE_ADMIN_PASSWORD }),
  })
  invariant(result.response.ok && typeof result.body.token === 'string', `Fixture recovery login returned ${result.response.status}`)
  return result.body.token
}

async function seedFixtureModelCatalogue(token) {
  const result = await apiRequest('/api/admin/model-catalog/seed', token, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: '{}',
  })
  const changed = Number(result.body.created ?? 0) + Number(result.body.updated ?? 0)
  invariant(
    result.response.ok && result.body.success === true && changed > 0,
    result.body.message || `Fixture model-catalog seed returned ${result.response.status}`,
  )
  console.log(`FIXTURE_MODEL_CATALOGUE=PASS changed=${changed}`)
}

function queueControl(action, jobId = '') {
  const args = [
    ...compose,
    'exec', '-T', 'api',
    'node', 'scripts/release-fixture-queue-control.mjs', action,
    ...(jobId ? [jobId] : []),
  ]
  const result = run(docker, args, { capture: true })
  const rows = result.stdout.trim().split(/\r?\n/).filter(Boolean)
  const jsonRow = [...rows].reverse().find((row) => row.trim().startsWith('{'))
  if (!jsonRow) throw new Error(`Queue fixture control ${action} returned no JSON evidence`)
  return JSON.parse(jsonRow)
}

async function submitFixtureImage(token, label) {
  const result = await apiRequest('/api/admin/studio/jobs', token, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({
      capability: 'image_generation',
      prompt: `Deterministic queue recovery fixture: ${label}`,
      input: { width: 512, height: 512, steps: 4 },
    }),
  })
  invariant(result.response.ok && result.body.jobId, result.body.message || `${label} submission returned ${result.response.status}`)
  return result.body.jobId
}

async function readJob(token, jobId) {
  const result = await apiRequest(`/api/admin/jobs/${encodeURIComponent(jobId)}`, token)
  invariant(result.response.ok, result.body.message || `Job ${jobId} returned ${result.response.status}`)
  return result.body
}

async function pollJob(token, jobId, timeoutMs = 180_000) {
  const deadline = Date.now() + timeoutMs
  while (Date.now() < deadline) {
    const job = await readJob(token, jobId)
    if (['completed', 'failed', 'cancelled'].includes(job.status)) return job
    await delay(1000)
  }
  throw new Error(`Fixture recovery job ${jobId} timed out`)
}

async function waitForDelivery(jobId, timeoutMs = 60_000) {
  const deadline = Date.now() + timeoutMs
  while (Date.now() < deadline) {
    const evidence = queueControl('inspect', jobId)
    if (['completed', 'failed'].includes(evidence.deliveryState)) return evidence
    await delay(1000)
  }
  throw new Error(`Fixture queue delivery ${jobId} did not reach a terminal BullMQ state`)
}

async function proveQueueAndRestartRecovery(token, proofReport) {
  const longForm = proofReport.tests.find((item) => item.test === 'capability:long_form_video' && item.status === 'PASS')
  invariant(longForm?.executionId && longForm?.jobId && longForm?.artifactId, 'Long-form fixture report is missing durable execution evidence')
  const assemblyJobId = longForm.evidence?.assembly?.jobId
  invariant(assemblyJobId, 'Long-form fixture report is missing the canonical assembly job ID')
  for (let attempt = 0; attempt < 2; attempt++) {
    const resumed = await apiRequest(`/api/admin/long-form-video/executions/${encodeURIComponent(longForm.executionId)}/resume`, token, { method: 'POST' })
    invariant(resumed.response.ok, resumed.body.message || `Completed long-form resume returned ${resumed.response.status}`)
    invariant((resumed.body.queueResult?.queued?.length ?? 0) === 0, 'Completed long-form resume enqueued duplicate work')
  }
  const assembly = queueControl('inspect', assemblyJobId)
  invariant(assembly.status === 'completed' && assembly.artifactId === longForm.artifactId && assembly.artifactCount === 1, 'Long-form final assembly was not exactly once')

  queueControl('pause')
  const queuedJobId = await submitFixtureImage(token, 'queued job survives API restart')
  run(docker, [...compose, 'stop', 'worker'])
  run(docker, [...compose, 'restart', 'api'])
  await waitForApiReachable()
  const visibleAfterRestart = await readJob(token, queuedJobId)
  invariant(visibleAfterRestart.status === 'queued', `Queued job was not visible after API restart (${visibleAfterRestart.status})`)
  queueControl('resume')
  run(docker, [...compose, 'start', 'worker'])
  const queuedCompleted = await pollJob(token, queuedJobId)
  invariant(queuedCompleted.status === 'completed' && queuedCompleted.artifactId, queuedCompleted.error || 'Queued job did not complete after API restart')

  queueControl('pause')
  const staleJobId = await submitFixtureImage(token, 'stale processing recovery')
  run(docker, [...compose, 'stop', 'worker'])
  queueControl('prepare-stale', staleJobId)
  queueControl('resume')
  run(docker, [...compose, 'start', 'worker'])
  const staleCompleted = await pollJob(token, staleJobId)
  const staleEvidence = queueControl('inspect', staleJobId)
  invariant(staleCompleted.status === 'completed' && staleEvidence.retryCount >= 1, staleCompleted.error || 'Stale processing job did not recover according to policy')
  invariant(
    staleEvidence.artifactId === staleCompleted.artifactId && staleEvidence.artifactCount === 1,
    `Stale recovery artifact evidence is inconsistent (${JSON.stringify({ apiArtifactId: staleCompleted.artifactId, ...staleEvidence })})`,
  )

  queueControl('redeliver', staleJobId)
  const duplicateEvidence = await waitForDelivery(staleJobId)
  invariant(duplicateEvidence.status === 'completed', 'Duplicate queue delivery changed the durable completed status')
  invariant(
    duplicateEvidence.artifactId === staleEvidence.artifactId && duplicateEvidence.artifactCount === staleEvidence.artifactCount,
    `Duplicate delivery changed provider output or artifact identity (${JSON.stringify({ before: staleEvidence, after: duplicateEvidence })})`,
  )

  queueControl('pause')
  const cancelledJobId = await submitFixtureImage(token, 'cancelled terminal protection')
  run(docker, [...compose, 'stop', 'worker'])
  queueControl('prepare-cancelled', cancelledJobId)
  queueControl('resume')
  run(docker, [...compose, 'start', 'worker'])
  await waitForDelivery(cancelledJobId)
  const cancelledJob = await readJob(token, cancelledJobId)
  const cancelledEvidence = queueControl('inspect', cancelledJobId)
  invariant(cancelledJob.status === 'cancelled' && cancelledEvidence.status === 'cancelled', 'Cancelled job became non-cancelled after redelivery')
  invariant(cancelledEvidence.artifactCount === 0 && !cancelledEvidence.artifactId, 'Cancelled job produced a late artifact')

  console.log('QUEUE_API_RESTART=PASS')
  console.log('QUEUE_STALE_RECOVERY=PASS')
  console.log('QUEUE_DUPLICATE_DELIVERY=PASS')
  console.log('QUEUE_CANCELLATION_GUARD=PASS')
  console.log('LONG_FORM_EXACTLY_ONCE=PASS')
}

let passed = false
try {
  run(npm, ['run', 'build', '--workspace=@amarktai/core'])
  run(docker, [...compose, 'config', '--quiet'])
  run(docker, [...compose, 'down', '--volumes', '--remove-orphans'])
  run(docker, [...compose, 'up', '--detach', '--build', '--wait', '--wait-timeout', '900'])

  const proofEnv = {
    ADMIN_EMAIL: 'fixture-admin@invalid.example',
    ADMIN_PASSWORD: generated.FIXTURE_ADMIN_PASSWORD,
    RELEASE_FIXTURE_BASE_URL: 'http://127.0.0.1:3210',
  }
  const catalogueToken = await loginFixtureAdmin()
  await seedFixtureModelCatalogue(catalogueToken)
  await proveRagReleaseFixture({ apiRequest, invariant, delay, run, docker, compose, adminToken: catalogueToken })
  await proveResearchReleaseFixture({ apiRequest, invariant, delay, adminToken: catalogueToken })
  await proveVoiceAvatarProfileReleaseFixture({ apiRequest, invariant, adminToken: catalogueToken })
  await proveSocialAdReleaseFixture({ apiRequest, invariant, delay, adminToken: catalogueToken })
  await proveSpecialistWorkflowReleaseFixture({ apiRequest, invariant, delay, adminToken: catalogueToken, queueControl })
  run(tsx, [
    'scripts/proof-production-release-candidate.mjs',
    '--base-url', proofEnv.RELEASE_FIXTURE_BASE_URL,
    '--fixture', '--strict', '--long-form', '--json-output', proofReportFile,
  ], { env: proofEnv })
  const proofReport = JSON.parse(await readFile(proofReportFile, 'utf8'))
  const recoveryToken = await loginFixtureAdmin()
  await proveQueueAndRestartRecovery(recoveryToken, proofReport)
  run(docker, [...compose, 'up', '--detach', '--wait', '--wait-timeout', '300', 'api', 'worker', 'dashboard'])
  run(npm, ['run', 'test:browser'], {
    env: {
      ...proofEnv,
      PLAYWRIGHT_HTML_OPEN: 'never',
      ...(outputDir ? { PLAYWRIGHT_HTML_OUTPUT_DIR: join(outputDir, 'playwright-report') } : {}),
    },
  })
  passed = true
} finally {
  try { await persistFixtureDiagnostics() } catch (error) { console.error(`FIXTURE_DIAGNOSTICS=FAIL ${error instanceof Error ? error.message : String(error)}`); passed = false }
  try { run(docker, [...compose, 'down', '--volumes', '--remove-orphans']) } catch (error) { console.error(`FIXTURE_CLEANUP=FAIL ${error instanceof Error ? error.message : String(error)}`); passed = false }
  await Promise.all([rm(envFile, { force: true }), rm(proofReportFile, { force: true })])
}

if (!passed) process.exit(1)
console.log(`FIXTURE_BUILD_SHA=${sha}`)
console.log('FIXTURE_STACK=PASS')
console.log('FIXTURE_PROOF=PASS')
console.log('RAG_RELEASE_FIXTURE=PASS')
console.log('RESEARCH_RELEASE_FIXTURE=PASS')
console.log('VOICE_AVATAR_PROFILE_RELEASE_FIXTURE=PASS')
console.log('SOCIAL_AD_PRODUCT_BREAKOUT_RELEASE_FIXTURE=PASS')
console.log('SPECIALIST_VISION_RELEASE_FIXTURE=PASS')
console.log('BRAND_SCRAPE_RELEASE_FIXTURE=PASS')
console.log('DOCUMENT_INGEST_RELEASE_FIXTURE=PASS')
console.log('CAMPAIGN_GENERATION_RELEASE_FIXTURE=PASS')
console.log('BROWSER_E2E=PASS')
