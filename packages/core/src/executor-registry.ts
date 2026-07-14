import { CAPABILITY_BY_KEY, type CapabilityKey } from './capabilities.js'
import type { ProviderKey } from './providers.js'

export type ExecutorId =
  | 'groq.chat'
  | 'groq.streaming-chat'
  | 'groq.text-transform'
  | 'groq.tool-use'
  | 'groq.tts'
  | 'groq.stt'
  | 'deepinfra.chat'
  | 'deepinfra.text-transform'
  | 'deepinfra.task-inference'
  | 'deepinfra.embeddings'
  | 'deepinfra.reranking'
  | 'together.embeddings'
  | 'together.reranking'
  | 'together.image-generation'
  | 'together.video-generation'
  | 'together.image-to-video'
  | 'together.video-to-video'
  | 'deepinfra.video-generation'
  | 'genx.video-generation'
  | 'genx.music-generation'

export interface ExecutorCompatibilityProfile {
  categories: readonly string[]
  transportProfiles: readonly string[]
  endpointFamilies: readonly string[]
  requiredInputModalities: readonly string[]
  outputModality: string
}

export interface ExecutorModelMetadata {
  category?: string | null
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
}

export interface ExecutorRegistration {
  id: ExecutorId
  provider: ProviderKey
  capability: CapabilityKey
  handlerName: string
  acceptedRequestContract: string
  outputContract: string
  modelCompatibility: 'exact_model_allowlist' | 'metadata_profile'
  compatibleModels: readonly string[]
  compatibilityProfile: ExecutorCompatibilityProfile | null
  sourceArtifactRequired: boolean
  artifactOutput: string | null
  executionMode: 'sync' | 'queued' | 'stream'
}

const GROQ_GENERAL_MODELS = ['llama-3.3-70b-versatile', 'llama-3.1-8b-instant'] as const
const DEEPINFRA_GENERAL_MODELS = [
  'meta-llama/Meta-Llama-3.1-8B-Instruct',
  'meta-llama/Llama-3.3-70B-Instruct',
] as const

const GENERAL_TEXT_CAPABILITIES: readonly CapabilityKey[] = [
  'reasoning',
  'code',
  'summarization',
  'translation',
  'question_answering',
  'classification',
  'extraction',
  'structured_output',
]

const DEEPINFRA_SPECIALIST_MODELS: Partial<Record<CapabilityKey, readonly string[]>> = {
  zero_shot_classification: ['facebook/bart-large-mnli'],
  token_classification: ['dslim/bert-base-NER'],
  fill_mask: ['bert-base-cased'],
  table_qa: ['google/tapas-base-finetuned-wtq'],
}

const EMBEDDING_MODELS = {
  together: ['intfloat/multilingual-e5-large-instruct', 'togethercomputer/m2-bert-80M-32k-retrieval'],
  deepinfra: ['Qwen/Qwen3-Embedding-0.6B', 'BAAI/bge-large-en-v1.5'],
} as const

function registration(
  id: ExecutorId,
  provider: ProviderKey,
  capability: CapabilityKey,
  handlerName: string,
  compatibleModels: readonly string[],
  executionMode: 'sync' | 'queued' | 'stream' = 'queued',
): ExecutorRegistration {
  const definition = CAPABILITY_BY_KEY[capability]
  return {
    id,
    provider,
    capability,
    handlerName,
    acceptedRequestContract: definition.inputContractReference,
    outputContract: definition.outputContractReference,
    modelCompatibility: 'exact_model_allowlist',
    compatibleModels,
    compatibilityProfile: null,
    sourceArtifactRequired: definition.requiresSourceArtifact || capability === 'stt',
    artifactOutput: definition.artifactType,
    executionMode,
  }
}

