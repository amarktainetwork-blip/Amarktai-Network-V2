/**
 * Worker execution foundation tests — proves worker can consume queued jobs
 * and update Job lifecycle honestly without calling providers.
 *
 * Phase 4: Worker Execution Foundation (tightened)
 */

import { describe, expect, it, vi, beforeEach } from 'vitest'

// ── Mock Prisma ──────────────────────────────────────────────────────────────

const prismaMock = vi.hoisted(() => ({
  job: {
    findUnique: vi.fn(),
    update: vi.fn(),
    updateMany: vi.fn(),
  },
  modelRegistryEntry: {
    findMany: vi.fn().mockResolvedValue([
      { provider: 'groq', modelId: 'llama-3.3-70b-versatile', displayName: 'Llama 3.3 70B', status: 'active', costTier: 'low', latencyTier: 'low', estimatedUnitCost: 0.0001, pricingConfidence: 'known', supportsChat: true },
    ]),
  },
  aiProvider: {
    findMany: vi.fn().mockResolvedValue([
      { providerKey: 'groq', enabled: true, healthStatus: 'live' },
    ]),
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
    getProviderCredentialStatus: vi.fn(),
    resolveProviderApiKey: vi.fn(async (providerKey) => {
      throw new ProviderConfigError(`Provider '${providerKey}' is missing configuration`, providerKey, 'missing-config')
    }),
  }
})

vi.mock('@amarktai/db', () => ({
  prisma: prismaMock,
  refreshLongFormParentState: vi.fn(async () => null),
  ProviderConfigError: credentialMocks.ProviderConfigError,
  getProviderCredentialStatus: credentialMocks.getProviderCredentialStatus,
  resolveProviderApiKey: credentialMocks.resolveProviderApiKey,
}))

// ── Import processor ──────────────────────────────────────────────────────────

import {
  processJob,
  createJobProcessor,
  validatePayload,
  WORKER_QUEUE_NAME,
} from '../apps/worker/src/processors/job-processor.ts'

import { QUEUE_NAMES } from '../packages/core/src/index.ts'

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
    createdAt: new Date('2026-07-04T10:00:00Z'),
    startedAt: null,
    completedAt: null,
    updatedAt: new Date('2026-07-04T10:00:00Z'),
    ...overrides,
  }
}

beforeEach(() => {
  prismaMock.job.update.mockResolvedValue({})
  prismaMock.job.updateMany.mockImplementation(async (args) => {
    prismaMock.job.update({ where: { id: args.where.id }, data: args.data })
    return { count: 1 }
  })
})

// ── Queue name tests ─────────────────────────────────────────────────────────

describe('Worker queue name', () => {
  it('uses the canonical queue name from core', () => {
    expect(WORKER_QUEUE_NAME).toBe(QUEUE_NAMES.JOBS)
    expect(WORKER_QUEUE_NAME).toBe('amarktai-jobs')
  })

  it('queue names do not contain colons (BullMQ safe)', () => {
    expect(QUEUE_NAMES.JOBS).not.toContain(':')
    expect(QUEUE_NAMES.RETRY).not.toContain(':')
  })
})

// ── Payload validation tests ─────────────────────────────────────────────────

