import fs from 'node:fs'
import path from 'node:path'
import { beforeEach, describe, expect, it, vi } from 'vitest'

const prismaMock = vi.hoisted(() => ({
  job: {
    findUnique: vi.fn(),
    update: vi.fn(),
  },
}))

vi.mock('@amarktai/db', () => ({ prisma: prismaMock }))

const { createJobProcessor } = await import('../apps/worker/src/processors/job-processor.ts')

const ROOT = process.cwd()

function schemaText() {
  return fs.readFileSync(path.join(ROOT, 'prisma/schema.prisma'), 'utf8')
}

function modelBlock(modelName) {
  const match = schemaText().match(new RegExp(`model ${modelName} \\{[\\s\\S]*?\\n\\}`))
  if (!match) throw new Error(`Missing model ${modelName}`)
  return match[0]
}

function expectFieldNativeType(block, fieldName, nativeType) {
  const line = block.split('\n').find((item) => item.trim().startsWith(`${fieldName} `))
  expect(line, `${fieldName} should exist`).toBeTruthy()
  expect(line).toContain(nativeType)
}

function makePayload(overrides = {}) {
  return {
    jobId: 'job-media-long-output',
    appSlug: 'proof-app',
    capability: 'image_generation',
    prompt: 'Generate a proof image',
    input: {},
    metadata: {},
    traceId: 'trace-media-long-output',
    ...overrides,
  }
}

function makeDbJob(overrides = {}) {
  return {
    id: 'job-media-long-output',
    appSlug: 'proof-app',
    capability: 'image_generation',
    prompt: 'Generate a proof image',
    inputJson: '{}',
    metadataJson: '{}',
    traceId: 'trace-media-long-output',
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

describe('media output storage schema', () => {
  beforeEach(() => {
    vi.clearAllMocks()
    prismaMock.job.findUnique.mockResolvedValue(makeDbJob())
    prismaMock.job.update.mockResolvedValue({})
  })

  it('widens Job runtime JSON and error fields for provider media metadata', () => {
    const job = modelBlock('Job')

    expectFieldNativeType(job, 'inputJson', '@db.LongText')
    expectFieldNativeType(job, 'metadataJson', '@db.LongText')
    expectFieldNativeType(job, 'output', '@db.LongText')
    expectFieldNativeType(job, 'error', '@db.LongText')
  })

  it('widens Artifact metadata fields used by generated media artifacts', () => {
    const artifact = modelBlock('Artifact')

    expectFieldNativeType(artifact, 'description', '@db.LongText')
    expectFieldNativeType(artifact, 'metadata', '@db.LongText')
    expectFieldNativeType(artifact, 'errorMessage', '@db.LongText')
  })

  it('job processor stores media output metadata longer than the previous MySQL TEXT ceiling', async () => {
    const longMetadata = JSON.stringify({
      artifactId: 'artifact-long-output',
      artifactUrl: `/api/v1/artifacts/artifact-long-output/file?proof=${'x'.repeat(70_000)}`,
      mimeType: 'image/png',
      fileSizeBytes: 123456,
      width: 1024,
      height: 1024,
    })
    const processor = createJobProcessor({
      executeCapability: vi.fn(async () => ({
        success: true,
        status: 'completed',
        provider: 'together',
        model: 'black-forest-labs/FLUX.1-schnell',
        artifactId: 'artifact-long-output',
        output: longMetadata,
        metadata: JSON.parse(longMetadata),
      })),
    })

    await processor(makePayload())

    const completedUpdate = prismaMock.job.update.mock.calls.find(
      (call) => call[0].data.status === 'completed',
    )

    expect(completedUpdate).toBeDefined()
    expect(completedUpdate[0].data.artifactId).toBe('artifact-long-output')
    expect(completedUpdate[0].data.output.length).toBeGreaterThan(65_535)
    expect(JSON.parse(completedUpdate[0].data.output)).toMatchObject({
      artifactId: 'artifact-long-output',
      mimeType: 'image/png',
      width: 1024,
      height: 1024,
    })
  })

  it('deepinfra chat path still stores small text output', async () => {
    prismaMock.job.findUnique.mockResolvedValueOnce(makeDbJob({ capability: 'chat' }))
    const processor = createJobProcessor({
      executeCapability: vi.fn(async () => ({
        success: true,
        status: 'completed',
        provider: 'deepinfra',
        model: 'llama-3.3-70b-versatile',
        output: 'deepinfra Brain runtime proof passed.',
      })),
    })

    await processor(makePayload({ capability: 'chat' }))

    const completedUpdate = prismaMock.job.update.mock.calls.find(
      (call) => call[0].data.status === 'completed',
    )

    expect(completedUpdate[0].data.provider).toBe('deepinfra')
    expect(completedUpdate[0].data.model).toBe('llama-3.3-70b-versatile')
    expect(completedUpdate[0].data.output).toBe('deepinfra Brain runtime proof passed.')
    expect(completedUpdate[0].data.artifactId).toBeUndefined()
  })
})
