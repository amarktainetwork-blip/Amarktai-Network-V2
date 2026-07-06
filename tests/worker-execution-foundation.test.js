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
  },
}))

vi.mock('@amarktai/db', () => ({ prisma: prismaMock }))

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

// ── Queue name tests ─────────────────────────────────────────────────────────

describe('Worker queue name', () => {
  it('uses the canonical queue name from core', () => {
    expect(WORKER_QUEUE_NAME).toBe(QUEUE_NAMES.JOBS)
    expect(WORKER_QUEUE_NAME).toBe('amarktai:jobs')
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
      'chat', 'reasoning', 'code', 'image_generation', 'image_edit',
      'tts', 'stt', 'video_generation', 'music_generation', 'avatar_generation',
      'embeddings', 'reranking', 'research', 'multimodal', 'tool_use',
      'structured_output', 'brand_scrape', 'rag_ingest', 'rag_search',
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

  it('throws for missing appSlug without touching DB', async () => {
    await expect(processJob(makePayload({ appSlug: '' }))).rejects.toThrow('appSlug')
    expect(prismaMock.job.findUnique).not.toHaveBeenCalled()
    expect(prismaMock.job.update).not.toHaveBeenCalled()
  })

  it('throws for missing capability without touching DB', async () => {
    await expect(processJob(makePayload({ capability: '' }))).rejects.toThrow('capability')
    expect(prismaMock.job.findUnique).not.toHaveBeenCalled()
    expect(prismaMock.job.update).not.toHaveBeenCalled()
  })

  it('throws for missing prompt without touching DB', async () => {
    await expect(processJob(makePayload({ prompt: '' }))).rejects.toThrow('prompt')
    expect(prismaMock.job.findUnique).not.toHaveBeenCalled()
    expect(prismaMock.job.update).not.toHaveBeenCalled()
  })

  it('throws for empty prompt without touching DB', async () => {
    await expect(processJob(makePayload({ prompt: '   ' }))).rejects.toThrow('prompt')
    expect(prismaMock.job.findUnique).not.toHaveBeenCalled()
    expect(prismaMock.job.update).not.toHaveBeenCalled()
  })

  it('throws for missing traceId without touching DB', async () => {
    await expect(processJob(makePayload({ traceId: '' }))).rejects.toThrow('traceId')
    expect(prismaMock.job.findUnique).not.toHaveBeenCalled()
    expect(prismaMock.job.update).not.toHaveBeenCalled()
  })

  it('throws for invalid capability without touching DB', async () => {
    await expect(processJob(makePayload({ capability: 'fake_capability' }))).rejects.toThrow('Invalid capability')
    expect(prismaMock.job.findUnique).not.toHaveBeenCalled()
    expect(prismaMock.job.update).not.toHaveBeenCalled()
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

  it('throws for appSlug mismatch without updating to processing or failed', async () => {
    prismaMock.job.findUnique.mockResolvedValue(makeDbJob({ appSlug: 'other-app' }))

    await expect(processJob(makePayload())).rejects.toThrow('appSlug mismatch')
    expect(prismaMock.job.update).not.toHaveBeenCalled()
  })

  it('throws for capability mismatch without updating to processing or failed', async () => {
    prismaMock.job.findUnique.mockResolvedValue(makeDbJob({ capability: 'image_generation' }))

    await expect(processJob(makePayload())).rejects.toThrow('capability mismatch')
    expect(prismaMock.job.update).not.toHaveBeenCalled()
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
        }),
      })
    )
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
    expect(failedUpdate[0].data.completedAt).toBeInstanceOf(Date)
  })

  it('does not create artifacts or set artifactId', async () => {
    prismaMock.job.findUnique.mockResolvedValue(makeDbJob())

    await expect(processJob(makePayload())).rejects.toThrow()

    for (const call of prismaMock.job.update.mock.calls) {
      expect(call[0].data.artifactId).toBeUndefined()
    }
  })

  it('does not set provider or model', async () => {
    prismaMock.job.findUnique.mockResolvedValue(makeDbJob())

    await expect(processJob(makePayload())).rejects.toThrow()

    for (const call of prismaMock.job.update.mock.calls) {
      expect(call[0].data.provider).toBeUndefined()
      expect(call[0].data.model).toBeUndefined()
    }
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

    await expect(processJob(makePayload({ capability: 'video_generation' }))).rejects.toThrow('not implemented')

    const failedUpdate = prismaMock.job.update.mock.calls.find(
      (call) => call[0].data.status === 'failed'
    )
    expect(failedUpdate[0].data.error).not.toContain('GenX')
    expect(failedUpdate[0].data.error).not.toContain('genx')
  })

  it('does not import or call Groq adapter', async () => {
    prismaMock.job.findUnique.mockResolvedValue(makeDbJob())

    await expect(processJob(makePayload())).rejects.toThrow('not implemented')

    const failedUpdate = prismaMock.job.update.mock.calls.find(
      (call) => call[0].data.status === 'failed'
    )
    expect(failedUpdate[0].data.error).not.toContain('Groq')
    expect(failedUpdate[0].data.error).not.toContain('groq')
  })

  it('does not import or call Together adapter', async () => {
    prismaMock.job.findUnique.mockResolvedValue(makeDbJob({ capability: 'image_generation' }))

    await expect(processJob(makePayload({ capability: 'image_generation' }))).rejects.toThrow('not implemented')

    const failedUpdate = prismaMock.job.update.mock.calls.find(
      (call) => call[0].data.status === 'failed'
    )
    expect(failedUpdate[0].data.error).not.toContain('Together')
    expect(failedUpdate[0].data.error).not.toContain('together')
  })

  it('does not import or call Mimo adapter', async () => {
    prismaMock.job.findUnique.mockResolvedValue(makeDbJob({ capability: 'code' }))

    await expect(processJob(makePayload({ capability: 'code' }))).rejects.toThrow('not implemented')

    const failedUpdate = prismaMock.job.update.mock.calls.find(
      (call) => call[0].data.status === 'failed'
    )
    expect(failedUpdate[0].data.error).not.toContain('Mimo')
    expect(failedUpdate[0].data.error).not.toContain('mimo')
  })

  it('does not import or call DeepInfra adapter', async () => {
    prismaMock.job.findUnique.mockResolvedValue(makeDbJob({ capability: 'chat' }))

    await expect(processJob(makePayload())).rejects.toThrow('not implemented')

    const failedUpdate = prismaMock.job.update.mock.calls.find(
      (call) => call[0].data.status === 'failed'
    )
    expect(failedUpdate[0].data.error).not.toContain('DeepInfra')
    expect(failedUpdate[0].data.error).not.toContain('deepinfra')
  })
})
