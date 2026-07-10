import type { ProviderKey } from './providers.js'
import type { CapabilityKey } from './capabilities.js'
import type { ModelDiscoverySource, ProviderDiscoveredModel } from './provider-model-discovery.js'
import generatedProviderModels from './generated/provider-model-catalogue.generated.json'

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
}

export const STATIC_MODEL_CATALOGUE: readonly ModelRecord[] = [
  {
    provider: 'groq',
    modelId: 'llama-3.3-70b-versatile',
    displayName: 'Llama 3.3 70B Versatile',
    capabilities: ['chat', 'reasoning', 'summarization', 'translation', 'classification', 'extraction', 'code', 'structured_output', 'tool_use', 'campaign_generation', 'social_content_generation'],
    status: 'available',
    qualityTier: 'balanced',
    latencyTier: 'low',
    costTier: 'low',
    supportsArtifacts: false,
    supportsStreaming: true,
    supportsBatch: false,
    executable: true,
    notes: 'Primary text/chat model. Proven live via Groq API.',
  },
  {
    provider: 'groq',
    modelId: 'llama-3.1-8b-instant',
    displayName: 'Llama 3.1 8B Instant',
    capabilities: ['chat', 'summarization', 'classification', 'extraction'],
    status: 'available',
    qualityTier: 'budget',
    latencyTier: 'ultra_low',
    costTier: 'very_low',
    supportsArtifacts: false,
    supportsStreaming: true,
    supportsBatch: false,
    executable: true,
    notes: 'Fast/cheap Groq model for latency-sensitive text tasks.',
  },
  {
    provider: 'deepinfra',
    modelId: 'meta-llama/Meta-Llama-3.1-8B-Instruct',
    displayName: 'Meta Llama 3.1 8B Instruct',
    capabilities: ['chat', 'summarization', 'classification', 'extraction'],
    status: 'available',
    qualityTier: 'budget',
    latencyTier: 'medium',
    costTier: 'very_low',
    supportsArtifacts: false,
    supportsStreaming: true,
    supportsBatch: true,
    executable: true,
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
    executable: true,
    notes: 'Together image generation. Proven live. Requires TOGETHER_IMAGE_MODEL or provider defaultModel config.',
  },
  {
    provider: 'genx',
    modelId: 'seedance-v1-fast',
    displayName: 'Seedance V1 Fast',
    capabilities: ['video_generation'],
    status: 'available',
    qualityTier: 'balanced',
    latencyTier: 'medium',
    costTier: 'high',
    supportsArtifacts: true,
    supportsStreaming: false,
    supportsBatch: false,
    executable: true,
    notes: 'GenX video generation. Proven live via GenX API.',
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
    status: 'planned',
    qualityTier: 'balanced',
    latencyTier: 'medium',
    costTier: 'low',
    supportsArtifacts: false,
    supportsStreaming: false,
    supportsBatch: true,
    executable: false,
    notes: 'Groq STT. Backend not yet wired to dashboard flow.',
  },
  {
    provider: 'groq',
    modelId: 'canopylabs/orpheus-v1-english',
    displayName: 'Orpheus V1 English',
    capabilities: ['tts'],
    status: 'planned',
    qualityTier: 'balanced',
    latencyTier: 'medium',
    costTier: 'medium',
    supportsArtifacts: true,
    supportsStreaming: false,
    supportsBatch: false,
    executable: false,
    notes: 'Groq TTS. Backend not yet wired to dashboard flow.',
  },
  {
    provider: 'together',
    modelId: 'togethercomputer/m2-bert-80M-32k-retrieval',
    displayName: 'M2-BERT 80M 32K Retrieval',
    capabilities: ['embeddings'],
    status: 'planned',
    qualityTier: 'balanced',
    latencyTier: 'low',
    costTier: 'low',
    supportsArtifacts: false,
    supportsStreaming: false,
    supportsBatch: true,
    executable: false,
    notes: 'Together embedding model. RAG workflow not fully wired.',
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
    notes: 'GenX image generation. Not yet wired. Together remains primary for image.',
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
    notes: 'Long-form video. Pending storyboard and multi-scene assembly.',
  },
  {
    provider: 'genx',
    modelId: 'music-generation-provider-client-pending',
    displayName: 'Music Generation Provider Client Pending',
    capabilities: ['music_generation'],
    status: 'planned',
    qualityTier: 'balanced',
    latencyTier: 'high',
    costTier: 'premium',
    supportsArtifacts: true,
    supportsStreaming: false,
    supportsBatch: false,
    executable: false,
    notes: 'Music generation foundation only. No approved provider music endpoint/client is documented or configured in this repo.',
    source: 'manual_planned',
    endpointShapeKnown: false,
    requestShapeKnown: false,
    responseShapeKnown: false,
    providerClientExists: false,
    workerExecutorExists: false,
    blockedReason: 'provider_client_missing, worker_executor_missing',
  },
] as const

export const DISCOVERED_PROVIDER_MODELS = generatedProviderModels as ProviderDiscoveredModel[]

function discoveredModelToRecord(model: ProviderDiscoveredModel): ModelRecord {
  return {
    provider: model.provider,
    modelId: model.modelId,
    displayName: model.displayName,
    capabilities: model.inferredCapabilities,
    status: model.policyRestrictedByApp ? 'blocked' : model.executableNow ? 'available' : 'planned',
    qualityTier: 'balanced',
    latencyTier: 'medium',
    costTier: 'medium',
    supportsArtifacts: model.artifactOutput,
    supportsStreaming: model.streamingSupported,
    supportsBatch: model.batchSupported,
    executable: model.executableNow,
    notes: `Discovered model from ${model.endpointSource}. ${model.blockedReason || 'Executable readiness satisfied.'}`,
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
    executableNow: model.executableNow,
    executableBlockers: model.executableBlockers,
    catalogueOnlyReason: model.catalogueOnlyReason,
    blockedReason: model.blockedReason,
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
  return MODEL_CATALOGUE.filter((m) => m.executable && m.status === 'available')
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
