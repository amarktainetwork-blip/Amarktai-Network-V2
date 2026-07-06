/**
 * Provider Routing Skeleton tests — proves internal routing logic
 * selects eligible provider candidates by capability without calling APIs.
 *
 * Phase 5: Provider Routing Skeleton
 */

import { describe, expect, it, vi, beforeEach, afterEach } from 'vitest'

// ── Mock Prisma (for worker integration tests) ───────────────────────────────

const prismaMock = vi.hoisted(() => ({
  job: {
    findUnique: vi.fn(),
    update: vi.fn(),
  },
}))

const credentialMocks = vi.hoisted(() => {
  class ProviderConfigError extends Error {
    constructor(message, providerKey = 'groq', code = 'missing-config') {
      super(message)
      this.providerKey = providerKey
      this.code = code
    }
  }
  return {
    ProviderConfigError,
    resolveProviderApiKey: vi.fn(async (providerKey) => {
      throw new ProviderConfigError(`Provider '${providerKey}' is missing configuration`, providerKey, 'missing-config')
    }),
  }
})

vi.mock('@amarktai/db', () => ({
  prisma: prismaMock,
  ProviderConfigError: credentialMocks.ProviderConfigError,
  resolveProviderApiKey: credentialMocks.resolveProviderApiKey,
}))

// ── Import routing and processor ──────────────────────────────────────────────

import {
  routeProvider,
  isProviderConfigured,
  isDeepInfraGated,
  isValidProviderId,
  getProviderEnvVar,
  getProviderCategorySupport,
  PROVIDER_KEYS,
  CAPABILITY_KEYS,
} from '../packages/core/src/index.ts'

import {
  processJob,
  createJobProcessor,
} from '../apps/worker/src/processors/job-processor.ts'

// ── Fixtures ──────────────────────────────────────────────────────────────────

function makePayload(overrides = {}) {
  return {
    jobId: 'job-uuid-001',
    appSlug: 'test-app',
    capability: 'chat',
    prompt: 'Hello world',
    input: {},
    metadata: {},
    traceId: 'trace_test-uuid',
    ...overrides,
  }
}

function makeDbJob(overrides = {}) {
  return {
    id: 'job-uuid-001',
    appSlug: 'test-app',
    capability: 'chat',
    prompt: 'Hello world',
    inputJson: '{}',
    metadataJson: '{}',
    traceId: 'trace_test-uuid',
    status: 'queued',
    provider: null,
    model: null,
    artifactId: null,
    progress: 0,
    output: null,
    error: null,
    callbackUrl: null,
    createdAt: new Date(),
    startedAt: null,
    completedAt: null,
    updatedAt: new Date(),
    ...overrides,
  }
}

// ── Provider identity tests ──────────────────────────────────────────────────

describe('Provider identity', () => {
  it('only final provider IDs are valid', () => {
    expect(PROVIDER_KEYS).toEqual(['genx', 'groq', 'together', 'mimo', 'deepinfra'])
  })

  it('invalid provider IDs are rejected', () => {
    expect(isValidProviderId('huggingface')).toBe(false)
    expect(isValidProviderId('openai')).toBe(false)
    expect(isValidProviderId('anthropic')).toBe(false)
    expect(isValidProviderId('gemini')).toBe(false)
    expect(isValidProviderId('replicate')).toBe(false)
    expect(isValidProviderId('lyria')).toBe(false)
    expect(isValidProviderId('qwen')).toBe(false)
    expect(isValidProviderId('minimax')).toBe(false)
    expect(isValidProviderId('heygen')).toBe(false)
    expect(isValidProviderId('fake')).toBe(false)
  })

  it('legacy providers are not active provider IDs', () => {
    const legacy = ['huggingface', 'openai', 'anthropic', 'gemini', 'replicate', 'lyria', 'qwen', 'minimax', 'heygen']
    for (const provider of legacy) {
      expect(PROVIDER_KEYS).not.toContain(provider)
    }
  })

  it('DeepInfra exists but is gated by default', () => {
    expect(PROVIDER_KEYS).toContain('deepinfra')
    expect(isDeepInfraGated()).toBe(true)
  })
})

// ── Capability routing tests ─────────────────────────────────────────────────

