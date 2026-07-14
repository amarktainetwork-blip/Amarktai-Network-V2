import {
  STATIC_DISCOVERY_TIMESTAMP,
  createDiscoveredModel,
  inferCapabilitiesFromModelId,
  getProviderDefinition,
  type CapabilityKey,
  type ProviderDiscoveredModel,
  type ProviderDiscoveryMode,
  type ProviderDiscoveryResult,
  type ProviderKey,
  type ModelDiscoverySource,
  type TransportProfile,
} from '@amarktai/core'

export interface DiscoveryAdapterOptions {
  live?: boolean
  apiKey?: string
  baseUrl?: string
  now?: string
}

export function discoveryTimestamp(options: DiscoveryAdapterOptions): string {
  return options.live ? options.now ?? new Date().toISOString() : STATIC_DISCOVERY_TIMESTAMP
}

export function skippedResult(provider: ProviderKey, endpointSource: string, models: ProviderDiscoveredModel[], notes: string[]): ProviderDiscoveryResult {
  const definition = getProviderDefinition(provider)
  return {
    provider,
    providerRole: definition.runtimeRole,
    docsCapabilityKnown: true,
    liveDiscoverySupported: provider !== 'mimo',
    docsFallbackSupported: true,
    apiKeyEnvName: provider === 'mimo' ? null : `${provider.toUpperCase()}_API_KEY`,
    apiKeyRequiredForLiveDiscovery: provider !== 'deepinfra' && provider !== 'mimo',
    apiKeyPresent: false,
    modelsEndpointRequiresAuth: provider !== 'deepinfra' && provider !== 'mimo',
    modelsEndpointScope: provider === 'mimo' ? 'docs_only_policy_restricted' : 'docs_fallback',
    mode: 'safe_static',
    source: 'docs_fallback',
    models,
    totalDiscovered: models.length,
    liveDiscoveryAttempted: false,
    liveDiscoverySucceeded: false,
    liveDiscoverySkipped: true,
    liveDiscoverySkipReason: provider === 'mimo' ? 'coding_agent_only_not_backend_runtime' : 'safe_static_or_missing_key',
    docsFallbackUsed: true,
    providerUniverseKnown: false,
    providerUniversePartiallyKnown: true,
    publicDocsUniverseKnown: true,
    authenticatedUniverseKnown: false,
    endpointSource,
    error: null,
    returnedModelCount: 0,
    staticFallbackCount: models.length,
    docsFallbackCount: models.length,
    effectiveCatalogueCount: models.length,
    runtimeExecutionAllowed: definition.backendExecutionAllowed,
    policyRestrictedByApp: definition.codingOnly,
    policyExecutionDisabled: !definition.backendExecutionAllowed,
    policyBlockedReason: provider === 'mimo' ? 'coding_agent_only_not_backend_runtime' : null,
    discoveredAt: STATIC_DISCOVERY_TIMESTAMP,
    notes,
  }
}

export function failedLiveResult(provider: ProviderKey, endpointSource: string, error: string, notes: string[]): ProviderDiscoveryResult {
  const definition = getProviderDefinition(provider)
  return {
    provider,
    providerRole: definition.runtimeRole,
    docsCapabilityKnown: true,
    liveDiscoverySupported: provider !== 'mimo',
    docsFallbackSupported: true,
    mode: 'live_model_list',
    source: 'docs_fallback',
    models: [],
    totalDiscovered: 0,
    liveDiscoveryAttempted: true,
    liveDiscoverySucceeded: false,
    liveDiscoverySkipped: false,
    liveDiscoverySkipReason: null,
    docsFallbackUsed: false,
    providerUniverseKnown: false,
    providerUniversePartiallyKnown: true,
    publicDocsUniverseKnown: true,
    authenticatedUniverseKnown: false,
    endpointSource,
    error,
    returnedModelCount: 0,
    staticFallbackCount: 0,
    docsFallbackCount: 0,
    effectiveCatalogueCount: 0,
    runtimeExecutionAllowed: definition.backendExecutionAllowed,
    policyRestrictedByApp: definition.codingOnly,
    policyExecutionDisabled: !definition.backendExecutionAllowed,
    policyBlockedReason: provider === 'mimo' ? 'coding_agent_only_not_backend_runtime' : null,
    discoveredAt: new Date().toISOString(),
    notes,
  }
}

export async function fetchModelList(url: string, apiKey?: string): Promise<unknown[]> {
  const headers: Record<string, string> = {
    Accept: 'application/json',
  }
  if (apiKey) headers.Authorization = `Bearer ${apiKey}`
  const response = await fetch(url, {
    headers,
  })
  if (!response.ok) {
    throw new Error(`model list endpoint returned ${response.status}`)
  }
  const payload = await response.json() as unknown
  if (Array.isArray(payload)) return payload
  if (payload && typeof payload === 'object') {
    const record = payload as Record<string, unknown>
    for (const key of ['data', 'models', 'items', 'results']) {
      if (Array.isArray(record[key])) return record[key] as unknown[]
    }
  }
  return []
}

export function stringField(record: Record<string, unknown>, keys: string[], fallback = ''): string {
  for (const key of keys) {
    const value = record[key]
    if (typeof value === 'string' && value.trim()) return value
  }
  return fallback
}

export function numberField(record: Record<string, unknown>, keys: string[]): number | null {
  for (const key of keys) {
    const value = Number(record[key])
    if (Number.isFinite(value)) return value
  }
  return null
}