describe('Worker payload validation', () => {
  it('accepts valid payload', () => {
    expect(validatePayload(makePayload())).toBeNull()
  })

  it('rejects missing jobId', () => {
    expect(validatePayload(makePayload({ jobId: '' }))).toContain('jobId')
  })

  it('rejects missing appSlug', () => {
    expect(validatePayload(makePayload({ appSlug: '' }))).toContain('appSlug')
  })

  it('rejects missing capability', () => {
    expect(validatePayload(makePayload({ capability: '' }))).toContain('capability')
  })

  it('rejects missing prompt', () => {
    expect(validatePayload(makePayload({ prompt: '' }))).toContain('prompt')
  })

  it('rejects empty prompt', () => {
    expect(validatePayload(makePayload({ prompt: '   ' }))).toContain('prompt')
  })

  it('rejects missing traceId', () => {
    expect(validatePayload(makePayload({ traceId: '' }))).toContain('traceId')
  })

  it('rejects invalid capability', () => {
    expect(validatePayload(makePayload({ capability: 'fake_capability' }))).toContain('Invalid capability')
  })

  it('accepts all valid capability keys', () => {
    const validCaps = [
      'chat', 'streaming_chat', 'reasoning', 'code', 'summarization', 'translation',
      'question_answering', 'classification', 'zero_shot_classification', 'extraction',
      'token_classification', 'fill_mask', 'feature_extraction', 'sentence_similarity',
      'table_qa', 'structured_output', 'tool_use',
      'image_generation', 'image_edit', 'image_to_image', 'image_upscale',
      'image_classification', 'object_detection', 'image_segmentation', 'depth_estimation',
      'keypoint_detection', 'visual_question_answering', 'document_qa', 'ocr',
      'zero_shot_object_detection', 'mask_generation', 'visual_document_retrieval',
      'video_generation', 'image_to_video', 'video_to_video', 'long_form_video',
      'video_understanding', 'video_classification', 'storyboard_generation',
      'subtitle_generation', 'lip_sync', 'avatar_generation', 'text_to_3d', 'image_to_3d',
      'tts', 'stt', 'voice_clone', 'voice_conversion', 'text_to_audio', 'audio_to_audio',
      'audio_classification', 'voice_activity_detection', 'music_generation', 'song_generation',
      'embeddings', 'reranking', 'rag_ingest', 'rag_search', 'research', 'brand_scrape',
      'document_ingest', 'campaign_generation', 'social_content_generation',
      'adult_text', 'adult_image', 'adult_voice', 'adult_avatar', 'adult_video',
    ]
    for (const cap of validCaps) {
      expect(validatePayload(makePayload({ capability: cap })), `${cap} should be valid`).toBeNull()
    }
  })
})

// ── Job processor — validation rejection tests ───────────────────────────────