function mediaRegistration(
  id: ExecutorId,
  provider: ProviderKey,
  capability: CapabilityKey,
  handlerName: string,
  profile: ExecutorCompatibilityProfile,
): ExecutorRegistration {
  const definition = CAPABILITY_BY_KEY[capability]
  return {
    id,
    provider,
    capability,
    handlerName,
    acceptedRequestContract: definition.inputContractReference,
    outputContract: definition.outputContractReference,
    modelCompatibility: 'metadata_profile',
    compatibleModels: [],
    compatibilityProfile: profile,
    sourceArtifactRequired: definition.requiresSourceArtifact,
    artifactOutput: definition.artifactType,
    executionMode: 'queued',
  }
}

const GENX_VIDEO_PROFILE: ExecutorCompatibilityProfile = {
  categories: ['video'],
  transportProfiles: ['async_job_poll'],
  endpointFamilies: ['genx_generation_v1'],
  requiredInputModalities: ['text'],
  outputModality: 'video',
}

const GENX_MUSIC_PROFILE: ExecutorCompatibilityProfile = {
  categories: ['audio', 'music', 'text-to-music'],
  transportProfiles: ['async_job_poll'],
  endpointFamilies: ['genx_generation_v1'],
  requiredInputModalities: ['text'],
  outputModality: 'audio',
}

const TOGETHER_VIDEO_PROFILE: ExecutorCompatibilityProfile = {
  categories: ['video', 'text-to-video'],
  transportProfiles: ['async_job_poll'],
  endpointFamilies: ['together_v2_videos'],
  requiredInputModalities: ['text'],
  outputModality: 'video',
}

const TOGETHER_IMAGE_TO_VIDEO_PROFILE: ExecutorCompatibilityProfile = {
  ...TOGETHER_VIDEO_PROFILE,
  requiredInputModalities: ['text', 'image'],
}

const TOGETHER_VIDEO_TO_VIDEO_PROFILE: ExecutorCompatibilityProfile = {
  ...TOGETHER_VIDEO_PROFILE,
  requiredInputModalities: ['text', 'video'],
}

const DEEPINFRA_VIDEO_PROFILE: ExecutorCompatibilityProfile = {
  categories: ['video', 'text-to-video'],
  transportProfiles: ['native_inference_json'],
  endpointFamilies: ['deepinfra_v1_inference'],
  requiredInputModalities: ['text'],
  outputModality: 'video',
}

/**
 * Canonical executable support. A row is added only after its shared provider
 * client and callable capability handler exist. Discovery alone never adds a row.
 */
