import { prisma } from './client.js'

export interface LongFormJobLike {
  id: string
  capability: string
  status: string
  artifactId?: string | null
  sceneNumber?: number | null
  retryCount?: number
  error?: string | null
  metadataJson?: unknown
  output?: string | null
}

export interface LongFormArtifactLike {
  id: string
  mimeType: string
  fileSizeBytes: number
  status: string
  metadata?: unknown
}

export interface LongFormComponentState {
  scenes: {
    requestedCount: number; plannedCount: number; queuedCount: number; processingCount: number
    completedCount: number; failedCount: number; cancellingCount: number; cancelledCount: number
    artifactIds: string[]; ready: boolean; retryableFailures: Array<{ jobId: string; sceneNumber: number | null; retryCount: number; error: string | null }>
  }
  voiceover: {
    requested: boolean; expectedCount: number; plannedCount: number; queuedCount: number; processingCount: number
    completedCount: number; failedCount: number; artifactIds: string[]; ready: boolean
  }
  subtitles: { requested: boolean; generated: boolean; artifactId: string | null; format: string | null; ready: boolean }
  musicBed: { requested: boolean; jobId: string | null; status: string; artifactId: string | null; duration: number | null; ready: boolean }
  assembly: {
    requestedComponents: string[]; jobId: string | null; assemblyQueued: boolean; assemblyProcessing: boolean
    finalArtifactId: string | null; finalVideoValidated: boolean; finalAudioValidated: boolean; requestedComponentsIncluded: boolean; ready: boolean
  }
  blockedReasons: string[]
  readyToQueueAssembly: boolean
  progress: number
}

export interface ClassifiedLongFormJobs {
  scenes: LongFormJobLike[]
  voiceovers: LongFormJobLike[]
  musicBeds: LongFormJobLike[]
  assemblies: LongFormJobLike[]
  unrelated: LongFormJobLike[]
}

export function classifyLongFormChildJobs(children: LongFormJobLike[]): ClassifiedLongFormJobs {
  const classified: ClassifiedLongFormJobs = { scenes: [], voiceovers: [], musicBeds: [], assemblies: [], unrelated: [] }
  for (const child of children) {
    const metadata = safeJson(child.metadataJson)
    if (child.capability === 'video_generation' && metadata.longFormVideo === true && validSceneNumber(child.sceneNumber ?? metadata.sceneNumber)) {
      classified.scenes.push(child)
    } else if (child.capability === 'tts' && metadata.longFormVoiceover === true) {
      classified.voiceovers.push(child)
    } else if (child.capability === 'music_generation' && metadata.longFormMusicBed === true) {
      classified.musicBeds.push(child)
    } else if (child.capability === 'long_form_video' && metadata.longFormAssembly === true) {
      classified.assemblies.push(child)
    } else {
      classified.unrelated.push(child)
    }
  }
  classified.scenes.sort(byScene)
  classified.voiceovers.sort(byScene)
  return classified
}

