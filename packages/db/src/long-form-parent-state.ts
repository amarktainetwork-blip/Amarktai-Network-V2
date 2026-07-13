import { prisma } from './client.js'

type JobRow = NonNullable<Awaited<ReturnType<typeof prisma.job.findUnique>>>

function safeJson(value: unknown): Record<string, unknown> {
  if (typeof value === 'object' && value !== null && !Array.isArray(value)) return value as Record<string, unknown>
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

function readStringArray(value: unknown): string[] {
  return Array.isArray(value) ? value.filter((item): item is string => typeof item === 'string') : []
}

function buildAssemblyHandoff(parent: JobRow, sceneJobs: JobRow[], metadata: Record<string, unknown>) {
  const request = safeJson(metadata.request)
  const plan = safeJson(metadata.plan)
  const scenes = safeJson(plan.storyboard).scenes
  const expectedSceneCount = Array.isArray(scenes) ? scenes.length : sceneJobs.length
  const orderedSceneArtifactIds = sceneJobs
    .filter((job) => job.status === 'completed' && !!job.artifactId)
    .sort((a, b) => (a.sceneNumber ?? 0) - (b.sceneNumber ?? 0))
    .map((job) => job.artifactId as string)

  const requestedVoiceover = request.voiceoverEnabled === true
  const requestedSubtitles = request.subtitlesEnabled === true
  const requestedMusic = request.musicBedEnabled === true
  const missingDependencies = [
    ...(orderedSceneArtifactIds.length === expectedSceneCount ? [] : ['scene_artifacts_pending']),
    ...(requestedVoiceover ? ['voiceover_not_live_proven'] : []),
    ...(requestedSubtitles ? ['subtitles_not_live_proven'] : []),
    ...(requestedMusic ? ['music_bed_not_live_proven'] : []),
    'full_multimedia_not_ready',
  ]

  return {
    parentJobId: parent.id,
    executionId: parent.executionId,
    orderedSceneArtifactIds,
    expectedSceneCount,
    expectedDurationSeconds: typeof request.targetDurationSeconds === 'number' ? request.targetDurationSeconds : null,
    aspectRatio: typeof request.aspectRatio === 'string' ? request.aspectRatio : null,
    outputTitle: `Long-form video ${parent.executionId}`,
    requestedVoiceover,
    requestedSubtitles,
    requestedMusic,
    assemblyStatus: orderedSceneArtifactIds.length === expectedSceneCount ? 'ready_for_video_only' : 'waiting_for_scenes',
    missingDependencies,
  }
}

export async function refreshLongFormParentState(parentJobId: string): Promise<{
  parent: JobRow
  sceneJobs: JobRow[]
  metadata: Record<string, unknown>
} | null> {
  const parent = await prisma.job.findUnique({ where: { id: parentJobId } })
  if (!parent || parent.capability !== 'long_form_video') return null

  const sceneJobs = await prisma.job.findMany({
    where: { appSlug: parent.appSlug, parentJobId: parent.id },
    orderBy: { sceneNumber: 'asc' },
  })
  const metadata = safeJson(parent.metadataJson)
  const plan = safeJson(metadata.plan)
  const scenes = safeJson(plan.storyboard).scenes
  const totalScenes = sceneJobs.length || (Array.isArray(scenes) ? scenes.length : 0)
  const queuedSceneCount = sceneJobs.filter((job) => job.status === 'queued').length
  const plannedSceneCount = sceneJobs.filter((job) => job.status === 'planned').length
  const processingSceneCount = sceneJobs.filter((job) => job.status === 'processing').length
  const completedSceneCount = sceneJobs.filter((job) => job.status === 'completed').length
  const failedSceneCount = sceneJobs.filter((job) => job.status === 'failed').length
  const cancellingSceneCount = sceneJobs.filter((job) => job.status === 'cancelling').length
  const cancelledSceneCount = sceneJobs.filter((job) => job.status === 'cancelled').length
  const progress = totalScenes > 0 ? Math.round((completedSceneCount / totalScenes) * 100) : 0
  const retryableFailures = sceneJobs
    .filter((job) => job.status === 'failed' && job.retryCount < 3)
    .map((job) => ({ jobId: job.id, sceneNumber: job.sceneNumber, retryCount: job.retryCount, error: job.error }))
  const completedArtifactIds = sceneJobs
    .filter((job) => job.status === 'completed' && job.artifactId)
    .sort((a, b) => (a.sceneNumber ?? 0) - (b.sceneNumber ?? 0))
    .map((job) => job.artifactId as string)
  const parentIsCancelled = parent.status === 'cancelled'
  const parentIsCancelling = parent.status === 'cancelling'
  const finalAssemblyReady = !parentIsCancelled && !parentIsCancelling && totalScenes > 0 && completedSceneCount === totalScenes && failedSceneCount === 0 && cancelledSceneCount === 0 && cancellingSceneCount === 0
  const partialFailure = failedSceneCount > 0 && completedSceneCount < totalScenes
  const blockedReasons = [
    ...(failedSceneCount > 0 ? ['scene_failure'] : []),
    ...(cancellingSceneCount > 0 || cancelledSceneCount > 0 ? ['cancellation_requested'] : []),
    ...readStringArray(metadata.blockedReasons).filter((reason) => ![
      'scene_failure',
      'cancellation_requested',
      'voiceover_not_implemented',
      'subtitles_not_implemented',
      'music_bed_not_implemented',
      'full_multimedia_not_ready',
    ].includes(reason)),
    'voiceover_not_implemented',
    'subtitles_not_implemented',
    'music_bed_not_implemented',
    'full_multimedia_not_ready',
  ]
  const assemblyHandoff = buildAssemblyHandoff(parent, sceneJobs, metadata)
  const currentPhase = parent.status === 'cancelled'
    ? 'cancelled'
    : parent.status === 'cancelling' || cancellingSceneCount > 0
      ? 'cancellation_requested'
      : finalAssemblyReady
        ? 'assembly_handoff_ready'
        : partialFailure
          ? 'partial_failure'
          : plannedSceneCount === totalScenes && totalScenes > 0
            ? 'planned'
            : 'scene_execution'
  const nextStatus = parent.status === 'completed' || parent.status === 'cancelled'
    ? parent.status
    : parent.status === 'cancelling'
      ? (cancellingSceneCount > 0 ? 'cancelling' : 'cancelled')
      : plannedSceneCount === totalScenes && totalScenes > 0
        ? 'planned'
        : partialFailure
          ? 'processing'
          : finalAssemblyReady
            ? 'processing'
            : parent.status
  const completedAt = parentIsCancelled && !parent.completedAt ? new Date() : parent.completedAt

  const nextMetadata = {
    ...metadata,
    plannedSceneCount: totalScenes,
    queuedSceneCount,
    processingSceneCount,
    completedSceneCount,
    failedSceneCount,
    cancellingSceneCount,
    cancelledSceneCount,
    progress,
    partialFailure,
    retryableFailures,
    completedArtifactIds,
    finalAssemblyReady,
    currentPhase,
    blockedReasons,
    assemblyHandoff: parentIsCancelled
      ? { ...assemblyHandoff, assemblyStatus: 'cancelled' }
      : assemblyHandoff,
    refreshedAt: new Date().toISOString(),
  }

  const updatedParent = await prisma.job.update({
    where: { id: parent.id },
    data: {
      status: nextStatus,
      progress,
      workflowPhase: currentPhase,
      metadataJson: JSON.stringify(nextMetadata),
      completedAt,
      error: partialFailure ? `Long-form scene failures: ${failedSceneCount}` : parent.error,
    },
  })

  return { parent: updatedParent, sceneJobs, metadata: nextMetadata }
}
