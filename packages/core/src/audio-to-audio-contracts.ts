import { randomUUID } from 'node:crypto'
import { z } from 'zod'
import { VOICE_AVATAR_USE_SCOPES, hasVoiceAvatarBlockedOverrides } from './voice-avatar-platform.js'
import { validateSourceAudio, type SourceAudioValidationResult } from './source-audio-validation.js'

export const AUDIO_TO_AUDIO_OPERATIONS = [
  'voice_conversion', 'denoise', 'normalize', 'trim', 'resample', 'channel_convert', 'loudness_normalize',
] as const
export type AudioToAudioOperation = typeof AUDIO_TO_AUDIO_OPERATIONS[number]

export const INTERNAL_FFMPEG_AUDIO_OPERATIONS = [
  'normalize', 'trim', 'resample', 'channel_convert', 'loudness_normalize',
] as const satisfies readonly AudioToAudioOperation[]

export const AUDIO_TO_AUDIO_BLOCKED_FIELDS = [
  'provider', 'model', 'executorId', 'endpoint', 'apiKey', 'rawProviderPayload',
] as const

export const AUDIO_TO_AUDIO_STATUSES = [
  'accepted', 'queued', 'processing', 'completed', 'rejected', 'failed', 'cancelled',
] as const

export const AUDIO_TO_AUDIO_EVIDENCE_SOURCES = [
  'live_provider', 'local_fixture', 'cached', 'internal_ffmpeg', 'platform_policy', 'executor_unavailable',
] as const

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

export const AudioToAudioResultSchema = z.object({
  status: z.enum(AUDIO_TO_AUDIO_STATUSES),
  audioToAudioId: z.string().uuid().optional(),
  sourceAudioArtifactId: z.string().uuid(),
  operation: z.enum(AUDIO_TO_AUDIO_OPERATIONS),
  provider: z.string().optional(),
  model: z.string().optional(),
  providerResourceRef: z.string().optional(),
  outputArtifactId: z.string().uuid().optional(),
  usage: z.record(z.string(), z.unknown()).optional(),
  cost: z.record(z.string(), z.unknown()).optional(),
  evidence: z.object({
    evidenceSource: z.enum(AUDIO_TO_AUDIO_EVIDENCE_SOURCES),
    liveProviderProof: z.boolean(),
    providerSelected: z.string().optional(),
    modelSelected: z.string().optional(),
    sanitizedProviderRef: z.string().optional(),
    sourceChecksum: z.string().optional(),
    operation: z.string(),
    parameters: z.record(z.string(), z.unknown()).optional(),
    outputValidation: z.record(z.string(), z.unknown()).optional(),
    blocker: z.string().optional(),
    idempotent: z.boolean().optional(),
  }).passthrough(),
  error: z.string().optional(),
  errorCode: z.string().optional(),
  createdAt: z.string().datetime().optional(),
  completedAt: z.string().datetime().optional(),
}).strict()

export type AudioToAudioResult = z.infer<typeof AudioToAudioResultSchema>

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

function validationFailure(error: z.ZodError) {
  const issues = error.issues.map((issue) => ({ path: issue.path.join('.'), message: issue.message }))
  return { success: false as const, error: `Invalid audio_to_audio request: ${issues.map((issue) => `${issue.path || 'input'} ${issue.message}`).join('; ')}`, issues }
}

