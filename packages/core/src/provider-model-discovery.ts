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

export function modalitiesForCapabilities(capabilities: CapabilityKey[]): string[] {
  const modalities = new Set<string>()
  for (const capability of capabilities) {
    if (['chat', 'reasoning', 'code', 'summarization', 'translation', 'classification', 'extraction', 'structured_output', 'campaign_generation', 'social_content_generation'].includes(capability)) {
      modalities.add('text')
    }
    if (['image_generation', 'image_edit', 'ocr'].includes(capability)) modalities.add('image')
    if (['video_generation', 'image_to_video', 'long_form_video', 'avatar_generation'].includes(capability)) modalities.add('video')
    if (['music_generation', 'tts', 'stt'].includes(capability)) modalities.add('audio')
    if (['embeddings', 'reranking', 'rag_search', 'rag_ingest', 'research'].includes(capability)) modalities.add('retrieval')
    if (capability === 'visual_question_answering') modalities.add('multimodal')
  }
  return [...modalities]
}

export function createDiscoveredModel(input: Omit<ProviderDiscoveredModel,
  | 'executionProvider'
  | 'upstreamProvider'
  | 'discoverySource'
  | 'docsKnown'
  | 'liveDiscovered'
  | 'category'
  | 'providerCategory'
  | 'modalities'
  | 'modalitiesIn'
  | 'modalitiesOut'
  | 'artifactOutput'
  | 'artifactOutputKnown'
  | 'artifactPersistenceExists'
  | 'authRequired'
  | 'providerCapabilityKnown'
  | 'policyRestrictedByApp'
  | 'policyBlockedReason'
  | 'transportProfile'
  | 'endpointFamily'
  | 'toolCallingSupported'
  | 'functionCallingSupported'
  | 'webhookSupported'
  | 'executableNow'
  | 'executableBlockers'
  | 'catalogueOnlyReason'
  | 'blockedReason'> & {
  executionProvider?: ProviderKey
  upstreamProvider?: string
  discoverySource?: ModelDiscoverySource
  docsKnown?: boolean
  liveDiscovered?: boolean
  category?: string
  providerCategory?: string
  modalities?: string[]
  modalitiesIn?: string[]
  modalitiesOut?: string[]
  artifactOutput?: boolean
  artifactOutputKnown?: boolean
  artifactPersistenceExists?: boolean
  authRequired?: boolean
  providerCapabilityKnown?: boolean
  policyRestrictedByApp?: boolean
  policyBlockedReason?: string
  transportProfile?: TransportProfile
  endpointFamily?: string
  toolCallingSupported?: boolean
  functionCallingSupported?: boolean
  webhookSupported?: boolean
  executableNow?: boolean
  executableBlockers?: string[]
  catalogueOnlyReason?: string
  blockedReason?: string
}): ProviderDiscoveredModel {
  const artifactOutput = input.artifactOutput ?? input.inferredCapabilities.some((capability) =>
    ['image_generation', 'image_edit', 'video_generation', 'image_to_video', 'long_form_video', 'avatar_generation', 'music_generation', 'tts'].includes(capability)
  )
  const artifactPersistenceExists = input.artifactPersistenceExists ?? !artifactOutput
  const policyRestrictedByApp = input.policyRestrictedByApp ?? input.provider === 'mimo'
  const policyBlockedReason = input.policyBlockedReason ?? (input.provider === 'mimo' ? 'coding_agent_only_not_backend_runtime' : '')
  const executableBlockers = input.executableBlockers ?? buildDiscoveryBlockers({
    ...input,
    artifactOutput,
    artifactPersistenceExists,
    policyRestrictedByApp,
  })
  const executableNow = false
  const blockedReason = input.blockedReason ?? (executableBlockers.join(', ') || 'runtime_truth_required')
  const defaultModalities = modalitiesForCapabilities(input.inferredCapabilities)

  return {
    ...input,
    executionProvider: input.executionProvider ?? input.provider,
    upstreamProvider: input.upstreamProvider ?? input.provider,
    discoverySource: input.discoverySource ?? input.source,
    docsKnown: input.docsKnown ?? input.source !== 'live_endpoint',
    liveDiscovered: input.liveDiscovered ?? (input.source === 'live_endpoint' || input.source === 'live_discovered'),
    category: input.category ?? input.rawProviderType,
    providerCategory: input.providerCategory ?? input.rawProviderType,
    modalitiesIn: input.modalitiesIn ?? defaultModalities,
    modalitiesOut: input.modalitiesOut ?? defaultModalities,
    modalities: input.modalities ?? defaultModalities,
    artifactOutput,
    artifactOutputKnown: input.artifactOutputKnown ?? artifactOutput,
    artifactPersistenceExists,
    authRequired: input.authRequired ?? true,
    providerCapabilityKnown: input.providerCapabilityKnown ?? true,
    policyRestrictedByApp,
    policyBlockedReason,
    transportProfile: input.transportProfile ?? (input.provider === 'mimo' ? 'docs_only_policy_restricted' : 'native_inference_json'),
    endpointFamily: input.endpointFamily ?? input.endpointSource,
    toolCallingSupported: input.toolCallingSupported ?? false,
    functionCallingSupported: input.functionCallingSupported ?? false,
    webhookSupported: input.webhookSupported ?? false,
    executableNow,
    executableBlockers,
    catalogueOnlyReason: input.catalogueOnlyReason ?? blockedReason,
    blockedReason,
  }
}

function buildDiscoveryBlockers(input: Pick<ProviderDiscoveredModel, 'endpointShapeKnown' | 'requestShapeKnown' | 'responseShapeKnown' | 'providerClientExists' | 'workerExecutorExists'> & {
  artifactOutput?: boolean
  artifactPersistenceExists?: boolean
  policyRestrictedByApp?: boolean
}): string[] {
  const missing: string[] = []
  if (!input.endpointShapeKnown) missing.push('endpoint_shape_unknown')
  if (!input.requestShapeKnown) missing.push('request_shape_unknown')
  if (!input.responseShapeKnown) missing.push('response_shape_unknown')
  if (!input.providerClientExists) missing.push('provider_client_missing')
  if (!input.workerExecutorExists) missing.push('worker_executor_missing')
  if (input.artifactOutput && input.artifactPersistenceExists === false) missing.push('artifact_persistence_missing')
  if (input.policyRestrictedByApp) missing.push('policy_restricted_by_app')
  return missing
}

export function buildCapabilityReadiness(models: ProviderDiscoveredModel[]): CapabilityExecutionReadiness[] {
  return CAPABILITY_KEYS.map((capability) => {
    const candidates = models.filter((model) => model.inferredCapabilities.includes(capability))
    const executorRegistered = candidates.some((model) => hasExecutorRegistration(capability, model.provider))
    const first = candidates[0]
    return {
      capability,
      modelDiscovered: candidates.length > 0,
      modelCatalogued: candidates.length > 0,
      capabilityInferred: candidates.length > 0,
      endpointShapeKnown: candidates.some((model) => model.endpointShapeKnown),
      providerClientExists: executorRegistered,
      workerExecutorExists: executorRegistered,
      artifactPersistenceExists: candidates.some((model) => model.artifactOutput),
      liveProbePassed: false,
      executableNow: false,
      blockedReason: executorRegistered ? 'runtime_configuration_and_proof_required' : first?.blockedReason ?? 'no_discovered_model',
    }
  })
}
