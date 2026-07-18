#!/usr/bin/env node

import { createHash } from 'node:crypto'

const results = []
let failed = 0

function check(condition, label, detail = '') {
  results.push({ label, ok: Boolean(condition), detail })
  if (!condition) failed++
  console.log(`  ${condition ? 'PASS' : 'FAIL'}  ${label}${detail ? ` - ${detail}` : ''}`)
}

function candidate(overrides = {}) {
  return {
    provider: 'deepinfra',
    model: 'primary-model',
    displayName: 'Primary',
    capability: 'chat',
    executorId: 'deepinfra.chat',
    providerConfigured: true,
    providerEnabled: true,
    providerHealth: 'live',
    providerHealthReady: true,
    providerAccountAllowed: true,
    providerPolicyAllowed: true,
    modelLifecycleAllowed: true,
    adapterSupported: true,
    executorSupported: true,
    requestShapeKnown: true,
    responseShapeKnown: true,
    infrastructureReady: true,
    executionReady: true,
    endpointReady: true,
    databaseReady: true,
    queueReady: true,
    modelCompatible: true,
    liveProven: false,
    estimatedCost: 1,
    costTier: 'low',
    qualityTier: 'balanced',
    latencyTier: 'low',
    pricingConfidence: 'known',
    score: 0,
    scoreBreakdown: {},
    blockers: [],
    ...overrides,
  }
}

function grant(overrides = {}) {
  return {
    appSlug: 'proof-app',
    capability: 'chat',
    enabled: true,
    qualityFloor: 'balanced',
    budgetPolicy: 'balanced',
    maxCostPerRequest: 0,
    maxCostPerWorkflow: 0,
    latencyPreference: 'medium',
    allowFallback: true,
    maxFallbackAttempts: 3,
    liveProofRequired: false,
    approvalRequired: false,
    artifactRead: true,
    artifactWrite: true,
    memoryRead: false,
    memoryWrite: false,
    ragNamespaces: [],
    policyProfile: 'standard',
    adultPermission: false,
    dataRetentionPolicy: 'default',
    passthroughModelAllowed: false,
    providerResidencyConstraints: [],
    ...overrides,
  }
}

async function run() {
  const core = await import('../packages/core/src/index.ts')
  const {
    APPROVED_PROVIDER_DEFINITIONS,
    CAPABILITY_KEYS,
    CODING_ONLY_PROVIDERS,
    EXECUTOR_REGISTRATIONS,
    PROVIDER_KEYS,
    RUNTIME_EXECUTION_PROVIDERS,
    evaluateOrchestra,
    getRuntimeTruth,
    hasBlockedOverrides,
    hashAppApiKey,
  } = core

  check(CAPABILITY_KEYS.length === 68 && new Set(CAPABILITY_KEYS).size === 68, 'Exactly 68 unique canonical capabilities')
  check(PROVIDER_KEYS.length === 4 && APPROVED_PROVIDER_DEFINITIONS.length === 4, 'Exactly four approved provider definitions')
  check(RUNTIME_EXECUTION_PROVIDERS.length === 3, 'Exactly three backend runtime providers')
  check(CODING_ONLY_PROVIDERS.length === 1 && CODING_ONLY_PROVIDERS[0] === 'mimo', 'MiMo remains coding-agent-only')
  check(EXECUTOR_REGISTRATIONS.length > 0, 'Callable executor registrations are declared')

  const rawKey = 'amark_proof_test_key_12345'
  check(hashAppApiKey(rawKey) === createHash('sha256').update(rawKey).digest('hex'), 'App API key hashing remains deterministic')
  for (const field of ['provider', 'model', 'providerOverride', 'modelOverride', 'selectedProvider', 'selectedModel']) {
    check(hasBlockedOverrides({ [field]: 'forbidden' }) === field, `Public override '${field}' is blocked`)
  }

  const primary = candidate()
  const fallback = candidate({
    provider: 'deepinfra',
    model: 'fallback-model',
    displayName: 'Fallback',
    executorId: 'deepinfra.chat',
    estimatedCost: 2,
  })
  const decision = evaluateOrchestra({ capability: 'chat', appSlug: 'proof-app', appGrant: grant(), executionId: 'proof' }, [primary, fallback])
  check(decision.selectedProvider === 'deepinfra', 'Orchestra is the active provider authority')
  check(decision.selectedModel === 'primary-model', 'Orchestra preserves the exact primary model')
  check(decision.selectedExecutorId === 'deepinfra.chat', 'Orchestra selects an exact executor registration')
  check(decision.fallbackRoutes[0]?.model === 'fallback-model', 'Orchestra preserves the exact fallback model')
  check(decision.fallbackRoutes[0]?.executorId === 'deepinfra.chat', 'Fallback preserves its executor registration')

  const deniedAdult = evaluateOrchestra({
    capability: 'adult_text',
    appSlug: 'proof-app',
    appGrant: grant({ capability: 'adult_text', adultPermission: false }),
  }, [candidate({ capability: 'adult_text' })])
  check(!deniedAdult.executionAllowed, 'Adult execution is denied without the adult grant')

  const truth = getRuntimeTruth()
  check(truth.providers.length === 4, 'Runtime truth uses all four canonical providers')
  check(truth.capabilities.length === 68, 'Runtime truth uses all 68 canonical capabilities')
  check(truth.capabilities.every((capability) => capability.infrastructureReady === false), 'Runtime truth does not default infrastructure readiness to true')
  check(truth.capabilities.filter((capability) => !capability.executorRegistered).every((capability) => !capability.executableNow), 'Allowlist or catalogue presence alone cannot make a capability executable')

  if (process.env.LIVE_PROOF === '1') {
    const url = process.env.PROOF_API_URL || 'http://localhost:3001'
    const response = await fetch(`${url}/health`)
    check(response.ok, 'Live mode backend health endpoint responds')
  }

  console.log(`\n${results.length - failed}/${results.length} proof checks passed`)
  if (failed) process.exit(1)
}

run().catch((error) => {
  console.error(error)
  process.exit(1)
})
