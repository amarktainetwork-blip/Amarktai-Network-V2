import { beforeEach, describe, it, expect, vi } from 'vitest'
import fs from 'fs'
import path from 'path'
import { getBackendCapability } from '../lib/capability-map.js'
import { useStudioStore } from '../lib/useStudioStore.js'

const ROOT = path.join(import.meta.dirname, '..')

describe('studio execution loop contract', () => {
  beforeEach(() => {
    vi.restoreAllMocks()
    vi.unstubAllGlobals()
  })

  it('Studio uses amarktai_token', () => {
    const storePath = path.join(ROOT, 'lib/useStudioStore.js')
    const content = fs.readFileSync(storePath, 'utf8')
    expect(content).toContain("localStorage.getItem('amarktai_token')")
    expect(content).not.toContain("localStorage.getItem('admin_token')")
  })

  it('Studio no longer uses admin_token', () => {
    const storePath = path.join(ROOT, 'lib/useStudioStore.js')
    const content = fs.readFileSync(storePath, 'utf8')
    expect(content).not.toContain('admin_token')
  })

  it('admin Studio route exists', () => {
    const routePath = path.join(ROOT, 'apps/api/src/routes/admin-studio.ts')
    expect(fs.existsSync(routePath)).toBe(true)
    const content = fs.readFileSync(routePath, 'utf8')
    expect(content).toContain('adminStudioRoutes')
    expect(content).toContain('/api/admin/studio/jobs')
  })

  it('admin Studio route requires admin JWT', () => {
    const routePath = path.join(ROOT, 'apps/api/src/routes/admin-studio.ts')
    const content = fs.readFileSync(routePath, 'utf8')
    expect(content).toContain('requireAdmin')
  })

  it('admin Studio route rejects provider override', () => {
    const routePath = path.join(ROOT, 'apps/api/src/routes/admin-studio.ts')
    const content = fs.readFileSync(routePath, 'utf8')
    expect(content).toContain('Orchestra selects provider and model')
    expect(content).toContain('validateOrchestraRequest')
  })

  it('admin Studio route rejects unproven capabilities', () => {
    const routePath = path.join(ROOT, 'apps/api/src/routes/admin-studio.ts')
    const content = fs.readFileSync(routePath, 'utf8')
    expect(content).toContain('not proven or not ready for dashboard execution')
  })

  it.each([
    ['image.generate', 'image_generation'],
    ['video.generate', 'video_generation'],
    ['text.chat', 'chat'],
    ['text.reasoning', 'reasoning'],
    ['text.code', 'code'],
  ])('maps dashboard key %s to backend key %s', (dashboardKey, backendKey) => {
    expect(getBackendCapability(dashboardKey).backendCapability).toBe(backendKey)
  })

  it.each([
    ['image.generate', 'image_generation'],
    ['video.generate', 'video_generation'],
    ['text.chat', 'chat'],
    ['text.reasoning', 'reasoning'],
    ['text.code', 'code'],
  ])('Studio store submits %s as canonical %s', async (dashboardKey, backendKey) => {
    const fetchMock = vi.fn().mockResolvedValue({
      ok: true,
      json: async () => ({ jobId: 'job-123', status: 'queued' }),
    })
    vi.stubGlobal('fetch', fetchMock)

    const result = await useStudioStore.getState().submitJob(dashboardKey, { prompt: 'runtime proof prompt' })
    const body = JSON.parse(fetchMock.mock.calls[0][1].body)

    expect(result).toMatchObject({ ok: true, jobId: 'job-123' })
    expect(body.capability).toBe(backendKey)
    expect(body.capability).not.toBe(dashboardKey)
  })

  it('Studio store accepts already-canonical backend capability keys', async () => {
    const fetchMock = vi.fn().mockResolvedValue({
      ok: true,
      json: async () => ({ jobId: 'job-456', status: 'queued' }),
    })
    vi.stubGlobal('fetch', fetchMock)

    const result = await useStudioStore.getState().submitJob('image_generation', { prompt: 'canonical prompt' })
    const body = JSON.parse(fetchMock.mock.calls[0][1].body)

    expect(result).toMatchObject({ ok: true, jobId: 'job-456' })
    expect(body.capability).toBe('image_generation')
  })

  it('Studio store rejects unknown dashboard capability keys before backend submission', async () => {
    const fetchMock = vi.fn()
    vi.stubGlobal('fetch', fetchMock)

    const result = await useStudioStore.getState().submitJob('image.unknown', { prompt: 'bad prompt' })

    expect(result).toEqual({ ok: false, error: 'Capability is not mapped to a backend execution key' })
    expect(fetchMock).not.toHaveBeenCalled()
  })

  it('Studio page submits canonical backend key from handleSubmit', () => {
    const pagePath = path.join(ROOT, 'app/dashboard/studio/page.jsx')
    const content = fs.readFileSync(pagePath, 'utf8')

    expect(content).toContain('const backendCapability = backend.backendCapability')
    expect(content).toContain('submitJob(backendCapability, values)')
    expect(content).not.toContain('submitJob(meta.capability, values)')
    expect(content).toContain('Dashboard key')
    expect(content).toContain('Backend key')
  })

  it('admin Studio route normalizes known aliases and stores canonical job capability', () => {
    const routePath = path.join(ROOT, 'apps/api/src/routes/admin-studio.ts')
    const content = fs.readFileSync(routePath, 'utf8')

    expect(content).toContain('CAPABILITY_CATALOG')
    expect(content).toContain('capability.dashboardType')
    expect(content).toContain('normalizeStudioCapability(body.capability, proofStatus)')
    expect(content).toContain('capability: capability as never')
  })

  it('admin Studio route rejects unknown unmapped capabilities', () => {
    const routePath = path.join(ROOT, 'apps/api/src/routes/admin-studio.ts')
    const content = fs.readFileSync(routePath, 'utf8')

    expect(content).toContain('Capability is not mapped to a backend execution key')
  })

  it('admin Studio route evaluates runtime proof per request', () => {
    const routePath = path.join(ROOT, 'apps/api/src/routes/admin-studio.ts')
    const content = fs.readFileSync(routePath, 'utf8')
    // Should load proof status once per request via getRuntimeProofStatus(app)
    expect(content).toContain('getRuntimeProofStatus(app)')
    expect(content).toContain('isCapabilityProven(capability, proofStatus)')
    expect(content).not.toContain('const PROVEN_CAPABILITIES = getRuntimeProofStatus()')
  })

  it('admin Studio route creates Job row', () => {
    const routePath = path.join(ROOT, 'apps/api/src/routes/admin-studio.ts')
    const content = fs.readFileSync(routePath, 'utf8')
    expect(content).toContain('prisma.job.create')
  })

  it('admin Studio route enqueues BullMQ job', () => {
    const routePath = path.join(ROOT, 'apps/api/src/routes/admin-studio.ts')
    const content = fs.readFileSync(routePath, 'utf8')
    expect(content).toContain('q.add')
    expect(content).toContain('QUEUE_NAMES.JOBS')
    expect(content).toContain('jobId: job.id')
    expect(content).toContain('appSlug')
    expect(content).toContain('capability')
    expect(content).toContain('prompt: safePrompt')
    expect(content).toContain('input: inputObj')
    expect(content).toContain('metadata')
    expect(content).toContain('traceId')
    expect(content).not.toContain("q.add('process-job', { jobId: job.id }")
  })

  it('server registers admin-studio route', () => {
    const serverPath = path.join(ROOT, 'apps/api/src/server.ts')
    const content = fs.readFileSync(serverPath, 'utf8')
    expect(content).toContain('adminStudioRoutes')
  })

  it('dashboard proxy route exists for studio jobs', () => {
    const proxyPath = path.join(ROOT, 'app/api/admin/studio/jobs/route.js')
    expect(fs.existsSync(proxyPath)).toBe(true)
  })

  it('dashboard proxy route exists for job list', () => {
    const proxyPath = path.join(ROOT, 'app/api/admin/jobs/route.js')
    expect(fs.existsSync(proxyPath)).toBe(true)
    const content = fs.readFileSync(proxyPath, 'utf8')
    expect(content).toContain('Authorization')
  })

  it('dashboard proxy route exists for job detail', () => {
    const proxyPath = path.join(ROOT, 'app/api/admin/jobs/[id]/route.js')
    expect(fs.existsSync(proxyPath)).toBe(true)
    const content = fs.readFileSync(proxyPath, 'utf8')
    expect(content).toContain('Authorization')
  })

  it('dashboard proxy route exists for artifacts', () => {
    const proxyPath = path.join(ROOT, 'app/api/admin/artifacts/route.js')
    expect(fs.existsSync(proxyPath)).toBe(true)
    const content = fs.readFileSync(proxyPath, 'utf8')
    expect(content).toContain('Authorization')
  })

  it('dashboard proxy route exists for artifact detail', () => {
    const proxyPath = path.join(ROOT, 'app/api/admin/artifacts/[id]/route.js')
    expect(fs.existsSync(proxyPath)).toBe(true)
    const content = fs.readFileSync(proxyPath, 'utf8')
    expect(content).toContain('Authorization')
  })

  it('Jobs page uses amarktai_token', () => {
    const pagePath = path.join(ROOT, 'app/dashboard/jobs/page.js')
    const content = fs.readFileSync(pagePath, 'utf8')
    expect(content).toContain("localStorage.getItem('amarktai_token')")
    expect(content).not.toContain("localStorage.getItem('admin_token')")
  })

  it('Artifacts page uses amarktai_token', () => {
    const pagePath = path.join(ROOT, 'app/dashboard/artifacts/page.js')
    const content = fs.readFileSync(pagePath, 'utf8')
    expect(content).toContain("localStorage.getItem('amarktai_token')")
    expect(content).not.toContain("localStorage.getItem('admin_token')")
  })

  it('Artifacts page uses authorized admin file proxy instead of direct api/v1 links', () => {
    const pagePath = path.join(ROOT, 'app/dashboard/artifacts/page.js')
    const content = fs.readFileSync(pagePath, 'utf8')
    expect(content).toContain("fetch(`/api/admin/artifacts/${artifact.id}/file`")
    expect(content).toContain('URL.createObjectURL(blob)')
    expect(content).toContain('URL.revokeObjectURL')
    expect(content).toContain('downloadArtifact')
    expect(content).toContain('IMAGE_MIME_TYPES')
    expect(content).not.toContain('/api/v1/artifacts/${')
  })

  it('Studio fetches artifact detail and file through authorized admin proxy for image preview', () => {
    const pagePath = path.join(ROOT, 'app/dashboard/studio/page.jsx')
    const content = fs.readFileSync(pagePath, 'utf8')
    expect(content).toContain('function StudioArtifactPreview')
    expect(content).toContain("localStorage.getItem('amarktai_token')")
    expect(content).toContain('fetch(`/api/admin/artifacts/${artifactId}`')
    expect(content).toContain('fetch(`/api/admin/artifacts/${artifactId}/file`')
    expect(content).toContain('URL.createObjectURL(blob)')
    expect(content).toContain('URL.revokeObjectURL')
    expect(content).toContain('Artifact preview unavailable')
  })

  it('provider list remains exactly 5', async () => {
    const { PROVIDER_KEYS } = await import('../packages/core/src/index.ts')
    expect(PROVIDER_KEYS).toHaveLength(5)
  })

  it('no provider/model selectors are exposed', () => {
    const storePath = path.join(ROOT, 'lib/useStudioStore.js')
    const content = fs.readFileSync(storePath, 'utf8')
    expect(content).not.toContain('provider')
    expect(content).not.toContain('model')
  })
})
