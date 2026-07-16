import type { FastifyInstance, FastifyReply, FastifyRequest } from 'fastify'
import { randomUUID } from 'node:crypto'
import { Queue } from 'bullmq'
import { advanceLongFormWorkflow, prisma, refreshLongFormParentState, type LongFormComponentState } from '@amarktai/db'
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
  normalizeRoutingMode,
  validateLongFormVideoRequest,
  validatePlanCompleteness,
  type JobPayload,
  type AppCapabilityGrantContext,
  type LongFormVideoPlan,
  type LongFormVideoRequest,
} from '@amarktai/core'
import { checkFfmpegAvailable, resolveSceneArtifacts, validateSceneArtifactsForAssembly } from '../lib/long-form-assembly.js'
import { buildAdminRuntimeTruth } from '../lib/admin-runtime-truth.js'
import { resolveInternalDashboardCapabilityGrantSnapshot } from '../lib/app-grant-loader.js'

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
  const state = metadata.componentState as LongFormComponentState
  const scenes = state?.scenes
  const totalScenes = scenes?.requestedCount ?? sceneJobs.length ?? plan.storyboard.scenes.length
  const queuedScenes = scenes?.queuedCount ?? sceneJobs.filter((job) => job.status === 'queued').length
  const processingScenes = scenes?.processingCount ?? sceneJobs.filter((job) => job.status === 'processing').length
  const completedScenes = scenes?.completedCount ?? sceneJobs.filter((job) => job.status === 'completed').length
  const failedScenes = scenes?.failedCount ?? sceneJobs.filter((job) => job.status === 'failed').length
  const cancelledScenes = scenes?.cancelledCount ?? sceneJobs.filter((job) => job.status === 'cancelled').length
  const retryableFailures = scenes?.retryableFailures ?? sceneJobs.filter((job) => job.status === 'failed' && job.retryCount < MAX_SCENE_RETRIES).map((job) => ({ jobId: job.id, sceneNumber: job.sceneNumber, retryCount: job.retryCount, error: job.error }))
  const progress = state ? parent.progress : totalScenes > 0 ? Math.round(completedScenes / totalScenes * 100) : 0
  const parentIsCancelled = parent.status === 'cancelled'
  const parentIsCancelling = parent.status === 'cancelling'
  const parentIsTerminal = parentIsCancelled || parent.status === 'completed' || parent.status === 'failed'
  const finalAssemblyReadiness = state
    ? state.readyToQueueAssembly === true || state.assembly.assemblyQueued === true || state.assembly.assemblyProcessing === true
    : completedScenes === totalScenes && totalScenes > 0 && failedScenes === 0 && cancelledScenes === 0
  const partialFailure = failedScenes > 0 && completedScenes < totalScenes
  const phase = parent.workflowPhase || (finalAssemblyReadiness ? 'assembly_handoff_ready' : partialFailure ? 'partial_failure' : 'scene_execution')
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
    blockedReasons: state?.blockedReasons ?? [],
    componentState: state,
    assemblyHandoff: {
      parentJobId: parent.id,
      executionId: parent.executionId,
      orderedSceneArtifactIds: scenes?.artifactIds ?? sceneJobs.filter((job) => job.status === 'completed' && job.artifactId).sort((a, b) => (a.sceneNumber ?? 0) - (b.sceneNumber ?? 0)).map((job) => job.artifactId),
      expectedSceneCount: totalScenes,
      expectedDurationSeconds: request.targetDurationSeconds,
      aspectRatio: request.aspectRatio,
      outputTitle: `Long-form video ${parent.executionId}`,
      requestedVoiceover: request.voiceoverEnabled,
      requestedSubtitles: request.subtitlesEnabled,
      requestedMusic: request.musicBedEnabled,
      assemblyStatus: locallyCancelled ? 'cancelled' : state?.assembly.ready ? 'completed' : finalAssemblyReadiness ? 'ready' : 'waiting',
      missingDependencies: state?.blockedReasons ?? [],
    },
  }
}

