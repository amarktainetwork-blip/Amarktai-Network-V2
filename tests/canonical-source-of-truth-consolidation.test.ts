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

describe('canonical source-of-truth consolidation', () => {
  it('derives a unique capability taxonomy with the required metadata without a fixed count', () => {
    expect(CAPABILITY_KEYS.length).toBeGreaterThan(0)
    expect(new Set(CAPABILITY_KEYS).size).toBe(CAPABILITY_KEYS.length)
    expect(CAPABILITY_CATALOG).toHaveLength(CAPABILITY_KEYS.length)
    expect(Object.keys(CAPABILITY_FIELD_MAP)).toHaveLength(CAPABILITY_KEYS.length)
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

  it('defines four approved providers, three runtime providers, and MiMo as coding-only', () => {
    expect(APPROVED_PROVIDER_DEFINITIONS).toHaveLength(4)
    expect(PROVIDER_KEYS).toEqual(['genx', 'together', 'mimo', 'deepinfra'])
    expect(RUNTIME_EXECUTION_PROVIDERS).toEqual(['genx', 'together', 'deepinfra'])
    expect(CODING_ONLY_PROVIDERS).toEqual(['mimo'])
    expect(APPROVED_PROVIDER_DEFINITIONS.find((provider) => provider.key === 'mimo')).toMatchObject({
      backendExecutionAllowed: false,
      codingOnly: true,
    })
  })

  it('derives support from callable registrations, never capability allowlists', () => {
    expect(getExecutorRegistration('image_generation', 'together')?.id).toBe('together.image-generation')
    expect(getExecutorRegistration('image_edit', 'together')).toBeUndefined()
    expect(getExecutorRegistration('image_edit', 'deepinfra')?.id).toBe('deepinfra.task-inference')
    expect(getExecutorRegistration('image_to_video', 'genx')?.id).toBe('genx.image-to-video')
    expect(getExecutorRegistration('tts', 'genx')?.id).toBe('genx.tts')
    expect(getExecutorRegistration('tts', 'deepinfra')?.id).toBe('deepinfra.task-inference')
    expect(getExecutorRegistration('campaign_generation', 'deepinfra')).toBeUndefined()
    // Executors dispatched externally (streaming, media/async, worker bootstrap) don't need static map entries here.
    const externallyDispatched = new Set([
      'deepinfra.chat', 'deepinfra.vision', 'together.image-generation', 'genx.video-generation',
      'genx.image-to-video', 'genx.video-to-video',
      'genx.music-generation', 'genx.song-generation', 'genx.tts', 'genx.stt',
    ])
    for (const registration of EXECUTOR_REGISTRATIONS) {
      if (registration.executionMode !== 'stream' && !externallyDispatched.has(registration.id)) {
        expect(typeof EXECUTOR_HANDLERS[registration.id], `handler for ${registration.id}`).toBe('function')
      }
    }
  })

  it('keeps catalogue truth separate from executor and runtime readiness', () => {
    expect(MODEL_CATALOGUE.some((model) => model.status === 'available')).toBe(true)
    expect(MODEL_CATALOGUE.every((model) => model.executable !== true)).toBe(true)
    const truth = getRuntimeTruth()
    expect(truth.capabilities).toHaveLength(CAPABILITY_KEYS.length)
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
    expect(decision.selectedExecutorId).toBe('deepinfra.chat')
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

  it('fails closed when the exact route model cannot be revalidated', async () => {
    const original = EXECUTOR_HANDLERS['deepinfra.text-transform']
    const handler = vi.fn(async (_payload, model: string) => ({
      success: true,
      status: 'completed' as const,
      provider: 'deepinfra',
      model,
      output: 'ok',
    }))
    EXECUTOR_HANDLERS['deepinfra.text-transform'] = handler
    try {
      const payload = {
        jobId: 'job', appSlug: 'test-app', capability: 'summarization', prompt: 'hello', traceId: 'trace', appGrantSnapshot: grant({ capability: 'summarization' }),
      }
      const result = await executeRegisteredRoute(payload, {
        provider: 'deepinfra', model: 'meta-llama/Meta-Llama-3.1-8B-Instruct', executorId: 'deepinfra.text-transform', routeKind: 'primary',
      })
      expect(handler).not.toHaveBeenCalled()
      expect(result).toMatchObject({ success: false, provider: 'deepinfra', model: 'meta-llama/Meta-Llama-3.1-8B-Instruct' })
      expect(result.error).toContain('not compatible')
    } finally {
      EXECUTOR_HANDLERS['deepinfra.text-transform'] = original
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

  it('keeps release files free of hidden provider/model browser controls', () => {
    const files = [
      'app/dashboard/chat/page.js',
      'app/dashboard/image/page.js',
      'app/dashboard/video/page.js',
      'app/dashboard/music/page.js',
      'app/dashboard/voice/page.js',
      'app/dashboard/capability-lab/page.js',
      'app/dashboard/specialist-vision/page.js',
      'app/dashboard/social-ad/page.js',
    ]
    for (const file of files) {
      const source = readFileSync(file, 'utf8')
      expect(source).not.toMatch(/name=["']provider["']|name=["']model["']/)
    }
  })
})
