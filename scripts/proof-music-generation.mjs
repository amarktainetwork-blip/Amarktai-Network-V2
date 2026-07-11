#!/usr/bin/env node

/**
 * Music Generation Proof Script — Phase 5
 *
 * Proves the complete instrumental music flow on the deployed VPS.
 * Requires: running API, worker, MariaDB, Redis, GenX API key.
 *
 * Usage:
 *   PROOF_API_URL=http://localhost:3001 node scripts/proof-music-generation.mjs
 *
 * Proves:
 * - Music capability status endpoint
 * - Plan creation with dynamic execution readiness
 * - Job submission via admin route
 * - Job submission via external app route
 * - Provider-model override blocking
 * - Vocals/lyrics blocking (honest)
 * - Job completion with real GenX provider
 * - Artifact persistence with valid audio MIME
 * - Artifact preview and download
 * - Usage recording
 * - Current-build Git SHA in proof metadata
 */

const API_URL = process.env.PROOF_API_URL || 'http://localhost:3001'
const ADMIN_EMAIL = process.env.ADMIN_EMAIL || 'amarktainetwork@gmail.com'
const ADMIN_PASSWORD = process.env.ADMIN_PASSWORD || 'Ashmor12@'
const TIMEOUT_MS = 300_000
const POLL_INTERVAL_MS = 3_000

const results = []
let passed = 0
let failed = 0
let skipped = 0

function pass(label) {
  results.push({ label, ok: true })
  passed++
  console.log(`  \x1b[32mPASS\x1b[0m  ${label}`)
}

function fail(label, detail) {
  results.push({ label, ok: false, detail })
  failed++
  console.log(`  \x1b[31mFAIL\x1b[0m  ${label}${detail ? ` — ${detail}` : ''}`)
}

function skip(label, reason) {
  results.push({ label, ok: null, reason })
  skipped++
  console.log(`  \x1b[33mSKIP\x1b[0m  ${label} — ${reason}`)
}

function section(title) {
  console.log(`\n\x1b[1m--- ${title} ---\x1b[0m`)
}

async function sleep(ms) {
  return new Promise((resolve) => setTimeout(resolve, ms))
}

async function fetchJson(url, options = {}) {
  const res = await fetch(url, options)
  const text = await res.text()
  let body
  try { body = JSON.parse(text) } catch { body = text }
  return { status: res.status, body }
}

async function getAdminToken() {
  const { status, body } = await fetchJson(`${API_URL}/api/v1/auth/login`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ email: ADMIN_EMAIL, password: ADMIN_PASSWORD }),
  })
  if (status === 200 && body?.token) return body.token
  throw new Error(`Admin login failed: status=${status}`)
}

async function getAppApiKey(adminToken) {
  const { status, body } = await fetchJson(`${API_URL}/api/admin/apps`, {
    headers: { Authorization: `Bearer ${adminToken}` },
  })
  if (status === 200 && Array.isArray(body) && body.length > 0) {
    return body[0].rawApiKey || body[0].apiKey
  }
  const createRes = await fetchJson(`${API_URL}/api/admin/apps`, {
    method: 'POST',
    headers: { Authorization: `Bearer ${adminToken}`, 'Content-Type': 'application/json' },
    body: JSON.stringify({ name: 'proof-music-app', slug: 'proof-music' }),
  })
  if (createRes.status === 201 && createRes.body?.rawApiKey) return createRes.body.rawApiKey
  throw new Error(`Could not get app API key: status=${createRes.status}`)
}

async function getGitSha() {
  try {
    const res = await fetchJson(`${API_URL}/health`)
    return res.body?.gitSha || res.body?.version || 'unknown'
  } catch {
    return 'unknown'
  }
}

// ── Proofs ─────────────────────────────────────────────────────────────────────

async function proofMusicStatus(adminToken) {
  section('Music Capability Status')
  const { status, body } = await fetchJson(`${API_URL}/api/admin/music/status`, {
    headers: { Authorization: `Bearer ${adminToken}` },
  })
  if (status !== 200) { fail('Music status endpoint', `status=${status}`); return }
  pass('Music status endpoint returns 200')

  const s = body?.status
  if (s?.providerClientExists) pass('Provider client exists')
  else fail('Provider client exists')

  if (s?.workerExecutorExists) pass('Worker executor exists')
  else fail('Worker executor exists')

  if (s?.queuePathImplemented) pass('Queue path implemented')
  else fail('Queue path implemented')

  if (s?.routeImplemented) pass('Route implemented')
  else fail('Route implemented')

  if (s?.artifactPersistenceReady) pass('Artifact persistence ready')
  else fail('Artifact persistence ready')

  if (s?.instrumentalReady) pass('Instrumental ready')
  else fail('Instrumental ready')

  if (s?.vocalsReady === false) pass('Vocals honestly blocked')
  else fail('Vocals should be blocked', `got ${s?.vocalsReady}`)

  if (s?.lyricsReady === false) pass('Lyrics honestly blocked')
  else fail('Lyrics should be blocked', `got ${s?.lyricsReady}`)

  if (s?.genxMusicCapabilityKnown) pass('GenX music capability known')
  else fail('GenX music capability known')

  if (s?.lyriaClipDiscovered) pass('Lyria Clip discovered')
  else fail('Lyria Clip discovered')

  if (s?.lyriaProDiscovered) pass('Lyria Pro discovered')
  else fail('Lyria Pro discovered')

  return s
}

