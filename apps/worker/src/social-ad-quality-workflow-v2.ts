import type { Queue } from 'bullmq'
import {
  DEFAULT_JOB_OPTIONS,
  rankQualityCandidates,
  type JobPayload,
} from '@amarktai/core'
import { prisma } from '@amarktai/db'
import {
  brandRightsVerified,
  isQualityJob,
  parseAnalysis,
  qualityEvidence,
  qualityGrant,
  qualityPrompt,
  safeJson,
  selectionPolicy,
} from './social-ad-quality-evidence.js'

export interface SocialAdQualityAdvanceResult {
  phase: 'quality_jobs_queued' | 'quality_analysis' | 'quality_analysis_failed' | 'human_approval_pending'
  createdQualityJobIds: string[]
  winnerCandidateJobId?: string
  winnerArtifactId?: string
}

export async function advanceSocialAdQualityWorkflow(
  parentJobId: string,
  queue: Queue,
): Promise<SocialAdQualityAdvanceResult> {
  const parent = await prisma.job.findUnique({ where: { id: parentJobId } })
  if (!parent) throw new Error('Social-ad parent job was not found')
  const parentMetadata = safeJson(parent.metadataJson)
  if (parentMetadata.socialAdVideo !== true) throw new Error('Job is not a social-ad parent')
  const plan = parentMetadata.plan
  const planRecord = plan && typeof plan === 'object' && !Array.isArray(plan)
    ? plan as Record<string, unknown>
    : {}
  const grant = qualityGrant(parentMetadata, parent.appSlug)

  const allChildren = await prisma.job.findMany({
    where: { appSlug: parent.appSlug, parentJobId: parent.id },
    orderBy: [{ sceneNumber: 'asc' }, { createdAt: 'asc' }],
  })
  const generationJobs = allChildren.filter((job) => (
    !isQualityJob(job.metadataJson)
    && safeJson(job.metadataJson).socialAdCopyCandidate !== true
    && safeJson(job.metadataJson).socialAdAssembly !== true
  ))
  const completedGeneration = generationJobs.filter((job) => (
    job.status === 'completed' && Boolean(job.artifactId)
  ))
  if (completedGeneration.length !== generationJobs.length || generationJobs.length === 0) {
    throw new Error('Social-ad quality analysis requires every generation candidate to have a durable artifact')
  }

  const existingQualityJobs = allChildren.filter((job) => isQualityJob(job.metadataJson))
  const existingByCandidate = new Map(existingQualityJobs.map((job) => [
    String(safeJson(job.metadataJson).candidateJobId ?? ''),
    job,
  ]))
  const createdQualityJobIds: string[] = []

  for (const candidate of completedGeneration) {
    if (existingByCandidate.has(candidate.id)) continue
    const candidateMetadata = safeJson(candidate.metadataJson)
    const qualityJob = await prisma.job.create({
      data: {
        appSlug: parent.appSlug,
        capability: 'video_understanding',
        prompt: qualityPrompt({
          parentPrompt: parent.prompt,
          candidatePrompt: candidate.prompt,
          plan: planRecord,
        }),
        inputJson: JSON.stringify({ videoArtifactId: candidate.artifactId, sampleCount: 6 }),
        metadataJson: JSON.stringify({
          socialAdVideo: true,
          socialAdQualityAnalysis: true,
          executionId: parent.executionId,
          parentJobId: parent.id,
          candidateJobId: candidate.id,
          candidateId: candidateMetadata.candidateId ?? candidate.id,
          candidateIndex: candidate.sceneNumber,
          sourceArtifactId: candidate.artifactId,
          qualityPolicy: planRecord.qualityPolicy ?? {},
          appGrantSnapshot: grant,
          appGrantSnapshotSource: parentMetadata.qualityGrantSnapshotSource ?? 'persisted_parent_snapshot',
          appGrantSnapshotAt: parentMetadata.qualityGrantSnapshotAt ?? new Date().toISOString(),
          routingMode: grant.routingMode ?? 'quality',
          executionProfile: 'external_app',
        }),
        traceId: `${parent.traceId}_quality_${candidate.sceneNumber ?? candidate.id}`,
        status: 'queued',
        parentJobId: parent.id,
        executionId: parent.executionId,
        sceneNumber: candidate.sceneNumber,
        workflowPhase: 'quality_queued',
        queuedAt: new Date(),
      },
    })
    const metadata = safeJson(qualityJob.metadataJson)
    const payload: JobPayload = {
      jobId: qualityJob.id,
      appSlug: qualityJob.appSlug,
      capability: 'video_understanding',
      executionProfile: 'external_app',
      prompt: qualityJob.prompt,
      input: safeJson(qualityJob.inputJson),
      metadata,
      traceId: qualityJob.traceId,
      routingMode: typeof metadata.routingMode === 'string' ? metadata.routingMode : 'quality',
      appGrantSnapshot: grant,
    }
    try {
      await queue.add('process', payload, { ...DEFAULT_JOB_OPTIONS, jobId: qualityJob.id })
      await prisma.job.update({
        where: { id: qualityJob.id },
        data: { queueJobId: qualityJob.id, queuedAt: new Date() },
      })
      createdQualityJobIds.push(qualityJob.id)
    } catch (error) {
      const message = error instanceof Error ? error.message : 'Quality queue submission failed'
      await prisma.job.update({
        where: { id: qualityJob.id },
        data: {
          status: 'failed',
          error: message,
          completedAt: new Date(),
          workflowPhase: 'quality_queue_failed',
        },
      })
    }
  }

  const refreshedChildren = await prisma.job.findMany({
    where: { appSlug: parent.appSlug, parentJobId: parent.id },
    orderBy: [{ sceneNumber: 'asc' }, { createdAt: 'asc' }],
  })
  const qualityJobs = refreshedChildren.filter((job) => isQualityJob(job.metadataJson))
  const failed = qualityJobs.filter((job) => job.status === 'failed')
  const completed = qualityJobs.filter((job) => job.status === 'completed')
  const qualityComplete = qualityJobs.length === generationJobs.length && completed.length === qualityJobs.length

  if (!qualityComplete) {
    const phase = failed.length > 0 && failed.length + completed.length === qualityJobs.length
      ? 'quality_analysis_failed'
      : createdQualityJobIds.length > 0
        ? 'quality_jobs_queued'
        : 'quality_analysis'
    await prisma.job.update({
      where: { id: parent.id },
      data: {
        workflowPhase: phase,
        progress: phase === 'quality_analysis_failed' ? 65 : 60,
        error: phase === 'quality_analysis_failed'
          ? 'One or more social-ad quality analyses failed.'
          : null,
      },
    })
    return { phase, createdQualityJobIds }
  }

  const rightsVerified = brandRightsVerified(parentMetadata)
  const evidence = completed.map((qualityJob) => {
    const metadata = safeJson(qualityJob.metadataJson)
    const generationJob = generationJobs.find((job) => job.id === metadata.candidateJobId) ?? null
    return qualityEvidence({
      generationJob,
      qualityJob,
      analysis: parseAnalysis(qualityJob.output),
      rightsVerified,
    })
  })
  const ranked = rankQualityCandidates(evidence, selectionPolicy(parentMetadata))
  const winner = ranked.find((entry) => entry.decision.status === 'accepted')
  if (!winner) {
    await prisma.job.update({
      where: { id: parent.id },
      data: {
        workflowPhase: 'quality_analysis_failed',
        progress: 70,
        error: 'No social-ad candidate passed the automated quality policy.',
        metadataJson: JSON.stringify({
          ...parentMetadata,
          currentPhase: 'quality_analysis_failed',
          qualityRanking: ranked.map((entry) => ({
            candidateJobId: entry.candidate.candidateId,
            decision: entry.decision,
          })),
          qualityCompletedAt: new Date().toISOString(),
        }),
      },
    })
    return { phase: 'quality_analysis_failed', createdQualityJobIds }
  }

  const generationWinner = generationJobs.find((job) => job.id === winner.candidate.candidateId)
  if (!generationWinner?.artifactId) throw new Error('Quality winner is missing its durable artifact')
  const metadata = {
    ...parentMetadata,
    currentPhase: 'human_approval_pending',
    qualityRanking: ranked.map((entry) => ({
      candidateJobId: entry.candidate.candidateId,
      artifactId: generationJobs.find((job) => job.id === entry.candidate.candidateId)?.artifactId ?? null,
      decision: entry.decision,
    })),
    selectedCandidateJobId: generationWinner.id,
    selectedCandidateArtifactId: generationWinner.artifactId,
    selectedQualityScore: winner.decision.overallScore,
    selectedAt: new Date().toISOString(),
    humanApproval: { status: 'pending' },
  }
  await prisma.job.update({
    where: { id: parent.id },
    data: {
      workflowPhase: 'human_approval_pending',
      progress: 80,
      error: null,
      metadataJson: JSON.stringify(metadata),
    },
  })
  return {
    phase: 'human_approval_pending',
    createdQualityJobIds,
    winnerCandidateJobId: generationWinner.id,
    winnerArtifactId: generationWinner.artifactId,
  }
}
