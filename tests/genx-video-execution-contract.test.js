import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'

const credentialMocks = vi.hoisted(() => {
  class ProviderConfigError extends Error {
    constructor(message, providerKey = 'genx', code = 'missing-config') {
      super(message)
      this.providerKey = providerKey
      this.code = code
    }
  }

  return {
    ProviderConfigError,
    resolveProviderApiKey: vi.fn(),
    getProviderCredentialStatus: vi.fn(),
  }
})

const providerMocks = vi.hoisted(() => ({
  groqChat: vi.fn(),
  togetherGenerateImage: vi.fn(),
  genxGenerateVideo: vi.fn(),
  genxPollVideo: vi.fn(),
  genxDownloadVideo: vi.fn(),
  resolveGenxVideoModel: vi.fn((request = {}) => {
    const available = request.providerAvailableModels ?? []
    if (request.model?.trim()) return request.model.trim()
    if (request.providerDefaultModel?.trim() && available.includes(request.providerDefaultModel.trim())) {
      return request.providerDefaultModel.trim()
    }
    return available.find((model) => !model.toLowerCase().includes('avatar')) ?? request.providerDefaultModel ?? 'seedance-v1-fast'
  }),
  GENX_POLL_INTERVAL_MS: 0,
  GENX_POLL_MAX_ATTEMPTS: 3,
}))

const artifactMocks = vi.hoisted(() => ({
  saveArtifact: vi.fn(),
  findCompletedArtifactByTraceId: vi.fn(),
}))

const prismaMock = vi.hoisted(() => ({
  aiProvider: {
    findUnique: vi.fn(),
    findMany: vi.fn().mockResolvedValue([
      { providerKey: 'genx', enabled: true, healthStatus: 'live' },
    ]),
  },
  job: {
    findUnique: vi.fn(),
    update: vi.fn(),
    updateMany: vi.fn(),
  },
  usageMeter: {
    upsert: vi.fn(),
  },
  modelRegistryEntry: {
    findMany: vi.fn().mockResolvedValue([
      { provider: 'genx', modelId: 'seedance-v1-fast', displayName: 'Seedance', status: 'active', costTier: 'medium', latencyTier: 'medium', estimatedUnitCost: null, pricingConfidence: 'unknown', supportsVideoGeneration: true },
    ]),
  },
}))

vi.mock('@amarktai/db', () => ({
  ProviderConfigError: credentialMocks.ProviderConfigError,
  getProviderCredentialStatus: credentialMocks.getProviderCredentialStatus,
  resolveProviderApiKey: credentialMocks.resolveProviderApiKey,
  prisma: prismaMock,
}))

vi.mock('@amarktai/providers', () => providerMocks)
vi.mock('@amarktai/artifacts', () => artifactMocks)

import { executeWithProvider } from '../apps/worker/src/providers/provider-executor.ts'
import { PROVIDER_KEYS } from '../packages/core/src/index.ts'

const ORIGINAL_ENV = process.env

function makePayload(overrides = {}) {
  return {
    jobId: 'job-genx-video-001',
    appSlug: 'runtime-proof-genx-video',
    capability: 'video_generation',
    prompt: 'A simple red ball bouncing gently on a white background',
    input: { duration: 4, aspectRatio: '16:9' },
    metadata: {},
    traceId: 'trace-genx-video-001',
    ...overrides,
  }
}

function mockGenxProviderStatus(overrides = {}) {
  credentialMocks.getProviderCredentialStatus.mockResolvedValue({
    providerKey: 'genx',
    displayName: 'GenX',
    enabled: true,
    configured: true,
    source: 'database',
    maskedPreview: 'genx_********test',
    baseUrl: 'https://query.genx.sh',
    defaultModel: 'seedance-v1-fast',
    fallbackModel: '',
    healthStatus: 'live',
    healthMessage: 'GenX key validated against Router models endpoint. Video completion proof still required. Models seen: grok-imagine-video, kling-avatar-v2-pro, kling-v2.5-turbo.',
    lastCheckedAt: null,
    sortOrder: 1,
    notes: '',
    ...overrides,
  })
}

