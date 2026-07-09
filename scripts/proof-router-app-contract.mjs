#!/usr/bin/env node

/**
 * Router + App Contract Proof Script
 *
 * Verifies the full pre-deploy contract surface:
 * - App connection + API key hashing
 * - Brain Router selection for chat/image/video
 * - Provider/model override blocking
 * - routingMode as safe preference
 * - DeepInfra disabled skip
 * - Music/long-form honest blocking
 * - MiMo never selected for runtime
 * - Adult generation on hold
 *
 * Modes:
 *   Default (no env): local/mock mode — validates contracts without live API
 *   LIVE_PROOF=1:     live mode — calls real API endpoints
 */

import { createHash } from 'node:crypto'

const LIVE = process.env.LIVE_PROOF === '1'
const API_URL = process.env.PROOF_API_URL || 'http://localhost:3001'

const results = []
let passed = 0
let failed = 0

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

function section(title) {
  console.log(`\n\x1b[1m--- ${title} ---\x1b[0m`)
}

// ── Local/Mock Mode ────────────────────────────────────────────────────────────

async function runLocalProof() {
  section('LOCAL/MOCK PROOF MODE')

  const core = await import('../packages/core/src/index.ts')
  const {
    PROVIDER_KEYS,
    routeBrain,
    extractRoutingMode,
    isValidRoutingMode,
    hasBlockedOverrides,
    BLOCKED_OVERRIDE_FIELDS,
    VALID_ROUTING_MODES,
    MODEL_CATALOGUE,
    CAPABILITY_KEYS,
  } = core

  // 1. Provider list integrity
  section('1. Provider list integrity')
  const expectedProviders = ['genx', 'groq', 'together', 'mimo', 'deepinfra']
  if (JSON.stringify([...PROVIDER_KEYS]) === JSON.stringify(expectedProviders)) {
    pass('PROVIDER_KEYS is exactly genx, groq, together, mimo, deepinfra')
  } else {
    fail('PROVIDER_KEYS mismatch', `got ${JSON.stringify([...PROVIDER_KEYS])}`)
  }

  const banned = ['openai', 'anthropic', 'huggingface', 'gemini', 'replicate', 'heygen', 'minimax', 'qwen']
  const hasBanned = banned.some((p) => PROVIDER_KEYS.includes(p))
  if (!hasBanned) {
    pass('No banned providers in PROVIDER_KEYS')
  } else {
    fail('Banned provider found in PROVIDER_KEYS')
  }

  // 2. API key hashing contract
  section('2. API key hashing contract')
  const rawKey = 'amark_proof_test_key_12345'
  const hashed = core.hashAppApiKey(rawKey)
  const expectedHash = createHash('sha256').update(rawKey).digest('hex')
  if (hashed === expectedHash) {
    pass('hashAppApiKey produces SHA-256 hex digest')
  } else {
    fail('hashAppApiKey mismatch')
  }
  if (hashed.length === 64 && /^[a-f0-9]+$/.test(hashed)) {
    pass('hashAppApiKey output is 64 hex characters')
  } else {
    fail('hashAppApiKey output format wrong')
  }
  if (core.hashAppApiKey(rawKey) === hashed) {
    pass('hashAppApiKey is deterministic')
  } else {
    fail('hashAppApiKey not deterministic')
  }

  // 3. Provider/model override blocking
  section('3. Provider/model override blocking')
  const blockedFields = ['provider', 'model', 'providerOverride', 'modelOverride', 'selectedProvider', 'selectedModel', 'providerKey', 'modelId']
  for (const field of blockedFields) {
    const result = hasBlockedOverrides({ [field]: 'test' })
    if (result === field) {
      pass(`hasBlockedOverrides blocks '${field}'`)
    } else {
      fail(`hasBlockedOverrides should block '${field}'`, `got ${result}`)
    }
  }
  if (hasBlockedOverrides({ capability: 'chat', prompt: 'hi' }) === null) {
    pass('Clean request passes hasBlockedOverrides')
  } else {
    fail('Clean request should pass hasBlockedOverrides')
  }

  // 4. routingMode as safe preference
  section('4. routingMode as safe preference')
  if (!BLOCKED_OVERRIDE_FIELDS.includes('routingMode')) {
    pass('routingMode is NOT in BLOCKED_OVERRIDE_FIELDS')
  } else {
    fail('routingMode should not be blocked')
  }
  if (hasBlockedOverrides({ routingMode: 'premium' }) === null) {
    pass('hasBlockedOverrides does not block routingMode')
  } else {
    fail('routingMode should not be blocked by hasBlockedOverrides')
  }
  if (extractRoutingMode(undefined) === 'balanced') {
    pass('extractRoutingMode defaults to balanced')
  } else {
    fail('extractRoutingMode should default to balanced')
  }
  if (extractRoutingMode({ routingMode: 'premium' }) === 'premium') {
    pass('extractRoutingMode accepts valid routingMode')
  } else {
    fail('extractRoutingMode should accept valid routingMode')
  }
  if (extractRoutingMode({ routingMode: 'invalid' }) === 'balanced') {
    pass('extractRoutingMode defaults for invalid value')
  } else {
    fail('extractRoutingMode should default for invalid value')
  }
  if (JSON.stringify(VALID_ROUTING_MODES) === JSON.stringify(['balanced', 'premium', 'fast', 'budget', 'experimental'])) {
    pass('VALID_ROUTING_MODES has all 5 modes')
  } else {
    fail('VALID_ROUTING_MODES mismatch')
  }

  // 5. Brain Router selects correct providers
  section('5. Brain Router provider selection')
  const chatDecision = routeBrain({ capability: 'chat', routingMode: 'balanced' })
  if (chatDecision.selectedProvider === 'groq' && chatDecision.executionAllowed) {
    pass('Brain Router selects groq for chat')
  } else {
    fail('Brain Router should select groq for chat', `got ${chatDecision.selectedProvider}`)
  }

  const imageDecision = routeBrain({ capability: 'image_generation', routingMode: 'balanced' })
  if (imageDecision.selectedProvider === 'together' && imageDecision.executionAllowed) {
    pass('Brain Router selects together for image_generation')
  } else {
    fail('Brain Router should select together for image_generation', `got ${imageDecision.selectedProvider}`)
  }

  const videoDecision = routeBrain({ capability: 'video_generation', routingMode: 'balanced' })
  if (videoDecision.selectedProvider === 'genx' && videoDecision.executionAllowed) {
    pass('Brain Router selects genx for video_generation')
  } else {
    fail('Brain Router should select genx for video_generation', `got ${videoDecision.selectedProvider}`)
  }

  // 6. DeepInfra disabled is skipped
  section('6. DeepInfra disabled skip')
  const diDisabledDecision = routeBrain({
    capability: 'chat',
    routingMode: 'balanced',
    providerStates: { deepinfra: { disabled: true } },
  })
  const diRejected = diDisabledDecision.rejectedCandidates.filter((r) => r.provider === 'deepinfra')
  if (diRejected.length > 0 && diRejected[0].reason.includes('disabled')) {
    pass('DeepInfra disabled appears in rejected candidates')
  } else {
    fail('DeepInfra disabled should be rejected')
  }
  if (diDisabledDecision.selectedProvider === 'groq') {
    pass('DeepInfra disabled does not affect groq selection for chat')
  } else {
    fail('Groq should still be selected when DeepInfra disabled')
  }

  // 7. Music generation blocked/pending
  section('7. Music generation blocked')
  const musicDecision = routeBrain({ capability: 'music_generation', routingMode: 'balanced' })
  if (!musicDecision.executionAllowed && musicDecision.selectedProvider === null) {
    pass('music_generation returns executionAllowed false')
  } else {
    fail('music_generation should be blocked')
  }
  if (musicDecision.blockReason && musicDecision.blockReason.includes('music_generation')) {
    pass('music_generation has honest blockReason')
  } else {
    fail('music_generation should have blockReason')
  }

  // 8. Long-form video blocked/pending
  section('8. Long-form video blocked')
  const lfDecision = routeBrain({ capability: 'long_form_video', routingMode: 'balanced' })
  if (!lfDecision.executionAllowed) {
    pass('long_form_video returns executionAllowed false')
  } else {
    fail('long_form_video should be blocked')
  }

  // 9. MiMo never selected for runtime
  section('9. MiMo coding_tools_only')
  for (const cap of ['chat', 'code', 'image_generation', 'video_generation']) {
    const decision = routeBrain({ capability: cap, routingMode: 'balanced' })
    if (decision.selectedProvider !== 'mimo') {
      pass(`MiMo not selected for ${cap}`)
    } else {
      fail(`MiMo should not be selected for ${cap}`)
    }
  }
  const mimoRejected = chatDecision.rejectedCandidates.filter((r) => r.provider === 'mimo')
  if (mimoRejected.length > 0 && mimoRejected[0].reason.includes('coding_tools_only')) {
    pass('MiMo rejected with coding_tools_only reason')
  } else {
    fail('MiMo should be rejected with coding_tools_only reason')
  }

  // 10. Adult generation on hold
  section('10. Adult generation on hold')
  const adultCaps = ['adult_text', 'adult_image', 'adult_voice', 'adult_avatar', 'adult_video']
  for (const cap of adultCaps) {
    const decision = routeBrain({ capability: cap, routingMode: 'balanced' })
    if (!decision.executionAllowed) {
      pass(`${cap} blocked by Brain Router`)
    } else {
      fail(`${cap} should be blocked`)
    }
  }
  const adultModels = MODEL_CATALOGUE.filter((m) => adultCaps.some((c) => m.capabilities.includes(c)))
  if (adultModels.length === 0) {
    pass('No model in catalogue supports adult capabilities')
  } else {
    fail('No model should support adult capabilities')
  }

  // 11. Planned models not executable
  section('11. Planned models not executable')
  const planned = MODEL_CATALOGUE.filter((m) => m.status === 'planned')
  const allPlannedNonExecutable = planned.every((m) => !m.executable)
  if (allPlannedNonExecutable) {
    pass('All planned models have executable=false')
  } else {
    fail('Planned models should not be executable')
  }

  // 12. Brain Router decision structure
  section('12. Brain Router decision structure')
  if (chatDecision.truth && chatDecision.truth.includes('Brain Router')) {
    pass('Decision includes truth message')
  } else {
    fail('Decision should include truth message')
  }
  if (chatDecision.appFacingProviderOverride === false && chatDecision.appFacingModelOverride === false) {
    pass('Decision has appFacingProviderOverride=false and appFacingModelOverride=false')
  } else {
    fail('Decision should block app-facing overrides')
  }
  if (Array.isArray(chatDecision.fallbackChain)) {
    pass('Decision includes fallbackChain')
  } else {
    fail('Decision should include fallbackChain')
  }
  if (Array.isArray(chatDecision.rejectedCandidates)) {
    pass('Decision includes rejectedCandidates')
  } else {
    fail('Decision should include rejectedCandidates')
  }

  // 13. Routing modes produce different selections
  section('13. Routing modes affect selection')
  const budgetDecision = routeBrain({ capability: 'chat', routingMode: 'budget' })
  const fastDecision = routeBrain({ capability: 'chat', routingMode: 'fast' })
  if (budgetDecision.selectedModel === 'llama-3.1-8b-instant') {
    pass('Budget mode selects cheapest model for chat')
  } else {
    fail('Budget mode should select cheapest model', `got ${budgetDecision.selectedModel}`)
  }
  if (fastDecision.selectedModel === 'llama-3.1-8b-instant') {
    pass('Fast mode selects lowest latency model for chat')
  } else {
    fail('Fast mode should select lowest latency model', `got ${fastDecision.selectedModel}`)
  }
}

