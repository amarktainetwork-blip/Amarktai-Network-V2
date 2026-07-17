import { beforeEach, describe, expect, it, vi } from 'vitest'
import Fastify from 'fastify'

const TEST_PLAN_ID = 'test-plan-id-123'
const TEST_VERSION_HASH = 'abc123def456'
const TEST_EXECUTION_ID = 'exec-id-789'
const TEST_PREVIEW_JOB_ID = 'preview-job-id-001'

const basePlan = {
  id: TEST_PLAN_ID,
  versionHash: TEST_VERSION_HASH,
  prompt: 'Test campaign prompt for route-level preview retry tests',
  totalDurationSeconds: 30,
  aspectRatio: '16:9',
  style: 'cinematic',
  tone: 'professional',
  planningMode: 'explicit',
  routingMode: 'quality',
  storyboard: {
    scenes: [
      { sceneNumber: 1, title: 'Opening', objective: 'Hook the viewer', visualPrompt: 'Premium cinematic opening shot with professional lighting and dynamic camera movement', durationSeconds: 10, negativePrompt: 'No text, no logos', cameraDirection: 'Wide establishing shot' },
      { sceneNumber: 2, title: 'Development', objective: 'Build engagement', visualPrompt: 'Mid-section development with authentic detail and professional production quality', durationSeconds: 10 },
      { sceneNumber: 3, title: 'Conclusion', objective: 'Deliver CTA', visualPrompt: 'Clean concluding composition with generous negative space for end card', durationSeconds: 10 },
    ],
    totalDurationSeconds: 30,
    narrativeFlow: 'test flow',
  },
  renderSteps: [],
  artifactPlan: { finalVideoArtifact: false, sceneArtifacts: [] },
  missingDependencies: [],
  executableNow: false,
  perSceneVideoGenerationPossible: true,
  finalAssemblyReady: false,
  providerCallsStarted: false,
}

