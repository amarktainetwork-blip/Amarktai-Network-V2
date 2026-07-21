import type { Queue } from 'bullmq'
import {
  DEFAULT_JOB_OPTIONS,
  createQualityPolicy,
  rankQualityCandidates,
  validateDirectProviderRequest,
  type AppCapabilityGrantContext,
  type JobPayload,
  type QualityCandidateEvidence,
  type QualityDimensionScore,
} from '@amarktai/core'
import { saveArtifact } from '@amarktai/artifacts'
import { prisma } from '@amarktai/db'

const COPY_CANDIDATE_COUNT = 3

const SOCIAL_COPY_SCHEMA: Record<string, unknown> = {
  type: 'object',
  additionalProperties: false,
  required: [
    'headline',
    'primaryText',
    'shortCaption',
    'longCaption',
    'callToAction',
    'hashtags',
    'claimsUsed',
    'channelVariants',
  ],
  properties: {
    headline: { type: 'string', minLength: 5, maxLength: 120 },
    primaryText: { type: 'string', minLength: 20, maxLength: 2200 },
    shortCaption: { type: 'string', minLength: 5, maxLength: 280 },
    longCaption: { type: 'string', minLength: 20, maxLength: 2200 },
    callToAction: { type: 'string', minLength: 1, maxLength: 200 },
    hashtags: { type: 'array', maxItems: 30, items: { type: 'string', minLength: 2, maxLength: 80 } },
    claimsUsed: { type: 'array', maxItems: 50, items: { type: 'string', minLength: 1, maxLength: 1000 } },
    channelVariants: {
      type: 'object',
      additionalProperties: { type: 'string', minLength: 5, maxLength: 2200 },
    },
  },
}

