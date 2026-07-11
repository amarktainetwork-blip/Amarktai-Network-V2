import type { FastifyInstance, FastifyReply, FastifyRequest } from 'fastify'
import { randomUUID } from 'node:crypto'
import { Queue } from 'bullmq'
import { prisma, refreshLongFormParentState } from '@amarktai/db'
import { saveArtifact } from '@amarktai/artifacts'
import {
  BLOCKED_OVERRIDE_FIELDS,
  DEFAULT_JOB_OPTIONS,
  QUEUE_NAMES,
  createLongFormVideoPlan,
  createSceneExecutionPayloads,
  generateSubtitles,
  getSubtitleMimeType,
  isValidRoutingMode,
  validateLongFormVideoRequest,
  type JobPayload,
  type LongFormVideoPlan,
  type LongFormVideoRequest,
} from '@amarktai/core'
import {
  assembleLongFormVideo,
  checkFfmpegAvailable,
  createAssemblyPlan,
  resolveSceneArtifacts,
  validateSceneArtifactsForAssembly,
} from '../lib/long-form-assembly.js'
import { buildAdminRuntimeTruth } from '../lib/admin-runtime-truth.js'

const APP_SLUG = 'dashboard-long-form'
const MAX_SCENE_RETRIES = 3
const TERMINAL_SCENE_STATUSES = new Set(['completed', 'cancelled', 'cancelling'])

type DbJob = Awaited<ReturnType<typeof prisma.job.findMany>>[number]

function safeJson(value: unknown): Record<string, unknown> {
  if (typeof value !== 'string' || !value.trim()) return {}
  try {
    const parsed = JSON.parse(value)
    return typeof parsed === 'object' && parsed !== null && !Array.isArray(parsed)
      ? parsed as Record<string, unknown>
      : {}
  } catch {
    return {}
  }
}

function blockedOverrideField(input: Record<string, unknown>): string | null {
  for (const field of BLOCKED_OVERRIDE_FIELDS) {
    if (field in input) return field
  }
  const request = typeof input.request === 'object' && input.request !== null && !Array.isArray(input.request)
    ? input.request as Record<string, unknown>
    : null
  if (request) {
    for (const field of BLOCKED_OVERRIDE_FIELDS) {
      if (field in request) return `request.${field}`
    }
  }
  return null
}

async function requireAdmin(app: FastifyInstance, request: FastifyRequest, reply: FastifyReply): Promise<boolean> {
  const auth = request.headers.authorization
  if (!auth?.startsWith('Bearer ')) {
    reply.status(401).send({ error: true, message: 'Authorization required' })
    return false
  }
  try {
    const payload = await app.jwtVerify(auth.replace('Bearer ', ''))
    if (payload?.role !== 'admin') {
      reply.status(403).send({ error: true, message: 'Admin access required' })
      return false
    }
    return true
  } catch {
    reply.status(401).send({ error: true, message: 'Invalid authorization' })
    return false
  }
}

function parentMetadata(request: LongFormVideoRequest, plan: LongFormVideoPlan, executionId: string) {
  return {
    longFormVideo: true,
    durableParent: true,
    executionId,
    planId: plan.id,
    request,
    plan,
    plannedSceneCount: plan.storyboard.scenes.length,
    completedSceneCount: 0,
    failedSceneCount: 0,
    currentPhase: 'scene_submission',
    batch: {
      count: request.count,
      index: 1,
      batchReady: true,
    },
    assemblyHandoff: buildAssemblyHandoff({
      parentJobId: '',
      executionId,
      request,
      plan,
      sceneJobs: [],
    }),
  }
}

function buildAssemblyHandoff({
  parentJobId,
  executionId,
  request,
  plan,
  sceneJobs,
}: {
  parentJobId: string
  executionId: string
  request: LongFormVideoRequest
  plan: LongFormVideoPlan
  sceneJobs: DbJob[]
}) {
  const orderedCompleted = sceneJobs
    .filter((job) => job.status === 'completed' && job.artifactId)
    .sort((a, b) => (a.sceneNumber ?? 0) - (b.sceneNumber ?? 0))
  const orderedSceneArtifactIds = orderedCompleted.map((job) => job.artifactId as string)
  const expectedSceneCount = plan.storyboard.scenes.length
  const missingDependencies = [
    ...(orderedSceneArtifactIds.length === expectedSceneCount ? [] : ['scene_artifacts_pending']),
    ...(request.voiceoverEnabled ? ['voiceover_pending'] : []),
    ...(request.subtitlesEnabled ? ['subtitles_pending'] : []),
    ...(request.musicBedEnabled ? ['music_bed_pending'] : []),
    'full_multimedia_assembly_pending',
  ]

  return {
    parentJobId,
    executionId,
    orderedSceneArtifactIds,
    expectedSceneCount,
    expectedDurationSeconds: request.targetDurationSeconds,
    aspectRatio: request.aspectRatio,
    outputTitle: `Long-form video ${executionId}`,
    requestedVoiceover: request.voiceoverEnabled,
    requestedSubtitles: request.subtitlesEnabled,
    requestedMusic: request.musicBedEnabled,
    assemblyStatus: orderedSceneArtifactIds.length === expectedSceneCount ? 'ready_for_video_only' : 'waiting_for_scenes',
    missingDependencies,
  }
}

function parseParent(job: DbJob): { request: LongFormVideoRequest; plan: LongFormVideoPlan; metadata: Record<string, unknown> } {
  const metadata = safeJson(job.metadataJson)
  return {
    metadata,
    request: metadata.request as LongFormVideoRequest,
    plan: metadata.plan as LongFormVideoPlan,
  }
}

