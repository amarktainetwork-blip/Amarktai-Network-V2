/**
 * Audio-to-Audio Routes — isolated API routes for audio transformation operations.
 *
 * Uses canonical queue configuration, deterministic trace idempotency,
 * and real FFmpeg execution in the worker. Internal operations (trim, resample,
 * channel_convert, loudness_normalize, normalize) are genuinely executable.
 */

import { randomUUID, createHash } from 'node:crypto'
import type { FastifyInstance, FastifyRequest, FastifyReply } from 'fastify'
import { Queue } from 'bullmq'
import { prisma } from '@amarktai/db'
import {
  DEFAULT_JOB_OPTIONS,
  QUEUE_NAMES,
  type JobPayload,
  type CapabilityKey,
} from '@amarktai/core'
import {
  hasVoiceAvatarBlockedOverrides,
} from '@amarktai/core/voice-avatar-platform'
import { createAudioToAudioDomainService } from '@amarktai/core/audio-to-audio-contracts'
import { authenticateAppKey } from './jobs.js'
import { resolveAppCapabilityGrantSnapshot } from '../lib/app-grant-loader.js'

// ── Types ─────────────────────────────────────────────────────────────────────

interface AuthenticatedRequest extends FastifyRequest {
  auth?: Awaited<ReturnType<typeof authenticateAppKey>>
}

// ── Canonical Idempotency ─────────────────────────────────────────────────────

function durableIdempotencyTrace(appSlug: string, capability: string, idempotencyKey: string): string {
  return createHash('sha256').update(`${appSlug}:${capability}:${idempotencyKey}`).digest('hex')
}

async function findIdempotentJob(appSlug: string, capability: string, traceId: string) {
  return prisma.job.findFirst({
    where: {
      appSlug,
      capability,
      traceId,
      status: { in: ['queued', 'processing', 'completed'] },
    },
    orderBy: { createdAt: 'desc' },
  })
}

// ── Route Registration ────────────────────────────────────────────────────────

