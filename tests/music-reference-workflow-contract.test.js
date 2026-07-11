import { beforeEach, describe, expect, it, vi } from 'vitest'
import Fastify from 'fastify'

const dbMocks = vi.hoisted(() => ({
  listProviderCredentialStatuses: vi.fn(),
  prisma: {
    job: {
      findMany: vi.fn(),
      create: vi.fn(),
    },
    artifact: {
      findMany: vi.fn(),
      findUnique: vi.fn(),
      update: vi.fn(),
    },
  },
}))

const artifactMocks = vi.hoisted(() => ({
  saveArtifact: vi.fn(),
}))

const queueMocks = vi.hoisted(() => {
  const add = vi.fn()
  return {
    add,
    Queue: vi.fn(() => ({ add })),
  }
})

vi.mock('@amarktai/db', () => dbMocks)
vi.mock('@amarktai/artifacts', () => artifactMocks)
vi.mock('bullmq', () => ({ Queue: queueMocks.Queue }))

import { adminMusicRoutes } from '../apps/api/src/routes/admin-music.ts'
import { MAX_REFERENCE_AUDIO_BYTES } from '../packages/core/src/index.ts'

function makeApp() {
  const app = Fastify()
  app.decorate('jwtVerify', async (token) => {
    if (token === 'admin-token') return { role: 'admin', sub: 'admin-user-001' }
    throw new Error('bad token')
  })
  app.decorate('redis', {})
  return app
}

function mockConfiguredProviders() {
  dbMocks.listProviderCredentialStatuses.mockResolvedValue([
    {
      providerKey: 'genx',
      enabled: true,
      runtimeEnabled: true,
      configured: true,
      source: 'database',
      healthStatus: 'live',
      healthMessage: 'Models seen: lyria-3-clip-preview, lyria-3-pro-preview.',
      lastCheckedAt: null,
      defaultModel: 'lyria-3-clip-preview',
      fallbackModel: '',
      credentialUsagePolicy: 'backend_runtime_allowed',
    },
  ])
  dbMocks.prisma.job.findMany.mockResolvedValue([])
  dbMocks.prisma.artifact.findMany.mockResolvedValue([])
}

function multipartPayload({
  file = Buffer.from([1, 2, 3, 4]),
  filename = 'reference.mp3',
  mimeType = 'audio/mpeg',
  fields = {},
} = {}) {
  const boundary = `----amarktai-${Math.random().toString(16).slice(2)}`
  const chunks = []
  for (const [name, value] of Object.entries(fields)) {
    chunks.push(Buffer.from(`--${boundary}\r\nContent-Disposition: form-data; name="${name}"\r\n\r\n${String(value)}\r\n`))
  }
  chunks.push(Buffer.from(`--${boundary}\r\nContent-Disposition: form-data; name="file"; filename="${filename}"\r\nContent-Type: ${mimeType}\r\n\r\n`))
  chunks.push(Buffer.isBuffer(file) ? file : Buffer.from(file))
  chunks.push(Buffer.from(`\r\n--${boundary}--\r\n`))
  return {
    payload: Buffer.concat(chunks),
    headers: { 'content-type': `multipart/form-data; boundary=${boundary}` },
  }
}

function legalUploadPayload(options = {}) {
  return multipartPayload({
    ...options,
    fields: {
      durationSeconds: '30',
      rights: JSON.stringify({
        accepted: true,
        basis: 'own',
        statement: 'I own this uploaded reference recording.',
      }),
      ...(options.fields ?? {}),
    },
  })
}

