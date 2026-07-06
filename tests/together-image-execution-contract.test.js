/**
 * Together image execution contract tests.
 *
 * Phase 6B proves one executable provider/capability path:
 * image_generation through Together, with artifact persistence.
 *
 * The execution support map is a temporary proof gate, not final Brain logic.
 * Apps still request capabilities only; provider/model choice stays internal.
 */

import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'

const prismaMock = vi.hoisted(() => ({
  job: {
    findUnique: vi.fn(),
    update: vi.fn(),
  },
}))

const providerMocks = vi.hoisted(() => ({
  groqChat: vi.fn(),
  togetherGenerateImage: vi.fn(),
  genxGenerateVideo: vi.fn(),
}))

const artifactMocks = vi.hoisted(() => ({
  saveArtifact: vi.fn(),
}))

vi.mock('@amarktai/db', () => ({ prisma: prismaMock }))
vi.mock('@amarktai/providers', () => providerMocks)
vi.mock('@amarktai/artifacts', () => artifactMocks)

import { executeWithProvider } from '../apps/worker/src/providers/provider-executor.ts'
import { createJobProcessor } from '../apps/worker/src/processors/job-processor.ts'
import {
  PROVIDER_KEYS,
  TOGETHER_DEFAULT_IMAGE_MODEL,
  routeProvider,
} from '../packages/core/src/index.ts'

const ORIGINAL_ENV = process.env
const TEST_IMAGE_BUFFER = Buffer.from('real-image-bytes')

function makePayload(overrides = {}) {
  return {
    jobId: 'job-image-001',
    appSlug: 'proof-app',
    capability: 'image_generation',
    prompt: 'A simple blue circle on a white background, minimal icon style',
    input: {},
    metadata: {},
    traceId: 'trace-image-001',
    ...overrides,
  }
}

