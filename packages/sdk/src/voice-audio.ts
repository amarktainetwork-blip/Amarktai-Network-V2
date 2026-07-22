export interface VoiceAudioClientOptions {
  apiKey: string
  baseUrl?: string
  fetch?: typeof globalThis.fetch
}

export type VoiceAudioUseScope =
  | 'narration'
  | 'conversational_agent'
  | 'marketing'
  | 'education'
  | 'accessibility'
  | 'customer_support'
  | 'avatar_performance'
  | 'internal_production'

export interface VoiceCloneRequest {
  sourceAudioArtifactId: string
  voiceProfileId: string
  language: string
  locale?: string
  intendedUse: VoiceAudioUseScope
  consentEvidenceReference: string
  rightsDeclarationReference: string
  qualityProfile?: 'standard' | 'high' | 'premium'
  maxCredits?: number
  idempotencyKey?: string
  metadata?: Record<string, unknown>
}

export interface VoiceConversionRequest {
  sourceAudioArtifactId: string
  targetVoiceProfileId: string
  intendedUse: VoiceAudioUseScope
  language?: string
  locale?: string
  preserveTiming?: boolean
  outputFormat?: 'wav' | 'mp3' | 'flac' | 'ogg'
  maxCredits?: number
  idempotencyKey?: string
  metadata?: Record<string, unknown>
}

export type AudioTransformOperation =
  | 'voice_conversion'
  | 'denoise'
  | 'normalize'
  | 'trim'
  | 'resample'
  | 'channel_convert'
  | 'loudness_normalize'

export interface AudioTransformRequest {
  sourceAudioArtifactId: string
  operation: AudioTransformOperation
  intendedUse?: VoiceAudioUseScope
  language?: string
  outputFormat?: 'wav' | 'mp3' | 'flac' | 'ogg'
  maxCredits?: number
  idempotencyKey?: string
  parameters?: Record<string, unknown>
  metadata?: Record<string, unknown>
}

export interface VoiceAudioEvidence {
  evidenceSource: 'live_provider' | 'local_fixture' | 'cached' | 'platform_policy' | 'executor_unavailable' | 'internal_ffmpeg'
  liveProviderProof: boolean
  blocker?: string
  idempotent?: boolean
  operation?: string
  [key: string]: unknown
}

export interface VoiceCloneExecution {
  status: string
  voiceCloneId?: string
  voiceProfileId: string
  provider?: string
  outputArtifactId?: string
  evidence: VoiceAudioEvidence
  error?: string
  errorCode?: string
  createdAt?: string
  completedAt?: string
}

export interface VoiceConversionExecution {
  status: string
  voiceConversionId?: string
  sourceAudioArtifactId: string
  targetVoiceProfileId: string
  provider?: string
  outputArtifactId?: string
  evidence: VoiceAudioEvidence
  error?: string
  errorCode?: string
  createdAt?: string
  completedAt?: string
}

export interface AudioTransformExecution {
  status: string
  audioToAudioId?: string
  sourceAudioArtifactId: string
  operation: AudioTransformOperation
  provider?: string
  outputArtifactId?: string
  evidence: VoiceAudioEvidence
  error?: string
  errorCode?: string
  createdAt?: string
  completedAt?: string
}

export class VoiceAudioSdkError extends Error {
  constructor(
    public readonly status: number,
    public readonly code: string,
    message: string,
    public readonly responseBody?: unknown,
  ) {
    super(message)
    this.name = 'VoiceAudioSdkError'
  }
}

/**
 * Typed client for the governed voice/audio execution routes.
 *
 * A 422 response containing a durable failed execution is returned to the
 * caller because it includes the inspectable blocker Job ID and evidence.
 * Authentication, policy, validation, ownership, and unexpected server errors
 * continue to throw VoiceAudioSdkError.
 */
export class AmarktAIVoiceAudioClient {
  private readonly apiKey: string
  private readonly baseUrl: string
  private readonly transport: typeof globalThis.fetch

  constructor(options: VoiceAudioClientOptions) {
    if (!options.apiKey?.trim()) throw new Error('apiKey is required')
    this.apiKey = options.apiKey
    this.baseUrl = (options.baseUrl ?? 'https://network.amarktai.com').replace(/\/$/, '')
    this.transport = options.fetch ?? globalThis.fetch
  }

  cloneVoice(payload: VoiceCloneRequest): Promise<VoiceCloneExecution> {
    return this.request('/api/v1/voice-clone', { method: 'POST', body: JSON.stringify(payload) }, [422])
  }

  voiceClone(executionId: string): Promise<VoiceCloneExecution> {
    return this.request(`/api/v1/voice-clone/${encodeURIComponent(executionId)}`)
  }

  cancelVoiceClone(executionId: string): Promise<unknown> {
    return this.request(`/api/v1/voice-clone/${encodeURIComponent(executionId)}/cancel`, { method: 'POST' })
  }

  convertVoice(payload: VoiceConversionRequest): Promise<VoiceConversionExecution> {
    return this.request('/api/v1/voice-conversion', { method: 'POST', body: JSON.stringify(payload) }, [422])
  }

  voiceConversion(executionId: string): Promise<VoiceConversionExecution> {
    return this.request(`/api/v1/voice-conversion/${encodeURIComponent(executionId)}`)
  }

  cancelVoiceConversion(executionId: string): Promise<unknown> {
    return this.request(`/api/v1/voice-conversion/${encodeURIComponent(executionId)}/cancel`, { method: 'POST' })
  }

  transformAudio(payload: AudioTransformRequest): Promise<AudioTransformExecution> {
    return this.request('/api/v1/audio-to-audio', { method: 'POST', body: JSON.stringify(payload) }, [422])
  }

  audioTransform(executionId: string): Promise<AudioTransformExecution> {
    return this.request(`/api/v1/audio-to-audio/${encodeURIComponent(executionId)}`)
  }

  audioTransformEvidence(executionId: string): Promise<{ audioToAudioId: string; evidence: VoiceAudioEvidence }> {
    return this.request(`/api/v1/audio-to-audio/${encodeURIComponent(executionId)}/evidence`)
  }

  cancelAudioTransform(executionId: string): Promise<unknown> {
    return this.request(`/api/v1/audio-to-audio/${encodeURIComponent(executionId)}/cancel`, { method: 'POST' })
  }

  private async request<T>(path: string, init: RequestInit = {}, acceptedErrorStatuses: number[] = []): Promise<T> {
    const response = await this.transport(`${this.baseUrl}${path}`, {
      ...init,
      headers: {
        Authorization: `Bearer ${this.apiKey}`,
        Accept: 'application/json',
        'Content-Type': 'application/json',
        ...init.headers,
      },
    })
    const body = await response.json().catch(() => ({})) as Record<string, unknown>
    if (response.ok || acceptedErrorStatuses.includes(response.status)) return body as T
    throw new VoiceAudioSdkError(
      response.status,
      String(body.code ?? body.errorCode ?? 'REQUEST_FAILED'),
      String(body.message ?? body.error ?? `Request failed (${response.status})`),
      body,
    )
  }
}
