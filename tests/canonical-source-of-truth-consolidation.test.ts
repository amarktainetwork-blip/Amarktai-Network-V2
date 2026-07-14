import { readFileSync } from 'node:fs'
import { describe, expect, it, vi } from 'vitest'
import {
  APPROVED_PROVIDER_DEFINITIONS,
  CAPABILITY_BY_KEY,
  CAPABILITY_CATALOG,
  CAPABILITY_FIELD_MAP,
  CAPABILITY_KEYS,
  CODING_ONLY_PROVIDERS,
  EXECUTOR_REGISTRATIONS,
  JobPayloadSchema,
  MODEL_CATALOGUE,
  PROVIDER_KEYS,
  RUNTIME_EXECUTION_PROVIDERS,
  evaluateOrchestra,
  getExecutorRegistration,
  getRuntimeTruth,
  type AppCapabilityGrantContext,
  type OrchestraCandidate,
} from '../packages/core/src/index.ts'
import { buildCapabilityGroupSummary } from '../apps/api/src/lib/capability-groups.ts'
import {
  EXECUTOR_HANDLERS,
  executeRegisteredRoute,
} from '../apps/worker/src/providers/provider-executor.ts'

function grant(overrides: Partial<AppCapabilityGrantContext> = {}): AppCapabilityGrantContext {
  return {
    appSlug: 'test-app',
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

function candidate(overrides: Partial<OrchestraCandidate> = {}): OrchestraCandidate {
  return {
    provider: 'groq',
    model: 'primary-model',
    displayName: 'Primary',
    capability: 'chat',
    executorId: 'groq.chat',
    providerConfigured: true,
    providerEnabled: true,
    providerHealth: 'configured',
    providerAccountAllowed: true,
    providerPolicyAllowed: true,
    modelLifecycleAllowed: true,
    adapterSupported: true,
    executorSupported: true,
    requestShapeKnown: true,
    responseShapeKnown: true,
    infrastructureReady: true,
    executionReady: true,
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

describe('canonical source-of-truth consolidation', () => {
  it('defines exactly 68 unique capabilities with the required metadata', () => {
    expect(CAPABILITY_KEYS).toHaveLength(68)
    expect(new Set(CAPABILITY_KEYS).size).toBe(68)
    expect(CAPABILITY_CATALOG).toHaveLength(68)
    expect(Object.keys(CAPABILITY_FIELD_MAP)).toHaveLength(68)
    for (const capability of CAPABILITY_CATALOG) {
      expect(capability.label).toBeTruthy()
      expect(capability.family).toBeTruthy()
      expect(capability.description).toBeTruthy()
      expect(capability.inputContractReference).toContain(capability.key)
      expect(capability.outputContractReference).toContain(capability.key)
      expect(typeof capability.orchestrated).toBe('boolean')
      expect(typeof capability.governed).toBe('boolean')
      expect(typeof capability.requiresSourceArtifact).toBe('boolean')
      expect(typeof capability.requiresQueueExecution).toBe('boolean')
    }
  })

  it('derives API labels and groups from the canonical catalogue', () => {
    const summary = buildCapabilityGroupSummary('image_generation', [], getRuntimeTruth())
    expect(summary.label).toBe(CAPABILITY_BY_KEY.image_generation.label)
    expect(summary.category).toBe(CAPABILITY_BY_KEY.image_generation.category)
  })

  it('defines five approved providers, four runtime providers, and MiMo as coding-only', () => {
    expect(APPROVED_PROVIDER_DEFINITIONS).toHaveLength(5)
    expect(PROVIDER_KEYS).toEqual(['genx', 'groq', 'together', 'mimo', 'deepinfra'])
    expect(RUNTIME_EXECUTION_PROVIDERS).toEqual(['genx', 'groq', 'together', 'deepinfra'])
    expect(CODING_ONLY_PROVIDERS).toEqual(['mimo'])
    expect(APPROVED_PROVIDER_DEFINITIONS.find((provider) => provider.key === 'mimo')).toMatchObject({
      backendExecutionAllowed: false,
      codingOnly: true,
    })
  })

  it('derives support from callable registrations, never capability allowlists', () => {
    expect(getExecutorRegistration('image_generation', 'together')?.id).toBe('together.image-generation')
    expect(getExecutorRegistration('image_edit', 'together')).toBeUndefined()
    expect(getExecutorRegistration('image_to_video', 'genx')).toBeUndefined()
    expect(getExecutorRegistration('tts', 'groq')).toBeUndefined()
    expect(getExecutorRegistration('campaign_generation', 'groq')).toBeUndefined()
    for (const registration of EXECUTOR_REGISTRATIONS) {
      expect(typeof EXECUTOR_HANDLERS[registration.id]).toBe('function')
    }
  })

  it('keeps catalogue truth separate from executor and runtime readiness', () => {
    expect(MODEL_CATALOGUE.some((model) => model.status === 'available')).toBe(true)
    expect(MODEL_CATALOGUE.every((model) => model.executable !== true)).toBe(true)
    const truth = getRuntimeTruth()
    expect(truth.capabilities).toHaveLength(68)
    expect(truth.capabilities.every((capability) => !capability.infrastructureReady)).toBe(true)
    expect(truth.capabilities.every((capability) => !capability.liveProven)).toBe(true)
    expect(truth.capabilities.filter((capability) => !capability.executorRegistered).every((capability) => !capability.executableNow)).toBe(true)
  })

  it('preserves exact Orchestra primary and fallback route models', () => {
    const decision = evaluateOrchestra({ capability: 'chat', appGrant: grant() }, [
      candidate(),
      candidate({ provider: 'deepinfra', model: 'fallback-model', displayName: 'Fallback', executorId: 'deepinfra.chat', estimatedCost: 2 }),
    ])
    expect(decision.selectedModel).toBe('primary-model')
    expect(decision.selectedExecutorId).toBe('groq.chat')
    expect(decision.fallbackRoutes[0]).toMatchObject({
      provider: 'deepinfra',
      model: 'fallback-model',
      executorId: 'deepinfra.chat',
    })
  })

  it('denies adult execution without the adult grant', () => {
    const decision = evaluateOrchestra({
      capability: 'adult_text',
      appGrant: grant({ capability: 'adult_text', adultPermission: false }),
    }, [candidate({ capability: 'adult_text' })])
    expect(decision.executionAllowed).toBe(false)
    expect(decision.blockersRejected[0]?.blockers).toContain('app_adult_permission_required')
  })

  it('propagates the exact route model and rejects provider/model substitution', async () => {
    const original = EXECUTOR_HANDLERS['groq.chat']
    const handler = vi.fn(async (_payload, model: string) => ({
      success: true,
      status: 'completed' as const,
      provider: 'groq',
      model,
      output: 'ok',
    }))
    EXECUTOR_HANDLERS['groq.chat'] = handler
    try {
      const payload = {
        jobId: 'job', appSlug: 'test-app', capability: 'chat', prompt: 'hello', traceId: 'trace', appGrantSnapshot: grant(),
      }
      const result = await executeRegisteredRoute(payload, {
        provider: 'groq', model: 'exact-model', executorId: 'groq.chat', routeKind: 'primary',
      })
      expect(handler).toHaveBeenCalledWith(payload, 'exact-model')
      expect(result).toMatchObject({ success: true, provider: 'groq', model: 'exact-model' })

      EXECUTOR_HANDLERS['groq.chat'] = vi.fn(async () => ({
        success: true, status: 'completed' as const, provider: 'deepinfra', model: 'other-model', output: 'bad',
      }))
      const rejected = await executeRegisteredRoute(payload, {
        provider: 'groq', model: 'exact-model', executorId: 'groq.chat', routeKind: 'primary',
      })
      expect(rejected.success).toBe(false)
      expect(rejected.error).toContain('attempted to change provider')
    } finally {
      EXECUTOR_HANDLERS['groq.chat'] = original
    }
  })

  it('requires a valid immutable grant snapshot in the queue contract', () => {
    const parsed = JobPayloadSchema.safeParse({
      jobId: '5d6a37d9-6a88-4a8c-a586-377168bab083',
      appSlug: 'test-app',
      capability: 'chat',
      prompt: 'hello',
      input: {},
      metadata: { appGrantSnapshot: grant() },
      traceId: 'trace',
      routingMode: 'balanced',
      appGrantSnapshot: grant(),
    })
    expect(parsed.success).toBe(true)
  })

  it('has no production Brain Router import or invocation', () => {
    const worker = readFileSync('apps/worker/src/providers/provider-executor.ts', 'utf8')
    const runtimeTruth = readFileSync('packages/core/src/runtime-truth.ts', 'utf8')
    expect(worker).not.toContain('routeBrain')
    expect(worker).not.toContain('BrainRouterDecision')
    expect(runtimeTruth).not.toContain('routeBrain')
  })
})
