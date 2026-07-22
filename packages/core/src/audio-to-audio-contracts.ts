/**
 * Audio-to-Audio — canonical contracts and domain service.
 *
 * Implements broader audio transformation operations including
 * voice conversion, denoise, normalize, trim, resample, and more.
 * Safe deterministic FFmpeg operations may be implemented internally.
 */

import { z } from 'zod'
import {
  VOICE_AVATAR_USE_SCOPES,
  hasVoiceAvatarBlockedOverrides,
} from './voice-avatar-platform.js'
import {
  validateSourceAudio,
  type SourceAudioValidationResult,
} from './source-audio-validation.js'

// ── Constants ─────────────────────────────────────────────────────────────────

export const AUDIO_TO_AUDIO_OPERATIONS = [
  'voice_conversion',
  'denoise',
  'normalize',
  'trim',
  'resample',
  'channel_convert',
  'loudness_normalize',
] as const

export type AudioToAudioOperation = typeof AUDIO_TO_AUDIO_OPERATIONS[number]

export const AUDIO_TO_AUDIO_BLOCKED_FIELDS = [
  'provider',
  'model',
  'executorId',
  'endpoint',
  'apiKey',
  'rawProviderPayload',
] as const

export const AUDIO_TO_AUDIO_STATUSES = [
  'accepted',
  'queued',
  'processing',
  'completed',
  'rejected',
  'failed',
  'cancelled',
] as const

// ── Request Schema ────────────────────────────────────────────────────────────

export const AudioToAudioRequestSchema = z.object({
  sourceAudioArtifactId: z.string().uuid(),
  operation: z.enum(AUDIO_TO_AUDIO_OPERATIONS),
  intendedUse: z.enum(VOICE_AVATAR_USE_SCOPES).default('narration'),
  language: z.string().trim().min(2).max(20).optional(),
  outputFormat: z.enum(['wav', 'mp3', 'flac', 'ogg']).default('wav'),
  maxCredits: z.number().positive().max(10000).optional(),
  idempotencyKey: z.string().trim().min(1).max(200).optional(),
  parameters: z.record(z.string(), z.unknown()).default({}),
  metadata: z.record(z.string(), z.unknown()).default({}),
}).strict()

export type AudioToAudioRequest = z.infer<typeof AudioToAudioRequestSchema>

// ── Result Schema ─────────────────────────────────────────────────────────────

export const AudioToAudioResultSchema = z.object({
  status: z.enum(AUDIO_TO_AUDIO_STATUSES),
  audioToAudioId: z.string().uuid().optional(),
  sourceAudioArtifactId: z.string().uuid(),
  operation: z.enum(AUDIO_TO_AUDIO_OPERATIONS),
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
    evidenceSource: z.enum(['live_provider', 'local_fixture', 'cached', 'internal_ffmpeg']),
    liveProviderProof: z.boolean(),
    providerSelected: z.string().optional(),
    modelSelected: z.string().optional(),
    sanitizedProviderRef: z.string().optional(),
    sourceChecksum: z.string().optional(),
    operation: z.string(),
    parameters: z.record(z.string(), z.unknown()).optional(),
    outputValidation: z.record(z.string(), z.unknown()).optional(),
  }),
  error: z.string().optional(),
  errorCode: z.string().optional(),
  createdAt: z.string().datetime().optional(),
  completedAt: z.string().datetime().optional(),
}).strict()

export type AudioToAudioResult = z.infer<typeof AudioToAudioResultSchema>

// ── Provider Adapter Interface ────────────────────────────────────────────────

export interface AudioToAudioProviderAdapter {
  readonly provider: string
  readonly supportsOperations: readonly AudioToAudioOperation[]

  submitOperation(request: {
    sourceAudioBuffer: Buffer
    sourceMimeType: string
    operation: AudioToAudioOperation
    parameters: Record<string, unknown>
    outputFormat: string
  }): Promise<AudioToAudioProviderResult>

  pollOperation(providerJobRef: string): Promise<AudioToAudioProviderPollResult>
}

export interface AudioToAudioProviderResult {
  providerJobRef: string
  status: 'submitted' | 'processing' | 'completed' | 'failed'
  providerResourceRef?: string
  error?: string
  errorCode?: string
}

