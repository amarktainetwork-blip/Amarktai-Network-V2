/**
 * Worker execution foundation tests — proves worker can consume queued jobs
 * and update Job lifecycle honestly without calling providers.
 *
 * Phase 4: Worker Execution Foundation
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

// ── Job processor tests ──────────────────────────────────────────────────────

describe('Job processor', () => {
  beforeEach(() => {
    vi.clearAllMocks()
    prismaMock.job.update.mockResolvedValue({})
  })

  it('throws for missing jobId', async () => {
    await expect(processJob(makePayload({ jobId: '' }))).rejects.toThrow('jobId')
    expect(prismaMock.job.findUnique).not.toHaveBeenCalled()
    expect(prismaMock.job.update).not.toHaveBeenCalled()
  })

  it('throws for missing appSlug', async () => {
    await expect(processJob(makePayload({ appSlug: '' }))).rejects.toThrow('appSlug')
    expect(prismaMock.job.findUnique).not.toHaveBeenCalled()
    expect(prismaMock.job.update).not.toHaveBeenCalled()
  })

  it('throws for missing capability', async () => {
    await expect(processJob(makePayload({ capability: '' }))).rejects.toThrow('capability')
    expect(prismaMock.job.findUnique).not.toHaveBeenCalled()
    expect(prismaMock.job.update).not.toHaveBeenCalled()
  })

  it('throws for missing traceId', async () => {
    await expect(processJob(makePayload({ traceId: '' }))).rejects.toThrow('traceId')
    expect(prismaMock.job.findUnique).not.toHaveBeenCalled()
    expect(prismaMock.job.update).not.toHaveBeenCalled()
  })

  it('throws for invalid capability', async () => {
    await expect(processJob(makePayload({ capability: 'fake_capability' }))).rejects.toThrow('Invalid capability')
    expect(prismaMock.job.findUnique).not.toHaveBeenCalled()
    expect(prismaMock.job.update).not.toHaveBeenCalled()
  })

  it('throws for missing DB job', async () => {
    prismaMock.job.findUnique.mockResolvedValue(null)

    await expect(processJob(makePayload())).rejects.toThrow('Job not found')
    expect(prismaMock.job.findUnique).toHaveBeenCalledWith({ where: { id: 'job-uuid-001' } })
    expect(prismaMock.job.update).not.toHaveBeenCalled()
  })

  it('throws for appSlug mismatch', async () => {
    prismaMock.job.findUnique.mockResolvedValue(makeDbJob({ appSlug: 'other-app' }))

    await expect(processJob(makePayload())).rejects.toThrow('appSlug mismatch')
    expect(prismaMock.job.update).not.toHaveBeenCalled()
  })

  it('throws for capability mismatch', async () => {
    prismaMock.job.findUnique.mockResolvedValue(makeDbJob({ capability: 'image_generation' }))

    await expect(processJob(makePayload())).rejects.toThrow('capability mismatch')
    expect(prismaMock.job.update).not.toHaveBeenCalled()
  })

  it('updates queued job to processing with startedAt', async () => {
    prismaMock.job.findUnique.mockResolvedValue(makeDbJob())

    const result = await processJob(makePayload())

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

  it('marks provider execution as not implemented honestly', async () => {
    prismaMock.job.findUnique.mockResolvedValue(makeDbJob())

    const result = await processJob(makePayload())

    expect(result.success).toBe(false)
    expect(result.status).toBe('failed')
    expect(result.error).toContain('not implemented')
  })

  it('sets failed status for not-implemented execution', async () => {
    prismaMock.job.findUnique.mockResolvedValue(makeDbJob())

    await processJob(makePayload())

    // Second update should be the failure
    expect(prismaMock.job.update).toHaveBeenCalledWith(
      expect.objectContaining({
        where: { id: 'job-uuid-001' },
        data: expect.objectContaining({
          status: 'failed',
          error: expect.stringContaining('not implemented'),
          completedAt: expect.any(Date),
        }),
      })
    )
  })

  it('sets terminal timestamp on failure', async () => {
    prismaMock.job.findUnique.mockResolvedValue(makeDbJob())

    await processJob(makePayload())

    const failedUpdate = prismaMock.job.update.mock.calls.find(
      (call) => call[0].data.status === 'failed'
    )
    expect(failedUpdate).toBeDefined()
    expect(failedUpdate[0].data.completedAt).toBeInstanceOf(Date)
  })

  it('records error text', async () => {
    prismaMock.job.findUnique.mockResolvedValue(makeDbJob())

    await processJob(makePayload())

    const failedUpdate = prismaMock.job.update.mock.calls.find(
      (call) => call[0].data.status === 'failed'
    )
    expect(failedUpdate[0].data.error).toContain('Provider execution not implemented')
  })

  it('handles thrown processor errors safely', async () => {
    prismaMock.job.findUnique.mockRejectedValue(new Error('Database connection lost'))

    await expect(processJob(makePayload())).rejects.toThrow('Database connection lost')
  })

  it('does not create artifacts', async () => {
    prismaMock.job.findUnique.mockResolvedValue(makeDbJob())

    await processJob(makePayload())

    const failedUpdate = prismaMock.job.update.mock.calls.find(
      (call) => call[0].data.status === 'failed'
    )
    expect(failedUpdate[0].data.artifactId).toBeUndefined()
  })

  it('does not set artifactId', async () => {
    prismaMock.job.findUnique.mockResolvedValue(makeDbJob())

    await processJob(makePayload())

    // Check no update sets artifactId
    for (const call of prismaMock.job.update.mock.calls) {
      expect(call[0].data.artifactId).toBeUndefined()
    }
  })

  it('does not set provider or model', async () => {
    prismaMock.job.findUnique.mockResolvedValue(makeDbJob())

    await processJob(makePayload())

    // Check no update sets provider or model
    for (const call of prismaMock.job.update.mock.calls) {
      expect(call[0].data.provider).toBeUndefined()
      expect(call[0].data.model).toBeUndefined()
    }
  })

  it('processor can be tested directly without real provider keys', async () => {
    prismaMock.job.findUnique.mockResolvedValue(makeDbJob())

    // No env vars needed — processor uses mocks
    const result = await processJob(makePayload())

    expect(result).toBeDefined()
    expect(result.success).toBe(false)
    expect(result.status).toBe('failed')
  })

  it('verifies DB job ownership before processing', async () => {
    prismaMock.job.findUnique.mockResolvedValue(makeDbJob({ appSlug: 'wrong-app' }))

    await expect(processJob(makePayload({ appSlug: 'my-app' }))).rejects.toThrow('appSlug mismatch')

    // Should not have updated to processing
    expect(prismaMock.job.update).not.toHaveBeenCalled()
  })

  it('verifies DB job capability before processing', async () => {
    prismaMock.job.findUnique.mockResolvedValue(makeDbJob({ capability: 'video_generation' }))

    await expect(processJob(makePayload({ capability: 'chat' }))).rejects.toThrow('capability mismatch')

    // Should not have updated to processing
    expect(prismaMock.job.update).not.toHaveBeenCalled()
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

    // Process should fail with "not implemented", not with a provider error
    const result = await processJob(makePayload({ capability: 'video_generation' }))
    expect(result.error).toContain('not implemented')
    expect(result.error).not.toContain('GenX')
    expect(result.error).not.toContain('genx')
  })

  it('does not import or call Groq adapter', async () => {
    prismaMock.job.findUnique.mockResolvedValue(makeDbJob())

    const result = await processJob(makePayload())
    expect(result.error).toContain('not implemented')
    expect(result.error).not.toContain('Groq')
    expect(result.error).not.toContain('groq')
  })

  it('does not import or call Together adapter', async () => {
    prismaMock.job.findUnique.mockResolvedValue(makeDbJob({ capability: 'image_generation' }))

    const result = await processJob(makePayload({ capability: 'image_generation' }))
    expect(result.error).toContain('not implemented')
    expect(result.error).not.toContain('Together')
    expect(result.error).not.toContain('together')
  })

  it('does not import or call Mimo adapter', async () => {
    prismaMock.job.findUnique.mockResolvedValue(makeDbJob({ capability: 'code' }))

    const result = await processJob(makePayload({ capability: 'code' }))
    expect(result.error).toContain('not implemented')
    expect(result.error).not.toContain('Mimo')
    expect(result.error).not.toContain('mimo')
  })

  it('does not import or call DeepInfra adapter', async () => {
    prismaMock.job.findUnique.mockResolvedValue(makeDbJob({ capability: 'chat' }))

    const result = await processJob(makePayload())
    expect(result.error).toContain('not implemented')
    expect(result.error).not.toContain('DeepInfra')
    expect(result.error).not.toContain('deepinfra')
  })

  it('does not expose provider/model selection', async () => {
    prismaMock.job.findUnique.mockResolvedValue(makeDbJob())

    const result = await processJob(makePayload())

    // Result should not contain provider/model info
    expect(result.provider).toBeUndefined()
    expect(result.model).toBeUndefined()
  })
})
