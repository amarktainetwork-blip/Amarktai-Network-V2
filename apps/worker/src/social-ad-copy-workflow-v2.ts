import type { Queue } from 'bullmq'
import {
  DEFAULT_JOB_OPTIONS,
  createQualityPolicy,
  rankQualityCandidates,
  validateDirectProviderRequest,
  type JobPayload,
  type QualityCandidateEvidence,
} from '@amarktai/core'
import { saveArtifact } from '@amarktai/artifacts'
import { prisma } from '@amarktai/db'
import {
  COPY_CANDIDATE_COUNT,
  SOCIAL_COPY_SCHEMA,
  copyContext,
  copyGrant,
  isCopyCandidate,
  parseCopyPackage,
  promptForCandidate,
  safeJson,
  scoreCopy,
  type SocialCopyPackage,
} from './social-ad-copy-quality.js'

export async function advanceSocialAdCopyWorkflow(parentJobId: string, queue: Queue): Promise<{
  phase: 'copy_jobs_queued' | 'social_copy_generation' | 'copy_quality_failed' | 'final_approval_pending'
  createdJobIds: string[]
  copyArtifactId?: string
}> {
  const parent = await prisma.job.findUnique({ where: { id: parentJobId } })
  if (!parent) throw new Error('Social-ad parent job was not found')
  const parentMetadata = safeJson(parent.metadataJson)
  if (parentMetadata.socialAdVideo !== true) throw new Error('Job is not a social-ad parent')
  const grant = copyGrant(parentMetadata, parent.appSlug)

  const children = await prisma.job.findMany({
    where: { appSlug: parent.appSlug, parentJobId: parent.id },
    orderBy: { createdAt: 'asc' },
  })
  const existingCopyJobs = children.filter((job) => isCopyCandidate(job.metadataJson))
  const createdJobIds: string[] = []

  for (let candidateIndex = 1; candidateIndex <= COPY_CANDIDATE_COUNT; candidateIndex++) {
    const existing = existingCopyJobs.find((job) => Number(safeJson(job.metadataJson).copyCandidateIndex) === candidateIndex)
    if (existing) continue

    const prompt = promptForCandidate(parentMetadata, candidateIndex)
    const requestedInput = {
      schema: SOCIAL_COPY_SCHEMA,
      context: JSON.stringify({
        executionId: parent.executionId,
        selectedCandidateArtifactId: parentMetadata.selectedCandidateArtifactId,
        deliveryVariants: parentMetadata.deliveryVariants ?? [],
      }),
    }
    const validation = validateDirectProviderRequest('structured_output', prompt, requestedInput)
    if (!validation.success) throw new Error(validation.error ?? 'Social-copy structured output request is invalid')

    const metadata = {
      socialAdVideo: true,
      socialAdCopyCandidate: true,
      copyCandidateIndex: candidateIndex,
      executionId: parent.executionId,
      parentJobId: parent.id,
      appGrantSnapshot: grant,
      appGrantSnapshotSource: parentMetadata.copyGrantSnapshotSource ?? 'parent_snapshot',
      appGrantSnapshotAt: parentMetadata.copyGrantSnapshotAt ?? new Date().toISOString(),
      routingMode: grant.routingMode ?? 'quality',
      executionProfile: 'external_app',
    }
    const job = await prisma.job.create({
      data: {
        appSlug: parent.appSlug,
        capability: 'structured_output',
        prompt,
        inputJson: JSON.stringify(validation.data ?? requestedInput),
        metadataJson: JSON.stringify(metadata),
        traceId: `${parent.traceId}_copy_${candidateIndex}`,
        status: 'queued',
        parentJobId: parent.id,
        executionId: parent.executionId,
        sceneNumber: candidateIndex,
        workflowPhase: 'copy_queued',
        queuedAt: new Date(),
      },
    })
    const payload: JobPayload = {
      jobId: job.id,
      appSlug: job.appSlug,
      capability: 'structured_output',
      executionProfile: 'external_app',
      prompt: job.prompt,
      input: safeJson(job.inputJson),
      metadata,
      traceId: job.traceId,
      routingMode: typeof metadata.routingMode === 'string' ? metadata.routingMode : 'quality',
      appGrantSnapshot: grant,
    }
    try {
      await queue.add('process', payload, { ...DEFAULT_JOB_OPTIONS, jobId: job.id })
      await prisma.job.update({ where: { id: job.id }, data: { queueJobId: job.id, queuedAt: new Date() } })
      createdJobIds.push(job.id)
    } catch (error) {
      const message = error instanceof Error ? error.message : 'Social-copy queue submission failed'
      await prisma.job.update({
        where: { id: job.id },
        data: { status: 'failed', error: message, completedAt: new Date(), workflowPhase: 'copy_queue_failed' },
      })
    }
  }

  const refreshedChildren = await prisma.job.findMany({
    where: { appSlug: parent.appSlug, parentJobId: parent.id },
    orderBy: [{ sceneNumber: 'asc' }, { createdAt: 'asc' }],
  })
  const copyJobs = refreshedChildren.filter((job) => isCopyCandidate(job.metadataJson))
  const terminal = copyJobs.filter((job) => ['completed', 'failed', 'cancelled'].includes(job.status))
  if (copyJobs.length !== COPY_CANDIDATE_COUNT || terminal.length !== copyJobs.length) {
    const phase = createdJobIds.length ? 'copy_jobs_queued' : 'social_copy_generation'
    await prisma.job.update({ where: { id: parent.id }, data: { workflowPhase: 'social_copy_generation', progress: 95, error: null } })
    return { phase, createdJobIds }
  }

  const parsedCandidates: Array<{ jobId: string; pkg: SocialCopyPackage; evidence: QualityCandidateEvidence }> = []
  const parsingFailures: Array<{ jobId: string; error: string }> = []
  for (const job of copyJobs.filter((item) => item.status === 'completed')) {
    try {
      const pkg = parseCopyPackage(job.output)
      parsedCandidates.push({ jobId: job.id, pkg, evidence: scoreCopy(job.id, pkg, parentMetadata) })
    } catch (error) {
      parsingFailures.push({ jobId: job.id, error: error instanceof Error ? error.message : 'Invalid copy output' })
    }
  }

  const policy = createQualityPolicy('publication', {
    policyId: 'quality:social-copy:publication:v1',
    requireHumanApproval: false,
    requireRightsVerification: true,
    maxWarnings: 2,
  })
  const ranked = rankQualityCandidates(parsedCandidates.map((candidate) => candidate.evidence), policy)
  const winner = ranked.find((entry) => entry.decision.status === 'accepted')
  if (!winner) {
    await prisma.job.update({
      where: { id: parent.id },
      data: {
        workflowPhase: 'copy_quality_failed',
        progress: 96,
        error: 'No social-copy candidate passed brand, factual and publication quality gates.',
        metadataJson: JSON.stringify({
          ...parentMetadata,
          currentPhase: 'copy_quality_failed',
          copyQualityRanking: ranked.map((entry) => ({ jobId: entry.candidate.candidateId, decision: entry.decision })),
          copyParsingFailures: parsingFailures,
        }),
      },
    })
    return { phase: 'copy_quality_failed', createdJobIds }
  }

  const selected = parsedCandidates.find((candidate) => candidate.jobId === winner.candidate.candidateId)
  if (!selected) throw new Error('Selected social-copy package is missing')
  const context = copyContext(parentMetadata)
  const copyDocument = {
    version: 'social-copy-v1',
    executionId: parent.executionId,
    parentJobId: parent.id,
    campaignId: context.plan.campaignId ?? null,
    selectedCopyJobId: selected.jobId,
    qualityScore: winner.decision.overallScore,
    package: selected.pkg,
    qualityRanking: ranked.map((entry) => ({ jobId: entry.candidate.candidateId, decision: entry.decision })),
    sourceBrandProfileId: context.brand.brandProfileId ?? null,
  }
  const artifact = await saveArtifact({
    input: {
      appSlug: parent.appSlug,
      type: 'document',
      subType: 'social_ad_copy_package',
      title: `${String(copyDocument.campaignId ?? 'Campaign')} social copy package`,
      description: 'Brand-constrained social copy selected by publication quality gates',
      provider: 'amarktai-network',
      model: 'social-copy-quality-selection-v1',
      traceId: parent.traceId,
      mimeType: 'application/json',
      metadata: {
        socialAdVideo: true,
        executionId: parent.executionId,
        parentJobId: parent.id,
        selectedCopyJobId: selected.jobId,
        qualityScore: winner.decision.overallScore,
        outputValidated: true,
      },
    },
    data: Buffer.from(JSON.stringify(copyDocument, null, 2), 'utf8'),
    explicitMimeType: 'application/json',
  })

  await prisma.job.update({
    where: { id: parent.id },
    data: {
      workflowPhase: 'final_approval_pending',
      progress: 98,
      error: null,
      metadataJson: JSON.stringify({
        ...parentMetadata,
        currentPhase: 'final_approval_pending',
        socialCopyStatus: 'quality_selected',
        copyArtifactId: artifact.id,
        selectedCopyJobId: selected.jobId,
        selectedCopyQualityScore: winner.decision.overallScore,
        copyQualityRanking: copyDocument.qualityRanking,
        finalApproval: { status: 'pending' },
      }),
    },
  })
  return { phase: 'final_approval_pending', createdJobIds, copyArtifactId: artifact.id }
}
