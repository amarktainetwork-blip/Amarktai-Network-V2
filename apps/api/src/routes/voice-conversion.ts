/**
 * Voice Conversion Routes — governed, durable, fail-closed conversion requests.
 *
 * Requests that pass authentication, grants, source ownership, and target Voice
 * Profile rights checks are persisted as terminal blockers until an approved
 * production executor exists. Known blockers are never queued.
 */

import { randomUUID } from 'node:crypto'
import type { FastifyInstance, FastifyRequest, FastifyReply } from 'fastify'
import { prisma } from '@amarktai/db'
import { type CapabilityKey } from '@amarktai/core'
import {
  hasVoiceAvatarBlockedOverrides,
  evaluateVoiceProfileRights,
  type VoiceAvatarUseScope,
} from '@amarktai/core/voice-avatar-platform'
import { authenticateAppKey } from './jobs.js'
import { getVoiceProfile } from '../lib/voice-avatar-profile-store.js'
import { resolveAppCapabilityGrantSnapshot } from '../lib/app-grant-loader.js'
import { persistBlockedCapabilityJob } from '../lib/blocked-capability-job.js'

interface AuthenticatedRequest extends FastifyRequest {
  auth?: Awaited<ReturnType<typeof authenticateAppKey>>
}

function safeMetadata(value: string | null | undefined): Record<string, unknown> {
  try {
    const parsed = JSON.parse(value || '{}')
    return parsed && typeof parsed === 'object' && !Array.isArray(parsed) ? parsed as Record<string, unknown> : {}
  } catch {
    return {}
  }
}

