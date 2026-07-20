import { CAPABILITY_BY_KEY, type CapabilityKey } from './capabilities.js'
import type { ProviderKey } from './providers.js'

export type StructuredOutputMode = 'none' | 'json_object' | 'json_schema'

export type ExecutorId =
  | 'deepinfra.chat'
  | 'deepinfra.streaming-chat'
  | 'deepinfra.text-transform'
  | 'deepinfra.task-inference'
  | 'deepinfra.embeddings'
  | 'deepinfra.reranking'
  | 'together.chat'
  | 'together.streaming-chat'
  | 'together.embeddings'
  | 'together.reranking'
  | 'together.image-generation'
  | 'together.tts'
  | 'together.stt'
  | 'genx.chat'
  | 'genx.streaming-chat'
  | 'genx.video-generation'
  | 'genx.image-to-video'
  | 'genx.video-to-video'
  | 'genx.music-generation'
  | 'genx.song-generation'
  | 'genx.tts'
  | 'genx.stt'

/** A reusable transport/task contract. No production model ID belongs here. */
export interface ExecutorCompatibilityProfile {
  taskTypes: readonly string[]
  categories: readonly string[]
  transportProfiles: readonly string[]
  endpointFamilies: readonly string[]
  requiredInputModalities: readonly string[]
  outputModality: string
}

export interface ExecutorModelMetadata {
  category?: string | null
  taskType?: string | null
  capabilities?: readonly string[]
  modalitiesIn?: readonly string[]
  modalitiesOut?: readonly string[]
  transportProfile?: string | null
  endpointFamily?: string | null
  endpointShapeKnown?: boolean
  requestShapeKnown?: boolean
  responseShapeKnown?: boolean
  providerClientExists?: boolean
  workerExecutorExists?: boolean
  streamingSupported?: boolean
  structuredOutputModes?: readonly StructuredOutputMode[]
  supportedParameters?: readonly string[]
  requestContract?: string | null
}

export type CapabilityMatchMode = 'exact' | 'semantic_text_fallback'

export interface ExecutorRegistration {
  id: ExecutorId
  provider: ProviderKey
  capability: CapabilityKey
  handlerName: string
  acceptedRequestContract: string
  outputContract: string
  modelCompatibility: 'transport_task_profile'
  /** Retained as an empty compatibility field for old snapshots. Never an allowlist. */
  compatibleModels: readonly string[]
  compatibilityProfile: ExecutorCompatibilityProfile
  sourceArtifactRequired: boolean
  artifactOutput: string | null
  executionMode: 'sync' | 'queued' | 'stream'
  capabilityMatchMode: CapabilityMatchMode
}

const GENERAL_TEXT_CAPABILITIES: readonly CapabilityKey[] = [
  'chat', 'reasoning', 'code', 'summarization', 'translation', 'question_answering',
  'classification', 'extraction', 'structured_output', 'tool_use',
]

// Only tasks with a real request builder and validated response normalizer are
// registered. Other discovered specialist tasks remain visible with the exact
// provider task metadata, but do not falsely acquire a callable executor.
const SPECIALIST_CAPABILITIES: readonly CapabilityKey[] = [
  'zero_shot_classification', 'token_classification', 'fill_mask', 'table_qa',
]

const OPENAI_CHAT_PROFILE: ExecutorCompatibilityProfile = {
  taskTypes: ['text', 'text-generation', 'chat', 'code', 'reasoning'],
  categories: ['text', 'text-generation', 'chat', 'code'],
  transportProfiles: ['openai_chat_sse'],
  endpointFamilies: ['openai_chat'],
  requiredInputModalities: ['text'],
  outputModality: 'text',
}

const NATIVE_TASK_PROFILE: ExecutorCompatibilityProfile = {
  taskTypes: ['zero-shot-classification', 'token-classification', 'fill-mask', 'table-question-answering'],
  categories: ['zero-shot-classification', 'token-classification', 'fill-mask', 'table-question-answering'],
  transportProfiles: ['native_inference_json', 'native_inference_binary'],
  endpointFamilies: ['native_inference'],
  requiredInputModalities: [],
  outputModality: 'json',
}

function registration(
  id: ExecutorId,
  provider: ProviderKey,
  capability: CapabilityKey,
  handlerName: string,
  profile: ExecutorCompatibilityProfile,
  executionMode: 'sync' | 'queued' | 'stream' = 'queued',
  capabilityMatchMode: CapabilityMatchMode = 'exact',
): ExecutorRegistration {
  const definition = CAPABILITY_BY_KEY[capability]
  return {
    id,
    provider,
    capability,
    handlerName,
    acceptedRequestContract: definition.inputContractReference,
    outputContract: definition.outputContractReference,
    modelCompatibility: 'transport_task_profile',
    compatibleModels: [],
    compatibilityProfile: profile,
    sourceArtifactRequired: definition.requiresSourceArtifact || capability === 'stt',
    artifactOutput: definition.artifactType,
    executionMode,
    capabilityMatchMode,
  }
}