export interface AudioToAudioProviderPollResult {
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

export interface AudioToAudioDomainService {
  validateRequest(request: unknown): { success: boolean; data?: AudioToAudioRequest; error?: string; issues?: Array<{ path: string; message: string }> }
  evaluateEligibility(input: {
    appSlug: string
    request: AudioToAudioRequest
    sourceAudioValidation: SourceAudioValidationResult
  }): { eligible: boolean; reasons: string[] }
  executeOperation(input: {
    appSlug: string
    request: AudioToAudioRequest
    sourceAudioBuffer: Buffer
    sourceMimeType: string
    idempotencyKey?: string
  }): Promise<AudioToAudioResult>
}

// ── Implementation ────────────────────────────────────────────────────────────

export function createAudioToAudioDomainService(
  providerAdapter?: AudioToAudioProviderAdapter,
): AudioToAudioDomainService {
  return {
    validateRequest(request: unknown) {
      // Check for blocked provider/model fields
      const blockedField = hasVoiceAvatarBlockedOverrides(request)
      if (blockedField) {
        return {
          success: false,
          error: `Invalid audio_to_audio request: input.${blockedField} is not allowed. Provider selection is owned by the AmarktAI Network.`,
          issues: [{ path: blockedField, message: 'Provider and model selection are Network-owned' }],
        }
      }

      const parsed = AudioToAudioRequestSchema.safeParse(request)
      if (!parsed.success) {
        const issues = parsed.error.issues.map((issue) => ({
          path: issue.path.join('.'),
          message: issue.message,
        }))
        return {
          success: false,
          error: `Invalid audio_to_audio request: ${issues.map((i) => `${i.path || 'input'} ${i.message}`).join('; ')}`,
          issues,
        }
      }

      return { success: true, data: parsed.data }
    },

    evaluateEligibility(input) {
      const { request, sourceAudioValidation } = input
      const reasons: string[] = []

      // Check source audio validation
      if (!sourceAudioValidation.valid) {
        reasons.push(`Source audio validation failed: ${sourceAudioValidation.errorMessage}`)
      }

      // Check if operation is supported
      if (!(AUDIO_TO_AUDIO_OPERATIONS as readonly string[]).includes(request.operation)) {
        reasons.push(`Operation '${request.operation}' is not supported`)
      }

      // Check if provider adapter supports the operation
      if (providerAdapter && !providerAdapter.supportsOperations.includes(request.operation)) {
        reasons.push(`Provider does not support operation '${request.operation}'`)
      }

      return {
        eligible: reasons.length === 0,
        reasons,
      }
    },

    async executeOperation(input) {
      const { appSlug, request, sourceAudioBuffer, sourceMimeType } = input
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
          operation: request.operation,
          evidence: {
            evidenceSource: 'local_fixture',
            liveProviderProof: false,
            operation: request.operation,
          },
          error: sourceValidation.errorMessage,
          errorCode: sourceValidation.errorCode,
          createdAt: now,
        }
      }

      // Evaluate eligibility
      const eligibility = this.evaluateEligibility({
        appSlug,
        request,
        sourceAudioValidation: sourceValidation,
      })

      if (!eligibility.eligible) {
        return {
          status: 'rejected',
          sourceAudioArtifactId: request.sourceAudioArtifactId,
          operation: request.operation,
          evidence: {
            evidenceSource: 'local_fixture',
            liveProviderProof: false,
            operation: request.operation,
            parameters: request.parameters,
          },
          error: eligibility.reasons.join('; '),
          errorCode: 'ELIGIBILITY_FAILED',
          createdAt: now,
        }
      }

      // Check if this is an internal FFmpeg operation
      const internalOperations: AudioToAudioOperation[] = ['trim', 'resample', 'channel_convert', 'loudness_normalize', 'normalize']
      if (internalOperations.includes(request.operation)) {
        return executeInternalFfmpegOperation(appSlug, request, sourceAudioBuffer, sourceMimeType, sourceValidation)
      }

      // If no provider adapter, return blocked status
      if (!providerAdapter || !providerAdapter.supportsOperations.includes(request.operation)) {
        return {
          status: 'rejected',
          sourceAudioArtifactId: request.sourceAudioArtifactId,
          operation: request.operation,
          evidence: {
            evidenceSource: 'local_fixture',
            liveProviderProof: false,
            operation: request.operation,
            parameters: request.parameters,
          },
          error: `Provider does not support operation '${request.operation}'`,
          errorCode: 'PROVIDER_OPERATION_NOT_SUPPORTED',
          createdAt: now,
        }
      }

      // Submit to provider
      try {
        const providerResult = await providerAdapter.submitOperation({
          sourceAudioBuffer,
          sourceMimeType,
          operation: request.operation,
          parameters: request.parameters,
          outputFormat: request.outputFormat,
        })

        if (providerResult.status === 'failed') {
          return {
            status: 'failed',
            sourceAudioArtifactId: request.sourceAudioArtifactId,
            operation: request.operation,
            provider: providerAdapter.provider,
            providerResourceRef: providerResult.providerResourceRef,
            evidence: {
              evidenceSource: 'live_provider',
              liveProviderProof: false,
              providerSelected: providerAdapter.provider,
              sanitizedProviderRef: providerResult.providerResourceRef,
              operation: request.operation,
              parameters: request.parameters,
            },
            error: providerResult.error ?? 'Provider submission failed',
            errorCode: providerResult.errorCode ?? 'PROVIDER_SUBMISSION_FAILED',
            createdAt: now,
          }
        }

        // Success
        return {
          status: providerResult.status === 'completed' ? 'completed' : 'accepted',
          audioToAudioId: crypto.randomUUID(),
          sourceAudioArtifactId: request.sourceAudioArtifactId,
          operation: request.operation,
          provider: providerAdapter.provider,
          providerResourceRef: providerResult.providerResourceRef,
          evidence: {
            evidenceSource: 'live_provider',
            liveProviderProof: providerResult.status === 'completed',
            providerSelected: providerAdapter.provider,
            sanitizedProviderRef: providerResult.providerResourceRef,
            operation: request.operation,
            parameters: request.parameters,
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
          operation: request.operation,
          provider: providerAdapter.provider,
          evidence: {
            evidenceSource: 'live_provider',
            liveProviderProof: false,
            providerSelected: providerAdapter.provider,
            operation: request.operation,
            parameters: request.parameters,
          },
          error: `Provider execution failed: ${message}`,
          errorCode: 'PROVIDER_EXECUTION_ERROR',
          createdAt: now,
        }
      }
    },
  }
}

