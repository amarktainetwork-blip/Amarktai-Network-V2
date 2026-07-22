/**
 * Voice Clone — canonical contracts and domain service.
 *
 * Implements isolated voice-clone execution with rights enforcement,
 * consent validation, and provider adapter interface.
 */

import { z } from 'zod'
import {
  VOICE_AVATAR_USE_SCOPES,
  type VoiceAvatarUseScope,
  type ReusableVoiceProfile,
  evaluateVoiceProfileRights,
  hasVoiceAvatarBlockedOverrides,
} from './voice-avatar-platform.js'
import {
  validateSourceAudio,
  type SourceAudioValidationResult,
} from './source-audio-validation.js'

// ── Constants ─────────────────────────────────────────────────────────────────

export const VOICE_CLONE_BLOCKED_FIELDS = [
  'provider',
  'model',
  'executorId',
  'endpoint',
  'apiKey',
  'providerVoiceId',
  'rawProviderPayload',
] as const

export const VOICE_CLONE_STATUSES = [
  'accepted',
  'queued',
  'processing',
  'completed',
  'rejected',
  'failed',
  'cancelled',
  'blocked_by_account_access',
] as const

export const VOICE_CLONE_LIFECYCLE_STATUSES = [
  'draft',
  'validation_pending',
  'provider_submission_pending',
  'provider_processing',
  'verification_pending',
  'verified',
  'rejected',
  'failed',
  'revoked',
  'archived',
] as const

// ── Request Schema ────────────────────────────────────────────────────────────

export const VoiceCloneRequestSchema = z.object({
  sourceAudioArtifactId: z.string().uuid(),
  voiceProfileId: z.string().uuid(),
  language: z.string().trim().min(2).max(20),
  locale: z.string().trim().min(2).max(30).optional(),
  intendedUse: z.enum(VOICE_AVATAR_USE_SCOPES),
  consentEvidenceReference: z.string().trim().min(1).max(300),
  rightsDeclarationReference: z.string().trim().min(1).max(300),
  qualityProfile: z.enum(['standard', 'high', 'premium']).default('standard'),
  maxCredits: z.number().positive().max(10000).optional(),
  idempotencyKey: z.string().trim().min(1).max(200).optional(),
  metadata: z.record(z.string(), z.unknown()).default({}),
}).strict()

export type VoiceCloneRequest = z.infer<typeof VoiceCloneRequestSchema>

// ── Result Schema ─────────────────────────────────────────────────────────────

export const VoiceCloneResultSchema = z.object({
  status: z.enum(VOICE_CLONE_STATUSES),
  voiceCloneId: z.string().uuid().optional(),
  voiceProfileId: z.string().uuid(),
  provider: z.string().optional(),
  model: z.string().optional(),
  providerResourceRef: z.string().optional(),
  outputArtifactId: z.string().uuid().optional(),
  usage: z.object({
    inputTokens: z.number().int().nonnegative().optional(),
    outputTokens: z.number().int().nonnegative().optional(),
    totalTokens: z.number().int().nonnegative().optional(),
    providerReportedCost: z.number().nonnegative().optional(),
    currency: z.string().optional(),
  }).optional(),
  cost: z.object({
    estimatedCost: z.number().nonnegative().optional(),
    currency: z.string().optional(),
    source: z.enum(['provider', 'estimated', 'fixture']).optional(),
  }).optional(),
  evidence: z.object({
    evidenceSource: z.enum(['live_provider', 'local_fixture', 'cached']),
    liveProviderProof: z.boolean(),
    providerSelected: z.string().optional(),
    modelSelected: z.string().optional(),
    sanitizedProviderRef: z.string().optional(),
    sourceChecksum: z.string().optional(),
    rightsSnapshot: z.record(z.string(), z.unknown()).optional(),
    consentSnapshot: z.record(z.string(), z.unknown()).optional(),
    outputValidation: z.record(z.string(), z.unknown()).optional(),
  }),
  error: z.string().optional(),
  errorCode: z.string().optional(),
  createdAt: z.string().datetime().optional(),
  completedAt: z.string().datetime().optional(),
}).strict()

export type VoiceCloneResult = z.infer<typeof VoiceCloneResultSchema>

// ── Decision Evidence ─────────────────────────────────────────────────────────