const db = vi.hoisted(() => {
  const jobs = []
  let counter = 0
  const makeJob = (data) => {
    counter += 1
    const now = new Date(`2026-07-10T00:00:${String(counter).padStart(2, '0')}.000Z`)
    return {
      id: data.id ?? `job-${counter}`,
      appSlug: data.appSlug,
      capability: data.capability,
      prompt: data.prompt ?? '',
      inputJson: data.inputJson ?? '{}',
      metadataJson: data.metadataJson ?? '{}',
      traceId: data.traceId ?? '',
      status: data.status ?? 'queued',
      provider: data.provider ?? '',
      model: data.model ?? '',
      artifactId: data.artifactId ?? null,
      progress: data.progress ?? 0,
      output: data.output ?? null,
      error: data.error ?? null,
      callbackUrl: data.callbackUrl ?? null,
      providerClaimAt: data.providerClaimAt ?? null,
      parentJobId: data.parentJobId ?? null,
      executionId: data.executionId ?? '',
      sceneNumber: data.sceneNumber ?? null,
      workflowPhase: data.workflowPhase ?? '',
      retryCount: data.retryCount ?? 0,
      queueJobId: data.queueJobId ?? '',
      queuedAt: data.queuedAt ?? null,
      createdAt: data.createdAt ?? now,
      startedAt: data.startedAt ?? null,
      completedAt: data.completedAt ?? null,
      updatedAt: data.updatedAt ?? now,
    }
  }

  const matchesWhere = (job, where = {}) => {
    if (where.appSlug && job.appSlug !== where.appSlug) return false
    if (where.capability && job.capability !== where.capability) return false
    if (where.parentJobId !== undefined && job.parentJobId !== where.parentJobId) return false
    if (where.executionId !== undefined && job.executionId !== where.executionId) return false
    if (where.status?.in && !where.status.in.includes(job.status)) return false
    if (where.status?.notIn && where.status.notIn.includes(job.status)) return false
    if (typeof where.status === 'string' && job.status !== where.status) return false
    if (where.retryCount !== undefined && job.retryCount !== where.retryCount) return false
    if (where.providerClaimAt === null && job.providerClaimAt !== null) return false
    if (where.OR && !where.OR.some((clause) => matchesWhere(job, clause))) return false
    if (where.id && job.id !== where.id) return false
    if (where.traceId && job.traceId !== where.traceId) return false
    return true
  }

  const applyUpdate = (job, data) => {
    for (const [key, value] of Object.entries(data)) {
      if (value && typeof value === 'object' && 'increment' in value) {
        job[key] += value.increment
      } else {
        job[key] = value
      }
    }
    job.updatedAt = new Date()
    return job
  }

  const jobApi = {
    create: vi.fn(async ({ data }) => {
      const job = makeJob(data)
      jobs.push(job)
      return job
    }),
    update: vi.fn(async ({ where, data }) => {
      const job = jobs.find((item) => item.id === where.id)
      if (!job) throw new Error(`missing job ${where.id}`)
      return applyUpdate(job, data)
    }),
    updateMany: vi.fn(async ({ where, data }) => {
      const matched = jobs.filter((job) => matchesWhere(job, where))
      matched.forEach((job) => applyUpdate(job, data))
      return { count: matched.length }
    }),
    findMany: vi.fn(async ({ where, orderBy } = {}) => {
      let result = jobs.filter((job) => matchesWhere(job, where ?? {}))
      if (orderBy?.sceneNumber === 'asc') result = result.sort((a, b) => (a.sceneNumber ?? 0) - (b.sceneNumber ?? 0))
      if (orderBy?.createdAt === 'asc') result = result.sort((a, b) => a.createdAt.getTime() - b.createdAt.getTime())
      return result
    }),
    findFirst: vi.fn(async ({ where } = {}) => jobs.find((job) => matchesWhere(job, where ?? {})) ?? null),
    findUnique: vi.fn(async ({ where }) => jobs.find((job) => job.id === where.id) ?? null),
  }

  const refreshLongFormParentState = vi.fn(async () => null)

  return {
    jobs,
    reset: () => {
      jobs.splice(0, jobs.length)
      counter = 0
      Object.values(jobApi).forEach((fn) => fn.mockClear())
      refreshLongFormParentState.mockClear()
    },
    refreshLongFormParentState,
    prisma: {
      job: jobApi,
      artifact: { findMany: vi.fn(async () => []), findUnique: vi.fn(async () => null), findFirst: vi.fn(async () => null) },
      aiProvider: { findMany: vi.fn(async () => []) },
      appCapabilityGrant: {
        findUnique: vi.fn(async ({ where }) => ({
          appSlug: where.app_capability_grant_unique.appSlug,
          capability: where.app_capability_grant_unique.capability,
          enabled: true, qualityFloor: 'balanced', budgetPolicy: 'balanced',
          maxCostPerRequest: 0, maxCostPerWorkflow: 0, latencyPreference: 'medium',
          allowFallback: true, maxFallbackAttempts: 3, liveProofRequired: false,
          approvalRequired: false, artifactRead: true, artifactWrite: true,
          memoryRead: false, memoryWrite: false, ragNamespaces: '[]',
          policyProfile: 'test', adultPermission: false, dataRetentionPolicy: 'default',
          passthroughModelAllowed: false, providerResidencyConstraints: '[]',
        })),
      },
      $transaction: vi.fn(async (fn) => fn({ job: jobApi })),
    },
  }
})

const queue = vi.hoisted(() => ({
  add: vi.fn(async () => ({ id: 'queue-job' })),
  remove: vi.fn(async () => undefined),
  getJob: vi.fn(async () => ({ remove: queue.remove })),
  Queue: vi.fn(function Queue() {
    return { add: queue.add, getJob: queue.getJob }
  }),
}))

vi.mock('@amarktai/db', () => ({
  prisma: db.prisma,
  refreshLongFormParentState: db.refreshLongFormParentState,
  listProviderCredentialStatuses: vi.fn(async () => []),
}))
vi.mock('bullmq', () => ({ Queue: queue.Queue }))

import { adminLongFormVideoRoutes } from '../apps/api/src/routes/admin-long-form-video.ts'

function makeApp() {
  const app = Fastify()
  app.decorate('redis', {})
  app.decorate('jwtVerify', async (token) => {
    if (token === 'admin-token') return { role: 'admin' }
    throw new Error('bad token')
  })
  return app
}

const auth = { authorization: 'Bearer admin-token' }

function parentMetadata() {
  return {
    plan: basePlan,
    planOnly: true,
    approved: false,
    request: { prompt: 'Test', targetDurationSeconds: 30, sceneCount: 3 },
    routingMode: 'quality',
  }
}

function previewJobMetadata(overrides = {}) {
  return {
    longFormVideo: true,
    longFormScenePreview: true,
    sourcePlanId: TEST_PLAN_ID,
    sourcePlanVersionHash: TEST_VERSION_HASH,
    sourcePlanExecutionId: TEST_EXECUTION_ID,
    sceneNumber: 1,
    routingMode: 'quality',
    retryGeneration: 0,
    executionProfile: 'internal_dashboard',
    appGrantSnapshot: { appSlug: 'dashboard-long-form', capability: 'video_generation', enabled: true },
    ...overrides,
  }
}

