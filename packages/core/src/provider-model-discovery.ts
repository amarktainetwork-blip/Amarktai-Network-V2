import { CAPABILITY_KEYS, type CapabilityKey } from './capabilities.js'
import { PROVIDER_KEYS, type ProviderKey } from './providers.js'

export const MODEL_DISCOVERY_SOURCES = [
  'static_repo',
  'static_verified',
  'live_discovered',
  'manual_planned',
  'blocked_policy',
] as const

export type ModelDiscoverySource = (typeof MODEL_DISCOVERY_SOURCES)[number]

export const PROVIDER_DISCOVERY_MODES = ['safe_static', 'live_model_list'] as const
export type ProviderDiscoveryMode = (typeof PROVIDER_DISCOVERY_MODES)[number]

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
  rawProviderType: string
  modalities: string[]
  inferredCapabilities: CapabilityKey[]
  contextWindow: number | null
  maxOutputTokens: number | null
  inputPrice: number | null
  outputPrice: number | null
  artifactOutput: boolean
  streamingSupported: boolean
  batchSupported: boolean
  endpointSource: string
  endpointShapeKnown: boolean
  requestShapeKnown: boolean
  responseShapeKnown: boolean
  providerClientExists: boolean
  workerExecutorExists: boolean
  executableNow: boolean
  blockedReason: string
  lastDiscoveredAt: string
  source: ModelDiscoverySource
  liveDiscoverySkipped?: boolean
  rawMetadata?: Record<string, unknown>
}

export interface ProviderDiscoveryResult {
  provider: ProviderKey
  mode: ProviderDiscoveryMode
  source: ModelDiscoverySource
  models: ProviderDiscoveredModel[]
  totalDiscovered: number
  liveDiscoveryAttempted: boolean
  liveDiscoverySkipped: boolean
  endpointSource: string
  error: string | null
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
  if (text.includes('vision') || text.includes('multimodal')) caps.add('multimodal')
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
    if (capability === 'multimodal') modalities.add('multimodal')
  }
  return [...modalities]
}

export function createDiscoveredModel(input: Omit<ProviderDiscoveredModel, 'modalities' | 'artifactOutput' | 'executableNow' | 'blockedReason'> & {
  modalities?: string[]
  artifactOutput?: boolean
  executableNow?: boolean
  blockedReason?: string
}): ProviderDiscoveredModel {
  const artifactOutput = input.artifactOutput ?? input.inferredCapabilities.some((capability) =>
    ['image_generation', 'image_edit', 'video_generation', 'image_to_video', 'long_form_video', 'avatar_generation', 'music_generation', 'tts'].includes(capability)
  )
  const executableNow = input.executableNow ?? (
    input.endpointShapeKnown
    && input.requestShapeKnown
    && input.responseShapeKnown
    && input.providerClientExists
    && input.workerExecutorExists
  )
  const blockedReason = input.blockedReason ?? (executableNow
    ? ''
    : buildDiscoveryBlockedReason(input)
  )

  return {
    ...input,
    modalities: input.modalities ?? modalitiesForCapabilities(input.inferredCapabilities),
    artifactOutput,
    executableNow,
    blockedReason,
  }
}

function buildDiscoveryBlockedReason(input: Pick<ProviderDiscoveredModel, 'endpointShapeKnown' | 'requestShapeKnown' | 'responseShapeKnown' | 'providerClientExists' | 'workerExecutorExists'>): string {
  const missing: string[] = []
  if (!input.endpointShapeKnown) missing.push('endpoint_shape_unknown')
  if (!input.requestShapeKnown) missing.push('request_shape_unknown')
  if (!input.responseShapeKnown) missing.push('response_shape_unknown')
  if (!input.providerClientExists) missing.push('provider_client_missing')
  if (!input.workerExecutorExists) missing.push('worker_executor_missing')
  return missing.join(', ')
}

export function buildCapabilityReadiness(models: ProviderDiscoveredModel[]): CapabilityExecutionReadiness[] {
  return CAPABILITY_KEYS.map((capability) => {
    const candidates = models.filter((model) => model.inferredCapabilities.includes(capability))
    const executable = candidates.some((model) => model.executableNow)
    const first = candidates[0]
    return {
      capability,
      modelDiscovered: candidates.length > 0,
      modelCatalogued: candidates.length > 0,
      capabilityInferred: candidates.length > 0,
      endpointShapeKnown: candidates.some((model) => model.endpointShapeKnown),
      providerClientExists: candidates.some((model) => model.providerClientExists),
      workerExecutorExists: candidates.some((model) => model.workerExecutorExists),
      artifactPersistenceExists: candidates.some((model) => model.artifactOutput),
      liveProbePassed: false,
      executableNow: executable,
      blockedReason: executable ? '' : first?.blockedReason ?? 'no_discovered_model',
    }
  })
}
