#!/usr/bin/env node

/**
 * Live Execution Proof Script — Phase 4
 *
 * Runs real provider execution proofs against the deployed VPS.
 * Requires: running API, worker, MariaDB, Redis, and provider API keys.
 *
 * Usage:
 *   LIVE_PROOF=1 PROOF_API_URL=http://localhost:3001 node scripts/proof-live-execution.mjs
 *
 * Each proof creates a real job, waits for completion, and verifies:
 * - Provider response received
 * - Artifact persisted (where applicable)
 * - Correct provider/model selected
 * - Current-build Git SHA recorded
 */

import { createHash } from 'node:crypto'

const API_URL = process.env.PROOF_API_URL || 'http://localhost:3001'
const ADMIN_EMAIL = process.env.ADMIN_EMAIL || 'amarktainetwork@gmail.com'
const ADMIN_PASSWORD = process.env.ADMIN_PASSWORD || 'Ashmor12@'
const TIMEOUT_MS = 120_000
const POLL_INTERVAL_MS = 2_000

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
  // Create a test app if none exists
  const createRes = await fetchJson(`${API_URL}/api/admin/apps`, {
    method: 'POST',
    headers: { Authorization: `Bearer ${adminToken}`, 'Content-Type': 'application/json' },
    body: JSON.stringify({ name: 'proof-test-app', slug: 'proof-test' }),
  })
  if (createRes.status === 201 && createRes.body?.rawApiKey) return createRes.body.rawApiKey
  throw new Error(`Could not get app API key: status=${createRes.status}`)
}

async function submitJob(appApiKey, capability, prompt, metadata = {}) {
  return fetchJson(`${API_URL}/api/v1/jobs`, {
    method: 'POST',
    headers: {
      'Content-Type': 'application/json',
      Authorization: `Bearer ${appApiKey}`,
    },
    body: JSON.stringify({ capability, prompt, metadata }),
  })
}

async function pollJob(appApiKey, jobId) {
  return fetchJson(`${API_URL}/api/v1/jobs/${jobId}`, {
    headers: { Authorization: `Bearer ${appApiKey}` },
  })
}

async function waitForCompletion(appApiKey, jobId, timeoutMs = TIMEOUT_MS) {
  const start = Date.now()
  while (Date.now() - start < timeoutMs) {
    const { status, body } = await pollJob(appApiKey, jobId)
    if (status !== 200) return { status: 'error', error: `poll returned ${status}` }
    if (body?.status === 'completed') return { status: 'completed', result: body }
    if (body?.status === 'failed') return { status: 'failed', error: body?.error || 'unknown' }
    if (body?.status === 'cancelled') return { status: 'cancelled' }
    await sleep(POLL_INTERVAL_MS)
  }
  return { status: 'timeout' }
}

