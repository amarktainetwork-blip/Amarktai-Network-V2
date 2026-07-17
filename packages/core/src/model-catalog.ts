import type { ProviderKey } from './providers.js'
import type { CapabilityKey } from './capabilities.js'
import { hasExecutorRegistration } from './executor-registry.js'
import type { ModelDiscoverySource, ProviderDiscoveredModel } from './provider-model-discovery.js'
import generatedProviderModels from './generated/provider-model-catalogue.generated.json' with { type: 'json' }

export const MODEL_STATUSES = ['available', 'disabled', 'planned', 'blocked'] as const
export type ModelStatus = (typeof MODEL_STATUSES)[number]

export const QUALITY_TIERS = ['budget', 'balanced', 'premium', 'experimental'] as const
export type QualityTier = (typeof QUALITY_TIERS)[number]

export const MODEL_LATENCY_TIERS = ['ultra_low', 'low', 'medium', 'high'] as const
export type ModelLatencyTier = (typeof MODEL_LATENCY_TIERS)[number]

export const MODEL_COST_TIERS = ['free', 'very_low', 'low', 'medium', 'high', 'premium'] as const
export type ModelCostTier = (typeof MODEL_COST_TIERS)[number]

export interface ModelRecord {
  provider: ProviderKey
  modelId: string
  displayName: string
  executionProvider?: ProviderKey
  upstreamProvider?: string
  discoverySource?: ModelDiscoverySource
  docsKnown?: boolean
  liveDiscovered?: boolean
  category?: string
  providerCategory?: string
  modalitiesIn?: string[]
  modalitiesOut?: string[]
  transportProfile?: string
  endpointFamily?: string
  authRequired?: boolean
  providerCapabilityKnown?: boolean
  policyRestrictedByApp?: boolean
  policyBlockedReason?: string
  capabilities: CapabilityKey[]
  status: ModelStatus
  qualityTier: QualityTier
  latencyTier: ModelLatencyTier
  costTier: ModelCostTier
  supportsArtifacts: boolean
  supportsStreaming: boolean
  supportsBatch: boolean
  executable: boolean
  notes: string
  source?: ModelDiscoverySource
  endpointShapeKnown?: boolean
  requestShapeKnown?: boolean
  responseShapeKnown?: boolean
  artifactOutputKnown?: boolean
  artifactPersistenceExists?: boolean
  providerClientExists?: boolean
  workerExecutorExists?: boolean
  toolCallingSupported?: boolean
  functionCallingSupported?: boolean
  webhookSupported?: boolean
  discoveredModel?: boolean
  executableNow?: boolean
  executableBlockers?: string[]
  catalogueOnlyReason?: string
  blockedReason?: string
  rawMetadata?: Record<string, unknown>
}