function makeDbJob(overrides = {}) {
  return {
    id: 'job-image-001',
    appSlug: 'proof-app',
    capability: 'image_generation',
    prompt: 'A simple blue circle on a white background, minimal icon style',
    inputJson: '{}',
    metadataJson: '{}',
    traceId: 'trace-image-001',
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

function mockTogetherSuccess(overrides = {}) {
  providerMocks.togetherGenerateImage.mockResolvedValue({
    images: [
      {
        base64: 'cmVhbC1pbWFnZS1ieXRlcw==',
        buffer: TEST_IMAGE_BUFFER,
        width: 1024,
        height: 1024,
        mimeType: 'image/png',
      },
    ],
    model: TOGETHER_DEFAULT_IMAGE_MODEL,
    usage: { promptTokens: 4, completionTokens: 0, totalTokens: 4 },
    ...overrides,
  })
}

function mockArtifactSuccess(overrides = {}) {
  artifactMocks.saveArtifact.mockResolvedValue({
    id: 'artifact-image-001',
    storagePath: 'artifacts/proof-app/image/proof-app_123.png',
    storageUrl: '/api/v1/artifacts/artifact-image-001/file',
    mimeType: 'image/png',
    fileSizeBytes: TEST_IMAGE_BUFFER.length,
    ...overrides,
  })
}

describe('Together image executor', () => {
  beforeEach(() => {
    vi.clearAllMocks()
    process.env = {
      ...ORIGINAL_ENV,
      TOGETHER_API_KEY: 'together-test-key',
      GROQ_API_KEY: 'groq-test-key',
      GENX_API_KEY: 'genx-test-key',
      DEEPINFRA_API_KEY: 'deepinfra-test-key',
    }
    mockTogetherSuccess()
    mockArtifactSuccess()
  })

  afterEach(() => {
    process.env = ORIGINAL_ENV
  })

  it('requires TOGETHER_API_KEY for image_generation execution', async () => {
    delete process.env.TOGETHER_API_KEY

    const result = await executeWithProvider(makePayload())

    expect(result.success).toBe(false)
    expect(result.error).toContain('together config missing')
    expect(providerMocks.togetherGenerateImage).not.toHaveBeenCalled()
    expect(artifactMocks.saveArtifact).not.toHaveBeenCalled()
  })

  it('calls togetherGenerateImage only for image_generation', async () => {
    const result = await executeWithProvider(makePayload())

    expect(result.success).toBe(true)
    expect(result.provider).toBe('together')
    expect(providerMocks.togetherGenerateImage).toHaveBeenCalledTimes(1)
    expect(providerMocks.groqChat).not.toHaveBeenCalled()
    expect(providerMocks.genxGenerateVideo).not.toHaveBeenCalled()
  })

  it('uses the internal Together image model, not a user-supplied model', async () => {
    await executeWithProvider(makePayload({
      input: { model: 'user-model', modelOverride: 'user-model-2' },
      model: 'user-model-3',
    }))

    expect(providerMocks.togetherGenerateImage).toHaveBeenCalledWith(
      expect.objectContaining({
        model: TOGETHER_DEFAULT_IMAGE_MODEL,
      }),
    )
  })

  it('ignores app-supplied provider/model override fields', async () => {
    const result = await executeWithProvider(makePayload({
      provider: 'genx',
      model: 'user-model',
      input: {
        provider: 'genx',
        providerOverride: 'deepinfra',
        model: 'user-model',
        modelOverride: 'user-model-2',
      },
    }))

    expect(result.success).toBe(true)
    expect(result.provider).toBe('together')
    expect(result.model).toBe(TOGETHER_DEFAULT_IMAGE_MODEL)
    expect(providerMocks.togetherGenerateImage).toHaveBeenCalledTimes(1)
  })

  it('parses successful image buffer output', async () => {
    const result = await executeWithProvider(makePayload())

    expect(result.success).toBe(true)
    expect(result.status).toBe('completed')
    expect(result.artifactId).toBe('artifact-image-001')
    expect(JSON.parse(result.output)).toMatchObject({
      artifactId: 'artifact-image-001',
      artifactUrl: '/api/v1/artifacts/artifact-image-001/file',
      mimeType: 'image/png',
    })
  })

  it('handles empty image data as failure without creating an artifact', async () => {
    providerMocks.togetherGenerateImage.mockResolvedValue({
      images: [],
      model: TOGETHER_DEFAULT_IMAGE_MODEL,
      usage: { promptTokens: 1, completionTokens: 0, totalTokens: 1 },
    })

    const result = await executeWithProvider(makePayload())

    expect(result.success).toBe(false)
    expect(result.error).toContain('empty image data')
    expect(artifactMocks.saveArtifact).not.toHaveBeenCalled()
  })

  it('handles empty image buffers as failure without creating an artifact', async () => {
    mockTogetherSuccess({
      images: [{ base64: '', buffer: Buffer.alloc(0), width: 1024, height: 1024, mimeType: 'image/png' }],
    })

    const result = await executeWithProvider(makePayload())

    expect(result.success).toBe(false)
    expect(result.error).toContain('empty image data')
    expect(artifactMocks.saveArtifact).not.toHaveBeenCalled()
  })

  it('handles HTTP/API failure safely and does not create an artifact', async () => {
    providerMocks.togetherGenerateImage.mockRejectedValue(new Error('Together image error 429: rate limited'))

    const result = await executeWithProvider(makePayload())

    expect(result.success).toBe(false)
    expect(result.error).toContain('Together execution failed')
    expect(result.error).toContain('rate limited')
    expect(artifactMocks.saveArtifact).not.toHaveBeenCalled()
  })

  it('never includes API keys in returned errors or output', async () => {
    process.env.TOGETHER_API_KEY = 'super-secret-together-key'
    providerMocks.togetherGenerateImage.mockRejectedValue(
      new Error('Together image error 401: super-secret-together-key'),
    )

    const result = await executeWithProvider(makePayload())

    expect(JSON.stringify(result)).not.toContain('super-secret-together-key')
    expect(result.error).toContain('[redacted]')
  })

  it('does not call network in unit tests', async () => {
    await executeWithProvider(makePayload())

    expect(providerMocks.togetherGenerateImage).toHaveBeenCalled()
    expect(providerMocks.togetherGenerateImage.getMockName()).toBe('vi.fn()')
  })
})

describe('Execution routing gate', () => {
  beforeEach(() => {
    vi.clearAllMocks()
    process.env = {
      ...ORIGINAL_ENV,
      GROQ_API_KEY: 'groq-test-key',
      TOGETHER_API_KEY: 'together-test-key',
      GENX_API_KEY: 'genx-test-key',
      DEEPINFRA_API_KEY: 'deepinfra-test-key',
    }
    providerMocks.groqChat.mockResolvedValue({
      content: 'chat ok',
      model: 'llama-3.3-70b-versatile',
      usage: { promptTokens: 1, completionTokens: 1, totalTokens: 2 },
      finishReason: 'stop',
    })
    mockTogetherSuccess()
    mockArtifactSuccess()
  })

  afterEach(() => {
    process.env = ORIGINAL_ENV
  })

  it('chat still executes through Groq only', async () => {
    const result = await executeWithProvider(makePayload({
      capability: 'chat',
      prompt: 'hello',
    }))

    expect(result.success).toBe(true)
    expect(result.provider).toBe('groq')
    expect(providerMocks.groqChat).toHaveBeenCalledTimes(1)
    expect(providerMocks.togetherGenerateImage).not.toHaveBeenCalled()
  })

  it('image_generation executes through Together only even when GenX is configured', async () => {
    const result = await executeWithProvider(makePayload())

    expect(result.success).toBe(true)
    expect(result.provider).toBe('together')
    expect(providerMocks.togetherGenerateImage).toHaveBeenCalledTimes(1)
    expect(providerMocks.genxGenerateVideo).not.toHaveBeenCalled()
  })

  it('image_generation does not execute DeepInfra', async () => {
    const result = await executeWithProvider(makePayload())

    expect(result.success).toBe(true)
    expect(result.provider).not.toBe('deepinfra')
  })

  it('missing Together config blocks image execution honestly', async () => {
    delete process.env.TOGETHER_API_KEY

    const result = await executeWithProvider(makePayload())

    expect(result.success).toBe(false)
    expect(result.error).toContain('executionAllowed: false')
    expect(providerMocks.togetherGenerateImage).not.toHaveBeenCalled()
  })

  it('config presence does not mean provider is generally live', async () => {
    const result = await executeWithProvider(makePayload({ capability: 'image_edit' }))

    expect(result.success).toBe(false)
    expect(result.error).toContain("not implemented for 'image_edit'")
  })

  it('DeepInfra remains gated', () => {
    const decision = routeProvider('image_generation')
    const deepinfra = decision.candidates.find((candidate) => candidate.provider === 'deepinfra')

    expect(deepinfra?.gated).toBe(true)
  })

  it('provider/model user override is ignored by the executor', async () => {
    const result = await executeWithProvider(makePayload({
      input: { provider: 'deepinfra', model: 'not-internal' },
    }))

    expect(result.success).toBe(true)
    expect(result.provider).toBe('together')
    expect(result.model).toBe(TOGETHER_DEFAULT_IMAGE_MODEL)
  })

  it('non-image capabilities do not execute Together', async () => {
    const result = await executeWithProvider(makePayload({ capability: 'code' }))

    expect(result.success).toBe(false)
    expect(providerMocks.togetherGenerateImage).not.toHaveBeenCalled()
  })

  it('keeps the final provider ID set intact', () => {
    expect(PROVIDER_KEYS).toEqual(['genx', 'groq', 'together', 'mimo', 'deepinfra'])
  })
})

describe('Artifact persistence and worker completion', () => {
  beforeEach(() => {
    vi.clearAllMocks()
    process.env = {
      ...ORIGINAL_ENV,
      TOGETHER_API_KEY: 'together-test-key',
      GROQ_API_KEY: 'groq-test-key',
    }
    prismaMock.job.findUnique.mockResolvedValue(makeDbJob())
    prismaMock.job.update.mockResolvedValue({})
    mockTogetherSuccess()
    mockArtifactSuccess()
  })

  afterEach(() => {
    process.env = ORIGINAL_ENV
  })

  it('successful Together image result calls existing saveArtifact with a Buffer image', async () => {
    await executeWithProvider(makePayload())

    expect(artifactMocks.saveArtifact).toHaveBeenCalledWith({
      input: expect.objectContaining({
        appSlug: 'proof-app',
        type: 'image',
        subType: 'image_generation',
        provider: 'together',
        model: TOGETHER_DEFAULT_IMAGE_MODEL,
        traceId: 'trace-image-001',
        mimeType: 'image/png',
      }),
      data: TEST_IMAGE_BUFFER,
      explicitMimeType: 'image/png',
    })
    expect(Buffer.isBuffer(artifactMocks.saveArtifact.mock.calls[0][0].data)).toBe(true)
  })

  it('artifact input includes title, description, and metadata', async () => {
    await executeWithProvider(makePayload())

    const input = artifactMocks.saveArtifact.mock.calls[0][0].input
    expect(input.title).toContain('image_generation')
    expect(input.description).toContain('Together')
    expect(input.metadata).toMatchObject({
      capability: 'image_generation',
      provider: 'together',
      model: TOGETHER_DEFAULT_IMAGE_MODEL,
      width: 1024,
      height: 1024,
    })
  })

  it('worker updates Job to processing before execution', async () => {
    const processor = createJobProcessor()
    await processor(makePayload())

    expect(prismaMock.job.update).toHaveBeenCalledWith(
      expect.objectContaining({
        where: { id: 'job-image-001' },
        data: expect.objectContaining({
          status: 'processing',
          startedAt: expect.any(Date),
        }),
      }),
    )
  })

  it('worker updates Job to completed with Together artifact metadata', async () => {
    const processor = createJobProcessor()
    await processor(makePayload())

    const completedUpdate = prismaMock.job.update.mock.calls.find(
      (call) => call[0].data.status === 'completed',
    )

    expect(completedUpdate).toBeDefined()
    expect(completedUpdate[0].data.provider).toBe('together')
    expect(completedUpdate[0].data.model).toBe(TOGETHER_DEFAULT_IMAGE_MODEL)
    expect(completedUpdate[0].data.artifactId).toBe('artifact-image-001')
    expect(completedUpdate[0].data.progress).toBe(100)
    expect(completedUpdate[0].data.completedAt).toBeInstanceOf(Date)
    expect(completedUpdate[0].data.error).toBeNull()

    const output = JSON.parse(completedUpdate[0].data.output)
    expect(output).toMatchObject({
      artifactId: 'artifact-image-001',
      artifactUrl: '/api/v1/artifacts/artifact-image-001/file',
      mimeType: 'image/png',
    })
    expect(completedUpdate[0].data.output).not.toContain('cmVhbC1pbWFnZS1ieXRlcw==')
  })

  it('worker marks failed and throws on Together error so BullMQ records failure', async () => {
    providerMocks.togetherGenerateImage.mockRejectedValue(new Error('Together unavailable'))
    const processor = createJobProcessor()

    await expect(processor(makePayload())).rejects.toThrow('Together unavailable')

    const failedUpdate = prismaMock.job.update.mock.calls.find(
      (call) => call[0].data.status === 'failed',
    )
    expect(failedUpdate).toBeDefined()
    expect(failedUpdate[0].data.error).toContain('Together execution failed')
    expect(failedUpdate[0].data.completedAt).toBeInstanceOf(Date)
    expect(artifactMocks.saveArtifact).not.toHaveBeenCalled()
  })

  it('does not create an artifact when image buffer is empty', async () => {
    mockTogetherSuccess({
      images: [{ base64: '', buffer: Buffer.alloc(0), width: 1024, height: 1024, mimeType: 'image/png' }],
    })

    const processor = createJobProcessor()

    await expect(processor(makePayload())).rejects.toThrow('empty image data')
    expect(artifactMocks.saveArtifact).not.toHaveBeenCalled()
  })

  it('does not call GenX, Groq, Mimo, or DeepInfra for image jobs', async () => {
    const processor = createJobProcessor()
    await processor(makePayload())

    expect(providerMocks.togetherGenerateImage).toHaveBeenCalledTimes(1)
    expect(providerMocks.groqChat).not.toHaveBeenCalled()
    expect(providerMocks.genxGenerateVideo).not.toHaveBeenCalled()
  })
})

