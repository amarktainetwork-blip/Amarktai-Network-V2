/**
 * Voice Conversion — canonical contracts and domain service.
 *
 * Implements isolated voice-conversion execution with rights enforcement,
 * target profile validation, and provider adapter interface.
 */

import { z } from 'zod'
import {
  VOICE_AVATAR_USE_SCOPES,
  type ReusableVoiceProfile,
  evaluateVoiceProfileRights,
  hasVoiceAvatarBlockedOverrides,
} from './voice-avatar-platform.js'
import {
  validateSourceAudio,
  type SourceAudioValidationResult,
} from './source-audio-validation.js'

// ── Constants ─────────────────────────────────────────────────────────────────

export const VOICE_CONVERSION_BLOCKED_FIELDS = [
  'provider',
  'model',
  'executorId',
  'endpoint',
  'apiKey',
  'providerVoiceId',
  'rawProviderPayload',
] as const

export const VOICE_CONVERSION_STATUSES = [
  'accepted',
  'queued',
  'processing',
  'completed',
  'rejected',
  'failed',
  'cancelled',
  'blocked_by_account_access',
] as const

// ── Request Schema ────────────────────────────────────────────────────────────

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

// ── Result Schema ─────────────────────────────────────────────────────────────

export const VoiceConversionResultSchema = z.object({
  status: z.enum(VOICE_CONVERSION_STATUSES),
  voiceConversionId: z.string().uuid().optional(),
  sourceAudioArtifactId: z.string().uuid(),
  targetVoiceProfileId: z.string().uuid(),
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
    targetProfileSnapshot: z.record(z.string(), z.unknown()).optional(),
    outputValidation: z.record(z.string(), z.unknown()).optional(),
  }),
  error: z.string().optional(),
  errorCode: z.string().optional(),
  createdAt: z.string().datetime().optional(),
  completedAt: z.string().datetime().optional(),
}).strict()

export type VoiceConversionResult = z.infer<typeof VoiceConversionResultSchema>

// ── Provider Adapter Interface ────────────────────────────────────────────────

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

// ── Domain Service ────────────────────────────────────────────────────────────

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

// ── Implementation ────────────────────────────────────────────────────────────

