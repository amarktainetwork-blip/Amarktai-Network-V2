/**
 * Voice Conversion Routes — isolated API routes for voice conversion operations.
 *
 * Uses real authentication, Voice Profile governance, artifact authorization,
 * BullMQ queue submission, and exact idempotency. Voice conversion returns truthful
 * provider-route blockers when no production provider route exists.
 */

import { randomUUID } from 'node:crypto'
import type { FastifyInstance, FastifyRequest, FastifyReply } from 'fastify'
import { Queue } from 'bullmq'
import { prisma } from '@amarktai/db'
import { DEFAULT_JOB_OPTIONS, type JobPayload, type CapabilityKey } from '@amarktai/core'
import {
  createVoiceConversionDomainService,
  type VoiceConversionResult,
} from '@amarktai/core/voice-conversion-contracts'
import { authenticateAppKey } from './jobs.js'
import { getVoiceProfile } from '../lib/voice-avatar-profile-store.js'
import { resolveAppCapabilityGrantSnapshot } from '../lib/app-grant-loader.js'

// ── Types ─────────────────────────────────────────────────────────────────────

interface AuthenticatedRequest extends FastifyRequest {
  auth?: Awaited<ReturnType<typeof authenticateAppKey>>
}

// ── Queue Helper ──────────────────────────────────────────────────────────────

function getQueue(): Queue {
  return new Queue('amarktai-jobs', { connection: { url: process.env.REDIS_URL ?? 'redis://127.0.0.1:6379' } })
}

// ── Idempotency Helper ────────────────────────────────────────────────────────

async function findIdempotentJob(appSlug: string, capability: string, idempotencyKey: string) {
  return prisma.job.findFirst({
    where: {
      appSlug,
      capability,
      status: { in: ['queued', 'processing', 'completed'] },
      metadataJson: { contains: `"idempotencyKey":"${idempotencyKey}"` },
    },
    orderBy: { createdAt: 'desc' },
  })
}

// ── Route Registration ────────────────────────────────────────────────────────