export const STATIC_MODEL_CATALOGUE: readonly ModelRecord[] = [
  {
    provider: 'groq',
    modelId: 'llama-3.3-70b-versatile',
    displayName: 'Llama 3.3 70B Versatile',
    capabilities: ['chat', 'streaming_chat', 'reasoning', 'summarization', 'translation', 'question_answering', 'classification', 'extraction', 'code', 'structured_output', 'tool_use'],
    status: 'available',
    qualityTier: 'balanced',
    latencyTier: 'low',
    costTier: 'low',
    supportsArtifacts: false,
    supportsStreaming: true,
    supportsBatch: false,
    executable: false,
    notes: 'Primary text/chat model. Proven live via Groq API.',
  },
  {
    provider: 'groq',
    modelId: 'llama-3.1-8b-instant',
    displayName: 'Llama 3.1 8B Instant',
    capabilities: ['chat', 'streaming_chat', 'summarization', 'translation', 'question_answering', 'classification', 'extraction'],
    status: 'available',
    qualityTier: 'budget',
    latencyTier: 'ultra_low',
    costTier: 'very_low',
    supportsArtifacts: false,
    supportsStreaming: true,
    supportsBatch: false,
    executable: false,
    notes: 'Fast/cheap Groq model for latency-sensitive text tasks.',
  },
  {
    provider: 'deepinfra',
    modelId: 'meta-llama/Meta-Llama-3.1-8B-Instruct',
    displayName: 'Meta Llama 3.1 8B Instruct',
    capabilities: ['chat', 'reasoning', 'summarization', 'translation', 'question_answering', 'classification', 'extraction', 'code', 'structured_output'],
    status: 'available',
    qualityTier: 'budget',
    latencyTier: 'medium',
    costTier: 'very_low',
    supportsArtifacts: false,
    supportsStreaming: true,
    supportsBatch: true,
    executable: false,
    notes: 'DeepInfra text fallback. Only selected when enabled and not disabled.',
  },
  {
    provider: 'together',
    modelId: 'black-forest-labs/FLUX.1-schnell',
    displayName: 'FLUX.1 Schnell',
    capabilities: ['image_generation'],
    status: 'available',
    qualityTier: 'balanced',
    latencyTier: 'medium',
    costTier: 'medium',
    supportsArtifacts: true,
    supportsStreaming: false,
    supportsBatch: true,
    executable: false,
    notes: 'Together image generation. Proven live. Requires TOGETHER_IMAGE_MODEL or provider defaultModel config.',
  },
  {
    provider: 'genx',
    modelId: 'seedance-v1-fast',
    displayName: 'Seedance V1 Fast',
    capabilities: ['video_generation', 'image_to_video', 'video_to_video'],
    status: 'available',
    qualityTier: 'balanced',
    latencyTier: 'medium',
    costTier: 'high',
    supportsArtifacts: true,
    supportsStreaming: false,
    supportsBatch: false,
    executable: false,
    category: 'video',
    modalitiesIn: ['text', 'image', 'video'],
    modalitiesOut: ['video'],
    transportProfile: 'async_job_poll',
    endpointFamily: 'genx_generation_v1',
    endpointShapeKnown: true,
    requestShapeKnown: true,
    responseShapeKnown: true,
    providerClientExists: true,
    workerExecutorExists: true,
    notes: 'GenX asynchronous video-generation contract; supports text-to-video, image-to-video, and reference-video modes.',
  },
  {
    provider: 'together',
    modelId: 'ByteDance/Seedance-2.0',
    displayName: 'Seedance 2.0',
    capabilities: ['video_generation', 'image_to_video', 'video_to_video'],
    status: 'available',
    qualityTier: 'premium',
    latencyTier: 'high',
    costTier: 'premium',
    supportsArtifacts: true,
    supportsStreaming: false,
    supportsBatch: false,
    executable: false,
    category: 'video',
    modalitiesIn: ['text', 'image', 'video', 'audio'],
    modalitiesOut: ['video'],
    transportProfile: 'async_job_poll',
    endpointFamily: 'together_v2_videos',
    endpointShapeKnown: true,
    requestShapeKnown: true,
    responseShapeKnown: true,
    providerClientExists: true,
    workerExecutorExists: true,
    notes: 'Together managed serverless video API; exact model is selected by Orchestra.',
  },
  {
    provider: 'together',
    modelId: 'Wan-AI/wan2.7-t2v',
    displayName: 'Wan 2.7 Text to Video',
    capabilities: ['video_generation'],
    status: 'available',
    qualityTier: 'balanced',
    latencyTier: 'high',
    costTier: 'high',
    supportsArtifacts: true,
    supportsStreaming: false,
    supportsBatch: false,
    executable: false,
    category: 'text-to-video',
    modalitiesIn: ['text'],
    modalitiesOut: ['video'],
    transportProfile: 'async_job_poll',
    endpointFamily: 'together_v2_videos',
    endpointShapeKnown: true,
    requestShapeKnown: true,
    responseShapeKnown: true,
    providerClientExists: true,
    workerExecutorExists: true,
    notes: 'Together Wan text-to-video through the managed v2 videos API.',
  },
  {
    provider: 'together',
    modelId: 'Wan-AI/wan2.7-i2v',
    displayName: 'Wan 2.7 Image to Video',
    capabilities: ['image_to_video'],
    status: 'available',
    qualityTier: 'balanced',
    latencyTier: 'high',
    costTier: 'high',
    supportsArtifacts: true,
    supportsStreaming: false,
    supportsBatch: false,
    executable: false,
    category: 'video',
    modalitiesIn: ['text', 'image'],
    modalitiesOut: ['video'],
    transportProfile: 'async_job_poll',
    endpointFamily: 'together_v2_videos',
    endpointShapeKnown: true,
    requestShapeKnown: true,
    responseShapeKnown: true,
    providerClientExists: true,
    workerExecutorExists: true,
    notes: 'Together Wan image-to-video; authorised source bytes are sent in media.frame_images.',
  },
  {
    provider: 'together',
    modelId: 'Wan-AI/wan2.7-r2v',
    displayName: 'Wan 2.7 Reference Video',
    capabilities: ['video_to_video'],
    status: 'available',
    qualityTier: 'balanced',
    latencyTier: 'high',
    costTier: 'high',
    supportsArtifacts: true,
    supportsStreaming: false,
    supportsBatch: false,
    executable: false,
    category: 'video',
    modalitiesIn: ['text', 'video'],
    modalitiesOut: ['video'],
    transportProfile: 'async_job_poll',
    endpointFamily: 'together_v2_videos',
    endpointShapeKnown: true,
    requestShapeKnown: true,
    responseShapeKnown: true,
    providerClientExists: true,
    workerExecutorExists: true,
    notes: 'Together Wan reference-video endpoint contract; source video must be provider-readable.',
  },
  {
    provider: 'deepinfra',
    modelId: 'Wan-AI/Wan2.1-T2V-14B',
    displayName: 'Wan 2.1 T2V 14B',
    capabilities: ['video_generation'],
    status: 'available',
    qualityTier: 'balanced',
    latencyTier: 'high',
    costTier: 'high',
    supportsArtifacts: true,
    supportsStreaming: false,
    supportsBatch: false,
    executable: false,
    category: 'text-to-video',
    modalitiesIn: ['text'],
    modalitiesOut: ['video'],
    transportProfile: 'native_inference_json',
    endpointFamily: 'deepinfra_v1_inference',
    endpointShapeKnown: true,
    requestShapeKnown: true,
    responseShapeKnown: true,
    providerClientExists: true,
    workerExecutorExists: true,
    notes: 'DeepInfra documented synchronous inference response with a downloadable video URL.',
  },
  {
    provider: 'mimo',
    modelId: 'mimo-v1',
    displayName: 'MiMo V1',
    capabilities: ['code', 'tool_use'],
    status: 'blocked',
    qualityTier: 'balanced',
    latencyTier: 'medium',
    costTier: 'medium',
    supportsArtifacts: false,
    supportsStreaming: false,
    supportsBatch: false,
    executable: false,
    notes: 'coding_tools_only. Never selected for runtime capability execution.',
  },
  {
    provider: 'groq',
    modelId: 'whisper-large-v3',
    displayName: 'Whisper Large V3',
    capabilities: ['stt'],
    status: 'available',
    qualityTier: 'balanced',
    latencyTier: 'medium',
    costTier: 'low',
    supportsArtifacts: false,
    supportsStreaming: false,
    supportsBatch: true,
    executable: false,
    notes: 'Groq multipart transcription executor with authorised artifact input and timestamp validation.',
  },
  {
    provider: 'groq',
    modelId: 'canopylabs/orpheus-v1-english',
    displayName: 'Orpheus V1 English',
    capabilities: ['tts'],
    status: 'available',
    qualityTier: 'balanced',
    latencyTier: 'medium',
    costTier: 'medium',
    supportsArtifacts: true,
    supportsStreaming: false,
    supportsBatch: false,
    executable: false,
    notes: 'Groq speech synthesis executor with bounded chunking, audio validation, and artifact persistence.',
  },
  {
    provider: 'genx',
    modelId: 'genx-tts-v1',
    displayName: 'GenX TTS V1',
    capabilities: ['tts'],
    status: 'available',
    qualityTier: 'balanced',
    latencyTier: 'medium',
    costTier: 'medium',
    supportsArtifacts: true,
    supportsStreaming: false,
    supportsBatch: false,
    executable: false,
    category: 'audio',
    modalitiesIn: ['text'],
    modalitiesOut: ['audio'],
    transportProfile: 'async_job_poll',
    endpointFamily: 'genx_generation_v1',
    endpointShapeKnown: true,
    requestShapeKnown: true,
    responseShapeKnown: true,
    providerClientExists: true,
    workerExecutorExists: true,
    notes: 'GenX asynchronous TTS contract; submits text, polls for completion, downloads audio artifact.',
  },
  {
    provider: 'genx',
    modelId: 'genx-stt-v1',
    displayName: 'GenX STT V1',
    capabilities: ['stt'],
    status: 'available',
    qualityTier: 'balanced',
    latencyTier: 'medium',
    costTier: 'low',
    supportsArtifacts: false,
    supportsStreaming: false,
    supportsBatch: false,
    executable: false,
    category: 'audio',
    modalitiesIn: ['audio'],
    modalitiesOut: ['text'],
    transportProfile: 'async_job_poll',
    endpointFamily: 'genx_generation_v1',
    endpointShapeKnown: true,
    requestShapeKnown: true,
    responseShapeKnown: true,
    providerClientExists: true,
    workerExecutorExists: true,
    notes: 'GenX asynchronous STT contract; uploads audio, polls for transcription, returns transcript.',
  },
  {
    provider: 'together',
    modelId: 'intfloat/multilingual-e5-large-instruct',
    displayName: 'Multilingual E5 Large Instruct',
    capabilities: ['embeddings'],
    status: 'available',
    qualityTier: 'balanced',
    latencyTier: 'low',
    costTier: 'low',
    supportsArtifacts: false,
    supportsStreaming: false,
    supportsBatch: true,
    executable: false,
    notes: 'Together embedding endpoint for validated single and batch vector execution. No Qdrant write in this phase.',
  },
  {
    provider: 'together',
    modelId: 'Salesforce/Llama-Rank-v1',
    displayName: 'Llama Rank V1',
    capabilities: ['reranking'],
    status: 'available',
    qualityTier: 'balanced',
    latencyTier: 'low',
    costTier: 'low',
    supportsArtifacts: false,
    supportsStreaming: false,
    supportsBatch: true,
    executable: false,
    notes: 'Together native rerank endpoint with index, score, ordering, and top-N validation.',
  },
  {
    provider: 'deepinfra',
    modelId: 'facebook/bart-large-mnli',
    displayName: 'BART Large MNLI',
    capabilities: ['zero_shot_classification'],
    status: 'available',
    qualityTier: 'balanced',
    latencyTier: 'medium',
    costTier: 'low',
    supportsArtifacts: false,
    supportsStreaming: false,
    supportsBatch: false,
    executable: false,
    notes: 'DeepInfra native zero-shot classification task route.',
  },
  {
    provider: 'deepinfra',
    modelId: 'dslim/bert-base-NER',
    displayName: 'BERT Base NER',
    capabilities: ['token_classification'],
    status: 'available',
    qualityTier: 'balanced',
    latencyTier: 'medium',
    costTier: 'low',
    supportsArtifacts: false,
    supportsStreaming: false,
    supportsBatch: false,
    executable: false,
    notes: 'DeepInfra native token-classification task route with span validation.',
  },
  {
    provider: 'deepinfra',
    modelId: 'bert-base-cased',
    displayName: 'BERT Base Cased',
    capabilities: ['fill_mask'],
    status: 'available',
    qualityTier: 'balanced',
    latencyTier: 'medium',
    costTier: 'low',
    supportsArtifacts: false,
    supportsStreaming: false,
    supportsBatch: false,
    executable: false,
    notes: 'DeepInfra native fill-mask task route.',
  },
  {
    provider: 'deepinfra',
    modelId: 'google/tapas-base-finetuned-wtq',
    displayName: 'TAPAS WTQ',
    capabilities: ['table_qa'],
    status: 'available',
    qualityTier: 'balanced',
    latencyTier: 'medium',
    costTier: 'low',
    supportsArtifacts: false,
    supportsStreaming: false,
    supportsBatch: false,
    executable: false,
    notes: 'DeepInfra native table question-answering route.',
  },
  {
    provider: 'deepinfra',
    modelId: 'Qwen/Qwen3-Embedding-0.6B',
    displayName: 'Qwen3 Embedding 0.6B',
    capabilities: ['embeddings', 'feature_extraction', 'sentence_similarity'],
    status: 'available',
    qualityTier: 'balanced',
    latencyTier: 'medium',
    costTier: 'low',
    supportsArtifacts: false,
    supportsStreaming: false,
    supportsBatch: true,
    executable: false,
    notes: 'DeepInfra OpenAI-compatible embedding route used for vectors, features, and numeric sentence similarity.',
  },
  {
    provider: 'deepinfra',
    modelId: 'Qwen/Qwen3-Reranker-0.6B',
    displayName: 'Qwen3 Reranker 0.6B',
    capabilities: ['reranking'],
    status: 'available',
    qualityTier: 'balanced',
    latencyTier: 'medium',
    costTier: 'low',
    supportsArtifacts: false,
    supportsStreaming: false,
    supportsBatch: true,
    executable: false,
    notes: 'DeepInfra native reranking route with validated score ordering.',
  },
  {
    provider: 'genx',
    modelId: 'genx-image-v1',
    displayName: 'GenX Image V1',
    capabilities: ['image_generation'],
    status: 'planned',
    qualityTier: 'premium',
    latencyTier: 'medium',
    costTier: 'high',
    supportsArtifacts: true,
    supportsStreaming: false,
    supportsBatch: false,
    executable: false,
    notes: 'GenX image execution is policy-disabled for this release; Together remains the callable image provider.',
  },
  {
    provider: 'genx',
    modelId: 'genx-longform-v1',
    displayName: 'GenX Long-Form V1',
    capabilities: ['long_form_video'],
    status: 'planned',
    qualityTier: 'premium',
    latencyTier: 'high',
    costTier: 'premium',
    supportsArtifacts: true,
    supportsStreaming: false,
    supportsBatch: false,
    executable: false,
    notes: 'Durable long-form workflow with storyboard planning, queued component execution, and idempotent FFmpeg assembly. Provider and infrastructure readiness are evaluated separately.',
  },
  {
    provider: 'genx',
    modelId: 'lyria-3-clip-preview',
    displayName: 'Lyria 3 Clip Preview',
    capabilities: ['music_generation'],
    status: 'available',
    qualityTier: 'balanced',
    latencyTier: 'high',
    costTier: 'premium',
    supportsArtifacts: true,
    supportsStreaming: false,
    supportsBatch: false,
    executable: false,
    notes: 'GenX Lyria 3 clip music generation implementation path. Runtime execution requires GenX configuration and infrastructure; live proof is tracked separately.',
    source: 'docs_fallback',
    artifactPersistenceExists: true,
    category: 'audio',
    modalitiesIn: ['text'],
    modalitiesOut: ['audio'],
    transportProfile: 'async_job_poll',
    endpointFamily: 'genx_generation_v1',
    endpointShapeKnown: true,
    requestShapeKnown: true,
    responseShapeKnown: true,
    providerClientExists: true,
    workerExecutorExists: true,
  },
  {
    provider: 'genx',
    modelId: 'lyria-3-pro-preview',
    displayName: 'Lyria 3 Pro Preview',
    capabilities: ['music_generation'],
    status: 'available',
    qualityTier: 'premium',
    latencyTier: 'high',
    costTier: 'premium',
    supportsArtifacts: true,
    supportsStreaming: false,
    supportsBatch: false,
    executable: false,
    notes: 'GenX Lyria 3 pro music generation implementation path. Runtime execution requires GenX configuration and infrastructure; live proof is tracked separately.',
    source: 'docs_fallback',
    artifactPersistenceExists: true,
    category: 'audio',
    modalitiesIn: ['text'],
    modalitiesOut: ['audio'],
    transportProfile: 'async_job_poll',
    endpointFamily: 'genx_generation_v1',
    endpointShapeKnown: true,
    requestShapeKnown: true,
    responseShapeKnown: true,
    providerClientExists: true,
    workerExecutorExists: true,
  },
] as const