function deriveStatus(parent: DbJob, sceneJobs: DbJob[]) {
  const { request, plan, metadata } = parseParent(parent)
  const totalScenes = sceneJobs.length || plan.storyboard.scenes.length
  const queuedScenes = sceneJobs.filter((job) => job.status === 'queued').length
  const processingScenes = sceneJobs.filter((job) => job.status === 'processing').length
  const completedScenes = sceneJobs.filter((job) => job.status === 'completed').length
  const failedScenes = sceneJobs.filter((job) => job.status === 'failed').length
  const cancelledScenes = sceneJobs.filter((job) => job.status === 'cancelled').length
  const retryableFailures = sceneJobs
    .filter((job) => job.status === 'failed' && job.retryCount < MAX_SCENE_RETRIES)
    .map((job) => ({ jobId: job.id, sceneNumber: job.sceneNumber, retryCount: job.retryCount, error: job.error }))
  const progress = totalScenes > 0 ? Math.round((completedScenes / totalScenes) * 100) : 0
  const parentIsCancelled = parent.status === 'cancelled'
  const parentIsCancelling = parent.status === 'cancelling'
  const parentIsTerminal = parentIsCancelled || parent.status === 'completed' || parent.status === 'failed'
  const finalAssemblyReadiness = !parentIsCancelled && !parentIsCancelling && completedScenes === totalScenes && totalScenes > 0 && failedScenes === 0 && cancelledScenes === 0
  const partialFailure = failedScenes > 0 && completedScenes < totalScenes
  const phase = parent.workflowPhase || (finalAssemblyReadiness ? 'assembly_handoff_ready' : partialFailure ? 'partial_failure' : 'scene_execution')
  const handoff = buildAssemblyHandoff({ parentJobId: parent.id, executionId: parent.executionId, request, plan, sceneJobs })
  const locallyCancelled = parentIsCancelled || parentIsCancelling
  const remoteExecutionMayFinish = locallyCancelled && sceneJobs.some(
    (job) => (job.status === 'cancelled' || job.status === 'cancelling') && (job.providerClaimAt || !!(safeJson(job.metadataJson).genxProviderJobId))
  )

  return {
    parent: {
      id: parent.id,
      executionId: parent.executionId,
      appSlug: parent.appSlug,
      status: parent.status,
      phase,
      progress,
      finalArtifactId: parent.artifactId,
      error: parent.error,
      createdAt: parent.createdAt.toISOString(),
      updatedAt: parent.updatedAt.toISOString(),
      completedAt: parent.completedAt ? parent.completedAt.toISOString() : null,
    },
    executionId: parent.executionId,
    planId: plan.id,
    plan,
    request,
    totalScenes,
    queuedScenes,
    processingScenes,
    completedScenes,
    failedScenes,
    cancelledScenes,
    progress,
    retryableFailures,
    completedArtifactIds: sceneJobs
      .filter((job) => job.status === 'completed' && job.artifactId)
      .sort((a, b) => (a.sceneNumber ?? 0) - (b.sceneNumber ?? 0))
      .map((job) => job.artifactId),
    scenes: sceneJobs
      .sort((a, b) => (a.sceneNumber ?? 0) - (b.sceneNumber ?? 0))
      .map((job) => ({
        jobId: job.id,
        sceneNumber: job.sceneNumber,
        status: job.status,
        progress: job.progress,
        provider: job.provider,
        model: job.model,
        artifactId: job.artifactId,
        retryCount: job.retryCount,
        queueJobId: job.queueJobId,
        error: job.error,
        workflowPhase: job.workflowPhase,
      })),
    finalAssemblyReady: finalAssemblyReadiness,
    finalArtifactId: parent.artifactId,
    partialFailure,
    locallyCancelled,
    remoteExecutionMayFinish,
    lateArtifactLinked: false,
    resumable: !locallyCancelled && !parentIsTerminal,
    assemblyAllowed: finalAssemblyReadiness && !locallyCancelled,
    blockedReasons: [
      ...(failedScenes > 0 ? ['scene_failure'] : []),
      ...(cancelledScenes > 0 ? ['scene_cancelled'] : []),
      ...((metadata.blockedReasons as string[] | undefined) ?? []),
      'subtitles_pending',
      'full_multimedia_not_ready',
    ],
    assemblyHandoff: locallyCancelled ? { ...handoff, assemblyStatus: 'cancelled' } : handoff,
  }
}

async function loadParentAndScenes(id: string, appSlug: string) {
  const parent = await prisma.job.findFirst({
    where: {
      appSlug,
      capability: 'long_form_video',
      OR: [{ id }, { executionId: id }],
    },
  })
  if (!parent) return null
  const sceneJobs = await prisma.job.findMany({
    where: { appSlug, parentJobId: parent.id },
    orderBy: { sceneNumber: 'asc' },
  })
  return { parent, sceneJobs }
}

async function removeQueueJob(q: Queue, sceneJob: DbJob): Promise<string[]> {
  const removed: string[] = []
  const ids = [sceneJob.queueJobId, sceneJob.id].filter((value, index, values): value is string =>
    typeof value === 'string' && value.length > 0 && values.indexOf(value) === index)

  for (const id of ids) {
    try {
      const job = await q.getJob(id)
      if (job) {
        await job.remove()
        removed.push(id)
      }
    } catch {
      // Queue cleanup is best-effort; DB cancellation remains authoritative.
    }
  }
  return removed
}

