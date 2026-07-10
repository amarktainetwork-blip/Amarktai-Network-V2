/**
 * GenX music execution contract tests.
 *
 * Mirrors the proven genx-video-execution-contract.test.js patterns.
 * Tests provider routing, override blocking, artifact persistence,
 * error diagnostics, provider job ID retention, retry safety,
 * and artifact idempotency.
 *
 * The brain router is mocked to allow music_generation through,
 * since the model catalogue marks music as planned/executable-false
 * per the instruction not to change readiness in this slice.
 */

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
  genxSubmitMusic: vi.fn(),
  genxPollMusic: vi.fn(),
  genxDownloadMusic: vi.fn(),
  resolveGenxVideoModel: vi.fn((request = {}) => {
    const available = request.providerAvailableModels ?? []
    if (request.model?.trim()) return request.model.trim()
    if (request.providerDefaultModel?.trim() && available.includes(request.providerDefaultModel.trim())) {
      return request.providerDefaultModel.trim()
    }
    return available.find((model) => !model.toLowerCase().includes('avatar')) ?? request.providerDefaultModel ?? 'seedance-v1-fast'
  }),
  resolveGenxMusicModel: vi.fn((request = {}) => {
    const available = request.providerAvailableModels ?? []
    if (request.model?.trim()) return request.model.trim()
    if (request.providerDefaultModel?.trim() && available.includes(request.providerDefaultModel.trim())) {
      return request.providerDefaultModel.trim()
    }
    return available.find((model) => model.toLowerCase().includes('lyria'))
      ?? request.providerDefaultModel
      ?? 'lyria-3-clip-preview'
  }),
  GENX_MUSIC_POLL_INTERVAL_MS: 0,
  GENX_MUSIC_POLL_MAX_ATTEMPTS: 3,
}))

const artifactMocks = vi.hoisted(() => ({
  saveArtifact: vi.fn(),
  findCompletedArtifactByTraceId: vi.fn(),
}))

const coreMocks = vi.hoisted(() => ({
  isValidMimeForType: vi.fn((type, mime) => {
    const allowed = {
      music: ['audio/mpeg', 'audio/wav', 'audio/ogg', 'audio/flac'],
      video: ['video/mp4', 'video/webm', 'video/quicktime', 'video/x-msvideo'],
    }
    return allowed[type]?.includes(mime) ?? false
  }),
  routeBrain: vi.fn((request) => ({
    selectedProvider: 'genx',
    selectedModel: 'lyria-3-clip-preview',
    routingMode: request.routingMode ?? 'balanced',
    executionAllowed: true,
    candidateModels: [],
    discoveredCandidates: [],
    docsFallbackCandidates: [],
    liveDiscoveredCandidates: [],
    executableCandidates: [],
    catalogueOnlyCandidates: [],
    blockedCandidates: [],
    policyRestrictedCandidates: [],
    missingEndpointShapeCandidates: [],
    missingRequestShapeCandidates: [],
    missingResponseShapeCandidates: [],
    missingArtifactPathCandidates: [],
    missingExecutorCandidates: [],
    providerClientMissingCandidates: [],
    modelDiscoverySource: [],
    transportProfileCandidates: [],
    upstreamProviderBreakdown: {},
    rejectedCandidates: [],
    fallbackChain: [],
    blockReason: null,
    truth: 'Brain Router v1 selected genx/lyria-3-clip-preview for music_generation in balanced mode.',
    appFacingProviderOverride: false,
    appFacingModelOverride: false,
  })),
}))

