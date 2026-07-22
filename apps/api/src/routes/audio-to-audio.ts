/**
 * Audio-to-Audio Routes — governed durable audio transformations.
 *
 * Executable internal operations use the canonical job queue and the central
 * worker. Unsupported operations fail closed before queue submission and are
 * never represented as fixture or live-provider proof.
 */

import { randomUUID } from 'node:crypto'
import type { FastifyInstance, FastifyRequest, FastifyReply } from 'fastify'
import { Queue } from 'bullmq'
import { prisma } from '@amarktai/db'
import {
  DEFAULT_JOB_OPTIONS,
  QUEUE_NAMES,
  durableIdempotencyTrace,
  type JobPayload,
  type CapabilityKey,
} from '@amarktai/core'
import { hasVoiceAvatarBlockedOverrides } from '@amarktai/core/voice-avatar-platform'
import {
  createAudioToAudioDomainService,
  type AudioToAudioOperation,
} from '@amarktai/core/audio-to-audio-contracts'
import { authenticateAppKey } from './jobs.js'
import { resolveAppCapabilityGrantSnapshot } from '../lib/app-grant-loader.js'

interface AuthenticatedRequest extends FastifyRequest {
  auth?: Awaited<ReturnType<typeof authenticateAppKey>>
}

const INTERNAL_FFMPEG_OPERATIONS = new Set<AudioToAudioOperation>([
  'trim',
  'resample',
  'channel_convert',
  'loudness_normalize',
  'normalize',
])

async function findIdempotentJob(appSlug: string, capability: string, traceId: string) {
  return prisma.job.findFirst({
    where: { appSlug, capability, traceId },
    orderBy: { createdAt: 'desc' },
  })
}

function statusView(status: string): string {
  if (status === 'completed' || status === 'failed' || status === 'cancelled') return status
  return status === 'queued' ? 'accepted' : 'processing'
}

function safeMetadata(value: string | null | undefined): Record<string, unknown> {
  try {
    const parsed = JSON.parse(value || '{}')
    return parsed && typeof parsed === 'object' && !Array.isArray(parsed) ? parsed as Record<string, unknown> : {}
  } catch {
    return {}
  }
}