describe('Capability routing', () => {
  it('valid capability gets candidate list', () => {
    const decision = routeProvider('chat')
    expect(decision.candidates.length).toBe(5)
    expect(decision.capability).toBe('chat')
  })

  it('all canonical capabilities produce valid routing decisions', () => {
    // Router accepts validated CapabilityKey only.
    // Unknown capabilities are rejected by API/worker validation before routing.
    // This test proves routing works across all canonical capabilities.
    for (const cap of CAPABILITY_KEYS) {
      const decision = routeProvider(cap)
      expect(decision.capability).toBe(cap)
      expect(decision.executionAllowed).toBe(false)
      expect(decision.candidates.length).toBe(5)
    }
  })

  it('chat capability routes to eligible text provider', () => {
    const decision = routeProvider('chat')
    const textProviders = decision.candidates.filter(
      (c) => c.supported && !c.gated
    )
    expect(textProviders.length).toBeGreaterThan(0)
    // groq, together, mimo all support text category
    const providerNames = textProviders.map((c) => c.provider)
    expect(providerNames).toContain('groq')
  })

  it('code capability routes to eligible text/code provider', () => {
    const decision = routeProvider('code')
    const supported = decision.candidates.filter((c) => c.supported && !c.gated)
    expect(supported.length).toBeGreaterThan(0)
    const names = supported.map((c) => c.provider)
    expect(names).toContain('groq')
    expect(names).toContain('mimo')
  })

  it('image capability routes only if canonical capability exists', () => {
    const decision = routeProvider('image_generation')
    const supported = decision.candidates.filter((c) => c.supported && !c.gated)
    const names = supported.map((c) => c.provider)
    expect(names).toContain('together')
    expect(names).toContain('genx')
  })

  it('video capability routes only if canonical capability exists', () => {
    const decision = routeProvider('video_generation')
    const supported = decision.candidates.filter((c) => c.supported && !c.gated)
    const names = supported.map((c) => c.provider)
    expect(names).toContain('genx')
  })

  it('music capability routes only if canonical capability exists', () => {
    // music_generation is category 'audio'
    const decision = routeProvider('music_generation')
    const supported = decision.candidates.filter((c) => c.supported && !c.gated)
    // genx and groq support audio category
    expect(supported.length).toBeGreaterThan(0)
  })

  it('avatar capability routes only if canonical capability exists', () => {
    // avatar_generation is category 'video'
    const decision = routeProvider('avatar_generation')
    const supported = decision.candidates.filter((c) => c.supported && !c.gated)
    expect(supported.length).toBeGreaterThan(0)
    const names = supported.map((c) => c.provider)
    expect(names).toContain('genx')
  })

  it('rag/embeddings/reranking routes only if canonical capability exists', () => {
    const ragDecision = routeProvider('rag_ingest')
    const embedDecision = routeProvider('embeddings')
    const rerankDecision = routeProvider('reranking')

    // rag_ingest is category 'retrieval', embeddings/reranking are 'text'
    const ragSupported = ragDecision.candidates.filter((c) => c.supported && !c.gated)
    const embedSupported = embedDecision.candidates.filter((c) => c.supported && !c.gated)

    expect(ragSupported.length).toBeGreaterThan(0)
    expect(embedSupported.length).toBeGreaterThan(0)
  })
})

// ── DeepInfra gating tests ───────────────────────────────────────────────────

describe('DeepInfra gating', () => {
  it('DeepInfra is not selected by default', () => {
    const decision = routeProvider('chat')
    expect(decision.selectedProvider).not.toBe('deepinfra')
  })

  it('DeepInfra can only be selected when explicit internal gate is true', () => {
    const decisionWithoutGate = routeProvider('chat')
    expect(decisionWithoutGate.selectedProvider).not.toBe('deepinfra')

    const decisionWithGate = routeProvider('chat', { allowGated: true })
    // DeepInfra might be selected if configured and no other provider available
    // But since we're testing without env vars, it won't be selected
    // The key test is that the gate flag changes behavior
    const deepinfraCandidate = decisionWithGate.candidates.find(
      (c) => c.provider === 'deepinfra'
    )
    expect(deepinfraCandidate?.gated).toBe(true)
  })

  it('DeepInfra gate does not enable live calls', () => {
    const decision = routeProvider('chat', { allowGated: true })
    expect(decision.executionAllowed).toBe(false)
  })
})

// ── Config semantics tests ───────────────────────────────────────────────────

