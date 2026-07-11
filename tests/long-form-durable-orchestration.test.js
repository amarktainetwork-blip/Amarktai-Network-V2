import { beforeEach, describe, expect, it, vi } from 'vitest'
import Fastify from 'fastify'

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
      prompt: data.prompt,
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
    if (where.OR && !where.OR.some((clause) => matchesWhere(job, clause))) return false
    if (where.id && job.id !== where.id) return false
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

  return {
    jobs,
    reset: () => {
      jobs.splice(0, jobs.length)
      counter = 0
      Object.values(jobApi).forEach((fn) => fn.mockClear())
    },
    prisma: {
      job: jobApi,
      artifact: {
        findMany: vi.fn(async () => []),
        findUnique: vi.fn(async () => null),
        findFirst: vi.fn(async () => null),
      },
      aiProvider: {
        findMany: vi.fn(async () => []),
      },
      $transaction: vi.fn(async (fn) => fn({ job: jobApi })),
    },
  }
})

const queue = vi.hoisted(() => ({
  add: vi.fn(async () => ({ id: 'queue-job' })),
  Queue: vi.fn(function Queue() {
    return { add: queue.add }
  }),
}))

vi.mock('@amarktai/db', () => ({ prisma: db.prisma, listProviderCredentialStatuses: vi.fn(async () => []) }))
vi.mock('bullmq', () => ({ Queue: queue.Queue }))

import { adminLongFormVideoRoutes } from '../apps/api/src/routes/admin-long-form-video.ts'
import { getRuntimeTruth, validateLongFormVideoRequest } from '../packages/core/src/index.ts'

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

function requestPayload(overrides = {}) {
  return {
    prompt: 'Create a durable long-form documentary about resilient orchestration',
    targetDurationSeconds: 60,
    sceneCount: 3,
    aspectRatio: '16:9',
    style: 'documentary',
    tone: 'informative',
    ...overrides,
  }
}

