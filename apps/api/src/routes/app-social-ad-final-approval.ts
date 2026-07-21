import type { FastifyInstance } from 'fastify'
import { prisma } from '@amarktai/db'
import { authenticateAppKey } from './jobs.js'

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

export async function appSocialAdFinalApprovalRoutes(app: FastifyInstance): Promise<void> {
  app.post('/api/v1/social-ad-video/executions/:id/final-approval', async (request, reply) => {
    const auth = await authenticateAppKey(request.headers.authorization)
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
    if (decision !== 'approved' && decision !== 'rejected') {
      return reply.status(400).send({
        error: true,
        code: 'INVALID_SOCIAL_AD_FINAL_APPROVAL',
        message: 'decision must be approved or rejected.',
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
    const primaryVideoArtifactId = parent.artifactId ?? metadata.assemblyArtifactId
    const copyArtifactId = metadata.copyArtifactId
    const deliveryVariants = metadata.deliveryVariants
    const thumbnailArtifactId = metadata.thumbnailArtifactId
    const reportArtifactId = metadata.deliveryReportArtifactId
    if (
      typeof primaryVideoArtifactId !== 'string'
      || !primaryVideoArtifactId
      || typeof copyArtifactId !== 'string'
      || !copyArtifactId
      || !Array.isArray(deliveryVariants)
      || deliveryVariants.length === 0
      || typeof thumbnailArtifactId !== 'string'
      || !thumbnailArtifactId
      || typeof reportArtifactId !== 'string'
      || !reportArtifactId
    ) {
      return reply.status(409).send({
        error: true,
        code: 'SOCIAL_AD_FINAL_PACK_INCOMPLETE',
        message: 'Video variants, social copy, thumbnail, or delivery evidence is missing.',
      })
    }

    const decidedAt = new Date().toISOString()
    if (decision === 'rejected') {
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
              status: 'rejected',
              notes,
              decidedAt,
              appSlug: auth.app!.slug,
            },
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

    await prisma.job.update({
      where: { id: parent.id },
      data: {
        status: 'completed',
        workflowPhase: 'completed',
        progress: 100,
        error: null,
        completedAt: new Date(),
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
          completedAt: decidedAt,
        }),
      },
    })

    return reply.send({
      executionId: parent.executionId,
      parentJobId: parent.id,
      status: 'completed',
      phase: 'completed',
      decision,
      artifacts: {
        primaryVideoArtifactId,
        deliveryVariants,
        copyArtifactId,
        thumbnailArtifactId,
        subtitleArtifactIds: Array.isArray(metadata.subtitleArtifactIds) ? metadata.subtitleArtifactIds : [],
        reportArtifactId,
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