async function loadParentAndScenes(id: string, appSlug: string) {
  const parent = await prisma.job.findFirst({
    where: {
      appSlug,
      capability: 'long_form_video',
      parentJobId: null,
      OR: [{ id }, { executionId: id }],
    },
  })
  if (!parent) return null
  const refreshed = await refreshLongFormParentState(parent.id)
  const refreshedParent = await prisma.job.findUnique({ where: { id: parent.id } }) ?? parent
  const childJobs = await prisma.job.findMany({
    where: { appSlug, parentJobId: parent.id },
    orderBy: { sceneNumber: 'asc' },
  })
  const sceneJobs = (refreshed?.sceneJobs ?? childJobs.filter((job) => job.capability === 'video_generation' && safeJson(job.metadataJson).longFormVideo === true)) as DbJob[]
  return { parent: refreshedParent, sceneJobs, childJobs }
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
    executionProfile: 'internal_dashboard',
    prompt: sceneJob.prompt,
    input: safeJson(sceneJob.inputJson),
    metadata,
    traceId: sceneJob.traceId,
    routingMode: typeof metadata.routingMode === 'string' ? metadata.routingMode : 'balanced',
    appGrantSnapshot: metadata.appGrantSnapshot as AppCapabilityGrantContext | undefined,
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
    executionProfile: 'internal_dashboard',
    prompt: voiceoverJob.prompt,
    input: safeJson(voiceoverJob.inputJson),
    metadata,
    traceId: voiceoverJob.traceId,
    routingMode: typeof metadata.routingMode === 'string' ? metadata.routingMode : 'balanced',
    appGrantSnapshot: metadata.appGrantSnapshot as AppCapabilityGrantContext | undefined,
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

async function enqueueMusicBedJob(q: Queue, musicJob: DbJob): Promise<{ queued: boolean; skipped: boolean; error?: string }> {
  if (musicJob.status === 'completed' && musicJob.artifactId) return { queued: false, skipped: true }
  if ((musicJob.status === 'queued' || musicJob.status === 'processing') && musicJob.queueJobId) return { queued: false, skipped: true }
  const metadata = safeJson(musicJob.metadataJson)
  const queueJobId = musicJob.retryCount > 0 ? `${musicJob.id}:attempt:${musicJob.retryCount}` : musicJob.id
  await q.add('process', {
    jobId: musicJob.id,
    appSlug: musicJob.appSlug,
    capability: 'music_generation',
    executionProfile: 'internal_dashboard',
    prompt: musicJob.prompt,
    input: safeJson(musicJob.inputJson),
    metadata,
    traceId: musicJob.traceId,
    routingMode: typeof metadata.routingMode === 'string' ? metadata.routingMode : 'balanced',
    appGrantSnapshot: metadata.appGrantSnapshot as AppCapabilityGrantContext | undefined,
  } satisfies JobPayload, { ...DEFAULT_JOB_OPTIONS, jobId: queueJobId })
  await prisma.job.update({ where: { id: musicJob.id }, data: { status: 'queued', queueJobId, queuedAt: new Date(), workflowPhase: 'music_bed_queued', error: null } })
  return { queued: true, skipped: false }
}

async function createAutomaticSubtitleArtifact(parent: DbJob, plan: LongFormVideoPlan): Promise<string> {
  const scenes = plan.storyboard.scenes
    .filter((scene) => Boolean(scene.subtitleText?.trim()))
    .map((scene) => ({ sceneNumber: scene.sceneNumber, subtitleText: scene.subtitleText!, durationSeconds: scene.durationSeconds }))
  const content = generateSubtitles({ scenes, format: 'srt' })
  if (!content.trim()) throw new Error('subtitle_generation_failed: no subtitle text was generated')
  const artifact = await saveArtifact({
    input: {
      appSlug: parent.appSlug, type: 'transcript', subType: 'subtitles_srt',
      title: `long-form-${parent.executionId}-subtitles.srt`, description: 'Automatically generated long-form subtitles',
      provider: 'local', model: 'subtitle-generator', traceId: `trace_longform_${parent.executionId}_subtitles_srt`,
      mimeType: getSubtitleMimeType('srt'),
      metadata: { executionId: parent.executionId, parentJobId: parent.id, format: 'srt', sceneCount: scenes.length, automatic: true },
    },
    data: Buffer.from(content, 'utf8'),
    explicitMimeType: getSubtitleMimeType('srt'),
  })
  const current = await prisma.job.findUnique({ where: { id: parent.id }, select: { metadataJson: true } })
  await prisma.job.update({ where: { id: parent.id }, data: { metadataJson: JSON.stringify({
    ...safeJson(current?.metadataJson), subtitleArtifactId: artifact.id, subtitleFormat: 'srt', subtitlesReady: true,
  }) } })
  return artifact.id
}

async function createDurableLongFormExecution(appSlug: string, input: LongFormVideoRequest, routingMode: string, q: Queue, dryRun = false) {
  const plan = createLongFormVideoPlan(input)
  const executionId = randomUUID()
  const payloads = createSceneExecutionPayloads(plan, routingMode, executionId)
  const [longFormGrant, videoGrant, voiceGrant, musicGrant] = await Promise.all([
    resolveInternalDashboardCapabilityGrantSnapshot(appSlug, 'long_form_video'),
    resolveInternalDashboardCapabilityGrantSnapshot(appSlug, 'video_generation'),
    input.voiceoverEnabled ? resolveInternalDashboardCapabilityGrantSnapshot(appSlug, 'tts') : Promise.resolve(null),
    input.musicBedEnabled ? resolveInternalDashboardCapabilityGrantSnapshot(appSlug, 'music_generation') : Promise.resolve(null),
  ])
  if (!longFormGrant || !videoGrant) {
    throw new Error('Long-form execution requires registered internal long_form_video and video_generation capabilities')
  }
  if (input.voiceoverEnabled && !voiceGrant) {
    throw new Error('Voiceover execution requires a registered internal tts capability')
  }
  if (input.musicBedEnabled && !musicGrant) {
    throw new Error('Music-bed execution requires a registered internal music_generation capability')
  }
  const snapshotAt = new Date().toISOString()
  const parentGrantMetadata = {
    executionProfile: 'internal_dashboard',
    appGrantSnapshot: longFormGrant.grant,
    appGrantSnapshotSource: longFormGrant.source,
    appGrantSnapshotAt: snapshotAt,
  }
  const videoGrantMetadata = {
    executionProfile: 'internal_dashboard',
    orchestraExecutorConstraint: 'genx.video-generation',
    appGrantSnapshot: videoGrant.grant,
    appGrantSnapshotSource: videoGrant.source,
    appGrantSnapshotAt: snapshotAt,
  }

  const { parent, sceneJobs, voiceoverJobs, musicJob } = await prisma.$transaction(async (tx) => {
    const parent = await tx.job.create({
      data: {
        appSlug,
        capability: 'long_form_video',
        prompt: input.prompt,
        inputJson: JSON.stringify(input),
        metadataJson: JSON.stringify({ ...parentMetadata(input, plan, executionId), ...parentGrantMetadata }),
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
        ...videoGrantMetadata,
        parentJobId: parent.id,
        executionId,
        planVersion: plan.id,
        planVersionHash: plan.versionHash,
        routingMode,
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
      const voiceProfile = plan.voiceProfile ?? {}
      for (const scene of plan.storyboard.scenes) {
        if (!scene.voiceoverText) continue
        const voMetadata = {
          executionProfile: 'internal_dashboard',
          longFormVideo: true,
          longFormVoiceover: true,
          longFormExecutionId: executionId,
          planId: plan.id,
          planVersionHash: plan.versionHash,
          sceneNumber: scene.sceneNumber,
          sceneTitle: scene.title,
          parentJobId: parent.id,
          routingMode,
          retryGeneration: 0,
          appGrantSnapshot: voiceGrant!.grant,
          appGrantSnapshotSource: voiceGrant!.source,
          appGrantSnapshotAt: snapshotAt,
        }
        const voJob = await tx.job.create({
          data: {
            appSlug,
            capability: 'tts',
            prompt: scene.voiceoverText,
            inputJson: JSON.stringify({
              text: scene.voiceoverText,
              sceneNumber: scene.sceneNumber,
              voice: voiceProfile.voice ?? 'tara',
              speed: voiceProfile.speed ?? 1,
              outputFormat: voiceProfile.outputFormat ?? 'wav',
              language: voiceProfile.language ?? 'en',
              style: voiceProfile.tone,
            }),
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

    let musicJob: DbJob | null = null
    if (input.musicBedEnabled) {
      const musicBrief = plan.musicBrief || `${plan.tone} ${plan.style} instrumental background music`
      musicJob = await tx.job.create({ data: {
        appSlug, capability: 'music_generation', prompt: musicBrief,
        inputJson: JSON.stringify({ duration: Math.min(plan.totalDurationSeconds, 300), instrumentalOnly: true, style: plan.style }),
        metadataJson: JSON.stringify({
          executionProfile: 'internal_dashboard',
          longFormVideo: true, longFormMusicBed: true, longFormExecutionId: executionId, parentJobId: parent.id,
          planId: plan.id, routingMode, retryGeneration: 0, appGrantSnapshot: musicGrant!.grant,
          appGrantSnapshotSource: musicGrant!.source, appGrantSnapshotAt: snapshotAt,
        }),
        traceId: `trace_longform_${executionId}_music_bed`, status: dryRun ? 'planned' : 'queued',
        parentJobId: parent.id, executionId, workflowPhase: dryRun ? 'music_bed_planned' : 'music_bed_created',
      } })
    }

    await tx.job.update({
      where: { id: parent.id },
      data: {
        metadataJson: JSON.stringify({
          ...parentMetadata(input, plan, executionId),
          ...parentGrantMetadata,
          voiceoverJobIds: voiceoverJobs.map((j) => j.id),
          musicBedJobId: musicJob?.id ?? null,
        }),
      },
    })

    return { parent, sceneJobs, voiceoverJobs, musicJob }
  })

  let subtitleArtifactId: string | null = null
  if (input.subtitlesEnabled && !dryRun) subtitleArtifactId = await createAutomaticSubtitleArtifact(parent, plan)
  await refreshLongFormParentState(parent.id)
  const queueResult = dryRun ? { queued: [], skipped: [], failed: [] } : await enqueueSceneJobs(q, parent, sceneJobs)
  let voiceoverQueueResult = { queued: [] as string[], skipped: [] as string[], failed: [] as Array<{ jobId: string; error: string }> }
  if (input.voiceoverEnabled && !dryRun && voiceoverJobs.length > 0) {
    voiceoverQueueResult = await enqueueVoiceoverJobs(q, voiceoverJobs)
  }
  const musicQueueResult = musicJob && !dryRun ? await enqueueMusicBedJob(q, musicJob) : { queued: false, skipped: true }
  const latest = await loadParentAndScenes(parent.id, appSlug)
  return { parent: latest?.parent ?? parent, sceneJobs: latest?.sceneJobs ?? sceneJobs, voiceoverJobs, musicJob, subtitleArtifactId, queueResult, voiceoverQueueResult, musicQueueResult, plan, executionId }
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

  // ── Plan Endpoint: create and persist plan WITHOUT executing ──────────────────
  app.post('/api/admin/long-form-video/plan', async (request, reply) => {
    if (!(await requireAdmin(app, request, reply))) return
    const body = request.body as Record<string, unknown>
    const override = blockedOverrideField(body)
    if (override) return reply.status(400).send({ error: true, message: `Provider/model override not allowed. Blocked field: ${override}` })

    try {
      const validatedRequest = validateLongFormVideoRequest(body)
      const plan = createLongFormVideoPlan(validatedRequest)
      const validation = validatePlanCompleteness(plan)

      // Persist plan as a durable parent in 'planned' status (dry-run style, no queue calls)
      const executionId = randomUUID()
      const parent = await prisma.job.create({
        data: {
          appSlug: APP_SLUG,
          capability: 'long_form_video',
          prompt: validatedRequest.prompt,
          inputJson: JSON.stringify(validatedRequest),
          metadataJson: JSON.stringify({
            ...parentMetadata(validatedRequest, plan, executionId),
            planOnly: true,
            approved: false,
          }),
          traceId: `trace_longform_${executionId}`,
          status: 'planned',
          progress: 0,
          executionId,
          workflowPhase: 'plan_created',
        },
      })

      return reply.status(200).send({
        success: true,
        plan,
        planId: plan.id,
        versionHash: plan.versionHash,
        executionId,
        parentJobId: parent.id,
        validation,
        providerCallsStarted: false,
        message: 'Long-form video plan created. No media provider calls started. Approve the plan to begin execution.',
      })
    } catch (error) {
      return reply.status(400).send({
        error: true,
        message: 'Invalid request',
        details: error instanceof Error ? error.message : 'Validation failed',
      })
    }
  })

  // ── Approve Endpoint: verify plan hash, then execute ────────────────────────
  app.post('/api/admin/long-form-video/approve', async (request, reply) => {
    if (!(await requireAdmin(app, request, reply))) return
    const body = request.body as Record<string, unknown>
    const override = blockedOverrideField(body)
    if (override) return reply.status(400).send({ error: true, message: `Provider/model override not allowed. Blocked field: ${override}` })

    const planId = body.planId as string | undefined
    const versionHash = body.versionHash as string | undefined
    const executionId = body.executionId as string | undefined

    if (!planId || !versionHash || !executionId) {
      return reply.status(400).send({ error: true, message: 'planId, versionHash, and executionId are required' })
    }

    try {
      // Load the persisted planned parent
      const loaded = await loadParentAndScenes(executionId, APP_SLUG)
      if (!loaded) return reply.status(404).send({ error: true, message: 'Planned execution not found' })
      if (loaded.parent.status !== 'planned') {
        return reply.status(409).send({ error: true, message: `Execution is already in status '${loaded.parent.status}', not 'planned'` })
      }

      const metadata = safeJson(loaded.parent.metadataJson)
      const storedPlan = metadata.plan as LongFormVideoPlan | undefined
      if (!storedPlan) return reply.status(409).send({ error: true, message: 'No plan found in execution metadata' })

      // Verify plan ID matches
      if (storedPlan.id !== planId) {
        return reply.status(409).send({ error: true, message: 'Plan ID does not match the persisted plan' })
      }

      // Verify version hash matches (immutable check)
      if (storedPlan.versionHash !== versionHash) {
        return reply.status(409).send({ error: true, message: 'Plan version hash does not match. The plan may have been modified.' })
      }

      // Validate plan completeness
      const validation = validatePlanCompleteness(storedPlan)
      if (!validation.valid) {
        return reply.status(422).send({ error: true, message: 'Plan validation failed', errors: validation.errors })
      }

      // Now execute: create scene jobs, voiceover jobs, music jobs using the stored plan
      const request = metadata.request as LongFormVideoRequest
      const routingMode = normalizeRoutingMode(metadata.routingMode ?? storedPlan.routingMode)

      // Reuse the existing execution creation logic, but keyed to this executionId
      const result = await createDurableLongFormExecution(
        APP_SLUG,
        request,
        routingMode,
        getQueue(),
        false, // not dry run - actually execute
      )

      const status = deriveStatus(result.parent, result.sceneJobs)
      return reply.status(202).send({
        success: true,
        parentJobId: result.parent.id,
        executionId: result.executionId,
        queuedJobs: result.queueResult.queued,
        skippedJobs: result.queueResult.skipped,
        failedQueueSubmissions: result.queueResult.failed,
        planId: storedPlan.id,
        versionHash: storedPlan.versionHash,
        status,
        providerCallsStarted: true,
        message: 'Plan approved and execution started.',
      })
    } catch (error) {
      return reply.status(400).send({
        error: true,
        message: 'Plan approval failed',
        details: error instanceof Error ? error.message : 'Unknown error',
      })
    }
  })

  // ── Preview Scene Endpoint: preview one scene from a planned parent ─────────
  app.post('/api/admin/long-form-video/preview-scene', async (request, reply) => {
    if (!(await requireAdmin(app, request, reply))) return
    const body = request.body as Record<string, unknown>
    const override = blockedOverrideField(body)
    if (override) return reply.status(400).send({ error: true, message: `Provider/model override not allowed. Blocked field: ${override}` })

    const executionId = body.executionId as string | undefined
    const planId = body.planId as string | undefined
    const versionHash = body.versionHash as string | undefined
    const sceneNumber = typeof body.sceneNumber === 'number' ? body.sceneNumber : Number(body.sceneNumber)

    if (!executionId || !planId || !versionHash || !sceneNumber) {
      return reply.status(400).send({ error: true, message: 'executionId, planId, versionHash, and sceneNumber are required' })
    }

    try {
      // Load the persisted planned parent
      const loaded = await loadParentAndScenes(executionId, APP_SLUG)
      if (!loaded) return reply.status(404).send({ error: true, message: 'Planned execution not found' })
      if (loaded.parent.status !== 'planned') {
        return reply.status(409).send({ error: true, message: `Execution is already in status '${loaded.parent.status}', not 'planned'` })
      }

      const metadata = safeJson(loaded.parent.metadataJson)
      if (metadata.approved === true) {
        return reply.status(409).send({ error: true, message: 'Plan is already approved and executing' })
      }

      const storedPlan = metadata.plan as LongFormVideoPlan | undefined
      if (!storedPlan) return reply.status(409).send({ error: true, message: 'No plan found in execution metadata' })

      // Verify plan ID matches
      if (storedPlan.id !== planId) {
        return reply.status(409).send({ error: true, message: 'Plan ID does not match the persisted plan' })
      }

      // Verify version hash matches (immutable check)
      if (storedPlan.versionHash !== versionHash) {
        return reply.status(409).send({ error: true, message: 'Plan version hash does not match. The plan may have been modified.' })
      }

      // Validate plan completeness
      const validation = validatePlanCompleteness(storedPlan)
      if (!validation.valid) {
        return reply.status(422).send({ error: true, message: 'Plan validation failed', errors: validation.errors })
      }

      // Find the requested scene
      const scene = storedPlan.storyboard.scenes.find((s) => s.sceneNumber === sceneNumber)
      if (!scene) {
        return reply.status(404).send({ error: true, message: `Scene ${sceneNumber} not found in plan. Available scenes: ${storedPlan.storyboard.scenes.map((s) => s.sceneNumber).join(', ')}` })
      }

      const routingMode = normalizeRoutingMode(metadata.routingMode ?? storedPlan.routingMode)

      // Idempotency: check if a preview already exists for this scene/plan/version
      const previewTraceId = `trace_longform_preview_${executionId}_scene_${sceneNumber}`
      const existingPreview = await prisma.job.findFirst({
        where: {
          traceId: previewTraceId,
          metadataJson: { contains: '"longFormScenePreview":true' },
        },
        orderBy: { createdAt: 'desc' },
      })

      if (existingPreview) {
        const existingStatus = existingPreview.status
        if (['queued', 'processing'].includes(existingStatus)) {
          return reply.status(200).send({
            success: true,
            previewJobId: existingPreview.id,
            sceneNumber,
            planId: storedPlan.id,
            versionHash: storedPlan.versionHash,
            routingMode,
            status: existingStatus,
            providerCallsStarted: true,
            reused: true,
            message: `Preview job already ${existingStatus}. Reusing existing job.`,
          })
        }
        if (existingStatus === 'completed') {
          const existingMeta = safeJson(existingPreview.metadataJson)
          return reply.status(200).send({
            success: true,
            previewJobId: existingPreview.id,
            sceneNumber,
            planId: storedPlan.id,
            versionHash: storedPlan.versionHash,
            routingMode,
            status: 'completed',
            providerCallsStarted: true,
            artifactId: existingPreview.artifactId ?? existingMeta.artifactId ?? null,
            provider: existingMeta.orchestraActualProvider ?? existingMeta.directProviderExecutorId ?? null,
            model: existingMeta.orchestraActualModel ?? null,
            reused: true,
            message: 'Preview already completed. Reusing existing artifact.',
          })
        }
        if (existingStatus === 'failed') {
          return reply.status(409).send({
            error: true,
            message: 'Previous preview failed. Use the retry endpoint to re-run.',
            previewJobId: existingPreview.id,
            status: 'failed',
          })
        }
      }

      // Resolve video grant for the preview job
      const videoGrant = await resolveInternalDashboardCapabilityGrantSnapshot(APP_SLUG, 'video_generation')
      if (!videoGrant) {
        return reply.status(500).send({ error: true, message: 'No registered internal video_generation capability' })
      }

      // Build the scene payload using canonical functions
      const payloads = createSceneExecutionPayloads(storedPlan, routingMode, executionId)
      const payload = payloads.find((p) => p.sceneNumber === sceneNumber)
      if (!payload) {
        return reply.status(500).send({ error: true, message: 'Failed to create scene payload' })
      }

      const snapshotAt = new Date().toISOString()
      const videoGrantMetadata = {
        executionProfile: 'internal_dashboard',
        orchestraExecutorConstraint: 'genx.video-generation',
        appGrantSnapshot: videoGrant.grant,
        appGrantSnapshotSource: videoGrant.source,
        appGrantSnapshotAt: snapshotAt,
      }

      // Create exactly one preview job
      const previewJob = await prisma.job.create({
        data: {
          appSlug: APP_SLUG,
          capability: 'video_generation',
          prompt: payload.prompt,
          inputJson: JSON.stringify(payload.input),
          metadataJson: JSON.stringify({
            ...payload.metadata,
            ...videoGrantMetadata,
            longFormVideo: true,
            longFormScenePreview: true,
            sourcePlanId: storedPlan.id,
            sourcePlanVersionHash: storedPlan.versionHash,
            sourcePlanExecutionId: executionId,
            sceneNumber,
            routingMode,
            retryGeneration: 0,
            createdFromApprovedPlan: false,
            executionProfile: 'internal_dashboard',
          }),
          traceId: previewTraceId,
          status: 'queued',
          executionId,
          sceneNumber,
          workflowPhase: 'scene_preview_queued',
        },
      })

      // Queue the preview job using the canonical scene enqueue function
      const queue = getQueue()
      const enqueueResult = await enqueueSceneJob(queue, previewJob)

      return reply.status(202).send({
        success: true,
        previewJobId: previewJob.id,
        sceneNumber,
        planId: storedPlan.id,
        versionHash: storedPlan.versionHash,
        routingMode,
        status: enqueueResult.queued ? 'queued' : enqueueResult.skipped ? 'skipped' : 'failed_to_queue',
        providerCallsStarted: enqueueResult.queued,
        downgradeRequired: false,
        downgradeReason: null,
        message: enqueueResult.queued
          ? `Scene ${sceneNumber} preview queued with ${routingMode} routing. No other scenes, audio, or assembly started.`
          : enqueueResult.skipped
            ? `Scene ${sceneNumber} preview skipped (already queued or terminal).`
            : `Failed to queue scene ${sceneNumber} preview.`,
      })
    } catch (error) {
      return reply.status(400).send({
        error: true,
        message: 'Scene preview failed',
        details: error instanceof Error ? error.message : 'Unknown error',
      })
    }
  })

  // ── Preview Scene Retry Endpoint ─────────────────────────────────────────────
  app.post('/api/admin/long-form-video/preview-scene/retry', async (request, reply) => {
    if (!(await requireAdmin(app, request, reply))) return
    const body = request.body as Record<string, unknown>
    const override = blockedOverrideField(body)
    if (override) return reply.status(400).send({ error: true, message: `Provider/model override not allowed. Blocked field: ${override}` })

    const executionId = body.executionId as string | undefined
    const planId = body.planId as string | undefined
    const versionHash = body.versionHash as string | undefined
    const sceneNumber = typeof body.sceneNumber === 'number' ? body.sceneNumber : Number(body.sceneNumber)

    if (!executionId || !planId || !versionHash || !sceneNumber) {
      return reply.status(400).send({ error: true, message: 'executionId, planId, versionHash, and sceneNumber are required' })
    }

    try {
      const previewTraceId = `trace_longform_preview_${executionId}_scene_${sceneNumber}`
      const existingPreview = await prisma.job.findFirst({
        where: {
          traceId: previewTraceId,
          metadataJson: { contains: '"longFormScenePreview":true' },
        },
        orderBy: { createdAt: 'desc' },
      })

      if (!existingPreview) {
        return reply.status(404).send({ error: true, message: 'No preview job found for this scene. Use the preview endpoint to create one.' })
      }

      if (existingPreview.status === 'completed') {
        return reply.status(409).send({ error: true, message: 'Preview already completed. Cannot retry a completed preview.' })
      }

      if (!['failed', 'cancelled'].includes(existingPreview.status)) {
        return reply.status(409).send({ error: true, message: `Preview is in status '${existingPreview.status}'. Only failed or cancelled previews can be retried.` })
      }

      const existingMeta = safeJson(existingPreview.metadataJson)
      const retryGeneration = (typeof existingMeta.retryGeneration === 'number' ? existingMeta.retryGeneration : 0) + 1
      if (retryGeneration > MAX_SCENE_RETRIES) {
        return reply.status(429).send({ error: true, message: `Retry limit (${MAX_SCENE_RETRIES}) reached for this preview.` })
      }

      // Update the existing job for retry
      await prisma.job.update({
        where: { id: existingPreview.id },
        data: {
          status: 'queued',
          progress: 0,
          error: null,
          metadataJson: JSON.stringify({
            ...existingMeta,
            retryGeneration,
            retryAt: new Date().toISOString(),
          }),
          workflowPhase: 'scene_preview_retry_queued',
        },
      })

      // Re-queue
      const queue = getQueue()
      const enqueueResult = await enqueueSceneJob(queue, existingPreview)

      return reply.status(202).send({
        success: true,
        previewJobId: existingPreview.id,
        sceneNumber,
        planId: existingMeta.sourcePlanId ?? planId,
        versionHash: existingMeta.sourcePlanVersionHash ?? versionHash,
        routingMode: normalizeRoutingMode(existingMeta.routingMode ?? 'balanced'),
        status: enqueueResult.queued ? 'queued' : enqueueResult.skipped ? 'skipped' : 'failed_to_queue',
        retryGeneration,
        message: `Scene ${sceneNumber} preview retry #${retryGeneration} queued.`,
      })
    } catch (error) {
      return reply.status(400).send({
        error: true,
        message: 'Scene preview retry failed',
        details: error instanceof Error ? error.message : 'Unknown error',
      })
    }
  })

  // ── Execution Handler (backward-compatible, for simple neutral tests) ───────
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
    if (loaded.parent.status === 'completed') {
      return reply.status(200).send({
        success: true,
        alreadyCompleted: true,
        queueResult: { queued: [], skipped: loaded.sceneJobs.map((job) => job.id), failed: [] },
        execution: deriveStatus(loaded.parent, loaded.sceneJobs),
      })
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
    const existingMusic = loaded.childJobs.find((job) => job.capability === 'music_generation' && safeJson(job.metadataJson).longFormMusicBed === true)
    if (existingMusic) {
      return reply.status(200).send({
        success: existingMusic.status !== 'failed',
        musicJobId: existingMusic.id,
        status: existingMusic.status,
        artifactId: existingMusic.artifactId,
        message: 'Canonical long-form music-bed child already exists; no duplicate was created.',
      })
    }

    const override = blockedOverrideField(body)
    if (override) return reply.status(400).send({ error: true, message: `Provider/model override not allowed. Blocked field: ${override}` })

    const prompt = (body.prompt as string) || `${plan.tone} ${plan.style} instrumental background music`
    const routingMode = isValidRoutingMode(body.routingMode) ? body.routingMode as string : 'balanced'

    try {
      const musicGrant = await resolveInternalDashboardCapabilityGrantSnapshot(APP_SLUG, 'music_generation')
      if (!musicGrant) {
        return reply.status(403).send({ error: true, message: 'Music bed execution requires a registered internal music_generation capability' })
      }
      const grantSnapshotAt = new Date().toISOString()
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
            executionProfile: 'internal_dashboard',
            longFormVideo: true,
            longFormMusicBed: true,
            longFormExecutionId: executionId,
            parentJobId: loaded.parent.id,
            planId: plan.id,
            routingMode,
            retryGeneration: 0,
            appGrantSnapshot: musicGrant.grant,
            appGrantSnapshotSource: musicGrant.source,
            appGrantSnapshotAt: grantSnapshotAt,
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
          executionProfile: 'internal_dashboard',
          prompt,
          input: { prompt, durationSeconds: plan.totalDurationSeconds, instrumentalOnly: true },
          metadata: {
            executionProfile: 'internal_dashboard',
            longFormVideo: true,
            longFormMusicBed: true,
            longFormExecutionId: executionId,
            parentJobId: loaded.parent.id,
            routingMode,
            appGrantSnapshot: musicGrant.grant,
            appGrantSnapshotSource: musicGrant.source,
            appGrantSnapshotAt: grantSnapshotAt,
          },
          traceId,
          routingMode,
          appGrantSnapshot: musicGrant.grant,
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

    const refreshed = await refreshLongFormParentState(loaded.parent.id)
    if (!refreshed?.componentState.readyToQueueAssembly) {
      return reply.status(409).send({
        error: true,
        message: 'Cannot queue assembly: requested components are not ready',
        blockedReasons: refreshed?.componentState.blockedReasons ?? ['component_state_unavailable'],
        componentState: refreshed?.componentState ?? null,
      })
    }

    const ffmpeg = await checkFfmpegAvailable()
    if (dryRun) return reply.status(200).send({ success: true, dryRun: true, ffmpegAvailable: ffmpeg.available, componentState: refreshed.componentState })
    if (!ffmpeg.available) return reply.status(422).send({ error: true, message: 'Cannot assemble: ffmpeg is not available', ffmpegError: ffmpeg.error })

    const result = await advanceLongFormWorkflow(loaded.parent.id, getQueue())
    return reply.status(202).send({
      success: true,
      executionId: loaded.parent.executionId,
      assemblyJobId: result.assemblyJobId,
      scheduled: result.scheduled,
      outputTitle: outputTitle ?? null,
      note: result.scheduled
        ? 'Canonical worker assembly queued.'
        : 'Canonical assembly job already exists or is already running.',
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
    const ffmpeg = await checkFfmpegAvailable()
    const truth = await buildAdminRuntimeTruth(app)
    const canonical = truth.capabilities.find((capability) => capability.capability === 'long_form_video')
    return reply.status(200).send({
      success: true,
      status: {
        ...canonical,
        ffmpegAvailable: ffmpeg.available,
      },
      ffmpeg,
      message: canonical?.fullMultimediaReady
        ? 'Long-form multimedia execution is proven ready.'
        : 'Long-form component readiness is derived from callable implementations, infrastructure, and proof evidence.',
      limitations: {
        executionStateStorage: 'Durable parent and linked Job rows (scene + voiceover)',
        executionStateRecovery: 'Recovered by exact parentJobId/executionId fields',
        assemblyMode: canonical?.fullMultimediaReady ? 'multimedia_ready' : 'video_only_or_blocked',
        voiceoverIncluded: canonical?.voiceoverReady === true,
        subtitlesIncluded: canonical?.subtitlesReady === true,
        musicBedIncluded: canonical?.musicBedReady === true,
      },
    })
  })
}
