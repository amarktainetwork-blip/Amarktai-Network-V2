import type { FastifyInstance } from 'fastify'
import { createHash, randomUUID } from 'node:crypto'
import { Queue } from 'bullmq'
import { prisma } from '@amarktai/db'
import {
  DEFAULT_JOB_OPTIONS,
  QUEUE_NAMES,
  validateDirectProviderRequest,
  type AppCapabilityGrantContext,
  type CapabilityKey,
  type JobPayload,
} from '@amarktai/core'
import {
  MarketingCampaignBriefSchema,
  SocialAdVideoRequestSchema,
} from '@amarktai/core/marketing-platform'
import {
  buildSocialAdVideoPlan,
  type SocialAdVideoPlan,
} from '@amarktai/core/social-ad-video'
import { getBrandProfile } from '../lib/brand-profile-store.js'
import { resolveAppCapabilityGrantSnapshot } from '../lib/app-grant-loader.js'
import { authenticateAppKey } from './jobs.js'

type PlanResolution =
  | {
      ok: true
      plan: SocialAdVideoPlan
      request: Record<string, unknown>
      campaign: Record<string, unknown>
      brandProfile: Record<string, unknown>
    }
  | { ok: false; statusCode: number; body: Record<string, unknown> }

type ChildJob = Awaited<ReturnType<typeof prisma.job.findMany>>[number]

export interface SocialAdRouteAuth {
  ok: boolean
  statusCode: number
  error?: string
  app?: { slug: string }
  allowedCapabilities?: string[]
}

export type SocialAdRouteAuthResolver = (authorization: string | undefined, request: unknown) => Promise<SocialAdRouteAuth>

const SOCIAL_AD_ENVELOPE_FIELDS = new Set(['request', 'campaign', 'idempotencyKey'])

function forbiddenEnvelopeField(body: Record<string, unknown>): string | null {
  const forbidden = ['provider', 'model', 'route', 'executorId', 'endpoint', 'apiKey']
  for (const key of Object.keys(body)) {
    if (forbidden.includes(key)) return key
    if (!SOCIAL_AD_ENVELOPE_FIELDS.has(key)) return key
  }
  return null
}

async function validatePlanArtifacts(appSlug: string, plan: SocialAdVideoPlan): Promise<void> {
  const contract = plan.creativeContract
  if (!contract) return
  const product = await prisma.artifact.findUnique({ where: { id: contract.productSourceArtifactId } })
  if (!product) throw new Error('SOCIAL_AD_PRODUCT_ASSET_NOT_FOUND')
  if (product.appSlug !== appSlug) throw new Error('SOCIAL_AD_PRODUCT_ASSET_CROSS_APP')
  if (product.status !== 'completed') throw new Error('SOCIAL_AD_PRODUCT_ASSET_NOT_READY')
  if (!product.mimeType.startsWith('image/')) throw new Error('SOCIAL_AD_PRODUCT_ASSET_TYPE_INVALID')
  for (const artifactId of contract.logoArtifactIds) {
    const logo = await prisma.artifact.findUnique({ where: { id: artifactId } })
    if (!logo) throw new Error('SOCIAL_AD_LOGO_ASSET_NOT_FOUND')
    if (logo.appSlug !== appSlug) throw new Error('SOCIAL_AD_LOGO_ASSET_CROSS_APP')
    if (logo.status !== 'completed' || !logo.mimeType.startsWith('image/')) {
      throw new Error('SOCIAL_AD_LOGO_ASSET_NOT_READY')
    }
  }
}

function safeJson(value: string | null | undefined): Record<string, unknown> {
  if (!value?.trim()) return {}
  try {
    const parsed = JSON.parse(value)
    return typeof parsed === 'object' && parsed !== null && !Array.isArray(parsed)
      ? parsed as Record<string, unknown>
      : {}
  } catch {
    return {}
  }
}

function childKind(job: ChildJob): 'generation' | 'quality' | 'assembly' | 'copy' | 'other' {
  const metadata = safeJson(job.metadataJson)
  if (metadata.socialAdQualityAnalysis === true) return 'quality'
  if (metadata.socialAdAssembly === true) return 'assembly'
  if (metadata.socialAdCopyCandidate === true) return 'copy'
  if (metadata.socialAdVideo === true && typeof metadata.candidateId === 'string') return 'generation'
  return 'other'
}

function summarizeJobs(jobs: readonly ChildJob[]) {
  return {
    total: jobs.length,
    planned: jobs.filter((job) => job.status === 'planned').length,
    queued: jobs.filter((job) => job.status === 'queued').length,
    processing: jobs.filter((job) => job.status === 'processing').length,
    completed: jobs.filter((job) => job.status === 'completed').length,
    failed: jobs.filter((job) => job.status === 'failed').length,
    cancelled: jobs.filter((job) => job.status === 'cancelled').length,
  }
}

function jobEvidence(job: ChildJob) {
  const metadata = safeJson(job.metadataJson)
  return {
    jobId: job.id,
    kind: childKind(job),
    candidateJobId: metadata.candidateJobId ?? null,
    candidateId: metadata.candidateId ?? null,
    candidateIndex: job.sceneNumber,
    status: job.status,
    progress: job.progress,
    capability: job.capability,
    provider: job.provider,
    model: job.model,
    artifactId: job.artifactId,
    error: job.error,
    retryCount: job.retryCount,
    workflowPhase: job.workflowPhase,
    sourceProductArtifactId: metadata.sourceProductArtifactId ?? null,
    sourceBrandArtifactIds: metadata.sourceBrandArtifactIds ?? [],
    creativeContractVersion: metadata.creativeContractVersion ?? null,
    retryHistory: metadata.retryHistory ?? [],
    usageEvidence: metadata.usageEvidence ?? null,
    providerEvidence: metadata.providerEvidence ?? null,
    executionEvidence: metadata.executionEvidence ?? null,
  }
}