const prismaMock = vi.hoisted(() => ({
  job: {
    findUnique: vi.fn(),
    update: vi.fn(),
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
vi.mock('@amarktai/core', async () => {
  const actual = await vi.importActual('../packages/core/src/index.ts')
  return { ...actual, ...coreMocks }
})

import { executeWithProvider } from '../apps/worker/src/providers/provider-executor.ts'
import { PROVIDER_KEYS } from '../packages/core/src/index.ts'

const ORIGINAL_ENV = process.env

function makePayload(overrides = {}) {
  return {
    jobId: 'job-genx-music-001',
    appSlug: 'runtime-proof-genx-music',
    capability: 'music_generation',
    prompt: 'A gentle ambient piano melody for meditation',
    input: { genre: 'ambient', instrumental: true },
    metadata: {},
    traceId: 'trace-genx-music-001',
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
    defaultModel: 'lyria-3-clip-preview',
    fallbackModel: '',
    healthStatus: 'live',
    healthMessage: 'GenX key validated against Router models endpoint. Music completion proof pending. Models seen: lyria-3-clip-preview, lyria-3-pro-preview.',
    lastCheckedAt: null,
    sortOrder: 1,
    notes: '',
    ...overrides,
  })
}

function mockSuccessfulMusicFlow() {
  providerMocks.genxSubmitMusic.mockResolvedValue({
    jobId: 'genx-remote-job-001',
    status: 'pending',
    model: 'lyria-3-clip-preview',
  })
  providerMocks.genxPollMusic.mockResolvedValue({
    jobId: 'genx-remote-job-001',
    status: 'completed',
    progress: 100,
    resultUrl: 'https://query.genx.sh/api/v1/jobs/genx-remote-job-001/file',
  })
  providerMocks.genxDownloadMusic.mockResolvedValue({
    audioBuffer: Buffer.from('audio-bytes'),
    mimeType: 'audio/mpeg',
    duration: 60,
    model: 'lyria-3-clip-preview',
    metadata: { downloaded: true, sizeBytes: 11, authenticated: true },
  })
  artifactMocks.saveArtifact.mockResolvedValue({
    id: 'artifact-music-001',
    storagePath: 'artifacts/runtime-proof-genx-music/music/proof.mp3',
    storageUrl: '/api/v1/artifacts/artifact-music-001/file',
    mimeType: 'audio/mpeg',
    fileSizeBytes: 11,
  })
}

describe('GenX music executor', () => {
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
    prismaMock.job.findUnique.mockResolvedValue({ metadataJson: '{}' })
    prismaMock.job.update.mockResolvedValue({})
    mockSuccessfulMusicFlow()
  })

  afterEach(() => {
    process.env = ORIGINAL_ENV
  })

  it('routes music_generation only to GenX', async () => {
    const result = await executeWithProvider(makePayload())

    expect(result.success).toBe(true)
    expect(result.provider).toBe('genx')
    expect(result.model).toBe('lyria-3-clip-preview')
    expect(providerMocks.genxSubmitMusic).toHaveBeenCalledTimes(1)
  })

  it('rejects provider overrides from the caller', async () => {
    const result = await executeWithProvider(makePayload({
      input: { genre: 'ambient', instrumental: true, provider: 'groq' },
    }))

    expect(result.success).toBe(true)
    expect(result.provider).toBe('genx')
    expect(providerMocks.genxSubmitMusic).toHaveBeenCalled()
  })

  it('rejects model overrides from the caller', async () => {
    const result = await executeWithProvider(makePayload({
      input: { genre: 'ambient', instrumental: true, model: 'custom-music-model' },
    }))

    expect(result.success).toBe(true)
    expect(result.provider).toBe('genx')
  })

  it('does not select MiMo for music_generation', async () => {
    const result = await executeWithProvider(makePayload())
    expect(result.provider).not.toBe('mimo')
    expect(PROVIDER_KEYS).toContain('mimo')
  })

  it('does not select Qwen for music_generation', async () => {
    const result = await executeWithProvider(makePayload())
    expect(result.provider).not.toBe('qwen')
    expect(PROVIDER_KEYS).not.toContain('qwen')
  })

  it('saves a music artifact with correct capability/provider/job metadata', async () => {
    const result = await executeWithProvider(makePayload())

    expect(artifactMocks.saveArtifact).toHaveBeenCalledWith(expect.objectContaining({
      input: expect.objectContaining({
        type: 'music',
        subType: 'music_generation',
        provider: 'genx',
        model: 'lyria-3-clip-preview',
        metadata: expect.objectContaining({
          capability: 'music_generation',
          providerJobId: 'genx-remote-job-001',
          model: 'lyria-3-clip-preview',
          duration: 60,
        }),
      }),
      data: Buffer.from('audio-bytes'),
      explicitMimeType: 'audio/mpeg',
    }))

    const output = JSON.parse(result.output)
    expect(output).toMatchObject({
      artifactId: 'artifact-music-001',
      artifactUrl: '/api/v1/artifacts/artifact-music-001/file',
      mimeType: 'audio/mpeg',
      fileSizeBytes: 11,
      duration: 60,
      providerJobId: 'genx-remote-job-001',
      selectedModel: 'lyria-3-clip-preview',
    })
  })

  it('retains provider job ID in output metadata', async () => {
    const result = await executeWithProvider(makePayload())

    expect(result.metadata.providerJobId).toBe('genx-remote-job-001')
    expect(result.metadata.selectedModel).toBe('lyria-3-clip-preview')
  })

  it('returns safe GenX failure diagnostics without leaking the API key', async () => {
    providerMocks.genxSubmitMusic.mockRejectedValueOnce(
      new Error('GenX music submit error 500: Internal Server Error genx-secret-key'),
    )

    const result = await executeWithProvider(makePayload())

    expect(result.success).toBe(false)
    expect(result.provider).toBe('genx')
    expect(result.model).toBe('lyria-3-clip-preview')
    expect(result.error).toContain('provider=genx')
    expect(result.error).toContain('selectedModel=lyria-3-clip-preview')
    expect(result.error).toContain('[redacted]')
    expect(result.error).not.toContain('genx-secret-key')
  })

  it('marks execution failed when artifact persistence fails', async () => {
    // Override the default successful mock with a rejection for this test only
    artifactMocks.saveArtifact.mockReset()
    artifactMocks.saveArtifact.mockRejectedValue(new Error('Disk full'))

    const result = await executeWithProvider(makePayload())

    expect(result.success).toBe(false)
    expect(result.status).toBe('failed')
    expect(result.error).toContain('Disk full')
    expect(result.provider).toBe('genx')
  })

  it('rejects empty audio buffer from GenX', async () => {
    providerMocks.genxDownloadMusic.mockResolvedValueOnce({
      audioBuffer: Buffer.alloc(0),
      mimeType: 'audio/mpeg',
      duration: 0,
      model: 'lyria-3-clip-preview',
      metadata: {},
    })

    const result = await executeWithProvider(makePayload())

    expect(result.success).toBe(false)
    expect(result.error).toContain('empty audio data')
  })

  it('rejects invalid MIME type for music artifact', async () => {
    coreMocks.isValidMimeForType.mockReturnValueOnce(false)

    const result = await executeWithProvider(makePayload())

    expect(result.success).toBe(false)
    expect(result.error).toContain('unsupported MIME type')
  })

  it('keeps the approved provider set unchanged', () => {
    expect(PROVIDER_KEYS).toEqual(['genx', 'groq', 'together', 'mimo', 'deepinfra'])
  })

  // ── Retry / Idempotency Tests ──────────────────────────────────────────

  it('persists remote provider job ID immediately after submit', async () => {
    await executeWithProvider(makePayload())

    expect(prismaMock.job.update).toHaveBeenCalledWith(
      expect.objectContaining({
        where: { id: 'job-genx-music-001' },
        data: expect.objectContaining({
          metadataJson: expect.stringContaining('genx-remote-job-001'),
        }),
      }),
    )
  })

  it('resumes from persisted remote job ID instead of submitting again', async () => {
    // Simulate a retry: metadata already has a remote job ID
    prismaMock.job.findUnique.mockResolvedValue({
      metadataJson: JSON.stringify({ genxProviderJobId: 'genx-remote-job-existing' }),
    })

    const result = await executeWithProvider(makePayload())

    expect(result.success).toBe(true)
    // Submit should NOT be called — we resume from existing remote job
    expect(providerMocks.genxSubmitMusic).not.toHaveBeenCalled()
    // Poll should use the existing remote job ID
    expect(providerMocks.genxPollMusic).toHaveBeenCalledWith(
      'genx-remote-job-existing',
      expect.any(Object),
    )
  })

  it('retry does not call submit a second time when remote ID is persisted', async () => {
    prismaMock.job.findUnique.mockResolvedValue({
      metadataJson: JSON.stringify({ genxProviderJobId: 'genx-remote-job-resume' }),
    })

    await executeWithProvider(makePayload())
    await executeWithProvider(makePayload())

    // Submit should never be called — both runs resume from persisted ID
    expect(providerMocks.genxSubmitMusic).not.toHaveBeenCalled()
    expect(providerMocks.genxPollMusic).toHaveBeenCalledTimes(2)
  })

  it('returns existing completed artifact on retry without re-executing', async () => {
    artifactMocks.findCompletedArtifactByTraceId.mockResolvedValueOnce({
      id: 'artifact-existing',
      appSlug: 'runtime-proof-genx-music',
      type: 'music',
      subType: 'music_generation',
      traceId: 'trace-genx-music-001',
      storageUrl: '/api/v1/artifacts/artifact-existing/file',
      mimeType: 'audio/mpeg',
      fileSizeBytes: 1024,
      status: 'completed',
    })

    const result = await executeWithProvider(makePayload())

    expect(result.success).toBe(true)
    expect(result.artifactId).toBe('artifact-existing')
    // No provider calls should happen
    expect(providerMocks.genxSubmitMusic).not.toHaveBeenCalled()
    expect(providerMocks.genxPollMusic).not.toHaveBeenCalled()
    expect(artifactMocks.saveArtifact).not.toHaveBeenCalled()
    // Output should indicate reuse
    const output = JSON.parse(result.output)
    expect(output.reused).toBe(true)
  })

  it('does not save artifact twice when completed artifact already exists', async () => {
    artifactMocks.findCompletedArtifactByTraceId.mockResolvedValueOnce({
      id: 'artifact-dedup',
      storageUrl: '/api/v1/artifacts/artifact-dedup/file',
      mimeType: 'audio/mpeg',
      fileSizeBytes: 512,
      status: 'completed',
    })

    await executeWithProvider(makePayload())

    expect(artifactMocks.saveArtifact).not.toHaveBeenCalled()
  })

  it('fails safely when metadata persistence fails after submit', async () => {
    // Submit succeeds but metadata update fails
    providerMocks.genxSubmitMusic.mockResolvedValue({
      jobId: 'genx-remote-job-orphan',
      status: 'pending',
      model: 'lyria-3-clip-preview',
    })
    prismaMock.job.update.mockRejectedValueOnce(new Error('DB write failed'))

    const result = await executeWithProvider(makePayload())

    expect(result.success).toBe(false)
    expect(result.error).toContain('local state persistence failed')
    expect(result.error).toContain('genx-remote-job-orphan')
    // Submit was called once, but we did NOT proceed to poll
    expect(providerMocks.genxSubmitMusic).toHaveBeenCalledTimes(1)
    expect(providerMocks.genxPollMusic).not.toHaveBeenCalled()
  })

  it('handles malformed metadataJson gracefully', async () => {
    prismaMock.job.findUnique.mockResolvedValue({ metadataJson: 'not-json{{' })

    const result = await executeWithProvider(makePayload())

    // Should still work — falls back to empty metadata, submits fresh
    expect(result.success).toBe(true)
    expect(providerMocks.genxSubmitMusic).toHaveBeenCalledTimes(1)
  })

  it('marks terminal provider failure honestly', async () => {
    providerMocks.genxPollMusic.mockResolvedValue({
      jobId: 'genx-remote-job-fail',
      status: 'failed',
      progress: 0,
      error: 'GenX resource limit exceeded',
    })

    const result = await executeWithProvider(makePayload())

    expect(result.success).toBe(false)
    expect(result.error).toContain('providerStatus=failed')
    expect(result.error).toContain('GenX resource limit exceeded')
    expect(result.provider).toBe('genx')
  })

  it('no secret appears in persisted metadata', async () => {
    await executeWithProvider(makePayload())

    const updateCall = prismaMock.job.update.mock.calls.find(
      (call) => typeof call[0]?.data?.metadataJson === 'string',
    )
    expect(updateCall).toBeDefined()
    expect(updateCall[0].data.metadataJson).not.toContain('genx-secret-key')
    expect(updateCall[0].data.metadataJson).not.toContain('Bearer')
  })

  it('poll failure retries transient errors before giving up', async () => {
    providerMocks.genxPollMusic
      .mockRejectedValueOnce(new Error('GenX music poll failed; httpStatus=500; body=timeout'))
      .mockResolvedValueOnce({
        jobId: 'genx-remote-job-transient',
        status: 'completed',
        progress: 100,
      })
    providerMocks.genxDownloadMusic.mockResolvedValue({
      audioBuffer: Buffer.from('audio-bytes'),
      mimeType: 'audio/mpeg',
      duration: 30,
      model: 'lyria-3-clip-preview',
      metadata: {},
    })

    const result = await executeWithProvider(makePayload())

    expect(result.success).toBe(true)
    expect(providerMocks.genxPollMusic).toHaveBeenCalledTimes(2)
  })
})