export function registerVoiceConversionRoutes(app: FastifyInstance): void {
  // Submit voice conversion
  app.post('/api/v1/voice-conversion', async (request: AuthenticatedRequest, reply: FastifyReply) => {
    try {
      // 1. Authenticate
      const auth = await authenticateAppKey(request.headers.authorization)
      if (!auth.ok) {
        return reply.status(auth.statusCode).send({
          error: auth.error,
          code: 'AUTH_REQUIRED',
        })
      }

      const appSlug = auth.app!.slug

      // 2. Resolve grant
      const grantResolution = await resolveAppCapabilityGrantSnapshot(
        appSlug,
        'voice_conversion' as CapabilityKey,
        auth.allowedCapabilities ?? [],
      )
      if (!grantResolution || !grantResolution.grant.enabled) {
        return reply.status(403).send({
          error: 'App does not have voice_conversion capability grant',
          code: 'CAPABILITY_GRANT_DENIED',
        })
      }

      if (!grantResolution.grant.artifactRead) {
        return reply.status(403).send({
          error: 'App capability grant denies source-artifact read for voice_conversion',
          code: 'GRANT_DENIED',
        })
      }

      // 3. Validate request
      const domainService = createVoiceConversionDomainService()
      const validation = domainService.validateRequest(request.body)
      if (!validation.success) {
        return reply.status(400).send({
          error: validation.error,
          code: 'VALIDATION_FAILED',
          issues: validation.issues,
        })
      }

      const conversionRequest = validation.data!

      // 4. Check idempotency (exact app-scoped match)
      if (conversionRequest.idempotencyKey) {
        const existing = await findIdempotentJob(appSlug, 'voice_conversion', conversionRequest.idempotencyKey)
        if (existing) {
          return reply.status(200).send({
            status: existing.status,
            voiceConversionId: existing.id,
            sourceAudioArtifactId: conversionRequest.sourceAudioArtifactId,
            targetVoiceProfileId: conversionRequest.targetVoiceProfileId,
            provider: existing.provider ?? undefined,
            evidence: {
              evidenceSource: 'local_fixture',
              liveProviderProof: false,
              idempotent: true,
            },
            createdAt: existing.createdAt.toISOString(),
            completedAt: existing.completedAt?.toISOString(),
          })
        }
      }

      // 5. Load source artifact with ownership check
      const sourceArtifact = await prisma.artifact.findFirst({
        where: { id: conversionRequest.sourceAudioArtifactId, appSlug },
      })
      if (!sourceArtifact) {
        return reply.status(404).send({
          error: 'Source audio artifact not found or not accessible',
          code: 'ARTIFACT_NOT_FOUND',
        })
      }

      if (sourceArtifact.type !== 'audio' && !sourceArtifact.mimeType.startsWith('audio/')) {
        return reply.status(400).send({
          error: 'Source artifact must be an audio artifact',
          code: 'INVALID_ARTIFACT_TYPE',
        })
      }

      // 6. Load real Voice Profile with full governance
      const targetProfile = await getVoiceProfile(appSlug, conversionRequest.targetVoiceProfileId)
      if (!targetProfile) {
        return reply.status(404).send({
          error: 'Target voice profile not found or not accessible',
          code: 'VOICE_PROFILE_NOT_FOUND',
        })
      }

      // Enforce profile ownership
      if (targetProfile.appSlug !== appSlug) {
        return reply.status(403).send({
          error: 'Target voice profile does not belong to this application',
          code: 'CROSS_APP_PROFILE_DENIED',
        })
      }

      // Enforce profile lifecycle (conversion requires verified profile)
      if (targetProfile.status !== 'verified') {
        return reply.status(422).send({
          error: `Target voice profile status is '${targetProfile.status}', requires 'verified'`,
          code: 'PROFILE_NOT_VERIFIED',
        })
      }

      // Enforce rights status
      if (targetProfile.rightsStatus !== 'verified') {
        return reply.status(422).send({
          error: `Target voice profile rights status is '${targetProfile.rightsStatus}', requires 'verified'`,
          code: 'RIGHTS_NOT_VERIFIED',
        })
      }

      // 7. Create durable Job record
      const traceId = `trace_${randomUUID()}`
      const job = await prisma.job.create({
        data: {
          appSlug,
          capability: 'voice_conversion',
          prompt: `Voice conversion from artifact ${conversionRequest.sourceAudioArtifactId}`,
          inputJson: JSON.stringify(conversionRequest),
          metadataJson: JSON.stringify({
            idempotencyKey: conversionRequest.idempotencyKey,
            sourceArtifactId: conversionRequest.sourceAudioArtifactId,
            targetVoiceProfileId: conversionRequest.targetVoiceProfileId,
            intendedUse: conversionRequest.intendedUse,
            grantSnapshot: grantResolution.grant,
            grantSource: grantResolution.source,
          }),
          traceId,
          status: 'queued',
        },
      })

      // 8. Submit to BullMQ queue
      const payload: JobPayload = {
        jobId: job.id,
        appSlug,
        capability: 'voice_conversion',
        executionProfile: 'external_app',
        prompt: `Voice conversion from artifact ${conversionRequest.sourceAudioArtifactId}`,
        input: {
          sourceAudioArtifactId: conversionRequest.sourceAudioArtifactId,
          targetVoiceProfileId: conversionRequest.targetVoiceProfileId,
          intendedUse: conversionRequest.intendedUse,
        },
        metadata: {
          idempotencyKey: conversionRequest.idempotencyKey,
        },
        traceId,
        routingMode: 'balanced',
        appGrantSnapshot: grantResolution.grant,
      }

      try {
        const q = getQueue()
        await q.add('process', payload, {
          ...DEFAULT_JOB_OPTIONS,
          jobId: job.id,
        })
      } catch (err) {
        await prisma.job.update({
          where: { id: job.id },
          data: { status: 'failed', error: 'Failed to enqueue job', completedAt: new Date() },
        })
        app.log.error({ err }, 'Failed to push voice_conversion job to queue')
        return reply.status(500).send({ error: 'Failed to enqueue job', code: 'QUEUE_SUBMISSION_FAILED' })
      }

      const result: VoiceConversionResult = {
        status: 'accepted',
        voiceConversionId: job.id,
        sourceAudioArtifactId: conversionRequest.sourceAudioArtifactId,
        targetVoiceProfileId: conversionRequest.targetVoiceProfileId,
        evidence: {
          evidenceSource: 'local_fixture',
          liveProviderProof: false,
        },
        createdAt: job.createdAt.toISOString(),
      }

      return reply.status(202).send(result)
    } catch (error) {
      const message = error instanceof Error ? error.message : 'Internal server error'
      return reply.status(500).send({ error: message, code: 'INTERNAL_ERROR' })
    }
  })

  // Get voice conversion status
  app.get('/api/v1/voice-conversion/:id', async (request: AuthenticatedRequest, reply: FastifyReply) => {
    try {
      const auth = await authenticateAppKey(request.headers.authorization)
      if (!auth.ok) {
        return reply.status(auth.statusCode).send({
          error: auth.error,
          code: 'AUTH_REQUIRED',
        })
      }

      const appSlug = auth.app!.slug
      const { id } = request.params as { id: string }

      const job = await prisma.job.findFirst({
        where: { id, appSlug, capability: 'voice_conversion' },
      })

      if (!job) {
        return reply.status(404).send({
          error: 'Voice conversion execution not found',
          code: 'EXECUTION_NOT_FOUND',
        })
      }

      const inputMeta = JSON.parse(job.metadataJson || '{}')

      const result: VoiceConversionResult = {
        status: job.status === 'completed' ? 'completed' :
          job.status === 'failed' ? 'failed' :
          job.status === 'cancelled' ? 'cancelled' : 'processing',
        voiceConversionId: job.id,
        sourceAudioArtifactId: inputMeta.sourceArtifactId ?? '',
        targetVoiceProfileId: inputMeta.targetVoiceProfileId ?? '',
        provider: job.provider ?? undefined,
        outputArtifactId: job.artifactId ?? undefined,
        evidence: {
          evidenceSource: 'local_fixture',
          liveProviderProof: false,
        },
        createdAt: job.createdAt.toISOString(),
        completedAt: job.completedAt?.toISOString(),
        error: job.error ?? undefined,
      }

      return reply.send(result)
    } catch (error) {
      const message = error instanceof Error ? error.message : 'Internal server error'
      return reply.status(500).send({ error: message, code: 'INTERNAL_ERROR' })
    }
  })

  // Cancel voice conversion
  app.post('/api/v1/voice-conversion/:id/cancel', async (request: AuthenticatedRequest, reply: FastifyReply) => {
    try {
      const auth = await authenticateAppKey(request.headers.authorization)
      if (!auth.ok) {
        return reply.status(auth.statusCode).send({
          error: auth.error,
          code: 'AUTH_REQUIRED',
        })
      }

      const appSlug = auth.app!.slug
      const { id } = request.params as { id: string }

      const result = await prisma.job.updateMany({
        where: {
          id,
          appSlug,
          capability: 'voice_conversion',
          status: { in: ['queued', 'processing'] },
        },
        data: {
          status: 'cancelled',
          completedAt: new Date(),
          error: 'Cancelled by app',
        },
      })

      if (!result.count) {
        return reply.status(409).send({
          error: 'Voice conversion execution not found, already terminal, or belongs to another app',
          code: 'EXECUTION_NOT_CANCELLABLE',
        })
      }

      return reply.send({
        status: 'cancelled',
        voiceConversionId: id,
        message: 'Voice conversion operation cancelled',
      })
    } catch (error) {
      const message = error instanceof Error ? error.message : 'Internal server error'
      return reply.status(500).send({ error: message, code: 'INTERNAL_ERROR' })
    }
  })

  // Get voice conversion evidence
  app.get('/api/v1/voice-conversion/:id/evidence', async (request: AuthenticatedRequest, reply: FastifyReply) => {
    try {
      const auth = await authenticateAppKey(request.headers.authorization)
      if (!auth.ok) {
        return reply.status(auth.statusCode).send({
          error: auth.error,
          code: 'AUTH_REQUIRED',
        })
      }

      const appSlug = auth.app!.slug
      const { id } = request.params as { id: string }

      const job = await prisma.job.findFirst({
        where: { id, appSlug, capability: 'voice_conversion' },
      })

      if (!job) {
        return reply.status(404).send({
          error: 'Voice conversion execution not found',
          code: 'EXECUTION_NOT_FOUND',
        })
      }

      return reply.send({
        voiceConversionId: id,
        evidence: {
          evidenceSource: 'local_fixture',
          liveProviderProof: false,
          status: job.status,
          outputArtifactId: job.artifactId ?? undefined,
        },
      })
    } catch (error) {
      const message = error instanceof Error ? error.message : 'Internal server error'
      return reply.status(500).send({ error: message, code: 'INTERNAL_ERROR' })
    }
  })
}