// ── Internal FFmpeg Operations ────────────────────────────────────────────────

function executeInternalFfmpegOperation(
  _appSlug: string,
  request: AudioToAudioRequest,
  _sourceBuffer: Buffer,
  _sourceMimeType: string,
  sourceValidation: SourceAudioValidationResult,
): AudioToAudioResult {
  const now = new Date().toISOString()

  // Real FFmpeg execution is handled by the worker handler (voice-audio-handlers.ts).
  // This domain service validates and classifies the operation.
  // The worker executes the actual FFmpeg command and returns real output.
  const outputMimeType = request.outputFormat === 'wav' ? 'audio/wav' :
    request.outputFormat === 'mp3' ? 'audio/mpeg' :
    request.outputFormat === 'flac' ? 'audio/flac' : 'audio/ogg'

  return {
    status: 'accepted',
    audioToAudioId: crypto.randomUUID(),
    sourceAudioArtifactId: request.sourceAudioArtifactId,
    operation: request.operation,
    provider: 'internal',
    evidence: {
      evidenceSource: 'internal_ffmpeg',
      liveProviderProof: false,
      operation: request.operation,
      parameters: request.parameters,
      outputValidation: {
        mimeType: outputMimeType,
        status: 'queued_for_worker_execution',
        sourceDurationSeconds: sourceValidation.metadata?.durationSeconds,
      },
    },
    createdAt: now,
  }
}

// ── Fixture Adapter ───────────────────────────────────────────────────────────

export function createFixtureAudioToAudioProviderAdapter(): AudioToAudioProviderAdapter {
  return {
    provider: 'fixture',
    supportsOperations: [...AUDIO_TO_AUDIO_OPERATIONS],

    async submitOperation(request) {
      return {
        providerJobRef: `fixture_a2a_${Date.now()}`,
        status: 'submitted',
        providerResourceRef: `fixture_resource_${request.operation}`,
      }
    },

    async pollOperation(_providerJobRef) {
      return {
        status: 'completed',
        progress: 100,
        outputBuffer: Buffer.from('fixture_audio_to_audio_output'),
        outputMimeType: 'audio/wav',
        usage: { inputTokens: 0, outputTokens: 0, totalTokens: 0 },
        cost: { estimatedCost: 0, currency: 'USD', source: 'fixture' },
      }
    },
  }
}