export async function registerAudioToAudioRoutes(app: FastifyInstance): Promise<void> {
  // Canonical queue: reuse Fastify Redis connection, one lazy instance
  let queue: Queue | null = null
  function getQueue(): Queue {
    if (!queue) {
      if (!app.redis) throw new Error('Redis is required for audio-to-audio queue')
      queue = new Queue(QUEUE_NAMES.JOBS, { connection: app.redis as never })
    }
    return queue
  }

  // Submit audio-to-audio operation
  app.post('/api/v1/audio-to-audio', async (request: AuthenticatedRequest, reply: FastifyReply) => {
    try {
      // 1. Authenticate
      const auth = await authenticateAppKey(request.headers.authorization)
      if (!auth.ok) return reply.status(auth.statusCode).send({ error: auth.error, code: 'AUTH_REQUIRED' })

      const appSlug = auth.app!.slug

      // 2. Compliance gate: block provider/model overrides
      const body = request.body as Record<string, unknown>
      const blockedField = hasVoiceAvatarBlockedOverrides(body)
        || hasVoiceAvatarBlockedOverrides((body.metadata ?? {}) as Record<string, unknown>)
      if (blockedField) {
        return reply.status(400).send({
          error: `Field '${blockedField}' is not allowed. Provider selection is owned by the AmarktAI Network.`,
          code: 'BLOCKED_FIELD',
        })
      }

      // 3. Resolve grant
      const grantResolution = await resolveAppCapabilityGrantSnapshot(
        appSlug, 'audio_to_audio' as CapabilityKey, auth.allowedCapabilities ?? [],
      )
      if (!grantResolution || !grantResolution.grant.enabled) {
        return reply.status(403).send({ error: 'App does not have audio_to_audio capability grant', code: 'CAPABILITY_GRANT_DENIED' })
      }
      if (!grantResolution.grant.artifactRead || !grantResolution.grant.artifactWrite) {
        return reply.status(403).send({ error: 'App capability grant denies artifact read/write for audio_to_audio', code: 'GRANT_DENIED' })
      }

      // 4. Validate request
      const domainService = createAudioToAudioDomainService()
      const validation = domainService.validateRequest(request.body)
      if (!validation.success) {
        return reply.status(400).send({ error: validation.error, code: 'VALIDATION_FAILED', issues: validation.issues })
      }
      const a2aRequest = validation.data!

      // 5. Deterministic trace idempotency
      const idempotencyKey = a2aRequest.idempotencyKey ?? `auto_${randomUUID()}`
      const traceId = durableIdempotencyTrace(appSlug, 'audio_to_audio', idempotencyKey)
      const existing = await findIdempotentJob(appSlug, 'audio_to_audio', traceId)
      if (existing) {
        return reply.status(200).send({
          status: existing.status,
          audioToAudioId: existing.id,
          sourceAudioArtifactId: a2aRequest.sourceAudioArtifactId,
          operation: a2aRequest.operation,
          provider: existing.provider ?? undefined,
          evidence: { evidenceSource: 'internal_ffmpeg', liveProviderProof: false, operation: a2aRequest.operation, idempotent: true },
          createdAt: existing.createdAt.toISOString(),
          completedAt: existing.completedAt?.toISOString(),
        })
      }

      // 6. Load source artifact with ownership check
      const sourceArtifact = await prisma.artifact.findFirst({
        where: { id: a2aRequest.sourceAudioArtifactId, appSlug },
      })
      if (!sourceArtifact) {
        return reply.status(404).send({ error: 'Source audio artifact not found or not accessible', code: 'ARTIFACT_NOT_FOUND' })
      }
      if (sourceArtifact.type !== 'audio' && !sourceArtifact.mimeType.startsWith('audio/')) {
        return reply.status(400).send({ error: 'Source artifact must be an audio artifact', code: 'INVALID_ARTIFACT_TYPE' })
      }

      // 7. Create durable Job record with deterministic traceId
      const job = await prisma.job.create({
        data: {
          appSlug,
          capability: 'audio_to_audio',
          prompt: `Audio ${a2aRequest.operation} from artifact ${a2aRequest.sourceAudioArtifactId}`,
          inputJson: JSON.stringify(a2aRequest),
          metadataJson: JSON.stringify({
            idempotencyKey,
            sourceArtifactId: a2aRequest.sourceAudioArtifactId,
            operation: a2aRequest.operation,
            parameters: a2aRequest.parameters,
            outputFormat: a2aRequest.outputFormat,
            grantSnapshot: grantResolution.grant,
            grantSource: grantResolution.source,
          }),
          traceId,
          status: 'queued',
        },
      })

      // 8. Submit to canonical BullMQ queue
      const payload: JobPayload = {
        jobId: job.id,
        appSlug,
        capability: 'audio_to_audio',
        executionProfile: 'external_app',
        prompt: `Audio ${a2aRequest.operation} from artifact ${a2aRequest.sourceAudioArtifactId}`,
        input: {
          sourceAudioArtifactId: a2aRequest.sourceAudioArtifactId,
          operation: a2aRequest.operation,
          parameters: a2aRequest.parameters,
          outputFormat: a2aRequest.outputFormat,
        },
        metadata: { idempotencyKey },
        traceId,
        routingMode: 'balanced',
        appGrantSnapshot: grantResolution.grant,
      }

      try {
        await getQueue().add('process', payload, { ...DEFAULT_JOB_OPTIONS, jobId: job.id })
      } catch (err) {
        await prisma.job.update({
          where: { id: job.id },
          data: { status: 'failed', error: 'Failed to enqueue job', completedAt: new Date() },
        })
        app.log.error({ err }, 'Failed to push audio_to_audio job to queue')
        return reply.status(500).send({ error: 'Failed to enqueue job', code: 'QUEUE_SUBMISSION_FAILED' })
      }

      return reply.status(202).send({
        status: 'accepted',
        audioToAudioId: job.id,
        sourceAudioArtifactId: a2aRequest.sourceAudioArtifactId,
        operation: a2aRequest.operation,
        provider: 'internal',
        evidence: { evidenceSource: 'internal_ffmpeg', liveProviderProof: false, operation: a2aRequest.operation },
        createdAt: job.createdAt.toISOString(),
      })
    } catch (error) {
      const message = error instanceof Error ? error.message : 'Internal server error'
      return reply.status(500).send({ error: message, code: 'INTERNAL_ERROR' })
    }
  })

  // Get audio-to-audio status
  app.get('/api/v1/audio-to-audio/:id', async (request: AuthenticatedRequest, reply: FastifyReply) => {
    try {
      const auth = await authenticateAppKey(request.headers.authorization)
      if (!auth.ok) return reply.status(auth.statusCode).send({ error: auth.error, code: 'AUTH_REQUIRED' })

      const appSlug = auth.app!.slug
      const { id } = request.params as { id: string }

      const job = await prisma.job.findFirst({ where: { id, appSlug, capability: 'audio_to_audio' } })
      if (!job) return reply.status(404).send({ error: 'Audio-to-audio execution not found', code: 'EXECUTION_NOT_FOUND' })

      const inputMeta = JSON.parse(job.metadataJson || '{}')
      return reply.send({
        status: job.status === 'completed' ? 'completed' : job.status === 'failed' ? 'failed' : job.status === 'cancelled' ? 'cancelled' : 'processing',
        audioToAudioId: job.id,
        sourceAudioArtifactId: inputMeta.sourceArtifactId ?? '',
        operation: inputMeta.operation ?? 'normalize',
        provider: job.provider ?? 'internal',
        outputArtifactId: job.artifactId ?? undefined,
        evidence: { evidenceSource: 'internal_ffmpeg', liveProviderProof: false, operation: inputMeta.operation ?? 'normalize' },
        createdAt: job.createdAt.toISOString(),
        completedAt: job.completedAt?.toISOString(),
        error: job.error ?? undefined,
      })
    } catch (error) {
      const message = error instanceof Error ? error.message : 'Internal server error'
      return reply.status(500).send({ error: message, code: 'INTERNAL_ERROR' })
    }
  })

  // Cancel audio-to-audio
  app.post('/api/v1/audio-to-audio/:id/cancel', async (request: AuthenticatedRequest, reply: FastifyReply) => {
    try {
      const auth = await authenticateAppKey(request.headers.authorization)
      if (!auth.ok) return reply.status(auth.statusCode).send({ error: auth.error, code: 'AUTH_REQUIRED' })

      const appSlug = auth.app!.slug
      const { id } = request.params as { id: string }

      const result = await prisma.job.updateMany({
        where: { id, appSlug, capability: 'audio_to_audio', status: { in: ['queued', 'processing'] } },
        data: { status: 'cancelled', completedAt: new Date(), error: 'Cancelled by app' },
      })
      if (!result.count) return reply.status(409).send({ error: 'Audio-to-audio execution not found, already terminal, or belongs to another app', code: 'EXECUTION_NOT_CANCELLABLE' })

      return reply.send({ status: 'cancelled', audioToAudioId: id, message: 'Audio-to-audio operation cancelled' })
    } catch (error) {
      const message = error instanceof Error ? error.message : 'Internal server error'
      return reply.status(500).send({ error: message, code: 'INTERNAL_ERROR' })
    }
  })

  // Get audio-to-audio evidence
  app.get('/api/v1/audio-to-audio/:id/evidence', async (request: AuthenticatedRequest, reply: FastifyReply) => {
    try {
      const auth = await authenticateAppKey(request.headers.authorization)
      if (!auth.ok) return reply.status(auth.statusCode).send({ error: auth.error, code: 'AUTH_REQUIRED' })

      const appSlug = auth.app!.slug
      const { id } = request.params as { id: string }

      const job = await prisma.job.findFirst({ where: { id, appSlug, capability: 'audio_to_audio' } })
      if (!job) return reply.status(404).send({ error: 'Audio-to-audio execution not found', code: 'EXECUTION_NOT_FOUND' })

      const inputMeta = JSON.parse(job.metadataJson || '{}')
      return reply.send({
        audioToAudioId: id,
        evidence: {
          evidenceSource: 'internal_ffmpeg',
          liveProviderProof: false,
          operation: inputMeta.operation ?? 'normalize',
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