export function deriveLongFormComponentState(input: {
  parentMetadata: unknown
  children: LongFormJobLike[]
  artifacts?: LongFormArtifactLike[]
}): LongFormComponentState {
  const metadata = safeJson(input.parentMetadata)
  const request = safeJson(metadata.request)
  const plan = safeJson(metadata.plan)
  const storyboard = safeJson(plan.storyboard)
  const plannedScenes = Array.isArray(storyboard.scenes) ? storyboard.scenes.filter(isRecord) : []
  const jobs = classifyLongFormChildJobs(input.children)
  const artifacts = new Map((input.artifacts ?? []).map((artifact) => [artifact.id, artifact]))
  const requestedSceneCount = plannedScenes.length || jobs.scenes.length

  const sceneArtifacts = completedArtifactIds(jobs.scenes)
  const scenes = {
    requestedCount: requestedSceneCount,
    plannedCount: count(jobs.scenes, 'planned'), queuedCount: count(jobs.scenes, 'queued'), processingCount: count(jobs.scenes, 'processing'),
    completedCount: count(jobs.scenes, 'completed'), failedCount: count(jobs.scenes, 'failed'),
    cancellingCount: count(jobs.scenes, 'cancelling'), cancelledCount: count(jobs.scenes, 'cancelled'),
    artifactIds: sceneArtifacts,
    ready: requestedSceneCount > 0 && sceneArtifacts.length === requestedSceneCount && count(jobs.scenes, 'failed') === 0 && count(jobs.scenes, 'cancelled') === 0,
    retryableFailures: jobs.scenes.filter((job) => job.status === 'failed' && (job.retryCount ?? 0) < 3).map((job) => ({
      jobId: job.id, sceneNumber: job.sceneNumber ?? null, retryCount: job.retryCount ?? 0, error: job.error ?? null,
    })),
  }

  const voiceoverRequested = request.voiceoverEnabled === true
  const narratedSceneNumbers = new Set(plannedScenes
    .filter((scene) => stringValue(scene.voiceoverText).length > 0)
    .map((scene) => numberValue(scene.sceneNumber)).filter((value): value is number => value !== null))
  const expectedVoiceovers = voiceoverRequested ? narratedSceneNumbers.size : 0
  const relevantVoiceovers = jobs.voiceovers.filter((job) => narratedSceneNumbers.size === 0 || narratedSceneNumbers.has(job.sceneNumber ?? numberValue(safeJson(job.metadataJson).sceneNumber) ?? -1))
  const voiceArtifactIds = completedArtifactIds(relevantVoiceovers)
  const voiceover = {
    requested: voiceoverRequested, expectedCount: expectedVoiceovers,
    plannedCount: count(relevantVoiceovers, 'planned'), queuedCount: count(relevantVoiceovers, 'queued'), processingCount: count(relevantVoiceovers, 'processing'),
    completedCount: count(relevantVoiceovers, 'completed'), failedCount: count(relevantVoiceovers, 'failed'), artifactIds: voiceArtifactIds,
    ready: !voiceoverRequested || (voiceArtifactIds.length === expectedVoiceovers && count(relevantVoiceovers, 'failed') === 0),
  }

  const subtitleRequested = request.subtitlesEnabled === true
  const subtitleArtifactId = stringValue(metadata.subtitleArtifactId) || null
  const subtitleArtifact = subtitleArtifactId ? artifacts.get(subtitleArtifactId) : undefined
  const subtitleFormat = stringValue(metadata.subtitleFormat) || mimeSubtitleFormat(subtitleArtifact?.mimeType) || null
  const subtitles = {
    requested: subtitleRequested,
    generated: Boolean(subtitleArtifact && subtitleArtifact.status === 'completed' && subtitleArtifact.fileSizeBytes > 0),
    artifactId: subtitleArtifactId,
    format: subtitleFormat,
    ready: !subtitleRequested || Boolean(subtitleArtifact && subtitleArtifact.status === 'completed' && subtitleArtifact.fileSizeBytes > 0 && subtitleFormat),
  }

  const musicRequested = request.musicBedEnabled === true
  const musicJob = jobs.musicBeds[0] ?? null
  const musicArtifactId = musicJob?.status === 'completed' ? musicJob.artifactId ?? null : null
  const musicArtifact = musicArtifactId ? artifacts.get(musicArtifactId) : undefined
  const musicDuration = positiveNumber(safeJson(musicArtifact?.metadata).duration)
    ?? positiveNumber(safeJson(musicJob?.output).duration)
  const musicBed = {
    requested: musicRequested, jobId: musicJob?.id ?? null, status: musicJob?.status ?? (musicRequested ? 'missing' : 'not_requested'),
    artifactId: musicArtifactId, duration: musicDuration,
    ready: !musicRequested || Boolean(musicJob?.status === 'completed' && musicArtifactId && musicArtifact?.status === 'completed' && musicArtifact.fileSizeBytes > 0 && musicDuration),
  }

  const assemblyJob = jobs.assemblies[0] ?? null
  const finalArtifactId = assemblyJob?.status === 'completed' ? assemblyJob.artifactId ?? null : null
  const finalArtifact = finalArtifactId ? artifacts.get(finalArtifactId) : undefined
  const assemblyMetadata = safeJson(assemblyJob?.output)
  const finalMetadata = safeJson(finalArtifact?.metadata)
  const audioRequested = voiceoverRequested || musicRequested
  const finalVideoValidated = (assemblyMetadata.finalVideoValidated === true || finalMetadata.finalVideoValidated === true)
    && Boolean(finalArtifact?.status === 'completed' && finalArtifact.fileSizeBytes > 0)
  const finalAudioValidated = !audioRequested || assemblyMetadata.finalAudioValidated === true || finalMetadata.finalAudioValidated === true
  const requestedComponentsIncluded = (!voiceoverRequested || assemblyMetadata.voiceoverIncluded === true || finalMetadata.voiceoverIncluded === true)
    && (!subtitleRequested || assemblyMetadata.subtitlesIncluded === true || finalMetadata.subtitlesIncluded === true)
    && (!musicRequested || assemblyMetadata.musicBedIncluded === true || finalMetadata.musicBedIncluded === true)
  const requestedComponents = ['scenes', ...(voiceoverRequested ? ['voiceover'] : []), ...(subtitleRequested ? ['subtitles'] : []), ...(musicRequested ? ['music_bed'] : [])]
  const assembly = {
    requestedComponents, jobId: assemblyJob?.id ?? null,
    assemblyQueued: assemblyJob?.status === 'queued', assemblyProcessing: assemblyJob?.status === 'processing',
    finalArtifactId, finalVideoValidated, finalAudioValidated, requestedComponentsIncluded,
    ready: Boolean(finalArtifactId && finalVideoValidated && finalAudioValidated && requestedComponentsIncluded && assemblyJob?.status === 'completed'),
  }

  const dependenciesReady = scenes.ready && voiceover.ready && subtitles.ready && musicBed.ready
  const blockedReasons = deriveBlockedReasons({ scenes, voiceover, subtitles, musicBed, assembly, assemblyJob })
  const completedUnits = scenes.completedCount + voiceover.completedCount + Number(subtitles.generated) + Number(musicBed.ready && musicRequested) + Number(assembly.ready)
  const totalUnits = requestedSceneCount + expectedVoiceovers + Number(subtitleRequested) + Number(musicRequested) + 1
  return {
    scenes, voiceover, subtitles, musicBed, assembly, blockedReasons,
    readyToQueueAssembly: dependenciesReady && !assemblyJob,
    progress: totalUnits > 0 ? Math.min(100, Math.round(completedUnits / totalUnits * 100)) : 0,
  }
}