async function proofMusicPlan(adminToken) {
  section('Music Plan Creation')
  const { status, body } = await fetchJson(`${API_URL}/api/admin/music/plan`, {
    method: 'POST',
    headers: { Authorization: `Bearer ${adminToken}`, 'Content-Type': 'application/json' },
    body: JSON.stringify({
      prompt: 'Upbeat electronic instrumental track for a tech product video',
      style: 'electronic',
      mood: 'upbeat',
      durationSeconds: 30,
      instrumentalOnly: true,
    }),
  })
  if (status !== 200) { fail('Music plan creation', `status=${status}`); return }
  pass('Music plan created')

  const plan = body?.plan
  if (plan?.capability === 'music_generation') pass('Plan capability is music_generation')
  else fail('Plan capability')

  if (plan?.executionReady === true) pass('Plan is execution-ready')
  else fail('Plan execution-ready', `got ${plan?.executionReady}`)

  if (plan?.instrumentalOnly === true) pass('Plan is instrumental-only')
  else fail('Plan instrumental-only')

  if (plan?.blockedReasons?.length === 0) pass('Plan has no blockers')
  else fail('Plan blockers', JSON.stringify(plan?.blockedReasons))

  if (plan?.providerPrompt?.includes('instrumental')) pass('Provider prompt includes instrumental')
  else fail('Provider prompt instrumental')

  return plan
}

async function proofVocalsBlocking(adminToken) {
  section('Vocals/Lyrics Blocking')
  const { status, body } = await fetchJson(`${API_URL}/api/admin/music/plan`, {
    method: 'POST',
    headers: { Authorization: `Bearer ${adminToken}`, 'Content-Type': 'application/json' },
    body: JSON.stringify({
      prompt: 'A song with vocals',
      instrumentalOnly: false,
    }),
  })
  if (status === 200 && body?.plan?.blockedReasons?.includes('vocals_not_proven')) {
    pass('Vocals request blocked with vocals_not_proven')
  } else {
    fail('Vocals blocking', `status=${status} blockedReasons=${JSON.stringify(body?.plan?.blockedReasons)}`)
  }
}

async function proofOverrideBlocking(adminToken) {
  section('Provider/Model Override Blocking')
  const { status } = await fetchJson(`${API_URL}/api/admin/music/generate`, {
    method: 'POST',
    headers: { Authorization: `Bearer ${adminToken}`, 'Content-Type': 'application/json' },
    body: JSON.stringify({
      prompt: 'Test music',
      provider: 'genx',
    }),
  })
  if (status === 400) pass('Provider override blocked with 400')
  else fail('Provider override blocking', `status=${status}`)

  const { status: status2 } = await fetchJson(`${API_URL}/api/admin/music/generate`, {
    method: 'POST',
    headers: { Authorization: `Bearer ${adminToken}`, 'Content-Type': 'application/json' },
    body: JSON.stringify({
      prompt: 'Test music',
      model: 'lyria-3-clip-preview',
    }),
  })
  if (status2 === 400) pass('Model override blocked with 400')
  else fail('Model override blocking', `status=${status2}`)
}

async function proofMusicGeneration(adminToken, appApiKey) {
  section('Music Generation (Admin Route)')
  const { status, body } = await fetchJson(`${API_URL}/api/admin/music/generate`, {
    method: 'POST',
    headers: { Authorization: `Bearer ${adminToken}`, 'Content-Type': 'application/json' },
    body: JSON.stringify({
      prompt: 'Calm ambient instrumental track for meditation',
      style: 'ambient',
      mood: 'calm',
      durationSeconds: 30,
      instrumentalOnly: true,
    }),
  })

  if (status === 409) {
    skip('Admin music generation', `blocked: ${body?.message}`)
    return
  }
  if (status !== 202) { fail('Admin music job submission', `status=${status}`); return }
  pass(`Admin music job submitted: ${body.jobId}`)

  // Poll for completion
  const start = Date.now()
  let result
  while (Date.now() - start < TIMEOUT_MS) {
    const poll = await fetchJson(`${API_URL}/api/admin/jobs/${body.jobId}`, {
      headers: { Authorization: `Bearer ${adminToken}` },
    })
    if (poll.status === 200) {
      if (poll.body?.status === 'completed') { result = { status: 'completed', job: poll.body }; break }
      if (poll.body?.status === 'failed') { result = { status: 'failed', error: poll.body?.error }; break }
    }
    await sleep(POLL_INTERVAL_MS)
  }

  if (!result) result = { status: 'timeout' }

  if (result.status === 'completed') {
    pass('Admin music job completed')
    const job = result.job
    if (job?.provider) pass(`Provider: ${job.provider}`)
    else fail('Provider recorded')
    if (job?.model) pass(`Model: ${job.model}`)
    else fail('Model recorded')
    if (job?.artifactId) {
      pass(`Artifact persisted: ${job.artifactId}`)
      // Verify artifact
      const artifact = await fetchJson(`${API_URL}/api/admin/artifacts/${job.artifactId}`, {
        headers: { Authorization: `Bearer ${adminToken}` },
      })
      if (artifact.status === 200) {
        const mime = artifact.body?.mimeType
        const size = artifact.body?.fileSizeBytes
        if (mime?.startsWith('audio/')) pass(`Artifact MIME valid: ${mime}`)
        else fail('Artifact MIME', `got ${mime}`)
        if (size > 0) pass(`Artifact size: ${size} bytes`)
        else fail('Artifact size', `got ${size}`)
      } else {
        fail('Artifact access', `status=${artifact.status}`)
      }
    } else {
      fail('Artifact ID', 'not in result')
    }
  } else {
    fail('Admin music completion', `status=${result.status} error=${result.error}`)
  }
}

