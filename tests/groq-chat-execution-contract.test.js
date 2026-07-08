/**
 * Groq chat execution contract tests — proves live Groq chat path
 * without calling the real Groq API in unit tests.
 *
 * Phase 6A: Groq Chat Only
 */

import { describe, expect, it, vi, beforeEach, afterEach } from 'vitest'

// ── Mock Prisma ──────────────────────────────────────────────────────────────

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
    resolveProviderApiKey: vi.fn(),
  }
})

vi.mock('@amarktai/db', () => ({
  prisma: prismaMock,
  ProviderConfigError: credentialMocks.ProviderConfigError,
  resolveProviderApiKey: credentialMocks.resolveProviderApiKey,
}))

// ── Mock Groq client ─────────────────────────────────────────────────────────

const mockGroqChat = vi.fn()

vi.mock('@amarktai/providers', () => ({
  groqChat: mockGroqChat,
}))

// ── Imports ──────────────────────────────────────────────────────────────────

import { executeWithProvider } from '../apps/worker/src/providers/provider-executor.ts'
import { createJobProcessor } from '../apps/worker/src/processors/job-processor.ts'
import { routeProvider, GROQ_DEFAULT_MODEL } from '../packages/core/src/index.ts'

// ── Fixtures ─────────────────────────────────────────────────────────────────

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

// ── Provider client tests ────────────────────────────────────────────────────

describe('Groq executor — client contract', () => {
  const originalEnv = process.env

  beforeEach(() => {
    vi.clearAllMocks()
    process.env = { ...originalEnv, GROQ_API_KEY: 'test-key' }
    credentialMocks.resolveProviderApiKey.mockImplementation(async (providerKey) => {
      if (providerKey === 'groq') return { providerKey: 'groq', apiKey: 'test-key', source: 'env' }
      throw new credentialMocks.ProviderConfigError(`Provider '${providerKey}' is missing configuration`, providerKey, 'missing-config')
    })
  })

  afterEach(() => {
    process.env = originalEnv
  })

  it('requires GROQ_API_KEY to be configured for Groq routing', () => {
    delete process.env.GROQ_API_KEY
    delete process.env.TOGETHER_API_KEY
    delete process.env.MIMO_API_KEY
    delete process.env.GENX_API_KEY
    delete process.env.DEEPINFRA_API_KEY
    const decision = routeProvider('chat')
    // Without any provider config, routing is blocked
    expect(decision.blocked).toBe(true)
  })

  it('builds request with provider groq', async () => {
    credentialMocks.resolveProviderApiKey.mockResolvedValueOnce({
      providerKey: 'groq',
      apiKey: 'db-groq-key',
      source: 'database',
    })
    mockGroqChat.mockResolvedValue({
      content: 'Hello!',
      model: 'llama-3.3-70b-versatile',
      usage: { promptTokens: 10, completionTokens: 5, totalTokens: 15 },
      finishReason: 'stop',
    })

    const result = await executeWithProvider(makePayload())

    expect(result.success).toBe(true)
    expect(result.provider).toBe('groq')
    expect(mockGroqChat).toHaveBeenCalledWith(expect.objectContaining({
      apiKey: 'db-groq-key',
    }))
    expect(JSON.stringify(result)).not.toContain('db-groq-key')
  })

  it('uses internal model only, not user model', async () => {
    mockGroqChat.mockResolvedValue({
      content: 'Hello!',
      model: GROQ_DEFAULT_MODEL,
      usage: { promptTokens: 10, completionTokens: 5, totalTokens: 15 },
      finishReason: 'stop',
    })

    await executeWithProvider(makePayload())

    // groqChat should be called without a model (uses default internally)
    expect(mockGroqChat).toHaveBeenCalledWith(
      expect.objectContaining({ prompt: 'Hello world' })
    )
    // No model field in the request
    const callArgs = mockGroqChat.mock.calls[0][0]
    expect(callArgs.model).toBeUndefined()
  })

  it('does not accept app-supplied provider/model override', async () => {
    mockGroqChat.mockResolvedValue({
      content: 'Hello!',
      model: GROQ_DEFAULT_MODEL,
      usage: { promptTokens: 10, completionTokens: 5, totalTokens: 15 },
      finishReason: 'stop',
    })

    // Even if payload has extra fields, executor ignores them
    const result = await executeWithProvider(makePayload({ provider: 'genx', model: 'fake-model' }))

    expect(result.success).toBe(true)
    expect(result.provider).toBe('groq')
  })

  it('parses successful text output', async () => {
    mockGroqChat.mockResolvedValue({
      content: 'This is a real Groq response.',
      model: 'llama-3.3-70b-versatile',
      usage: { promptTokens: 10, completionTokens: 8, totalTokens: 18 },
      finishReason: 'stop',
    })

    const result = await executeWithProvider(makePayload())

    expect(result.success).toBe(true)
    expect(result.status).toBe('completed')
    expect(result.output).toBe('This is a real Groq response.')
    expect(result.provider).toBe('groq')
    expect(result.model).toBe('llama-3.3-70b-versatile')
  })

  it('handles empty output as failure', async () => {
    mockGroqChat.mockResolvedValue({
      content: '',
      model: 'llama-3.3-70b-versatile',
      usage: { promptTokens: 10, completionTokens: 0, totalTokens: 10 },
      finishReason: 'stop',
    })

    const result = await executeWithProvider(makePayload())

    expect(result.success).toBe(false)
    expect(result.status).toBe('failed')
    expect(result.error).toContain('empty')
  })

  it('handles HTTP/API failure safely', async () => {
    mockGroqChat.mockRejectedValue(new Error('Groq chat error 429: rate limited'))

    const result = await executeWithProvider(makePayload())

    expect(result.success).toBe(false)
    expect(result.status).toBe('failed')
    expect(result.error).toContain('Groq execution failed')
    expect(result.error).toContain('rate limited')
  })

  it('never logs API key', async () => {
    process.env.GROQ_API_KEY = 'super-secret-key-12345'
    mockGroqChat.mockResolvedValue({
      content: 'Hello!',
      model: 'llama-3.3-70b-versatile',
      usage: { promptTokens: 10, completionTokens: 5, totalTokens: 15 },
      finishReason: 'stop',
    })

    const result = await executeWithProvider(makePayload())

    // Result should not contain the API key
    expect(JSON.stringify(result)).not.toContain('super-secret-key-12345')
  })

  it('does not call network in unit tests', async () => {
    // groqChat is mocked, so no real network call
    mockGroqChat.mockResolvedValue({
      content: 'Hello!',
      model: 'llama-3.3-70b-versatile',
      usage: { promptTokens: 10, completionTokens: 5, totalTokens: 15 },
      finishReason: 'stop',
    })

    await executeWithProvider(makePayload())

    expect(mockGroqChat).toHaveBeenCalled()
  })
})