export function createAudioToAudioDomainService(providerAdapter?: AudioToAudioProviderAdapter): AudioToAudioDomainService {
  return {
    validateRequest(request) {
      const blockedField = hasVoiceAvatarBlockedOverrides(request)
      if (blockedField) {
        return {
          success: false,
          error: `Invalid audio_to_audio request: input.${blockedField} is not allowed. Provider selection is owned by the AmarktAI Network.`,
          issues: [{ path: blockedField, message: 'Provider and model selection are Network-owned' }],
        }
      }
      const parsed = AudioToAudioRequestSchema.safeParse(request)
      return parsed.success ? { success: true, data: parsed.data } : validationFailure(parsed.error)
    },

    evaluateEligibility({ request, sourceAudioValidation }) {
      const reasons: string[] = []
      if (!sourceAudioValidation.valid) reasons.push(`Source audio validation failed: ${sourceAudioValidation.errorMessage}`)
      if (!AUDIO_TO_AUDIO_OPERATIONS.includes(request.operation)) reasons.push(`Operation '${request.operation}' is not supported`)
      if (providerAdapter && !providerAdapter.supportsOperations.includes(request.operation)) {
        reasons.push(`Provider does not support operation '${request.operation}'`)
      }
      return { eligible: reasons.length === 0, reasons }
    },

    async executeOperation({ appSlug, request, sourceAudioBuffer, sourceMimeType }) {
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
          operation: request.operation,
          evidence: { evidenceSource: 'platform_policy', liveProviderProof: false, operation: request.operation },
          error: sourceValidation.errorMessage, errorCode: sourceValidation.errorCode, createdAt: now,
        }
      }
      const eligibility = this.evaluateEligibility({ appSlug, request, sourceAudioValidation: sourceValidation })
      if (!eligibility.eligible) {
        return {
          status: 'rejected', sourceAudioArtifactId: request.sourceAudioArtifactId,
          operation: request.operation,
          evidence: {
            evidenceSource: 'platform_policy', liveProviderProof: false,
            operation: request.operation, parameters: request.parameters,
          },
          error: eligibility.reasons.join('; '), errorCode: 'ELIGIBILITY_FAILED', createdAt: now,
        }
      }
      if ((INTERNAL_FFMPEG_AUDIO_OPERATIONS as readonly string[]).includes(request.operation)) {
        return {
          status: 'accepted', audioToAudioId: randomUUID(),
          sourceAudioArtifactId: request.sourceAudioArtifactId, operation: request.operation,
          provider: 'internal', model: 'ffmpeg',
          evidence: {
            evidenceSource: 'internal_ffmpeg', liveProviderProof: false,
            operation: request.operation, parameters: request.parameters,
            sourceChecksum: sourceValidation.checksum,
            outputValidation: { pendingWorkerExecution: true },
          },
          createdAt: now,
        }
      }
      if (!providerAdapter || !providerAdapter.supportsOperations.includes(request.operation)) {
        return {
          status: 'failed', sourceAudioArtifactId: request.sourceAudioArtifactId,
          operation: request.operation,
          evidence: {
            evidenceSource: 'executor_unavailable', liveProviderProof: false,
            blocker: 'AUDIO_OPERATION_EXECUTOR_UNAVAILABLE',
            operation: request.operation, parameters: request.parameters,
          },
          error: `No production executor is available for '${request.operation}'`,
          errorCode: 'AUDIO_OPERATION_EXECUTOR_UNAVAILABLE', createdAt: now,
        }
      }
      try {
        const result = await providerAdapter.submitOperation({
          sourceAudioBuffer, sourceMimeType, operation: request.operation,
          parameters: request.parameters, outputFormat: request.outputFormat,
        })
        const fixture = providerAdapter.provider === 'fixture'
        if (result.status === 'failed') {
          return {
            status: 'failed', sourceAudioArtifactId: request.sourceAudioArtifactId,
            operation: request.operation, provider: providerAdapter.provider,
            providerResourceRef: result.providerResourceRef,
            evidence: {
              evidenceSource: fixture ? 'local_fixture' : 'live_provider', liveProviderProof: false,
              providerSelected: providerAdapter.provider, sanitizedProviderRef: result.providerResourceRef,
              operation: request.operation, parameters: request.parameters,
            },
            error: result.error ?? 'Provider submission failed',
            errorCode: result.errorCode ?? 'PROVIDER_SUBMISSION_FAILED', createdAt: now,
          }
        }
        return {
          status: result.status === 'completed' ? 'completed' : 'accepted',
          audioToAudioId: randomUUID(), sourceAudioArtifactId: request.sourceAudioArtifactId,
          operation: request.operation, provider: providerAdapter.provider,
          providerResourceRef: result.providerResourceRef,
          evidence: {
            evidenceSource: fixture ? 'local_fixture' : 'live_provider',
            liveProviderProof: !fixture && result.status === 'completed',
            providerSelected: providerAdapter.provider, sanitizedProviderRef: result.providerResourceRef,
            operation: request.operation, parameters: request.parameters,
            outputValidation: { status: result.status },
          },
          createdAt: now, completedAt: result.status === 'completed' ? now : undefined,
        }
      } catch (error) {
        const message = error instanceof Error ? error.message : 'Unknown provider error'
        return {
          status: 'failed', sourceAudioArtifactId: request.sourceAudioArtifactId,
          operation: request.operation, provider: providerAdapter.provider,
          evidence: {
            evidenceSource: 'live_provider', liveProviderProof: false,
            providerSelected: providerAdapter.provider, operation: request.operation,
          },
          error: `Provider execution failed: ${message}`, errorCode: 'PROVIDER_EXECUTION_ERROR', createdAt: now,
        }
      }
    },
  }
}

export function createFixtureAudioToAudioProviderAdapter(): AudioToAudioProviderAdapter {
  return {
    provider: 'fixture',
    supportsOperations: AUDIO_TO_AUDIO_OPERATIONS,
    async submitOperation(request) {
      return { providerJobRef: `fixture_job_${Date.now()}`, status: 'submitted', providerResourceRef: `fixture_audio_${request.operation}` }
    },
    async pollOperation() {
      return {
        status: 'completed', progress: 100, outputBuffer: Buffer.from('fixture_audio_output'),
        outputMimeType: 'audio/wav', usage: { inputTokens: 0, outputTokens: 0, totalTokens: 0 },
        cost: { estimatedCost: 0, currency: 'USD', source: 'fixture' },
      }
    },
  }
}
