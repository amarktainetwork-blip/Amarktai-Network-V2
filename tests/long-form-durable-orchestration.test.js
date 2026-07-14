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
    if (where.status?.notIn && where.status.notIn.includes(job.status)) return false
    if (typeof where.status === 'string' && job.status !== where.status) return false
    if (where.retryCount !== undefined && job.retryCount !== where.retryCount) return false
    if (where.providerClaimAt === null && job.providerClaimAt !== null) return false
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

  const refreshLongFormParentState = vi.fn(async (parentJobId) => {
    const parent = jobs.find((job) => job.id === parentJobId)
    if (!parent) return null
    const sceneJobs = jobs
      .filter((job) => job.parentJobId === parent.id && job.capability === 'video_generation')
      .sort((a, b) => (a.sceneNumber ?? 0) - (b.sceneNumber ?? 0))
    const metadata = JSON.parse(parent.metadataJson || '{}')
    const completed = sceneJobs.filter((job) => job.status === 'completed')
    const failed = sceneJobs.filter((job) => job.status === 'failed')
    const cancelled = sceneJobs.filter((job) => job.status === 'cancelled')
    const cancelling = sceneJobs.filter((job) => job.status === 'cancelling')
    const planned = sceneJobs.filter((job) => job.status === 'planned')
    const total = sceneJobs.length || metadata.plannedSceneCount || 0
    const completedArtifactIds = completed
      .filter((job) => job.artifactId)
      .map((job) => job.artifactId)
    const progress = total > 0 ? Math.round((completed.length / total) * 100) : 0
    const parentIsCancelled = parent.status === 'cancelled'
    const parentIsCancelling = parent.status === 'cancelling'
    const assemblyHandoff = {
      ...(metadata.assemblyHandoff ?? {}),
      parentJobId: parent.id,
      executionId: parent.executionId,
      orderedSceneArtifactIds: completedArtifactIds,
      expectedSceneCount: total,
      assemblyStatus: parentIsCancelled
        ? 'cancelled'
        : completed.length === total && total > 0
          ? 'ready_for_video_only'
          : 'waiting_for_scenes',
      missingDependencies: [
        ...(completed.length === total && !parentIsCancelled ? [] : ['scene_artifacts_pending']),
        'full_multimedia_assembly_pending',
      ],
    }
    const finalAssemblyReady = !parentIsCancelled && !parentIsCancelling && completed.length === total && total > 0 && failed.length === 0 && cancelled.length === 0 && cancelling.length === 0
    const nextMetadata = {
      ...metadata,
      plannedSceneCount: total,
      completedSceneCount: completed.length,
      failedSceneCount: failed.length,
      cancelledSceneCount: cancelled.length,
      cancellingSceneCount: cancelling.length,
      progress,
      partialFailure: failed.length > 0 && completed.length < total,
      completedArtifactIds,
      retryableFailures: failed.filter((job) => job.retryCount < 3).map((job) => ({ jobId: job.id, sceneNumber: job.sceneNumber })),
      finalAssemblyReady,
      currentPhase: parentIsCancelled
        ? 'cancelled'
        : cancelling.length > 0
          ? 'cancellation_requested'
          : planned.length === total && total > 0
            ? 'planned'
            : failed.length > 0
              ? 'partial_failure'
              : finalAssemblyReady
                ? 'assembly_handoff_ready'
                : 'scene_execution',
      assemblyHandoff,
    }
    parent.metadataJson = JSON.stringify(nextMetadata)
    parent.progress = progress
    parent.workflowPhase = nextMetadata.currentPhase
    if (parentIsCancelled && !parent.completedAt) parent.completedAt = new Date()
    parent.updatedAt = new Date()
    return { parent, sceneJobs, metadata: nextMetadata }
  })

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
      artifact: {
        findMany: vi.fn(async () => []),
        findUnique: vi.fn(async () => null),
        findFirst: vi.fn(async () => null),
      },
      aiProvider: {
        findMany: vi.fn(async () => []),
      },
      appCapabilityGrant: {
        findUnique: vi.fn(async ({ where }) => {
          const { appSlug, capability } = where.app_capability_grant_unique
          return {
            appSlug,
            capability,
            enabled: true,
            qualityFloor: 'balanced',
            budgetPolicy: 'balanced',
            maxCostPerRequest: 0,
            maxCostPerWorkflow: 0,
            latencyPreference: 'medium',
            allowFallback: true,
            maxFallbackAttempts: 3,
            liveProofRequired: false,
            approvalRequired: false,
            artifactRead: true,
            artifactWrite: true,
            memoryRead: false,
            memoryWrite: false,
            ragNamespaces: '[]',
            policyProfile: 'test',
            adultPermission: false,
            dataRetentionPolicy: 'default',
            passthroughModelAllowed: false,
            providerResidencyConstraints: '[]',
          }
        }),
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
    const childJobs = db.jobs.filter((job) => job.parentJobId === parent.id)
    const scenes = childJobs.filter((job) => job.capability === 'video_generation')
    const voiceovers = childJobs.filter((job) => job.capability === 'tts')
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

  it('migration covers every durable Job field, index, and self relation', async () => {
    const source = await import('node:fs/promises').then((fs) => fs.readFile('prisma/migrations/20260711_add_job_orchestration/migration.sql', 'utf8'))
    for (const column of ['provider_claim_at', 'parent_job_id', 'execution_id', 'scene_number', 'workflow_phase', 'retry_count', 'queue_job_id', 'queued_at']) {
      expect(source).toContain(`\`${column}\``)
    }
    expect(source).toContain('jobs_parent_job_id_idx')
    expect(source).toContain('jobs_execution_id_idx')
    expect(source).toContain('jobs_app_slug_execution_id_idx')
    expect(source).toContain('jobs_parent_job_id_scene_number_idx')
    expect(source).toContain('FOREIGN KEY (`parent_job_id`) REFERENCES `jobs`(`id`)')
    expect(source).toContain('ON DELETE SET NULL')
    expect(source).not.toMatch(/DROP TABLE|CREATE TABLE `jobs`/i)
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
    expect(resume.json().queueResult.queued).toHaveLength(0)
    expect(resume.json().queueResult.failed).toHaveLength(0)

    await app.close()
  })

  it('dry-run persists planned state without pretending scenes are queued', async () => {
    const app = makeApp()
    await app.register(adminLongFormVideoRoutes)
    await app.ready()

    const create = await app.inject({
      method: 'POST',
      url: '/api/admin/long-form-video/executions',
      headers: auth,
      payload: requestPayload({ dryRun: true }),
    })
    const body = create.json()
    const parent = db.jobs.find((job) => job.id === body.parentJobId)
    const scenes = db.jobs.filter((job) => job.parentJobId === parent.id && job.capability === 'video_generation')
    const voiceovers = db.jobs.filter((job) => job.parentJobId === parent.id && job.capability === 'tts')

    expect(create.statusCode).toBe(200)
    expect(parent.status).toBe('planned')
    expect(scenes.every((scene) => scene.status === 'planned')).toBe(true)
    expect(scenes.every((scene) => scene.queueJobId === '' && scene.queuedAt === null)).toBe(true)
    expect(queue.add).not.toHaveBeenCalled()

    const resume = await app.inject({ method: 'POST', url: `/api/admin/long-form-video/executions/${parent.id}/resume`, headers: auth })
    expect(resume.statusCode).toBe(200)
    expect(queue.add).toHaveBeenCalledTimes(3)

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

  it('retry resets stale provider claim, removes old queue job, and keeps remote GenX id for resume', async () => {
    const app = makeApp()
    await app.register(adminLongFormVideoRoutes)
    await app.ready()
    const create = await app.inject({ method: 'POST', url: '/api/admin/long-form-video/executions', headers: auth, payload: requestPayload() })
    const parentId = create.json().parentJobId
    const scene = db.jobs.find((job) => job.parentJobId === parentId && job.sceneNumber === 1)
    await db.prisma.job.update({
      where: { id: scene.id },
      data: {
        status: 'failed',
        retryCount: 1,
        queueJobId: 'old-failed-queue-job',
        providerClaimAt: new Date('2026-07-10T00:00:00Z'),
        error: 'transient',
        metadataJson: JSON.stringify({ ...JSON.parse(scene.metadataJson), genxProviderJobId: 'remote-genx-1' }),
      },
    })
    queue.add.mockClear()

    const retry = await app.inject({ method: 'POST', url: `/api/admin/long-form-video/executions/${parentId}/scenes/1/retry`, headers: auth })
    const updated = db.jobs.find((job) => job.id === scene.id)

    expect(retry.statusCode).toBe(200)
    expect(queue.getJob).toHaveBeenCalledWith('old-failed-queue-job')
    expect(queue.remove).toHaveBeenCalled()
    expect(updated.retryCount).toBe(2)
    expect(updated.providerClaimAt).toBeNull()
    expect(updated.queueJobId).toBe(`${scene.id}:attempt:2`)
    expect(JSON.parse(updated.metadataJson).genxProviderJobId).toBe('remote-genx-1')
    expect(queue.add).toHaveBeenCalledTimes(1)

    await app.close()
  })

  it('concurrent retry requests produce one queue attempt', async () => {
    const app = makeApp()
    await app.register(adminLongFormVideoRoutes)
    await app.ready()
    const create = await app.inject({ method: 'POST', url: '/api/admin/long-form-video/executions', headers: auth, payload: requestPayload() })
    const parentId = create.json().parentJobId
    const scene = db.jobs.find((job) => job.parentJobId === parentId && job.sceneNumber === 1)
    await db.prisma.job.update({ where: { id: scene.id }, data: { status: 'failed', retryCount: 0, queueJobId: '', error: 'transient' } })
    queue.add.mockClear()

    const [first, second] = await Promise.all([
      app.inject({ method: 'POST', url: `/api/admin/long-form-video/executions/${parentId}/scenes/1/retry`, headers: auth }),
      app.inject({ method: 'POST', url: `/api/admin/long-form-video/executions/${parentId}/scenes/1/retry`, headers: auth }),
    ])

    expect([first.statusCode, second.statusCode].sort()).toEqual([200, 409])
    expect(queue.add).toHaveBeenCalledTimes(1)
    expect(db.jobs.find((job) => job.id === scene.id).retryCount).toBe(1)

    await app.close()
  })

  it('cancels queued scenes by removing BullMQ jobs and keeps completed artifacts', async () => {
    const app = makeApp()
    await app.register(adminLongFormVideoRoutes)
    await app.ready()
    const create = await app.inject({ method: 'POST', url: '/api/admin/long-form-video/executions', headers: auth, payload: requestPayload() })
    const parentId = create.json().parentJobId
    const scenes = db.jobs.filter((job) => job.parentJobId === parentId && job.capability === 'video_generation')
    await db.prisma.job.update({ where: { id: scenes[0].id }, data: { status: 'completed', artifactId: 'artifact-stays', progress: 100 } })

    const cancel = await app.inject({ method: 'POST', url: `/api/admin/long-form-video/executions/${parentId}/cancel`, headers: auth })
    const updatedScenes = db.jobs.filter((job) => job.parentJobId === parentId && job.capability === 'video_generation')

    expect(cancel.statusCode).toBe(200)
    expect(cancel.json().cancellation.locallyCancelled).toBe(true)
    expect(cancel.json().cancellation.resumable).toBe(false)
    expect(cancel.json().cancellation.assemblyAllowed).toBe(false)
    expect(queue.getJob).toHaveBeenCalled()
    expect(queue.remove).toHaveBeenCalled()
    expect(updatedScenes.find((scene) => scene.id === scenes[0].id).status).toBe('completed')
    expect(updatedScenes.find((scene) => scene.id === scenes[0].id).artifactId).toBe('artifact-stays')
    expect(updatedScenes.filter((scene) => scene.id !== scenes[0].id).every((scene) => scene.status === 'cancelled')).toBe(true)
    expect(db.jobs.find((job) => job.id === parentId).status).toBe('cancelled')

    const resume = await app.inject({ method: 'POST', url: `/api/admin/long-form-video/executions/${parentId}/resume`, headers: auth })
    expect(resume.statusCode).toBe(409)

    await app.close()
  })

  it('active scene cancellation records remote execution may finish without reactivating parent', async () => {
    const app = makeApp()
    await app.register(adminLongFormVideoRoutes)
    await app.ready()
    const create = await app.inject({ method: 'POST', url: '/api/admin/long-form-video/executions', headers: auth, payload: requestPayload() })
    const parentId = create.json().parentJobId
    const scene = db.jobs.find((job) => job.parentJobId === parentId && job.sceneNumber === 1)
    await db.prisma.job.update({ where: { id: scene.id }, data: { status: 'processing', providerClaimAt: new Date() } })

    const cancel = await app.inject({ method: 'POST', url: `/api/admin/long-form-video/executions/${parentId}/cancel`, headers: auth })
    const updatedScene = db.jobs.find((job) => job.id === scene.id)

    expect(cancel.statusCode).toBe(200)
    expect(cancel.json().cancellation.remoteExecutionMayFinish).toBe(true)
    expect(cancel.json().cancellation.lateArtifactLinked).toBe(false)
    expect(cancel.json().cancellation.resumable).toBe(false)
    expect(cancel.json().cancellation.assemblyAllowed).toBe(false)
    expect(cancel.json().cancellation.locallyCancelled).toBe(true)
    expect(updatedScene.status).toBe('cancelled')
    expect(updatedScene.workflowPhase).toBe('cancelled_remote_may_finish')
    expect(db.jobs.find((job) => job.id === parentId).status).toBe('cancelled')

    await app.close()
  })

  it('derives durable status, partial failure, and completed-only progress after restart', async () => {
    const app = makeApp()
    await app.register(adminLongFormVideoRoutes)
    await app.ready()
    const create = await app.inject({ method: 'POST', url: '/api/admin/long-form-video/executions', headers: auth, payload: requestPayload() })
    const parentId = create.json().parentJobId
    const scenes = db.jobs.filter((job) => job.parentJobId === parentId && job.capability === 'video_generation')
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

  it('refresh persists ordered handoff and partial-failure state from durable children', async () => {
    const app = makeApp()
    await app.register(adminLongFormVideoRoutes)
    await app.ready()
    const create = await app.inject({ method: 'POST', url: '/api/admin/long-form-video/executions', headers: auth, payload: requestPayload() })
    const parentId = create.json().parentJobId
    const scenes = db.jobs.filter((job) => job.parentJobId === parentId && job.capability === 'video_generation')
    expect(JSON.parse(db.jobs.find((job) => job.id === parentId).metadataJson).assemblyHandoff.orderedSceneArtifactIds).toEqual([])

    await db.prisma.job.update({ where: { id: scenes[2].id }, data: { status: 'completed', artifactId: 'artifact-3', progress: 100 } })
    await db.prisma.job.update({ where: { id: scenes[0].id }, data: { status: 'completed', artifactId: 'artifact-1', progress: 100 } })
    await db.refreshLongFormParentState(parentId)
    let metadata = JSON.parse(db.jobs.find((job) => job.id === parentId).metadataJson)
    expect(metadata.assemblyHandoff.orderedSceneArtifactIds).toEqual(['artifact-1', 'artifact-3'])
    expect(metadata.progress).toBe(67)

    await db.prisma.job.update({ where: { id: scenes[1].id }, data: { status: 'failed', error: 'provider failed' } })
    await db.refreshLongFormParentState(parentId)
    metadata = JSON.parse(db.jobs.find((job) => job.id === parentId).metadataJson)
    expect(metadata.partialFailure).toBe(true)
    expect(metadata.failedSceneCount).toBe(1)

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

  it('keeps same-looking execution identifiers scoped by appSlug', async () => {
    db.jobs.push({
      id: 'foreign-parent-first',
      appSlug: 'other-app',
      capability: 'long_form_video',
      prompt: 'foreign',
      inputJson: '{}',
      metadataJson: JSON.stringify({ request: requestPayload(), plan: { id: 'foreign-plan', storyboard: { scenes: [] } } }),
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
      executionId: 'same-execution',
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
    const app = makeApp()
    await app.register(adminLongFormVideoRoutes)
    await app.ready()
    const create = await app.inject({ method: 'POST', url: '/api/admin/long-form-video/executions', headers: auth, payload: requestPayload() })
    const parent = db.jobs.find((job) => job.id === create.json().parentJobId)
    parent.executionId = 'same-execution'

    const status = await app.inject({ method: 'GET', url: '/api/admin/long-form-video/executions/same-execution', headers: auth })
    expect(status.statusCode).toBe(200)
    expect(status.json().execution.parent.appSlug).toBe('dashboard-long-form')

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

  it('core-only canonical truth does not invent API component evidence', () => {
    const longForm = getRuntimeTruth().capabilities.find((capability) => capability.capability === 'long_form_video')
    expect(longForm.durableParentReady).toBe(false)
    expect(longForm.durablePlanReady).toBe(false)
    expect(longForm.sceneLinkageReady).toBe(false)
    expect(longForm.retryResumeReady).toBe(false)
    expect(longForm.assemblyHandoffReady).toBe(false)
    expect(longForm.fullMultimediaReady).toBe(false)
    expect(longForm.liveProven).toBe(false)
  })

  it('cancelling a queued scene results in cancelled', async () => {
    const app = makeApp()
    await app.register(adminLongFormVideoRoutes)
    await app.ready()
    const create = await app.inject({ method: 'POST', url: '/api/admin/long-form-video/executions', headers: auth, payload: requestPayload() })
    const parentId = create.json().parentJobId
    const scene = db.jobs.find((job) => job.parentJobId === parentId && job.sceneNumber === 1)
    expect(scene.status).toBe('queued')

    const cancel = await app.inject({ method: 'POST', url: `/api/admin/long-form-video/executions/${parentId}/cancel`, headers: auth })
    const updatedScene = db.jobs.find((job) => job.id === scene.id)

    expect(cancel.statusCode).toBe(200)
    expect(updatedScene.status).toBe('cancelled')
    expect(updatedScene.completedAt).toBeInstanceOf(Date)
    await app.close()
  })

  it('cancelling a processing scene results in a durable local terminal state', async () => {
    const app = makeApp()
    await app.register(adminLongFormVideoRoutes)
    await app.ready()
    const create = await app.inject({ method: 'POST', url: '/api/admin/long-form-video/executions', headers: auth, payload: requestPayload() })
    const parentId = create.json().parentJobId
    const scene = db.jobs.find((job) => job.parentJobId === parentId && job.sceneNumber === 1)
    await db.prisma.job.update({ where: { id: scene.id }, data: { status: 'processing', providerClaimAt: new Date() } })

    const cancel = await app.inject({ method: 'POST', url: `/api/admin/long-form-video/executions/${parentId}/cancel`, headers: auth })
    const updatedScene = db.jobs.find((job) => job.id === scene.id)

    expect(cancel.statusCode).toBe(200)
    expect(updatedScene.status).toBe('cancelled')
    expect(updatedScene.completedAt).toBeInstanceOf(Date)
    expect(updatedScene.workflowPhase).toBe('cancelled_remote_may_finish')
    expect(updatedScene.providerClaimAt).not.toBeNull()
    await app.close()
  })

  it('a claimed remote provider job may finish but cannot reactivate the scene', async () => {
    const app = makeApp()
    await app.register(adminLongFormVideoRoutes)
    await app.ready()
    const create = await app.inject({ method: 'POST', url: '/api/admin/long-form-video/executions', headers: auth, payload: requestPayload() })
    const parentId = create.json().parentJobId
    const scene = db.jobs.find((job) => job.parentJobId === parentId && job.sceneNumber === 1)
    await db.prisma.job.update({ where: { id: scene.id }, data: { status: 'processing', providerClaimAt: new Date() } })
    await app.inject({ method: 'POST', url: `/api/admin/long-form-video/executions/${parentId}/cancel`, headers: auth })

    const updatedScene = db.jobs.find((job) => job.id === scene.id)
    expect(updatedScene.status).toBe('cancelled')

    await db.prisma.job.update({ where: { id: scene.id }, data: { status: 'completed', artifactId: 'late-artifact' } })
    await db.refreshLongFormParentState(parentId)
    const parent = db.jobs.find((job) => job.id === parentId)

    expect(parent.status).toBe('cancelled')
    await app.close()
  })

  it('late success cannot mark the cancelled scene completed via worker guard', async () => {
    const parentMeta = { parentJobId: 'test-parent' }
    const { createJobProcessor } = await import('../apps/worker/src/processors/job-processor.ts')
    const cancelledJob = {
      id: 'late-scene',
      appSlug: 'dashboard-long-form',
      capability: 'video_generation',
      prompt: 'test',
      inputJson: '{}',
      metadataJson: JSON.stringify(parentMeta),
      traceId: 'trace',
      status: 'cancelled',
      provider: '',
      model: '',
      artifactId: null,
      progress: 0,
      output: null,
      error: null,
      callbackUrl: null,
      providerClaimAt: null,
      parentJobId: 'test-parent',
      executionId: 'exec',
      sceneNumber: 1,
      workflowPhase: 'cancelled_remote_may_finish',
      retryCount: 0,
      queueJobId: '',
      queuedAt: null,
      createdAt: new Date(),
      startedAt: null,
      completedAt: new Date(),
      updatedAt: new Date(),
    }

    db.jobs.push(cancelledJob)
    const processor = createJobProcessor({
      executeCapability: async () => ({ success: true, status: 'completed', artifactId: 'late-artifact-id' }),
    })

    const result = await processor({
      jobId: 'late-scene',
      appSlug: 'dashboard-long-form',
      capability: 'video_generation',
      prompt: 'test',
      traceId: 'trace',
    })

    expect(result.metadata?.skippedTerminalOverwrite || result.metadata?.lateResultDiscarded || result.metadata?.skipped).toBe(true)
    expect(db.jobs.find((job) => job.id === 'late-scene').status).toBe('cancelled')
    expect(db.jobs.find((job) => job.id === 'late-scene').artifactId).toBeNull()

    db.jobs.splice(db.jobs.indexOf(cancelledJob), 1)
  })

  it('late failure cannot change the cancelled scene to failed', async () => {
    const parentMeta = { parentJobId: 'test-parent-2' }
    const { createJobProcessor } = await import('../apps/worker/src/processors/job-processor.ts')
    const cancelledJob = {
      id: 'late-scene-fail',
      appSlug: 'dashboard-long-form',
      capability: 'video_generation',
      prompt: 'test',
      inputJson: '{}',
      metadataJson: JSON.stringify(parentMeta),
      traceId: 'trace',
      status: 'cancelled',
      provider: '',
      model: '',
      artifactId: null,
      progress: 0,
      output: null,
      error: null,
      callbackUrl: null,
      providerClaimAt: null,
      parentJobId: 'test-parent-2',
      executionId: 'exec-2',
      sceneNumber: 1,
      workflowPhase: 'cancelled',
      retryCount: 0,
      queueJobId: '',
      queuedAt: null,
      createdAt: new Date(),
      startedAt: null,
      completedAt: new Date(),
      updatedAt: new Date(),
    }

    db.jobs.push(cancelledJob)
    const processor = createJobProcessor({
      executeCapability: async () => ({ success: false, status: 'failed', error: 'provider failed' }),
    })

    const result = await processor({
      jobId: 'late-scene-fail',
      appSlug: 'dashboard-long-form',
      capability: 'video_generation',
      prompt: 'test',
      traceId: 'trace',
    })

    expect(result.metadata?.skipped).toBe(true)
    expect(result.metadata?.terminalStatus).toBe('cancelled')
    expect(db.jobs.find((job) => job.id === 'late-scene-fail').status).toBe('cancelled')

    db.jobs.splice(db.jobs.indexOf(cancelledJob), 1)
  })

  it('parent becomes and remains cancelled after refresh', async () => {
    const app = makeApp()
    await app.register(adminLongFormVideoRoutes)
    await app.ready()
    const create = await app.inject({ method: 'POST', url: '/api/admin/long-form-video/executions', headers: auth, payload: requestPayload() })
    const parentId = create.json().parentJobId

    const cancel = await app.inject({ method: 'POST', url: `/api/admin/long-form-video/executions/${parentId}/cancel`, headers: auth })
    expect(cancel.statusCode).toBe(200)
    expect(cancel.json().execution.parent.status).toBe('cancelled')

    const scenes = db.jobs.filter((job) => job.parentJobId === parentId && job.capability === 'video_generation')
    for (const scene of scenes) {
      if (scene.status === 'completed') continue
      await db.prisma.job.update({ where: { id: scene.id }, data: { status: 'completed', artifactId: `artifact-${scene.sceneNumber}` } })
    }
    await db.refreshLongFormParentState(parentId)
    const parent = db.jobs.find((job) => job.id === parentId)
    expect(parent.status).toBe('cancelled')
    expect(parent.completedAt).toBeInstanceOf(Date)

    await app.close()
  })

  it('cancelled parent cannot resume', async () => {
    const app = makeApp()
    await app.register(adminLongFormVideoRoutes)
    await app.ready()
    const create = await app.inject({ method: 'POST', url: '/api/admin/long-form-video/executions', headers: auth, payload: requestPayload() })
    const parentId = create.json().parentJobId

    await app.inject({ method: 'POST', url: `/api/admin/long-form-video/executions/${parentId}/cancel`, headers: auth })
    const resume = await app.inject({ method: 'POST', url: `/api/admin/long-form-video/executions/${parentId}/resume`, headers: auth })
    expect(resume.statusCode).toBe(409)

    await app.close()
  })

  it('cancelled parent cannot retry scenes', async () => {
    const app = makeApp()
    await app.register(adminLongFormVideoRoutes)
    await app.ready()
    const create = await app.inject({ method: 'POST', url: '/api/admin/long-form-video/executions', headers: auth, payload: requestPayload() })
    const parentId = create.json().parentJobId
    const scene = db.jobs.find((job) => job.parentJobId === parentId && job.sceneNumber === 1)
    await db.prisma.job.update({ where: { id: scene.id }, data: { status: 'failed', error: 'provider failed' } })

    await app.inject({ method: 'POST', url: `/api/admin/long-form-video/executions/${parentId}/cancel`, headers: auth })
    const retry = await app.inject({ method: 'POST', url: `/api/admin/long-form-video/executions/${parentId}/scenes/1/retry`, headers: auth })
    expect(retry.statusCode).toBe(409)

    await app.close()
  })

  it('cancelled parent cannot run assembly dry-run', async () => {
    const app = makeApp()
    await app.register(adminLongFormVideoRoutes)
    await app.ready()
    const create = await app.inject({ method: 'POST', url: '/api/admin/long-form-video/executions', headers: auth, payload: requestPayload() })
    const parentId = create.json().parentJobId

    await app.inject({ method: 'POST', url: `/api/admin/long-form-video/executions/${parentId}/cancel`, headers: auth })
    const assemble = await app.inject({ method: 'POST', url: `/api/admin/long-form-video/assemble/${parentId}`, headers: auth, payload: { dryRun: true } })
    expect(assemble.statusCode).toBe(409)
    expect(assemble.json().message).toContain('cancelled')

    await app.close()
  })

  it('cancelled parent cannot run real assembly', async () => {
    const app = makeApp()
    await app.register(adminLongFormVideoRoutes)
    await app.ready()
    const create = await app.inject({ method: 'POST', url: '/api/admin/long-form-video/executions', headers: auth, payload: requestPayload() })
    const parentId = create.json().parentJobId

    await app.inject({ method: 'POST', url: `/api/admin/long-form-video/executions/${parentId}/cancel`, headers: auth })
    const assemble = await app.inject({ method: 'POST', url: `/api/admin/long-form-video/assemble/${parentId}`, headers: auth, payload: {} })
    expect(assemble.statusCode).toBe(409)

    await app.close()
  })

  it('all scenes completed before cancellation still does not permit assembly', async () => {
    const app = makeApp()
    await app.register(adminLongFormVideoRoutes)
    await app.ready()
    const create = await app.inject({ method: 'POST', url: '/api/admin/long-form-video/executions', headers: auth, payload: requestPayload() })
    const parentId = create.json().parentJobId
    const scenes = db.jobs.filter((job) => job.parentJobId === parentId && job.capability === 'video_generation')
    for (const scene of scenes) {
      await db.prisma.job.update({ where: { id: scene.id }, data: { status: 'completed', artifactId: `artifact-${scene.sceneNumber}`, progress: 100 } })
    }

    await app.inject({ method: 'POST', url: `/api/admin/long-form-video/executions/${parentId}/cancel`, headers: auth })
    const assemble = await app.inject({ method: 'POST', url: `/api/admin/long-form-video/assemble/${parentId}`, headers: auth, payload: { dryRun: true } })
    expect(assemble.statusCode).toBe(409)

    await app.close()
  })

  it('cancellation keeps existing completed scene artifacts intact', async () => {
    const app = makeApp()
    await app.register(adminLongFormVideoRoutes)
    await app.ready()
    const create = await app.inject({ method: 'POST', url: '/api/admin/long-form-video/executions', headers: auth, payload: requestPayload() })
    const parentId = create.json().parentJobId
    const scene = db.jobs.find((job) => job.parentJobId === parentId && job.sceneNumber === 1)
    await db.prisma.job.update({ where: { id: scene.id }, data: { status: 'completed', artifactId: 'preserved-artifact', progress: 100 } })

    await app.inject({ method: 'POST', url: `/api/admin/long-form-video/executions/${parentId}/cancel`, headers: auth })
    const updatedScene = db.jobs.find((job) => job.id === scene.id)
    expect(updatedScene.status).toBe('completed')
    expect(updatedScene.artifactId).toBe('preserved-artifact')

    await app.close()
  })

  it('canonical truth does not treat a cancelled late result as long-form live proof', () => {
    const longForm = getRuntimeTruth().capabilities.find((capability) => capability.capability === 'long_form_video')
    expect(longForm.fullMultimediaReady).toBe(false)
    expect(longForm.liveProven).toBe(false)
  })

  it('normal non-cancelled long-form behavior does not regress', async () => {
    const app = makeApp()
    await app.register(adminLongFormVideoRoutes)
    await app.ready()
    const create = await app.inject({ method: 'POST', url: '/api/admin/long-form-video/executions', headers: auth, payload: requestPayload() })
    const parentId = create.json().parentJobId
    const scenes = db.jobs.filter((job) => job.parentJobId === parentId && job.capability === 'video_generation')
    for (const scene of scenes) {
      await db.prisma.job.update({ where: { id: scene.id }, data: { status: 'completed', artifactId: `artifact-${scene.sceneNumber}`, progress: 100 } })
    }
    await db.refreshLongFormParentState(parentId)

    const status = await app.inject({ method: 'GET', url: `/api/admin/long-form-video/executions/${parentId}`, headers: auth })
    const execution = status.json().execution

    expect(execution.completedScenes).toBe(3)
    expect(execution.failedScenes).toBe(0)
    expect(execution.cancelledScenes).toBe(0)
    expect(execution.progress).toBe(100)
    expect(execution.finalAssemblyReady).toBe(true)
    expect(execution.locallyCancelled).toBe(false)
    expect(execution.assemblyAllowed).toBe(true)
    expect(execution.resumable).toBe(true)

    await app.close()
  })
})
