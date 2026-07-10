import { beforeEach, describe, expect, it, vi } from 'vitest'
import Fastify from 'fastify'

const dbMocks = vi.hoisted(() => ({
  listProviderCredentialStatuses: vi.fn(),
  prisma: {
    job: {
      findMany: vi.fn(),
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

vi.mock('@amarktai/db', () => dbMocks)
vi.mock('@amarktai/artifacts', () => artifactMocks)

import { adminMusicRoutes } from '../apps/api/src/routes/admin-music.ts'

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

    const response = await app.inject({
      method: 'POST',
      url: '/api/admin/music/reference-audio',
      headers: { authorization: 'Bearer admin-token' },
      payload: {
        filename: 'reference.mp3',
        mimeType: 'audio/mpeg',
        dataBase64: Buffer.from([1, 2, 3, 4]).toString('base64'),
        durationSeconds: 30,
        rights: {
          accepted: true,
          basis: 'own',
          statement: 'I own this uploaded reference recording.',
        },
      },
    })

    expect(response.statusCode).toBe(201)
    const body = response.json()
    expect(body.artifactId).toBe('reference-artifact-001')
    expect(body.referenceAudioAnalysisReady).toBe(true)
    expect(body.referenceAudioConditioningReady).toBe(false)
    expect(body.checksumSha256).toMatch(/^[a-f0-9]{64}$/)
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

  it('rejects reference upload without an accepted rights declaration', async () => {
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
        dataBase64: Buffer.from([1, 2, 3, 4]).toString('base64'),
        durationSeconds: 30,
        rights: {
          accepted: false,
          basis: 'license',
          statement: 'I might have permission.',
        },
      },
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

    const response = await app.inject({
      method: 'POST',
      url: '/api/admin/music/reference-audio',
      headers: { authorization: 'Bearer admin-token' },
      payload: {
        filename: 'reference.png',
        mimeType: 'image/png',
        dataBase64: Buffer.from([1, 2, 3, 4]).toString('base64'),
        durationSeconds: 30,
        rights: {
          accepted: true,
          basis: 'own',
          statement: 'I own this upload.',
        },
      },
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

    const response = await app.inject({
      method: 'POST',
      url: '/api/admin/music/reference-audio',
      headers: { authorization: 'Bearer admin-token' },
      payload: {
        filename: 'reference.mp3',
        mimeType: 'audio/mpeg',
        dataBase64: Buffer.from([1, 2, 3, 4]).toString('base64'),
        durationSeconds: 301,
        rights: {
          accepted: true,
          basis: 'own',
          statement: 'I own this upload.',
        },
      },
    })

    expect(response.statusCode).toBe(400)
    expect(response.json().message).toContain('durationSeconds')
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

    await app.close()
  })
})