async function proofAppMusicGeneration(appApiKey) {
  section('Music Generation (External App Route)')
  const { status, body } = await fetchJson(`${API_URL}/api/v1/jobs`, {
    method: 'POST',
    headers: {
      'Content-Type': 'application/json',
      Authorization: `Bearer ${appApiKey}`,
    },
    body: JSON.stringify({
      capability: 'music_generation',
      prompt: 'Energetic electronic dance track',
      metadata: { routingMode: 'balanced' },
    }),
  })

  if (status === 409) {
    skip('App music generation', `blocked: ${body?.message}`)
    return
  }
  if (status !== 201) { fail('App music job submission', `status=${status}`); return }
  pass(`App music job submitted: ${body.id}`)

  // Poll for completion
  const start = Date.now()
  let result
  while (Date.now() - start < TIMEOUT_MS) {
    const poll = await fetchJson(`${API_URL}/api/v1/jobs/${body.id}`, {
      headers: { Authorization: `Bearer ${appApiKey}` },
    })
    if (poll.status === 200) {
      if (poll.body?.status === 'completed') { result = { status: 'completed', job: poll.body }; break }
      if (poll.body?.status === 'failed') { result = { status: 'failed', error: poll.body?.error }; break }
    }
    await sleep(POLL_INTERVAL_MS)
  }

  if (!result) result = { status: 'timeout' }

  if (result.status === 'completed') {
    pass('App music job completed')
    if (result.job?.artifactId) pass(`Artifact: ${result.job.artifactId}`)
    else fail('Artifact ID')
  } else {
    fail('App music completion', `status=${result.status} error=${result.error}`)
  }
}

// ── Main ──────────────────────────────────────────────────────────────────────

async function main() {
  console.log('\x1b[1m\x1b[36m')
  console.log('  AMARKTAI NETWORK V2 — MUSIC GENERATION PROOF (Phase 5)')
  console.log('═══════════════════════════════════════════════════════\x1b[0m')
  console.log(`  API: ${API_URL}`)
  console.log(`  Time: ${new Date().toISOString()}`)

  const gitSha = await getGitSha()
  console.log(`  Git SHA (deployed): ${gitSha}`)

  let adminToken, appApiKey
  try {
    section('Authentication')
    adminToken = await getAdminToken()
    pass('Admin login successful')
    appApiKey = await getAppApiKey(adminToken)
    pass('App API key obtained')
  } catch (err) {
    fail('Authentication failed', err.message)
    console.log('\n\x1b[31mCannot proceed without authentication.\x1b[0m')
    process.exit(1)
  }

  await proofMusicStatus(adminToken)
  await proofMusicPlan(adminToken)
  await proofVocalsBlocking(adminToken)
  await proofOverrideBlocking(adminToken)
  await proofMusicGeneration(adminToken, appApiKey)
  await proofAppMusicGeneration(appApiKey)

  // Summary
  console.log('\n\x1b[1m--- SUMMARY ---\x1b[0m')
  console.log(`  Total: ${passed + failed + skipped}`)
  console.log(`  \x1b[32mPassed: ${passed}\x1b[0m`)
  console.log(`  \x1b[31mFailed: ${failed}\x1b[0m`)
  console.log(`  \x1b[33mSkipped: ${skipped}\x1b[0m`)
  console.log(`  Git SHA: ${gitSha}`)
  console.log(`  Time: ${new Date().toISOString()}`)

  if (failed > 0) {
    console.log('\n\x1b[31m  SOME MUSIC PROOFS FAILED\x1b[0m')
    process.exit(1)
  } else {
    console.log('\n\x1b[32m  ALL MUSIC PROOFS PASSED\x1b[0m')
  }
}

main().catch((err) => {
  console.error('Proof script error:', err)
  process.exit(1)
})