describe('Job processor — validation rejects before DB', () => {
  beforeEach(() => {
    vi.clearAllMocks()
  })

  it('throws for missing jobId without touching DB', async () => {
    await expect(processJob(makePayload({ jobId: '' }))).rejects.toThrow('jobId')
    expect(prismaMock.job.findUnique).not.toHaveBeenCalled()
    expect(prismaMock.job.update).not.toHaveBeenCalled()
  })

  it('hydrates old minimal payloads from the DB row before validation', async () => {
    const mockExecute = vi.fn().mockResolvedValue({
      success: true,
      status: 'completed',
      output: 'hydrated ok',
    })
    const processor = createJobProcessor({ executeCapability: mockExecute })
    prismaMock.job.update.mockResolvedValue({})
    prismaMock.job.findUnique.mockResolvedValue(makeDbJob({
      appSlug: 'dashboard-studio',
      capability: 'image_generation',
      prompt: 'Studio image prompt',
      inputJson: '{"prompt":"Studio image prompt","width":1024}',
      metadataJson: '{"source":"studio"}',
      callbackUrl: null,
    }))

    await processor({ jobId: 'job-uuid-001' })

    expect(mockExecute).toHaveBeenCalledWith(expect.objectContaining({
      jobId: 'job-uuid-001',
      appSlug: 'dashboard-studio',
      capability: 'image_generation',
      prompt: 'Studio image prompt',
      input: { prompt: 'Studio image prompt', width: 1024 },
      metadata: { source: 'studio' },
      traceId: expect.stringMatching(/^trace_/),
    }))
  })

  it('malformed payload with jobId updates DB job to failed', async () => {
    prismaMock.job.update.mockResolvedValue({})
    prismaMock.job.findUnique.mockResolvedValue(null)

    await expect(processJob(makePayload({ appSlug: '' }))).rejects.toThrow('appSlug')
    expect(prismaMock.job.findUnique).toHaveBeenCalledWith({ where: { id: 'job-uuid-001' } })
    expect(prismaMock.job.update).toHaveBeenCalledWith(expect.objectContaining({
      where: { id: 'job-uuid-001' },
      data: expect.objectContaining({
        status: 'failed',
        error: 'Missing required field: appSlug',
        completedAt: expect.any(Date),
      }),
    }))
  })

  it('missing capability with jobId updates DB job to failed when hydration cannot fix it', async () => {
    prismaMock.job.update.mockResolvedValue({})
    prismaMock.job.findUnique.mockResolvedValue(null)

    await expect(processJob(makePayload({ capability: '' }))).rejects.toThrow('capability')
    expect(prismaMock.job.update).toHaveBeenCalledWith(expect.objectContaining({
      where: { id: 'job-uuid-001' },
      data: expect.objectContaining({ status: 'failed', error: 'Missing required field: capability' }),
    }))
  })

  it('missing prompt with jobId updates DB job to failed when hydration cannot fix it', async () => {
    prismaMock.job.update.mockResolvedValue({})
    prismaMock.job.findUnique.mockResolvedValue(null)

    await expect(processJob(makePayload({ prompt: '' }))).rejects.toThrow('prompt')
    expect(prismaMock.job.update).toHaveBeenCalledWith(expect.objectContaining({
      where: { id: 'job-uuid-001' },
      data: expect.objectContaining({ status: 'failed', error: 'Missing required field: prompt' }),
    }))
  })

  it('missing traceId with jobId is hydrated instead of failing when the DB row is valid', async () => {
    const mockExecute = vi.fn().mockResolvedValue({ success: true, status: 'completed' })
    const processor = createJobProcessor({ executeCapability: mockExecute })
    prismaMock.job.update.mockResolvedValue({})
    prismaMock.job.findUnique.mockResolvedValue(makeDbJob())

    await processor(makePayload({ traceId: '' }))

    expect(mockExecute).toHaveBeenCalledWith(expect.objectContaining({
      traceId: expect.stringMatching(/^trace_/),
    }))
  })

  it('invalid capability with jobId updates DB job to failed', async () => {
    prismaMock.job.update.mockResolvedValue({})
    await expect(processJob(makePayload({ capability: 'fake_capability' }))).rejects.toThrow('Invalid capability')
    expect(prismaMock.job.update).toHaveBeenCalledWith(expect.objectContaining({
      where: { id: 'job-uuid-001' },
      data: expect.objectContaining({ status: 'failed', error: 'Invalid capability: fake_capability' }),
    }))
  })
})

// ── Job processor — DB ownership/mismatch tests ──────────────────────────────

describe('Job processor — DB ownership rejects without mutation', () => {
  beforeEach(() => {
    vi.clearAllMocks()
  })

  it('throws for missing DB job without updating', async () => {
    prismaMock.job.findUnique.mockResolvedValue(null)

    await expect(processJob(makePayload())).rejects.toThrow('Job not found')
    expect(prismaMock.job.findUnique).toHaveBeenCalledWith({ where: { id: 'job-uuid-001' } })
    expect(prismaMock.job.update).not.toHaveBeenCalled()
  })

  it('throws for appSlug mismatch and marks DB job failed', async () => {
    prismaMock.job.update.mockResolvedValue({})
    prismaMock.job.findUnique.mockResolvedValue(makeDbJob({ appSlug: 'other-app' }))

    await expect(processJob(makePayload())).rejects.toThrow('appSlug mismatch')
    expect(prismaMock.job.update).toHaveBeenCalledWith(expect.objectContaining({
      where: { id: 'job-uuid-001' },
      data: expect.objectContaining({ status: 'failed', error: expect.stringContaining('appSlug mismatch') }),
    }))
  })

  it('throws for capability mismatch and marks DB job failed', async () => {
    prismaMock.job.update.mockResolvedValue({})
    prismaMock.job.findUnique.mockResolvedValue(makeDbJob({ capability: 'image_generation' }))

    await expect(processJob(makePayload())).rejects.toThrow('capability mismatch')
    expect(prismaMock.job.update).toHaveBeenCalledWith(expect.objectContaining({
      where: { id: 'job-uuid-001' },
      data: expect.objectContaining({ status: 'failed', error: expect.stringContaining('capability mismatch') }),
    }))
  })
})

