import type { Queue } from 'bullmq'
import {
  DEFAULT_JOB_OPTIONS,
  createQualityPolicy,
  rankQualityCandidates,
  type AppCapabilityGrantContext,
  type JobPayload,
  type QualityCandidateEvidence,
  type QualityDimensionScore,
  type QualityPolicy,
} from '@amarktai/core'
import { prisma } from '@amarktai/db'

interface CandidateAnalysisOutput {
  summary: string
  scores: {
    promptAdherence: number
    brandConsistency: number
    visualQuality: number
    composition: number
    temporalContinuity: number
    safety: number
  }
  issues: string[]
  frameObservations: string[]
  recommended?: boolean
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

function parseAnalysis(value: unknown): CandidateAnalysisOutput {
  const parsed = safeJson(value)
  const scores = parsed.scores
  if (!scores || typeof scores !== 'object' || Array.isArray(scores)) {
    throw new Error('Social-ad quality analysis is missing scores')
  }
  const scoreRecord = scores as Record<string, unknown>
  const bounded = (key: string): number => {
    const score = scoreRecord[key]
    if (typeof score !== 'number' || !Number.isFinite(score) || score < 0 || score > 100) {
      throw new Error(`Social-ad quality score is invalid: ${key}`)
    }
    return score
  }
  if (typeof parsed.summary !== 'string' || !parsed.summary.trim()) {
    throw new Error('Social-ad quality analysis summary is empty')
  }
  const issues = Array.isArray(parsed.issues) && parsed.issues.every((item) => typeof item === 'string')
    ? parsed.issues as string[]
    : []
  const frameObservations = Array.isArray(parsed.frameObservations) && parsed.frameObservations.every((item) => typeof item === 'string')
    ? parsed.frameObservations as string[]
    : []
  return {
    summary: parsed.summary,
    scores: {
      promptAdherence: bounded('promptAdherence'),
      brandConsistency: bounded('brandConsistency'),
      visualQuality: bounded('visualQuality'),
      composition: bounded('composition'),
      temporalContinuity: bounded('temporalContinuity'),
      safety: bounded('safety'),
    },
    issues,
    frameObservations,
    recommended: parsed.recommended === true,
  }
}

function qualityGrant(parentMetadata: Record<string, unknown>, appSlug: string): AppCapabilityGrantContext {
  const snapshot = parentMetadata.qualityGrantSnapshot
  if (!snapshot || typeof snapshot !== 'object' || Array.isArray(snapshot)) {
    throw new Error('Social-ad parent is missing immutable video_understanding grant authority')
  }
  const grant = snapshot as AppCapabilityGrantContext
  if (grant.appSlug !== appSlug || grant.capability !== 'video_understanding' || !grant.enabled || !grant.artifactRead) {
    throw new Error('Social-ad video_understanding grant authority is invalid')
  }
  return grant
}

function qualityPrompt(input: {
  parentPrompt: string
  candidatePrompt: string
  plan: Record<string, unknown>
  brandProfile: Record<string, unknown>
}): string {
  const planContext = safeJson(JSON.stringify(input.plan.creativeContext ?? {}))
  const brandName = typeof planContext.brandName === 'string' ? planContext.brandName : 'the approved brand'
  const objective = typeof planContext.objective === 'string' ? planContext.objective : input.parentPrompt
  const audience = typeof planContext.audience === 'string' ? planContext.audience : 'the intended audience'
  const callToAction = typeof planContext.callToAction === 'string' ? planContext.callToAction : ''
  const prohibitedClaims = Array.isArray(planContext.prohibitedClaims)
    ? planContext.prohibitedClaims.filter((item): item is string => typeof item === 'string')
    : []
  return [
    `Evaluate this social-ad candidate for ${brandName}.`,
    `Campaign objective: ${objective}. Audience: ${audience}.`,
    callToAction ? `Required call to action: ${callToAction}.` : '',
    `Candidate creative brief: ${input.candidatePrompt}`,
    prohibitedClaims.length ? `Flag any implication of prohibited claims: ${prohibitedClaims.join('; ')}.` : '',
    'Judge only visible evidence across the ordered timeline frames. Score prompt adherence, brand consistency, visual quality, composition, temporal continuity, and safety from 0 to 100.',
    'List concrete defects such as warped logos, anatomy errors, unreadable text, duplicated subjects, abrupt scene changes, low fidelity, or unsupported claims.',
    'Do not award quality merely because a file exists.',
  ].filter(Boolean).join(' ')
}

function isQualityJob(metadataJson: string): boolean {
  return safeJson(metadataJson).socialAdQualityAnalysis === true
}

function selectionPolicy(parentMetadata: Record<string, unknown>): QualityPolicy {
  const plan = parentMetadata.plan
  const planRecord = plan && typeof plan === 'object' && !Array.isArray(plan) ? plan as Record<string, unknown> : {}
  const original = planRecord.qualityPolicy
  const originalRecord = original && typeof original === 'object' && !Array.isArray(original)
    ? original as Record<string, unknown>
    : {}
  const profile = ['draft', 'standard', 'premium', 'publication'].includes(String(originalRecord.profile))
    ? originalRecord.profile as 'draft' | 'standard' | 'premium' | 'publication'
    : 'premium'
  return createQualityPolicy(profile, {
    ...originalRecord,
    policyId: `quality:social-ad:auto-selection:${profile}:v1`,
    requireHumanApproval: false,
  })
}

function evidenceFor(input: {
  generationJob: Awaited<ReturnType<typeof prisma.job.findUnique>>
  qualityJob: Awaited<ReturnType<typeof prisma.job.findUnique>>
  analysis: CandidateAnalysisOutput
  rightsVerified: boolean
}): QualityCandidateEvidence {
  const { generationJob, qualityJob, analysis, rightsVerified } = input
  if (!generationJob || !qualityJob || !generationJob.artifactId) {
    throw new Error('Social-ad candidate quality evidence is incomplete')
  }
  const dimensions: QualityDimensionScore[] = [
    { dimension: 'technical_validity', score: 100, weight: 2, required: true, blocking: true, evidence: [`artifact:${generationJob.artifactId}`], notes: [] },
    { dimension: 'prompt_adherence', score: analysis.scores.promptAdherence, weight: 2, required: true, blocking: true, evidence: [`quality-job:${qualityJob.id}`], notes: [] },
    { dimension: 'brand_consistency', score: analysis.scores.brandConsistency, weight: 2, required: true, blocking: true, evidence: [`quality-job:${qualityJob.id}`], notes: [] },
    { dimension: 'visual_quality', score: analysis.scores.visualQuality, weight: 2, required: true, blocking: true, evidence: [`quality-job:${qualityJob.id}`], notes: [] },
    { dimension: 'composition', score: analysis.scores.composition, weight: 1, required: false, blocking: false, evidence: [`quality-job:${qualityJob.id}`], notes: [] },
    { dimension: 'temporal_continuity', score: analysis.scores.temporalContinuity, weight: 2, required: false, blocking: false, evidence: [`quality-job:${qualityJob.id}`], notes: [] },
    { dimension: 'safety', score: analysis.scores.safety, weight: 2, required: true, blocking: true, evidence: [`quality-job:${qualityJob.id}`], notes: [] },
    { dimension: 'provenance', score: 100, weight: 1, required: true, blocking: true, evidence: [`generation-job:${generationJob.id}`, `quality-job:${qualityJob.id}`], notes: [] },
  ]
  return {
    candidateId: generationJob.id,
    capability: generationJob.capability as QualityCandidateEvidence['capability'],
    outputType: 'video',
    technicalValid: generationJob.status === 'completed' && Boolean(generationJob.artifactId),
    dimensions,
    criticalFailures: [],
    warnings: analysis.issues,
    costCredits: typeof generationJob.costCredits === 'number' ? generationJob.costCredits : null,
    latencyMs: null,
    provenanceComplete: true,
    rightsVerified,
    safetyPassed: analysis.scores.safety >= 85,
    humanReview: 'not_required',
  }
}

function brandRightsVerified(parentMetadata: Record<string, unknown>): boolean {
  const brand = parentMetadata.brandProfileSnapshot
  if (!brand || typeof brand !== 'object' || Array.isArray(brand)) return false
  const record = brand as Record<string, unknown>
  if (record.status !== 'verified' || typeof record.rightsDeclaredAt !== 'string') return false
  const visual = record.visual
  const assets = visual && typeof visual === 'object' && !Array.isArray(visual)
    ? (visual as Record<string, unknown>).assets
    : []
  return !Array.isArray(assets) || assets.every((asset) => {
    if (!asset || typeof asset !== 'object' || Array.isArray(asset)) return false
    const value = asset as Record<string, unknown>
    return value.approved === true && value.rightsVerified === true
  })
}

export interface SocialAdQualityAdvanceResult {
  phase: 'quality_jobs_queued' | 'quality_analysis' | 'quality_analysis_failed' | 'human_approval_pending'
  createdQualityJobIds: string[]
  winnerCandidateJobId?: string
  winnerArtifactId?: string
}

export async function advanceSocialAdQualityWorkflow(parentJobId: string, queue: Queue): Promise<SocialAdQualityAdvanceResult> {
  const parent = await prisma.job.findUnique({ where: { id: parentJobId } })
  if (!parent) throw new Error('Social-ad parent job was not found')
  const parentMetadata = safeJson(parent.metadataJson)
  if (parentMetadata.socialAdVideo !== true) throw new Error('Job is not a social-ad parent')
  const plan = parentMetadata.plan
  const planRecord = plan && typeof plan === 'object' && !Array.isArray(plan) ? plan as Record<string, unknown> : {}
  const grant = qualityGrant(parentMetadata, parent.appSlug)

  const allChildren = await prisma.job.findMany({
    where: { appSlug: parent.appSlug, parentJobId: parent.id },
    orderBy: [{ sceneNumber: 'asc' }, { createdAt: 'asc' }],
  })
  const generationJobs = allChildren.filter((job) => !isQualityJob(job.metadataJson))
  const completedGeneration = generationJobs.filter((job) => job.status === 'completed' && Boolean(job.artifactId))
  if (completedGeneration.length !== generationJobs.length || generationJobs.length === 0) {
    throw new Error('Social-ad quality analysis requires every generation candidate to have a durable artifact')
  }

  const existingQualityJobs = allChildren.filter((job) => isQualityJob(job.metadataJson))
  const existingByCandidate = new Map(existingQualityJobs.map((job) => [String(safeJson(job.metadataJson).candidateJobId ?? ''), job]))
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
          brandProfile: parentMetadata.brandProfileSnapshot as Record<string, unknown>,
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
      await prisma.job.update({ where: { id: qualityJob.id }, data: { queueJobId: qualityJob.id, queuedAt: new Date() } })
      createdQualityJobIds.push(qualityJob.id)
    } catch (error) {
      const message = error instanceof Error ? error.message : 'Quality queue submission failed'
      await prisma.job.update({
        where: { id: qualityJob.id },
        data: { status: 'failed', error: message, completedAt: new Date(), workflowPhase: 'quality_queue_failed' },
      })
    }
  }

  const qualityJobs = await prisma.job.findMany({
    where: { appSlug: parent.appSlug, parentJobId: parent.id, capability: 'video_understanding' },
    orderBy: [{ sceneNumber: 'asc' }, { createdAt: 'asc' }],
  })
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
        error: phase === 'quality_analysis_failed' ? 'One or more social-ad quality analyses failed.' : null,
      },
    })
    return { phase, createdQualityJobIds }
  }

  const rightsVerified = brandRightsVerified(parentMetadata)
  const evidence = completed.map((qualityJob) => {
    const metadata = safeJson(qualityJob.metadataJson)
    const generationJob = generationJobs.find((job) => job.id === metadata.candidateJobId)
    return evidenceFor({
      generationJob: generationJob ?? null,
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
          qualityRanking: ranked.map((entry) => ({ candidateJobId: entry.candidate.candidateId, decision: entry.decision })),
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
