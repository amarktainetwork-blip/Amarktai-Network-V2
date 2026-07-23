/**
 * Voice Clone Routes — governed, durable, fail-closed voice-clone requests.
 *
 * Authentication, grants, source ownership, profile rights, consent evidence,
 * and server-issued rights decisions are verified before the current production
 * executor blocker is persisted. Known blockers are never queued.
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

export async function registerVoiceCloneRoutes(app: FastifyInstance): Promise<void> {
  app.post('/api/v1/voice-clone', async (request: AuthenticatedRequest, reply: FastifyReply) => {
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
        'voice_clone' as CapabilityKey,
        auth.allowedCapabilities ?? [],
      )
      if (!grantResolution || !grantResolution.grant.enabled) {
        return reply.status(403).send({ error: 'App does not have voice_clone capability grant', code: 'CAPABILITY_GRANT_DENIED' })
      }
      if (!grantResolution.grant.artifactRead) {
        return reply.status(403).send({ error: 'App capability grant denies source-artifact read for voice_clone', code: 'GRANT_DENIED' })
      }

      const { createVoiceCloneDomainService } = await import('@amarktai/core/voice-clone-contracts')
      const validation = createVoiceCloneDomainService().validateRequest(request.body)
      if (!validation.success) {
        return reply.status(400).send({ error: validation.error, code: 'VALIDATION_FAILED', issues: validation.issues })
      }
      const cloneRequest = validation.data!

      const sourceArtifact = await prisma.artifact.findFirst({
        where: { id: cloneRequest.sourceAudioArtifactId, appSlug, status: 'completed' },
      })
      if (!sourceArtifact) {
        return reply.status(404).send({ error: 'Source audio artifact not found or not accessible', code: 'ARTIFACT_NOT_FOUND' })
      }
      if (sourceArtifact.type !== 'audio' && !sourceArtifact.mimeType.startsWith('audio/')) {
        return reply.status(400).send({ error: 'Source artifact must be a completed audio artifact', code: 'INVALID_ARTIFACT_TYPE' })
      }

      const voiceProfile = await getVoiceProfile(appSlug, cloneRequest.voiceProfileId)
      if (!voiceProfile) {
        return reply.status(404).send({ error: 'Voice profile not found or not accessible', code: 'VOICE_PROFILE_NOT_FOUND' })
      }
      if (voiceProfile.appSlug !== appSlug) {
        return reply.status(403).send({ error: 'Voice profile does not belong to this application', code: 'CROSS_APP_PROFILE_DENIED' })
      }

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

      if (voiceProfile.source.sourceType !== 'user_recording') {
        return reply.status(422).send({
          error: 'Voice clone requires a verified user-recording Voice Profile.',
          code: 'USER_RECORDING_PROFILE_REQUIRED',
        })
      }
      if (!voiceProfile.source.sourceAudioArtifactIds.includes(cloneRequest.sourceAudioArtifactId)) {
        return reply.status(422).send({
          error: 'Source audio is not part of the verified Voice Profile evidence.',
          code: 'SOURCE_AUDIO_NOT_VERIFIED_FOR_PROFILE',
        })
      }
      const consentEvidence = voiceProfile.consentEvidence
      const consentReferences = new Set([
        consentEvidence?.consentArtifactId,
        consentEvidence?.sourceRecordingConsentArtifactId,
      ].filter((value): value is string => Boolean(value)))
      if (!consentReferences.has(cloneRequest.consentEvidenceReference)) {
        return reply.status(422).send({
          error: 'Consent evidence reference does not match the verified Voice Profile.',
          code: 'CONSENT_REFERENCE_MISMATCH',
        })
      }
      if (!voiceProfile.rightsDecision?.verifierReference
        || cloneRequest.rightsDeclarationReference !== voiceProfile.rightsDecision.verifierReference) {
        return reply.status(422).send({
          error: 'Rights declaration reference does not match the server-verified Voice Profile decision.',
          code: 'RIGHTS_REFERENCE_MISMATCH',
        })
      }

      const idempotencyKey = cloneRequest.idempotencyKey ?? `auto_${randomUUID()}`
      const blocker = 'VOICE_CLONE_PROVIDER_ROUTE_UNAVAILABLE'
      const blockerMessage = 'No production voice clone provider route is currently configured.'
      const persisted = await persistBlockedCapabilityJob({
        appSlug,
        capability: 'voice_clone',
        prompt: `Governed voice clone request for profile ${cloneRequest.voiceProfileId}`,
        requestInput: cloneRequest,
        idempotencyKey,
        blocker,
        message: blockerMessage,
        metadata: {
          ...cloneRequest.metadata,
          sourceArtifactId: cloneRequest.sourceAudioArtifactId,
          voiceProfileId: cloneRequest.voiceProfileId,
          intendedUse: cloneRequest.intendedUse,
          qualityProfile: cloneRequest.qualityProfile,
          maxCredits: cloneRequest.maxCredits ?? null,
          appGrantSnapshot: grantResolution.grant,
          appGrantSnapshotSource: grantResolution.source,
          appGrantSnapshotAt: new Date().toISOString(),
          rightsSnapshot: {
            allowed: rightsDecision.allowed,
            reasons: rightsDecision.reasons,
            profileStatus: voiceProfile.status,
            rightsStatus: voiceProfile.rightsStatus,
            verifierReference: voiceProfile.rightsDecision.verifierReference,
            decidedAt: voiceProfile.rightsDecision.decidedAt,
          },
          consentSnapshot: {
            consentArtifactId: consentEvidence?.consentArtifactId ?? null,
            sourceRecordingConsentArtifactId: consentEvidence?.sourceRecordingConsentArtifactId ?? null,
            verifiedAt: consentEvidence?.verifiedAt ?? null,
            expiresAt: consentEvidence?.expiresAt ?? null,
            permittedUses: consentEvidence?.permittedUses ?? [],
          },
        },
      })

      return reply.status(422).send({
        status: 'failed',
        voiceCloneId: persisted.job.id,
        voiceProfileId: cloneRequest.voiceProfileId,
        evidence: {
          evidenceSource: 'executor_unavailable',
          liveProviderProof: false,
          blocker,
          capability: 'voice_clone',
          appSlug,
          idempotent: persisted.deduplicated,
          rightsSnapshot: { allowed: rightsDecision.allowed, reasons: rightsDecision.reasons },
          consentSnapshot: {
            consentArtifactId: consentEvidence?.consentArtifactId ?? null,
            sourceRecordingConsentArtifactId: consentEvidence?.sourceRecordingConsentArtifactId ?? null,
          },
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

  app.get('/api/v1/voice-clone/:id', async (request: AuthenticatedRequest, reply: FastifyReply) => {
    try {
      const auth = await authenticateAppKey(request.headers.authorization)
      if (!auth.ok) return reply.status(auth.statusCode).send({ error: auth.error, code: 'AUTH_REQUIRED' })
      const { id } = request.params as { id: string }
      const job = await prisma.job.findFirst({ where: { id, appSlug: auth.app!.slug, capability: 'voice_clone' } })
      if (!job) return reply.status(404).send({ error: 'Voice clone execution not found', code: 'EXECUTION_NOT_FOUND' })
      const metadata = safeMetadata(job.metadataJson)
      const evidence = metadata.executionEvidence && typeof metadata.executionEvidence === 'object'
        ? metadata.executionEvidence as Record<string, unknown>
        : {}
      return reply.send({
        status: job.status,
        voiceCloneId: job.id,
        voiceProfileId: metadata.voiceProfileId ?? '',
        provider: job.provider ?? undefined,
        outputArtifactId: job.artifactId ?? undefined,
        evidence: {
          evidenceSource: evidence.evidenceSource ?? 'executor_unavailable',
          liveProviderProof: false,
          blocker: evidence.blocker ?? 'VOICE_CLONE_PROVIDER_ROUTE_UNAVAILABLE',
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

  app.post('/api/v1/voice-clone/:id/cancel', async (request: AuthenticatedRequest, reply: FastifyReply) => {
    try {
      const auth = await authenticateAppKey(request.headers.authorization)
      if (!auth.ok) return reply.status(auth.statusCode).send({ error: auth.error, code: 'AUTH_REQUIRED' })
      const { id } = request.params as { id: string }
      const result = await prisma.job.updateMany({
        where: { id, appSlug: auth.app!.slug, capability: 'voice_clone', status: { in: ['queued', 'processing'] } },
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
