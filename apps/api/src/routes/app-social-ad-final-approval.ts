import type { FastifyInstance } from 'fastify'
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

export async function registerSocialAdFinalApprovalRoutes(
  app: FastifyInstance,
  options: { prefix: string; authenticate: SocialAdRouteAuthResolver },
): Promise<void> {
  app.post(`${options.prefix}/social-ad-video/executions/:id/final-approval`, async (request, reply) => {
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
        code: 'INVALID_SOCIAL_AD_FINAL_APPROVAL',
        message: 'decision must be approved, rejected, or revision_requested.',
      })
    }
    const notes = typeof body.notes === 'string' ? body.notes.slice(0, 5000) : ''
    const parent = await findParent(auth.app!.slug, id)
    if (!parent) {
      return reply.status(404).send({
        error: true,
        code: 'SOCIAL_AD_EXECUTION_NOT_FOUND',
        message: 'Social-ad execution not found.',
      })
    }
    if (parent.workflowPhase !== 'final_approval_pending') {
      return reply.status(409).send({
        error: true,
        code: 'SOCIAL_AD_FINAL_PACK_NOT_READY',
        message: `Execution is in ${parent.workflowPhase}, not final_approval_pending.`,
      })
    }

    const metadata = safeJson(parent.metadataJson)
    const plan = metadata.plan && typeof metadata.plan === 'object' && !Array.isArray(metadata.plan)
      ? metadata.plan as Record<string, unknown>
      : {}
    const socialCopyRequired = Array.isArray(plan.deliverables) && plan.deliverables.includes('social_copy')
    const primaryVideoArtifactId = parent.artifactId ?? metadata.assemblyArtifactId
    const copyArtifactId = metadata.copyArtifactId
    const deliveryVariants = metadata.deliveryVariants
    const thumbnailArtifactId = metadata.thumbnailArtifactId
    const reportArtifactId = metadata.deliveryReportArtifactId
    const finalQualityReportArtifactId = metadata.finalQualityReportArtifactId
    if (
      typeof primaryVideoArtifactId !== 'string'
      || !primaryVideoArtifactId
      || (socialCopyRequired && (typeof copyArtifactId !== 'string' || !copyArtifactId))
      || !Array.isArray(deliveryVariants)
      || deliveryVariants.length === 0
      || typeof thumbnailArtifactId !== 'string'
      || !thumbnailArtifactId
      || typeof reportArtifactId !== 'string'
      || !reportArtifactId
      || typeof finalQualityReportArtifactId !== 'string'
      || !finalQualityReportArtifactId
    ) {
      return reply.status(409).send({
        error: true,
        code: 'SOCIAL_AD_FINAL_PACK_INCOMPLETE',
        message: 'Video variants, requested social copy, thumbnail, final quality, or execution evidence is missing.',
      })
    }

    const decidedAt = new Date().toISOString()
    const affectedArtifactIds = [
      primaryVideoArtifactId,
      ...(typeof copyArtifactId === 'string' ? [copyArtifactId] : []),
      thumbnailArtifactId,
      reportArtifactId,
      finalQualityReportArtifactId,
      ...(Array.isArray(deliveryVariants)
        ? deliveryVariants.map((item) => safeJson(JSON.stringify(item)).artifactId).filter((item): item is string => typeof item === 'string')
        : []),
    ]
    const evidence = {
      decision,
      actor: `app:${auth.app!.slug}`,
      timestamp: decidedAt,
      notes,
      selectedCandidateJobId: metadata.selectedCandidateJobId ?? null,
      selectedCandidateArtifactId: metadata.selectedCandidateArtifactId ?? null,
      affectedArtifactIds,
      workflowVersion: 'social-ad-product-breakout-v1',
      stage: 'final_pack_approval',
    }
    if (decision === 'rejected' || decision === 'revision_requested') {
      await prisma.job.update({
        where: { id: parent.id },
        data: {
          status: 'processing',
          workflowPhase: 'final_revision_required',
          progress: 98,
          error: 'Final social-ad delivery pack was rejected by the Marketing App reviewer.',
          metadataJson: JSON.stringify({
            ...metadata,
            currentPhase: 'final_revision_required',
            finalApproval: {
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
        },
      })
      return reply.send({
        executionId: parent.executionId,
        parentJobId: parent.id,
        status: 'processing',
        phase: 'final_revision_required',
        decision,
        nextRequiredPhase: 'marketing_app_final_revision_decision',
      })
    }

    const completedAt = new Date()
    await prisma.$transaction([
      prisma.job.updateMany({
        where: {
          appSlug: parent.appSlug,
          parentJobId: parent.id,
          status: { in: ['planned', 'queued', 'processing', 'failed'] },
        },
        data: {
          status: 'cancelled',
          workflowPhase: 'superseded_by_final_approval',
          completedAt,
        },
      }),
      prisma.job.update({
        where: { id: parent.id },
        data: {
          status: 'completed',
          workflowPhase: 'completed',
          progress: 100,
          error: null,
          completedAt,
          artifactId: primaryVideoArtifactId,
          metadataJson: JSON.stringify({
            ...metadata,
            currentPhase: 'completed',
            finalApproval: {
              status: 'approved',
              notes,
              decidedAt,
              appSlug: auth.app!.slug,
            },
            decisionEvidence: [
              ...(Array.isArray(metadata.decisionEvidence) ? metadata.decisionEvidence : []),
              evidence,
            ],
            completedAt: decidedAt,
          }),
        },
      }),
    ])

    return reply.send({
      executionId: parent.executionId,
      parentJobId: parent.id,
      status: 'completed',
      phase: 'completed',
      decision,
      artifacts: {
        primaryVideoArtifactId,
        masterVideoArtifactId: primaryVideoArtifactId,
        deliveryVariants,
        copyArtifactId,
        thumbnailArtifactId,
        subtitleArtifactIds: Array.isArray(metadata.subtitleArtifactIds) ? metadata.subtitleArtifactIds : [],
        reportArtifactId,
        finalQualityReportArtifactId,
      },
      qualityEvidence: {
        selectedCandidateJobId: metadata.selectedCandidateJobId ?? null,
        selectedCandidateQualityScore: metadata.selectedQualityScore ?? null,
        selectedCopyJobId: metadata.selectedCopyJobId ?? null,
        selectedCopyQualityScore: metadata.selectedCopyQualityScore ?? null,
      },
    })
  })
}

export async function appSocialAdFinalApprovalRoutes(app: FastifyInstance): Promise<void> {
  return registerSocialAdFinalApprovalRoutes(app, {
    prefix: '/api/v1',
    authenticate: async (authorization) => authenticateAppKey(authorization),
  })
}