export interface VoiceCloneDecisionEvidence {
  requestId: string
  appSlug: string
  voiceProfileId: string
  sourceAudioArtifactId: string
  intendedUse: VoiceAvatarUseScope
  decision: 'approved' | 'rejected' | 'blocked'
  reasons: string[]
  consentVerified: boolean
  rightsVerified: boolean
  profileStatus: string
  rightsStatus: string
  decidedAt: string
}

export interface VoiceCloneExecutionEvidence {
  requestId: string
  voiceCloneId: string
  appSlug: string
  voiceProfileId: string
  provider: string
  model: string
  sanitizedProviderRef: string
  sourceChecksum: string
  usage: Record<string, unknown>
  cost: Record<string, unknown>
  rightsSnapshot: Record<string, unknown>
  consentSnapshot: Record<string, unknown>
  outputValidation: Record<string, unknown>
  liveProviderProof: boolean
  evidenceSource: string
  executedAt: string
}

// ── Provider Adapter Interface ────────────────────────────────────────────────

export interface VoiceCloneProviderAdapter {
  readonly provider: string
  readonly supportsVoiceClone: boolean

  submitClone(request: {
    sourceAudioBuffer: Buffer
    sourceMimeType: string
    voiceProfileId: string
    language: string
    locale?: string
    qualityProfile: string
  }): Promise<VoiceCloneProviderResult>

  pollClone(providerJobRef: string): Promise<VoiceCloneProviderPollResult>

  cancelClone?(providerJobRef: string): Promise<boolean>
}

export interface VoiceCloneProviderResult {
  providerJobRef: string
  status: 'submitted' | 'processing' | 'completed' | 'failed' | 'blocked'
  providerResourceRef?: string
  error?: string
  errorCode?: string
}

export interface VoiceCloneProviderPollResult {
  status: 'processing' | 'completed' | 'failed' | 'cancelled'
  progress: number
  outputBuffer?: Buffer
  outputMimeType?: string
  usage?: Record<string, unknown>
  cost?: Record<string, unknown>
  error?: string
  errorCode?: string
}

// ── Domain Service ────────────────────────────────────────────────────────────

export interface VoiceCloneDomainService {
  validateRequest(request: unknown): { success: boolean; data?: VoiceCloneRequest; error?: string; issues?: Array<{ path: string; message: string }> }
  evaluateEligibility(input: {
    appSlug: string
    voiceProfile: ReusableVoiceProfile
    request: VoiceCloneRequest
    sourceAudioValidation: SourceAudioValidationResult
    now?: Date
  }): { eligible: boolean; reasons: string[]; evidence: VoiceCloneDecisionEvidence }
  executeClone(input: {
    appSlug: string
    request: VoiceCloneRequest
    voiceProfile: ReusableVoiceProfile
    sourceAudioBuffer: Buffer
    sourceMimeType: string
    idempotencyKey?: string
  }): Promise<VoiceCloneResult>
}

// ── Implementation ────────────────────────────────────────────────────────────