function seedParentAndPreviewJob(previewOverrides = {}) {
  const parent = {
    id: 'parent-job-id',
    status: 'planned',
    appSlug: 'dashboard-long-form',
    executionId: TEST_EXECUTION_ID,
    capability: 'long_form_video',
    prompt: 'Test',
    metadataJson: JSON.stringify(parentMetadata()),
  }
  db.jobs.push(db.prisma.job.create({ data: parent }))

  const preview = {
    id: TEST_PREVIEW_JOB_ID,
    status: 'failed',
    appSlug: 'dashboard-long-form',
    capability: 'video_generation',
    prompt: 'Premium cinematic opening shot with professional lighting and dynamic camera movement',
    inputJson: JSON.stringify({ duration: 10, aspectRatio: '16:9' }),
    metadataJson: JSON.stringify(previewJobMetadata(previewOverrides)),
    traceId: `trace_longform_preview_${TEST_EXECUTION_ID}_scene_1`,
    executionId: TEST_EXECUTION_ID,
    sceneNumber: 1,
    retryCount: 0,
    error: 'Previous failure message',
    queueJobId: 'original-queue-job-id',
    ...previewOverrides,
  }
  db.jobs.push(db.prisma.job.create({ data: preview }))
  return { parent, preview }
}

describe('preview-scene retry route-level tests', () => {
  beforeEach(() => {
    db.reset()
    queue.add.mockReset()
    queue.add.mockResolvedValue({ id: 'queue-job' })
  })

  it('retries a failed preview: increments retryCount, clears queueJobId, enqueues with unique attempt ID', async () => {
    seedParentAndPreviewJob()
    const app = makeApp()
    await app.register(adminLongFormVideoRoutes)
    await app.ready()

    const response = await app.inject({
      method: 'POST',
      url: '/api/admin/long-form-video/preview-scene/retry',
      headers: auth,
      payload: { executionId: TEST_EXECUTION_ID, planId: TEST_PLAN_ID, versionHash: TEST_VERSION_HASH, sceneNumber: 1 },
    })

    expect(response.statusCode).toBe(202)
    const body = response.json()
    expect(body.success).toBe(true)
    expect(body.status).toBe('queued')
    expect(body.retryCount).toBe(1)
    expect(body.retryGeneration).toBe(1)
    expect(body.routingMode).toBe('quality')

    const previewJob = db.jobs.find((j) => j.id === TEST_PREVIEW_JOB_ID)
    expect(previewJob.retryCount).toBe(1)
    expect(previewJob.queueJobId).toBeTruthy()
    expect(previewJob.queueJobId).toContain(':attempt:1')
    expect(previewJob.status).toBe('queued')
    expect(previewJob.error).toBeNull()
    expect(previewJob.completedAt).toBeNull()

    expect(queue.add).toHaveBeenCalledOnce()
    const addCall = queue.add.mock.calls[0]
    expect(addCall[1].jobId).toBe(TEST_PREVIEW_JOB_ID)
    expect(addCall[2].jobId).toBe(`${TEST_PREVIEW_JOB_ID}:attempt:1`)
  })

  it('second retry uses attempt:2', async () => {
    seedParentAndPreviewJob({ retryGeneration: 1 })
    const previewJob = db.jobs.find((j) => j.id === TEST_PREVIEW_JOB_ID)
    previewJob.retryCount = 1
    previewJob.status = 'failed'
    previewJob.queueJobId = `${TEST_PREVIEW_JOB_ID}:attempt:1`

    const app = makeApp()
    await app.register(adminLongFormVideoRoutes)
    await app.ready()

    const response = await app.inject({
      method: 'POST',
      url: '/api/admin/long-form-video/preview-scene/retry',
      headers: auth,
      payload: { executionId: TEST_EXECUTION_ID, planId: TEST_PLAN_ID, versionHash: TEST_VERSION_HASH, sceneNumber: 1 },
    })

    expect(response.statusCode).toBe(202)
    const body = response.json()
    expect(body.retryCount).toBe(2)

    const updated = db.jobs.find((j) => j.id === TEST_PREVIEW_JOB_ID)
    expect(updated.queueJobId).toContain(':attempt:2')
    expect(updated.retryCount).toBe(2)
  })

  it('retry count 3 returns HTTP 429 and does not call BullMQ', async () => {
    seedParentAndPreviewJob()
    const previewJob = db.jobs.find((j) => j.id === TEST_PREVIEW_JOB_ID)
    previewJob.retryCount = 3
    previewJob.status = 'failed'

    const app = makeApp()
    await app.register(adminLongFormVideoRoutes)
    await app.ready()

    const response = await app.inject({
      method: 'POST',
      url: '/api/admin/long-form-video/preview-scene/retry',
      headers: auth,
      payload: { executionId: TEST_EXECUTION_ID, planId: TEST_PLAN_ID, versionHash: TEST_VERSION_HASH, sceneNumber: 1 },
    })

    expect(response.statusCode).toBe(429)
    expect(response.json().message).toContain('Retry limit')
    expect(queue.add).not.toHaveBeenCalled()
  })

  it('rejects completed preview', async () => {
    seedParentAndPreviewJob({ status: 'completed' })
    const previewJob = db.jobs.find((j) => j.id === TEST_PREVIEW_JOB_ID)
    previewJob.status = 'completed'

    const app = makeApp()
    await app.register(adminLongFormVideoRoutes)
    await app.ready()

    const response = await app.inject({
      method: 'POST',
      url: '/api/admin/long-form-video/preview-scene/retry',
      headers: auth,
      payload: { executionId: TEST_EXECUTION_ID, planId: TEST_PLAN_ID, versionHash: TEST_VERSION_HASH, sceneNumber: 1 },
    })

    expect(response.statusCode).toBe(409)
    expect(queue.add).not.toHaveBeenCalled()
  })

  it('rejects queued preview', async () => {
    seedParentAndPreviewJob()
    const previewJob = db.jobs.find((j) => j.id === TEST_PREVIEW_JOB_ID)
    previewJob.status = 'queued'

    const app = makeApp()
    await app.register(adminLongFormVideoRoutes)
    await app.ready()

    const response = await app.inject({
      method: 'POST',
      url: '/api/admin/long-form-video/preview-scene/retry',
      headers: auth,
      payload: { executionId: TEST_EXECUTION_ID, planId: TEST_PLAN_ID, versionHash: TEST_VERSION_HASH, sceneNumber: 1 },
    })

    expect(response.statusCode).toBe(409)
    expect(queue.add).not.toHaveBeenCalled()
  })

  it('rejects processing preview', async () => {
    seedParentAndPreviewJob()
    const previewJob = db.jobs.find((j) => j.id === TEST_PREVIEW_JOB_ID)
    previewJob.status = 'processing'

    const app = makeApp()
    await app.register(adminLongFormVideoRoutes)
    await app.ready()

    const response = await app.inject({
      method: 'POST',
      url: '/api/admin/long-form-video/preview-scene/retry',
      headers: auth,
      payload: { executionId: TEST_EXECUTION_ID, planId: TEST_PLAN_ID, versionHash: TEST_VERSION_HASH, sceneNumber: 1 },
    })

    expect(response.statusCode).toBe(409)
    expect(queue.add).not.toHaveBeenCalled()
  })

  it('rejects cancelling preview', async () => {
    seedParentAndPreviewJob()
    const previewJob = db.jobs.find((j) => j.id === TEST_PREVIEW_JOB_ID)
    previewJob.status = 'cancelling'

    const app = makeApp()
    await app.register(adminLongFormVideoRoutes)
    await app.ready()

    const response = await app.inject({
      method: 'POST',
      url: '/api/admin/long-form-video/preview-scene/retry',
      headers: auth,
      payload: { executionId: TEST_EXECUTION_ID, planId: TEST_PLAN_ID, versionHash: TEST_VERSION_HASH, sceneNumber: 1 },
    })

    expect(response.statusCode).toBe(409)
    expect(queue.add).not.toHaveBeenCalled()
  })

  it('rejects planned preview', async () => {
    seedParentAndPreviewJob()
    const previewJob = db.jobs.find((j) => j.id === TEST_PREVIEW_JOB_ID)
    previewJob.status = 'planned'

    const app = makeApp()
    await app.register(adminLongFormVideoRoutes)
    await app.ready()

    const response = await app.inject({
      method: 'POST',
      url: '/api/admin/long-form-video/preview-scene/retry',
      headers: auth,
      payload: { executionId: TEST_EXECUTION_ID, planId: TEST_PLAN_ID, versionHash: TEST_VERSION_HASH, sceneNumber: 1 },
    })

    expect(response.statusCode).toBe(409)
    expect(queue.add).not.toHaveBeenCalled()
  })

  it('accepts cancelled preview', async () => {
    seedParentAndPreviewJob()
    const previewJob = db.jobs.find((j) => j.id === TEST_PREVIEW_JOB_ID)
    previewJob.status = 'cancelled'

    const app = makeApp()
    await app.register(adminLongFormVideoRoutes)
    await app.ready()

    const response = await app.inject({
      method: 'POST',
      url: '/api/admin/long-form-video/preview-scene/retry',
      headers: auth,
      payload: { executionId: TEST_EXECUTION_ID, planId: TEST_PLAN_ID, versionHash: TEST_VERSION_HASH, sceneNumber: 1 },
    })

    expect(response.statusCode).toBe(202)
    expect(response.json().success).toBe(true)
  })

  it('rejects mismatched executionId', async () => {
    seedParentAndPreviewJob()
    const app = makeApp()
    await app.register(adminLongFormVideoRoutes)
    await app.ready()

    const response = await app.inject({
      method: 'POST',
      url: '/api/admin/long-form-video/preview-scene/retry',
      headers: auth,
      payload: { executionId: 'wrong-exec-id', planId: TEST_PLAN_ID, versionHash: TEST_VERSION_HASH, sceneNumber: 1 },
    })

    expect(response.statusCode).toBe(404)
    expect(queue.add).not.toHaveBeenCalled()
  })

  it('rejects mismatched planId', async () => {
    seedParentAndPreviewJob()
    const app = makeApp()
    await app.register(adminLongFormVideoRoutes)
    await app.ready()

    const response = await app.inject({
      method: 'POST',
      url: '/api/admin/long-form-video/preview-scene/retry',
      headers: auth,
      payload: { executionId: TEST_EXECUTION_ID, planId: 'wrong-plan', versionHash: TEST_VERSION_HASH, sceneNumber: 1 },
    })

    expect(response.statusCode).toBe(409)
    expect(queue.add).not.toHaveBeenCalled()
  })

  it('rejects mismatched versionHash', async () => {
    seedParentAndPreviewJob()
    const app = makeApp()
    await app.register(adminLongFormVideoRoutes)
    await app.ready()

    const response = await app.inject({
      method: 'POST',
      url: '/api/admin/long-form-video/preview-scene/retry',
      headers: auth,
      payload: { executionId: TEST_EXECUTION_ID, planId: TEST_PLAN_ID, versionHash: 'wrong-hash', sceneNumber: 1 },
    })

    expect(response.statusCode).toBe(409)
    expect(queue.add).not.toHaveBeenCalled()
  })

  it('rejects mismatched sceneNumber', async () => {
    seedParentAndPreviewJob()
    const app = makeApp()
    await app.register(adminLongFormVideoRoutes)
    await app.ready()

    const response = await app.inject({
      method: 'POST',
      url: '/api/admin/long-form-video/preview-scene/retry',
      headers: auth,
      payload: { executionId: TEST_EXECUTION_ID, planId: TEST_PLAN_ID, versionHash: TEST_VERSION_HASH, sceneNumber: 99 },
    })

    expect(response.statusCode).toBe(404)
    expect(queue.add).not.toHaveBeenCalled()
  })

  it('rejects parent that is not planned', async () => {
    seedParentAndPreviewJob()
    const parent = db.jobs.find((j) => j.capability === 'long_form_video')
    parent.status = 'processing'

    const app = makeApp()
    await app.register(adminLongFormVideoRoutes)
    await app.ready()

    const response = await app.inject({
      method: 'POST',
      url: '/api/admin/long-form-video/preview-scene/retry',
      headers: auth,
      payload: { executionId: TEST_EXECUTION_ID, planId: TEST_PLAN_ID, versionHash: TEST_VERSION_HASH, sceneNumber: 1 },
    })

    expect(response.statusCode).toBe(409)
    expect(queue.add).not.toHaveBeenCalled()
  })

  it('rejects approved parent', async () => {
    seedParentAndPreviewJob()
    const parent = db.jobs.find((j) => j.capability === 'long_form_video')
    parent.metadataJson = JSON.stringify({ ...parentMetadata(), approved: true })

    const app = makeApp()
    await app.register(adminLongFormVideoRoutes)
    await app.ready()

    const response = await app.inject({
      method: 'POST',
      url: '/api/admin/long-form-video/preview-scene/retry',
      headers: auth,
      payload: { executionId: TEST_EXECUTION_ID, planId: TEST_PLAN_ID, versionHash: TEST_VERSION_HASH, sceneNumber: 1 },
    })

    expect(response.statusCode).toBe(409)
    expect(queue.add).not.toHaveBeenCalled()
  })

  it('BullMQ add failure returns non-2xx and persists failed status', async () => {
    seedParentAndPreviewJob()
    queue.add.mockRejectedValueOnce(new Error('redis connection refused'))

    const app = makeApp()
    await app.register(adminLongFormVideoRoutes)
    await app.ready()

    const response = await app.inject({
      method: 'POST',
      url: '/api/admin/long-form-video/preview-scene/retry',
      headers: auth,
      payload: { executionId: TEST_EXECUTION_ID, planId: TEST_PLAN_ID, versionHash: TEST_VERSION_HASH, sceneNumber: 1 },
    })

    expect(response.statusCode).toBe(500)
    const body = response.json()
    expect(body.error).toBe(true)
    expect(body.message).toContain('queue submission failed')

    const previewJob = db.jobs.find((j) => j.id === TEST_PREVIEW_JOB_ID)
    expect(previewJob.status).toBe('failed')
    expect(previewJob.error).toContain('redis connection refused')
    expect(previewJob.retryCount).toBe(1)
  })

  it('preserves exact prompt and inputJson', async () => {
    seedParentAndPreviewJob()
    const originalPrompt = 'Premium cinematic opening shot with professional lighting and dynamic camera movement'
    const originalInput = JSON.stringify({ duration: 10, aspectRatio: '16:9' })

    const app = makeApp()
    await app.register(adminLongFormVideoRoutes)
    await app.ready()

    await app.inject({
      method: 'POST',
      url: '/api/admin/long-form-video/preview-scene/retry',
      headers: auth,
      payload: { executionId: TEST_EXECUTION_ID, planId: TEST_PLAN_ID, versionHash: TEST_VERSION_HASH, sceneNumber: 1 },
    })

    const previewJob = db.jobs.find((j) => j.id === TEST_PREVIEW_JOB_ID)
    expect(previewJob.prompt).toBe(originalPrompt)
    expect(previewJob.inputJson).toBe(originalInput)

    const addCall = queue.add.mock.calls[0]
    expect(addCall[1].prompt).toBe(originalPrompt)
    expect(JSON.stringify(addCall[1].input)).toContain('"duration":10')
  })

  it('rejects provider/model override fields', async () => {
    seedParentAndPreviewJob()
    const app = makeApp()
    await app.register(adminLongFormVideoRoutes)
    await app.ready()

    const response = await app.inject({
      method: 'POST',
      url: '/api/admin/long-form-video/preview-scene/retry',
      headers: auth,
      payload: { executionId: TEST_EXECUTION_ID, planId: TEST_PLAN_ID, versionHash: TEST_VERSION_HASH, sceneNumber: 1, provider: 'openai', model: 'gpt-4' },
    })

    expect(response.statusCode).toBe(400)
    expect(response.json().message).toContain('Provider/model override')
    expect(queue.add).not.toHaveBeenCalled()
  })

  it('no TTS, music, subtitle or assembly jobs are created', async () => {
    seedParentAndPreviewJob()
    const app = makeApp()
    await app.register(adminLongFormVideoRoutes)
    await app.ready()

    await app.inject({
      method: 'POST',
      url: '/api/admin/long-form-video/preview-scene/retry',
      headers: auth,
      payload: { executionId: TEST_EXECUTION_ID, planId: TEST_PLAN_ID, versionHash: TEST_VERSION_HASH, sceneNumber: 1 },
    })

    const capabilities = db.jobs.map((j) => j.capability)
    expect(capabilities).not.toContain('tts')
    expect(capabilities).not.toContain('music_generation')
    expect(capabilities).not.toContain('subtitle')
  })

  it('requires admin authentication', async () => {
    seedParentAndPreviewJob()
    const app = makeApp()
    await app.register(adminLongFormVideoRoutes)
    await app.ready()

    const response = await app.inject({
      method: 'POST',
      url: '/api/admin/long-form-video/preview-scene/retry',
      headers: { authorization: 'Bearer bad-token' },
      payload: { executionId: TEST_EXECUTION_ID, planId: TEST_PLAN_ID, versionHash: TEST_VERSION_HASH, sceneNumber: 1 },
    })

    expect(response.statusCode).toBe(401)
    expect(queue.add).not.toHaveBeenCalled()
  })
})