export async function refreshLongFormParentState(parentJobId: string): Promise<{
  parent: NonNullable<Awaited<ReturnType<typeof prisma.job.findUnique>>>
  sceneJobs: NonNullable<Awaited<ReturnType<typeof prisma.job.findUnique>>>[]
  childJobs: NonNullable<Awaited<ReturnType<typeof prisma.job.findUnique>>>[]
  metadata: Record<string, unknown>
  componentState: LongFormComponentState
} | null> {
  const parent = await prisma.job.findUnique({ where: { id: parentJobId } })
  if (!parent || parent.capability !== 'long_form_video') return null
  const childJobs = await prisma.job.findMany({ where: { appSlug: parent.appSlug, parentJobId: parent.id }, orderBy: [{ sceneNumber: 'asc' }, { createdAt: 'asc' }] })
  const artifactIds = [...new Set([
    ...childJobs.map((job) => job.artifactId).filter((id): id is string => Boolean(id)),
    stringValue(safeJson(parent.metadataJson).subtitleArtifactId),
  ].filter(Boolean))]
  const artifacts = artifactIds.length > 0 ? await prisma.artifact.findMany({ where: { id: { in: artifactIds } } }) : []
  const componentState = deriveLongFormComponentState({ parentMetadata: parent.metadataJson, children: childJobs, artifacts })
  const classified = classifyLongFormChildJobs(childJobs)
  const terminalFailure = componentState.scenes.failedCount > 0 || componentState.voiceover.failedCount > 0 || componentState.musicBed.status === 'failed'
    || classified.assemblies.some((job) => job.status === 'failed')
  const cancelled = parent.status === 'cancelled'
  const nextStatus = cancelled ? 'cancelled' : componentState.assembly.ready ? 'completed' : terminalFailure ? 'processing' : parent.status === 'planned' ? 'planned' : 'processing'
  const workflowPhase = cancelled ? 'cancelled'
    : componentState.assembly.ready ? 'completed'
      : classified.assemblies.some((job) => job.status === 'failed') ? 'assembly_failed'
        : componentState.assembly.assemblyProcessing ? 'assembly_processing'
          : componentState.assembly.assemblyQueued ? 'assembly_queued'
            : componentState.readyToQueueAssembly ? 'assembly_ready'
              : 'component_execution'
  const metadata = {
    ...safeJson(parent.metadataJson),
    componentState,
    plannedSceneCount: componentState.scenes.requestedCount,
    queuedSceneCount: componentState.scenes.queuedCount,
    processingSceneCount: componentState.scenes.processingCount,
    completedSceneCount: componentState.scenes.completedCount,
    failedSceneCount: componentState.scenes.failedCount,
    completedArtifactIds: componentState.scenes.artifactIds,
    retryableFailures: componentState.scenes.retryableFailures,
    finalAssemblyReady: componentState.readyToQueueAssembly || componentState.assembly.assemblyQueued || componentState.assembly.assemblyProcessing,
    blockedReasons: componentState.blockedReasons,
    currentPhase: workflowPhase,
    refreshedAt: new Date().toISOString(),
  }
  const updated = await prisma.job.update({
    where: { id: parent.id },
    data: {
      status: nextStatus, progress: componentState.assembly.ready ? 100 : componentState.progress, workflowPhase,
      artifactId: componentState.assembly.finalArtifactId ?? parent.artifactId,
      metadataJson: JSON.stringify(metadata),
      completedAt: componentState.assembly.ready ? parent.completedAt ?? new Date() : parent.completedAt,
      error: terminalFailure ? componentState.blockedReasons.join('; ') : null,
    },
  })
  return { parent: updated, sceneJobs: classified.scenes as typeof childJobs, childJobs, metadata, componentState }
}