async function resolvePlan(
  appSlug: string,
  allowedCapabilities: readonly string[],
  body: Record<string, unknown>,
): Promise<PlanResolution> {
  const invalidField = forbiddenEnvelopeField(body)
  if (invalidField) {
    return {
      ok: false,
      statusCode: 400,
      body: {
        error: true,
        code: 'SOCIAL_AD_EXECUTION_AUTHORITY_FORBIDDEN',
        message: `Social-ad request field is not allowed: ${invalidField}.`,
      },
    }
  }
  if (!allowedCapabilities.includes('social_content_generation')) {
    return {
      ok: false,
      statusCode: 403,
      body: {
        error: true,
        code: 'SOCIAL_CONTENT_CAPABILITY_REQUIRED',
        message: 'App requires social_content_generation access.',
      },
    }
  }

  const requestResult = SocialAdVideoRequestSchema.safeParse(body.request)
  const campaignResult = MarketingCampaignBriefSchema.safeParse(body.campaign)
  if (!requestResult.success || !campaignResult.success) {
    return {
      ok: false,
      statusCode: 400,
      body: {
        error: true,
        code: 'INVALID_SOCIAL_AD_PLAN_REQUEST',
        message: 'Social-ad request or campaign brief validation failed.',
        issues: [
          ...(requestResult.success ? [] : requestResult.error.issues),
          ...(campaignResult.success ? [] : campaignResult.error.issues),
        ],
      },
    }
  }

  const profile = await getBrandProfile(appSlug, requestResult.data.brandProfileId)
  if (!profile) {
    return {
      ok: false,
      statusCode: 404,
      body: {
        error: true,
        code: 'BRAND_PROFILE_NOT_FOUND',
        message: 'Brand Profile not found for the authenticated app.',
      },
    }
  }

  const campaignRecord = await prisma.campaign.findFirst({
    where: { id: campaignResult.data.campaignId, appSlug },
  })
  if (!campaignRecord) {
    return {
      ok: false,
      statusCode: 404,
      body: { error: true, code: 'SOCIAL_AD_CAMPAIGN_NOT_FOUND', message: 'Persisted campaign not found for the authenticated app.' },
    }
  }
  let storedCampaign
  try {
    storedCampaign = MarketingCampaignBriefSchema.parse(JSON.parse(campaignRecord.metadata))
  } catch {
    return {
      ok: false,
      statusCode: 409,
      body: { error: true, code: 'SOCIAL_AD_CAMPAIGN_INVALID', message: 'Persisted campaign contract is invalid.' },
    }
  }
  const compatible = storedCampaign.brandProfileId === campaignResult.data.brandProfileId
    && campaignResult.data.audienceIds.every((id) => storedCampaign.audienceIds.includes(id))
    && campaignResult.data.offeringIds.every((id) => storedCampaign.offeringIds.includes(id))
    && campaignResult.data.channels.every((channel) => storedCampaign.channels.includes(channel))
  if (!compatible) {
    return {
      ok: false,
      statusCode: 409,
      body: { error: true, code: 'SOCIAL_AD_CAMPAIGN_SCOPE_MISMATCH', message: 'Submitted audience, offering and channels must remain within the persisted campaign scope.' },
    }
  }

  try {
    const plan = buildSocialAdVideoPlan({
      request: requestResult.data,
      campaign: campaignResult.data,
      brandProfile: profile,
    })
    await validatePlanArtifacts(appSlug, plan)
    return {
      ok: true,
      plan,
      request: requestResult.data,
      campaign: campaignResult.data,
      brandProfile: profile,
    }
  } catch (error) {
    return {
      ok: false,
      statusCode: 409,
      body: {
        error: true,
        code: error instanceof Error
          ? error.message.split(':')[0]
          : 'SOCIAL_AD_PLAN_REJECTED',
        message: error instanceof Error
          ? error.message
          : 'Social-ad plan was rejected.',
      },
    }
  }
}

function candidateInput(candidate: SocialAdVideoPlan['candidates'][number]): Record<string, unknown> {
  if (candidate.durationSeconds > 60) {
    throw new Error('SOCIAL_AD_CANDIDATE_DURATION_REQUIRES_LONG_FORM')
  }
  if (candidate.generationCapability === 'image_to_video') {
    return {
      sourceImageArtifactId: candidate.sourceArtifactIds[0],
      duration: candidate.durationSeconds,
    }
  }
  if (candidate.generationCapability === 'video_to_video') {
    return {
      sourceVideoArtifactId: candidate.sourceArtifactIds[0],
      duration: candidate.durationSeconds,
    }
  }
  return {
    duration: candidate.durationSeconds,
    aspectRatio: candidate.masterAspectRatio,
  }
}

async function findSocialAdParent(appSlug: string, id: string) {
  const parent = await prisma.job.findFirst({
    where: {
      appSlug,
      capability: 'social_content_generation',
      parentJobId: null,
      OR: [{ id }, { executionId: id }],
    },
  })
  return parent && safeJson(parent.metadataJson).socialAdVideo === true ? parent : null
}