// ── Live Mode ──────────────────────────────────────────────────────────────────

async function runLiveProof() {
  section('LIVE PROOF MODE')

  const adminEmail = process.env.ADMIN_EMAIL
  const adminPassword = process.env.ADMIN_PASSWORD
  const adminToken = process.env.ADMIN_TOKEN

  if (!adminToken && (!adminEmail || !adminPassword)) {
    fail('Live mode requires ADMIN_TOKEN or ADMIN_EMAIL + ADMIN_PASSWORD')
    return
  }

  let adminAuth = adminToken
  if (!adminAuth) {
    try {
      const loginRes = await fetch(`${API_URL}/api/auth/login`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ email: adminEmail, password: adminPassword }),
      })
      if (loginRes.ok) {
        const data = await loginRes.json()
        adminAuth = data.token
      } else {
        fail('Admin login failed', `status ${loginRes.status}`)
        return
      }
    } catch (err) {
      fail('Admin login failed', err.message)
      return
    }
  }

  pass('Admin authentication obtained')

  // Create or reuse test app connection
  let appSlug = 'proof-test-app'
  let appApiKey
  try {
    const connRes = await fetch(`${API_URL}/api/admin/app-connections`, {
      headers: { Authorization: `Bearer ${adminAuth}` },
    })
    if (connRes.ok) {
      const connections = await connRes.json()
      const existing = connections.find((c) => c.appSlug === appSlug)
      if (existing) {
        pass(`Found existing app connection: ${appSlug}`)
      } else {
        const createRes = await fetch(`${API_URL}/api/admin/app-connections`, {
          method: 'POST',
          headers: { 'Content-Type': 'application/json', Authorization: `Bearer ${adminAuth}` },
          body: JSON.stringify({ appSlug, appName: 'Proof Test App' }),
        })
        if (createRes.ok) {
          pass(`Created app connection: ${appSlug}`)
        } else {
          fail('Failed to create app connection', `status ${createRes.status}`)
          return
        }
      }
    }

    const keyRes = await fetch(`${API_URL}/api/admin/app-connections/${appSlug}/api-keys`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json', Authorization: `Bearer ${adminAuth}` },
      body: JSON.stringify({ label: 'proof-key' }),
    })
    if (keyRes.ok) {
      const keyData = await keyRes.json()
      appApiKey = keyData.key
      pass('Created test app API key')
    } else {
      fail('Failed to create app API key', `status ${keyRes.status}`)
      return
    }
  } catch (err) {
    fail('App connection setup failed', err.message)
    return
  }

  // Test job submission
  section('Live job submission')

  const testJobs = [
    { capability: 'chat', prompt: 'Hello from proof script', routingMode: 'balanced', expectSuccess: true },
    { capability: 'image_generation', prompt: 'A red circle', routingMode: 'balanced', expectSuccess: true },
    { capability: 'video_generation', prompt: 'A spinning cube', routingMode: 'balanced', expectSuccess: true },
    { capability: 'music_generation', prompt: 'A short melody', routingMode: 'balanced', expectSuccess: false, expectBlocked: true },
    { capability: 'long_form_video', prompt: 'A short film', routingMode: 'balanced', expectSuccess: false, expectBlocked: true },
  ]

  for (const job of testJobs) {
    try {
      const res = await fetch(`${API_URL}/api/v1/jobs`, {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          Authorization: `Bearer ${appApiKey}`,
        },
        body: JSON.stringify({
          capability: job.capability,
          prompt: job.prompt,
          metadata: { routingMode: job.routingMode },
        }),
      })

      if (job.expectSuccess) {
        if (res.status === 201) {
          pass(`Job submitted: ${job.capability}`)
        } else {
          const body = await res.text()
          fail(`Job submission: ${job.capability}`, `status ${res.status}: ${body.slice(0, 100)}`)
        }
      } else if (job.expectBlocked) {
        if (res.status === 201) {
          pass(`Job accepted (will be blocked by worker): ${job.capability}`)
        } else {
          fail(`Job submission: ${job.capability}`, `status ${res.status}`)
        }
      }
    } catch (err) {
      fail(`Job submission: ${job.capability}`, err.message)
    }
  }

  // Test provider/model override blocking
  section('Live provider/model override blocking')
  try {
    const res = await fetch(`${API_URL}/api/v1/jobs`, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        Authorization: `Bearer ${appApiKey}`,
      },
      body: JSON.stringify({
        capability: 'chat',
        prompt: 'test',
        provider: 'groq',
      }),
    })
    if (res.status === 400) {
      pass('Provider override blocked with 400')
    } else {
      fail('Provider override should be blocked with 400', `status ${res.status}`)
    }
  } catch (err) {
    fail('Provider override test failed', err.message)
  }

  try {
    const res = await fetch(`${API_URL}/api/v1/jobs`, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        Authorization: `Bearer ${appApiKey}`,
      },
      body: JSON.stringify({
        capability: 'chat',
        prompt: 'test',
        model: 'llama-3',
      }),
    })
    if (res.status === 400) {
      pass('Model override blocked with 400')
    } else {
      fail('Model override should be blocked with 400', `status ${res.status}`)
    }
  } catch (err) {
    fail('Model override test failed', err.message)
  }

  // Test invalid key
  section('Live auth tests')
  try {
    const res = await fetch(`${API_URL}/api/v1/jobs`, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        Authorization: 'Bearer invalid_key_12345',
      },
      body: JSON.stringify({ capability: 'chat', prompt: 'test' }),
    })
    if (res.status === 401) {
      pass('Invalid key returns 401')
    } else {
      fail('Invalid key should return 401', `status ${res.status}`)
    }
  } catch (err) {
    fail('Invalid key test failed', err.message)
  }
}