function deriveBlockedReasons(input: {
  scenes: LongFormComponentState['scenes']; voiceover: LongFormComponentState['voiceover']; subtitles: LongFormComponentState['subtitles']
  musicBed: LongFormComponentState['musicBed']; assembly: LongFormComponentState['assembly']; assemblyJob: LongFormJobLike | null
}): string[] {
  const reasons: string[] = []
  if (input.scenes.failedCount > 0) reasons.push('scene_job_failed')
  else if (!input.scenes.ready) reasons.push('scene_jobs_pending')
  if (input.voiceover.failedCount > 0) reasons.push('voiceover_job_failed')
  else if (!input.voiceover.ready) reasons.push('voiceover_jobs_pending')
  if (input.subtitles.requested && !input.subtitles.ready) reasons.push(input.subtitles.artifactId ? 'subtitle_generation_failed' : 'subtitle_generation_pending')
  if (input.musicBed.requested && input.musicBed.status === 'failed') reasons.push('music_bed_failed')
  else if (!input.musicBed.ready) reasons.push('music_bed_pending')
  if (input.assemblyJob?.status === 'failed') reasons.push('assembly_failed')
  else if (input.assembly.assemblyQueued || input.assembly.assemblyProcessing) reasons.push('assembly_pending')
  if (input.assembly.finalArtifactId && (!input.assembly.finalVideoValidated || !input.assembly.finalAudioValidated || !input.assembly.requestedComponentsIncluded)) reasons.push('final_artifact_validation_failed')
  return reasons
}

function count(jobs: LongFormJobLike[], status: string): number { return jobs.filter((job) => job.status === status).length }
function completedArtifactIds(jobs: LongFormJobLike[]): string[] { return jobs.filter((job) => job.status === 'completed' && job.artifactId).sort(byScene).map((job) => job.artifactId!) }
function byScene(a: LongFormJobLike, b: LongFormJobLike): number { return (a.sceneNumber ?? numberValue(safeJson(a.metadataJson).sceneNumber) ?? 0) - (b.sceneNumber ?? numberValue(safeJson(b.metadataJson).sceneNumber) ?? 0) }
function validSceneNumber(value: unknown): boolean { return typeof value === 'number' && Number.isInteger(value) && value > 0 }
function numberValue(value: unknown): number | null { return typeof value === 'number' && Number.isFinite(value) ? value : null }
function positiveNumber(value: unknown): number | null { return typeof value === 'number' && Number.isFinite(value) && value > 0 ? value : null }
function stringValue(value: unknown): string { return typeof value === 'string' ? value.trim() : '' }
function isRecord(value: unknown): value is Record<string, unknown> { return typeof value === 'object' && value !== null && !Array.isArray(value) }
function safeJson(value: unknown): Record<string, unknown> {
  if (isRecord(value)) return value
  if (typeof value !== 'string' || !value.trim()) return {}
  try { const parsed = JSON.parse(value); return isRecord(parsed) ? parsed : {} } catch { return {} }
}
function mimeSubtitleFormat(mimeType?: string): string | null {
  if (mimeType === 'application/x-subrip' || mimeType === 'text/srt') return 'srt'
  if (mimeType === 'text/vtt') return 'vtt'
  return null
}
