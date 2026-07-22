import { CAPABILITY_KEYS, type CapabilityKey } from './capabilities.js'
import { PROVIDER_KEYS, type ProviderKey } from './providers.js'
import { hasExecutorRegistration } from './executor-registry.js'

export const MODEL_DISCOVERY_SOURCES = [
  'live_endpoint',
  'docs_fallback',
  'manual_seed',
  'static_verified',
  'static_repo',
  'live_discovered',
  'last_known_good',
  'manual_planned',
  'blocked_policy',
] as const

export type ModelDiscoverySource = (typeof MODEL_DISCOVERY_SOURCES)[number]

export const PROVIDER_DISCOVERY_MODES = ['safe_static', 'live_model_list'] as const
export type ProviderDiscoveryMode = (typeof PROVIDER_DISCOVERY_MODES)[number]

export const TRANSPORT_PROFILES = [
  'openai_chat_sse',
  'anthropic_messages_sse',
  'openai_responses_sse',
  'async_job_poll',
  'async_job_webhook',
  'openai_images_edits_multipart',
  'openai_audio_speech_binary',
  'openai_audio_transcription_multipart',
  'http_audio_stream_sse',
  'websocket_realtime_audio',
  'native_inference_binary',
  'native_inference_json',
  'native_inference_async_webhook',
  'docs_only_policy_restricted',
] as const

export type TransportProfile = (typeof TRANSPORT_PROFILES)[number]

export interface DiscoveredCapability {
  capability: CapabilityKey
  confidence: 'known' | 'inferred' | 'unknown'
  inferenceSource: string
}

export interface CapabilityExecutionReadiness {
  capability: CapabilityKey
  modelDiscovered: boolean
  modelCatalogued: boolean
  capabilityInferred: boolean
  endpointShapeKnown: boolean
  providerClientExists: boolean
  workerExecutorExists: boolean
  artifactPersistenceExists: boolean
  liveProbePassed: boolean
  executableNow: boolean
  blockedReason: string
}

export interface ProviderDiscoveredModel {
  provider: ProviderKey
  modelId: string
  displayName: string
  executionProvider: ProviderKey
  upstreamProvider: string
  discoverySource: ModelDiscoverySource
  docsKnown: boolean
  liveDiscovered: boolean
  category: string
  providerCategory: string
  rawProviderType: string
  modalitiesIn: string[]
  modalitiesOut: string[]
  modalities: string[]
  inferredCapabilities: CapabilityKey[]
  contextWindow: number | null
  maxOutputTokens: number | null
  inputPrice: number | null
  outputPrice: number | null
  artifactOutput: boolean
  artifactOutputKnown: boolean
  artifactPersistenceExists: boolean
  authRequired: boolean
  providerCapabilityKnown: boolean
  policyRestrictedByApp: boolean
  policyBlockedReason: string
  transportProfile: TransportProfile
  endpointFamily: string
  streamingSupported: boolean
  toolCallingSupported: boolean
  functionCallingSupported: boolean
  batchSupported: boolean
  webhookSupported: boolean
  endpointSource: string
  endpointShapeKnown: boolean
  requestShapeKnown: boolean
  responseShapeKnown: boolean
  providerClientExists: boolean
  workerExecutorExists: boolean
  executableNow: boolean
  executableBlockers: string[]
  catalogueOnlyReason: string
  blockedReason: string
  lastDiscoveredAt: string
  source: ModelDiscoverySource
  liveDiscoverySkipped?: boolean
  publicEndpointDiscovered?: boolean
  rawMetadata?: Record<string, unknown>
}