// ── Main ───────────────────────────────────────────────────────────────────────

async function main() {
  console.log('\x1b[1m\x1b[36m')
  console.log('  AMARKTAI NETWORK V2 — ROUTER + APP CONTRACT PROOF')
  console.log('\x1b[0m')

  if (LIVE) {
    console.log('\x1b[33m  Mode: LIVE (calling real API endpoints)\x1b[0m')
    console.log(`  API URL: ${API_URL}`)
  } else {
    console.log('\x1b[32m  Mode: LOCAL/MOCK (no live API calls)\x1b[0m')
  }

  try {
    await runLocalProof()
    if (LIVE) {
      await runLiveProof()
    }
  } catch (err) {
    console.error('\n\x1b[31mFATAL ERROR:\x1b[0m', err.message)
    process.exit(2)
  }

  // Summary
  console.log('\n\x1b[1m\x1b[36m--- SUMMARY ---\x1b[0m')
  console.log(`  Total:  ${passed + failed}`)
  console.log(`  \x1b[32mPassed: ${passed}\x1b[0m`)
  if (failed > 0) {
    console.log(`  \x1b[31mFailed: ${failed}\x1b[0m`)
  }

  if (failed > 0) {
    console.log('\n\x1b[31m  PROOF FAILED\x1b[0m\n')
    process.exit(1)
  } else {
    console.log('\n\x1b[32m  ALL PROOFS PASSED\x1b[0m\n')
    process.exit(0)
  }
}

main()