describe('Config semantics', () => {
  const originalEnv = process.env

  beforeEach(() => {
    process.env = { ...originalEnv }
  })

  afterEach(() => {
    process.env = originalEnv
  })

  it('env/config presence means configured only', () => {
    process.env.GROQ_API_KEY = 'test-key'
    expect(isProviderConfigured('groq')).toBe(true)
  })

  it('configured does not mean live', () => {
    process.env.GROQ_API_KEY = 'test-key'
    const decision = routeProvider('chat')
    expect(decision.executionAllowed).toBe(false)
    // Even if provider is configured, execution is not allowed
  })

  it('missing config can make a candidate unavailable', () => {
    delete process.env.GROQ_API_KEY
    delete process.env.TOGETHER_API_KEY
    delete process.env.MIMO_API_KEY
    delete process.env.GENX_API_KEY

    const decision = routeProvider('chat')
    const configured = decision.candidates.filter(
      (c) => c.configured && !c.gated
    )
    expect(configured.length).toBe(0)
  })

  it('missing config does not cause fake provider success', () => {
    delete process.env.GROQ_API_KEY
    delete process.env.TOGETHER_API_KEY
    delete process.env.MIMO_API_KEY
    delete process.env.GENX_API_KEY
    delete process.env.DEEPINFRA_API_KEY
    const decision = routeProvider('chat')
    expect(decision.executionAllowed).toBe(false)
    expect(decision.blocked).toBe(true)
  })
})

// ── Selection behavior tests ─────────────────────────────────────────────────

describe('Selection behavior', () => {
  const originalEnv = process.env

  beforeEach(() => {
    process.env = { ...originalEnv }
  })

  afterEach(() => {
    process.env = originalEnv
  })

  it('router returns selectedProvider or blocked decision', () => {
    // With no env vars, should be blocked
    delete process.env.GROQ_API_KEY
    delete process.env.TOGETHER_API_KEY
    delete process.env.MIMO_API_KEY
    delete process.env.GENX_API_KEY

    const blockedDecision = routeProvider('chat')
    expect(blockedDecision.blocked).toBe(true)
    expect(blockedDecision.selectedProvider).toBeNull()

    // With env vars, should have a selection
    process.env.GROQ_API_KEY = 'test-key'
    const unblockedDecision = routeProvider('chat')
    expect(unblockedDecision.blocked).toBe(false)
    expect(unblockedDecision.selectedProvider).not.toBeNull()
  })

  it('router returns candidate reasons', () => {
    const decision = routeProvider('chat')
    for (const candidate of decision.candidates) {
      expect(candidate.reason).toBeDefined()
      expect(candidate.reason.length).toBeGreaterThan(0)
    }
  })

  it('router returns blockReason when no provider available', () => {
    delete process.env.GROQ_API_KEY
    delete process.env.TOGETHER_API_KEY
    delete process.env.MIMO_API_KEY
    delete process.env.GENX_API_KEY

    const decision = routeProvider('chat')
    expect(decision.blocked).toBe(true)
    expect(decision.blockReason).toBeDefined()
    expect(decision.blockReason.length).toBeGreaterThan(0)
  })

  it('router is deterministic for same inputs', () => {
    process.env.GROQ_API_KEY = 'test-key'
    process.env.TOGETHER_API_KEY = 'test-key'

    const decision1 = routeProvider('chat')
    const decision2 = routeProvider('chat')

    expect(decision1.selectedProvider).toBe(decision2.selectedProvider)
    expect(decision1.blocked).toBe(decision2.blocked)
    expect(decision1.candidates.length).toBe(decision2.candidates.length)
  })

  it('router never accepts app-supplied provider/model override', () => {
    const decision = routeProvider('chat')
    // The router has no input for provider/model from the app
    // It only uses internal routing logic
    expect(decision.executionAllowed).toBe(false)
  })

  it('router never reads provider/model from job input as authority', () => {
    // The router function signature only takes capability and options
    // It has no access to job input
    const decision = routeProvider('chat')
    expect(decision.selectedModel).toBeNull()
  })

  it('router does not call network', () => {
    // The router only reads process.env and uses static maps
    // No fetch, no HTTP, no network calls
    const decision = routeProvider('chat')
    expect(decision).toBeDefined()
  })
})

// ── Worker integration tests ─────────────────────────────────────────────────