function nextRequiredPhase(workflowPhase: string): string {
  const map: Record<string, string> = {
    human_approval_pending: 'marketing_app_creative_approval',
    assembly_pending: 'network_master_assembly',
    assembly_processing: 'network_master_assembly',
    social_copy_generation: 'network_social_copy_generation',
    final_approval_pending: 'marketing_app_final_pack_approval',
    revision_required: 'marketing_app_creative_revision',
    final_revision_required: 'marketing_app_final_pack_revision',
    completed: 'none',
  }
  return map[workflowPhase] ?? workflowPhase
}

function executionStatus(
  parent: NonNullable<Awaited<ReturnType<typeof findSocialAdParent>>>,
  children: ChildJob[],
) {
  const metadata = safeJson(parent.metadataJson)
  const generationJobs = children.filter((job) => childKind(job) === 'generation')
  const qualityJobs = children.filter((job) => childKind(job) === 'quality')
  const assemblyJobs = children.filter((job) => childKind(job) === 'assembly')
  const copyJobs = children.filter((job) => childKind(job) === 'copy')
  const otherJobs = children.filter((job) => childKind(job) === 'other')

  return {
    executionId: parent.executionId,
    parentJobId: parent.id,
    planId: metadata.planId ?? null,
    status: parent.status,
    phase: parent.workflowPhase,
    progress: parent.progress,
    finalArtifactId: parent.artifactId,
    error: parent.error,
    generation: {
      counts: summarizeJobs(generationJobs),
      candidates: generationJobs.map(jobEvidence),
    },
    quality: {
      counts: summarizeJobs(qualityJobs),
      analyses: qualityJobs.map(jobEvidence),
      ranking: metadata.qualityRanking ?? [],
      selectedCandidateJobId: metadata.selectedCandidateJobId ?? null,
      selectedCandidateArtifactId: metadata.selectedCandidateArtifactId ?? null,
      selectedQualityScore: metadata.selectedQualityScore ?? null,
      reports: metadata.qualityReports ?? [],
    },
    assembly: {
      counts: summarizeJobs(assemblyJobs),
      jobs: assemblyJobs.map(jobEvidence),
      primaryArtifactId: metadata.assemblyArtifactId ?? parent.artifactId ?? null,
      masterVideoArtifactId: metadata.masterVideoArtifactId ?? metadata.assemblyArtifactId ?? parent.artifactId ?? null,
      deliveryVariants: metadata.deliveryVariants ?? [],
      subtitleArtifactIds: metadata.subtitleArtifactIds ?? [],
      thumbnailArtifactId: metadata.thumbnailArtifactId ?? null,
      reportArtifactId: metadata.deliveryReportArtifactId ?? null,
      finalQualityReportArtifactId: metadata.finalQualityReportArtifactId ?? null,
    },
    socialCopy: {
      counts: summarizeJobs(copyJobs),
      candidates: copyJobs.map(jobEvidence),
      status: metadata.socialCopyStatus ?? 'not_started',
      artifactId: metadata.copyArtifactId ?? null,
      selectedCopyJobId: metadata.selectedCopyJobId ?? null,
      selectedQualityScore: metadata.selectedCopyQualityScore ?? null,
      ranking: metadata.copyQualityRanking ?? [],
    },
    otherChildren: otherJobs.map(jobEvidence),
    humanApproval: metadata.humanApproval ?? { status: 'not_ready' },
    finalApproval: metadata.finalApproval ?? { status: 'not_ready' },
    decisionEvidence: metadata.decisionEvidence ?? [],
    nextRequiredPhase: nextRequiredPhase(parent.workflowPhase),
    plan: metadata.plan ?? null,
  }
}