export function createVoiceConversionDomainService(
  providerAdapter?: VoiceConversionProviderAdapter,
): VoiceConversionDomainService {
  return {
    validateRequest(request: unknown) {
      // Check for blocked provider/model fields
      const blockedField = hasVoiceAvatarBlockedOverrides(request)
      if (blockedField) {
        return {
          success: false,
          error: `Invalid voice_conversion request: input.${blockedField} is not allowed. Provider selection is owned by the AmarktAI Network.`,
          issues: [{ path: blockedField, message: 'Provider and model selection are Network-owned' }],
        }
      }

      const parsed = VoiceConversionRequestSchema.safeParse(request)
      if (!parsed.success) {
        const issues = parsed.error.issues.map((issue) => ({
          path: issue.path.join('.'),
          message: issue.message,
        }))
        return {
          success: false,
          error: `Invalid voice_conversion request: ${issues.map((i) => `${i.path || 'input'} ${i.message}`).join('; ')}`,
          issues,
        }
      }

      return { success: true, data: parsed.data }
    },

    evaluateEligibility(input) {
      const { appSlug, targetVoiceProfile, request, sourceAudioValidation, now } = input
      const reasons: string[] = []
      const nowDate = now ?? new Date()

      // Check target profile ownership
      if (targetVoiceProfile.appSlug !== appSlug) {
        reasons.push('Target voice profile does not belong to this application')
      }

      // Check target profile status
      if (targetVoiceProfile.status === 'draft') {
        reasons.push('Target voice profile is in draft status')
      }
      if (targetVoiceProfile.status === 'revoked') {
        reasons.push('Target voice profile has been revoked')
      }
      if (targetVoiceProfile.status === 'archived') {
        reasons.push('Target voice profile has been archived')
      }

      // Check rights for intended use
      const rightsDecision = evaluateVoiceProfileRights({
        profile: targetVoiceProfile,
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

      return {
        eligible: reasons.length === 0,
        reasons,
      }
    },

    async executeConversion(input) {
      const { appSlug, request, targetVoiceProfile, sourceAudioBuffer, sourceMimeType } = input
      const now = new Date().toISOString()

      // Validate source audio
      const sourceValidation = validateSourceAudio({
        artifactId: request.sourceAudioArtifactId,
        appSlug,
        buffer: sourceAudioBuffer,
        declaredMimeType: sourceMimeType,
      })

      if (!sourceValidation.valid) {
        return {
          status: 'rejected',
          sourceAudioArtifactId: request.sourceAudioArtifactId,
          targetVoiceProfileId: request.targetVoiceProfileId,
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
        sourceAppSlug: appSlug,
        targetVoiceProfile,
        request,
        sourceAudioValidation: sourceValidation,
      })

      if (!eligibility.eligible) {
        return {
          status: 'rejected',
          sourceAudioArtifactId: request.sourceAudioArtifactId,
          targetVoiceProfileId: request.targetVoiceProfileId,
          evidence: {
            evidenceSource: 'local_fixture',
            liveProviderProof: false,
            targetProfileSnapshot: { status: targetVoiceProfile.status, rightsStatus: targetVoiceProfile.rightsStatus },
          },
          error: eligibility.reasons.join('; '),
          errorCode: 'ELIGIBILITY_FAILED',
          createdAt: now,
        }
      }

      // If no provider adapter, return blocked status
      if (!providerAdapter || !providerAdapter.supportsVoiceConversion) {
        return {
          status: 'blocked_by_account_access',
          sourceAudioArtifactId: request.sourceAudioArtifactId,
          targetVoiceProfileId: request.targetVoiceProfileId,
          provider: providerAdapter?.provider ?? 'unknown',
          evidence: {
            evidenceSource: 'local_fixture',
            liveProviderProof: false,
            providerSelected: providerAdapter?.provider,
            targetProfileSnapshot: { status: targetVoiceProfile.status, rightsStatus: targetVoiceProfile.rightsStatus },
          },
          error: 'Voice conversion provider route is not currently available',
          errorCode: 'PROVIDER_ACCOUNT_OR_ROUTE_REQUIRED',
          createdAt: now,
        }
      }

      // Submit to provider
      try {
        const providerResult = await providerAdapter.submitConversion({
          sourceAudioBuffer,
          sourceMimeType,
          targetVoiceProfileId: request.targetVoiceProfileId,
          language: request.language,
          preserveTiming: request.preserveTiming,
          outputFormat: request.outputFormat,
        })

        if (providerResult.status === 'blocked') {
          return {
            status: 'blocked_by_account_access',
            sourceAudioArtifactId: request.sourceAudioArtifactId,
            targetVoiceProfileId: request.targetVoiceProfileId,
            provider: providerAdapter.provider,
            providerResourceRef: providerResult.providerResourceRef,
            evidence: {
              evidenceSource: 'live_provider',
              liveProviderProof: false,
              providerSelected: providerAdapter.provider,
              sanitizedProviderRef: providerResult.providerResourceRef,
              targetProfileSnapshot: { status: targetVoiceProfile.status, rightsStatus: targetVoiceProfile.rightsStatus },
            },
            error: providerResult.error ?? 'Provider account access required',
            errorCode: providerResult.errorCode ?? 'PROVIDER_ACCOUNT_OR_ROUTE_REQUIRED',
            createdAt: now,
          }
        }

        if (providerResult.status === 'failed') {
          return {
            status: 'failed',
            sourceAudioArtifactId: request.sourceAudioArtifactId,
            targetVoiceProfileId: request.targetVoiceProfileId,
            provider: providerAdapter.provider,
            providerResourceRef: providerResult.providerResourceRef,
            evidence: {
              evidenceSource: 'live_provider',
              liveProviderProof: false,
              providerSelected: providerAdapter.provider,
              sanitizedProviderRef: providerResult.providerResourceRef,
              targetProfileSnapshot: { status: targetVoiceProfile.status, rightsStatus: targetVoiceProfile.rightsStatus },
            },
            error: providerResult.error ?? 'Provider submission failed',
            errorCode: providerResult.errorCode ?? 'PROVIDER_SUBMISSION_FAILED',
            createdAt: now,
          }
        }

        // Success
        return {
          status: providerResult.status === 'completed' ? 'completed' : 'accepted',
          voiceConversionId: crypto.randomUUID(),
          sourceAudioArtifactId: request.sourceAudioArtifactId,
          targetVoiceProfileId: request.targetVoiceProfileId,
          provider: providerAdapter.provider,
          providerResourceRef: providerResult.providerResourceRef,
          evidence: {
            evidenceSource: 'live_provider',
            liveProviderProof: providerResult.status === 'completed',
            providerSelected: providerAdapter.provider,
            sanitizedProviderRef: providerResult.providerResourceRef,
            targetProfileSnapshot: { status: targetVoiceProfile.status, rightsStatus: targetVoiceProfile.rightsStatus },
            outputValidation: { status: providerResult.status },
          },
          createdAt: now,
          completedAt: providerResult.status === 'completed' ? now : undefined,
        }
      } catch (error) {
        const message = error instanceof Error ? error.message : 'Unknown provider error'
        return {
          status: 'failed',
          sourceAudioArtifactId: request.sourceAudioArtifactId,
          targetVoiceProfileId: request.targetVoiceProfileId,
          provider: providerAdapter.provider,
          evidence: {
            evidenceSource: 'live_provider',
            liveProviderProof: false,
            providerSelected: providerAdapter.provider,
            targetProfileSnapshot: { status: targetVoiceProfile.status, rightsStatus: targetVoiceProfile.rightsStatus },
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

export function createFixtureVoiceConversionProviderAdapter(): VoiceConversionProviderAdapter {
  return {
    provider: 'fixture',
    supportsVoiceConversion: true,

    async submitConversion(request) {
      // Fixture-only: returns non-live provider reference
      return {
        providerJobRef: `fixture_conversion_${Date.now()}`,
        status: 'submitted',
        providerResourceRef: `fixture_resource_${request.targetVoiceProfileId}`,
      }
    },

    async pollConversion(_providerJobRef) {
      // Fixture-only: deterministic test output, never live provider proof
      return {
        status: 'completed',
        progress: 100,
        outputBuffer: Buffer.from('fixture_converted_audio'),
        outputMimeType: 'audio/wav',
        usage: { inputTokens: 0, outputTokens: 0, totalTokens: 0 },
        cost: { estimatedCost: 0, currency: 'USD', source: 'fixture' },
      }
    },
  }
}
