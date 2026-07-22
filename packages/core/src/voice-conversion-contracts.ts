import { randomUUID } from 'node:crypto'
import { z } from 'zod'
import {
  VOICE_AVATAR_USE_SCOPES,
  type ReusableVoiceProfile,
  evaluateVoiceProfileRights,
  hasVoiceAvatarBlockedOverrides,
} from './voice-avatar-platform.js'
import { validateSourceAudio, type SourceAudioValidationResult } from './source-audio-validation.js'

export const VOICE_CONVERSION_BLOCKED_FIELDS = [
  'provider', 'model', 'executorId', 'endpoint', 'apiKey', 'providerVoiceId', 'rawProviderPayload',
] as const

export const VOICE_CONVERSION_STATUSES = [
  'accepted', 'queued', 'processing', 'completed', 'rejected', 'failed', 'cancelled', 'blocked_by_account_access',
] as const

export const VOICE_CONVERSION_EVIDENCE_SOURCES = [
  'live_provider', 'local_fixture', 'cached', 'platform_policy', 'executor_unavailable',
] as const

export const VoiceConversionRequestSchema = z.object({
  sourceAudioArtifactId: z.string().uuid(),
  targetVoiceProfileId: z.string().uuid(),
  intendedUse: z.enum(VOICE_AVATAR_USE_SCOPES),
  language: z.string().trim().min(2).max(20).optional(),
  locale: z.string().trim().min(2).max(30).optional(),
  preserveTiming: z.boolean().default(true),
  outputFormat: z.enum(['wav', 'mp3', 'flac', 'ogg']).default('wav'),
  maxCredits: z.number().positive().max(10000).optional(),
  idempotencyKey: z.string().trim().min(1).max(200).optional(),
  metadata: z.record(z.string(), z.unknown()).default({}),
}).strict()

export type VoiceConversionRequest = z.infer<typeof VoiceConversionRequestSchema>