export const EXECUTOR_REGISTRATIONS: readonly ExecutorRegistration[] = [
  registration('groq.chat', 'groq', 'chat', 'executeGroqChat', GROQ_GENERAL_MODELS),
  registration('groq.streaming-chat', 'groq', 'streaming_chat', 'executeStreamingChat', GROQ_GENERAL_MODELS, 'stream'),
  ...GENERAL_TEXT_CAPABILITIES.map((capability) =>
    registration('groq.text-transform', 'groq', capability, 'executeValidatedTextCapability', GROQ_GENERAL_MODELS),
  ),
  registration('groq.tool-use', 'groq', 'tool_use', 'executeGroqToolUse', GROQ_GENERAL_MODELS),
  registration('groq.tts', 'groq', 'tts', 'executeGroqTts', ['canopylabs/orpheus-v1-english']),
  registration('groq.stt', 'groq', 'stt', 'executeGroqStt', ['whisper-large-v3', 'whisper-large-v3-turbo']),

  registration('deepinfra.chat', 'deepinfra', 'chat', 'executeValidatedTextCapability', DEEPINFRA_GENERAL_MODELS),
  ...GENERAL_TEXT_CAPABILITIES.map((capability) =>
    registration('deepinfra.text-transform', 'deepinfra', capability, 'executeValidatedTextCapability', DEEPINFRA_GENERAL_MODELS),
  ),
  ...Object.entries(DEEPINFRA_SPECIALIST_MODELS).map(([capability, models]) =>
    registration('deepinfra.task-inference', 'deepinfra', capability as CapabilityKey, 'executeDeepInfraTaskCapability', models),
  ),
  registration('deepinfra.embeddings', 'deepinfra', 'feature_extraction', 'executeEmbeddingsCapability', EMBEDDING_MODELS.deepinfra),
  registration('deepinfra.embeddings', 'deepinfra', 'sentence_similarity', 'executeSentenceSimilarity', EMBEDDING_MODELS.deepinfra),
  registration('deepinfra.embeddings', 'deepinfra', 'embeddings', 'executeEmbeddingsCapability', EMBEDDING_MODELS.deepinfra),
  registration('deepinfra.reranking', 'deepinfra', 'reranking', 'executeRerankingCapability', ['Qwen/Qwen3-Reranker-0.6B', 'BAAI/bge-reranker-large']),

  registration('together.embeddings', 'together', 'feature_extraction', 'executeEmbeddingsCapability', EMBEDDING_MODELS.together),
  registration('together.embeddings', 'together', 'sentence_similarity', 'executeSentenceSimilarity', EMBEDDING_MODELS.together),
  registration('together.embeddings', 'together', 'embeddings', 'executeEmbeddingsCapability', EMBEDDING_MODELS.together),
  registration('together.reranking', 'together', 'reranking', 'executeRerankingCapability', ['Salesforce/Llama-Rank-v1']),
  registration('together.image-generation', 'together', 'image_generation', 'executeTogetherImage', ['black-forest-labs/FLUX.1-schnell']),

  mediaRegistration('genx.video-generation', 'genx', 'video_generation', 'executeGenxVideo', GENX_VIDEO_PROFILE),
  mediaRegistration('genx.music-generation', 'genx', 'music_generation', 'executeGenxMusic', GENX_MUSIC_PROFILE),
  mediaRegistration('together.video-generation', 'together', 'video_generation', 'executeTogetherVideo', TOGETHER_VIDEO_PROFILE),
  mediaRegistration('together.image-to-video', 'together', 'image_to_video', 'executeTogetherVideo', TOGETHER_IMAGE_TO_VIDEO_PROFILE),
  mediaRegistration('together.video-to-video', 'together', 'video_to_video', 'executeTogetherVideo', TOGETHER_VIDEO_TO_VIDEO_PROFILE),
  mediaRegistration('deepinfra.video-generation', 'deepinfra', 'video_generation', 'executeDeepInfraVideo', DEEPINFRA_VIDEO_PROFILE),
] as const

export function getExecutorRegistrations(capability?: CapabilityKey, provider?: ProviderKey): ExecutorRegistration[] {
  return EXECUTOR_REGISTRATIONS.filter((entry) =>
    (!capability || entry.capability === capability) && (!provider || entry.provider === provider),
  )
}

export function getExecutorRegistration(capability: CapabilityKey, provider: ProviderKey): ExecutorRegistration | undefined {
  return EXECUTOR_REGISTRATIONS.find((entry) => entry.capability === capability && entry.provider === provider)
}

export function hasExecutorRegistration(capability: CapabilityKey, provider: ProviderKey): boolean {
  return getExecutorRegistration(capability, provider) !== undefined
}

export function isExecutorModelCompatible(
  registration: ExecutorRegistration,
  model: string,
  metadata?: ExecutorModelMetadata,
): boolean {
  if (registration.modelCompatibility === 'exact_model_allowlist') {
    return registration.compatibleModels.includes(model)
  }

  const profile = registration.compatibilityProfile
  if (!profile || !metadata) return false
  if (!metadata.endpointShapeKnown || !metadata.requestShapeKnown || !metadata.responseShapeKnown) return false
  if (!metadata.providerClientExists || !metadata.workerExecutorExists) return false
  if (!metadata.capabilities?.includes(registration.capability)) return false
  if (!profile.categories.includes(metadata.category ?? '')) return false
  if (!profile.transportProfiles.includes(metadata.transportProfile ?? '')) return false
  if (!profile.endpointFamilies.includes(metadata.endpointFamily ?? '')) return false
  if (!profile.requiredInputModalities.every((modality) => metadata.modalitiesIn?.includes(modality))) return false
  return metadata.modalitiesOut?.includes(profile.outputModality) === true
}