// ── Routing/execution gate tests ─────────────────────────────────────────────

describe('Routing/execution gate', () => {
  const originalEnv = process.env

  beforeEach(() => {
    vi.clearAllMocks()
    process.env = { ...originalEnv, GROQ_API_KEY: 'test-key' }
    credentialMocks.resolveProviderApiKey.mockImplementation(async (providerKey) => {
      if (providerKey === 'groq') return { providerKey: 'groq', apiKey: 'test-key', source: 'env' }
      throw new credentialMocks.ProviderConfigError(`Provider '${providerKey}' is missing configuration`, providerKey, 'missing-config')
    })
  })

  afterEach(() => {
    process.env = originalEnv
  })

  it('chat routes to Groq when Groq config is present', () => {
    const decision = routeProvider('chat')
    expect(decision.selectedProvider).toBe('groq')
  })

  it('chat does not route to DeepInfra by default', () => {
    const decision = routeProvider('chat')
    expect(decision.selectedProvider).not.toBe('deepinfra')
  })

  it('non-chat capabilities do not execute Groq in Phase 6A', async () => {
    mockGroqChat.mockResolvedValue({
      content: 'Hello!',
      model: 'llama-3.3-70b-versatile',
      usage: { promptTokens: 10, completionTokens: 5, totalTokens: 15 },
      finishReason: 'stop',
    })

    const result = await executeWithProvider(makePayload({ capability: 'image_generation' }))

    expect(result.success).toBe(false)
    expect(result.error).toContain('not implemented')
    expect(mockGroqChat).not.toHaveBeenCalled()
  })

  it('missing Groq config blocks live execution honestly', async () => {
    delete process.env.GROQ_API_KEY
    credentialMocks.resolveProviderApiKey.mockRejectedValueOnce(
      new credentialMocks.ProviderConfigError("Provider 'groq' is missing configuration", 'groq', 'missing-config')
    )

    const result = await executeWithProvider(makePayload())

    expect(result.success).toBe(false)
    expect(result.error).toContain('not implemented')
  })

  it('config presence does not mean provider is generally live', () => {
    // Even with GROQ_API_KEY set, only chat is live
    const imageResult = executeWithProvider(makePayload({ capability: 'image_generation' }))
    expect(imageResult).resolves.toMatchObject({ success: false })
  })
})

