/**
 * Voice Clone Routes — isolated API routes for voice clone operations.
 *
 * Uses real authentication, Voice Profile governance, artifact authorization,
 * BullMQ queue submission, and exact idempotency. Voice clone returns truthful
 * provider-route blockers when no production provider route exists.
 */

import { randomUUID } from 'node:crypto'
import type { FastifyInstance, FastifyRequest, FastifyReply } from 'fastify'
import { Queue } from 'bullmq'
import { prisma } from '@amarktai/db'
import { DEFAULT_JOB_OPTIONS, type JobPayload, type CapabilityKey } from '@amarktai/core'
import {
  createVoiceCloneDomainService,
  type VoiceCloneResult,
} from '@amarktai/core/voice-clone-contracts'
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

export function registerVoiceCloneRoutes(app: FastifyInstance): void {
  // Submit voice clone
  app.post('/api/v1/voice-clone', async (request: AuthenticatedRequest, reply: FastifyReply) => {
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
        'voice_clone' as CapabilityKey,
        auth.allowedCapabilities ?? [],
      )
      if (!grantResolution || !grantResolution.grant.enabled) {
        return reply.status(403).send({
          error: 'App does not have voice_clone capability grant',
          code: 'CAPABILITY_GRANT_DENIED',
        })
      }

      if (!grantResolution.grant.artifactRead) {
        return reply.status(403).send({
          error: 'App capability grant denies source-artifact read for voice_clone',
          code: 'GRANT_DENIED',
        })
      }

      // 3. Validate request
      const domainService = createVoiceCloneDomainService()
      const validation = domainService.validateRequest(request.body)
      if (!validation.success) {
        return reply.status(400).send({
          error: validation.error,
          code: 'VALIDATION_FAILED',
          issues: validation.issues,
        })
      }

      const cloneRequest = validation.data!

      // 4. Check idempotency (exact app-scoped match)
      if (cloneRequest.idempotencyKey) {
        const existing = await findIdempotentJob(appSlug, 'voice_clone', cloneRequest.idempotencyKey)
        if (existing) {
          return reply.status(200).send({
            status: existing.status,
            voiceCloneId: existing.id,
            voiceProfileId: cloneRequest.voiceProfileId,
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
        where: { id: cloneRequest.sourceAudioArtifactId, appSlug },
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
      const voiceProfile = await getVoiceProfile(appSlug, cloneRequest.voiceProfileId)
      if (!voiceProfile) {
        return reply.status(404).send({
          error: 'Voice profile not found or not accessible',
          code: 'VOICE_PROFILE_NOT_FOUND',
        })
      }

      // Enforce profile ownership
      if (voiceProfile.appSlug !== appSlug) {
        return reply.status(403).send({
          error: 'Voice profile does not belong to this application',
          code: 'CROSS_APP_PROFILE_DENIED',
        })
      }

      // Enforce profile lifecycle
      if (voiceProfile.status === 'draft') {
        return reply.status(422).send({
          error: 'Voice profile is in draft status',
          code: 'PROFILE_NOT_VERIFIED',
        })
      }
      if (voiceProfile.status === 'revoked') {
        return reply.status(422).send({
          error: 'Voice profile has been revoked',
          code: 'PROFILE_REVOKED',
        })
      }
      if (voiceProfile.status === 'archived') {
        return reply.status(422).send({
          error: 'Voice profile has been archived',
          code: 'PROFILE_ARCHIVED',
        })
      }

      // Enforce rights status
      if (voiceProfile.rightsStatus !== 'verified') {
        return reply.status(422).send({
          error: `Voice profile rights status is '${voiceProfile.rightsStatus}', requires 'verified'`,
          code: 'RIGHTS_NOT_VERIFIED',
        })
      }

      // 7. Create durable Job record
      const traceId = `trace_${randomUUID()}`
      const job = await prisma.job.create({
        data: {
          appSlug,
          capability: 'voice_clone',
          prompt: `Voice clone from artifact ${cloneRequest.sourceAudioArtifactId}`,
          inputJson: JSON.stringify(cloneRequest),
          metadataJson: JSON.stringify({
            idempotencyKey: cloneRequest.idempotencyKey,
            sourceArtifactId: cloneRequest.sourceAudioArtifactId,
            voiceProfileId: cloneRequest.voiceProfileId,
            intendedUse: cloneRequest.intendedUse,
            consentEvidenceReference: cloneRequest.consentEvidenceReference,
            rightsDeclarationReference: cloneRequest.rightsDeclarationReference,
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
        capability: 'voice_clone',
        executionProfile: 'external_app',
        prompt: `Voice clone from artifact ${cloneRequest.sourceAudioArtifactId}`,
        input: {
          sourceAudioArtifactId: cloneRequest.sourceAudioArtifactId,
          voiceProfileId: cloneRequest.voiceProfileId,
          language: cloneRequest.language,
          intendedUse: cloneRequest.intendedUse,
        },
        metadata: {
          idempotencyKey: cloneRequest.idempotencyKey,
          consentEvidenceReference: cloneRequest.consentEvidenceReference,
          rightsDeclarationReference: cloneRequest.rightsDeclarationReference,
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
        app.log.error({ err }, 'Failed to push voice_clone job to queue')
        return reply.status(500).send({ error: 'Failed to enqueue job', code: 'QUEUE_SUBMISSION_FAILED' })
      }

      const result: VoiceCloneResult = {
        status: 'accepted',
        voiceCloneId: job.id,
        voiceProfileId: cloneRequest.voiceProfileId,
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

  // Get voice clone status
  app.get('/api/v1/voice-clone/:id', async (request: AuthenticatedRequest, reply: FastifyReply) => {
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
        where: { id, appSlug, capability: 'voice_clone' },
      })

      if (!job) {
        return reply.status(404).send({
          error: 'Voice clone execution not found',
          code: 'EXECUTION_NOT_FOUND',
        })
      }

      const inputMeta = JSON.parse(job.metadataJson || '{}')

      const result: VoiceCloneResult = {
        status: job.status === 'completed' ? 'completed' :
          job.status === 'failed' ? 'failed' :
          job.status === 'cancelled' ? 'cancelled' : 'processing',
        voiceCloneId: job.id,
        voiceProfileId: inputMeta.voiceProfileId ?? '',
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

  // Cancel voice clone
  app.post('/api/v1/voice-clone/:id/cancel', async (request: AuthenticatedRequest, reply: FastifyReply) => {
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
          capability: 'voice_clone',
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
          error: 'Voice clone execution not found, already terminal, or belongs to another app',
          code: 'EXECUTION_NOT_CANCELLABLE',
        })
      }

      return reply.send({
        status: 'cancelled',
        voiceCloneId: id,
        message: 'Voice clone operation cancelled',
      })
    } catch (error) {
      const message = error instanceof Error ? error.message : 'Internal server error'
      return reply.status(500).send({ error: message, code: 'INTERNAL_ERROR' })
    }
  })

  // Get voice clone evidence
  app.get('/api/v1/voice-clone/:id/evidence', async (request: AuthenticatedRequest, reply: FastifyReply) => {
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
        where: { id, appSlug, capability: 'voice_clone' },
      })

      if (!job) {
        return reply.status(404).send({
          error: 'Voice clone execution not found',
          code: 'EXECUTION_NOT_FOUND',
        })
      }

      return reply.send({
        voiceCloneId: id,
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