// ── Job processor — execution lifecycle tests ────────────────────────────────

describe('Job processor — execution lifecycle', () => {
  beforeEach(() => {
    vi.clearAllMocks()
    prismaMock.job.update.mockResolvedValue({})
  })

  it('updates queued job to processing with startedAt', async () => {
    prismaMock.job.findUnique.mockResolvedValue(makeDbJob())

    await expect(processJob(makePayload())).rejects.toThrow()

    expect(prismaMock.job.update).toHaveBeenCalledWith(
      expect.objectContaining({
        where: { id: 'job-uuid-001' },
        data: expect.objectContaining({
          status: 'processing',
          startedAt: expect.any(Date),
          completedAt: null,
          error: null,
          progress: 0,
        }),
      })
    )
  })

  it('skips cancelled jobs without calling the provider or converting them to failed', async () => {
    const mockExecute = vi.fn().mockResolvedValue({ success: true, status: 'completed', output: 'nope' })
    const processor = createJobProcessor({ executeCapability: mockExecute })
    prismaMock.job.findUnique.mockResolvedValue(makeDbJob({ status: 'cancelled' }))

    const result = await processor(makePayload())

    expect(result.metadata?.skipped).toBe(true)
    expect(mockExecute).not.toHaveBeenCalled()
    expect(prismaMock.job.updateMany).not.toHaveBeenCalledWith(expect.objectContaining({
      data: expect.objectContaining({ status: 'failed' }),
    }))
  })

  it('does not overwrite a job cancelled after provider execution starts', async () => {
    const mockExecute = vi.fn().mockResolvedValue({ success: true, status: 'completed', output: 'late artifact' })
    const processor = createJobProcessor({ executeCapability: mockExecute })
    prismaMock.job.findUnique.mockResolvedValue(makeDbJob())
    prismaMock.job.updateMany
      .mockResolvedValueOnce({ count: 1 })
      .mockResolvedValueOnce({ count: 0 })

    const result = await processor(makePayload())

    expect(mockExecute).toHaveBeenCalled()
    expect(result.metadata?.skippedTerminalOverwrite).toBe(true)
    expect(prismaMock.job.updateMany).toHaveBeenNthCalledWith(2, expect.objectContaining({
      where: { id: 'job-uuid-001', status: 'processing' },
      data: expect.objectContaining({ status: 'completed' }),
    }))
  })

  it('clears stale completion fields when a retry starts processing', async () => {
    prismaMock.job.findUnique.mockResolvedValue(makeDbJob({
      status: 'failed',
      error: 'old failure',
      completedAt: new Date('2026-07-04T11:00:00Z'),
      provider: 'genx',
      model: 'old-model',
      output: '{"stale":true}',
      artifactId: 'old-artifact',
    }))

    await expect(processJob(makePayload())).rejects.toThrow()

    const processingUpdate = prismaMock.job.update.mock.calls.find(
      (call) => call[0].data.status === 'processing'
    )
    expect(processingUpdate[0].data).toEqual(expect.objectContaining({
      completedAt: null,
      error: null,
      progress: 0,
    }))
  })

  it('not-implemented execution fails DB job then throws for BullMQ', async () => {
    prismaMock.job.findUnique.mockResolvedValue(makeDbJob())

    // processJob must throw so BullMQ records failure
    await expect(processJob(makePayload())).rejects.toThrow('not implemented')

    // DB job must be updated to failed
    const failedUpdate = prismaMock.job.update.mock.calls.find(
      (call) => call[0].data.status === 'failed'
    )
    expect(failedUpdate).toBeDefined()
    expect(failedUpdate[0].data.error).toContain('not implemented')
    expect(failedUpdate[0].data.status).toBe('failed')
    expect(failedUpdate[0].data.completedAt).toBeInstanceOf(Date)
  })

  it('does not create artifacts or set artifactId', async () => {
    prismaMock.job.findUnique.mockResolvedValue(makeDbJob())

    await expect(processJob(makePayload())).rejects.toThrow()

    const failedUpdate = prismaMock.job.update.mock.calls.find(
      (call) => call[0].data.status === 'failed'
    )
    expect(failedUpdate[0].data.artifactId).toBeUndefined()
  })

  it('does not set provider or model', async () => {
    prismaMock.job.findUnique.mockResolvedValue(makeDbJob())

    await expect(processJob(makePayload())).rejects.toThrow()

    const failedUpdate = prismaMock.job.update.mock.calls.find(
      (call) => call[0].data.status === 'failed'
    )
    expect(failedUpdate[0].data.provider).toBeNull()
    expect(failedUpdate[0].data.model).toBeNull()
  })
})