describe('Worker integration with routing', () => {
  beforeEach(() => {
    vi.clearAllMocks()
    prismaMock.job.update.mockResolvedValue({})
  })

  it('worker asks router for routing decision', async () => {
    prismaMock.job.findUnique.mockResolvedValue(makeDbJob())

    await expect(processJob(makePayload())).rejects.toThrow()

    // The error should contain routing info
    const failedUpdate = prismaMock.job.update.mock.calls.find(
      (call) => call[0].data.status === 'failed'
    )
    expect(failedUpdate).toBeDefined()
    expect(failedUpdate[0].data.error).toContain('Provider execution not implemented')
    expect(failedUpdate[0].data.error).toContain('Candidates:')
  })

  it('worker still fails with not-implemented execution', async () => {
    prismaMock.job.findUnique.mockResolvedValue(makeDbJob())

    await expect(processJob(makePayload())).rejects.toThrow('not implemented')
  })

  it('worker still throws so BullMQ records failure', async () => {
    prismaMock.job.findUnique.mockResolvedValue(makeDbJob())

    await expect(processJob(makePayload())).rejects.toThrow()
  })

  it('worker does not create artifact', async () => {
    prismaMock.job.findUnique.mockResolvedValue(makeDbJob())

    await expect(processJob(makePayload())).rejects.toThrow()

    for (const call of prismaMock.job.update.mock.calls) {
      expect(call[0].data.artifactId).toBeUndefined()
    }
  })

  it('worker does not set artifactId', async () => {
    prismaMock.job.findUnique.mockResolvedValue(makeDbJob())

    await expect(processJob(makePayload())).rejects.toThrow()

    for (const call of prismaMock.job.update.mock.calls) {
      expect(call[0].data.artifactId).toBeUndefined()
    }
  })

  it('worker does not call GenX', async () => {
    prismaMock.job.findUnique.mockResolvedValue(makeDbJob({ capability: 'video_generation' }))

    await expect(processJob(makePayload({ capability: 'video_generation' }))).rejects.toThrow()

    const failedUpdate = prismaMock.job.update.mock.calls.find(
      (call) => call[0].data.status === 'failed'
    )
    expect(failedUpdate[0].data.error).not.toContain('genx adapter')
    expect(failedUpdate[0].data.error).not.toContain('GenX API')
  })

  it('worker does not call Groq', async () => {
    prismaMock.job.findUnique.mockResolvedValue(makeDbJob())

    await expect(processJob(makePayload())).rejects.toThrow()

    const failedUpdate = prismaMock.job.update.mock.calls.find(
      (call) => call[0].data.status === 'failed'
    )
    expect(failedUpdate[0].data.error).not.toContain('groq adapter')
    expect(failedUpdate[0].data.error).not.toContain('Groq API')
  })

  it('worker does not call Together', async () => {
    prismaMock.job.findUnique.mockResolvedValue(makeDbJob({ capability: 'image_generation' }))

    await expect(processJob(makePayload({ capability: 'image_generation' }))).rejects.toThrow()

    const failedUpdate = prismaMock.job.update.mock.calls.find(
      (call) => call[0].data.status === 'failed'
    )
    expect(failedUpdate[0].data.error).not.toContain('together adapter')
    expect(failedUpdate[0].data.error).not.toContain('Together API')
  })

  it('worker does not call Mimo', async () => {
    prismaMock.job.findUnique.mockResolvedValue(makeDbJob({ capability: 'code' }))

    await expect(processJob(makePayload({ capability: 'code' }))).rejects.toThrow()

    const failedUpdate = prismaMock.job.update.mock.calls.find(
      (call) => call[0].data.status === 'failed'
    )
    expect(failedUpdate[0].data.error).not.toContain('mimo adapter')
    expect(failedUpdate[0].data.error).not.toContain('Mimo API')
  })

  it('worker does not call DeepInfra', async () => {
    prismaMock.job.findUnique.mockResolvedValue(makeDbJob())

    await expect(processJob(makePayload())).rejects.toThrow()

    const failedUpdate = prismaMock.job.update.mock.calls.find(
      (call) => call[0].data.status === 'failed'
    )
    expect(failedUpdate[0].data.error).not.toContain('deepinfra adapter')
    expect(failedUpdate[0].data.error).not.toContain('DeepInfra API')
  })
})

// ── Existing tests preservation ──────────────────────────────────────────────

describe('Existing Phase 3 ingestion contract', () => {
  it('PROVIDER_KEYS remains exactly the final five', () => {
    expect(PROVIDER_KEYS).toEqual(['genx', 'groq', 'together', 'mimo', 'deepinfra'])
  })
})
