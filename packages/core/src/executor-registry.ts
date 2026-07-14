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
  | 'genx.video-generation'
  | 'genx.music-generation'

export interface ExecutorRegistration {
  id: ExecutorId
  provider: ProviderKey
  capability: CapabilityKey
  handlerName: string
  acceptedRequestContract: string
  outputContract: string
  modelCompatibility: 'exact_model_allowlist'
  compatibleModels: readonly string[]
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
    sourceArtifactRequired: definition.requiresSourceArtifact || capability === 'stt',
    artifactOutput: definition.artifactType,
    executionMode,
  }
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

  registration('genx.video-generation', 'genx', 'video_generation', 'executeGenxVideo', ['seedance-v1-fast']),
  registration('genx.music-generation', 'genx', 'music_generation', 'executeGenxMusic', ['lyria-3-clip-preview', 'lyria-3-pro-preview']),
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

export function isExecutorModelCompatible(registration: ExecutorRegistration, model: string): boolean {
  return registration.compatibleModels.includes(model)
}
