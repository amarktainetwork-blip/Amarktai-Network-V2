import { randomUUID } from 'node:crypto'
import { z } from 'zod'
import {
  VOICE_AVATAR_USE_SCOPES,
  type VoiceAvatarUseScope,
  type ReusableVoiceProfile,
  evaluateVoiceProfileRights,
  hasVoiceAvatarBlockedOverrides,
} from './voice-avatar-platform.js'
import { validateSourceAudio, type SourceAudioValidationResult } from './source-audio-validation.js'

export const VOICE_CLONE_BLOCKED_FIELDS = [
  'provider', 'model', 'executorId', 'endpoint', 'apiKey', 'providerVoiceId', 'rawProviderPayload',
] as const

export const VOICE_CLONE_STATUSES = [
  'accepted', 'queued', 'processing', 'completed', 'rejected', 'failed', 'cancelled', 'blocked_by_account_access',
] as const

export const VOICE_CLONE_LIFECYCLE_STATUSES = [
  'draft', 'validation_pending', 'provider_submission_pending', 'provider_processing',
  'verification_pending', 'verified', 'rejected', 'failed', 'revoked', 'archived',
] as const

export const VOICE_CLONE_EVIDENCE_SOURCES = [
  'live_provider', 'local_fixture', 'cached', 'platform_policy', 'executor_unavailable',
] as const

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

export const VoiceCloneResultSchema = z.object({
  status: z.enum(VOICE_CLONE_STATUSES),
  voiceCloneId: z.string().uuid().optional(),
  voiceProfileId: z.string().uuid(),
  provider: z.string().optional(),
  model: z.string().optional(),
  providerResourceRef: z.string().optional(),
  outputArtifactId: z.string().uuid().optional(),
  usage: z.record(z.string(), z.unknown()).optional(),
  cost: z.record(z.string(), z.unknown()).optional(),
  evidence: z.object({
    evidenceSource: z.enum(VOICE_CLONE_EVIDENCE_SOURCES),
    liveProviderProof: z.boolean(),
    providerSelected: z.string().optional(),
    modelSelected: z.string().optional(),
    sanitizedProviderRef: z.string().optional(),
    sourceChecksum: z.string().optional(),
    rightsSnapshot: z.record(z.string(), z.unknown()).optional(),
    consentSnapshot: z.record(z.string(), z.unknown()).optional(),
    outputValidation: z.record(z.string(), z.unknown()).optional(),
    blocker: z.string().optional(),
    capability: z.string().optional(),
    appSlug: z.string().optional(),
    idempotent: z.boolean().optional(),
  }).passthrough(),
  error: z.string().optional(),
  errorCode: z.string().optional(),
  createdAt: z.string().datetime().optional(),
  completedAt: z.string().datetime().optional(),
}).strict()

export type VoiceCloneResult = z.infer<typeof VoiceCloneResultSchema>

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

function validationFailure(prefix: string, error: z.ZodError): { success: false; error: string; issues: Array<{ path: string; message: string }> } {
  const issues = error.issues.map((issue) => ({ path: issue.path.join('.'), message: issue.message }))
  return { success: false, error: `${prefix}: ${issues.map((issue) => `${issue.path || 'input'} ${issue.message}`).join('; ')}`, issues }
}

