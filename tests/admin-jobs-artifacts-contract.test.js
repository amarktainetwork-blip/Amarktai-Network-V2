import { beforeEach, describe, it, expect, vi } from 'vitest'
import fs from 'fs'
import path from 'path'

const ROOT = path.join(import.meta.dirname, '..')

describe('dashboard artifact file proxy', () => {
  beforeEach(() => {
    vi.restoreAllMocks()
    vi.unstubAllGlobals()
  })

  it('artifact file proxy route exists', () => {
    const proxyPath = path.join(ROOT, 'app/api/admin/artifacts/[id]/file/route.js')
    expect(fs.existsSync(proxyPath)).toBe(true)
  })

  it('file proxy forwards Authorization and preserves binary response headers', async () => {
    const { GET } = await import('../app/api/admin/artifacts/[id]/file/route.js')
    const fetchMock = vi.fn().mockResolvedValue(new Response(new Uint8Array([1, 2, 3]), {
      status: 200,
      headers: {
        'content-type': 'image/png',
        'content-disposition': 'inline; filename="artifact.png"',
        'cache-control': 'private, max-age=3600',
      },
    }))
    vi.stubGlobal('fetch', fetchMock)

    const response = await GET(new Request('http://localhost/api/admin/artifacts/art-1/file', {
      headers: { Authorization: 'Bearer dashboard-token' },
    }), { params: { id: 'art-1' } })

    expect(fetchMock).toHaveBeenCalledWith('http://api:3001/api/v1/artifacts/art-1/file', expect.objectContaining({
      headers: { Authorization: 'Bearer dashboard-token' },
    }))
    expect(response.status).toBe(200)
    expect(response.headers.get('content-type')).toBe('image/png')
    expect(response.headers.get('content-disposition')).toBe('inline; filename="artifact.png"')
    expect(response.headers.get('cache-control')).toBe('private, max-age=3600')
  })

  it('file proxy returns backend JSON errors safely', async () => {
    const { GET } = await import('../app/api/admin/artifacts/[id]/file/route.js')
    vi.stubGlobal('fetch', vi.fn().mockResolvedValue(Response.json(
      { error: true, message: 'Artifact file not found' },
      { status: 404 },
    )))

    const response = await GET(new Request('http://localhost/api/admin/artifacts/missing/file'), { params: { id: 'missing' } })
    const body = await response.json()

    expect(response.status).toBe(404)
    expect(body).toEqual({ error: true, message: 'Artifact file not found' })
  })
})

describe('admin-jobs route contract', () => {
  it('admin-jobs route exists', () => {
    const filePath = path.join(ROOT, 'apps/api/src/routes/admin-jobs.ts')
    expect(fs.existsSync(filePath)).toBe(true)
    const content = fs.readFileSync(filePath, 'utf8')
    expect(content).toContain('adminJobRoutes')
    expect(content).toContain('/api/admin/jobs')
    expect(content).toContain('requireAdmin')
  })

  it('does not expose secrets in job shape', () => {
    const filePath = path.join(ROOT, 'apps/api/src/routes/admin-jobs.ts')
    const content = fs.readFileSync(filePath, 'utf8')
    expect(content).not.toContain('apiKey')
    expect(content).not.toContain('providerKey')
    expect(content).not.toContain('secret')
    expect(content).not.toContain('token')
  })

  it('admin jobs route exposes failed status and error in list/detail shapes', () => {
    const filePath = path.join(ROOT, 'apps/api/src/routes/admin-jobs.ts')
    const content = fs.readFileSync(filePath, 'utf8')
    expect(content).toContain('status: job.status')
    expect(content).toContain('error: job.error || null')
  })

  it('admin jobs route can requeue with full WorkerJobData payload', () => {
    const filePath = path.join(ROOT, 'apps/api/src/routes/admin-jobs.ts')
    const content = fs.readFileSync(filePath, 'utf8')
    expect(content).toContain("app.post('/api/admin/jobs/:id/requeue'")
    expect(content).toContain('QUEUE_NAMES.JOBS')
    expect(content).toContain('jobId: job.id')
    expect(content).toContain('appSlug: job.appSlug')
    expect(content).toContain('capability: job.capability')
    expect(content).toContain('prompt: job.prompt')
    expect(content).toContain('input: safeParseJsonObject(job.inputJson)')
    expect(content).toContain('metadata: safeParseJsonObject(job.metadataJson)')
    expect(content).toContain('traceId')
    expect(content).toContain('error: null')
    expect(content).toContain("status: 'queued'")
  })

  it('server registers admin-jobs route', () => {
    const serverPath = path.join(ROOT, 'apps/api/src/server.ts')
    const content = fs.readFileSync(serverPath, 'utf8')
    expect(content).toContain('adminJobRoutes')
  })
})

describe('admin-artifacts route contract', () => {
  it('admin-artifacts route exists', () => {
    const filePath = path.join(ROOT, 'apps/api/src/routes/admin-artifacts.ts')
    expect(fs.existsSync(filePath)).toBe(true)
    const content = fs.readFileSync(filePath, 'utf8')
    expect(content).toContain('adminArtifactRoutes')
    expect(content).toContain('/api/admin/artifacts')
    expect(content).toContain('requireAdmin')
  })

  it('does not expose secrets in artifact shape', () => {
    const filePath = path.join(ROOT, 'apps/api/src/routes/admin-artifacts.ts')
    const content = fs.readFileSync(filePath, 'utf8')
    expect(content).not.toContain('filePath')
    expect(content).not.toContain('storagePath')
    expect(content).not.toContain('apiKey')
  })

  it('backend artifact file route returns 404 for missing file without path leaks', () => {
    const routePath = path.join(ROOT, 'apps/api/src/routes/artifacts.ts')
    const content = fs.readFileSync(routePath, 'utf8')
    expect(content).toContain("reply.status(404).send({ error: true, message: 'Artifact file not found' })")
    expect(content).not.toContain('storagePath')
  })

  it('server registers admin-artifacts route', () => {
    const serverPath = path.join(ROOT, 'apps/api/src/server.ts')
    const content = fs.readFileSync(serverPath, 'utf8')
    expect(content).toContain('adminArtifactRoutes')
  })
})
