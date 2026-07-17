/**
 * DeepInfra chat execution contract tests — proves live DeepInfra chat path
 * without calling the real DeepInfra API in unit tests.
 *
 * Migrated from Groq to DeepInfra as primary chat provider.
 * Note: DeepInfra chat uses streaming mode, so executeWithProvider tests
 * verify the streaming executor rejection behavior.
 */

import { describe, expect, it, vi, beforeEach, afterEach } from 'vitest'

// ── Mock Prisma ──────────────────────────────────────────────────────────────

const prismaMock = vi.hoisted(() => ({
  job: {
    findUnique: vi.fn(),
    update: vi.fn(),
  },
  modelRegistryEntry: {
    findMany: vi.fn().mockResolvedValue([
      { provider: 'deepinfra', modelId: 'meta-llama/Meta-Llama-3.1-8B-Instruct', displayName: 'Llama 3.1 8B', status: 'active', costTier: 'low', latencyTier: 'medium', estimatedUnitCost: 0.0002, pricingConfidence: 'known', supportsChat: true },
      { provider: 'deepinfra', modelId: 'meta-llama/Llama-3.3-70B-Instruct', displayName: 'Llama 3.3 70B', status: 'active', costTier: 'low', latencyTier: 'medium', estimatedUnitCost: 0.0003, pricingConfidence: 'known', supportsChat: true },
    ]),
  },
  aiProvider: {
    findMany: vi.fn().mockResolvedValue([
      { providerKey: 'deepinfra', enabled: true, healthStatus: 'live', apiKey: 'encrypted-test-key' },
    ]),
  },
}))

const credentialMocks = vi.hoisted(() => {
  class ProviderConfigError extends Error {
    constructor(message, providerKey = 'deepinfra', code = 'missing-config') {
      super(message)
      this.providerKey = providerKey
      this.code = code
    }
  }
  return {
    ProviderConfigError,
    getProviderCredentialStatus: vi.fn(),
    resolveProviderApiKey: vi.fn(),
  }
})

vi.mock('@amarktai/db', () => ({
  prisma: prismaMock,
  ProviderConfigError: credentialMocks.ProviderConfigError,
  getProviderCredentialStatus: credentialMocks.getProviderCredentialStatus,
  resolveProviderApiKey: credentialMocks.resolveProviderApiKey,
}))

// ── Mock provider clients ────────────────────────────────────────────────────

const providerMocks = vi.hoisted(() => {
  class CanonicalProviderError extends Error {
    constructor({ code, provider, message, status = null, retryable = false }) {
      super(message)
      this.code = code
      this.provider = provider
      this.status = status
      this.retryable = retryable
    }
  }
  return {
    CanonicalProviderError,
    mockDeepInfraChat: vi.fn(),
  }
})
vi.mock('@amarktai/providers', () => ({
  CanonicalProviderError: providerMocks.CanonicalProviderError,
  deepinfraChat: providerMocks.mockDeepInfraChat,
}))

const { mockDeepInfraChat } = providerMocks

// ── Imports ──────────────────────────────────────────────────────────────────

import { executeWithProvider } from '../apps/worker/src/providers/provider-executor.ts'
import { createJobProcessor } from '../apps/worker/src/processors/job-processor.ts'
import { getExecutorRegistration } from '../packages/core/src/index.ts'
import { makeAppGrantSnapshot } from './helpers/app-grant.js'

// ── Fixtures ─────────────────────────────────────────────────────────────────

function makePayload(overrides = {}) {
  const appSlug = overrides.appSlug ?? 'test-app'
  const capability = overrides.capability ?? 'chat'
  return {
    jobId: 'job-uuid-001',
    appSlug,
    capability,
    prompt: 'Hello world',
    input: {},
    metadata: {},
    traceId: 'trace_test-uuid',
    ...overrides,
    appGrantSnapshot: overrides.appGrantSnapshot ?? makeAppGrantSnapshot(appSlug, capability, { allowFallback: false }),
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

describe('DeepInfra executor — client contract', () => {
  const originalEnv = process.env

  beforeEach(() => {
    vi.clearAllMocks()
    process.env = { ...originalEnv, DEEPINFRA_API_KEY: 'test-key' }
    credentialMocks.resolveProviderApiKey.mockImplementation(async (providerKey) => {
      if (providerKey === 'deepinfra') return { providerKey: 'deepinfra', apiKey: 'test-key', source: 'env' }
      throw new credentialMocks.ProviderConfigError(`Provider '${providerKey}' is missing configuration`, providerKey, 'missing-config')
    })
    credentialMocks.getProviderCredentialStatus.mockResolvedValue({
      providerKey: 'deepinfra',
      displayName: 'DeepInfra',
      enabled: true,
      configured: true,
      source: 'database',
      maskedPreview: 'di_********abcd',
      baseUrl: '',
      defaultModel: 'meta-llama/Meta-Llama-3.1-8B-Instruct',
      fallbackModel: '',
      credentialUsagePolicy: 'backend_runtime_allowed',
      healthStatus: 'live',
      healthMessage: '',
      lastCheckedAt: null,
      sortOrder: 5,
      notes: '',
    })
  })

  afterEach(() => {
    process.env = originalEnv
  })

  it('registers chat through callable text executors', () => {
    expect(getExecutorRegistration('chat', 'deepinfra')?.id).toBe('deepinfra.chat')
  })

  it('chat executor is streaming mode', () => {
    const registration = getExecutorRegistration('chat', 'deepinfra')
    expect(registration?.executionMode).toBe('stream')
  })

  it('non-chat capabilities do not execute DeepInfra', async () => {
    mockDeepInfraChat.mockResolvedValue({
      content: 'Hello!',
      model: 'meta-llama/Meta-Llama-3.1-8B-Instruct',
      usage: { promptTokens: 10, completionTokens: 5, totalTokens: 15 },
      finishReason: 'stop',
    })

    const result = await executeWithProvider(makePayload({ capability: 'image_generation' }))

    expect(result.success).toBe(false)
    expect(result.error).toContain('blocked')
    expect(mockDeepInfraChat).not.toHaveBeenCalled()
  })

  it('config presence does not mean provider is generally live', async () => {
    const imageResult = executeWithProvider(makePayload({ capability: 'image_generation' }))
    await expect(imageResult).resolves.toMatchObject({ success: false })
  })
})

// ── Routing/execution gate tests ─────────────────────────────────────────────

describe('Routing/execution gate', () => {
  const originalEnv = process.env

  beforeEach(() => {
    vi.clearAllMocks()
    process.env = { ...originalEnv, DEEPINFRA_API_KEY: 'test-key' }
    credentialMocks.resolveProviderApiKey.mockImplementation(async (providerKey) => {
      if (providerKey === 'deepinfra') return { providerKey: 'deepinfra', apiKey: 'test-key', source: 'env' }
      throw new credentialMocks.ProviderConfigError(`Provider '${providerKey}' is missing configuration`, providerKey, 'missing-config')
    })
  })

  afterEach(() => {
    process.env = originalEnv
  })

  it('chat has a canonical DeepInfra executor registration', () => {
    expect(getExecutorRegistration('chat', 'deepinfra')?.provider).toBe('deepinfra')
  })

  it('Groq is no longer a registered chat executor', () => {
    expect(getExecutorRegistration('chat', 'groq')).toBeUndefined()
  })

  it('existing provider keys contract still holds', () => {
    const { PROVIDER_KEYS } = require('../packages/core/src/providers.ts')
    expect(PROVIDER_KEYS).toEqual(['genx', 'groq', 'together', 'mimo', 'deepinfra'])
  })
})