describe('durable long-form orchestration', () => {
  beforeEach(() => {
    db.reset()
    queue.add.mockReset()
    queue.add.mockResolvedValue({ id: 'queue-job' })
  })

  it('persists a parent job, plan, and exact linked scene jobs', async () => {
    const app = makeApp()
    await app.register(adminLongFormVideoRoutes)
    await app.ready()

    const response = await app.inject({
      method: 'POST',
      url: '/api/admin/long-form-video/executions',
      headers: auth,
      payload: requestPayload(),
    })

    expect(response.statusCode).toBe(202)
    const body = response.json()
    const parent = db.jobs.find((job) => job.id === body.parentJobId)
    const scenes = db.jobs.filter((job) => job.parentJobId === parent.id)
    const parentMeta = JSON.parse(parent.metadataJson)

    expect(parent.capability).toBe('long_form_video')
    expect(parent.executionId).toBe(body.executionId)
    expect(parentMeta.plan.storyboard.scenes).toHaveLength(3)
    expect(parentMeta.assemblyHandoff.parentJobId).toBe(parent.id)
    expect(scenes).toHaveLength(3)
    expect(scenes.map((scene) => scene.sceneNumber)).toEqual([1, 2, 3])
    expect(scenes.every((scene) => scene.executionId === parent.executionId)).toBe(true)
    expect(queue.add).toHaveBeenCalledTimes(3)

    await app.close()
  })

  it('does not use metadata substring lookup as canonical scene relation', async () => {
    const source = await import('node:fs/promises').then((fs) => fs.readFile('apps/api/src/routes/admin-long-form-video.ts', 'utf8'))
    expect(source).toContain('parentJobId')
    expect(source).not.toContain('metadataJson: { contains')
  })

  it('keeps partial queue failure recoverable', async () => {
    queue.add.mockResolvedValueOnce({ id: 'q1' }).mockRejectedValueOnce(new Error('redis hiccup')).mockResolvedValue({ id: 'q3' })
    const app = makeApp()
    await app.register(adminLongFormVideoRoutes)
    await app.ready()

    const response = await app.inject({
      method: 'POST',
      url: '/api/admin/long-form-video/executions',
      headers: auth,
      payload: requestPayload(),
    })

    expect(response.statusCode).toBe(207)
    const failedScene = db.jobs.find((job) => job.error?.includes('queue submission failed'))
    expect(failedScene.status).toBe('failed')
    expect(response.json().failedQueueSubmissions).toHaveLength(1)

    await app.close()
  })

  it('resume skips already queued scenes and does not duplicate queue jobs', async () => {
    const app = makeApp()
    await app.register(adminLongFormVideoRoutes)
    await app.ready()
    const create = await app.inject({ method: 'POST', url: '/api/admin/long-form-video/executions', headers: auth, payload: requestPayload() })
    const parentId = create.json().parentJobId
    queue.add.mockClear()

    const resume = await app.inject({ method: 'POST', url: `/api/admin/long-form-video/executions/${parentId}/resume`, headers: auth })

    expect(resume.statusCode).toBe(200)
    expect(queue.add).not.toHaveBeenCalled()
    expect(resume.json().queueResult.skipped).toHaveLength(3)

    await app.close()
  })

  it('retry is bounded and completed scenes cannot be retried', async () => {
    const app = makeApp()
    await app.register(adminLongFormVideoRoutes)
    await app.ready()
    const create = await app.inject({ method: 'POST', url: '/api/admin/long-form-video/executions', headers: auth, payload: requestPayload() })
    const parentId = create.json().parentJobId
    const scene = db.jobs.find((job) => job.parentJobId === parentId && job.sceneNumber === 1)
    await db.prisma.job.update({ where: { id: scene.id }, data: { status: 'failed', retryCount: 2, queueJobId: '', error: 'transient' } })

    const retry = await app.inject({ method: 'POST', url: `/api/admin/long-form-video/executions/${parentId}/scenes/1/retry`, headers: auth })
    expect(retry.statusCode).toBe(200)
    expect(db.jobs.find((job) => job.id === scene.id).retryCount).toBe(3)

    await db.prisma.job.update({ where: { id: scene.id }, data: { status: 'failed', retryCount: 3, queueJobId: '', error: 'still bad' } })
    const blocked = await app.inject({ method: 'POST', url: `/api/admin/long-form-video/executions/${parentId}/scenes/1/retry`, headers: auth })
    expect(blocked.statusCode).toBe(409)

    await db.prisma.job.update({ where: { id: scene.id }, data: { status: 'completed', artifactId: 'artifact-1' } })
    const completed = await app.inject({ method: 'POST', url: `/api/admin/long-form-video/executions/${parentId}/scenes/1/retry`, headers: auth })
    expect(completed.statusCode).toBe(409)

    await app.close()
  })

  it('derives durable status, partial failure, and completed-only progress after restart', async () => {
    const app = makeApp()
    await app.register(adminLongFormVideoRoutes)
    await app.ready()
    const create = await app.inject({ method: 'POST', url: '/api/admin/long-form-video/executions', headers: auth, payload: requestPayload() })
    const parentId = create.json().parentJobId
    const scenes = db.jobs.filter((job) => job.parentJobId === parentId)
    await db.prisma.job.update({ where: { id: scenes[0].id }, data: { status: 'completed', artifactId: 'artifact-1', progress: 100 } })
    await db.prisma.job.update({ where: { id: scenes[1].id }, data: { status: 'failed', error: 'provider failed', progress: 0 } })

    const status = await app.inject({ method: 'GET', url: `/api/admin/long-form-video/executions/${parentId}`, headers: auth })
    const execution = status.json().execution

    expect(status.statusCode).toBe(200)
    expect(execution.completedScenes).toBe(1)
    expect(execution.failedScenes).toBe(1)
    expect(execution.progress).toBe(33)
    expect(execution.partialFailure).toBe(true)
    expect(execution.assemblyHandoff.orderedSceneArtifactIds).toEqual(['artifact-1'])

    await app.close()
  })

  it('rejects provider overrides and cross-app parent access', async () => {
    const app = makeApp()
    await app.register(adminLongFormVideoRoutes)
    await app.ready()

    const override = await app.inject({
      method: 'POST',
      url: '/api/admin/long-form-video/executions',
      headers: auth,
      payload: requestPayload({ provider: 'genx' }),
    })
    expect(override.statusCode).toBe(400)

    db.jobs.push({
      id: 'foreign-parent',
      appSlug: 'other-app',
      capability: 'long_form_video',
      prompt: 'foreign',
      inputJson: '{}',
      metadataJson: '{}',
      traceId: '',
      status: 'queued',
      provider: '',
      model: '',
      artifactId: null,
      progress: 0,
      output: null,
      error: null,
      callbackUrl: null,
      providerClaimAt: null,
      parentJobId: null,
      executionId: 'foreign-execution',
      sceneNumber: null,
      workflowPhase: '',
      retryCount: 0,
      queueJobId: '',
      queuedAt: null,
      createdAt: new Date(),
      startedAt: null,
      completedAt: null,
      updatedAt: new Date(),
    })
    const foreign = await app.inject({ method: 'GET', url: '/api/admin/long-form-video/executions/foreign-parent', headers: auth })
    expect(foreign.statusCode).toBe(404)

    await app.close()
  })

  it('keeps batch structure without submitting multiple parent outcomes', async () => {
    const parsed = validateLongFormVideoRequest(requestPayload({ count: 3 }))
    expect(parsed.count).toBe(3)

    const app = makeApp()
    await app.register(adminLongFormVideoRoutes)
    await app.ready()
    const response = await app.inject({ method: 'POST', url: '/api/admin/long-form-video/executions', headers: auth, payload: requestPayload({ count: 3 }) })
    const parentJobs = db.jobs.filter((job) => job.capability === 'long_form_video')
    const meta = JSON.parse(parentJobs[0].metadataJson)

    expect(response.statusCode).toBe(202)
    expect(parentJobs).toHaveLength(1)
    expect(meta.batch).toMatchObject({ count: 3, index: 1, batchReady: true })

    await app.close()
  })

  it('canonical truth exposes durable components while full multimedia remains false', () => {
    const longForm = getRuntimeTruth().capabilities.find((capability) => capability.capability === 'long_form_video')
    expect(longForm.durableParentReady).toBe(true)
    expect(longForm.durablePlanReady).toBe(true)
    expect(longForm.sceneLinkageReady).toBe(true)
    expect(longForm.retryResumeReady).toBe(true)
    expect(longForm.assemblyHandoffReady).toBe(true)
    expect(longForm.fullMultimediaReady).toBe(false)
    expect(longForm.liveProven).toBe(false)
  })
})