export function modelFromProviderRecord(input: {
  provider: ProviderKey
  modelId: string
  displayName?: string
  rawProviderType?: string
  inferredCapabilities?: CapabilityKey[]
  endpointSource: string
  lastDiscoveredAt: string
  source: ModelDiscoverySource
  discoverySource?: ModelDiscoverySource
  executionProvider?: ProviderKey
  upstreamProvider?: string
  category?: string
  providerCategory?: string
  modalitiesIn?: string[]
  modalitiesOut?: string[]
  artifactPersistenceExists?: boolean
  providerCapabilityKnown?: boolean
  policyRestrictedByApp?: boolean
  policyBlockedReason?: string
  transportProfile?: TransportProfile
  endpointFamily?: string
  toolCallingSupported?: boolean
  functionCallingSupported?: boolean
  webhookSupported?: boolean
  executableBlockers?: string[]
  catalogueOnlyReason?: string
  providerClientExists: boolean
  workerExecutorExists: boolean
  endpointShapeKnown?: boolean
  requestShapeKnown?: boolean
  responseShapeKnown?: boolean
  contextWindow?: number | null
  maxOutputTokens?: number | null
  inputPrice?: number | null
  outputPrice?: number | null
  streamingSupported?: boolean
  batchSupported?: boolean
  publicEndpointDiscovered?: boolean
  rawMetadata?: Record<string, unknown>
}): ProviderDiscoveredModel {
  const inferredCapabilities = input.inferredCapabilities ?? inferCapabilitiesFromModelId(input.modelId, input.rawProviderType)
  return createDiscoveredModel({
    provider: input.provider,
    modelId: input.modelId,
    displayName: input.displayName || input.modelId,
    executionProvider: input.executionProvider,
    upstreamProvider: input.upstreamProvider,
    discoverySource: input.discoverySource ?? input.source,
    docsKnown: input.source !== 'live_endpoint' && input.source !== 'live_discovered',
    liveDiscovered: input.source === 'live_endpoint' || input.source === 'live_discovered',
    category: input.category,
    providerCategory: input.providerCategory,
    rawProviderType: input.rawProviderType || '',
    modalitiesIn: input.modalitiesIn,
    modalitiesOut: input.modalitiesOut,
    inferredCapabilities,
    contextWindow: input.contextWindow ?? null,
    maxOutputTokens: input.maxOutputTokens ?? null,
    inputPrice: input.inputPrice ?? null,
    outputPrice: input.outputPrice ?? null,
    streamingSupported: input.streamingSupported ?? false,
    batchSupported: input.batchSupported ?? false,
    artifactPersistenceExists: input.artifactPersistenceExists,
    providerCapabilityKnown: input.providerCapabilityKnown,
    policyRestrictedByApp: input.policyRestrictedByApp,
    policyBlockedReason: input.policyBlockedReason,
    transportProfile: input.transportProfile,
    endpointFamily: input.endpointFamily,
    toolCallingSupported: input.toolCallingSupported,
    functionCallingSupported: input.functionCallingSupported,
    webhookSupported: input.webhookSupported,
    endpointSource: input.endpointSource,
    endpointShapeKnown: input.endpointShapeKnown ?? true,
    requestShapeKnown: input.requestShapeKnown ?? input.providerClientExists,
    responseShapeKnown: input.responseShapeKnown ?? input.providerClientExists,
    providerClientExists: input.providerClientExists,
    workerExecutorExists: input.workerExecutorExists,
    executableBlockers: input.executableBlockers,
    catalogueOnlyReason: input.catalogueOnlyReason,
    lastDiscoveredAt: input.lastDiscoveredAt,
    source: input.source,
    liveDiscoverySkipped: input.source !== 'live_endpoint' && input.source !== 'live_discovered',
    publicEndpointDiscovered: input.publicEndpointDiscovered,
    rawMetadata: input.rawMetadata,
  })
}

export function liveResult(provider: ProviderKey, endpointSource: string, mode: ProviderDiscoveryMode, models: ProviderDiscoveredModel[], notes: string[]): ProviderDiscoveryResult {
  const definition = getProviderDefinition(provider)
  return {
    provider,
    providerRole: definition.runtimeRole,
    docsCapabilityKnown: true,
    liveDiscoverySupported: provider !== 'mimo',
    docsFallbackSupported: true,
    mode,
    source: 'live_endpoint',
    models,
    totalDiscovered: models.length,
    liveDiscoveryAttempted: true,
    liveDiscoverySucceeded: true,
    liveDiscoverySkipped: false,
    liveDiscoverySkipReason: null,
    docsFallbackUsed: false,
    providerUniverseKnown: provider !== 'mimo',
    providerUniversePartiallyKnown: provider === 'mimo',
    publicDocsUniverseKnown: true,
    authenticatedUniverseKnown: provider !== 'mimo',
    endpointSource,
    error: null,
    returnedModelCount: models.length,
    staticFallbackCount: 0,
    docsFallbackCount: 0,
    effectiveCatalogueCount: models.length,
    runtimeExecutionAllowed: definition.backendExecutionAllowed,
    policyRestrictedByApp: definition.codingOnly,
    policyExecutionDisabled: !definition.backendExecutionAllowed,
    policyBlockedReason: provider === 'mimo' ? 'coding_agent_only_not_backend_runtime' : null,
    discoveredAt: models[0]?.lastDiscoveredAt ?? new Date().toISOString(),
    notes,
  }
}
