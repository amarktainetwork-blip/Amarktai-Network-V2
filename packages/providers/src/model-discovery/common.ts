import {
  STATIC_DISCOVERY_TIMESTAMP,
  createDiscoveredModel,
  inferCapabilitiesFromModelId,
  type ProviderDiscoveredModel,
  type ProviderDiscoveryMode,
  type ProviderDiscoveryResult,
  type ProviderKey,
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
  return {
    provider,
    mode: 'safe_static',
    source: 'static_repo',
    models,
    totalDiscovered: models.length,
    liveDiscoveryAttempted: false,
    liveDiscoverySkipped: true,
    endpointSource,
    error: null,
    discoveredAt: STATIC_DISCOVERY_TIMESTAMP,
    notes,
  }
}

export function failedLiveResult(provider: ProviderKey, endpointSource: string, error: string, notes: string[]): ProviderDiscoveryResult {
  return {
    provider,
    mode: 'live_model_list',
    source: 'live_discovered',
    models: [],
    totalDiscovered: 0,
    liveDiscoveryAttempted: true,
    liveDiscoverySkipped: false,
    endpointSource,
    error,
    discoveredAt: new Date().toISOString(),
    notes,
  }
}

export async function fetchModelList(url: string, apiKey: string): Promise<unknown[]> {
  const response = await fetch(url, {
    headers: {
      Authorization: `Bearer ${apiKey}`,
      Accept: 'application/json',
    },
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
  endpointSource: string
  lastDiscoveredAt: string
  source: 'static_repo' | 'live_discovered'
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
  rawMetadata?: Record<string, unknown>
}): ProviderDiscoveredModel {
  const inferredCapabilities = inferCapabilitiesFromModelId(input.modelId, input.rawProviderType)
  return createDiscoveredModel({
    provider: input.provider,
    modelId: input.modelId,
    displayName: input.displayName || input.modelId,
    rawProviderType: input.rawProviderType || '',
    inferredCapabilities,
    contextWindow: input.contextWindow ?? null,
    maxOutputTokens: input.maxOutputTokens ?? null,
    inputPrice: input.inputPrice ?? null,
    outputPrice: input.outputPrice ?? null,
    streamingSupported: input.streamingSupported ?? false,
    batchSupported: input.batchSupported ?? false,
    endpointSource: input.endpointSource,
    endpointShapeKnown: input.endpointShapeKnown ?? true,
    requestShapeKnown: input.requestShapeKnown ?? input.providerClientExists,
    responseShapeKnown: input.responseShapeKnown ?? input.providerClientExists,
    providerClientExists: input.providerClientExists,
    workerExecutorExists: input.workerExecutorExists,
    lastDiscoveredAt: input.lastDiscoveredAt,
    source: input.source,
    liveDiscoverySkipped: input.source !== 'live_discovered',
    rawMetadata: input.rawMetadata,
  })
}

export function liveResult(provider: ProviderKey, endpointSource: string, mode: ProviderDiscoveryMode, models: ProviderDiscoveredModel[], notes: string[]): ProviderDiscoveryResult {
  return {
    provider,
    mode,
    source: 'live_discovered',
    models,
    totalDiscovered: models.length,
    liveDiscoveryAttempted: true,
    liveDiscoverySkipped: false,
    endpointSource,
    error: null,
    discoveredAt: models[0]?.lastDiscoveredAt ?? new Date().toISOString(),
    notes,
  }
}