export async function registerSocialAdVideoRoutes(
  app: FastifyInstance,
  options: { prefix: string; authenticate: SocialAdRouteAuthResolver },
): Promise<void> {
  let queue: Queue | null = null
  const getQueue = () => {
    if (!queue) {
      if (!app.redis) throw new Error('Redis is required for social-ad execution')
      queue = new Queue(QUEUE_NAMES.JOBS, { connection: app.redis as never })
    }
    return queue
  }

  app.post(`${options.prefix}/social-ad-video/plan`, async (request, reply) => {
    const auth = await options.authenticate(request.headers.authorization, request)
    if (!auth.ok) {
      return reply.status(auth.statusCode).send({
        error: true,
        code: 'AUTHENTICATION_FAILED',
        message: auth.error,
      })
    }
    const resolution = await resolvePlan(
      auth.app!.slug,
      auth.allowedCapabilities ?? [],
      request.body as Record<string, unknown>,
    )
    if (!resolution.ok) return reply.status(resolution.statusCode).send(resolution.body)
    return reply.send({ plan: resolution.plan })
  })

  app.post(`${options.prefix}/social-ad-video/executions`, async (request, reply) => {
    const auth = await options.authenticate(request.headers.authorization, request)
    if (!auth.ok) {
      return reply.status(auth.statusCode).send({
        error: true,
        code: 'AUTHENTICATION_FAILED',
        message: auth.error,
      })
    }
    const body = request.body as Record<string, unknown>
    const idempotencyKey = typeof body.idempotencyKey === 'string' ? body.idempotencyKey.trim() : ''
    if (idempotencyKey && !/^[A-Za-z0-9._:-]{8,200}$/.test(idempotencyKey)) {
      return reply.status(400).send({
        error: true,
        code: 'INVALID_SOCIAL_AD_IDEMPOTENCY_KEY',
        message: 'idempotencyKey must be 8-200 URL-safe characters.',
      })
    }
    const allowedCapabilities = auth.allowedCapabilities ?? []
    const resolution = await resolvePlan(
      auth.app!.slug,
      allowedCapabilities,
      body,
    )
    if (!resolution.ok) return reply.status(resolution.statusCode).send(resolution.body)

    if (idempotencyKey) {
      const existing = await prisma.job.findFirst({
        where: {
          appSlug: auth.app!.slug,
          capability: 'social_content_generation',
          parentJobId: null,
          metadataJson: { contains: `\"idempotencyKey\":\"${idempotencyKey}\"` },
        },
        orderBy: { createdAt: 'desc' },
      })
      if (existing && safeJson(existing.metadataJson).socialAdVideo === true) {
        const children = await prisma.job.findMany({
          where: { appSlug: auth.app!.slug, parentJobId: existing.id },
          orderBy: [{ sceneNumber: 'asc' }, { createdAt: 'asc' }],
        })
        return reply.status(existing.status === 'completed' ? 200 : 202).send({
          ...executionStatus(existing, children),
          deduplicated: true,
        })
      }
    }

    const socialCopyRequested = resolution.request.includeSocialCopy === true
    const requiredExecutionCapabilities = [...new Set<CapabilityKey>([
      'social_content_generation',
      'video_understanding',
      ...(socialCopyRequested ? ['structured_output' as CapabilityKey] : []),
      ...resolution.plan.candidates.map((candidate) => candidate.generationCapability),
    ])]
    const grantEntries = await Promise.all(requiredExecutionCapabilities.map(async (capability) => ({
      capability,
      snapshot: await resolveAppCapabilityGrantSnapshot(
        auth.app!.slug,
        capability,
        allowedCapabilities,
      ),
    })))
    const missingGrants = grantEntries
      .filter((entry) => !entry.snapshot)
      .map((entry) => entry.capability)
    if (missingGrants.length > 0) {
      return reply.status(403).send({
        error: true,
        code: 'SOCIAL_AD_CHILD_CAPABILITY_GRANT_REQUIRED',
        message: `Missing execution grants: ${missingGrants.join(', ')}`,
        missingCapabilities: missingGrants,
      })
    }

    const grants = new Map(grantEntries.map((entry) => [entry.capability, entry.snapshot!]))
    const qualityGrant = grants.get('video_understanding')!
    if (!qualityGrant.grant.artifactRead) {
      return reply.status(403).send({
        error: true,
        code: 'SOCIAL_AD_QUALITY_ARTIFACT_READ_REQUIRED',
        message: 'video_understanding grant must allow artifact reads.',
      })
    }
    const copyGrant = socialCopyRequested ? grants.get('structured_output')! : null

    let validatedCandidateInputs: Array<{
      candidate: SocialAdVideoPlan['candidates'][number]
      input: Record<string, unknown>
    }>
    try {
      validatedCandidateInputs = resolution.plan.candidates.map((candidate) => {
        const input = candidateInput(candidate)
        const validation = validateDirectProviderRequest(
          candidate.generationCapability,
          candidate.prompt,
          input,
        )
        if (!validation.success) {
          throw new Error(validation.error ?? 'SOCIAL_AD_CANDIDATE_INPUT_INVALID')
        }
        return { candidate, input: validation.data ?? input }
      })
    } catch (error) {
      return reply.status(409).send({
        error: true,
        code: error instanceof Error
          ? error.message.split(':')[0]
          : 'SOCIAL_AD_CANDIDATE_INPUT_INVALID',
        message: error instanceof Error
          ? error.message
          : 'Candidate input validation failed.',
      })
    }

    const executionId = randomUUID()
    const traceId = idempotencyKey
      ? `trace_social_ad_${createHash('sha256').update(`${auth.app!.slug}:${idempotencyKey}`).digest('hex').slice(0, 32)}`
      : `trace_social_ad_${executionId}`
    const createdAt = new Date().toISOString()
    const { parent, children } = await prisma.$transaction(async (tx) => {
      const parentGrant = grants.get('social_content_generation')!
      const parent = await tx.job.create({
        data: {
          appSlug: auth.app!.slug,
          capability: 'social_content_generation',
          prompt: String(resolution.request.prompt ?? 'Social-ad video execution'),
          inputJson: JSON.stringify({
            request: resolution.request,
            campaign: resolution.campaign,
          }),
          metadataJson: JSON.stringify({
            socialAdVideo: true,
            durableParent: true,
            executionId,
            idempotencyKey: idempotencyKey || null,
            planId: resolution.plan.planId,
            plan: resolution.plan,
            brandProfileSnapshot: resolution.brandProfile,
            appGrantSnapshot: parentGrant.grant,
            appGrantSnapshotSource: parentGrant.source,
            appGrantSnapshotAt: createdAt,
            qualityGrantSnapshot: qualityGrant.grant,
            qualityGrantSnapshotSource: qualityGrant.source,
            qualityGrantSnapshotAt: createdAt,
            ...(copyGrant ? {
              copyGrantSnapshot: copyGrant.grant,
              copyGrantSnapshotSource: copyGrant.source,
              copyGrantSnapshotAt: createdAt,
            } : {}),
            currentPhase: 'candidate_submission',
            humanApproval: { status: 'not_ready' },
            finalApproval: { status: 'not_ready' },
          }),
          traceId,
          status: 'processing',
          progress: 0,
          executionId,
          workflowPhase: 'candidate_submission',
        },
      })

      const children: ChildJob[] = []
      for (const { candidate, input } of validatedCandidateInputs) {
        const childGrant = grants.get(candidate.generationCapability)!
        const metadata = {
          socialAdVideo: true,
          candidateId: candidate.candidateId,
          candidateIndex: candidate.candidateIndex,
          planId: resolution.plan.planId,
          executionId,
          parentJobId: parent.id,
          qualityPolicy: resolution.plan.qualityPolicy,
          negativePrompt: candidate.negativePrompt,
          sourceProductArtifactId: candidate.productSourceArtifactId,
          sourceBrandArtifactIds: candidate.logoArtifactIds,
          sourceArtifactIds: candidate.sourceArtifactIds,
          creativeContractVersion: candidate.creativeContractVersion,
          creativeContract: resolution.plan.creativeContract,
          candidatePrompt: candidate.prompt,
          candidateNegativePrompt: candidate.negativePrompt,
          candidateLineage: {
            parentJobId: parent.id,
            executionId,
            planId: resolution.plan.planId,
            candidateId: candidate.candidateId,
            candidateIndex: candidate.candidateIndex,
          },
          retryHistory: [],
          executionProfile: 'external_app',
          appGrantSnapshot: childGrant.grant,
          appGrantSnapshotSource: childGrant.source,
          appGrantSnapshotAt: createdAt,
          routingMode: childGrant.grant.routingMode ?? 'automatic',
        }
        children.push(await tx.job.create({
          data: {
            appSlug: auth.app!.slug,
            capability: candidate.generationCapability,
            prompt: candidate.prompt,
            inputJson: JSON.stringify(input),
            metadataJson: JSON.stringify(metadata),
            traceId: `trace_social_ad_${executionId}_candidate_${candidate.candidateIndex}`,
            status: 'queued',
            parentJobId: parent.id,
            executionId,
            sceneNumber: candidate.candidateIndex,
            workflowPhase: 'candidate_queued',
            queuedAt: new Date(),
          },
        }))
      }
      return { parent, children }
    })

    const queued: string[] = []
    const failed: Array<{ jobId: string; error: string }> = []
    for (const child of children) {
      const metadata = safeJson(child.metadataJson)
      try {
        const payload: JobPayload = {
          jobId: child.id,
          appSlug: child.appSlug,
          capability: child.capability as CapabilityKey,
          executionProfile: 'external_app',
          prompt: child.prompt,
          input: safeJson(child.inputJson),
          metadata,
          traceId: child.traceId,
          routingMode: typeof metadata.routingMode === 'string'
            ? metadata.routingMode
            : 'automatic',
          appGrantSnapshot: metadata.appGrantSnapshot as AppCapabilityGrantContext,
        }
        await getQueue().add('process', payload, {
          ...DEFAULT_JOB_OPTIONS,
          jobId: child.id,
        })
        await prisma.job.update({
          where: { id: child.id },
          data: { queueJobId: child.id, queuedAt: new Date() },
        })
        queued.push(child.id)
      } catch (error) {
        const message = error instanceof Error
          ? error.message
          : 'Queue submission failed'
        failed.push({ jobId: child.id, error: message })
        await prisma.job.update({
          where: { id: child.id },
          data: {
            status: 'failed',
            error: message,
            completedAt: new Date(),
            workflowPhase: 'candidate_queue_failed',
          },
        })
      }
    }

    await prisma.job.update({
      where: { id: parent.id },
      data: {
        status: failed.length === children.length ? 'failed' : 'processing',
        workflowPhase: failed.length > 0
          ? 'partial_candidate_queue_failure'
          : 'candidate_generation',
        error: failed.length > 0
          ? `Candidate queue failures: ${failed.map((item) => item.jobId).join(', ')}`
          : null,
        progress: queued.length > 0 ? 5 : 0,
      },
    })

    return reply.status(202).send({
      executionId,
      parentJobId: parent.id,
      planId: resolution.plan.planId,
      status: failed.length === children.length ? 'failed' : 'processing',
      phase: failed.length > 0
        ? 'partial_candidate_queue_failure'
        : 'candidate_generation',
      queuedCandidateJobIds: queued,
      queueFailures: failed,
      candidateCount: children.length,
      qualityAnalysisRequired: true,
      socialCopyRequired: socialCopyRequested,
      humanApprovalRequired: resolution.plan.approvalRequired,
      finalApprovalRequired: true,
      maxCredits: resolution.plan.maxCredits,
      executionAuthority: 'orchestra',
    })
  })

  app.get(`${options.prefix}/social-ad-video/executions/:id`, async (request, reply) => {
    const auth = await options.authenticate(request.headers.authorization, request)
    if (!auth.ok) {
      return reply.status(auth.statusCode).send({
        error: true,
        code: 'AUTHENTICATION_FAILED',
        message: auth.error,
      })
    }
    const { id } = request.params as { id: string }
    const parent = await findSocialAdParent(auth.app!.slug, id)
    if (!parent) {
      return reply.status(404).send({
        error: true,
        code: 'SOCIAL_AD_EXECUTION_NOT_FOUND',
        message: 'Social-ad execution not found.',
      })
    }
    const children = await prisma.job.findMany({
      where: { appSlug: auth.app!.slug, parentJobId: parent.id },
      orderBy: [{ sceneNumber: 'asc' }, { createdAt: 'asc' }],
    })
    return reply.send(executionStatus(parent, children))
  })

  app.post(`${options.prefix}/social-ad-video/executions/:id/approval`, async (request, reply) => {
    const auth = await options.authenticate(request.headers.authorization, request)
    if (!auth.ok) {
      return reply.status(auth.statusCode).send({
        error: true,
        code: 'AUTHENTICATION_FAILED',
        message: auth.error,
      })
    }
    const { id } = request.params as { id: string }
    const body = request.body as Record<string, unknown>
    const decision = body.decision
    if (decision !== 'approved' && decision !== 'rejected' && decision !== 'revision_requested') {
      return reply.status(400).send({
        error: true,
        code: 'INVALID_SOCIAL_AD_APPROVAL',
        message: 'decision must be approved, rejected, or revision_requested.',
      })
    }
    const notes = typeof body.notes === 'string' ? body.notes.slice(0, 5000) : ''
    const parent = await findSocialAdParent(auth.app!.slug, id)
    if (!parent) {
      return reply.status(404).send({
        error: true,
        code: 'SOCIAL_AD_EXECUTION_NOT_FOUND',
        message: 'Social-ad execution not found.',
      })
    }
    if (parent.workflowPhase !== 'human_approval_pending') {
      return reply.status(409).send({
        error: true,
        code: 'SOCIAL_AD_NOT_READY_FOR_APPROVAL',
        message: `Execution is in ${parent.workflowPhase}, not human_approval_pending.`,
      })
    }
    const metadata = safeJson(parent.metadataJson)
    if (!metadata.selectedCandidateArtifactId) {
      return reply.status(409).send({
        error: true,
        code: 'SOCIAL_AD_QUALITY_WINNER_MISSING',
        message: 'The Network has not selected a quality-qualified candidate.',
      })
    }

    const decidedAt = new Date().toISOString()
    const nextPhase = decision === 'approved' ? 'assembly_pending' : 'revision_required'
    const evidence = {
      decision,
      actor: `app:${auth.app!.slug}`,
      timestamp: decidedAt,
      notes,
      selectedCandidateJobId: metadata.selectedCandidateJobId ?? null,
      selectedCandidateArtifactId: metadata.selectedCandidateArtifactId,
      affectedArtifactIds: [metadata.selectedCandidateArtifactId],
      workflowVersion: 'social-ad-product-breakout-v1',
      stage: 'creative_approval',
    }
    await prisma.job.update({
      where: { id: parent.id },
      data: {
        workflowPhase: nextPhase,
        progress: decision === 'approved' ? 85 : 80,
        metadataJson: JSON.stringify({
          ...metadata,
          currentPhase: nextPhase,
          humanApproval: {
            status: decision,
            notes,
            decidedAt,
            appSlug: auth.app!.slug,
          },
          decisionEvidence: [
            ...(Array.isArray(metadata.decisionEvidence) ? metadata.decisionEvidence : []),
            evidence,
          ],
        }),
        error: decision === 'rejected'
          ? 'Selected social-ad candidate was rejected by the Marketing App reviewer.'
          : null,
      },
    })
    return reply.send({
      executionId: parent.executionId,
      status: parent.status,
      phase: nextPhase,
      decision,
      selectedCandidateArtifactId: metadata.selectedCandidateArtifactId,
      nextRequiredPhase: decision === 'approved'
        ? 'network_master_assembly'
        : 'marketing_app_revision_decision',
    })
  })

  async function requeueChild(parent: NonNullable<Awaited<ReturnType<typeof findSocialAdParent>>>, child: ChildJob) {
    const metadata = safeJson(child.metadataJson)
    const retryCount = child.retryCount + 1
    if (retryCount > 3) throw new Error('SOCIAL_AD_RETRY_LIMIT_REACHED')
    const plan = safeJson(parent.metadataJson).plan
    const maxCredits = plan && typeof plan === 'object' && !Array.isArray(plan)
      ? Number((plan as Record<string, unknown>).maxCredits ?? 0)
      : 0
    const siblings = await prisma.job.findMany({ where: { appSlug: parent.appSlug, parentJobId: parent.id } })
    const consumedRetryCredits = siblings.reduce((sum, item) => sum + item.retryCount, 0)
    if (maxCredits > 0 && consumedRetryCredits + 1 > maxCredits) throw new Error('SOCIAL_AD_CREDIT_CEILING_EXCEEDED')
    const retriedAt = new Date().toISOString()
    const updatedMetadata: Record<string, unknown> = {
      ...metadata,
      retryHistory: [
        ...(Array.isArray(metadata.retryHistory) ? metadata.retryHistory : []),
        { attempt: retryCount, retriedAt, priorError: child.error, actor: `app:${parent.appSlug}` },
      ],
    }
    const queueDeliveryId = `${child.id}:retry:${retryCount}`
    await prisma.job.update({
      where: { id: child.id },
      data: {
        status: 'queued',
        error: null,
        completedAt: null,
        retryCount,
        queuedAt: new Date(),
        queueJobId: queueDeliveryId,
        workflowPhase: 'retry_queued',
        metadataJson: JSON.stringify(updatedMetadata),
      },
    })
    const payload: JobPayload = {
      jobId: child.id,
      appSlug: child.appSlug,
      capability: child.capability as CapabilityKey,
      executionProfile: 'external_app',
      prompt: child.prompt,
      input: safeJson(child.inputJson),
      metadata: updatedMetadata,
      traceId: child.traceId,
      routingMode: typeof metadata.routingMode === 'string' ? metadata.routingMode : 'automatic',
      appGrantSnapshot: metadata.appGrantSnapshot as AppCapabilityGrantContext,
    }
    await getQueue().add('process', payload, { ...DEFAULT_JOB_OPTIONS, jobId: queueDeliveryId })
    return { jobId: child.id, queueDeliveryId, retryCount }
  }

  app.post(`${options.prefix}/social-ad-video/executions/:id/candidates/:jobId/retry`, async (request, reply) => {
    const auth = await options.authenticate(request.headers.authorization, request)
    if (!auth.ok) return reply.status(auth.statusCode).send({ error: true, code: 'AUTHENTICATION_FAILED', message: auth.error })
    const { id, jobId } = request.params as { id: string; jobId: string }
    const parent = await findSocialAdParent(auth.app!.slug, id)
    if (!parent) return reply.status(404).send({ error: true, code: 'SOCIAL_AD_EXECUTION_NOT_FOUND', message: 'Social-ad execution not found.' })
    if (['cancelled', 'cancelling', 'completed'].includes(parent.status)) {
      return reply.status(409).send({ error: true, code: 'SOCIAL_AD_RETRY_NOT_ALLOWED', message: `Execution is ${parent.status}.` })
    }
    const child = await prisma.job.findFirst({ where: { id: jobId, appSlug: parent.appSlug, parentJobId: parent.id } })
    if (!child || childKind(child) !== 'generation') return reply.status(404).send({ error: true, code: 'SOCIAL_AD_CANDIDATE_NOT_FOUND', message: 'Candidate job not found.' })
    if (child.status !== 'failed') return reply.status(409).send({ error: true, code: 'SOCIAL_AD_CANDIDATE_NOT_RETRYABLE', message: `Candidate is ${child.status}.` })
    try {
      const queued = await requeueChild(parent, child)
      await prisma.job.update({ where: { id: parent.id }, data: { status: 'processing', workflowPhase: 'candidate_generation', error: null, completedAt: null } })
      return reply.status(202).send({ executionId: parent.executionId, ...queued })
    } catch (error) {
      const code = error instanceof Error ? error.message.split(':')[0] : 'SOCIAL_AD_RETRY_FAILED'
      return reply.status(409).send({ error: true, code, message: error instanceof Error ? error.message : 'Candidate retry failed.' })
    }
  })

  app.post(`${options.prefix}/social-ad-video/executions/:id/resume`, async (request, reply) => {
    const auth = await options.authenticate(request.headers.authorization, request)
    if (!auth.ok) return reply.status(auth.statusCode).send({ error: true, code: 'AUTHENTICATION_FAILED', message: auth.error })
    const { id } = request.params as { id: string }
    const parent = await findSocialAdParent(auth.app!.slug, id)
    if (!parent) return reply.status(404).send({ error: true, code: 'SOCIAL_AD_EXECUTION_NOT_FOUND', message: 'Social-ad execution not found.' })
    if (['cancelled', 'cancelling'].includes(parent.status)) return reply.status(409).send({ error: true, code: 'SOCIAL_AD_CANCELLED', message: 'Cancelled executions cannot resume.' })
    const children = await prisma.job.findMany({ where: { appSlug: parent.appSlug, parentJobId: parent.id }, orderBy: { createdAt: 'asc' } })
    const retryable = children.filter((child) => child.status === 'failed' && child.retryCount < 3)
    const queued = []
    for (const child of retryable) queued.push(await requeueChild(parent, child))
    if (queued.length > 0) await prisma.job.update({ where: { id: parent.id }, data: { status: 'processing', error: null, completedAt: null } })
    return reply.status(queued.length > 0 ? 202 : 200).send({
      executionId: parent.executionId,
      phase: parent.workflowPhase,
      queued,
      deduplicated: queued.length === 0,
    })
  })

  app.post(`${options.prefix}/social-ad-video/executions/:id/regenerate`, async (request, reply) => {
    const auth = await options.authenticate(request.headers.authorization, request)
    if (!auth.ok) return reply.status(auth.statusCode).send({ error: true, code: 'AUTHENTICATION_FAILED', message: auth.error })
    const { id } = request.params as { id: string }
    const parent = await findSocialAdParent(auth.app!.slug, id)
    if (!parent) return reply.status(404).send({ error: true, code: 'SOCIAL_AD_EXECUTION_NOT_FOUND', message: 'Social-ad execution not found.' })
    if (!['revision_required', 'partial_candidate_failure', 'quality_analysis_failed'].includes(parent.workflowPhase)) {
      return reply.status(409).send({ error: true, code: 'SOCIAL_AD_REGENERATION_NOT_ALLOWED', message: `Execution is in ${parent.workflowPhase}.` })
    }
    const children = await prisma.job.findMany({ where: { appSlug: parent.appSlug, parentJobId: parent.id }, orderBy: { createdAt: 'asc' } })
    const generation = children.filter((child) => childKind(child) === 'generation')
    if (generation.length >= 6) return reply.status(409).send({ error: true, code: 'SOCIAL_AD_REGENERATION_LIMIT_REACHED', message: 'At most six generated candidates are allowed.' })
    const source = generation.find((child) => child.id === safeJson(parent.metadataJson).selectedCandidateJobId) ?? generation[0]
    if (!source) return reply.status(409).send({ error: true, code: 'SOCIAL_AD_REGENERATION_SOURCE_MISSING', message: 'No candidate source is available for regeneration.' })
    const parentMetadata = safeJson(parent.metadataJson)
    const plan = parentMetadata.plan && typeof parentMetadata.plan === 'object' && !Array.isArray(parentMetadata.plan)
      ? parentMetadata.plan as Record<string, unknown>
      : {}
    const maxCredits = Number(plan.maxCredits ?? 0)
    const consumed = generation.length + children.reduce((sum, child) => sum + child.retryCount, 0)
    if (maxCredits > 0 && consumed + 1 > maxCredits) return reply.status(409).send({ error: true, code: 'SOCIAL_AD_CREDIT_CEILING_EXCEEDED', message: 'Regeneration would exceed the workflow credit ceiling.' })
    const sourceMetadata = safeJson(source.metadataJson)
    const nextIndex = Math.max(0, ...generation.map((child) => child.sceneNumber ?? 0)) + 1
    const notes = typeof (request.body as Record<string, unknown> | undefined)?.notes === 'string'
      ? String((request.body as Record<string, unknown>).notes).slice(0, 2000)
      : 'Address the recorded creative revision evidence.'
    const regeneratedAt = new Date().toISOString()
    const metadata: Record<string, unknown> = {
      ...sourceMetadata,
      candidateId: `${String(parentMetadata.planId ?? parent.id)}-candidate-${nextIndex}-revision`,
      candidateIndex: nextIndex,
      candidateLineage: {
        parentJobId: parent.id,
        executionId: parent.executionId,
        planId: parentMetadata.planId,
        candidateIndex: nextIndex,
        regeneratedFromCandidateJobId: source.id,
      },
      retryHistory: [],
      revisionHistory: [
        ...(Array.isArray(sourceMetadata.revisionHistory) ? sourceMetadata.revisionHistory : []),
        { regeneratedAt, notes, actor: `app:${parent.appSlug}`, sourceCandidateJobId: source.id },
      ],
    }
    const child = await prisma.job.create({
      data: {
        appSlug: parent.appSlug,
        capability: source.capability,
        prompt: `${source.prompt} Revision instruction: ${notes}`,
        inputJson: source.inputJson,
        metadataJson: JSON.stringify(metadata),
        traceId: `${parent.traceId}_candidate_${nextIndex}_revision`,
        status: 'queued',
        parentJobId: parent.id,
        executionId: parent.executionId,
        sceneNumber: nextIndex,
        workflowPhase: 'candidate_queued',
        queuedAt: new Date(),
      },
    })
    const payload: JobPayload = {
      jobId: child.id,
      appSlug: child.appSlug,
      capability: child.capability as CapabilityKey,
      executionProfile: 'external_app',
      prompt: child.prompt,
      input: safeJson(child.inputJson),
      metadata,
      traceId: child.traceId,
      routingMode: typeof metadata.routingMode === 'string' ? metadata.routingMode : 'automatic',
      appGrantSnapshot: metadata.appGrantSnapshot as AppCapabilityGrantContext,
    }
    await getQueue().add('process', payload, { ...DEFAULT_JOB_OPTIONS, jobId: child.id })
    await prisma.$transaction([
      prisma.job.update({ where: { id: child.id }, data: { queueJobId: child.id } }),
      prisma.job.update({ where: { id: parent.id }, data: { status: 'processing', workflowPhase: 'candidate_generation', progress: 5, error: null, completedAt: null } }),
    ])
    return reply.status(202).send({ executionId: parent.executionId, candidateJobId: child.id, candidateIndex: nextIndex, regeneratedFromCandidateJobId: source.id })
  })

  app.post(`${options.prefix}/social-ad-video/executions/:id/cancel`, async (request, reply) => {
    const auth = await options.authenticate(request.headers.authorization, request)
    if (!auth.ok) return reply.status(auth.statusCode).send({ error: true, code: 'AUTHENTICATION_FAILED', message: auth.error })
    const { id } = request.params as { id: string }
    const parent = await findSocialAdParent(auth.app!.slug, id)
    if (!parent) return reply.status(404).send({ error: true, code: 'SOCIAL_AD_EXECUTION_NOT_FOUND', message: 'Social-ad execution not found.' })
    if (parent.status === 'completed') return reply.status(409).send({ error: true, code: 'SOCIAL_AD_COMPLETED', message: 'Completed executions cannot be cancelled.' })
    if (parent.status === 'cancelled') return reply.send({ executionId: parent.executionId, status: 'cancelled', deduplicated: true })
    const cancelledAt = new Date()
    await prisma.$transaction([
      prisma.job.updateMany({
        where: { appSlug: parent.appSlug, parentJobId: parent.id, status: { in: ['planned', 'queued', 'processing', 'failed'] } },
        data: { status: 'cancelled', workflowPhase: 'cancelled', completedAt: cancelledAt, error: 'Cancelled by authorised app request.' },
      }),
      prisma.job.update({
        where: { id: parent.id },
        data: { status: 'cancelled', workflowPhase: 'cancelled', completedAt: cancelledAt, error: 'Cancelled by authorised app request.' },
      }),
    ])
    return reply.send({ executionId: parent.executionId, status: 'cancelled', cancelledAt: cancelledAt.toISOString() })
  })
}

export async function appSocialAdVideoRoutes(app: FastifyInstance): Promise<void> {
  return registerSocialAdVideoRoutes(app, {
    prefix: '/api/v1',
    authenticate: async (authorization) => authenticateAppKey(authorization),
  })
}