async function enqueueSceneJob(q: Queue, sceneJob: DbJob): Promise<{ queued: boolean; skipped: boolean; error?: string }> {
  if (sceneJob.status === 'completed' && sceneJob.artifactId) return { queued: false, skipped: true }
  if (TERMINAL_SCENE_STATUSES.has(sceneJob.status)) return { queued: false, skipped: true, error: 'terminal_scene_state' }
  if ((sceneJob.status === 'queued' || sceneJob.status === 'processing') && sceneJob.queueJobId) return { queued: false, skipped: true }
  if (sceneJob.status === 'failed' && sceneJob.retryCount >= MAX_SCENE_RETRIES) {
    return { queued: false, skipped: true, error: 'retry_limit_reached' }
  }

  const metadata = safeJson(sceneJob.metadataJson)
  const payload: JobPayload = {
    jobId: sceneJob.id,
    appSlug: sceneJob.appSlug,
    capability: 'video_generation',
    prompt: sceneJob.prompt,
    input: safeJson(sceneJob.inputJson),
    metadata,
    traceId: sceneJob.traceId,
    routingMode: typeof metadata.routingMode === 'string' ? metadata.routingMode : 'balanced',
  }

  const queueJobId = sceneJob.retryCount > 0 ? `${sceneJob.id}:attempt:${sceneJob.retryCount}` : sceneJob.id
  await q.add('process', payload, {
    ...DEFAULT_JOB_OPTIONS,
    jobId: queueJobId,
  })
  await prisma.job.update({
    where: { id: sceneJob.id },
    data: {
      status: 'queued',
      error: null,
      queueJobId,
      queuedAt: new Date(),
      workflowPhase: 'scene_queued',
    },
  })
  return { queued: true, skipped: false }
}

async function enqueueSceneJobs(q: Queue, parent: DbJob, sceneJobs: DbJob[]) {
  const queued: string[] = []
  const skipped: string[] = []
  const failed: Array<{ jobId: string; error: string }> = []

  for (const sceneJob of sceneJobs) {
    try {
      const result = await enqueueSceneJob(q, sceneJob)
      if (result.queued) queued.push(sceneJob.id)
      if (result.skipped) skipped.push(sceneJob.id)
      if (result.error) failed.push({ jobId: sceneJob.id, error: result.error })
    } catch (error) {
      const message = error instanceof Error ? error.message : 'Queue submission failed'
      failed.push({ jobId: sceneJob.id, error: message })
      await prisma.job.update({
        where: { id: sceneJob.id },
        data: {
          status: 'failed',
          error: `Scene queue submission failed: ${message}`,
          workflowPhase: 'scene_queue_failed',
          completedAt: new Date(),
        },
      })
    }
  }

  const finalParentStatus = failed.length > 0 && queued.length === 0 ? 'failed' : 'processing'
  await prisma.job.update({
    where: { id: parent.id },
    data: {
      status: finalParentStatus,
      workflowPhase: failed.length > 0 ? 'partial_queue_failure' : 'scene_execution',
      progress: 0,
      error: failed.length > 0 ? `Scene queue failures: ${failed.map((item) => item.jobId).join(', ')}` : null,
    },
  })
  await refreshLongFormParentState(parent.id)

  return { queued, skipped, failed }
}

async function prepareSceneRetry(q: Queue, scene: DbJob): Promise<DbJob | null> {
  await removeQueueJob(q, scene)
  const metadata = safeJson(scene.metadataJson)
  const nextRetryCount = scene.retryCount + 1
  const updated = await prisma.job.updateMany({
    where: {
      id: scene.id,
      status: 'failed',
      retryCount: scene.retryCount,
    },
    data: {
      status: 'queued',
      error: null,
      startedAt: null,
      completedAt: null,
      providerClaimAt: null,
      progress: 0,
      retryCount: { increment: 1 },
      queueJobId: '',
      queuedAt: null,
      workflowPhase: 'scene_retry_requested',
      metadataJson: JSON.stringify({ ...metadata, retryGeneration: nextRetryCount }),
    },
  })
  if (updated.count !== 1) return null
  return await prisma.job.findUnique({ where: { id: scene.id } })
}

async function enqueueVoiceoverJob(q: Queue, voiceoverJob: DbJob): Promise<{ queued: boolean; skipped: boolean; error?: string }> {
  if (voiceoverJob.status === 'completed' && voiceoverJob.artifactId) return { queued: false, skipped: true }
  if (TERMINAL_SCENE_STATUSES.has(voiceoverJob.status)) return { queued: false, skipped: true, error: 'terminal_state' }
  if ((voiceoverJob.status === 'queued' || voiceoverJob.status === 'processing') && voiceoverJob.queueJobId) return { queued: false, skipped: true }
  if (voiceoverJob.status === 'failed' && voiceoverJob.retryCount >= MAX_SCENE_RETRIES) {
    return { queued: false, skipped: true, error: 'retry_limit_reached' }
  }

  const metadata = safeJson(voiceoverJob.metadataJson)
  const payload: JobPayload = {
    jobId: voiceoverJob.id,
    appSlug: voiceoverJob.appSlug,
    capability: 'tts',
    prompt: voiceoverJob.prompt,
    input: safeJson(voiceoverJob.inputJson),
    metadata,
    traceId: voiceoverJob.traceId,
    routingMode: typeof metadata.routingMode === 'string' ? metadata.routingMode : 'balanced',
  }

  const queueJobId = voiceoverJob.retryCount > 0 ? `${voiceoverJob.id}:attempt:${voiceoverJob.retryCount}` : voiceoverJob.id
  await q.add('process', payload, {
    ...DEFAULT_JOB_OPTIONS,
    jobId: queueJobId,
  })
  await prisma.job.update({
    where: { id: voiceoverJob.id },
    data: {
      status: 'queued',
      error: null,
      queueJobId,
      queuedAt: new Date(),
      workflowPhase: 'voiceover_queued',
    },
  })
  return { queued: true, skipped: false }
}