export interface ProviderDiscoveryResult {
  provider: ProviderKey
  providerRole?: string
  docsCapabilityKnown?: boolean
  liveDiscoverySupported?: boolean
  docsFallbackSupported?: boolean
  apiKeyEnvName?: string | null
  apiKeyRequiredForLiveDiscovery?: boolean
  apiKeyPresent?: boolean
  baseUrl?: string
  alternateBaseUrls?: string[]
  modelsEndpoint?: string
  modelsEndpointRequiresAuth?: boolean
  modelsEndpointScope?: string
  mode: ProviderDiscoveryMode
  source: ModelDiscoverySource
  models: ProviderDiscoveredModel[]
  totalDiscovered: number
  liveDiscoveryAttempted: boolean
  liveDiscoverySucceeded?: boolean
  liveDiscoverySkipped: boolean
  liveDiscoverySkipReason?: string | null
  docsFallbackUsed?: boolean
  docsFallbackRepresentative?: boolean
  docsFallbackComplete?: boolean
  publicDiscoveryAttempted?: boolean
  publicDiscoverySucceeded?: boolean
  publicEndpointUsed?: boolean
  providerUniverseKnown?: boolean
  providerUniversePartiallyKnown?: boolean
  publicDocsUniverseKnown?: boolean
  authenticatedUniverseKnown?: boolean
  endpointSource: string
  error: string | null
  returnedModelCount?: number
  publicEndpointModelCount?: number
  staticFallbackCount?: number
  docsFallbackCount?: number
  effectiveCatalogueCount?: number
  runtimeExecutionAllowed?: boolean
  policyRestrictedByApp?: boolean
  policyExecutionDisabled?: boolean
  policyBlockedReason?: string | null
  discoveredAt: string
  notes: string[]
}

export const STATIC_DISCOVERY_TIMESTAMP = '1970-01-01T00:00:00.000Z'

export function isCapabilityKey(value: string): value is CapabilityKey {
  return (CAPABILITY_KEYS as readonly string[]).includes(value)
}

export function isProviderKey(value: string): value is ProviderKey {
  return (PROVIDER_KEYS as readonly string[]).includes(value)
}

export function inferCapabilitiesFromModelId(modelId: string, rawType = ''): CapabilityKey[] {
  const text = `${modelId} ${rawType}`.toLowerCase()
  const caps = new Set<CapabilityKey>()

  if (text.includes('music') || text.includes('lyria') || text.includes('song')) caps.add('music_generation')
  if (text.includes('image') || text.includes('flux') || text.includes('stable-diffusion') || text.includes('sdxl')) caps.add('image_generation')
  if (text.includes('video') || text.includes('seedance') || text.includes('veo') || text.includes('wan')) caps.add('video_generation')
  if (text.includes('embed')) caps.add('embeddings')
  if (text.includes('rerank')) caps.add('reranking')
  if (text.includes('whisper') || text.includes('transcrib')) caps.add('stt')
  if (text.includes('tts') || text.includes('speech') || text.includes('orpheus') || text.includes('playai')) caps.add('tts')
  if (text.includes('code')) caps.add('code')
  if (text.includes('vision') || text.includes('multimodal')) caps.add('visual_question_answering')
  if (caps.size === 0) caps.add('chat')

  return [...caps]
}

export function buildCapabilityReadiness(model: ProviderDiscoveredModel): CapabilityExecutionReadiness[] {
  return model.inferredCapabilities.map((capability) => {
    const modelDiscovered = model.liveDiscovered || model.docsKnown
    const modelCatalogued = Boolean(model.modelId)
    const capabilityInferred = true
    const endpointShapeKnown = model.endpointShapeKnown
    const providerClientExists = model.providerClientExists
    const workerExecutorExists = model.workerExecutorExists && hasExecutorRegistration(capability, model.executionProvider)
    const artifactPersistenceExists = model.artifactPersistenceExists
    const liveProbePassed = model.liveDiscovered
    const blockers = [
      !modelDiscovered ? 'model_not_discovered' : '',
      !modelCatalogued ? 'model_not_catalogued' : '',
      !endpointShapeKnown ? 'endpoint_shape_unknown' : '',
      !providerClientExists ? 'provider_client_missing' : '',
      !workerExecutorExists ? 'worker_executor_missing' : '',
      model.artifactOutput && !artifactPersistenceExists ? 'artifact_persistence_missing' : '',
      !liveProbePassed ? 'live_probe_missing' : '',
      model.policyRestrictedByApp ? model.policyBlockedReason || 'policy_restricted' : '',
    ].filter(Boolean)
    return {
      capability,
      modelDiscovered,
      modelCatalogued,
      capabilityInferred,
      endpointShapeKnown,
      providerClientExists,
      workerExecutorExists,
      artifactPersistenceExists,
      liveProbePassed,
      executableNow: blockers.length === 0,
      blockedReason: blockers.join(', '),
    }
  })
}
