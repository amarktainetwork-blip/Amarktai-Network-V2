import { prisma } from '@amarktai/db'

export interface SocialAdCandidateJobLike {
  id: string
  status: string
  artifactId?: string | null
  provider?: string | null
  model?: string | null
  sceneNumber?: number | null
  retryCount?: number
  error?: string | null
  costCredits?: number | null
}

export interface SocialAdCandidateState {
  total: number
  planned: number
  queued: number
  processing: number
  completed: number
  failed: number
  cancelled: number
  artifactIds: string[]
  completeWithArtifacts: boolean
  allTerminal: boolean
  allFailed: boolean
  retryableFailures: Array<{ jobId: string; candidateIndex: number | null; retryCount: number; error: string | null }>
  phase: 'candidate_generation' | 'candidate_quality_pending' | 'partial_candidate_failure' | 'candidate_generation_failed'
  progress: number
}

const TERMINAL_STATUSES = new Set(['completed', 'failed', 'cancelled'])

function count(jobs: readonly SocialAdCandidateJobLike[], status: string): number {
  return jobs.filter((job) => job.status === status).length
}

export function deriveSocialAdCandidateState(children: readonly SocialAdCandidateJobLike[]): SocialAdCandidateState {
  const total = children.length
  const planned = count(children, 'planned')
  const queued = count(children, 'queued')
  const processing = count(children, 'processing')
  const completed = count(children, 'completed')
  const failed = count(children, 'failed')
  const cancelled = count(children, 'cancelled')
  const artifactIds = children
    .filter((job) => job.status === 'completed' && Boolean(job.artifactId))
    .sort((left, right) => (left.sceneNumber ?? 0) - (right.sceneNumber ?? 0))
    .map((job) => job.artifactId!)
  const allTerminal = total > 0 && children.every((job) => TERMINAL_STATUSES.has(job.status))
  const completeWithArtifacts = total > 0 && completed === total && artifactIds.length === total
  const allFailed = total > 0 && failed + cancelled === total
  const retryableFailures = children
    .filter((job) => job.status === 'failed' && (job.retryCount ?? 0) < 3)
    .map((job) => ({
      jobId: job.id,
      candidateIndex: job.sceneNumber ?? null,
      retryCount: job.retryCount ?? 0,
      error: job.error ?? null,
    }))

  const phase: SocialAdCandidateState['phase'] = completeWithArtifacts
    ? 'candidate_quality_pending'
    : allFailed
      ? 'candidate_generation_failed'
      : allTerminal && failed + cancelled > 0
        ? 'partial_candidate_failure'
        : 'candidate_generation'

  const generationProgress = total > 0
    ? Math.round(((completed + failed + cancelled) / total) * 45)
    : 0
  const progress = phase === 'candidate_quality_pending'
    ? 55
    : phase === 'candidate_generation_failed'
      ? 45
      : Math.min(50, 5 + generationProgress)

  return {
    total,
    planned,
    queued,
    processing,
    completed,
    failed,
    cancelled,
    artifactIds,
    completeWithArtifacts,
    allTerminal,
    allFailed,
    retryableFailures,
    phase,
    progress,
  }
}

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

function isQualityChild(metadataJson: string): boolean {
  return safeJson(metadataJson).socialAdQualityAnalysis === true
}

export async function refreshSocialAdParentState(parentJobId: string): Promise<{
  parentId: string
  executionId: string
  state: SocialAdCandidateState
} | null> {
  const parent = await prisma.job.findUnique({ where: { id: parentJobId } })
  if (!parent || parent.capability !== 'social_content_generation') return null
  const metadata = safeJson(parent.metadataJson)
  if (metadata.socialAdVideo !== true) return null

  const allChildren = await prisma.job.findMany({
    where: { appSlug: parent.appSlug, parentJobId: parent.id },
    orderBy: [{ sceneNumber: 'asc' }, { createdAt: 'asc' }],
  })
  const generationChildren = allChildren.filter((child) => !isQualityChild(child.metadataJson))
  const qualityChildren = allChildren.filter((child) => isQualityChild(child.metadataJson))
  const state = deriveSocialAdCandidateState(generationChildren)
  const nextStatus = state.phase === 'candidate_generation_failed'
    ? 'failed'
    : parent.status === 'cancelled'
      ? 'cancelled'
      : 'processing'
  const childEvidence = generationChildren.map((child) => ({
    jobId: child.id,
    candidateIndex: child.sceneNumber,
    capability: child.capability,
    status: child.status,
    provider: child.provider,
    model: child.model,
    artifactId: child.artifactId,
    retryCount: child.retryCount,
    error: child.error,
  }))
  const qualityEvidence = qualityChildren.map((child) => ({
    jobId: child.id,
    candidateIndex: child.sceneNumber,
    status: child.status,
    provider: child.provider,
    model: child.model,
    error: child.error,
  }))
  const updatedMetadata = {
    ...metadata,
    currentPhase: state.phase,
    candidateState: state,
    candidateEvidence: childEvidence,
    qualityJobEvidence: qualityEvidence,
    completedCandidateArtifactIds: state.artifactIds,
    retryableCandidateFailures: state.retryableFailures,
    refreshedAt: new Date().toISOString(),
  }

  await prisma.job.update({
    where: { id: parent.id },
    data: {
      status: nextStatus,
      workflowPhase: state.phase,
      progress: state.progress,
      metadataJson: JSON.stringify(updatedMetadata),
      error: state.phase === 'candidate_generation_failed'
        ? 'Every social-ad candidate failed or was cancelled.'
        : state.phase === 'partial_candidate_failure'
          ? 'One or more social-ad candidates failed; retry or resolution is required.'
          : null,
      completedAt: state.phase === 'candidate_generation_failed'
        ? parent.completedAt ?? new Date()
        : parent.completedAt,
    },
  })

  return { parentId: parent.id, executionId: parent.executionId, state }
}