export async function registerVoiceConversionRoutes(app: FastifyInstance): Promise<void> {
  app.post('/api/v1/voice-conversion', async (request: AuthenticatedRequest, reply: FastifyReply) => {
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
        'voice_conversion' as CapabilityKey,
        auth.allowedCapabilities ?? [],
      )
      if (!grantResolution || !grantResolution.grant.enabled) {
        return reply.status(403).send({ error: 'App does not have voice_conversion capability grant', code: 'CAPABILITY_GRANT_DENIED' })
      }
      if (!grantResolution.grant.artifactRead) {
        return reply.status(403).send({ error: 'App capability grant denies source-artifact read for voice_conversion', code: 'GRANT_DENIED' })
      }

      const { createVoiceConversionDomainService } = await import('@amarktai/core/voice-conversion-contracts')
      const validation = createVoiceConversionDomainService().validateRequest(request.body)
      if (!validation.success) {
        return reply.status(400).send({ error: validation.error, code: 'VALIDATION_FAILED', issues: validation.issues })
      }
      const conversionRequest = validation.data!

      const sourceArtifact = await prisma.artifact.findFirst({
        where: { id: conversionRequest.sourceAudioArtifactId, appSlug, status: 'completed' },
      })
      if (!sourceArtifact) {
        return reply.status(404).send({ error: 'Source audio artifact not found or not accessible', code: 'ARTIFACT_NOT_FOUND' })
      }
      if (sourceArtifact.type !== 'audio' && !sourceArtifact.mimeType.startsWith('audio/')) {
        return reply.status(400).send({ error: 'Source artifact must be a completed audio artifact', code: 'INVALID_ARTIFACT_TYPE' })
      }

      const targetProfile = await getVoiceProfile(appSlug, conversionRequest.targetVoiceProfileId)
      if (!targetProfile) {
        return reply.status(404).send({ error: 'Target voice profile not found or not accessible', code: 'VOICE_PROFILE_NOT_FOUND' })
      }
      if (targetProfile.appSlug !== appSlug) {
        return reply.status(403).send({ error: 'Target voice profile does not belong to this application', code: 'CROSS_APP_PROFILE_DENIED' })
      }

      const rightsDecision = evaluateVoiceProfileRights({
        profile: targetProfile,
        intendedUse: conversionRequest.intendedUse as VoiceAvatarUseScope,
      })
      if (!rightsDecision.allowed) {
        return reply.status(422).send({
          error: `Voice profile rights check failed: ${rightsDecision.reasons.join('; ')}`,
          code: 'RIGHTS_CHECK_FAILED',
          reasons: rightsDecision.reasons,
        })
      }

      const idempotencyKey = conversionRequest.idempotencyKey ?? `auto_${randomUUID()}`
      const blocker = 'VOICE_CONVERSION_PROVIDER_ROUTE_UNAVAILABLE'
      const blockerMessage = 'No production voice conversion provider route is currently configured.'
      const persisted = await persistBlockedCapabilityJob({
        appSlug,
        capability: 'voice_conversion',
        prompt: `Governed voice conversion to profile ${conversionRequest.targetVoiceProfileId}`,
        requestInput: conversionRequest,
        idempotencyKey,
        blocker,
        message: blockerMessage,
        metadata: {
          ...conversionRequest.metadata,
          sourceArtifactId: conversionRequest.sourceAudioArtifactId,
          targetVoiceProfileId: conversionRequest.targetVoiceProfileId,
          intendedUse: conversionRequest.intendedUse,
          preserveTiming: conversionRequest.preserveTiming,
          preserveProsody: conversionRequest.preserveProsody,
          outputFormat: conversionRequest.outputFormat,
          qualityProfile: conversionRequest.qualityProfile,
          maxCredits: conversionRequest.maxCredits ?? null,
          appGrantSnapshot: grantResolution.grant,
          appGrantSnapshotSource: grantResolution.source,
          appGrantSnapshotAt: new Date().toISOString(),
          rightsSnapshot: {
            allowed: rightsDecision.allowed,
            reasons: rightsDecision.reasons,
            profileStatus: targetProfile.status,
            rightsStatus: targetProfile.rightsStatus,
            verifierReference: targetProfile.rightsDecision?.verifierReference ?? null,
            decidedAt: targetProfile.rightsDecision?.decidedAt ?? null,
          },
          consentSnapshot: targetProfile.consentEvidence ? {
            consentArtifactId: targetProfile.consentEvidence.consentArtifactId,
            sourceRecordingConsentArtifactId: targetProfile.consentEvidence.sourceRecordingConsentArtifactId ?? null,
            verifiedAt: targetProfile.consentEvidence.verifiedAt,
            expiresAt: targetProfile.consentEvidence.expiresAt ?? null,
            permittedUses: targetProfile.consentEvidence.permittedUses,
          } : null,
        },
      })

      return reply.status(422).send({
        status: 'failed',
        voiceConversionId: persisted.job.id,
        sourceAudioArtifactId: conversionRequest.sourceAudioArtifactId,
        targetVoiceProfileId: conversionRequest.targetVoiceProfileId,
        evidence: {
          evidenceSource: 'executor_unavailable',
          liveProviderProof: false,
          blocker,
          capability: 'voice_conversion',
          appSlug,
          idempotent: persisted.deduplicated,
          rightsSnapshot: { allowed: rightsDecision.allowed, reasons: rightsDecision.reasons },
        },
        error: persisted.job.error,
        errorCode: blocker,
        createdAt: persisted.job.createdAt.toISOString(),
        completedAt: persisted.job.completedAt?.toISOString(),
      })
    } catch (error) {
      const message = error instanceof Error ? error.message : 'Internal server error'
      return reply.status(500).send({ error: message, code: 'INTERNAL_ERROR' })
    }
  })

  app.get('/api/v1/voice-conversion/:id', async (request: AuthenticatedRequest, reply: FastifyReply) => {
    try {
      const auth = await authenticateAppKey(request.headers.authorization)
      if (!auth.ok) return reply.status(auth.statusCode).send({ error: auth.error, code: 'AUTH_REQUIRED' })
      const { id } = request.params as { id: string }
      const job = await prisma.job.findFirst({ where: { id, appSlug: auth.app!.slug, capability: 'voice_conversion' } })
      if (!job) return reply.status(404).send({ error: 'Voice conversion execution not found', code: 'EXECUTION_NOT_FOUND' })
      const metadata = safeMetadata(job.metadataJson)
      const evidence = metadata.executionEvidence && typeof metadata.executionEvidence === 'object'
        ? metadata.executionEvidence as Record<string, unknown>
        : {}
      return reply.send({
        status: job.status,
        voiceConversionId: job.id,
        sourceAudioArtifactId: metadata.sourceArtifactId ?? '',
        targetVoiceProfileId: metadata.targetVoiceProfileId ?? '',
        provider: job.provider ?? undefined,
        outputArtifactId: job.artifactId ?? undefined,
        evidence: {
          evidenceSource: evidence.evidenceSource ?? 'executor_unavailable',
          liveProviderProof: false,
          blocker: evidence.blocker ?? 'VOICE_CONVERSION_PROVIDER_ROUTE_UNAVAILABLE',
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

  app.post('/api/v1/voice-conversion/:id/cancel', async (request: AuthenticatedRequest, reply: FastifyReply) => {
    try {
      const auth = await authenticateAppKey(request.headers.authorization)
      if (!auth.ok) return reply.status(auth.statusCode).send({ error: auth.error, code: 'AUTH_REQUIRED' })
      const { id } = request.params as { id: string }
      const result = await prisma.job.updateMany({
        where: { id, appSlug: auth.app!.slug, capability: 'voice_conversion', status: { in: ['queued', 'processing'] } },
        data: { status: 'cancelled', completedAt: new Date(), error: 'Cancelled by app' },
      })
      if (!result.count) return reply.status(409).send({ error: 'Voice conversion execution not found, already terminal, or belongs to another app', code: 'EXECUTION_NOT_CANCELLABLE' })
      return reply.send({ status: 'cancelled', voiceConversionId: id, message: 'Voice conversion operation cancelled' })
    } catch (error) {
      const message = error instanceof Error ? error.message : 'Internal server error'
      return reply.status(500).send({ error: message, code: 'INTERNAL_ERROR' })
    }
  })
}