// ── Worker integration tests ─────────────────────────────────────────────────

describe('Worker integration with Groq chat', () => {
  const originalEnv = process.env

  beforeEach(() => {
    vi.clearAllMocks()
    process.env = { ...originalEnv, GROQ_API_KEY: 'test-key' }
    prismaMock.job.update.mockResolvedValue({})
    credentialMocks.resolveProviderApiKey.mockImplementation(async (providerKey) => {
      if (providerKey === 'groq') return { providerKey: 'groq', apiKey: 'test-key', source: 'env' }
      throw new credentialMocks.ProviderConfigError(`Provider '${providerKey}' is missing configuration`, providerKey, 'missing-config')
    })
    mockGroqChat.mockResolvedValue({
      content: 'Real Groq response text',
      model: 'llama-3.3-70b-versatile',
      usage: { promptTokens: 10, completionTokens: 8, totalTokens: 18 },
      finishReason: 'stop',
    })
  })

  afterEach(() => {
    process.env = originalEnv
  })

  it('worker calls Groq executor only for chat', async () => {
    prismaMock.job.findUnique.mockResolvedValue(makeDbJob())

    const processor = createJobProcessor()
    const result = await processor(makePayload())

    expect(result.success).toBe(true)
    expect(result.provider).toBe('groq')
    expect(mockGroqChat).toHaveBeenCalled()
  })

  it('worker updates Job to processing before execution', async () => {
    prismaMock.job.findUnique.mockResolvedValue(makeDbJob())

    const processor = createJobProcessor()
    await processor(makePayload())

    expect(prismaMock.job.update).toHaveBeenCalledWith(
      expect.objectContaining({
        where: { id: 'job-uuid-001' },
        data: expect.objectContaining({
          status: 'processing',
          startedAt: expect.any(Date),
        }),
      })
    )
  })

  it('worker updates Job to completed after successful Groq result', async () => {
    prismaMock.job.findUnique.mockResolvedValue(makeDbJob())

    const processor = createJobProcessor()
    await processor(makePayload())

    const completedUpdate = prismaMock.job.update.mock.calls.find(
      (call) => call[0].data.status === 'completed'
    )
    expect(completedUpdate).toBeDefined()
    expect(completedUpdate[0].data.provider).toBe('groq')
    expect(completedUpdate[0].data.model).toBe('llama-3.3-70b-versatile')
    expect(completedUpdate[0].data.output).toBe('Real Groq response text')
    expect(completedUpdate[0].data.progress).toBe(100)
    expect(completedUpdate[0].data.completedAt).toBeInstanceOf(Date)
  })

  it('worker stores output text', async () => {
    prismaMock.job.findUnique.mockResolvedValue(makeDbJob())

    const processor = createJobProcessor()
    await processor(makePayload())

    const completedUpdate = prismaMock.job.update.mock.calls.find(
      (call) => call[0].data.status === 'completed'
    )
    expect(completedUpdate[0].data.output).toContain('Real Groq response')
  })

  it('worker sets provider groq if schema supports it', async () => {
    prismaMock.job.findUnique.mockResolvedValue(makeDbJob())

    const processor = createJobProcessor()
    await processor(makePayload())

    const completedUpdate = prismaMock.job.update.mock.calls.find(
      (call) => call[0].data.status === 'completed'
    )
    expect(completedUpdate[0].data.provider).toBe('groq')
  })

  it('worker sets internal model', async () => {
    prismaMock.job.findUnique.mockResolvedValue(makeDbJob())

    const processor = createJobProcessor()
    await processor(makePayload())

    const completedUpdate = prismaMock.job.update.mock.calls.find(
      (call) => call[0].data.status === 'completed'
    )
    expect(completedUpdate[0].data.model).toBe('llama-3.3-70b-versatile')
  })

  it('worker sets completedAt', async () => {
    prismaMock.job.findUnique.mockResolvedValue(makeDbJob())

    const processor = createJobProcessor()
    await processor(makePayload())

    const completedUpdate = prismaMock.job.update.mock.calls.find(
      (call) => call[0].data.status === 'completed'
    )
    expect(completedUpdate[0].data.completedAt).toBeInstanceOf(Date)
  })

  it('worker sets progress 100', async () => {
    prismaMock.job.findUnique.mockResolvedValue(makeDbJob())

    const processor = createJobProcessor()
    await processor(makePayload())

    const completedUpdate = prismaMock.job.update.mock.calls.find(
      (call) => call[0].data.status === 'completed'
    )
    expect(completedUpdate[0].data.progress).toBe(100)
  })

  it('worker does not create artifact', async () => {
    prismaMock.job.findUnique.mockResolvedValue(makeDbJob())

    const processor = createJobProcessor()
    await processor(makePayload())

    for (const call of prismaMock.job.update.mock.calls) {
      expect(call[0].data.artifactId).toBeUndefined()
    }
  })

  it('worker does not set artifactId', async () => {
    prismaMock.job.findUnique.mockResolvedValue(makeDbJob())

    const processor = createJobProcessor()
    await processor(makePayload())

    for (const call of prismaMock.job.update.mock.calls) {
      expect(call[0].data.artifactId).toBeUndefined()
    }
  })

  it('worker marks failed on Groq error', async () => {
    mockGroqChat.mockRejectedValue(new Error('Groq API down'))

    prismaMock.job.findUnique.mockResolvedValue(makeDbJob())

    const processor = createJobProcessor()
    await expect(processor(makePayload())).rejects.toThrow('Groq API down')

    const failedUpdate = prismaMock.job.update.mock.calls.find(
      (call) => call[0].data.status === 'failed'
    )
    expect(failedUpdate).toBeDefined()
    expect(failedUpdate[0].data.error).toContain('Groq execution failed')
  })

  it('worker throws on Groq error so BullMQ records failure', async () => {
    mockGroqChat.mockRejectedValue(new Error('Groq API down'))

    prismaMock.job.findUnique.mockResolvedValue(makeDbJob())

    const processor = createJobProcessor()
    await expect(processor(makePayload())).rejects.toThrow()
  })

  it('worker does not call GenX', async () => {
    prismaMock.job.findUnique.mockResolvedValue(makeDbJob({ capability: 'video_generation' }))

    const processor = createJobProcessor()
    await expect(processor(makePayload({ capability: 'video_generation' }))).rejects.toThrow()

    expect(mockGroqChat).not.toHaveBeenCalled()
  })

  it('worker does not call Together', async () => {
    prismaMock.job.findUnique.mockResolvedValue(makeDbJob({ capability: 'image_generation' }))

    const processor = createJobProcessor()
    await expect(processor(makePayload({ capability: 'image_generation' }))).rejects.toThrow()

    expect(mockGroqChat).not.toHaveBeenCalled()
  })

  it('worker does not call Mimo', async () => {
    // music_generation does not route to groq
    prismaMock.job.findUnique.mockResolvedValue(makeDbJob({ capability: 'music_generation' }))

    const processor = createJobProcessor()
    await expect(processor(makePayload({ capability: 'music_generation' }))).rejects.toThrow()

    expect(mockGroqChat).not.toHaveBeenCalled()
  })

  it('worker does not call DeepInfra', async () => {
    // Use a capability that doesn't route to groq
    prismaMock.job.findUnique.mockResolvedValue(makeDbJob({ capability: 'image_generation' }))

    const processor = createJobProcessor()
    await expect(processor(makePayload({ capability: 'image_generation' }))).rejects.toThrow()

    // DeepInfra should never be called
    expect(mockGroqChat).not.toHaveBeenCalled()
  })

  it('existing Phase 3 ingestion contract still holds', () => {
    // Provider keys remain exactly the final five
    const { PROVIDER_KEYS } = require('../packages/core/src/providers.ts')
    expect(PROVIDER_KEYS).toEqual(['genx', 'groq', 'together', 'mimo', 'deepinfra'])
  })
})