async function enqueueVoiceoverJobs(q: Queue, voiceoverJobs: DbJob[]) {
  const queued: string[] = []
  const skipped: string[] = []
  const failed: Array<{ jobId: string; error: string }> = []

  for (const voiceoverJob of voiceoverJobs) {
    try {
      const result = await enqueueVoiceoverJob(q, voiceoverJob)
      if (result.queued) queued.push(voiceoverJob.id)
      if (result.skipped) skipped.push(voiceoverJob.id)
      if (result.error) failed.push({ jobId: voiceoverJob.id, error: result.error })
    } catch (error) {
      const message = error instanceof Error ? error.message : 'Queue submission failed'
      failed.push({ jobId: voiceoverJob.id, error: message })
      await prisma.job.update({
        where: { id: voiceoverJob.id },
        data: {
          status: 'failed',
          error: `Voiceover queue submission failed: ${message}`,
          workflowPhase: 'voiceover_queue_failed',
          completedAt: new Date(),
        },
      })
    }
  }

  return { queued, skipped, failed }
}

async function createDurableLongFormExecution(appSlug: string, input: LongFormVideoRequest, routingMode: string, q: Queue, dryRun = false) {
  const plan = createLongFormVideoPlan(input)
  const executionId = randomUUID()
  const payloads = createSceneExecutionPayloads(plan, routingMode, executionId)

  const { parent, sceneJobs, voiceoverJobs } = await prisma.$transaction(async (tx) => {
    const parent = await tx.job.create({
      data: {
        appSlug,
        capability: 'long_form_video',
        prompt: input.prompt,
        inputJson: JSON.stringify(input),
        metadataJson: JSON.stringify(parentMetadata(input, plan, executionId)),
        traceId: `trace_longform_${executionId}`,
        status: dryRun ? 'planned' : 'processing',
        progress: 0,
        executionId,
        workflowPhase: dryRun ? 'planned' : 'scene_submission',
      },
    })

    const sceneJobs = []
    for (const payload of payloads) {
      const scene = plan.storyboard.scenes.find((item) => item.sceneNumber === payload.sceneNumber)
      const metadata = {
        ...payload.metadata,
        parentJobId: parent.id,
        executionId,
        planVersion: plan.id,
        retryGeneration: 0,
      }
      const job = await tx.job.create({
        data: {
          appSlug,
          capability: 'video_generation',
          prompt: payload.prompt,
          inputJson: JSON.stringify(payload.input),
          metadataJson: JSON.stringify(metadata),
          traceId: `trace_longform_${executionId}_scene_${payload.sceneNumber}`,
          status: dryRun ? 'planned' : 'queued',
          parentJobId: parent.id,
          executionId,
          sceneNumber: payload.sceneNumber,
          workflowPhase: dryRun ? 'scene_planned' : 'scene_created',
        },
      })
      sceneJobs.push(job)
      if (!scene) continue
    }

    const voiceoverJobs: DbJob[] = []
    if (input.voiceoverEnabled) {
      for (const scene of plan.storyboard.scenes) {
        if (!scene.voiceoverText) continue
        const voMetadata = {
          longFormVideo: true,
          longFormVoiceover: true,
          longFormExecutionId: executionId,
          planId: plan.id,
          sceneNumber: scene.sceneNumber,
          sceneTitle: scene.title,
          parentJobId: parent.id,
          routingMode,
          retryGeneration: 0,
        }
        const voJob = await tx.job.create({
          data: {
            appSlug,
            capability: 'tts',
            prompt: scene.voiceoverText,
            inputJson: JSON.stringify({ text: scene.voiceoverText, sceneNumber: scene.sceneNumber }),
            metadataJson: JSON.stringify(voMetadata),
            traceId: `trace_longform_${executionId}_voiceover_${scene.sceneNumber}`,
            status: dryRun ? 'planned' : 'queued',
            parentJobId: parent.id,
            executionId,
            sceneNumber: scene.sceneNumber,
            workflowPhase: dryRun ? 'voiceover_planned' : 'voiceover_created',
          },
        })
        voiceoverJobs.push(voJob)
      }
    }

    await tx.job.update({
      where: { id: parent.id },
      data: {
        metadataJson: JSON.stringify({
          ...parentMetadata(input, plan, executionId),
          voiceoverJobIds: voiceoverJobs.map((j) => j.id),
          assemblyHandoff: buildAssemblyHandoff({ parentJobId: parent.id, executionId, request: input, plan, sceneJobs }),
        }),
      },
    })

    return { parent, sceneJobs, voiceoverJobs }
  })

  await refreshLongFormParentState(parent.id)
  const queueResult = dryRun ? { queued: [], skipped: [], failed: [] } : await enqueueSceneJobs(q, parent, sceneJobs)
  let voiceoverQueueResult = { queued: [] as string[], skipped: [] as string[], failed: [] as Array<{ jobId: string; error: string }> }
  if (input.voiceoverEnabled && !dryRun && voiceoverJobs.length > 0) {
    voiceoverQueueResult = await enqueueVoiceoverJobs(q, voiceoverJobs)
  }
  const latest = await loadParentAndScenes(parent.id, appSlug)
  return { parent: latest?.parent ?? parent, sceneJobs: latest?.sceneJobs ?? sceneJobs, voiceoverJobs, queueResult, voiceoverQueueResult, plan, executionId }
}