export async function registerAudioToAudioRoutes(app: FastifyInstance): Promise<void> {
  let queue: Queue | null = null
  function getQueue(): Queue {
    if (!queue) {
      if (!app.redis) throw new Error('Redis is required for audio-to-audio queue')
      queue = new Queue(QUEUE_NAMES.JOBS, { connection: app.redis as never })
    }
    return queue
  }

  app.post('/api/v1/audio-to-audio', async (request: AuthenticatedRequest, reply: FastifyReply) => {
    try {
      const auth = await authenticateAppKey(request.headers.authorization)
      if (!auth.ok) return reply.status(auth.statusCode).send({ error: auth.error, code: 'AUTH_REQUIRED' })
      const appSlug = auth.app!.slug

      const body = request.body as Record<string, unknown>
      const blockedField = hasVoiceAvatarBlockedOverrides(body)
        || hasVoiceAvatarBlockedOverrides((body.metadata ?? {}) as Record<string, unknown>)
      if (blockedField) {
        return reply.status(400).send({
          error: `Field '${blockedField}' is not allowed. Provider selection is owned by the AmarktAI Network.`,
          code: 'BLOCKED_FIELD',
        })
      }

      const grantResolution = await resolveAppCapabilityGrantSnapshot(
        appSlug,
        'audio_to_audio' as CapabilityKey,
        auth.allowedCapabilities ?? [],
      )
      if (!grantResolution || !grantResolution.grant.enabled) {
        return reply.status(403).send({ error: 'App does not have audio_to_audio capability grant', code: 'CAPABILITY_GRANT_DENIED' })
      }
      if (!grantResolution.grant.artifactRead || !grantResolution.grant.artifactWrite) {
        return reply.status(403).send({ error: 'App capability grant denies artifact read/write for audio_to_audio', code: 'GRANT_DENIED' })
      }

      const domainService = createAudioToAudioDomainService()
      const validation = domainService.validateRequest(request.body)
      if (!validation.success) {
        return reply.status(400).send({ error: validation.error, code: 'VALIDATION_FAILED', issues: validation.issues })
      }
      const audioRequest = validation.data!
      const idempotencyKey = audioRequest.idempotencyKey ?? `auto_${randomUUID()}`
      const traceId = durableIdempotencyTrace(appSlug, 'audio_to_audio', idempotencyKey)
      const existing = await findIdempotentJob(appSlug, 'audio_to_audio', traceId)
      if (existing) {
        const existingMetadata = safeMetadata(existing.metadataJson)
        return reply.status(200).send({
          status: statusView(existing.status),
          audioToAudioId: existing.id,
          sourceAudioArtifactId: existingMetadata.sourceArtifactId ?? audioRequest.sourceAudioArtifactId,
          operation: existingMetadata.operation ?? audioRequest.operation,
          provider: existing.provider ?? (existing.status === 'completed' ? 'internal' : undefined),
          outputArtifactId: existing.artifactId ?? undefined,
          evidence: {
            evidenceSource: existing.status === 'failed' ? 'executor_unavailable' : 'internal_ffmpeg',
            liveProviderProof: false,
            operation: existingMetadata.operation ?? audioRequest.operation,
            idempotent: true,
          },
          createdAt: existing.createdAt.toISOString(),
          completedAt: existing.completedAt?.toISOString(),
          error: existing.error ?? undefined,
        })
      }

      const sourceArtifact = await prisma.artifact.findFirst({
        where: { id: audioRequest.sourceAudioArtifactId, appSlug, status: 'completed' },
      })
      if (!sourceArtifact) {
        return reply.status(404).send({ error: 'Source audio artifact not found or not accessible', code: 'ARTIFACT_NOT_FOUND' })
      }
      if (sourceArtifact.type !== 'audio' && !sourceArtifact.mimeType.startsWith('audio/')) {
        return reply.status(400).send({ error: 'Source artifact must be a completed audio artifact', code: 'INVALID_ARTIFACT_TYPE' })
      }

      const now = new Date()
      const immutableMetadata = {
        ...audioRequest.metadata,
        executionProfile: 'external_app',
        idempotencyKey,
        sourceArtifactId: audioRequest.sourceAudioArtifactId,
        operation: audioRequest.operation,
        parameters: audioRequest.parameters,
        outputFormat: audioRequest.outputFormat,
        intendedUse: audioRequest.intendedUse,
        maxCredits: audioRequest.maxCredits ?? null,
        appGrantSnapshot: grantResolution.grant,
        appGrantSnapshotSource: grantResolution.source,
        appGrantSnapshotAt: now.toISOString(),
      }

      if (!INTERNAL_FFMPEG_OPERATIONS.has(audioRequest.operation)) {
        const blocker = audioRequest.operation === 'voice_conversion'
          ? 'VOICE_CONVERSION_PROVIDER_ROUTE_UNAVAILABLE'
          : 'AUDIO_OPERATION_EXECUTOR_UNAVAILABLE'
        const message = audioRequest.operation === 'voice_conversion'
          ? 'No production voice-conversion provider route is currently configured.'
          : `No production executor is currently registered for audio operation '${audioRequest.operation}'.`
        const blocked = await prisma.job.create({
          data: {
            appSlug,
            capability: 'audio_to_audio',
            prompt: `Audio ${audioRequest.operation} from artifact ${audioRequest.sourceAudioArtifactId}`,
            inputJson: JSON.stringify(audioRequest),
            metadataJson: JSON.stringify({
              ...immutableMetadata,
              executionEvidence: {
                evidenceSource: 'executor_unavailable',
                liveProviderProof: false,
                blocker,
                operation: audioRequest.operation,
              },
            }),
            traceId,
            status: 'failed',
            provider: null,
            model: null,
            error: `${blocker}: ${message}`,
            completedAt: now,
          },
        })
        return reply.status(422).send({
          status: 'failed',
          audioToAudioId: blocked.id,
          sourceAudioArtifactId: audioRequest.sourceAudioArtifactId,
          operation: audioRequest.operation,
          evidence: { evidenceSource: 'executor_unavailable', liveProviderProof: false, blocker, operation: audioRequest.operation },
          error: blocked.error,
          errorCode: blocker,
          createdAt: blocked.createdAt.toISOString(),
          completedAt: blocked.completedAt?.toISOString(),
        })
      }

      const job = await prisma.job.create({
        data: {
          appSlug,
          capability: 'audio_to_audio',
          prompt: `Audio ${audioRequest.operation} from artifact ${audioRequest.sourceAudioArtifactId}`,
          inputJson: JSON.stringify(audioRequest),
          metadataJson: JSON.stringify(immutableMetadata),
          traceId,
          status: 'queued',
        },
      })

      const payload: JobPayload = {
        jobId: job.id,
        appSlug,
        capability: 'audio_to_audio',
        executionProfile: 'external_app',
        prompt: job.prompt,
        input: {
          sourceAudioArtifactId: audioRequest.sourceAudioArtifactId,
          operation: audioRequest.operation,
          parameters: audioRequest.parameters,
          outputFormat: audioRequest.outputFormat,
        },
        metadata: immutableMetadata,
        traceId,
        routingMode: 'balanced',
        appGrantSnapshot: grantResolution.grant,
      }

      try {
        await getQueue().add('process', payload, { ...DEFAULT_JOB_OPTIONS, jobId: job.id })
        await prisma.job.update({
          where: { id: job.id },
          data: { queueJobId: job.id, queuedAt: new Date() },
        })
      } catch (error) {
        const message = error instanceof Error ? error.message : 'Failed to enqueue job'
        await prisma.job.update({
          where: { id: job.id },
          data: { status: 'failed', error: message, completedAt: new Date() },
        })
        app.log.error({ error }, 'Failed to push audio_to_audio job to queue')
        return reply.status(500).send({ error: 'Failed to enqueue job', code: 'QUEUE_SUBMISSION_FAILED' })
      }

      return reply.status(202).send({
        status: 'accepted',
        audioToAudioId: job.id,
        sourceAudioArtifactId: audioRequest.sourceAudioArtifactId,
        operation: audioRequest.operation,
        provider: 'internal',
        evidence: { evidenceSource: 'internal_ffmpeg', liveProviderProof: false, operation: audioRequest.operation },
        createdAt: job.createdAt.toISOString(),
      })
    } catch (error) {
      const message = error instanceof Error ? error.message : 'Internal server error'
      return reply.status(500).send({ error: message, code: 'INTERNAL_ERROR' })
    }
  })

  app.get('/api/v1/audio-to-audio/:id', async (request: AuthenticatedRequest, reply: FastifyReply) => {
    try {
      const auth = await authenticateAppKey(request.headers.authorization)
      if (!auth.ok) return reply.status(auth.statusCode).send({ error: auth.error, code: 'AUTH_REQUIRED' })
      const { id } = request.params as { id: string }
      const job = await prisma.job.findFirst({ where: { id, appSlug: auth.app!.slug, capability: 'audio_to_audio' } })
      if (!job) return reply.status(404).send({ error: 'Audio-to-audio execution not found', code: 'EXECUTION_NOT_FOUND' })
      const metadata = safeMetadata(job.metadataJson)
      const executionEvidence = metadata.executionEvidence && typeof metadata.executionEvidence === 'object'
        ? metadata.executionEvidence as Record<string, unknown>
        : {}
      return reply.send({
        status: statusView(job.status),
        audioToAudioId: job.id,
        sourceAudioArtifactId: metadata.sourceArtifactId ?? '',
        operation: metadata.operation ?? 'normalize',
        provider: job.provider ?? (job.status === 'completed' ? 'internal' : undefined),
        outputArtifactId: job.artifactId ?? undefined,
        evidence: {
          evidenceSource: executionEvidence.evidenceSource ?? (job.status === 'failed' ? 'executor_unavailable' : 'internal_ffmpeg'),
          liveProviderProof: false,
          operation: metadata.operation ?? 'normalize',
          blocker: executionEvidence.blocker,
        },
        createdAt: job.createdAt.toISOString(),
        completedAt: job.completedAt?.toISOString(),
        error: job.error ?? undefined,
      })
    } catch (error) {
      const message = error instanceof Error ? error.message : 'Internal server error'
      return reply.status(500).send({ error: message, code: 'INTERNAL_ERROR' })
    }
  })

  app.post('/api/v1/audio-to-audio/:id/cancel', async (request: AuthenticatedRequest, reply: FastifyReply) => {
    try {
      const auth = await authenticateAppKey(request.headers.authorization)
      if (!auth.ok) return reply.status(auth.statusCode).send({ error: auth.error, code: 'AUTH_REQUIRED' })
      const { id } = request.params as { id: string }
      const result = await prisma.job.updateMany({
        where: { id, appSlug: auth.app!.slug, capability: 'audio_to_audio', status: { in: ['queued', 'processing'] } },
        data: { status: 'cancelled', completedAt: new Date(), error: 'Cancelled by app' },
      })
      if (!result.count) return reply.status(409).send({ error: 'Audio-to-audio execution not found, already terminal, or belongs to another app', code: 'EXECUTION_NOT_CANCELLABLE' })
      return reply.send({ status: 'cancelled', audioToAudioId: id, message: 'Audio-to-audio operation cancelled' })
    } catch (error) {
      const message = error instanceof Error ? error.message : 'Internal server error'
      return reply.status(500).send({ error: message, code: 'INTERNAL_ERROR' })
    }
  })

  app.get('/api/v1/audio-to-audio/:id/evidence', async (request: AuthenticatedRequest, reply: FastifyReply) => {
    try {
      const auth = await authenticateAppKey(request.headers.authorization)
      if (!auth.ok) return reply.status(auth.statusCode).send({ error: auth.error, code: 'AUTH_REQUIRED' })
      const { id } = request.params as { id: string }
      const job = await prisma.job.findFirst({ where: { id, appSlug: auth.app!.slug, capability: 'audio_to_audio' } })
      if (!job) return reply.status(404).send({ error: 'Audio-to-audio execution not found', code: 'EXECUTION_NOT_FOUND' })
      const metadata = safeMetadata(job.metadataJson)
      const executionEvidence = metadata.executionEvidence && typeof metadata.executionEvidence === 'object'
        ? metadata.executionEvidence as Record<string, unknown>
        : {}
      return reply.send({
        audioToAudioId: id,
        evidence: {
          evidenceSource: executionEvidence.evidenceSource ?? (job.status === 'failed' ? 'executor_unavailable' : 'internal_ffmpeg'),
          liveProviderProof: false,
          operation: metadata.operation ?? 'normalize',
          blocker: executionEvidence.blocker,
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