export function createVoiceCloneDomainService(
  providerAdapter?: VoiceCloneProviderAdapter,
): VoiceCloneDomainService {
  return {
    validateRequest(request: unknown) {
      // Check for blocked provider/model fields
      const blockedField = hasVoiceAvatarBlockedOverrides(request)
      if (blockedField) {
        return {
          success: false,
          error: `Invalid voice_clone request: input.${blockedField} is not allowed. Provider selection is owned by the AmarktAI Network.`,
          issues: [{ path: blockedField, message: 'Provider and model selection are Network-owned' }],
        }
      }

      const parsed = VoiceCloneRequestSchema.safeParse(request)
      if (!parsed.success) {
        const issues = parsed.error.issues.map((issue) => ({
          path: issue.path.join('.'),
          message: issue.message,
        }))
        return {
          success: false,
          error: `Invalid voice_clone request: ${issues.map((i) => `${i.path || 'input'} ${i.message}`).join('; ')}`,
          issues,
        }
      }

      return { success: true, data: parsed.data }
    },

    evaluateEligibility(input) {
      const { appSlug, voiceProfile, request, sourceAudioValidation, now } = input
      const reasons: string[] = []
      const nowDate = now ?? new Date()

      // Check voice profile ownership
      if (voiceProfile.appSlug !== appSlug) {
        reasons.push('Voice profile does not belong to this application')
      }

      // Check profile status
      if (voiceProfile.status === 'draft') {
        reasons.push('Voice profile is in draft status')
      }
      if (voiceProfile.status === 'revoked') {
        reasons.push('Voice profile has been revoked')
      }
      if (voiceProfile.status === 'archived') {
        reasons.push('Voice profile has been archived')
      }

      // Check rights
      const rightsDecision = evaluateVoiceProfileRights({
        profile: voiceProfile,
        intendedUse: request.intendedUse,
        now: nowDate,
      })
      if (!rightsDecision.allowed) {
        reasons.push(...rightsDecision.reasons)
      }

      // Check source audio validation
      if (!sourceAudioValidation.valid) {
        reasons.push(`Source audio validation failed: ${sourceAudioValidation.errorMessage}`)
      }

      // Check consent evidence reference
      if (!request.consentEvidenceReference?.trim()) {
        reasons.push('Consent evidence reference is required')
      }

      // Check rights declaration reference
      if (!request.rightsDeclarationReference?.trim()) {
        reasons.push('Rights declaration reference is required')
      }

      const decision = reasons.length === 0 ? 'approved' : 'rejected'

      return {
        eligible: reasons.length === 0,
        reasons,
        evidence: {
          requestId: crypto.randomUUID(),
          appSlug,
          voiceProfileId: request.voiceProfileId,
          sourceAudioArtifactId: request.sourceAudioArtifactId,
          intendedUse: request.intendedUse,
          decision,
          reasons,
          consentVerified: !!request.consentEvidenceReference,
          rightsVerified: !!request.rightsDeclarationReference,
          profileStatus: voiceProfile.status,
          rightsStatus: voiceProfile.rightsStatus,
          decidedAt: nowDate.toISOString(),
        },
      }
    },

    async executeClone(input) {
      const { appSlug, request, voiceProfile, sourceAudioBuffer, sourceMimeType } = input
      const now = new Date().toISOString()

      // Validate source audio
      const sourceValidation = validateSourceAudio({
        artifactId: request.sourceAudioArtifactId,
        appSlug,
        buffer: sourceAudioBuffer,
        declaredMimeType: sourceMimeType,
        consentReference: request.consentEvidenceReference,
        rightsReference: request.rightsDeclarationReference,
      }, {
        requireConsent: true,
        requireRights: true,
      })

      if (!sourceValidation.valid) {
        return {
          status: 'rejected',
          voiceProfileId: request.voiceProfileId,
          evidence: {
            evidenceSource: 'local_fixture',
            liveProviderProof: false,
          },
          error: sourceValidation.errorMessage,
          errorCode: sourceValidation.errorCode,
          createdAt: now,
        }
      }

      // Evaluate eligibility
      const eligibility = this.evaluateEligibility({
        appSlug,
        voiceProfile,
        request,
        sourceAudioValidation: sourceValidation,
      })

      if (!eligibility.eligible) {
        return {
          status: 'rejected',
          voiceProfileId: request.voiceProfileId,
          evidence: {
            evidenceSource: 'local_fixture',
            liveProviderProof: false,
            rightsSnapshot: { reasons: eligibility.reasons },
            consentSnapshot: { reference: request.consentEvidenceReference },
          },
          error: eligibility.reasons.join('; '),
          errorCode: 'ELIGIBILITY_FAILED',
          createdAt: now,
        }
      }

      // If no provider adapter, return blocked status
      if (!providerAdapter || !providerAdapter.supportsVoiceClone) {
        return {
          status: 'blocked_by_account_access',
          voiceProfileId: request.voiceProfileId,
          provider: providerAdapter?.provider ?? 'unknown',
          evidence: {
            evidenceSource: 'local_fixture',
            liveProviderProof: false,
            providerSelected: providerAdapter?.provider,
            rightsSnapshot: { eligibility: eligibility.evidence },
            consentSnapshot: { reference: request.consentEvidenceReference },
          },
          error: 'Voice clone provider route is not currently available',
          errorCode: 'PROVIDER_ACCOUNT_OR_ROUTE_REQUIRED',
          createdAt: now,
        }
      }

      // Submit to provider
      try {
        const providerResult = await providerAdapter.submitClone({
          sourceAudioBuffer,
          sourceMimeType,
          voiceProfileId: request.voiceProfileId,
          language: request.language,
          locale: request.locale,
          qualityProfile: request.qualityProfile,
        })

        if (providerResult.status === 'blocked') {
          return {
            status: 'blocked_by_account_access',
            voiceProfileId: request.voiceProfileId,
            provider: providerAdapter.provider,
            providerResourceRef: providerResult.providerResourceRef,
            evidence: {
              evidenceSource: 'live_provider',
              liveProviderProof: false,
              providerSelected: providerAdapter.provider,
              sanitizedProviderRef: providerResult.providerResourceRef,
              rightsSnapshot: { eligibility: eligibility.evidence },
              consentSnapshot: { reference: request.consentEvidenceReference },
            },
            error: providerResult.error ?? 'Provider account access required',
            errorCode: providerResult.errorCode ?? 'PROVIDER_ACCOUNT_OR_ROUTE_REQUIRED',
            createdAt: now,
          }
        }

        if (providerResult.status === 'failed') {
          return {
            status: 'failed',
            voiceProfileId: request.voiceProfileId,
            provider: providerAdapter.provider,
            providerResourceRef: providerResult.providerResourceRef,
            evidence: {
              evidenceSource: 'live_provider',
              liveProviderProof: false,
              providerSelected: providerAdapter.provider,
              sanitizedProviderRef: providerResult.providerResourceRef,
              rightsSnapshot: { eligibility: eligibility.evidence },
              consentSnapshot: { reference: request.consentEvidenceReference },
            },
            error: providerResult.error ?? 'Provider submission failed',
            errorCode: providerResult.errorCode ?? 'PROVIDER_SUBMISSION_FAILED',
            createdAt: now,
          }
        }

        // Success - return accepted/processing status
        return {
          status: providerResult.status === 'completed' ? 'completed' : 'accepted',
          voiceCloneId: crypto.randomUUID(),
          voiceProfileId: request.voiceProfileId,
          provider: providerAdapter.provider,
          providerResourceRef: providerResult.providerResourceRef,
          evidence: {
            evidenceSource: 'live_provider',
            liveProviderProof: providerResult.status === 'completed',
            providerSelected: providerAdapter.provider,
            sanitizedProviderRef: providerResult.providerResourceRef,
            sourceChecksum: sourceValidation.metadata?.mimeType,
            rightsSnapshot: { eligibility: eligibility.evidence },
            consentSnapshot: { reference: request.consentEvidenceReference },
            outputValidation: { status: providerResult.status },
          },
          createdAt: now,
          completedAt: providerResult.status === 'completed' ? now : undefined,
        }
      } catch (error) {
        const message = error instanceof Error ? error.message : 'Unknown provider error'
        return {
          status: 'failed',
          voiceProfileId: request.voiceProfileId,
          provider: providerAdapter.provider,
          evidence: {
            evidenceSource: 'live_provider',
            liveProviderProof: false,
            providerSelected: providerAdapter.provider,
            rightsSnapshot: { eligibility: eligibility.evidence },
            consentSnapshot: { reference: request.consentEvidenceReference },
          },
          error: `Provider execution failed: ${message}`,
          errorCode: 'PROVIDER_EXECUTION_ERROR',
          createdAt: now,
        }
      }
    },
  }
}

// ── Fixture Adapter ───────────────────────────────────────────────────────────

export function createFixtureVoiceCloneProviderAdapter(): VoiceCloneProviderAdapter {
  return {
    provider: 'fixture',
    supportsVoiceClone: true,

    async submitClone(request) {
      // Simulate provider submission
      return {
        providerJobRef: `fixture_job_${Date.now()}`,
        status: 'submitted',
        providerResourceRef: `fixture_resource_${request.voiceProfileId}`,
      }
    },

    async pollClone(_providerJobRef) {
      // Simulate immediate completion for testing
      return {
        status: 'completed',
        progress: 100,
        outputBuffer: Buffer.from('fixture_audio_output'),
        outputMimeType: 'audio/wav',
        usage: { inputTokens: 0, outputTokens: 0, totalTokens: 0 },
        cost: { estimatedCost: 0, currency: 'USD', source: 'fixture' },
      }
    },
  }
}