describe('music reference-track workflow contract', () => {
  beforeEach(() => {
    vi.clearAllMocks()
    mockConfiguredProviders()
    artifactMocks.saveArtifact.mockResolvedValue({
      id: 'reference-artifact-001',
      storagePath: 'artifacts/admin-music/audio/reference.mp3',
      storageUrl: '/api/v1/artifacts/reference-artifact-001/file',
      mimeType: 'audio/mpeg',
      fileSizeBytes: 4,
    })
    dbMocks.prisma.artifact.update.mockResolvedValue({})
  })

  it('uploads legal reference audio through artifact storage with rights and checksum metadata', async () => {
    const app = makeApp()
    await app.register(adminMusicRoutes)
    await app.ready()

    const upload = legalUploadPayload()
    const response = await app.inject({
      method: 'POST',
      url: '/api/admin/music/reference-audio',
      headers: { authorization: 'Bearer admin-token', ...upload.headers },
      payload: upload.payload,
    })

    expect(response.statusCode).toBe(201)
    const body = response.json()
    expect(body.artifactId).toBe('reference-artifact-001')
    expect(body.referenceAudioAnalysisReady).toBe(true)
    expect(body.referenceAudioConditioningReady).toBe(false)
    expect(body.checksumSha256).toMatch(/^[a-f0-9]{64}$/)
    expect(body).not.toHaveProperty('storagePath')
    expect(artifactMocks.saveArtifact).toHaveBeenCalledWith(expect.objectContaining({
      input: expect.objectContaining({
        appSlug: 'admin-music',
        type: 'audio',
        subType: 'music_reference',
        metadata: expect.objectContaining({
          rightsBasis: 'own',
          uploader: 'admin-user-001',
          directReferenceAudioConditioningReady: false,
        }),
      }),
    }))

    await app.close()
  })

  it('accepts a normal audio upload larger than the default JSON body limit', async () => {
    const app = makeApp()
    await app.register(adminMusicRoutes)
    await app.ready()

    const upload = legalUploadPayload({ file: Buffer.alloc(1024 * 1024 + 512, 7) })
    const response = await app.inject({
      method: 'POST',
      url: '/api/admin/music/reference-audio',
      headers: { authorization: 'Bearer admin-token', ...upload.headers },
      payload: upload.payload,
    })

    expect(response.statusCode).toBe(201)
    expect(artifactMocks.saveArtifact.mock.calls[0][0].data.length).toBe(1024 * 1024 + 512)

    await app.close()
  })

  it('rejects reference upload without an accepted rights declaration', async () => {
    const app = makeApp()
    await app.register(adminMusicRoutes)
    await app.ready()

    const upload = multipartPayload({
      fields: {
        durationSeconds: '30',
        rights: JSON.stringify({
          accepted: false,
          basis: 'license',
          statement: 'I might have permission.',
        }),
      },
    })
    const response = await app.inject({
      method: 'POST',
      url: '/api/admin/music/reference-audio',
      headers: { authorization: 'Bearer admin-token', ...upload.headers },
      payload: upload.payload,
    })

    expect(response.statusCode).toBe(400)
    expect(response.json().message).toContain('rights declaration')
    expect(artifactMocks.saveArtifact).not.toHaveBeenCalled()

    await app.close()
  })

  it('rejects non-audio reference uploads before artifact storage', async () => {
    const app = makeApp()
    await app.register(adminMusicRoutes)
    await app.ready()

    const upload = legalUploadPayload({ filename: 'reference.png', mimeType: 'image/png' })
    const response = await app.inject({
      method: 'POST',
      url: '/api/admin/music/reference-audio',
      headers: { authorization: 'Bearer admin-token', ...upload.headers },
      payload: upload.payload,
    })

    expect(response.statusCode).toBe(400)
    expect(response.json().message).toContain('audio MIME')
    expect(artifactMocks.saveArtifact).not.toHaveBeenCalled()

    await app.close()
  })

  it('rejects over-duration reference uploads before artifact storage', async () => {
    const app = makeApp()
    await app.register(adminMusicRoutes)
    await app.ready()

    const upload = legalUploadPayload({ fields: { durationSeconds: '301' } })
    const response = await app.inject({
      method: 'POST',
      url: '/api/admin/music/reference-audio',
      headers: { authorization: 'Bearer admin-token', ...upload.headers },
      payload: upload.payload,
    })

    expect(response.statusCode).toBe(400)
    expect(response.json().message).toContain('durationSeconds')
    expect(artifactMocks.saveArtifact).not.toHaveBeenCalled()

    await app.close()
  })

  it('rejects oversized binary reference uploads before artifact storage', async () => {
    const app = makeApp()
    await app.register(adminMusicRoutes)
    await app.ready()

    const upload = legalUploadPayload({ file: Buffer.alloc(MAX_REFERENCE_AUDIO_BYTES + 1, 1) })
    const response = await app.inject({
      method: 'POST',
      url: '/api/admin/music/reference-audio',
      headers: { authorization: 'Bearer admin-token', ...upload.headers },
      payload: upload.payload,
    })

    expect(response.statusCode).toBe(413)
    expect(response.json().message).toContain('exceeds')
    expect(artifactMocks.saveArtifact).not.toHaveBeenCalled()

    await app.close()
  })

  it('rejects encoded JSON upload requests instead of accepting base64 transport', async () => {
    const app = makeApp()
    await app.register(adminMusicRoutes)
    await app.ready()

    const response = await app.inject({
      method: 'POST',
      url: '/api/admin/music/reference-audio',
      headers: { authorization: 'Bearer admin-token' },
      payload: {
        filename: 'reference.mp3',
        mimeType: 'audio/mpeg',
        dataBase64: Buffer.alloc(1024 * 1024 + 128).toString('base64'),
        durationSeconds: 30,
        rights: {
          accepted: true,
          basis: 'own',
          statement: 'I own this upload.',
        },
      },
    })

    expect([413, 415]).toContain(response.statusCode)
    expect(artifactMocks.saveArtifact).not.toHaveBeenCalled()

    await app.close()
  })

  it('rejects cross-app reference artifact before queue/provider execution', async () => {
    dbMocks.prisma.artifact.findUnique.mockResolvedValue({
      id: 'reference-other-app',
      appSlug: 'other-app',
      status: 'completed',
      mimeType: 'audio/mpeg',
      fileSizeBytes: 1234,
      metadata: JSON.stringify({
        rightsDeclaration: { accepted: true, basis: 'license' },
      }),
    })

    const app = makeApp()
    await app.register(adminMusicRoutes)
    await app.ready()

    const response = await app.inject({
      method: 'POST',
      url: '/api/admin/music/generate',
      headers: { authorization: 'Bearer admin-token' },
      payload: {
        prompt: 'Original instrumental',
        instrumentalOnly: true,
        referenceAudioArtifactId: 'reference-other-app',
      },
    })

    expect(response.statusCode).toBe(400)
    expect(response.json().details).toContain('does not belong to this app')
    expect(dbMocks.prisma.job.create).not.toHaveBeenCalled()
    expect(queueMocks.add).not.toHaveBeenCalled()

    await app.close()
  })

  it.each([
    ['instrumentalOnly=false', { prompt: 'Original pop track', instrumentalOnly: false }],
    ['vocalsRequested=true', { prompt: 'Original pop track', instrumentalOnly: true, vocalsRequested: true }],
    ['lyrics supplied', { prompt: 'Original pop track', instrumentalOnly: true, lyrics: 'A simple original line' }],
  ])('blocks %s before job creation or queue submission', async (_label, payload) => {
    const app = makeApp()
    await app.register(adminMusicRoutes)
    await app.ready()

    const response = await app.inject({
      method: 'POST',
      url: '/api/admin/music/generate',
      headers: { authorization: 'Bearer admin-token' },
      payload,
    })

    expect([400, 409]).toContain(response.statusCode)
    const body = response.json()
    expect(body.details || body.message).toMatch(/vocals_not_proven|vocalsRequested|Lyrics/)
    expect(dbMocks.prisma.job.create).not.toHaveBeenCalled()
    expect(queueMocks.add).not.toHaveBeenCalled()

    await app.close()
  })
})