// ── Job processor — injectable execution tests ───────────────────────────────

describe('Job processor — injectable execution', () => {
  beforeEach(() => {
    vi.clearAllMocks()
    prismaMock.job.update.mockResolvedValue({})
  })

  it('uses injected executeCapability via createJobProcessor', async () => {
    const mockExecute = vi.fn().mockResolvedValue({
      success: false,
      status: 'failed',
      error: 'Custom not-implemented message',
    })

    const processor = createJobProcessor({ executeCapability: mockExecute })
    prismaMock.job.findUnique.mockResolvedValue(makeDbJob())

    await expect(processor(makePayload())).rejects.toThrow('Custom not-implemented message')

    // executeCapability was called with the payload
    expect(mockExecute).toHaveBeenCalledWith(makePayload())

    // DB job was updated to failed
    const failedUpdate = prismaMock.job.update.mock.calls.find(
      (call) => call[0].data.status === 'failed'
    )
    expect(failedUpdate).toBeDefined()
    expect(failedUpdate[0].data.error).toBe('Custom not-implemented message')
  })

  it('failed execution stores provider and model when execution returns them', async () => {
    const mockExecute = vi.fn().mockResolvedValue({
      success: false,
      status: 'failed',
      error: 'GenX video download error 401',
      provider: 'genx',
      model: 'seedance-v1-fast',
    })

    const processor = createJobProcessor({ executeCapability: mockExecute })
    prismaMock.job.findUnique.mockResolvedValue(makeDbJob({ capability: 'video_generation' }))

    await expect(processor(makePayload({ capability: 'video_generation' }))).rejects.toThrow('GenX video download error 401')

    const failedUpdate = prismaMock.job.update.mock.calls.find(
      (call) => call[0].data.status === 'failed'
    )
    expect(failedUpdate).toBeDefined()
    expect(failedUpdate[0].data).toEqual(expect.objectContaining({
      status: 'failed',
      error: 'GenX video download error 401',
      provider: 'genx',
      model: 'seedance-v1-fast',
      progress: 0,
      completedAt: expect.any(Date),
    }))
  })

  it('injected execution that throws after processing updates DB to failed', async () => {
    const mockExecute = vi.fn().mockRejectedValue(new Error('Execution exploded'))

    const processor = createJobProcessor({ executeCapability: mockExecute })
    prismaMock.job.findUnique.mockResolvedValue(makeDbJob())

    await expect(processor(makePayload())).rejects.toThrow('Execution exploded')

    // DB job was updated to failed
    const failedUpdate = prismaMock.job.update.mock.calls.find(
      (call) => call[0].data.status === 'failed'
    )
    expect(failedUpdate).toBeDefined()
    expect(failedUpdate[0].data.error).toBe('Execution exploded')
    expect(failedUpdate[0].data.completedAt).toBeInstanceOf(Date)
  })

  it('injected execution that succeeds completes the job', async () => {
    const mockExecute = vi.fn().mockResolvedValue({
      success: true,
      status: 'completed',
    })

    const processor = createJobProcessor({ executeCapability: mockExecute })
    prismaMock.job.findUnique.mockResolvedValue(makeDbJob())

    const result = await processor(makePayload())

    expect(result.success).toBe(true)

    // DB job was updated to completed
    const completedUpdate = prismaMock.job.update.mock.calls.find(
      (call) => call[0].data.status === 'completed'
    )
    expect(completedUpdate).toBeDefined()
    expect(completedUpdate[0].data.progress).toBe(100)
    expect(completedUpdate[0].data.completedAt).toBeInstanceOf(Date)
  })

  it('default processor uses not-implemented placeholder', async () => {
    prismaMock.job.findUnique.mockResolvedValue(makeDbJob())

    await expect(processJob(makePayload())).rejects.toThrow('not implemented')
  })
})