describe('GenX video executor', () => {
  beforeEach(() => {
    vi.clearAllMocks()
    process.env = {
      ...ORIGINAL_ENV,
      GENX_API_KEY: 'genx-test-key',
      GROQ_API_KEY: 'groq-test-key',
      TOGETHER_API_KEY: 'together-test-key',
    }
    credentialMocks.resolveProviderApiKey.mockResolvedValue({
      providerKey: 'genx',
      apiKey: 'genx-secret-key',
      source: 'database',
    })
    mockGenxProviderStatus()
    artifactMocks.findCompletedArtifactByTraceId.mockResolvedValue(null)
    prismaMock.aiProvider.findUnique.mockResolvedValue(null)
    prismaMock.job.updateMany.mockResolvedValue({ count: 1 })
    prismaMock.job.findUnique.mockResolvedValue({ metadataJson: '{}' })
    prismaMock.job.update.mockResolvedValue({})
    prismaMock.usageMeter.upsert.mockResolvedValue({})
    providerMocks.genxGenerateVideo.mockResolvedValue({
      videoBuffer: Buffer.from('video-bytes'),
      mimeType: 'video/mp4',
      duration: 4,
      width: 1280,
      height: 720,
      model: 'grok-imagine-video',
      providerJobId: 'genx-provider-job-001',
      metadata: {
        providerJobId: 'genx-provider-job-001',
        selectedModel: 'grok-imagine-video',
      },
    })
    providerMocks.genxPollVideo.mockResolvedValue({
      jobId: 'genx-provider-job-001',
      status: 'completed',
      progress: 100,
      resultUrl: 'https://query.genx.sh/api/v1/jobs/genx-provider-job-001/file',
      metadata: {},
    })
    providerMocks.genxDownloadVideo.mockResolvedValue({
      videoBuffer: Buffer.from('resumed-video-bytes'),
      mimeType: 'video/mp4',
      duration: 4,
      width: 1280,
      height: 720,
      model: 'grok-imagine-video',
      metadata: { downloaded: true },
    })
    artifactMocks.saveArtifact.mockResolvedValue({
      id: 'artifact-video-001',
      storagePath: 'artifacts/runtime-proof-genx-video/video/proof.mp4',
      storageUrl: '/api/v1/artifacts/artifact-video-001/file',
      mimeType: 'video/mp4',
      fileSizeBytes: 11,
    })
  })

  afterEach(() => {
    process.env = ORIGINAL_ENV
  })

  it('uses discovered Router models instead of an unsupported stale default', async () => {
    const result = await executeWithProvider(makePayload({
      provider: 'together',
      model: 'user-supplied-model',
      input: {
        duration: 4,
        aspectRatio: '16:9',
        provider: 'together',
        model: 'user-supplied-model',
      },
    }))

    expect(result.success).toBe(true)
    expect(result.provider).toBe('genx')
    expect(result.model).toBe('grok-imagine-video')
    expect(providerMocks.resolveGenxVideoModel).toHaveBeenCalledWith({
      model: 'seedance-v1-fast',
      providerDefaultModel: 'seedance-v1-fast',
      providerFallbackModel: '',
      providerAvailableModels: ['grok-imagine-video', 'kling-avatar-v2-pro', 'kling-v2.5-turbo'],
    })
    expect(providerMocks.genxGenerateVideo).toHaveBeenCalledWith(expect.objectContaining({
      model: 'seedance-v1-fast',
      providerDefaultModel: 'seedance-v1-fast',
      providerAvailableModels: ['grok-imagine-video', 'kling-avatar-v2-pro', 'kling-v2.5-turbo'],
    }))
    expect(providerMocks.genxGenerateVideo.mock.calls[0][0].model).toBe('seedance-v1-fast')
  })

  it('saves a video artifact and returns provider job metadata in output', async () => {
    const result = await executeWithProvider(makePayload())

    expect(artifactMocks.saveArtifact).toHaveBeenCalledWith(expect.objectContaining({
      input: expect.objectContaining({
        type: 'video',
        subType: 'video_generation',
        provider: 'genx',
        model: 'grok-imagine-video',
        metadata: expect.objectContaining({
          providerJobId: 'genx-provider-job-001',
          model: 'grok-imagine-video',
          duration: 4,
        }),
      }),
      data: Buffer.from('video-bytes'),
      explicitMimeType: 'video/mp4',
    }))

    const output = JSON.parse(result.output)
    expect(output).toMatchObject({
      artifactId: 'artifact-video-001',
      artifactUrl: '/api/v1/artifacts/artifact-video-001/file',
      mimeType: 'video/mp4',
      fileSizeBytes: 11,
      width: 1280,
      height: 720,
      duration: 4,
      providerJobId: 'genx-provider-job-001',
      selectedModel: 'grok-imagine-video',
    })
  })

  it('resumes an existing GenX remote job without submitting a duplicate provider request', async () => {
    prismaMock.job.findUnique
      .mockResolvedValueOnce({ metadataJson: '{}' }) // Orchestra metadata call
      .mockResolvedValueOnce({
        metadataJson: JSON.stringify({
          genxProviderJobId: 'genx-remote-resume-001',
          genxProviderModel: 'grok-imagine-video',
        }),
      })

    const result = await executeWithProvider(makePayload())

    expect(result.success).toBe(true)
    expect(providerMocks.genxGenerateVideo).not.toHaveBeenCalled()
    expect(providerMocks.genxPollVideo).toHaveBeenCalledWith('genx-remote-resume-001', expect.objectContaining({
      apiKey: 'genx-secret-key',
      baseUrl: 'https://query.genx.sh',
      pollAttempt: 1,
    }))
    expect(providerMocks.genxDownloadVideo).toHaveBeenCalledWith('https://query.genx.sh/api/v1/jobs/genx-provider-job-001/file', expect.objectContaining({
      apiKey: 'genx-secret-key',
      baseUrl: 'https://query.genx.sh',
      model: 'grok-imagine-video',
    }))
    expect(artifactMocks.saveArtifact).toHaveBeenCalledWith(expect.objectContaining({
      data: Buffer.from('resumed-video-bytes'),
    }))
    const output = JSON.parse(result.output)
    expect(output.providerJobId).toBe('genx-remote-resume-001')
  })

  it('blocks provider submission when cancellation wins before the provider claim', async () => {
    prismaMock.job.findUnique
      .mockResolvedValueOnce({ metadataJson: '{}' }) // Orchestra metadata call
      .mockResolvedValueOnce({ metadataJson: '{}' }) // claimMusicExecution stale check
      .mockResolvedValueOnce({ providerClaimAt: null, status: 'cancelled' }) // claim check
    prismaMock.job.updateMany.mockResolvedValueOnce({ count: 0 })

    const result = await executeWithProvider(makePayload())

    expect(result.success).toBe(false)
    expect(result.error).toContain('not execution-eligible: cancelled')
    expect(providerMocks.genxGenerateVideo).not.toHaveBeenCalled()
    expect(providerMocks.genxPollVideo).not.toHaveBeenCalled()
  })

  it('returns safe GenX failure diagnostics without leaking the API key', async () => {
    providerMocks.genxGenerateVideo.mockRejectedValueOnce(
      new Error('GenX poll failed for providerJobId=job-remote; model=grok-imagine-video; pollAttempt=41; httpStatus=500; body=Internal Server Error genx-secret-key'),
    )

    const result = await executeWithProvider(makePayload())

    expect(result.success).toBe(false)
    expect(result.provider).toBe('genx')
    expect(result.model).toBe('seedance-v1-fast')
    expect(result.error).toContain('provider=genx')
    expect(result.error).toContain('selectedModel=seedance-v1-fast')
    expect(result.error).toContain('providerJobId=job-remote')
    expect(result.error).toContain('pollAttempt=41')
    expect(result.error).toContain('httpStatus=500')
    expect(result.error).toContain('[redacted]')
    expect(result.error).not.toContain('genx-secret-key')
  })

  it('keeps the approved provider set unchanged', () => {
    expect(PROVIDER_KEYS).toEqual(['genx', 'groq', 'together', 'mimo', 'deepinfra'])
  })
})