interface SocialCopyPackage {
  headline: string
  primaryText: string
  shortCaption: string
  longCaption: string
  callToAction: string
  hashtags: string[]
  claimsUsed: string[]
  channelVariants: Record<string, string>
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

function objectValue(value: unknown): Record<string, unknown> {
  return typeof value === 'object' && value !== null && !Array.isArray(value)
    ? value as Record<string, unknown>
    : {}
}

function stringArray(value: unknown): string[] {
  return Array.isArray(value)
    ? value.filter((item): item is string => typeof item === 'string').map((item) => item.trim()).filter(Boolean)
    : []
}

function parseCopyPackage(output: string): SocialCopyPackage {
  const parsed = safeJson(output)
  const text = (key: string, min: number, max: number): string => {
    const value = parsed[key]
    if (typeof value !== 'string' || value.trim().length < min || value.trim().length > max) {
      throw new Error(`Social copy field is invalid: ${key}`)
    }
    return value.trim()
  }
  const variants = objectValue(parsed.channelVariants)
  const channelVariants = Object.fromEntries(
    Object.entries(variants)
      .filter((entry): entry is [string, string] => typeof entry[1] === 'string' && entry[1].trim().length >= 5)
      .map(([key, value]) => [key, value.trim()]),
  )
  return {
    headline: text('headline', 5, 120),
    primaryText: text('primaryText', 20, 2200),
    shortCaption: text('shortCaption', 5, 280),
    longCaption: text('longCaption', 20, 2200),
    callToAction: text('callToAction', 1, 200),
    hashtags: stringArray(parsed.hashtags).slice(0, 30),
    claimsUsed: stringArray(parsed.claimsUsed).slice(0, 50),
    channelVariants,
  }
}

function normalized(value: string): string {
  return value.toLocaleLowerCase('en').replace(/\s+/g, ' ').trim()
}

function containsPhrase(text: string, phrase: string): boolean {
  return normalized(text).includes(normalized(phrase))
}

function copyContext(parentMetadata: Record<string, unknown>) {
  const plan = objectValue(parentMetadata.plan)
  const creative = objectValue(plan.creativeContext)
  const brand = objectValue(parentMetadata.brandProfileSnapshot)
  const voice = objectValue(brand.voice)
  const approvedClaims = stringArray(creative.approvedClaims)
  const prohibitedClaims = stringArray(creative.prohibitedClaims)
  const disclaimers = stringArray(creative.requiredDisclaimers)
  const channels = stringArray(creative.channels)
  const tones = stringArray(voice.tones)
  const styleRules = stringArray(voice.styleRules)
  const approvedPhrases = stringArray(voice.approvedPhrases)
  const forbiddenPhrases = stringArray(voice.forbiddenPhrases)
  return {
    plan,
    brand,
    brandName: typeof creative.brandName === 'string' ? creative.brandName : String(brand.displayName ?? 'Approved brand'),
    objective: typeof creative.objective === 'string' ? creative.objective : '',
    audience: typeof creative.audience === 'string' ? creative.audience : '',
    offering: typeof creative.offering === 'string' ? creative.offering : '',
    callToAction: typeof creative.callToAction === 'string' ? creative.callToAction : '',
    approvedClaims,
    prohibitedClaims,
    disclaimers,
    channels,
    tones,
    styleRules,
    approvedPhrases,
    forbiddenPhrases,
  }
}

function promptForCandidate(parentMetadata: Record<string, unknown>, candidateIndex: number): string {
  const context = copyContext(parentMetadata)
  const variation = [
    'Lead with a sharp audience problem and a clear transformation.',
    'Lead with the strongest approved benefit and a credible proof-oriented tone.',
    'Lead with a concise pattern interrupt, then explain the offer plainly.',
  ][candidateIndex - 1] ?? 'Create a distinct high-quality variation.'
  return [
    `Create social copy candidate ${candidateIndex} for ${context.brandName}.`,
    `Objective: ${context.objective}. Audience: ${context.audience}. Offering: ${context.offering || 'use the approved campaign context'}.`,
    `Required call to action: ${context.callToAction}.`,
    `Channels requiring variants: ${context.channels.join(', ')}.`,
    `Tone: ${context.tones.join(', ')}. Style rules: ${context.styleRules.join('; ')}.`,
    `Approved claims (the only factual marketing claims allowed): ${context.approvedClaims.join('; ') || 'none supplied; make no factual performance claims'}.`,
    `Required disclaimers: ${context.disclaimers.join('; ') || 'none'}.`,
    `Forbidden phrases and prohibited claims: ${[...context.forbiddenPhrases, ...context.prohibitedClaims].join('; ') || 'none supplied'}.`,
    `Approved phrases you may use naturally: ${context.approvedPhrases.join('; ') || 'none supplied'}.`,
    variation,
    'Return JSON only. claimsUsed must list every factual marketing claim exactly as it appears in the approved-claims list. Do not create statistics, guarantees, testimonials, prices, deadlines or outcomes that are not supplied. Include every required disclaimer in primaryText or longCaption and in relevant channel variants.',
  ].join(' ')
}

function qualityGrant(parentMetadata: Record<string, unknown>, appSlug: string): AppCapabilityGrantContext {
  const snapshot = parentMetadata.copyGrantSnapshot
  if (!snapshot || typeof snapshot !== 'object' || Array.isArray(snapshot)) {
    throw new Error('Social-ad parent is missing immutable structured_output grant authority')
  }
  const grant = snapshot as AppCapabilityGrantContext
  if (grant.appSlug !== appSlug || grant.capability !== 'structured_output' || !grant.enabled) {
    throw new Error('Social-ad structured_output grant authority is invalid')
  }
  return grant
}

function isCopyCandidate(metadataJson: string): boolean {
  return safeJson(metadataJson).socialAdCopyCandidate === true
}

function combinedCopy(pkg: SocialCopyPackage): string {
  return [
    pkg.headline,
    pkg.primaryText,
    pkg.shortCaption,
    pkg.longCaption,
    pkg.callToAction,
    ...pkg.hashtags,
    ...Object.values(pkg.channelVariants),
  ].join('\n')
}

function scoreCopy(input: {
  jobId: string
  pkg: SocialCopyPackage
  parentMetadata: Record<string, unknown>
  costCredits: number | null
}): { evidence: QualityCandidateEvidence; failures: string[] } {
  const context = copyContext(input.parentMetadata)
  const fullText = combinedCopy(input.pkg)
  const failures: string[] = []
  const warnings: string[] = []
  const approvedNormalized = new Set(context.approvedClaims.map(normalized))
  const unapprovedClaims = input.pkg.claimsUsed.filter((claim) => !approvedNormalized.has(normalized(claim)))
  if (unapprovedClaims.length) failures.push(`unapproved_claims:${unapprovedClaims.join('|')}`)
  const prohibitedMatches = [...context.prohibitedClaims, ...context.forbiddenPhrases]
    .filter((phrase) => containsPhrase(fullText, phrase))
  if (prohibitedMatches.length) failures.push(`prohibited_copy:${prohibitedMatches.join('|')}`)
  const missingDisclaimers = context.disclaimers.filter((disclaimer) => !containsPhrase(fullText, disclaimer))
  if (missingDisclaimers.length) failures.push(`missing_disclaimers:${missingDisclaimers.join('|')}`)
  const missingChannels = context.channels.filter((channel) => !input.pkg.channelVariants[channel]?.trim())
  if (missingChannels.length) failures.push(`missing_channel_variants:${missingChannels.join('|')}`)
  const ctaExact = normalized(input.pkg.callToAction) === normalized(context.callToAction)
  if (!ctaExact) failures.push('call_to_action_changed')
  if (input.pkg.hashtags.length > 15) warnings.push('excessive_hashtags')
  if (/\b[A-Z]{8,}\b/.test(fullText)) warnings.push('excessive_all_caps')

  const channelCoverage = context.channels.length === 0
    ? 100
    : Math.round(((context.channels.length - missingChannels.length) / context.channels.length) * 100)
  const claimScore = failures.some((failure) => failure.startsWith('unapproved_claims') || failure.startsWith('prohibited_copy')) ? 0 : 100
  const disclaimerScore = missingDisclaimers.length ? 0 : 100
  const accessibilityScore = Math.max(0, 100 - warnings.length * 15)
  const promptScore = Math.round((channelCoverage + (ctaExact ? 100 : 0)) / 2)
  const brandScore = failures.some((failure) => failure.startsWith('prohibited_copy')) ? 0 : 95
  const dimensions: QualityDimensionScore[] = [
    { dimension: 'technical_validity', score: 100, weight: 2, required: true, blocking: true, evidence: [`copy-job:${input.jobId}`], notes: [] },
    { dimension: 'prompt_adherence', score: promptScore, weight: 2, required: true, blocking: true, evidence: [`copy-job:${input.jobId}`], notes: [] },
    { dimension: 'brand_consistency', score: brandScore, weight: 2, required: true, blocking: true, evidence: [`copy-job:${input.jobId}`], notes: [] },
    { dimension: 'factual_accuracy', score: Math.min(claimScore, disclaimerScore), weight: 3, required: true, blocking: true, evidence: context.approvedClaims.map((claim) => `approved-claim:${claim}`), notes: [] },
    { dimension: 'accessibility', score: accessibilityScore, weight: 1, required: true, blocking: false, evidence: [`copy-job:${input.jobId}`], notes: warnings },
    { dimension: 'safety', score: prohibitedMatches.length ? 0 : 100, weight: 2, required: true, blocking: true, evidence: [`copy-job:${input.jobId}`], notes: [] },
    { dimension: 'provenance', score: 100, weight: 1, required: true, blocking: true, evidence: [`copy-job:${input.jobId}`, `brand-profile:${String(context.brand.brandProfileId ?? '')}`], notes: [] },
  ]
  return {
    failures,
    evidence: {
      candidateId: input.jobId,
      capability: 'structured_output',
      outputType: 'json',
      technicalValid: failures.length === 0,
      dimensions,
      criticalFailures: failures,
      warnings,
      costCredits: input.costCredits,
      latencyMs: null,
      provenanceComplete: true,
      rightsVerified: true,
      safetyPassed: prohibitedMatches.length === 0,
      humanReview: 'not_required',
    },
  }
}

export async function advanceSocialAdCopyWorkflow(parentJobId: string, queue: Queue): Promise<{
  phase: 'copy_jobs_queued' | 'social_copy_generation' | 'copy_quality_failed' | 'final_approval_pending'
  createdJobIds: string[]
  copyArtifactId?: string
}> {
  const parent = await prisma.job.findUnique({ where: { id: parentJobId } })
  if (!parent) throw new Error('Social-ad parent job was not found')
  const parentMetadata = safeJson(parent.metadataJson)
  if (parentMetadata.socialAdVideo !== true) throw new Error('Job is not a social-ad parent')
  const grant = qualityGrant(parentMetadata, parent.appSlug)

  const children = await prisma.job.findMany({
    where: { appSlug: parent.appSlug, parentJobId: parent.id },
    orderBy: { createdAt: 'asc' },
  })
  const existingCopyJobs = children.filter((job) => isCopyCandidate(job.metadataJson))
  const createdJobIds: string[] = []
  for (let candidateIndex = 1; candidateIndex <= COPY_CANDIDATE_COUNT; candidateIndex++) {
    const existing = existingCopyJobs.find((job) => Number(safeJson(job.metadataJson).copyCandidateIndex) === candidateIndex)
    if (existing) continue
    const input = {
      schema: SOCIAL_COPY_SCHEMA,
      context: JSON.stringify({
        executionId: parent.executionId,
        selectedCandidateArtifactId: parentMetadata.selectedCandidateArtifactId,
        deliveryVariants: parentMetadata.deliveryVariants ?? [],
      }),
    }
    const validation = validateDirectProviderRequest('structured_output', promptForCandidate(parentMetadata, candidateIndex), input)
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
        prompt: promptForCandidate(parentMetadata, candidateIndex),
        inputJson: JSON.stringify(validation.data ?? input),
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

  const copyJobs = await prisma.job.findMany({
    where: { appSlug: parent.appSlug, parentJobId: parent.id, capability: 'structured_output' },
    orderBy: [{ sceneNumber: 'asc' }, { createdAt: 'asc' }],
  })
  const terminal = copyJobs.filter((job) => ['completed', 'failed', 'cancelled'].includes(job.status))
  if (copyJobs.length !== COPY_CANDIDATE_COUNT || terminal.length !== copyJobs.length) {
    const phase = createdJobIds.length ? 'copy_jobs_queued' : 'social_copy_generation'
    await prisma.job.update({
      where: { id: parent.id },
      data: { workflowPhase: 'social_copy_generation', progress: 95, error: null },
    })
    return { phase, createdJobIds }
  }

  const parsedCandidates: Array<{ jobId: string; pkg: SocialCopyPackage; evidence: QualityCandidateEvidence }> = []
  const parsingFailures: Array<{ jobId: string; error: string }> = []
  for (const job of copyJobs.filter((item) => item.status === 'completed')) {
    try {
      const pkg = parseCopyPackage(job.output)
      const scored = scoreCopy({
        jobId: job.id,
        pkg,
        parentMetadata,
        costCredits: typeof job.costCredits === 'number' ? job.costCredits : null,
      })
      parsedCandidates.push({ jobId: job.id, pkg, evidence: scored.evidence })
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
  const copyDocument = {
    version: 'social-copy-v1',
    executionId: parent.executionId,
    parentJobId: parent.id,
    campaignId: objectValue(parentMetadata.plan).campaignId ?? null,
    selectedCopyJobId: selected.jobId,
    qualityScore: winner.decision.overallScore,
    package: selected.pkg,
    qualityRanking: ranked.map((entry) => ({ jobId: entry.candidate.candidateId, decision: entry.decision })),
    sourceBrandProfileId: objectValue(parentMetadata.brandProfileSnapshot).brandProfileId ?? null,
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
  return {
    phase: 'final_approval_pending',
    createdJobIds,
    copyArtifactId: artifact.id,
  }
}
