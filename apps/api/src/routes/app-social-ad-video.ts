import type { FastifyInstance } from 'fastify'
import { randomUUID } from 'node:crypto'
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
import { MarketingCampaignBriefSchema, SocialAdVideoRequestSchema } from '@amarktai/core/marketing-platform'
import { buildSocialAdVideoPlan, type SocialAdVideoPlan } from '@amarktai/core/social-ad-video'
import { getBrandProfile } from '../lib/brand-profile-store.js'
import { resolveAppCapabilityGrantSnapshot } from '../lib/app-grant-loader.js'
import { authenticateAppKey } from './jobs.js'

type PlanResolution =
  | { ok: true; plan: SocialAdVideoPlan; request: Record<string, unknown>; campaign: Record<string, unknown>; brandProfile: Record<string, unknown> }
  | { ok: false; statusCode: number; body: Record<string, unknown> }

function safeJson(value: string | null | undefined): Record<string, unknown> {
  if (!value?.trim()) return {}
  try {
    const parsed = JSON.parse(value)
    return typeof parsed === 'object' && parsed !== null && !Array.isArray(parsed) ? parsed as Record<string, unknown> : {}
  } catch {
    return {}
  }
}

async function resolvePlan(
  appSlug: string,
  allowedCapabilities: readonly string[],
  body: Record<string, unknown>,
): Promise<PlanResolution> {
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

  try {
    return {
      ok: true,
      plan: buildSocialAdVideoPlan({
        request: requestResult.data,
        campaign: campaignResult.data,
        brandProfile: profile,
      }),
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
        code: error instanceof Error ? error.message.split(':')[0] : 'SOCIAL_AD_PLAN_REJECTED',
        message: error instanceof Error ? error.message : 'Social-ad plan was rejected.',
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

function executionStatus(parent: Awaited<ReturnType<typeof prisma.job.findFirst>>, children: Awaited<ReturnType<typeof prisma.job.findMany>>) {
  if (!parent) return null
  const completed = children.filter((job) => job.status === 'completed').length
  const failed = children.filter((job) => job.status === 'failed').length
  const processing = children.filter((job) => job.status === 'processing').length
  const queued = children.filter((job) => job.status === 'queued').length
  const total = children.length
  const candidateProgress = total > 0 ? Math.round((completed / total) * 45) : 0
  const phase = failed > 0 && completed + failed === total
    ? 'candidate_generation_failed'
    : completed === total && total > 0
      ? 'candidate_quality_pending'
      : 'candidate_generation'
  const progress = phase === 'candidate_quality_pending' ? 55 : Math.min(50, 5 + candidateProgress)
  return {
    executionId: parent.executionId,
    parentJobId: parent.id,
    status: parent.status,
    phase,
    progress,
    finalArtifactId: parent.artifactId,
    error: parent.error,
    candidateCounts: { total, queued, processing, completed, failed },
    candidates: children.map((job) => ({
      jobId: job.id,
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
    })),
    nextRequiredPhase: phase === 'candidate_quality_pending'
      ? 'quality_evaluation_and_winner_selection'
      : phase === 'candidate_generation_failed'
        ? 'candidate_retry_or_failure_resolution'
        : 'candidate_generation',
  }
}

export async function appSocialAdVideoRoutes(app: FastifyInstance): Promise<void> {
  let queue: Queue | null = null
  const getQueue = () => {
    if (!queue) {
      if (!app.redis) throw new Error('Redis is required for social-ad execution')
      queue = new Queue(QUEUE_NAMES.JOBS, { connection: app.redis as never })
    }
    return queue
  }

  app.post('/api/v1/social-ad-video/plan', async (request, reply) => {
    const auth = await authenticateAppKey(request.headers.authorization)
    if (!auth.ok) return reply.status(auth.statusCode).send({ error: true, code: 'AUTHENTICATION_FAILED', message: auth.error })
    const resolution = await resolvePlan(auth.app!.slug, auth.allowedCapabilities ?? [], request.body as Record<string, unknown>)
    if (!resolution.ok) return reply.status(resolution.statusCode).send(resolution.body)
    return reply.send({ plan: resolution.plan })
  })

  app.post('/api/v1/social-ad-video/executions', async (request, reply) => {
    const auth = await authenticateAppKey(request.headers.authorization)
    if (!auth.ok) return reply.status(auth.statusCode).send({ error: true, code: 'AUTHENTICATION_FAILED', message: auth.error })
    const allowedCapabilities = auth.allowedCapabilities ?? []
    const resolution = await resolvePlan(auth.app!.slug, allowedCapabilities, request.body as Record<string, unknown>)
    if (!resolution.ok) return reply.status(resolution.statusCode).send(resolution.body)

    const requiredExecutionCapabilities = [...new Set<CapabilityKey>([
      'social_content_generation',
      ...resolution.plan.candidates.map((candidate) => candidate.generationCapability),
    ])]
    const grantEntries = await Promise.all(requiredExecutionCapabilities.map(async (capability) => ({
      capability,
      snapshot: await resolveAppCapabilityGrantSnapshot(auth.app!.slug, capability, allowedCapabilities),
    })))
    const missingGrants = grantEntries.filter((entry) => !entry.snapshot).map((entry) => entry.capability)
    if (missingGrants.length > 0) {
      return reply.status(403).send({
        error: true,
        code: 'SOCIAL_AD_CHILD_CAPABILITY_GRANT_REQUIRED',
        message: `Missing execution grants: ${missingGrants.join(', ')}`,
        missingCapabilities: missingGrants,
      })
    }
    const grants = new Map(grantEntries.map((entry) => [entry.capability, entry.snapshot!]))
    const executionId = randomUUID()
    const createdAt = new Date().toISOString()

    let validatedCandidateInputs: Array<{ candidate: SocialAdVideoPlan['candidates'][number]; input: Record<string, unknown> }>
    try {
      validatedCandidateInputs = resolution.plan.candidates.map((candidate) => {
        const input = candidateInput(candidate)
        const validation = validateDirectProviderRequest(candidate.generationCapability, candidate.prompt, input)
        if (!validation.success) throw new Error(validation.error ?? 'SOCIAL_AD_CANDIDATE_INPUT_INVALID')
        return { candidate, input: validation.data ?? input }
      })
    } catch (error) {
      return reply.status(409).send({
        error: true,
        code: error instanceof Error ? error.message.split(':')[0] : 'SOCIAL_AD_CANDIDATE_INPUT_INVALID',
        message: error instanceof Error ? error.message : 'Candidate input validation failed.',
      })
    }

    const { parent, children } = await prisma.$transaction(async (tx) => {
      const parentGrant = grants.get('social_content_generation')!
      const parent = await tx.job.create({
        data: {
          appSlug: auth.app!.slug,
          capability: 'social_content_generation',
          prompt: String(resolution.request.prompt ?? 'Social-ad video execution'),
          inputJson: JSON.stringify({ request: resolution.request, campaign: resolution.campaign }),
          metadataJson: JSON.stringify({
            socialAdVideo: true,
            durableParent: true,
            executionId,
            planId: resolution.plan.planId,
            plan: resolution.plan,
            brandProfileSnapshot: resolution.brandProfile,
            appGrantSnapshot: parentGrant.grant,
            appGrantSnapshotSource: parentGrant.source,
            appGrantSnapshotAt: createdAt,
            currentPhase: 'candidate_submission',
          }),
          traceId: `trace_social_ad_${executionId}`,
          status: 'processing',
          progress: 0,
          executionId,
          workflowPhase: 'candidate_submission',
        },
      })

      const children = []
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

    const q = getQueue()
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
          routingMode: typeof metadata.routingMode === 'string' ? metadata.routingMode : 'automatic',
          appGrantSnapshot: metadata.appGrantSnapshot as AppCapabilityGrantContext,
        }
        await q.add('process', payload, { ...DEFAULT_JOB_OPTIONS, jobId: child.id })
        await prisma.job.update({ where: { id: child.id }, data: { queueJobId: child.id, queuedAt: new Date() } })
        queued.push(child.id)
      } catch (error) {
        const message = error instanceof Error ? error.message : 'Queue submission failed'
        failed.push({ jobId: child.id, error: message })
        await prisma.job.update({
          where: { id: child.id },
          data: { status: 'failed', error: message, completedAt: new Date(), workflowPhase: 'candidate_queue_failed' },
        })
      }
    }

    await prisma.job.update({
      where: { id: parent.id },
      data: {
        status: failed.length === children.length ? 'failed' : 'processing',
        workflowPhase: failed.length > 0 ? 'partial_candidate_queue_failure' : 'candidate_generation',
        error: failed.length > 0 ? `Candidate queue failures: ${failed.map((item) => item.jobId).join(', ')}` : null,
        progress: queued.length > 0 ? 5 : 0,
      },
    })

    return reply.status(202).send({
      executionId,
      parentJobId: parent.id,
      planId: resolution.plan.planId,
      status: failed.length === children.length ? 'failed' : 'processing',
      phase: failed.length > 0 ? 'partial_candidate_queue_failure' : 'candidate_generation',
      queuedCandidateJobIds: queued,
      queueFailures: failed,
      candidateCount: children.length,
      maxCredits: resolution.plan.maxCredits,
      executionAuthority: 'orchestra',
    })
  })

  app.get('/api/v1/social-ad-video/executions/:id', async (request, reply) => {
    const auth = await authenticateAppKey(request.headers.authorization)
    if (!auth.ok) return reply.status(auth.statusCode).send({ error: true, code: 'AUTHENTICATION_FAILED', message: auth.error })
    const { id } = request.params as { id: string }
    const parent = await prisma.job.findFirst({
      where: {
        appSlug: auth.app!.slug,
        capability: 'social_content_generation',
        parentJobId: null,
        OR: [{ id }, { executionId: id }],
      },
    })
    if (!parent || safeJson(parent.metadataJson).socialAdVideo !== true) {
      return reply.status(404).send({ error: true, code: 'SOCIAL_AD_EXECUTION_NOT_FOUND', message: 'Social-ad execution not found.' })
    }
    const children = await prisma.job.findMany({ where: { appSlug: auth.app!.slug, parentJobId: parent.id }, orderBy: { sceneNumber: 'asc' } })
    const status = executionStatus(parent, children)
    if (!status) return reply.status(404).send({ error: true, code: 'SOCIAL_AD_EXECUTION_NOT_FOUND', message: 'Social-ad execution not found.' })

    if (status.phase !== parent.workflowPhase || status.progress !== parent.progress) {
      await prisma.job.update({
        where: { id: parent.id },
        data: {
          workflowPhase: status.phase,
          progress: status.progress,
          status: status.phase === 'candidate_generation_failed' ? 'failed' : parent.status,
          completedAt: status.phase === 'candidate_generation_failed' ? new Date() : parent.completedAt,
        },
      })
    }
    return reply.send({
      ...status,
      plan: safeJson(parent.metadataJson).plan,
    })
  })
}
