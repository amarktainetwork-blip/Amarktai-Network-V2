import fs from 'node:fs'
import fsp from 'node:fs/promises'
import os from 'node:os'
import path from 'node:path'
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import { PROVIDER_KEYS } from '../packages/core/src/providers.ts'

const prismaMock = vi.hoisted(() => ({
  artifact: {
    create: vi.fn(),
    findUnique: vi.fn(),
  },
  appApiKey: {
    findUnique: vi.fn(),
  },
}))

vi.mock('@amarktai/db', () => ({ prisma: prismaMock }))

const ROOT = process.cwd()
const FINAL_PROVIDERS = ['genx', 'groq', 'together', 'mimo', 'deepinfra']

describe('artifact URL alignment and file access contracts', () => {
  let storageRoot

  beforeEach(async () => {
    storageRoot = await fsp.mkdtemp(path.join(os.tmpdir(), 'amarktai-artifacts-'))
    process.env.STORAGE_ROOT = storageRoot
    vi.clearAllMocks()
    prismaMock.artifact.create.mockImplementation(async ({ data }) => ({
      ...data,
      errorMessage: '',
      costUsdCents: 0,
      createdAt: new Date(),
      updatedAt: new Date(),
    }))
  })

  afterEach(async () => {
    delete process.env.STORAGE_ROOT
    if (storageRoot) {
      await fsp.rm(storageRoot, { recursive: true, force: true })
    }
  })

  it('saveArtifact persists an artifact-id public URL while keeping storagePath internal', async () => {
    const { saveArtifact } = await import('../packages/artifacts/src/manager.ts')

    const artifact = await saveArtifact({
      input: {
        appSlug: 'phase2-app',
        type: 'document',
        subType: 'contract-test',
        title: 'Contract test artifact',
        description: '',
        provider: '',
        model: '',
        traceId: 'trace-contract-test',
        mimeType: 'text/plain',
        metadata: {},
      },
      data: Buffer.from('artifact contract test', 'utf8'),
      explicitMimeType: 'text/plain',
    })

    const createdData = prismaMock.artifact.create.mock.calls[0][0].data

    expect(artifact.storageUrl).toBe(`/api/v1/artifacts/${artifact.id}/file`)
    expect(createdData.storageUrl).toBe(`/api/v1/artifacts/${createdData.id}/file`)
    expect(artifact.storageUrl).not.toContain('artifacts/phase2-app/document/')
    expect(artifact.storagePath).toMatch(/^artifacts\/phase2-app\/document\//)
    expect(fs.existsSync(path.join(storageRoot, artifact.storagePath))).toBe(true)
  })

  it('getArtifactPublicUrl builds only the artifact-id route', async () => {
    const { getArtifactPublicUrl } = await import('../packages/artifacts/src/manager.ts')
    expect(getArtifactPublicUrl('artifact-id')).toBe('/api/v1/artifacts/artifact-id/file')
  })

  it('saveArtifact persists generated media metadata as JSON', async () => {
    const { saveArtifact } = await import('../packages/artifacts/src/manager.ts')
    const metadata = {
      capability: 'image_generation',
      provider: 'together',
      model: 'black-forest-labs/FLUX.1-schnell',
      width: 1024,
      height: 1024,
      providerPayload: 'x'.repeat(70_000),
    }

    await saveArtifact({
      input: {
        appSlug: 'phase2-app',
        type: 'image',
        subType: 'image_generation',
        title: 'Long metadata image artifact',
        description: 'Generated media artifact metadata storage proof',
        provider: 'together',
        model: 'black-forest-labs/FLUX.1-schnell',
        traceId: 'trace-long-metadata',
        mimeType: 'image/png',
        metadata,
      },
      data: Buffer.from('png bytes', 'utf8'),
      explicitMimeType: 'image/png',
    })

    const createdData = prismaMock.artifact.create.mock.calls[0][0].data
    expect(createdData.metadata.length).toBeGreaterThan(65_535)
    expect(JSON.parse(createdData.metadata)).toMatchObject({
      capability: 'image_generation',
      provider: 'together',
      model: 'black-forest-labs/FLUX.1-schnell',
      width: 1024,
      height: 1024,
    })
  })

  it('artifact auth context allows admins and same-app API keys only', async () => {
    const { authenticateArtifactAccess, canAccessArtifact } = await import('../apps/api/src/lib/auth-context.ts')
    const app = {
      jwtVerify: vi.fn(async (token) => (token === 'admin-token' ? { role: 'admin', sub: 'admin@example.com' } : null)),
    }

    const admin = await authenticateArtifactAccess(app, 'Bearer admin-token')
    expect(admin).toEqual({ kind: 'admin', subject: 'admin@example.com' })
    expect(canAccessArtifact(admin, 'any-app')).toBe(true)

    prismaMock.appApiKey.findUnique.mockResolvedValueOnce({
      active: true,
      appConnection: { id: 'conn-1', appSlug: 'owner-app', status: 'active' },
    })
    const ownerApp = await authenticateArtifactAccess(app, 'Bearer app-key')
    expect(ownerApp).toEqual({ kind: 'app', appSlug: 'owner-app', connectionId: 'conn-1' })
    expect(canAccessArtifact(ownerApp, 'owner-app')).toBe(true)
    expect(canAccessArtifact(ownerApp, 'other-app')).toBe(false)

    expect(await authenticateArtifactAccess(app, undefined)).toBeNull()
  })

  it('getArtifactFile refuses non-completed artifacts and missing storage files', async () => {
    const { getArtifactFile } = await import('../packages/artifacts/src/manager.ts')

    prismaMock.artifact.findUnique.mockResolvedValueOnce(makeArtifact({ status: 'processing' }))
    await expect(getArtifactFile('processing-artifact')).resolves.toBeNull()

    prismaMock.artifact.findUnique.mockResolvedValueOnce(makeArtifact({ storagePath: 'artifacts/missing/file.txt' }))
    await expect(getArtifactFile('missing-file-artifact')).resolves.toBeNull()
  })

  it('artifact route requires auth before lookup and hides cross-app ownership misses', () => {
    const routeText = fs.readFileSync(path.join(ROOT, 'apps/api/src/routes/artifacts.ts'), 'utf8')

    expect(routeText).toContain("app.get('/api/v1/artifacts/:id/file'")
    expect(routeText.indexOf('const auth = await authenticateArtifactAccess')).toBeLessThan(
      routeText.indexOf('const artifact = await getArtifactRecord'),
    )
    expect(routeText).toContain('reply.status(401)')
    expect(routeText).toContain('canAccessArtifact')
    expect(routeText).toContain("reply.status(404).send({ error: true, message: 'Artifact not found' })")
    expect(routeText).toContain('reply.status(409)')
    expect(routeText).toContain('Artifact is not ready')
    expect(routeText).toContain('Artifact file not found')
    expect(routeText).toContain("header('Cache-Control', 'private, max-age=3600')")
    expect(routeText).not.toContain('public, max-age=86400')
    expect(routeText).not.toContain("app.get('/api/v1/artifacts/*")
  })

  it('artifact route returns 401 without auth before DB lookup', async () => {
    const handler = await makeArtifactRouteHandler()
    const reply = makeReply()

    await handler({ params: { id: 'artifact-id' }, headers: {} }, reply)

    expect(reply.status).toHaveBeenCalledWith(401)
    expect(reply.send).toHaveBeenCalledWith({ error: true, message: 'Missing or invalid Authorization header' })
    expect(prismaMock.artifact.findUnique).not.toHaveBeenCalled()
  })

  it('artifact route lets a same-app API key download its completed file', async () => {
    const artifact = makeArtifact({
      appSlug: 'owner-app',
      type: 'image',
      storagePath: 'artifacts/owner-app/image/2026-07-07/shared.png',
      mimeType: 'image/png',
    })
    const filePath = path.join(storageRoot, artifact.storagePath)
    await fsp.mkdir(path.dirname(filePath), { recursive: true })
    await fsp.writeFile(filePath, Buffer.from('shared artifact bytes'))
    prismaMock.artifact.findUnique.mockResolvedValue(artifact)
    prismaMock.appApiKey.findUnique.mockResolvedValueOnce({
      active: true,
      appConnection: { id: 'conn-1', appSlug: 'owner-app', status: 'active' },
    })
    const handler = await makeArtifactRouteHandler()
    const reply = makeReply()

    await handler({ params: { id: 'artifact-id' }, headers: { authorization: 'Bearer owner-key' } }, reply)

    expect(reply.status).not.toHaveBeenCalled()
    expect(reply.header).toHaveBeenCalledWith('Content-Type', 'image/png')
    expect(reply.send).toHaveBeenCalledWith(Buffer.from('shared artifact bytes'))
  })

  it('artifact route hides artifacts from wrong-app API keys', async () => {
    prismaMock.artifact.findUnique.mockResolvedValue(makeArtifact({ appSlug: 'owner-app' }))
    prismaMock.appApiKey.findUnique.mockResolvedValueOnce({
      active: true,
      appConnection: { id: 'conn-2', appSlug: 'other-app', status: 'active' },
    })
    const handler = await makeArtifactRouteHandler()
    const reply = makeReply()

    await handler({ params: { id: 'artifact-id' }, headers: { authorization: 'Bearer other-key' } }, reply)

    expect(reply.status).toHaveBeenCalledWith(404)
    expect(reply.send).toHaveBeenCalledWith({ error: true, message: 'Artifact not found' })
  })

  it('artifact route returns 404 honestly when the DB record exists but the file is missing', async () => {
    prismaMock.artifact.findUnique.mockResolvedValue(makeArtifact({
      appSlug: 'owner-app',
      storagePath: 'artifacts/owner-app/image/2026-07-07/missing.png',
      mimeType: 'image/png',
    }))
    prismaMock.appApiKey.findUnique.mockResolvedValueOnce({
      active: true,
      appConnection: { id: 'conn-1', appSlug: 'owner-app', status: 'active' },
    })
    const handler = await makeArtifactRouteHandler()
    const reply = makeReply()

    await handler({ params: { id: 'artifact-id' }, headers: { authorization: 'Bearer owner-key' } }, reply)

    expect(reply.status).toHaveBeenCalledWith(404)
    expect(reply.send).toHaveBeenCalledWith({ error: true, message: 'Artifact file not found' })
  })

  it('does not add provider execution, dashboard job routes, MongoDB, or provider-list drift', () => {
    const pkg = JSON.parse(fs.readFileSync(path.join(ROOT, 'package.json'), 'utf8'))
    const activeDependencies = { ...pkg.dependencies, ...pkg.devDependencies, ...pkg.optionalDependencies, ...pkg.peerDependencies }

    expect([...PROVIDER_KEYS]).toEqual(FINAL_PROVIDERS)
    expect(activeDependencies.mongodb).toBeUndefined()
    expect(fs.existsSync(path.join(ROOT, 'app/api/jobs/route.js'))).toBe(false)
    expect(fs.existsSync(path.join(ROOT, 'app/api/studio/jobs/route.js'))).toBe(false)
    expect(fs.existsSync(path.join(ROOT, 'app/api/dashboard/jobs/route.js'))).toBe(false)

    const touchedRuntime = [
      'packages/artifacts/src/manager.ts',
      'packages/artifacts/src/storage.ts',
      'apps/api/src/routes/artifacts.ts',
      'apps/api/src/lib/auth-context.ts',
    ].map((file) => fs.readFileSync(path.join(ROOT, file), 'utf8').toLowerCase()).join('\n')

    expect(touchedRuntime).not.toContain('genxsubmit')
    expect(touchedRuntime).not.toContain('groqchat')
    expect(touchedRuntime).not.toContain('togethergenerate')
    expect(touchedRuntime).not.toContain('simulation')
  })
})

async function makeArtifactRouteHandler() {
  const { artifactRoutes } = await import('../apps/api/src/routes/artifacts.ts')
  let handler
  const app = {
    get: vi.fn((_path, routeHandler) => {
      handler = routeHandler
    }),
    jwtVerify: vi.fn(async () => {
      throw new Error('not an admin token')
    }),
  }

  await artifactRoutes(app)
  if (!handler) throw new Error('Artifact route handler was not registered')
  return handler
}

function makeReply() {
  const reply = {
    statusCode: undefined,
    headers: {},
    payload: undefined,
    status: vi.fn((statusCode) => {
      reply.statusCode = statusCode
      return reply
    }),
    header: vi.fn((name, value) => {
      reply.headers[name] = value
      return reply
    }),
    send: vi.fn((payload) => {
      reply.payload = payload
      return reply
    }),
  }
  return reply
}

function makeArtifact(overrides = {}) {
  return {
    id: 'artifact-id',
    appSlug: 'owner-app',
    type: 'document',
    subType: '',
    title: '',
    description: '',
    provider: '',
    model: '',
    traceId: '',
    storageDriver: 'local_vps',
    storagePath: 'artifacts/owner-app/document/2026-07-06/missing.txt',
    storageUrl: '/api/v1/artifacts/artifact-id/file',
    mimeType: 'text/plain',
    fileSizeBytes: 1,
    previewable: true,
    downloadable: true,
    status: 'completed',
    errorMessage: '',
    costUsdCents: 0,
    metadata: '{}',
    createdAt: new Date(),
    updatedAt: new Date(),
    ...overrides,
  }
}
