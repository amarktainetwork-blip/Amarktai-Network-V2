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

  it('successful ranged JSON artifact is streamed as raw bytes, not parsed as error', async () => {
    const { GET } = await import('../app/api/admin/artifacts/[id]/file/route.js')
    const transcriptBytes = Buffer.from('{"text":"Transcript output.","language":"en","duration":2}')
    vi.stubGlobal('fetch', vi.fn().mockResolvedValue(new Response(transcriptBytes, {
      status: 206,
      headers: {
        'content-type': 'application/json',
        'content-length': String(transcriptBytes.length),
        'content-range': `bytes 0-${transcriptBytes.length - 1}/${transcriptBytes.length}`,
        'accept-ranges': 'bytes',
        'content-disposition': 'inline; filename="transcript.json"',
      },
    })))

    const response = await GET(new Request('http://localhost/api/admin/artifacts/stt-1/file', {
      headers: { Range: 'bytes=0-31' },
    }), { params: { id: 'stt-1' } })

    expect(response.status).toBe(206)
    expect(response.headers.get('content-type')).toBe('application/json')
    expect(response.headers.get('accept-ranges')).toBe('bytes')
    expect(response.headers.get('content-range')).toContain('bytes')
    expect(Number(response.headers.get('content-length'))).toBeGreaterThan(0)
    const body = await response.text()
    expect(body).toContain('"text"')
  })

  it('successful full JSON artifact download preserves attachment disposition', async () => {
    const { GET } = await import('../app/api/admin/artifacts/[id]/file/route.js')
    const transcriptBytes = Buffer.from('{"text":"Full transcript.","language":"en","duration":5}')
    vi.stubGlobal('fetch', vi.fn().mockResolvedValue(new Response(transcriptBytes, {
      status: 200,
      headers: {
        'content-type': 'application/json',
        'content-length': String(transcriptBytes.length),
        'content-disposition': 'attachment; filename="transcript.json"',
      },
    })))

    const response = await GET(new Request('http://localhost/api/admin/artifacts/stt-2/file?download=1'), { params: { id: 'stt-2' } })

    expect(response.status).toBe(200)
    expect(response.headers.get('content-type')).toBe('application/json')
    expect(response.headers.get('content-disposition')).toContain('attachment')
    expect(Number(response.headers.get('content-length'))).toBeGreaterThan(0)
  })

  it('JSON API error is still returned as JSON error response', async () => {
    const { GET } = await import('../app/api/admin/artifacts/[id]/file/route.js')
    vi.stubGlobal('fetch', vi.fn().mockResolvedValue(Response.json(
      { error: true, message: 'Forbidden' },
      { status: 403 },
    )))

    const response = await GET(new Request('http://localhost/api/admin/artifacts/forbidden/file'), { params: { id: 'forbidden' } })
    const body = await response.json()

    expect(response.status).toBe(403)
    expect(body.error).toBe(true)
  })

  it('binary artifact range response is unchanged', async () => {
    const { GET } = await import('../app/api/admin/artifacts/[id]/file/route.js')
    const videoBytes = Buffer.from([0x00, 0x00, 0x00, 0x18, 0x66, 0x74, 0x79, 0x70])
    vi.stubGlobal('fetch', vi.fn().mockResolvedValue(new Response(videoBytes, {
      status: 206,
      headers: {
        'content-type': 'video/mp4',
        'content-length': String(videoBytes.length),
        'content-range': `bytes 0-${videoBytes.length - 1}/1000`,
        'accept-ranges': 'bytes',
      },
    })))

    const response = await GET(new Request('http://localhost/api/admin/artifacts/vid-1/file', {
      headers: { Range: 'bytes=0-7' },
    }), { params: { id: 'vid-1' } })

    expect(response.status).toBe(206)
    expect(response.headers.get('content-type')).toBe('video/mp4')
    expect(response.headers.get('accept-ranges')).toBe('bytes')
  })

  it('Range header is forwarded to backend', async () => {
    const { GET } = await import('../app/api/admin/artifacts/[id]/file/route.js')
    vi.stubGlobal('fetch', vi.fn().mockResolvedValue(new Response(Buffer.from('ok'), {
      status: 206,
      headers: { 'content-type': 'audio/wav', 'content-length': '2' },
    })))

    await GET(new Request('http://localhost/api/admin/artifacts/a-1/file', {
      headers: { Range: 'bytes=0-31' },
    }), { params: { id: 'a-1' } })

    expect(vi.mocked(globalThis.fetch)).toHaveBeenCalledWith(
      expect.any(String),
      expect.objectContaining({ headers: expect.objectContaining({ Range: 'bytes=0-31' }) }),
    )
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
    expect(content).toContain('const metadata = safeParseJsonObject(job.metadataJson)')
    expect(content).toContain('appGrantSnapshot: appGrantSnapshot as never')
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
