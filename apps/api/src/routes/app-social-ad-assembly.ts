import type { FastifyInstance } from 'fastify'
import { Queue } from 'bullmq'
import {
  DEFAULT_JOB_OPTIONS,
  QUEUE_NAMES,
  type AppCapabilityGrantContext,
  type JobPayload,
} from '@amarktai/core'
import { prisma } from '@amarktai/db'
import { authenticateAppKey } from './jobs.js'
import type { SocialAdRouteAuthResolver } from './app-social-ad-video.js'

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

function isAssemblyJob(metadataJson: string): boolean {
  return safeJson(metadataJson).socialAdAssembly === true
}

async function findParent(appSlug: string, id: string) {
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

export async function registerSocialAdAssemblyRoutes(
  app: FastifyInstance,
  options: { prefix: string; authenticate: SocialAdRouteAuthResolver },
): Promise<void> {
  let queue: Queue | null = null
  const getQueue = () => {
    if (!queue) {
      if (!app.redis) throw new Error('Redis is required for social-ad assembly')
      queue = new Queue(QUEUE_NAMES.JOBS, { connection: app.redis as never })
    }
    return queue
  }

  app.post(`${options.prefix}/social-ad-video/executions/:id/assemble`, async (request, reply) => {
    const auth = await options.authenticate(request.headers.authorization, request)
    if (!auth.ok) {
      return reply.status(auth.statusCode).send({
        error: true,
        code: 'AUTHENTICATION_FAILED',
        message: auth.error,
      })
    }
    const { id } = request.params as { id: string }
    const parent = await findParent(auth.app!.slug, id)
    if (!parent) {
      return reply.status(404).send({
        error: true,
        code: 'SOCIAL_AD_EXECUTION_NOT_FOUND',
        message: 'Social-ad execution not found.',
      })
    }
    const parentMetadata = safeJson(parent.metadataJson)
    const humanApproval = parentMetadata.humanApproval
    const approvalRecord = humanApproval && typeof humanApproval === 'object' && !Array.isArray(humanApproval)
      ? humanApproval as Record<string, unknown>
      : {}
    if (approvalRecord.status !== 'approved' || !['assembly_pending', 'assembly_queued', 'assembly_processing'].includes(parent.workflowPhase)) {
      return reply.status(409).send({
        error: true,
        code: 'SOCIAL_AD_ASSEMBLY_NOT_AUTHORISED',
        message: 'Assembly requires a Network-selected winner and an approved Marketing App decision.',
      })
    }
    const selectedArtifactId = parentMetadata.selectedCandidateArtifactId
    if (typeof selectedArtifactId !== 'string' || !selectedArtifactId) {
      return reply.status(409).send({
        error: true,
        code: 'SOCIAL_AD_QUALITY_WINNER_MISSING',
        message: 'Selected candidate artifact is missing.',
      })
    }
    const grant = parentMetadata.appGrantSnapshot
    if (!grant || typeof grant !== 'object' || Array.isArray(grant)) {
      return reply.status(409).send({
        error: true,
        code: 'SOCIAL_AD_PARENT_GRANT_MISSING',
        message: 'Immutable parent grant snapshot is missing.',
      })
    }
    const appGrant = grant as AppCapabilityGrantContext
    if (appGrant.appSlug !== parent.appSlug || appGrant.capability !== 'social_content_generation' || !appGrant.enabled || !appGrant.artifactRead || !appGrant.artifactWrite) {
      return reply.status(403).send({
        error: true,
        code: 'SOCIAL_AD_ASSEMBLY_ARTIFACT_AUTHORITY_REQUIRED',
        message: 'Social-content grant must allow artifact read and write for local assembly.',
      })
    }

    const existingChildren = await prisma.job.findMany({
      where: { appSlug: parent.appSlug, parentJobId: parent.id },
      orderBy: { createdAt: 'asc' },
    })
    const existing = existingChildren.find((child) => isAssemblyJob(child.metadataJson))
    if (existing) {
      return reply.status(existing.status === 'completed' ? 200 : 202).send({
        executionId: parent.executionId,
        parentJobId: parent.id,
        assemblyJobId: existing.id,
        status: existing.status,
        phase: existing.workflowPhase,
        artifactId: existing.artifactId,
        deduplicated: true,
      })
    }

    const createdAt = new Date().toISOString()
    const metadata = {
      socialAdVideo: true,
      socialAdAssembly: true,
      internalLocalExecution: true,
      executionProfile: 'external_app',
      executionId: parent.executionId,
      parentJobId: parent.id,
      plan: parentMetadata.plan,
      qualityRanking: parentMetadata.qualityRanking ?? [],
      humanApproval: approvalRecord,
      selectedCandidateJobId: parentMetadata.selectedCandidateJobId,
      selectedCandidateArtifactId: selectedArtifactId,
      appGrantSnapshot: appGrant,
      appGrantSnapshotSource: parentMetadata.appGrantSnapshotSource ?? 'parent_snapshot',
      appGrantSnapshotAt: parentMetadata.appGrantSnapshotAt ?? createdAt,
    }
    const assemblyJob = await prisma.job.create({
      data: {
        appSlug: parent.appSlug,
        capability: 'social_content_generation',
        prompt: 'Assemble the approved social-ad winner into validated delivery variants.',
        inputJson: JSON.stringify({ selectedArtifactId }),
        metadataJson: JSON.stringify(metadata),
        traceId: `${parent.traceId}_assembly`,
        status: 'queued',
        parentJobId: parent.id,
        executionId: parent.executionId,
        workflowPhase: 'assembly_queued',
        queuedAt: new Date(),
      },
    })
    const payload: JobPayload = {
      jobId: assemblyJob.id,
      appSlug: assemblyJob.appSlug,
      capability: 'social_content_generation',
      executionProfile: 'external_app',
      prompt: assemblyJob.prompt,
      input: { selectedArtifactId },
      metadata,
      traceId: assemblyJob.traceId,
      routingMode: 'automatic',
      appGrantSnapshot: appGrant,
    }
    try {
      await getQueue().add('process', payload, {
        ...DEFAULT_JOB_OPTIONS,
        jobId: assemblyJob.id,
      })
      await prisma.$transaction([
        prisma.job.update({
          where: { id: assemblyJob.id },
          data: { queueJobId: assemblyJob.id, queuedAt: new Date() },
        }),
        prisma.job.update({
          where: { id: parent.id },
          data: {
            workflowPhase: 'assembly_processing',
            progress: 87,
            error: null,
            metadataJson: JSON.stringify({
              ...parentMetadata,
              currentPhase: 'assembly_processing',
              assemblyJobId: assemblyJob.id,
              assemblyQueuedAt: createdAt,
            }),
          },
        }),
      ])
    } catch (error) {
      const message = error instanceof Error ? error.message : 'Social-ad assembly queue submission failed'
      await prisma.$transaction([
        prisma.job.update({
          where: { id: assemblyJob.id },
          data: {
            status: 'failed',
            error: message,
            completedAt: new Date(),
            workflowPhase: 'assembly_queue_failed',
          },
        }),
        prisma.job.update({
          where: { id: parent.id },
          data: {
            workflowPhase: 'assembly_queue_failed',
            progress: 85,
            error: message,
          },
        }),
      ])
      return reply.status(503).send({
        error: true,
        code: 'SOCIAL_AD_ASSEMBLY_QUEUE_FAILED',
        message,
      })
    }

    return reply.status(202).send({
      executionId: parent.executionId,
      parentJobId: parent.id,
      assemblyJobId: assemblyJob.id,
      status: 'processing',
      phase: 'assembly_processing',
      executionAuthority: 'internal_local_ffmpeg',
    })
  })
}

export async function appSocialAdAssemblyRoutes(app: FastifyInstance): Promise<void> {
  return registerSocialAdAssemblyRoutes(app, {
    prefix: '/api/v1',
    authenticate: async (authorization) => authenticateAppKey(authorization),
  })
}