export function createVoiceCloneDomainService(providerAdapter?: VoiceCloneProviderAdapter): VoiceCloneDomainService {
  return {
    validateRequest(request) {
      const blockedField = hasVoiceAvatarBlockedOverrides(request)
      if (blockedField) {
        return {
          success: false,
          error: `Invalid voice_clone request: input.${blockedField} is not allowed. Provider selection is owned by the AmarktAI Network.`,
          issues: [{ path: blockedField, message: 'Provider and model selection are Network-owned' }],
        }
      }
      const parsed = VoiceCloneRequestSchema.safeParse(request)
      return parsed.success ? { success: true, data: parsed.data } : validationFailure('Invalid voice_clone request', parsed.error)
    },

    evaluateEligibility({ appSlug, voiceProfile, request, sourceAudioValidation, now }) {
      const reasons: string[] = []
      const nowDate = now ?? new Date()
      if (voiceProfile.appSlug !== appSlug) reasons.push('Voice profile does not belong to this application')
      if (voiceProfile.status !== 'verified') reasons.push(`Voice profile status is ${voiceProfile.status}`)
      const rights = evaluateVoiceProfileRights({ profile: voiceProfile, intendedUse: request.intendedUse, now: nowDate })
      if (!rights.allowed) reasons.push(...rights.reasons)
      if (!sourceAudioValidation.valid) reasons.push(`Source audio validation failed: ${sourceAudioValidation.errorMessage}`)
      if (!request.consentEvidenceReference.trim()) reasons.push('Consent evidence reference is required')
      if (!request.rightsDeclarationReference.trim()) reasons.push('Rights declaration reference is required')
      return {
        eligible: reasons.length === 0,
        reasons: [...new Set(reasons)],
        evidence: {
          requestId: randomUUID(), appSlug, voiceProfileId: request.voiceProfileId,
          sourceAudioArtifactId: request.sourceAudioArtifactId, intendedUse: request.intendedUse,
          decision: reasons.length ? 'rejected' : 'approved', reasons: [...new Set(reasons)],
          consentVerified: Boolean(request.consentEvidenceReference), rightsVerified: Boolean(request.rightsDeclarationReference),
          profileStatus: voiceProfile.status, rightsStatus: voiceProfile.rightsStatus, decidedAt: nowDate.toISOString(),
        },
      }
    },

    async executeClone({ appSlug, request, voiceProfile, sourceAudioBuffer, sourceMimeType }) {
      const now = new Date().toISOString()
      const sourceValidation = validateSourceAudio({
        artifactId: request.sourceAudioArtifactId, appSlug, buffer: sourceAudioBuffer,
        declaredMimeType: sourceMimeType, consentReference: request.consentEvidenceReference,
        rightsReference: request.rightsDeclarationReference,
      }, { requireConsent: true, requireRights: true })
      if (!sourceValidation.valid) {
        return {
          status: 'rejected', voiceProfileId: request.voiceProfileId,
          evidence: { evidenceSource: 'platform_policy', liveProviderProof: false },
          error: sourceValidation.errorMessage, errorCode: sourceValidation.errorCode, createdAt: now,
        }
      }
      const eligibility = this.evaluateEligibility({ appSlug, voiceProfile, request, sourceAudioValidation: sourceValidation })
      if (!eligibility.eligible) {
        return {
          status: 'rejected', voiceProfileId: request.voiceProfileId,
          evidence: {
            evidenceSource: 'platform_policy', liveProviderProof: false,
            rightsSnapshot: { reasons: eligibility.reasons },
            consentSnapshot: { reference: request.consentEvidenceReference },
          },
          error: eligibility.reasons.join('; '), errorCode: 'ELIGIBILITY_FAILED', createdAt: now,
        }
      }
      if (!providerAdapter?.supportsVoiceClone) {
        return {
          status: 'failed', voiceProfileId: request.voiceProfileId,
          evidence: {
            evidenceSource: 'executor_unavailable', liveProviderProof: false,
            blocker: 'VOICE_CLONE_PROVIDER_ROUTE_UNAVAILABLE',
            rightsSnapshot: { eligibility: eligibility.evidence },
            consentSnapshot: { reference: request.consentEvidenceReference },
          },
          error: 'Voice clone provider route is not currently available',
          errorCode: 'VOICE_CLONE_PROVIDER_ROUTE_UNAVAILABLE', createdAt: now,
        }
      }
      try {
        const result = await providerAdapter.submitClone({
          sourceAudioBuffer, sourceMimeType, voiceProfileId: request.voiceProfileId,
          language: request.language, locale: request.locale, qualityProfile: request.qualityProfile,
        })
        const fixture = providerAdapter.provider === 'fixture'
        if (result.status === 'blocked' || result.status === 'failed') {
          return {
            status: result.status === 'blocked' ? 'blocked_by_account_access' : 'failed',
            voiceProfileId: request.voiceProfileId, provider: providerAdapter.provider,
            providerResourceRef: result.providerResourceRef,
            evidence: {
              evidenceSource: fixture ? 'local_fixture' : 'live_provider', liveProviderProof: false,
              providerSelected: providerAdapter.provider, sanitizedProviderRef: result.providerResourceRef,
              rightsSnapshot: { eligibility: eligibility.evidence }, consentSnapshot: { reference: request.consentEvidenceReference },
            },
            error: result.error ?? 'Provider submission failed',
            errorCode: result.errorCode ?? 'PROVIDER_SUBMISSION_FAILED', createdAt: now,
          }
        }
        return {
          status: result.status === 'completed' ? 'completed' : 'accepted', voiceCloneId: randomUUID(),
          voiceProfileId: request.voiceProfileId, provider: providerAdapter.provider,
          providerResourceRef: result.providerResourceRef,
          evidence: {
            evidenceSource: fixture ? 'local_fixture' : 'live_provider',
            liveProviderProof: !fixture && result.status === 'completed', providerSelected: providerAdapter.provider,
            sanitizedProviderRef: result.providerResourceRef, rightsSnapshot: { eligibility: eligibility.evidence },
            consentSnapshot: { reference: request.consentEvidenceReference }, outputValidation: { status: result.status },
          },
          createdAt: now, completedAt: result.status === 'completed' ? now : undefined,
        }
      } catch (error) {
        const message = error instanceof Error ? error.message : 'Unknown provider error'
        return {
          status: 'failed', voiceProfileId: request.voiceProfileId, provider: providerAdapter.provider,
          evidence: { evidenceSource: 'live_provider', liveProviderProof: false, providerSelected: providerAdapter.provider },
          error: `Provider execution failed: ${message}`, errorCode: 'PROVIDER_EXECUTION_ERROR', createdAt: now,
        }
      }
    },
  }
}

export function createFixtureVoiceCloneProviderAdapter(): VoiceCloneProviderAdapter {
  return {
    provider: 'fixture',
    supportsVoiceClone: true,
    async submitClone(request) {
      return { providerJobRef: `fixture_job_${Date.now()}`, status: 'submitted', providerResourceRef: `fixture_resource_${request.voiceProfileId}` }
    },
    async pollClone() {
      return {
        status: 'completed', progress: 100, outputBuffer: Buffer.from('fixture_audio_output'),
        outputMimeType: 'audio/wav', usage: { inputTokens: 0, outputTokens: 0, totalTokens: 0 },
        cost: { estimatedCost: 0, currency: 'USD', source: 'fixture' },
      }
    },
  }
}