export const DISCOVERED_PROVIDER_MODELS = generatedProviderModels as ProviderDiscoveredModel[]

function discoveredModelToRecord(model: ProviderDiscoveredModel): ModelRecord {
  return {
    provider: model.provider,
    modelId: model.modelId,
    displayName: model.displayName,
    capabilities: model.inferredCapabilities,
    status: model.policyRestrictedByApp ? 'blocked' : 'available',
    qualityTier: 'balanced',
    latencyTier: 'medium',
    costTier: 'medium',
    supportsArtifacts: model.artifactOutput,
    supportsStreaming: model.streamingSupported,
    supportsBatch: model.batchSupported,
    executable: false,
    notes: `Catalogued model from ${model.endpointSource}. Execution readiness is derived from executor registrations.`,
    source: model.source,
    executionProvider: model.executionProvider,
    upstreamProvider: model.upstreamProvider,
    discoverySource: model.discoverySource,
    docsKnown: model.docsKnown,
    liveDiscovered: model.liveDiscovered,
    category: model.category,
    providerCategory: model.providerCategory,
    modalitiesIn: model.modalitiesIn,
    modalitiesOut: model.modalitiesOut,
    transportProfile: model.transportProfile,
    endpointFamily: model.endpointFamily,
    authRequired: model.authRequired,
    providerCapabilityKnown: model.providerCapabilityKnown,
    policyRestrictedByApp: model.policyRestrictedByApp,
    policyBlockedReason: model.policyBlockedReason,
    endpointShapeKnown: model.endpointShapeKnown,
    requestShapeKnown: model.requestShapeKnown,
    responseShapeKnown: model.responseShapeKnown,
    artifactOutputKnown: model.artifactOutputKnown,
    artifactPersistenceExists: model.artifactPersistenceExists,
    providerClientExists: model.providerClientExists,
    workerExecutorExists: model.workerExecutorExists,
    toolCallingSupported: model.toolCallingSupported,
    functionCallingSupported: model.functionCallingSupported,
    webhookSupported: model.webhookSupported,
    discoveredModel: true,
    executableNow: false,
    executableBlockers: model.executableBlockers,
    catalogueOnlyReason: model.catalogueOnlyReason,
    blockedReason: model.blockedReason,
    rawMetadata: model.rawMetadata,
  }
}