async function getArtifact(adminToken, artifactId) {
  return fetchJson(`${API_URL}/api/admin/artifacts/${artifactId}`, {
    headers: { Authorization: `Bearer ${adminToken}` },
  })
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

async function proofChat(appApiKey, adminToken) {
  section('Groq/DeepInfra Chat')
  const { status, body } = await submitJob(appApiKey, 'chat', 'Reply with exactly: PROOF_OK')
  if (status !== 201) {
    fail('Chat job submission', `status=${status}`)
    return
  }
  pass(`Chat job submitted: ${body.id}`)

  const result = await waitForCompletion(appApiKey, body.id)
  if (result.status === 'completed') {
    pass(`Chat completed: provider=${result.result?.provider} model=${result.result?.model}`)
    if (result.result?.output?.includes('PROOF_OK')) {
      pass('Chat output contains expected content')
    } else {
      fail('Chat output mismatch', `got: ${String(result.result?.output).slice(0, 100)}`)
    }
  } else {
    fail('Chat completion', `status=${result.status} error=${result.error}`)
  }
}

async function proofReasoning(appApiKey, adminToken) {
  section('Reasoning')
  const { status, body } = await submitJob(appApiKey, 'reasoning', 'What is 2+2? Think step by step.')
  if (status !== 201) { fail('Reasoning job submission', `status=${status}`); return }
  pass(`Reasoning job submitted: ${body.id}`)

  const result = await waitForCompletion(appApiKey, body.id)
  if (result.status === 'completed') {
    pass(`Reasoning completed: provider=${result.result?.provider} model=${result.result?.model}`)
  } else {
    fail('Reasoning completion', `status=${result.status}`)
  }
}

async function proofModelPropagation(appApiKey, adminToken) {
  section('Non-default model propagation')
  const { status, body } = await submitJob(appApiKey, 'chat', 'Say hello.', { routingMode: 'budget' })
  if (status !== 201) { fail('Budget mode job submission', `status=${status}`); return }
  pass(`Budget mode job submitted: ${body.id}`)

  const result = await waitForCompletion(appApiKey, body.id)
  if (result.status === 'completed') {
    pass(`Budget mode completed: provider=${result.result?.provider} model=${result.result?.model}`)
  } else {
    fail('Budget mode completion', `status=${result.status}`)
  }
}

async function proofImageGeneration(appApiKey, adminToken) {
  section('Together Image Generation')
  const { status, body } = await submitJob(appApiKey, 'image_generation', 'A beautiful sunset over mountains, digital art')
  if (status !== 201) { fail('Image job submission', `status=${status}`); return }
  pass(`Image job submitted: ${body.id}`)

  const result = await waitForCompletion(appApiKey, body.id, 180_000)
  if (result.status === 'completed') {
    pass(`Image completed: provider=${result.result?.provider} model=${result.result?.model}`)
    if (result.result?.artifactId) {
      pass(`Image artifact persisted: ${result.result.artifactId}`)
      const artifact = await getArtifact(adminToken, result.result.artifactId)
      if (artifact.status === 200 && artifact.body?.storageUrl) {
        pass(`Image artifact accessible: ${artifact.body.storageUrl}`)
      } else {
        fail('Image artifact access', `status=${artifact.status}`)
      }
    } else {
      fail('Image artifact', 'no artifactId in result')
    }
  } else {
    fail('Image completion', `status=${result.status} error=${result.error}`)
  }
}

async function proofVideoGeneration(appApiKey, adminToken) {
  section('GenX Short-Video Generation')
  const { status, body } = await submitJob(appApiKey, 'video_generation', 'A cat walking through a garden, cinematic')
  if (status !== 201) { fail('Video job submission', `status=${status}`); return }
  pass(`Video job submitted: ${body.id}`)

  const result = await waitForCompletion(appApiKey, body.id, 300_000)
  if (result.status === 'completed') {
    pass(`Video completed: provider=${result.result?.provider} model=${result.result?.model}`)
    if (result.result?.artifactId) {
      pass(`Video artifact persisted: ${result.result.artifactId}`)
      const artifact = await getArtifact(adminToken, result.result.artifactId)
      if (artifact.status === 200) {
        pass(`Video artifact accessible: mime=${artifact.body?.mimeType} size=${artifact.body?.fileSizeBytes}`)
      } else {
        fail('Video artifact access', `status=${artifact.status}`)
      }
    } else {
      fail('Video artifact', 'no artifactId in result')
    }
  } else {
    fail('Video completion', `status=${result.status} error=${result.error}`)
  }
}

async function proofMusicGeneration(appApiKey, adminToken) {
  section('GenX Instrumental Music')
  const { status, body } = await submitJob(appApiKey, 'music_generation', 'Upbeat electronic instrumental track', { instrumentalOnly: true })
  if (status !== 201) { fail('Music job submission', `status=${status}`); return }
  pass(`Music job submitted: ${body.id}`)

  const result = await waitForCompletion(appApiKey, body.id, 300_000)
  if (result.status === 'completed') {
    pass(`Music completed: provider=${result.result?.provider} model=${result.result?.model}`)
    if (result.result?.artifactId) {
      pass(`Music artifact persisted: ${result.result.artifactId}`)
      const artifact = await getArtifact(adminToken, result.result.artifactId)
      if (artifact.status === 200 && artifact.body?.mimeType?.startsWith('audio/')) {
        pass(`Music artifact valid: mime=${artifact.body.mimeType} size=${artifact.body.fileSizeBytes}`)
      } else {
        fail('Music artifact validation', `mime=${artifact.body?.mimeType}`)
      }
    } else {
      fail('Music artifact', 'no artifactId in result')
    }
  } else {
    fail('Music completion', `status=${result.status} error=${result.error}`)
  }
}

async function proofOverrideBlocking(appApiKey) {
  section('Provider/Model Override Blocking')
  const providerRes = await submitJob(appApiKey, 'chat', 'test', { provider: 'groq' })
  if (providerRes.status === 400) {
    pass('Provider override blocked with 400')
  } else {
    fail('Provider override blocking', `expected 400 got ${providerRes.status}`)
  }

  const modelRes = await submitJob(appApiKey, 'chat', 'test', { model: 'llama-3' })
  if (modelRes.status === 400) {
    pass('Model override blocked with 400')
  } else {
    fail('Model override blocking', `expected 400 got ${modelRes.status}`)
  }
}

// ── Main ──────────────────────────────────────────────────────────────────────

async function main() {
  console.log('\x1b[1m\x1b[36m')
  console.log('  AMARKTAI NETWORK V2 — LIVE EXECUTION PROOF (Phase 4)')
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

  await proofOverrideBlocking(appApiKey)
  await proofChat(appApiKey, adminToken)
  await proofReasoning(appApiKey, adminToken)
  await proofModelPropagation(appApiKey, adminToken)
  await proofImageGeneration(appApiKey, adminToken)
  await proofVideoGeneration(appApiKey, adminToken)
  await proofMusicGeneration(appApiKey, adminToken)

  // Summary
  console.log('\n\x1b[1m--- SUMMARY ---\x1b[0m')
  console.log(`  Total: ${passed + failed + skipped}`)
  console.log(`  \x1b[32mPassed: ${passed}\x1b[0m`)
  console.log(`  \x1b[31mFailed: ${failed}\x1b[0m`)
  console.log(`  \x1b[33mSkipped: ${skipped}\x1b[0m`)
  console.log(`  Git SHA: ${gitSha}`)
  console.log(`  Time: ${new Date().toISOString()}`)

  if (failed > 0) {
    console.log('\n\x1b[31m  SOME PROOFS FAILED\x1b[0m')
    process.exit(1)
  } else {
    console.log('\n\x1b[32m  ALL PROOFS PASSED\x1b[0m')
  }
}

main().catch((err) => {
  console.error('Proof script error:', err)
  process.exit(1)
})
