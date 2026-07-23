import { CAPABILITY_BY_KEY, type CapabilityKey } from './capabilities.js'

export type InternalExecutionEngine = 'ffmpeg'
export type InternalEvidenceSource = 'internal_ffmpeg'

export interface InternalExecutorRegistration {
  id: string
  capability: CapabilityKey
  engine: InternalExecutionEngine
  handlerName: string
  dispatchPath: string
  acceptedRequestContract: string
  outputContract: string
  sourceArtifactRequired: boolean
  artifactOutput: 'audio' | 'image' | null
  executionMode: 'queued'
  evidenceSource: InternalEvidenceSource
  infrastructure: readonly string[]
  fixtureProof: string
}

/**
 * Canonical internal atomic executors.
 *
 * These operations are implemented by the AmarktAI runtime itself and do not
 * use provider credentials, provider models, or Orchestra routing. A capability
 * belongs here only when the API, immutable grant, queue, worker handler,
 * artifact persistence and authoritative fixture all exist.
 */
export const INTERNAL_EXECUTOR_REGISTRATIONS = [
  {
    id: 'internal.ffmpeg.audio-to-audio',
    capability: 'audio_to_audio',
    engine: 'ffmpeg',
    handlerName: 'handleAudioToAudioJob',
    dispatchPath: 'executeWithDurableProviderFallback -> handleAudioToAudioJob',
    acceptedRequestContract: CAPABILITY_BY_KEY.audio_to_audio.inputContractReference,
    outputContract: CAPABILITY_BY_KEY.audio_to_audio.outputContractReference,
    sourceArtifactRequired: true,
    artifactOutput: 'audio',
    executionMode: 'queued',
    evidenceSource: 'internal_ffmpeg',
    infrastructure: ['mariadb', 'redis', 'worker', 'artifact_storage', 'ffmpeg'],
    fixtureProof: 'VOICE_AUDIO_RELEASE_FIXTURE',
  },
  {
    id: 'internal.ffmpeg.image-upscale',
    capability: 'image_upscale',
    engine: 'ffmpeg',
    handlerName: 'handleImageUpscaleJob',
    dispatchPath: 'executeWithDurableProviderFallback -> handleImageUpscaleJob',
    acceptedRequestContract: CAPABILITY_BY_KEY.image_upscale.inputContractReference,
    outputContract: CAPABILITY_BY_KEY.image_upscale.outputContractReference,
    sourceArtifactRequired: true,
    artifactOutput: 'image',
    executionMode: 'queued',
    evidenceSource: 'internal_ffmpeg',
    infrastructure: ['mariadb', 'redis', 'worker', 'artifact_storage', 'ffmpeg'],
    fixtureProof: 'IMAGE_UPSCALE_RELEASE_FIXTURE',
  },
] as const satisfies readonly InternalExecutorRegistration[]

export function getInternalExecutorRegistration(capability: CapabilityKey): InternalExecutorRegistration | undefined {
  return INTERNAL_EXECUTOR_REGISTRATIONS.find((registration) => registration.capability === capability)
}

export function hasInternalExecutorRegistration(capability: CapabilityKey): boolean {
  return getInternalExecutorRegistration(capability) !== undefined
}