const discoveredModelRecords = DISCOVERED_PROVIDER_MODELS
  .filter((model) => !STATIC_MODEL_CATALOGUE.some((staticModel) => staticModel.provider === model.provider && staticModel.modelId === model.modelId))
  .map(discoveredModelToRecord)

export const MODEL_CATALOGUE: readonly ModelRecord[] = [
  ...STATIC_MODEL_CATALOGUE,
  ...discoveredModelRecords,
] as const

export function getModelsByProvider(provider: ProviderKey): ModelRecord[] {
  return MODEL_CATALOGUE.filter((m) => m.provider === provider)
}

export function getModelsByCapability(capability: CapabilityKey): ModelRecord[] {
  return MODEL_CATALOGUE.filter((m) => m.capabilities.includes(capability))
}

export function getExecutableModels(): ModelRecord[] {
  return MODEL_CATALOGUE.filter((model) =>
    model.status === 'available'
    && model.capabilities.some((capability) => hasExecutorRegistration(capability, model.provider)),
  )
}

export function getPlannedModels(): ModelRecord[] {
  return MODEL_CATALOGUE.filter((m) => m.status === 'planned')
}

export function getBlockedModels(): ModelRecord[] {
  return MODEL_CATALOGUE.filter((m) => m.status === 'blocked')
}

export function getModelRecord(provider: ProviderKey, modelId: string): ModelRecord | undefined {
  return MODEL_CATALOGUE.find((m) => m.provider === provider && m.modelId === modelId)
}