function profile(
  taskTypes: readonly string[],
  categories: readonly string[],
  transports: readonly string[],
  endpoints: readonly string[],
  inputs: readonly string[],
  output: string,
): ExecutorCompatibilityProfile {
  return { taskTypes, categories, transportProfiles: transports, endpointFamilies: endpoints, requiredInputModalities: inputs, outputModality: output }
}

const DEEPINFRA_TEXT = { ...OPENAI_CHAT_PROFILE, endpointFamilies: ['openai_chat', 'deepinfra_openai_v1'] }
const TOGETHER_TEXT = { ...OPENAI_CHAT_PROFILE, endpointFamilies: ['openai_chat', 'together_openai_v1'] }
const GENX_TEXT = { ...OPENAI_CHAT_PROFILE, transportProfiles: ['openai_chat_sse', 'anthropic_messages_sse'], endpointFamilies: ['openai_chat', 'anthropic_messages'] }
const EMBEDDINGS = profile(
  ['embedding', 'embeddings', 'feature-extraction', 'sentence-similarity'],
  ['embedding', 'embeddings', 'feature-extraction', 'sentence-similarity'],
  ['native_inference_json'], ['embeddings'], ['text'], 'embedding',
)
const RERANK = profile(['rerank', 'reranker'], ['rerank', 'reranker', 'reranking'], ['native_inference_json'], ['rerank', 'native_inference'], ['text'], 'json')
const IMAGE = profile(['image', 'text-to-image', 'image-generation'], ['image', 'text-to-image'], ['native_inference_json', 'native_inference_binary'], ['image_generation', 'native_inference'], ['text'], 'image')
const TOGETHER_TTS = profile(['text-to-speech', 'tts', 'audio'], ['text-to-speech', 'tts', 'audio'], ['openai_audio_speech_binary'], ['audio_speech'], ['text'], 'audio')
const TOGETHER_STT = profile(['automatic-speech-recognition', 'transcription', 'stt', 'audio'], ['transcription', 'stt', 'audio'], ['openai_audio_transcription_multipart'], ['audio_transcriptions'], ['audio'], 'text')
const GENX_ASYNC = (tasks: readonly string[], categories: readonly string[], inputs: readonly string[], output: string) =>
  profile(tasks, categories, ['async_job_poll'], ['genx_generation_v1'], inputs, output)

/**
 * Canonical executable support is transport/task based. Discovery can make a
 * newly released model compatible without a source change, but only after the
 * exact request, response, client and worker evidence flags are true.
 */
export const EXECUTOR_REGISTRATIONS: readonly ExecutorRegistration[] = [
  registration('deepinfra.chat', 'deepinfra', 'chat', 'executeValidatedTextCapability', DEEPINFRA_TEXT),
  registration('deepinfra.streaming-chat', 'deepinfra', 'streaming_chat', 'executeAuthenticatedStreamingChat', DEEPINFRA_TEXT, 'stream'),
  ...GENERAL_TEXT_CAPABILITIES.filter((capability) => capability !== 'chat').map((capability) =>
    registration('deepinfra.text-transform', 'deepinfra', capability, 'executeValidatedTextCapability', DEEPINFRA_TEXT),
  ),
  ...SPECIALIST_CAPABILITIES.map((capability) =>
    registration('deepinfra.task-inference', 'deepinfra', capability, 'executeDeepInfraTaskCapability', NATIVE_TASK_PROFILE),
  ),
  ...SPECIALIST_CAPABILITIES.map((capability) =>
    registration('deepinfra.text-transform', 'deepinfra', capability, 'executeValidatedTextCapability', DEEPINFRA_TEXT, 'queued', 'semantic_text_fallback'),
  ),
  ...(['feature_extraction', 'sentence_similarity', 'embeddings'] as const).map((capability) => registration('deepinfra.embeddings', 'deepinfra', capability, 'executeEmbeddingsCapability', EMBEDDINGS)),
  registration('deepinfra.reranking', 'deepinfra', 'reranking', 'executeRerankingCapability', RERANK),

  ...GENERAL_TEXT_CAPABILITIES.map((capability) => registration('together.chat', 'together', capability, 'executeValidatedTextCapability', TOGETHER_TEXT)),
  registration('together.streaming-chat', 'together', 'streaming_chat', 'executeAuthenticatedStreamingChat', TOGETHER_TEXT, 'stream'),
  ...(['feature_extraction', 'sentence_similarity', 'embeddings'] as const).map((capability) => registration('together.embeddings', 'together', capability, 'executeEmbeddingsCapability', EMBEDDINGS)),
  registration('together.reranking', 'together', 'reranking', 'executeRerankingCapability', RERANK),
  registration('together.image-generation', 'together', 'image_generation', 'executeTogetherImage', IMAGE),
  registration('together.tts', 'together', 'tts', 'executeTogetherTts', TOGETHER_TTS),
  registration('together.stt', 'together', 'stt', 'executeTogetherStt', TOGETHER_STT),

  ...GENERAL_TEXT_CAPABILITIES.map((capability) => registration('genx.chat', 'genx', capability, 'executeValidatedTextCapability', GENX_TEXT)),
  registration('genx.streaming-chat', 'genx', 'streaming_chat', 'executeAuthenticatedStreamingChat', GENX_TEXT, 'stream'),
  registration('genx.video-generation', 'genx', 'video_generation', 'executeGenxVideo', GENX_ASYNC(['video', 'text-to-video'], ['video'], ['text'], 'video')),
  registration('genx.image-to-video', 'genx', 'image_to_video', 'executeGenxVideo', GENX_ASYNC(['video', 'image-to-video'], ['video'], ['text', 'image'], 'video')),
  registration('genx.video-to-video', 'genx', 'video_to_video', 'executeGenxVideo', GENX_ASYNC(['video', 'video-to-video'], ['video'], ['text', 'video'], 'video')),
  registration('genx.music-generation', 'genx', 'music_generation', 'executeGenxMusic', GENX_ASYNC(['music', 'text-to-music', 'audio'], ['music', 'audio', 'text-to-music'], ['text'], 'audio')),
  registration('genx.song-generation', 'genx', 'song_generation', 'executeGenxMusic', GENX_ASYNC(['song', 'music', 'text-to-music'], ['song', 'music', 'audio'], ['text'], 'audio')),
  registration('genx.tts', 'genx', 'tts', 'executeGenxTts', GENX_ASYNC(['text-to-speech', 'tts', 'voice'], ['tts', 'voice', 'audio'], ['text'], 'audio')),
  registration('genx.stt', 'genx', 'stt', 'executeGenxStt', GENX_ASYNC(['automatic-speech-recognition', 'transcription', 'stt'], ['transcription', 'stt', 'audio'], ['audio'], 'text')),
] as const