export async function adminLongFormVideoRoutes(app: FastifyInstance): Promise<void> {
  let queue: Queue | null = null
  function getQueue(): Queue {
    if (!queue) {
      if (!app.redis) throw new Error('Redis is required for job queue')
      queue = new Queue(QUEUE_NAMES.JOBS, { connection: app.redis as never })
    }
    return queue
  }

  app.post('/api/admin/long-form-video/plan', async (request, reply) => {
    if (!(await requireAdmin(app, request, reply))) return
    const body = request.body as Record<string, unknown>
    const override = blockedOverrideField(body)
    if (override) return reply.status(400).send({ error: true, message: `Provider/model override not allowed. Blocked field: ${override}` })

    try {
      const validatedRequest = validateLongFormVideoRequest(body)
      const plan = createLongFormVideoPlan(validatedRequest)
      return reply.status(200).send({
        success: true,
        plan,
        durableParentReady: true,
        message: 'Long-form video plan created. Durable execution can persist a parent job and linked scene jobs.',
      })
    } catch (error) {
      return reply.status(400).send({
        error: true,
        message: 'Invalid request',
        details: error instanceof Error ? error.message : 'Validation failed',
      })
    }
  })

  async function createExecutionHandler(request: FastifyRequest, reply: FastifyReply) {
    if (!(await requireAdmin(app, request, reply))) return
    const body = request.body as Record<string, unknown>
    const override = blockedOverrideField(body)
    if (override) return reply.status(400).send({ error: true, message: `Provider/model override not allowed. Blocked field: ${override}` })

    const dryRun = body.dryRun === true
    const routingMode = isValidRoutingMode(body.routingMode) ? body.routingMode as string : 'balanced'
    try {
      const requestInput = body.request && typeof body.request === 'object' ? body.request : body
      const validatedRequest = validateLongFormVideoRequest(requestInput)
      const result = await createDurableLongFormExecution(APP_SLUG, validatedRequest, routingMode, getQueue(), dryRun)
      const status = deriveStatus(result.parent, result.sceneJobs)
      return reply.status(dryRun ? 200 : result.queueResult.failed.length > 0 ? 207 : 202).send({
        success: result.queueResult.failed.length === 0,
        parentJobId: result.parent.id,
        executionId: result.executionId,
        queuedJobs: result.queueResult.queued,
        skippedJobs: result.queueResult.skipped,
        failedQueueSubmissions: result.queueResult.failed,
        status,
        message: result.queueResult.failed.length > 0
          ? 'Long-form execution persisted, but some scene queue submissions failed. Resume can recover pending scenes.'
          : dryRun
            ? 'Durable long-form execution planned without queue submission.'
            : 'Durable long-form execution persisted and scene jobs queued.',
      })
    } catch (error) {
      return reply.status(400).send({
        error: true,
        message: 'Failed to create durable long-form execution',
        details: error instanceof Error ? error.message : 'Unknown error',
      })
    }
  }

  app.post('/api/admin/long-form-video/executions', createExecutionHandler)
  app.post('/api/admin/long-form-video/execute-scenes', createExecutionHandler)

  app.get('/api/admin/long-form-video/executions/:id', async (request, reply) => {
    if (!(await requireAdmin(app, request, reply))) return
    const { id } = request.params as { id: string }
    const loaded = await loadParentAndScenes(id, APP_SLUG)
    if (!loaded) return reply.status(404).send({ error: true, message: 'Long-form parent job not found' })
    return reply.status(200).send({
      success: true,
      execution: deriveStatus(loaded.parent, loaded.sceneJobs),
      message: 'Durable long-form status loaded from parent and linked scene jobs.',
    })
  })

  app.get('/api/admin/long-form-video/executions/:id/scenes', async (request, reply) => {
    if (!(await requireAdmin(app, request, reply))) return
    const { id } = request.params as { id: string }
    const loaded = await loadParentAndScenes(id, APP_SLUG)
    if (!loaded) return reply.status(404).send({ error: true, message: 'Long-form parent job not found' })
    return reply.status(200).send({ success: true, scenes: deriveStatus(loaded.parent, loaded.sceneJobs).scenes })
  })

  app.post('/api/admin/long-form-video/executions/:id/resume', async (request, reply) => {
    if (!(await requireAdmin(app, request, reply))) return
    const { id } = request.params as { id: string }
    const loaded = await loadParentAndScenes(id, APP_SLUG)
    if (!loaded) return reply.status(404).send({ error: true, message: 'Long-form parent job not found' })
    if (loaded.parent.status === 'cancelled' || loaded.parent.status === 'cancelling') {
      return reply.status(409).send({ error: true, message: 'Cancelled long-form executions cannot be resumed without an explicit supported transition' })
    }
    const resumable = loaded.sceneJobs.filter((job) =>
      job.status === 'planned'
      || (job.status === 'queued' && !job.queueJobId)
      || (job.status === 'failed' && job.error?.includes('queue submission')))
    const result = await enqueueSceneJobs(getQueue(), loaded.parent, resumable)
    const latest = await loadParentAndScenes(loaded.parent.id, APP_SLUG)
    return reply.status(result.failed.length > 0 ? 207 : 200).send({
      success: result.failed.length === 0,
      queueResult: result,
      execution: latest ? deriveStatus(latest.parent, latest.sceneJobs) : null,
    })
  })

  app.post('/api/admin/long-form-video/executions/:id/scenes/:sceneNumber/retry', async (request, reply) => {
    if (!(await requireAdmin(app, request, reply))) return
    const { id, sceneNumber } = request.params as { id: string; sceneNumber: string }
    const loaded = await loadParentAndScenes(id, APP_SLUG)
    if (!loaded) return reply.status(404).send({ error: true, message: 'Long-form parent job not found' })
    const scene = loaded.sceneJobs.find((job) => job.sceneNumber === Number(sceneNumber))
    if (!scene) return reply.status(404).send({ error: true, message: 'Scene job not found' })
    if (scene.status === 'completed') return reply.status(409).send({ error: true, message: 'Completed scenes cannot be retried' })
    if (scene.status !== 'failed') return reply.status(409).send({ error: true, message: 'Only failed scenes can be retried' })
    if (scene.retryCount >= MAX_SCENE_RETRIES) return reply.status(409).send({ error: true, message: 'Scene retry limit reached' })

    const updated = await prepareSceneRetry(getQueue(), scene)
    if (!updated) return reply.status(409).send({ error: true, message: 'Scene retry was already claimed by another request' })
    const result = await enqueueSceneJobs(getQueue(), loaded.parent, [updated])
    const latest = await loadParentAndScenes(loaded.parent.id, APP_SLUG)
    return reply.status(result.failed.length > 0 ? 207 : 200).send({
      success: result.failed.length === 0,
      queueResult: result,
      execution: latest ? deriveStatus(latest.parent, latest.sceneJobs) : null,
    })
  })

  app.post('/api/admin/long-form-video/executions/:id/retry-failed', async (request, reply) => {
    if (!(await requireAdmin(app, request, reply))) return
    const { id } = request.params as { id: string }
    const loaded = await loadParentAndScenes(id, APP_SLUG)
    if (!loaded) return reply.status(404).send({ error: true, message: 'Long-form parent job not found' })
    if (loaded.parent.status === 'cancelled' || loaded.parent.status === 'cancelling') {
      return reply.status(409).send({ error: true, message: 'Cancelled long-form executions cannot be retried without an explicit supported transition' })
    }
    const retryable = loaded.sceneJobs.filter((job) => job.status === 'failed' && job.retryCount < MAX_SCENE_RETRIES)
    const updated = []
    for (const scene of retryable) {
      const prepared = await prepareSceneRetry(getQueue(), scene)
      if (prepared) updated.push(prepared)
    }
    const result = await enqueueSceneJobs(getQueue(), loaded.parent, updated)
    const latest = await loadParentAndScenes(loaded.parent.id, APP_SLUG)
    return reply.status(result.failed.length > 0 ? 207 : 200).send({
      success: result.failed.length === 0,
      queueResult: result,
      execution: latest ? deriveStatus(latest.parent, latest.sceneJobs) : null,
    })
  })

  app.post('/api/admin/long-form-video/executions/:id/cancel', async (request, reply) => {
    if (!(await requireAdmin(app, request, reply))) return
    const { id } = request.params as { id: string }
    const loaded = await loadParentAndScenes(id, APP_SLUG)
    if (!loaded) return reply.status(404).send({ error: true, message: 'Long-form parent job not found' })

    const removedQueueJobs: string[] = []
    let activeRemoteMayFinish = false
    for (const scene of loaded.sceneJobs) {
      if (scene.status === 'completed') continue
      removedQueueJobs.push(...await removeQueueJob(getQueue(), scene))

      if (scene.status === 'processing') {
        const hasRemoteClaim = !!scene.providerClaimAt || !!(safeJson(scene.metadataJson).genxProviderJobId)
        activeRemoteMayFinish = activeRemoteMayFinish || hasRemoteClaim
        await prisma.job.update({
          where: { id: scene.id },
          data: {
            status: 'cancelled',
            workflowPhase: hasRemoteClaim ? 'cancelled_remote_may_finish' : 'cancelled',
            completedAt: new Date(),
            error: hasRemoteClaim
              ? 'Cancelled locally. Remote provider execution may finish; late artifacts will not reactivate the parent or scene.'
              : 'Cancelled before execution completed.',
          },
        })
      } else {
        await prisma.job.update({
          where: { id: scene.id },
          data: {
            status: 'cancelled',
            workflowPhase: 'cancelled',
            completedAt: new Date(),
            queueJobId: '',
            queuedAt: null,
            error: 'Cancelled before execution completed.',
          },
        })
      }
    }

    await prisma.job.update({
      where: { id: loaded.parent.id },
      data: {
        status: 'cancelled',
        workflowPhase: 'cancelled',
        completedAt: new Date(),
        error: activeRemoteMayFinish
          ? 'Long-form execution cancelled. One or more remote provider executions may finish; late artifacts will not reactivate this parent.'
          : 'Long-form execution cancelled.',
      },
    })
    const refreshed = await refreshLongFormParentState(loaded.parent.id)
    return reply.status(200).send({
      success: true,
      removedQueueJobs,
      cancellation: {
        requested: true,
        locallyCancelled: true,
        remoteExecutionMayFinish: activeRemoteMayFinish,
        lateArtifactLinked: false,
        resumable: false,
        assemblyAllowed: false,
      },
      execution: refreshed ? deriveStatus(refreshed.parent, refreshed.sceneJobs) : null,
    })
  })

  app.post('/api/admin/long-form-video/subtitles/:executionId', async (request, reply) => {
    if (!(await requireAdmin(app, request, reply))) return
    const { executionId } = request.params as { executionId: string }
    const body = request.body as Record<string, unknown>
    const format = (body.format as string) === 'vtt' ? 'vtt' : 'srt'

    const loaded = await loadParentAndScenes(executionId, APP_SLUG)
    if (!loaded) return reply.status(404).send({ error: true, message: 'Long-form parent job not found' })

    const metadata = safeJson(loaded.parent.metadataJson)
    const plan = metadata.plan as LongFormVideoPlan | undefined
    if (!plan?.storyboard?.scenes) {
      return reply.status(409).send({ error: true, message: 'No plan found in parent metadata' })
    }

    const scenes = plan.storyboard.scenes.filter(
      (s: { subtitleText?: string }) => s.subtitleText?.trim()
    ) as Array<{ sceneNumber: number; subtitleText: string; durationSeconds: number }>
    if (scenes.length === 0) {
      return reply.status(409).send({ error: true, message: 'No scenes with subtitle text found' })
    }

    const subtitleContent = generateSubtitles({
      scenes: scenes.map((s) => ({
        sceneNumber: s.sceneNumber,
        subtitleText: s.subtitleText,
        durationSeconds: s.durationSeconds,
      })),
      format,
    })

    if (!subtitleContent) {
      return reply.status(409).send({ error: true, message: 'Generated subtitle content is empty' })
    }

    const traceId = `trace_longform_${executionId}_subtitles_${format}`
    const mimeType = getSubtitleMimeType(format)
    const filename = `long-form-${executionId}-subtitles.${format}`

    const artifact = await saveArtifact({
      input: {
        appSlug: APP_SLUG,
        type: 'transcript',
        subType: `subtitles_${format}`,
        title: filename,
        description: `Long-form video subtitles (${format.toUpperCase()})`,
        provider: 'local',
        model: 'subtitle-generator',
        traceId,
        mimeType,
        metadata: {
          executionId,
          parentJobId: loaded.parent.id,
          format,
          sceneCount: scenes.length,
          totalDurationSeconds: scenes.reduce((sum: number, s: { durationSeconds: number }) => sum + s.durationSeconds, 0),
        },
      },
      data: Buffer.from(subtitleContent, 'utf-8'),
      explicitMimeType: mimeType,
    })

    await prisma.job.update({
      where: { id: loaded.parent.id },
      data: {
        metadataJson: JSON.stringify({
          ...metadata,
          subtitleArtifactId: artifact.id,
          subtitleFormat: format,
          subtitlesReady: true,
        }),
      },
    })

    return reply.status(201).send({
      success: true,
      artifactId: artifact.id,
      format,
      mimeType,
      sceneCount: scenes.length,
      artifactUrl: artifact.storageUrl,
    })
  })

  app.post('/api/admin/long-form-video/music-bed/:executionId', async (request, reply) => {
    if (!(await requireAdmin(app, request, reply))) return
    const { executionId } = request.params as { executionId: string }
    const body = request.body as Record<string, unknown>

    const loaded = await loadParentAndScenes(executionId, APP_SLUG)
    if (!loaded) return reply.status(404).send({ error: true, message: 'Long-form parent job not found' })

    const metadata = safeJson(loaded.parent.metadataJson)
    const plan = metadata.plan as LongFormVideoPlan | undefined
    if (!plan) {
      return reply.status(409).send({ error: true, message: 'No plan found in parent metadata' })
    }

    const override = blockedOverrideField(body)
    if (override) return reply.status(400).send({ error: true, message: `Provider/model override not allowed. Blocked field: ${override}` })

    const prompt = (body.prompt as string) || `${plan.tone} ${plan.style} instrumental background music`
    const routingMode = isValidRoutingMode(body.routingMode) ? body.routingMode as string : 'balanced'

    try {
      const { randomUUID: uuid } = await import('node:crypto')
      const musicJobId = uuid()
      const traceId = `trace_longform_${executionId}_music_bed`

      await prisma.job.create({
        data: {
          id: musicJobId,
          appSlug: APP_SLUG,
          capability: 'music_generation',
          prompt,
          inputJson: JSON.stringify({
            prompt,
            durationSeconds: plan.totalDurationSeconds,
            instrumentalOnly: true,
            style: plan.style,
            mood: plan.tone,
          }),
          metadataJson: JSON.stringify({
            longFormVideo: true,
            longFormMusicBed: true,
            longFormExecutionId: executionId,
            parentJobId: loaded.parent.id,
            planId: plan.id,
            routingMode,
            retryGeneration: 0,
          }),
          traceId,
          status: 'queued',
          parentJobId: loaded.parent.id,
          executionId,
          workflowPhase: 'music_bed_created',
        },
      })

      if (getQueue()) {
        const q = getQueue()
        const payload: JobPayload = {
          jobId: musicJobId,
          appSlug: APP_SLUG,
          capability: 'music_generation',
          prompt,
          input: { prompt, durationSeconds: plan.totalDurationSeconds, instrumentalOnly: true },
          metadata: { longFormVideo: true, longFormMusicBed: true, longFormExecutionId: executionId, parentJobId: loaded.parent.id, routingMode },
          traceId,
          routingMode,
        }
        await q.add('process', payload, { ...DEFAULT_JOB_OPTIONS, jobId: musicJobId })
      }

      return reply.status(202).send({
        success: true,
        musicJobId,
        prompt,
        message: 'Music bed job submitted. Poll the job for completion.',
      })
    } catch (error) {
      return reply.status(500).send({
        error: true,
        message: 'Music bed job creation failed',
        details: error instanceof Error ? error.message : 'Unknown error',
      })
    }
  })

  app.post('/api/admin/long-form-video/assemble/:executionId', async (request, reply) => {
    if (!(await requireAdmin(app, request, reply))) return
    const { executionId } = request.params as { executionId: string }
    const body = request.body as Record<string, unknown>
    const dryRun = body.dryRun === true
    const outputTitle = body.outputTitle as string | undefined
    const loaded = await loadParentAndScenes(executionId, APP_SLUG)
    if (!loaded) return reply.status(404).send({ error: true, message: 'Long-form parent job not found' })

    if (loaded.parent.status === 'cancelled' || loaded.parent.status === 'cancelling') {
      return reply.status(409).send({ error: true, message: 'Cannot assemble: parent execution is cancelled', parentStatus: loaded.parent.status })
    }
    if (loaded.parent.status === 'failed') {
      return reply.status(409).send({ error: true, message: 'Cannot assemble: parent execution has failed', parentStatus: loaded.parent.status })
    }
    if (loaded.parent.status === 'completed') {
      return reply.status(409).send({ error: true, message: 'Cannot assemble: parent execution is already completed', parentStatus: loaded.parent.status })
    }

    const status = deriveStatus(loaded.parent, loaded.sceneJobs)
    if (!status.finalAssemblyReady) {
      return reply.status(409).send({
        error: true,
        message: 'Cannot assemble: not all scenes are completed',
        completedScenes: status.completedScenes,
        totalScenes: status.totalScenes,
        cancelledScenes: status.cancelledScenes,
      })
    }

    const sceneArtifacts = await resolveSceneArtifacts(loaded.parent.executionId)
    const validation = validateSceneArtifactsForAssembly(sceneArtifacts, status.totalScenes)
    if (!validation.valid) return reply.status(422).send({ error: true, message: 'Scene artifacts validation failed', errors: validation.errors, warnings: validation.warnings })
    const ffmpeg = await checkFfmpegAvailable()
    const plan = await createAssemblyPlan(loaded.parent.executionId, status.totalScenes)
    if (dryRun) return reply.status(200).send({ success: true, dryRun: true, plan, ffmpegAvailable: ffmpeg.available })
    if (!ffmpeg.available) return reply.status(422).send({ error: true, message: 'Cannot assemble: ffmpeg is not available', ffmpegError: ffmpeg.error })

    const result = await assembleLongFormVideo({
      executionId: loaded.parent.executionId,
      sceneArtifacts,
      outputTitle,
      aspectRatio: status.request.aspectRatio,
    })
    if (!result.success) return reply.status(500).send({ error: true, message: 'Assembly failed', details: result.error })
    await prisma.job.update({
      where: { id: loaded.parent.id },
      data: {
        status: 'completed',
        artifactId: result.artifactId,
        progress: 100,
        workflowPhase: 'video_only_assembly_completed',
        completedAt: new Date(),
        output: JSON.stringify(result),
      },
    })
    await refreshLongFormParentState(loaded.parent.id)
    return reply.status(200).send({
      ...result,
      success: true,
      executionId: loaded.parent.executionId,
      note: 'Video-only assembly complete. Voiceover/subtitles/music bed not included.',
    })
  })

  app.get('/api/admin/long-form-video/assembly/:executionId', async (request, reply) => {
    if (!(await requireAdmin(app, request, reply))) return
    const { executionId } = request.params as { executionId: string }
    const loaded = await loadParentAndScenes(executionId, APP_SLUG)
    if (!loaded) return reply.status(404).send({ error: true, message: 'Long-form parent job not found' })
    const parentBlocked = loaded.parent.status === 'cancelled' || loaded.parent.status === 'cancelling' || loaded.parent.status === 'failed' || loaded.parent.status === 'completed'
    const status = deriveStatus(loaded.parent, loaded.sceneJobs)
    const sceneArtifacts = await resolveSceneArtifacts(loaded.parent.executionId)
    const validation = validateSceneArtifactsForAssembly(sceneArtifacts, status.totalScenes)
    const ffmpeg = await checkFfmpegAvailable()
    return reply.status(200).send({
      success: true,
      executionId: loaded.parent.executionId,
      canAssemble: !parentBlocked && status.finalAssemblyReady && validation.valid && ffmpeg.available,
      parentStatus: loaded.parent.status,
      assemblyBlockedByParent: parentBlocked,
      missingDependencies: status.assemblyHandoff.missingDependencies,
      assemblyHandoff: status.assemblyHandoff,
      validation,
      ffmpeg,
    })
  })

  app.get('/api/admin/long-form-video/status', async (request, reply) => {
    if (!(await requireAdmin(app, request, reply))) return
    const { LONG_FORM_VIDEO_STATUS } = await import('@amarktai/core')
    const ffmpeg = await checkFfmpegAvailable()
    const truth = await buildAdminRuntimeTruth(app)
    const canonical = truth.capabilities.find((capability) => capability.capability === 'long_form_video')
    return reply.status(200).send({
      success: true,
      status: {
        ...LONG_FORM_VIDEO_STATUS,
        canonicalTruth: canonical,
        ffmpegAvailable: ffmpeg.available,
        durableParentReady: true,
        durablePlanReady: true,
        sceneLinkageReady: true,
        sceneSubmissionReady: true,
        retryResumeReady: true,
        progressTrackingReady: true,
        assemblyHandoffReady: true,
        fullMultimediaReady: false,
        liveProven: false,
      },
      ffmpeg,
      message: 'Long-form durable orchestration and scene recovery are ready. Full multimedia assembly remains pending.',
      limitations: {
        executionStateStorage: 'Durable parent and linked Job rows (scene + voiceover)',
        executionStateRecovery: 'Recovered by exact parentJobId/executionId fields',
        assemblyMode: 'video_only handoff prepared; full multimedia pending',
        voiceoverIncluded: true,
        subtitlesIncluded: true,
        musicBedIncluded: true,
      },
    })
  })
}