// ── Provider non-execution tests ─────────────────────────────────────────────

describe('Worker does not call providers', () => {
  beforeEach(() => {
    vi.clearAllMocks()
    prismaMock.job.update.mockResolvedValue({})
  })

  it('does not import or call GenX adapter', async () => {
    prismaMock.job.findUnique.mockResolvedValue(makeDbJob({ capability: 'video_generation' }))

    await expect(processJob(makePayload({ capability: 'video_generation' }))).rejects.toThrow('blocked')

    const failedUpdate = prismaMock.job.update.mock.calls.find(
      (call) => call[0].data.status === 'failed'
    )
    expect(failedUpdate[0].data.error).not.toContain('genxGenerateVideo')
    expect(failedUpdate[0].data.error).not.toContain('API call')
  })

  it('does not import or call Groq adapter', async () => {
    prismaMock.job.findUnique.mockResolvedValue(makeDbJob())

    await expect(processJob(makePayload())).rejects.toThrow('blocked')

    const failedUpdate = prismaMock.job.update.mock.calls.find(
      (call) => call[0].data.status === 'failed'
    )
    expect(failedUpdate[0].data.error).not.toContain('groqChat')
    expect(failedUpdate[0].data.error).not.toContain('API call')
  })

  it('does not import or call Together adapter', async () => {
    prismaMock.job.findUnique.mockResolvedValue(makeDbJob({ capability: 'image_generation' }))

    await expect(processJob(makePayload({ capability: 'image_generation' }))).rejects.toThrow('blocked')

    const failedUpdate = prismaMock.job.update.mock.calls.find(
      (call) => call[0].data.status === 'failed'
    )
    expect(failedUpdate[0].data.error).not.toContain('togetherGenerateImage')
    expect(failedUpdate[0].data.error).not.toContain('API call')
  })

  it('does not import or call Mimo adapter', async () => {
    prismaMock.job.findUnique.mockResolvedValue(makeDbJob({ capability: 'code' }))

    await expect(processJob(makePayload({ capability: 'code' }))).rejects.toThrow(/not implemented|Orchestra blocked/)

    const failedUpdate = prismaMock.job.update.mock.calls.find(
      (call) => call[0].data.status === 'failed'
    )
    expect(failedUpdate[0].data.error).not.toContain('adapter')
    expect(failedUpdate[0].data.error).not.toContain('API call')
  })

  it('does not import or call DeepInfra adapter', async () => {
    prismaMock.job.findUnique.mockResolvedValue(makeDbJob({ capability: 'chat' }))

    await expect(processJob(makePayload())).rejects.toThrow('not implemented')

    const failedUpdate = prismaMock.job.update.mock.calls.find(
      (call) => call[0].data.status === 'failed'
    )
    expect(failedUpdate[0].data.error).not.toContain('adapter')
    expect(failedUpdate[0].data.error).not.toContain('API call')
  })
})