export const VoiceConversionResultSchema = z.object({
  status: z.enum(VOICE_CONVERSION_STATUSES),
  voiceConversionId: z.string().uuid().optional(),
  sourceAudioArtifactId: z.string().uuid(),
  targetVoiceProfileId: z.string().uuid(),
  provider: z.string().optional(),
  model: z.string().optional(),
  providerResourceRef: z.string().optional(),
  outputArtifactId: z.string().uuid().optional(),
  usage: z.record(z.string(), z.unknown()).optional(),
  cost: z.record(z.string(), z.unknown()).optional(),
  evidence: z.object({
    evidenceSource: z.enum(VOICE_CONVERSION_EVIDENCE_SOURCES),
    liveProviderProof: z.boolean(),
    providerSelected: z.string().optional(),
    modelSelected: z.string().optional(),
    sanitizedProviderRef: z.string().optional(),
    sourceChecksum: z.string().optional(),
    targetProfileSnapshot: z.record(z.string(), z.unknown()).optional(),
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

export type VoiceConversionResult = z.infer<typeof VoiceConversionResultSchema>

export interface VoiceConversionProviderAdapter {
  readonly provider: string
  readonly supportsVoiceConversion: boolean
  submitConversion(request: {
    sourceAudioBuffer: Buffer
    sourceMimeType: string
    targetVoiceProfileId: string
    language?: string
    preserveTiming: boolean
    outputFormat: string
  }): Promise<VoiceConversionProviderResult>
  pollConversion(providerJobRef: string): Promise<VoiceConversionProviderPollResult>
  cancelConversion?(providerJobRef: string): Promise<boolean>
}

export interface VoiceConversionProviderResult {
  providerJobRef: string
  status: 'submitted' | 'processing' | 'completed' | 'failed' | 'blocked'
  providerResourceRef?: string
  error?: string
  errorCode?: string
}

export interface VoiceConversionProviderPollResult {
  status: 'processing' | 'completed' | 'failed' | 'cancelled'
  progress: number
  outputBuffer?: Buffer
  outputMimeType?: string
  usage?: Record<string, unknown>
  cost?: Record<string, unknown>
  error?: string
  errorCode?: string
}

export interface VoiceConversionDomainService {
  validateRequest(request: unknown): { success: boolean; data?: VoiceConversionRequest; error?: string; issues?: Array<{ path: string; message: string }> }
  evaluateEligibility(input: {
    appSlug: string
    sourceAppSlug: string
    targetVoiceProfile: ReusableVoiceProfile
    request: VoiceConversionRequest
    sourceAudioValidation: SourceAudioValidationResult
    now?: Date
  }): { eligible: boolean; reasons: string[] }
  executeConversion(input: {
    appSlug: string
    request: VoiceConversionRequest
    targetVoiceProfile: ReusableVoiceProfile
    sourceAudioBuffer: Buffer
    sourceMimeType: string
    idempotencyKey?: string
  }): Promise<VoiceConversionResult>
}

function validationFailure(error: z.ZodError) {
  const issues = error.issues.map((issue) => ({ path: issue.path.join('.'), message: issue.message }))
  return { success: false as const, error: `Invalid voice_conversion request: ${issues.map((issue) => `${issue.path || 'input'} ${issue.message}`).join('; ')}`, issues }
}

export function createVoiceConversionDomainService(providerAdapter?: VoiceConversionProviderAdapter): VoiceConversionDomainService {
  return {
    validateRequest(request) {
      const blockedField = hasVoiceAvatarBlockedOverrides(request)
      if (blockedField) {
        return {
          success: false,
          error: `Invalid voice_conversion request: input.${blockedField} is not allowed. Provider selection is owned by the AmarktAI Network.`,
          issues: [{ path: blockedField, message: 'Provider and model selection are Network-owned' }],
        }
      }
      const parsed = VoiceConversionRequestSchema.safeParse(request)
      return parsed.success ? { success: true, data: parsed.data } : validationFailure(parsed.error)
    },

    evaluateEligibility({ appSlug, sourceAppSlug, targetVoiceProfile, request, sourceAudioValidation, now }) {
      const reasons: string[] = []
      if (sourceAppSlug !== appSlug) reasons.push('Source audio does not belong to this application')
      if (targetVoiceProfile.appSlug !== appSlug) reasons.push('Target voice profile does not belong to this application')
      if (targetVoiceProfile.status !== 'verified') reasons.push(`Target voice profile status is ${targetVoiceProfile.status}`)
      const rights = evaluateVoiceProfileRights({ profile: targetVoiceProfile, intendedUse: request.intendedUse, now })
      if (!rights.allowed) reasons.push(...rights.reasons)
      if (!sourceAudioValidation.valid) reasons.push(`Source audio validation failed: ${sourceAudioValidation.errorMessage}`)
      return { eligible: reasons.length === 0, reasons: [...new Set(reasons)] }
    },

    async executeConversion({ appSlug, request, targetVoiceProfile, sourceAudioBuffer, sourceMimeType }) {
      const now = new Date().toISOString()
      const sourceValidation = validateSourceAudio({
        artifactId: request.sourceAudioArtifactId,
        appSlug,
        buffer: sourceAudioBuffer,
        declaredMimeType: sourceMimeType,
      })
      if (!sourceValidation.valid) {
        return {
          status: 'rejected', sourceAudioArtifactId: request.sourceAudioArtifactId,
          targetVoiceProfileId: request.targetVoiceProfileId,
          evidence: { evidenceSource: 'platform_policy', liveProviderProof: false },
          error: sourceValidation.errorMessage, errorCode: sourceValidation.errorCode, createdAt: now,
        }
      }
      const eligibility = this.evaluateEligibility({
        appSlug, sourceAppSlug: appSlug, targetVoiceProfile, request,
        sourceAudioValidation: sourceValidation,
      })
      if (!eligibility.eligible) {
        return {
          status: 'rejected', sourceAudioArtifactId: request.sourceAudioArtifactId,
          targetVoiceProfileId: request.targetVoiceProfileId,
          evidence: {
            evidenceSource: 'platform_policy', liveProviderProof: false,
            targetProfileSnapshot: { reasons: eligibility.reasons },
          },
          error: eligibility.reasons.join('; '), errorCode: 'ELIGIBILITY_FAILED', createdAt: now,
        }
      }
      if (!providerAdapter?.supportsVoiceConversion) {
        return {
          status: 'failed', sourceAudioArtifactId: request.sourceAudioArtifactId,
          targetVoiceProfileId: request.targetVoiceProfileId,
          evidence: {
            evidenceSource: 'executor_unavailable', liveProviderProof: false,
            blocker: 'VOICE_CONVERSION_PROVIDER_ROUTE_UNAVAILABLE',
            targetProfileSnapshot: { status: targetVoiceProfile.status, rightsStatus: targetVoiceProfile.rightsStatus },
          },
          error: 'Voice conversion provider route is not currently available',
          errorCode: 'VOICE_CONVERSION_PROVIDER_ROUTE_UNAVAILABLE', createdAt: now,
        }
      }
      try {
        const result = await providerAdapter.submitConversion({
          sourceAudioBuffer, sourceMimeType, targetVoiceProfileId: request.targetVoiceProfileId,
          language: request.language, preserveTiming: request.preserveTiming, outputFormat: request.outputFormat,
        })
        const fixture = providerAdapter.provider === 'fixture'
        if (result.status === 'blocked' || result.status === 'failed') {
          return {
            status: result.status === 'blocked' ? 'blocked_by_account_access' : 'failed',
            sourceAudioArtifactId: request.sourceAudioArtifactId,
            targetVoiceProfileId: request.targetVoiceProfileId,
            provider: providerAdapter.provider, providerResourceRef: result.providerResourceRef,
            evidence: {
              evidenceSource: fixture ? 'local_fixture' : 'live_provider', liveProviderProof: false,
              providerSelected: providerAdapter.provider, sanitizedProviderRef: result.providerResourceRef,
              targetProfileSnapshot: { status: targetVoiceProfile.status, rightsStatus: targetVoiceProfile.rightsStatus },
            },
            error: result.error ?? 'Provider submission failed',
            errorCode: result.errorCode ?? 'PROVIDER_SUBMISSION_FAILED', createdAt: now,
          }
        }
        return {
          status: result.status === 'completed' ? 'completed' : 'accepted',
          voiceConversionId: randomUUID(), sourceAudioArtifactId: request.sourceAudioArtifactId,
          targetVoiceProfileId: request.targetVoiceProfileId, provider: providerAdapter.provider,
          providerResourceRef: result.providerResourceRef,
          evidence: {
            evidenceSource: fixture ? 'local_fixture' : 'live_provider',
            liveProviderProof: !fixture && result.status === 'completed', providerSelected: providerAdapter.provider,
            sanitizedProviderRef: result.providerResourceRef,
            targetProfileSnapshot: { status: targetVoiceProfile.status, rightsStatus: targetVoiceProfile.rightsStatus },
            outputValidation: { status: result.status },
          },
          createdAt: now, completedAt: result.status === 'completed' ? now : undefined,
        }
      } catch (error) {
        const message = error instanceof Error ? error.message : 'Unknown provider error'
        return {
          status: 'failed', sourceAudioArtifactId: request.sourceAudioArtifactId,
          targetVoiceProfileId: request.targetVoiceProfileId, provider: providerAdapter.provider,
          evidence: { evidenceSource: 'live_provider', liveProviderProof: false, providerSelected: providerAdapter.provider },
          error: `Provider execution failed: ${message}`, errorCode: 'PROVIDER_EXECUTION_ERROR', createdAt: now,
        }
      }
    },
  }
}

export function createFixtureVoiceConversionProviderAdapter(): VoiceConversionProviderAdapter {
  return {
    provider: 'fixture', supportsVoiceConversion: true,
    async submitConversion(request) {
      return { providerJobRef: `fixture_job_${Date.now()}`, status: 'submitted', providerResourceRef: `fixture_conversion_${request.targetVoiceProfileId}` }
    },
    async pollConversion() {
      return {
        status: 'completed', progress: 100, outputBuffer: Buffer.from('fixture_audio_output'),
        outputMimeType: 'audio/wav', usage: { inputTokens: 0, outputTokens: 0, totalTokens: 0 },
        cost: { estimatedCost: 0, currency: 'USD', source: 'fixture' },
      }
    },
  }
}
