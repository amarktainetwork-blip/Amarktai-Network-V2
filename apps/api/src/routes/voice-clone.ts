/**
 * Voice Clone Routes — isolated API routes for voice clone operations.
 *
 * Uses canonical queue configuration, deterministic trace idempotency,
 * real Voice Profile governance with evaluateVoiceProfileRights, and
 * truthful provider blockers. Does not enqueue known blockers.
 */

import { randomUUID, createHash } from 'node:crypto'
import type { FastifyInstance, FastifyRequest, FastifyReply } from 'fastify'
import { prisma } from '@amarktai/db'
import {
  type CapabilityKey,
} from '@amarktai/core'
import {
  hasVoiceAvatarBlockedOverrides,
  evaluateVoiceProfileRights,
  type VoiceAvatarUseScope,
} from '@amarktai/core/voice-avatar-platform'
import { authenticateAppKey } from './jobs.js'
import { getVoiceProfile } from '../lib/voice-avatar-profile-store.js'
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

export async function registerVoiceCloneRoutes(app: FastifyInstance): Promise<void> {
  // Submit voice clone
  app.post('/api/v1/voice-clone', async (request: AuthenticatedRequest, reply: FastifyReply) => {
    try {
      // 1. Authenticate
      const auth = await authenticateAppKey(request.headers.authorization)
      if (!auth.ok) {
        return reply.status(auth.statusCode).send({ error: auth.error, code: 'AUTH_REQUIRED' })
      }

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
        appSlug, 'voice_clone' as CapabilityKey, auth.allowedCapabilities ?? [],
      )
      if (!grantResolution || !grantResolution.grant.enabled) {
        return reply.status(403).send({ error: 'App does not have voice_clone capability grant', code: 'CAPABILITY_GRANT_DENIED' })
      }
      if (!grantResolution.grant.artifactRead) {
        return reply.status(403).send({ error: 'App capability grant denies source-artifact read for voice_clone', code: 'GRANT_DENIED' })
      }

      // 4. Validate request
      const { createVoiceCloneDomainService } = await import('@amarktai/core/voice-clone-contracts')
      const domainService = createVoiceCloneDomainService()
      const validation = domainService.validateRequest(request.body)
      if (!validation.success) {
        return reply.status(400).send({ error: validation.error, code: 'VALIDATION_FAILED', issues: validation.issues })
      }
      const cloneRequest = validation.data!

      // 5. Deterministic trace idempotency
      const idempotencyKey = cloneRequest.idempotencyKey ?? `auto_${randomUUID()}`
      const traceId = durableIdempotencyTrace(appSlug, 'voice_clone', idempotencyKey)
      const existing = await findIdempotentJob(appSlug, 'voice_clone', traceId)
      if (existing) {
        return reply.status(200).send({
          status: existing.status,
          voiceCloneId: existing.id,
          voiceProfileId: cloneRequest.voiceProfileId,
          provider: existing.provider ?? undefined,
          evidence: { evidenceSource: 'platform_policy', liveProviderProof: false, idempotent: true },
          createdAt: existing.createdAt.toISOString(),
          completedAt: existing.completedAt?.toISOString(),
        })
      }

      // 6. Load source artifact with ownership check
      const sourceArtifact = await prisma.artifact.findFirst({
        where: { id: cloneRequest.sourceAudioArtifactId, appSlug },
      })
      if (!sourceArtifact) {
        return reply.status(404).send({ error: 'Source audio artifact not found or not accessible', code: 'ARTIFACT_NOT_FOUND' })
      }
      if (sourceArtifact.type !== 'audio' && !sourceArtifact.mimeType.startsWith('audio/')) {
        return reply.status(400).send({ error: 'Source artifact must be an audio artifact', code: 'INVALID_ARTIFACT_TYPE' })
      }

      // 7. Load real Voice Profile with full governance
      const voiceProfile = await getVoiceProfile(appSlug, cloneRequest.voiceProfileId)
      if (!voiceProfile) {
        return reply.status(404).send({ error: 'Voice profile not found or not accessible', code: 'VOICE_PROFILE_NOT_FOUND' })
      }
      if (voiceProfile.appSlug !== appSlug) {
        return reply.status(403).send({ error: 'Voice profile does not belong to this application', code: 'CROSS_APP_PROFILE_DENIED' })
      }

      // 8. Full rights enforcement using canonical evaluator
      const rightsDecision = evaluateVoiceProfileRights({
        profile: voiceProfile,
        intendedUse: cloneRequest.intendedUse as VoiceAvatarUseScope,
      })
      if (!rightsDecision.allowed) {
        return reply.status(422).send({
          error: `Voice profile rights check failed: ${rightsDecision.reasons.join('; ')}`,
          code: 'RIGHTS_CHECK_FAILED',
          reasons: rightsDecision.reasons,
        })
      }

      // 9. Resolve provider route availability — do NOT enqueue known blockers
      // Voice clone has no production provider route currently
      // Return blocked response immediately without creating a Job or enqueuing
      const blockerResult = {
        status: 'blocked_by_account_access' as const,
        voiceProfileId: cloneRequest.voiceProfileId,
        provider: 'amarktai-network',
        evidence: {
          evidenceSource: 'executor_unavailable' as const,
          liveProviderProof: false,
          blocker: 'VOICE_CLONE_PROVIDER_ROUTE_UNAVAILABLE',
          capability: 'voice_clone',
          appSlug,
          rightsSnapshot: { allowed: rightsDecision.allowed, reasons: rightsDecision.reasons },
          consentSnapshot: { reference: cloneRequest.consentEvidenceReference },
        },
        error: 'VOICE_CLONE_PROVIDER_ROUTE_UNAVAILABLE: No production voice clone provider route is currently configured.',
        errorCode: 'VOICE_CLONE_PROVIDER_ROUTE_UNAVAILABLE',
        createdAt: new Date().toISOString(),
      }

      return reply.status(422).send(blockerResult)
    } catch (error) {
      const message = error instanceof Error ? error.message : 'Internal server error'
      return reply.status(500).send({ error: message, code: 'INTERNAL_ERROR' })
    }
  })

  // Get voice clone status
  app.get('/api/v1/voice-clone/:id', async (request: AuthenticatedRequest, reply: FastifyReply) => {
    try {
      const auth = await authenticateAppKey(request.headers.authorization)
      if (!auth.ok) return reply.status(auth.statusCode).send({ error: auth.error, code: 'AUTH_REQUIRED' })

      const appSlug = auth.app!.slug
      const { id } = request.params as { id: string }

      const job = await prisma.job.findFirst({ where: { id, appSlug, capability: 'voice_clone' } })
      if (!job) return reply.status(404).send({ error: 'Voice clone execution not found', code: 'EXECUTION_NOT_FOUND' })

      const inputMeta = JSON.parse(job.metadataJson || '{}')
      return reply.send({
        status: job.status === 'completed' ? 'completed' : job.status === 'failed' ? 'failed' : job.status === 'cancelled' ? 'cancelled' : 'processing',
        voiceCloneId: job.id,
        voiceProfileId: inputMeta.voiceProfileId ?? '',
        provider: job.provider ?? undefined,
        outputArtifactId: job.artifactId ?? undefined,
        evidence: { evidenceSource: 'executor_unavailable', liveProviderProof: false },
        createdAt: job.createdAt.toISOString(),
        completedAt: job.completedAt?.toISOString(),
        error: job.error ?? undefined,
      })
    } catch (error) {
      const message = error instanceof Error ? error.message : 'Internal server error'
      return reply.status(500).send({ error: message, code: 'INTERNAL_ERROR' })
    }
  })

  // Cancel voice clone
  app.post('/api/v1/voice-clone/:id/cancel', async (request: AuthenticatedRequest, reply: FastifyReply) => {
    try {
      const auth = await authenticateAppKey(request.headers.authorization)
      if (!auth.ok) return reply.status(auth.statusCode).send({ error: auth.error, code: 'AUTH_REQUIRED' })

      const appSlug = auth.app!.slug
      const { id } = request.params as { id: string }

      const result = await prisma.job.updateMany({
        where: { id, appSlug, capability: 'voice_clone', status: { in: ['queued', 'processing'] } },
        data: { status: 'cancelled', completedAt: new Date(), error: 'Cancelled by app' },
      })
      if (!result.count) return reply.status(409).send({ error: 'Voice clone execution not found, already terminal, or belongs to another app', code: 'EXECUTION_NOT_CANCELLABLE' })

      return reply.send({ status: 'cancelled', voiceCloneId: id, message: 'Voice clone operation cancelled' })
    } catch (error) {
      const message = error instanceof Error ? error.message : 'Internal server error'
      return reply.status(500).send({ error: message, code: 'INTERNAL_ERROR' })
    }
  })
}
