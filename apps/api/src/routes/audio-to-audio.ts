/**
 * Audio-to-Audio Routes — isolated API routes for audio transformation operations.
 *
 * Uses real authentication, artifact authorization, and domain services.
 * Internal FFmpeg operations (trim, resample, channel_convert, loudness_normalize,
 * normalize) execute real FFmpeg commands.
 */

import type { FastifyInstance, FastifyRequest, FastifyReply } from 'fastify'
import { prisma } from '@amarktai/db'
import {
  createAudioToAudioDomainService,
  createFixtureAudioToAudioProviderAdapter,
  type AudioToAudioResult,
} from '@amarktai/core/audio-to-audio-contracts'
import { authenticateAppKey } from './jobs.js'

// ── Types ─────────────────────────────────────────────────────────────────────

interface AuthenticatedRequest extends FastifyRequest {
  auth?: Awaited<ReturnType<typeof authenticateAppKey>>
}

// ── Persistence Helpers ───────────────────────────────────────────────────────

async function loadArtifactForApp(artifactId: string, appSlug: string) {
  return prisma.artifact.findFirst({
    where: { id: artifactId, appSlug },
  })
}

async function findExistingExecution(appSlug: string, idempotencyKey: string) {
  return prisma.job.findFirst({
    where: {
      appSlug,
      capability: 'audio_to_audio',
      metadataJson: { contains: idempotencyKey },
      status: { in: ['queued', 'processing', 'completed'] },
    },
    orderBy: { createdAt: 'desc' },
  })
}

// ── Route Registration ────────────────────────────────────────────────────────

export function registerAudioToAudioRoutes(app: FastifyInstance): void {
  // Submit audio-to-audio operation
  app.post('/api/v1/audio-to-audio', async (request: AuthenticatedRequest, reply: FastifyReply) => {
    try {
      const auth = await authenticateAppKey(request.headers.authorization)
      if (!auth.ok) {
        return reply.status(auth.statusCode).send({
          error: auth.error,
          code: 'AUTH_REQUIRED',
        })
      }

      const appSlug = auth.app!.slug
      const allowedCaps = auth.allowedCapabilities ?? []
      if (!allowedCaps.includes('audio_to_audio')) {
        return reply.status(403).send({
          error: 'App does not have audio_to_audio capability grant',
          code: 'CAPABILITY_GRANT_DENIED',
        })
      }

      const domainService = createAudioToAudioDomainService(createFixtureAudioToAudioProviderAdapter())
      const validation = domainService.validateRequest(request.body)
      if (!validation.success) {
        return reply.status(400).send({
          error: validation.error,
          code: 'VALIDATION_FAILED',
          issues: validation.issues,
        })
      }

      const a2aRequest = validation.data!

      // Check idempotency
      if (a2aRequest.idempotencyKey) {
        const existing = await findExistingExecution(appSlug, a2aRequest.idempotencyKey)
        if (existing) {
          return reply.status(200).send({
            status: existing.status,
            audioToAudioId: existing.id,
            sourceAudioArtifactId: a2aRequest.sourceAudioArtifactId,
            operation: a2aRequest.operation,
            provider: existing.provider ?? 'internal',
            evidence: {
              evidenceSource: 'local_fixture',
              liveProviderProof: false,
              operation: a2aRequest.operation,
              idempotent: true,
            },
            createdAt: existing.createdAt.toISOString(),
            completedAt: existing.completedAt?.toISOString(),
          })
        }
      }

      // Load source artifact with ownership check
      const sourceArtifact = await loadArtifactForApp(a2aRequest.sourceAudioArtifactId, appSlug)
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

      // Create job for async execution
      const job = await prisma.job.create({
        data: {
          appSlug,
          capability: 'audio_to_audio',
          prompt: `Audio ${a2aRequest.operation} from artifact ${a2aRequest.sourceAudioArtifactId}`,
          inputJson: JSON.stringify(a2aRequest),
          metadataJson: JSON.stringify({
            ...a2aRequest.metadata,
            idempotencyKey: a2aRequest.idempotencyKey,
            sourceArtifactId: a2aRequest.sourceAudioArtifactId,
            operation: a2aRequest.operation,
          }),
          traceId: crypto.randomUUID(),
          status: 'queued',
          provider: 'internal',
          model: a2aRequest.operation,
        },
      })

      const result: AudioToAudioResult = {
        status: 'accepted',
        audioToAudioId: job.id,
        sourceAudioArtifactId: a2aRequest.sourceAudioArtifactId,
        operation: a2aRequest.operation,
        provider: 'internal',
        evidence: {
          evidenceSource: 'internal_ffmpeg',
          liveProviderProof: false,
          operation: a2aRequest.operation,
        },
        createdAt: job.createdAt.toISOString(),
      }

      return reply.status(202).send(result)
    } catch (error) {
      const message = error instanceof Error ? error.message : 'Internal server error'
      return reply.status(500).send({ error: message, code: 'INTERNAL_ERROR' })
    }
  })

  // Get audio-to-audio status
  app.get('/api/v1/audio-to-audio/:id', async (request: AuthenticatedRequest, reply: FastifyReply) => {
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
        where: { id, appSlug, capability: 'audio_to_audio' },
      })

      if (!job) {
        return reply.status(404).send({
          error: 'Audio-to-audio execution not found',
          code: 'EXECUTION_NOT_FOUND',
        })
      }

      const inputMeta = JSON.parse(job.metadataJson || '{}')

      const result: AudioToAudioResult = {
        status: job.status === 'completed' ? 'completed' :
          job.status === 'failed' ? 'failed' :
          job.status === 'cancelled' ? 'cancelled' : 'processing',
        audioToAudioId: job.id,
        sourceAudioArtifactId: inputMeta.sourceArtifactId ?? '',
        operation: inputMeta.operation ?? 'normalize',
        provider: job.provider ?? 'internal',
        evidence: {
          evidenceSource: 'internal_ffmpeg',
          liveProviderProof: false,
          operation: inputMeta.operation ?? 'normalize',
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

  // Get audio-to-audio evidence
  app.get('/api/v1/audio-to-audio/:id/evidence', async (request: AuthenticatedRequest, reply: FastifyReply) => {
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
        where: { id, appSlug, capability: 'audio_to_audio' },
      })

      if (!job) {
        return reply.status(404).send({
          error: 'Audio-to-audio execution not found',
          code: 'EXECUTION_NOT_FOUND',
        })
      }

      const inputMeta = JSON.parse(job.metadataJson || '{}')

      return reply.send({
        audioToAudioId: id,
        evidence: {
          evidenceSource: 'internal_ffmpeg',
          liveProviderProof: false,
          operation: inputMeta.operation ?? 'normalize',
          providerSelected: job.provider ?? 'internal',
          status: job.status,
          output: job.output,
        },
      })
    } catch (error) {
      const message = error instanceof Error ? error.message : 'Internal server error'
      return reply.status(500).send({ error: message, code: 'INTERNAL_ERROR' })
    }
  })
}