export function getExecutorRegistrations(capability?: CapabilityKey, provider?: ProviderKey): ExecutorRegistration[] {
  return EXECUTOR_REGISTRATIONS.filter((entry) => (!capability || entry.capability === capability) && (!provider || entry.provider === provider))
}

export function getExecutorRegistration(capability: CapabilityKey, provider: ProviderKey): ExecutorRegistration | undefined {
  const registrations = getExecutorRegistrations(capability, provider)
  if (registrations.length <= 1) return registrations[0]
  return registrations.find((entry) => entry.capabilityMatchMode === 'semantic_text_fallback') ?? registrations[0]
}

export function hasExecutorRegistration(capability: CapabilityKey, provider: ProviderKey): boolean {
  return getExecutorRegistration(capability, provider) !== undefined
}

export const GENERAL_TEXT_CAPABILITY_SET = new Set<string>(GENERAL_TEXT_CAPABILITIES)

export function isExecutorModelCompatible(registration: ExecutorRegistration, _model: string, metadata?: ExecutorModelMetadata): boolean {
  const contract = registration.compatibilityProfile
  if (!metadata) return false
  if (!metadata.endpointShapeKnown || !metadata.requestShapeKnown || !metadata.responseShapeKnown) return false
  if (!metadata.providerClientExists || !metadata.workerExecutorExists) return false
  if (registration.capabilityMatchMode === 'exact') {
    if (!metadata.capabilities?.includes(registration.capability)) return false
  } else {
    const hasTextCapability = metadata.capabilities?.some((cap) => GENERAL_TEXT_CAPABILITY_SET.has(cap)) === true
    if (!hasTextCapability) return false
  }
  if (registration.executionMode === 'stream' && metadata.streamingSupported !== true) return false
  if (!matches(contract.taskTypes, metadata.taskType)) return false
  if (!matches(contract.categories, metadata.category)) return false
  if (!matches(contract.transportProfiles, metadata.transportProfile)) return false
  if (!matchesEndpoint(contract.endpointFamilies, metadata.endpointFamily)) return false
  if (!contract.requiredInputModalities.every((modality) => metadata.modalitiesIn?.includes(modality))) return false
  return !contract.outputModality || metadata.modalitiesOut?.includes(contract.outputModality) === true
}

function matches(allowed: readonly string[], value: string | null | undefined): boolean {
  return allowed.length === 0 || (typeof value === 'string' && allowed.includes(value.toLowerCase()))
}

function matchesEndpoint(allowed: readonly string[], value: string | null | undefined): boolean {
  if (allowed.length === 0) return true
  const normalized = String(value ?? '').toLowerCase().replace(/[^a-z0-9]+/g, '_')
  return allowed.some((entry) => normalized.includes(entry.toLowerCase()))
}
