import { getGenxBaseUrl } from '@amarktai/core'

export interface DiscoveredModel {
  provider: string
  modelId: string
  displayName: string
  family: string
  category: string
  primaryRole: string
  costTier: string
  latencyTier: string
  contextWindow: number
  capabilities: Record<string, boolean>
  estimatedUnitCost: number | null
  qualityTier: string
  source: string
  catalogCompleteness: string
  isLiveDiscovered: boolean
  modelOwner: string
  providerRawType: string
  providerRawCategory: string
  notes: string
  rawMetadata: Record<string, unknown>
  discoveredAt: string
  lastSyncedAt: string
  pricingSource: string
  pricingConfidence: string
  pricingUnit: string
  pricingCurrency: string
  pricingRawMetadata: Record<string, unknown>
  lastPricingSyncedAt: string | null
  pricingBlocker: string
}

export interface DiscoveryResult {
  provider: string
  models: DiscoveredModel[]
  totalDiscovered: number
  source: string
  catalogCompleteness: string
  discoveredAt: string
  error: string | null
}

export interface GenXPricingEntry {
  input: number | null
  output: number | null
  unit: string
  currency: string
  usdEstimateCents: number | null
  pricingSource: string
  pricingConfidence: string
  rawMetadata: Record<string, unknown>
  pricingBlocker: string
}

export interface GenXPricingResult {
  pricing: Record<string, GenXPricingEntry>
  source: string
  syncedAt: string
  error: string | null
}

const GENX_MODEL_CATEGORIES = ['', 'video', 'image', 'avatar', 'audio', 'voice', 'multimodal']

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === 'object' && value !== null
}

function asString(value: unknown): string {
  return typeof value === 'string' ? value : ''
}

function asNumber(value: unknown): number | null {
  const number = Number(value)
  return Number.isFinite(number) ? number : null
}

function modelListFromPayload(payload: unknown): Record<string, unknown>[] {
  if (Array.isArray(payload)) return payload.filter(isRecord)
  if (!isRecord(payload)) return []

  for (const key of ['data', 'models', 'items', 'results']) {
    const value = payload[key]
    if (Array.isArray(value)) return value.filter(isRecord)
  }

  return []
}

function nextUrlFromPayload(payload: unknown, currentUrl: URL): string | null {
  if (!isRecord(payload)) return null
  const directNext = payload.next ?? payload.next_url ?? payload.nextPage ?? payload.nextPageUrl
  if (typeof directNext === 'string' && directNext.trim()) return new URL(directNext, currentUrl).toString()

  const cursor = payload.next_cursor ?? payload.nextCursor ?? payload.cursor
  if (typeof cursor === 'string' && cursor.trim()) {
    const next = new URL(currentUrl.toString())
    next.searchParams.set('cursor', cursor)
    return next.toString()
  }

  return null
}

function payloadProvesComplete(payload: unknown, itemCount: number): boolean {
  if (!isRecord(payload)) return false

  const hasMore = payload.has_more ?? payload.hasMore
  if (hasMore === false) return true

  const next = payload.next ?? payload.next_url ?? payload.nextPage ?? payload.nextPageUrl ?? payload.next_cursor ?? payload.nextCursor
  const total = asNumber(payload.total ?? payload.count ?? payload.total_count ?? payload.totalCount)
  if ((next === null || next === '' || next === undefined) && total !== null && total <= itemCount) return true

  return false
}

function safeEndpointDescriptor(url: string): string {
  try {
    const parsed = new URL(url)
    return `${parsed.origin}${parsed.pathname}${parsed.search}`
  } catch {
    return '[invalid-url]'
  }
}

function safeHostDescriptor(url: string): string {
  try {
    return new URL(url).host
  } catch {
    return '[invalid-host]'
  }
}

function redactSecret(value: string, secret: string): string {
  return secret ? value.split(secret).join('[redacted]') : value
}

function safeFetchFailureMessage(err: unknown, url: string, apiKey: string): string {
  const rawMessage = err instanceof Error && err.message ? err.message : 'fetch failed'
  const message = redactSecret(rawMessage, apiKey)
  return `fetch failed for ${safeEndpointDescriptor(url)}; host=${safeHostDescriptor(url)}; message=${message}`
}

function resolveGenxDiscoveryBaseUrl(baseUrl?: string): string {
  return baseUrl?.trim() || getGenxBaseUrl()
}

async function fetchJson(url: string, apiKey: string): Promise<{ ok: boolean; status: number; payload: unknown; text: string }> {
  let response: Response
  try {
    response = await fetch(url, {
      headers: { Authorization: `Bearer ${apiKey}`, Accept: 'application/json' },
    })
  } catch (err) {
    throw new Error(safeFetchFailureMessage(err, url, apiKey))
  }

  const text = await response.text()
  let payload: unknown = null
  try {
    payload = text ? JSON.parse(text) : null
  } catch {
    payload = null
  }
  return { ok: response.ok, status: response.status, payload, text }
}

async function fetchPaginated(url: string, apiKey: string): Promise<{
  items: Record<string, unknown>[]
  successfulCalls: number
  failedCalls: number
  provedComplete: boolean
  errors: string[]
}> {
  const items: Record<string, unknown>[] = []
  const errors: string[] = []
  const seenUrls = new Set<string>()
  let nextUrl: string | null = url
  let successfulCalls = 0
  let failedCalls = 0
  let lastPayload: unknown = null
  let lastPageItems = 0

  while (nextUrl && !seenUrls.has(nextUrl)) {
    seenUrls.add(nextUrl)
    let result: { ok: boolean; status: number; payload: unknown; text: string }
    try {
      result = await fetchJson(nextUrl, apiKey)
    } catch (err) {
      failedCalls++
      errors.push(err instanceof Error ? err.message : `fetch failed for ${safeEndpointDescriptor(nextUrl)}`)
      break
    }
    if (!result.ok) {
      failedCalls++
      errors.push(`${nextUrl} returned ${result.status}`)
      break
    }

    successfulCalls++
    lastPayload = result.payload
    const pageItems = modelListFromPayload(result.payload)
    lastPageItems = pageItems.length
    items.push(...pageItems)
    nextUrl = nextUrlFromPayload(result.payload, new URL(nextUrl))
  }

  return {
    items,
    successfulCalls,
    failedCalls,
    provedComplete: lastPayload ? payloadProvesComplete(lastPayload, lastPageItems) : false,
    errors,
  }
}

function makeModel(input: Partial<DiscoveredModel> & Pick<DiscoveredModel, 'provider' | 'modelId' | 'displayName' | 'category' | 'primaryRole' | 'capabilities' | 'source' | 'catalogCompleteness' | 'isLiveDiscovered' | 'rawMetadata' | 'discoveredAt'>): DiscoveredModel {
  const pricingSource = input.pricingSource ?? 'unknown'
  const pricingConfidence = input.pricingConfidence ?? 'unknown'
  return {
    family: input.family ?? input.modelId.split('/')[0] ?? '',
    costTier: input.costTier ?? 'unknown',
    latencyTier: input.latencyTier ?? 'medium',
    contextWindow: input.contextWindow ?? 0,
    estimatedUnitCost: input.estimatedUnitCost ?? null,
    qualityTier: input.qualityTier ?? 'standard',
    modelOwner: input.modelOwner ?? input.modelId.split('/')[0] ?? input.provider,
    providerRawType: input.providerRawType ?? '',
    providerRawCategory: input.providerRawCategory ?? '',
    notes: input.notes ?? '',
    lastSyncedAt: input.lastSyncedAt ?? input.discoveredAt,
    pricingSource,
    pricingConfidence,
    pricingUnit: input.pricingUnit ?? '',
    pricingCurrency: input.pricingCurrency ?? '',
    pricingRawMetadata: input.pricingRawMetadata ?? {},
    lastPricingSyncedAt: input.lastPricingSyncedAt ?? null,
    pricingBlocker: input.pricingBlocker ?? (pricingSource === 'unknown' ? 'pricing_unknown' : ''),
    ...input,
  }
}

function costTierFromPricing(estimatedUnitCost: number | null): string {
  if (estimatedUnitCost === null) return 'unknown'
  if (estimatedUnitCost === 0) return 'free'
  if (estimatedUnitCost < 0.000001) return 'very_low'
  if (estimatedUnitCost < 0.00001) return 'low'
  if (estimatedUnitCost < 0.0001) return 'medium'
  if (estimatedUnitCost < 0.001) return 'high'
  return 'premium'
}

function pricingFromProviderMetadata(pricing: unknown): {
  estimatedUnitCost: number | null
  pricingUnit: string
  pricingCurrency: string
  pricingSource: string
  pricingConfidence: string
  pricingBlocker: string
  pricingRawMetadata: Record<string, unknown>
} {
  if (!isRecord(pricing)) {
    return {
      estimatedUnitCost: null,
      pricingUnit: '',
      pricingCurrency: '',
      pricingSource: 'unknown',
      pricingConfidence: 'unknown',
      pricingBlocker: 'pricing_unknown',
      pricingRawMetadata: {},
    }
  }

  const prompt = asNumber(pricing.prompt ?? pricing.input ?? pricing.price ?? pricing.usd)
  const currency = asString(pricing.currency) || 'usd'
  const unit = asString(pricing.unit) || 'token'
  const hasUsd = currency.toLowerCase() === 'usd'

  return {
    estimatedUnitCost: hasUsd ? prompt : null,
    pricingUnit: unit,
    pricingCurrency: currency,
    pricingSource: 'provider_api',
    pricingConfidence: hasUsd && prompt !== null ? 'known' : 'unknown',
    pricingBlocker: hasUsd && prompt !== null ? '' : 'provider_pricing_not_usd',
    pricingRawMetadata: pricing,
  }
}

function mapTogetherType(type: string, id: string): { category: string; role: string; capabilities: Record<string, boolean> } {
  const lower = type.toLowerCase()
  const idLower = id.toLowerCase()

  if (lower.includes('image') || idLower.includes('flux') || idLower.includes('stable-diffusion')) {
    if (idLower.includes('edit')) return { category: 'image', role: 'image_edit', capabilities: { supportsImageEditing: true } }
    return { category: 'image', role: 'image_generation', capabilities: { supportsImageGeneration: true } }
  }
  if (lower.includes('embedding') || idLower.includes('embed')) return { category: 'embeddings', role: 'embeddings', capabilities: { supportsEmbeddings: true } }
  if (lower.includes('rerank') || idLower.includes('rerank')) return { category: 'reranking', role: 'reranking', capabilities: { supportsReranking: true } }
  if (lower.includes('audio') || lower.includes('speech')) return { category: 'audio', role: 'stt', capabilities: { supportsStt: true } }
  if (lower.includes('video') || idLower.includes('video') || idLower.includes('wan')) return { category: 'video', role: 'video_generation', capabilities: { supportsVideoGeneration: true } }

  const capabilities: Record<string, boolean> = { supportsChat: true, supportsText: true }
  if (idLower.includes('code')) capabilities.supportsCode = true
  return { category: 'text', role: 'chat', capabilities }
}

export async function discoverTogetherModels(apiKey: string): Promise<DiscoveryResult> {
  const discoveredAt = new Date().toISOString()

  try {
    const response = await fetchJson('https://api.together.xyz/v1/models', apiKey)
    if (!response.ok) {
      return { provider: 'together', models: [], totalDiscovered: 0, source: 'provider_api', catalogCompleteness: 'discovery_failed', discoveredAt, error: `Together API returned ${response.status}` }
    }

    const items = modelListFromPayload(response.payload)
    const hasMediaBeyondImage = items.some((item) => {
      const mapped = mapTogetherType(asString(item.type), asString(item.id))
      return mapped.category === 'video' || mapped.category === 'audio'
    })
    const completeness = hasMediaBeyondImage ? 'partial_from_provider_api' : 'partial_from_provider_api'

    const models = items.map((item) => {
      const id = asString(item.id)
      const pricing = pricingFromProviderMetadata(item.pricing)
      const mapped = mapTogetherType(asString(item.type), id)
      return makeModel({
        provider: 'together',
        modelId: id,
        displayName: asString(item.display_name) || asString(item.name) || id,
        family: id.split('/')[0] || '',
        category: mapped.category,
        primaryRole: mapped.role,
        capabilities: mapped.capabilities,
        contextWindow: asNumber(item.context_length) ?? asNumber(item.contextWindow) ?? 4096,
        source: 'provider_api',
        catalogCompleteness: completeness,
        isLiveDiscovered: true,
        modelOwner: asString(item.organization) || id.split('/')[0] || '',
        providerRawType: asString(item.type),
        notes: 'Discovered from Together /v1/models. This endpoint is not treated as complete serverless video/audio coverage unless those models are returned by the API.',
        rawMetadata: item,
        discoveredAt,
        costTier: costTierFromPricing(pricing.estimatedUnitCost),
        ...pricing,
      })
    })

    return { provider: 'together', models, totalDiscovered: models.length, source: 'provider_api', catalogCompleteness: completeness, discoveredAt, error: null }
  } catch (err) {
    return { provider: 'together', models: [], totalDiscovered: 0, source: 'provider_api', catalogCompleteness: 'discovery_failed', discoveredAt, error: err instanceof Error ? err.message : 'Unknown error' }
  }
}

function mapDeepInfraTask(taskInput: string, idInput: string): { category: string; role: string; capabilities: Record<string, boolean> } {
  const task = taskInput.toLowerCase()
  const id = idInput.toLowerCase()
  const text = `${task} ${id}`

  if (text.includes('text-to-image') || text.includes('image-generation')) return { category: 'image', role: 'image_generation', capabilities: { supportsImageGeneration: true } }
  if (text.includes('text-to-video') || text.includes('video-generation')) return { category: 'video', role: 'video_generation', capabilities: { supportsVideoGeneration: true } }
  if (text.includes('text-to-music') || text.includes('music-generation')) return { category: 'audio', role: 'music_generation', capabilities: { supportsMusicGeneration: true } }
  if (text.includes('text-to-speech') || text.includes('tts')) return { category: 'audio', role: 'tts', capabilities: { supportsTts: true } }
  if (text.includes('automatic-speech-recognition') || text.includes('speech-to-text') || text.includes('whisper')) return { category: 'audio', role: 'stt', capabilities: { supportsStt: true } }
  if (text.includes('embedding') || text.includes('feature-extraction')) return { category: 'embeddings', role: 'embeddings', capabilities: { supportsEmbeddings: true } }
  if (text.includes('rerank')) return { category: 'reranking', role: 'reranking', capabilities: { supportsReranking: true } }
  if (text.includes('ocr') || text.includes('vision') || text.includes('multimodal')) return { category: 'multimodal', role: 'ocr', capabilities: { supportsMultimodal: true } }
  if (text.includes('code')) return { category: 'text', role: 'code', capabilities: { supportsCode: true, supportsText: true } }
  return { category: 'text', role: 'chat', capabilities: { supportsChat: true, supportsText: true } }
}

export async function discoverDeepInfraModels(apiKey: string): Promise<DiscoveryResult> {
  const discoveredAt = new Date().toISOString()

  try {
    const response = await fetchJson('https://api.deepinfra.com/v1/openai/models', apiKey)
    if (!response.ok) {
      return { provider: 'deepinfra', models: [], totalDiscovered: 0, source: 'provider_api', catalogCompleteness: 'discovery_failed', discoveredAt, error: `DeepInfra API returned ${response.status}` }
    }

    const items = modelListFromPayload(response.payload)
    const categories = new Set<string>()
    const models = items.map((item) => {
      const id = asString(item.id)
      const task = asString(item.task ?? item.pipeline_tag ?? item.type)
      const mapped = mapDeepInfraTask(task, id)
      categories.add(mapped.category)
      const pricing = pricingFromProviderMetadata(item.pricing)
      return makeModel({
        provider: 'deepinfra',
        modelId: id,
        displayName: asString(item.name) || id,
        category: mapped.category,
        primaryRole: mapped.role,
        capabilities: mapped.capabilities,
        contextWindow: asNumber(item.max_model_len) ?? asNumber(item.context) ?? 4096,
        source: 'provider_api',
        catalogCompleteness: 'partial_from_provider_api',
        isLiveDiscovered: true,
        modelOwner: asString(item.owned_by) || id.split('/')[0] || '',
        providerRawType: asString(item.object),
        providerRawCategory: task,
        notes: 'Discovered from DeepInfra OpenAI-compatible models endpoint. Non-chat categories are mapped when returned; this endpoint is not treated as complete DeepInfra coverage.',
        rawMetadata: item,
        discoveredAt,
        costTier: costTierFromPricing(pricing.estimatedUnitCost),
        ...pricing,
      })
    })

    return { provider: 'deepinfra', models, totalDiscovered: models.length, source: 'provider_api', catalogCompleteness: categories.size > 0 ? 'partial_from_provider_api' : 'unknown', discoveredAt, error: null }
  } catch (err) {
    return { provider: 'deepinfra', models: [], totalDiscovered: 0, source: 'provider_api', catalogCompleteness: 'discovery_failed', discoveredAt, error: err instanceof Error ? err.message : 'Unknown error' }
  }
}

function mapGenXCategory(rawCategory: string, id: string): { category: string; role: string; capabilities: Record<string, boolean> } {
  const category = rawCategory.toLowerCase()
  const idLower = id.toLowerCase()
  if (category.includes('image') || idLower.includes('image')) return { category: 'image', role: 'image_generation', capabilities: { supportsImageGeneration: true } }
  if (category.includes('avatar') || idLower.includes('avatar')) return { category: 'video', role: 'avatar_generation', capabilities: { supportsVideoGeneration: true } }
  if (category.includes('audio') || category.includes('voice') || idLower.includes('tts') || idLower.includes('voice')) {
    if (idLower.includes('music') || idLower.includes('lyria') || category.includes('music')) {
      return { category: 'audio', role: 'music_generation', capabilities: { supportsMusicGeneration: true } }
    }
    return { category: 'audio', role: 'tts', capabilities: { supportsTts: true } }
  }
  if (category.includes('music')) return { category: 'audio', role: 'music_generation', capabilities: { supportsMusicGeneration: true } }
  if (category.includes('multimodal')) return { category: 'multimodal', role: 'multimodal', capabilities: { supportsMultimodal: true } }
  return { category: 'video', role: 'video_generation', capabilities: { supportsVideoGeneration: true } }
}

export async function discoverGenXModels(apiKey: string, baseUrl?: string): Promise<DiscoveryResult> {
  const discoveredAt = new Date().toISOString()
  const base = resolveGenxDiscoveryBaseUrl(baseUrl)
  const deduped = new Map<string, Record<string, unknown>>()
  let successfulCalls = 0
  let failedCalls = 0
  let provedCompleteCalls = 0
  const errors: string[] = []

  for (const category of GENX_MODEL_CATEGORIES) {
    const url = new URL('/api/v1/models', base)
    if (category) url.searchParams.set('category', category)
    const result = await fetchPaginated(url.toString(), apiKey)
    successfulCalls += result.successfulCalls
    failedCalls += result.failedCalls
    if (result.provedComplete) provedCompleteCalls++
    errors.push(...result.errors)

    for (const item of result.items) {
      const id = asString(item.id ?? item.model ?? item.slug)
      if (!id) continue
      const existing = deduped.get(id) ?? {}
      deduped.set(id, { ...existing, ...item, category: item.category ?? category })
    }
  }

  if (!deduped.size) {
    return { provider: 'genx', models: [], totalDiscovered: 0, source: 'provider_api_failed', catalogCompleteness: 'discovery_failed', discoveredAt, error: errors[0] ?? `GenX discovery returned no models from host=${safeHostDescriptor(base)}` }
  }

  const attemptedAllCategories = GENX_MODEL_CATEGORIES.length
  const completeness = failedCalls === 0 && provedCompleteCalls === attemptedAllCategories
    ? 'complete_from_provider_api'
    : successfulCalls > 0
      ? 'partial_from_provider_api'
      : 'discovery_failed'

  const models = Array.from(deduped.values()).map((item) => {
    const id = asString(item.id ?? item.model ?? item.slug)
    const rawCategory = asString(item.category)
    const mapped = mapGenXCategory(rawCategory, id)
    const pricing = pricingFromProviderMetadata(item.pricing)
    return makeModel({
      provider: 'genx',
      modelId: id,
      displayName: asString(item.name) || id,
      family: 'genx',
      category: mapped.category,
      primaryRole: mapped.role,
      capabilities: mapped.capabilities,
      latencyTier: 'high',
      qualityTier: mapped.category === 'video' ? 'premium' : 'standard',
      source: 'provider_api',
      catalogCompleteness: completeness,
      isLiveDiscovered: true,
      modelOwner: 'genx',
      providerRawCategory: rawCategory,
      notes: `Discovered from GenX category sweep. Completeness: ${completeness}.`,
      rawMetadata: item,
      discoveredAt,
      costTier: costTierFromPricing(pricing.estimatedUnitCost),
      ...pricing,
    })
  })

  return { provider: 'genx', models, totalDiscovered: models.length, source: 'provider_api', catalogCompleteness: completeness, discoveredAt, error: errors.length ? errors.join('; ') : null }
}

export async function discoverGroqModels(apiKey: string): Promise<DiscoveryResult> {
  const discoveredAt = new Date().toISOString()

  try {
    const response = await fetchJson('https://api.groq.com/openai/v1/models', apiKey)
    if (!response.ok) {
      return { provider: 'groq', models: [], totalDiscovered: 0, source: 'provider_api', catalogCompleteness: 'discovery_failed', discoveredAt, error: `Groq API returned ${response.status}` }
    }

    const items = modelListFromPayload(response.payload)
    const models = items.map((item) => {
      const id = asString(item.id)
      const lowerId = id.toLowerCase()
      let category = 'text'
      let role = 'chat'
      const capabilities: Record<string, boolean> = { supportsChat: true, supportsText: true }

      if (lowerId.includes('whisper') || lowerId.includes('distil-whisper')) {
        category = 'audio'; role = 'stt'; delete capabilities.supportsChat; delete capabilities.supportsText; capabilities.supportsStt = true
      } else if (lowerId.includes('tts') || lowerId.includes('playai') || lowerId.includes('orpheus')) {
        category = 'audio'; role = 'tts'; delete capabilities.supportsChat; delete capabilities.supportsText; capabilities.supportsTts = true
      } else if (lowerId.includes('vision') || lowerId.includes('llama-3.2')) {
        capabilities.supportsMultimodal = true
      } else if (lowerId.includes('tool') || lowerId.includes('compound')) {
        capabilities.supportsToolUse = true
      }

      if (isRecord(item.capabilities)) {
        if (item.capabilities.structured_output) capabilities.supportsStructuredOutput = true
        if (item.capabilities.tool_use) capabilities.supportsToolUse = true
        if (item.capabilities.vision) capabilities.supportsMultimodal = true
      }

      const pricing = pricingFromProviderMetadata(item.pricing)
      return makeModel({
        provider: 'groq',
        modelId: id,
        displayName: id,
        family: id.split('-')[0] || 'groq',
        category,
        primaryRole: role,
        capabilities,
        contextWindow: asNumber(item.context_window) ?? 4096,
        latencyTier: 'ultra_low',
        source: 'provider_api',
        catalogCompleteness: payloadProvesComplete(response.payload, items.length) ? 'complete_from_provider_api' : 'partial_from_provider_api',
        isLiveDiscovered: true,
        modelOwner: asString(item.owned_by) || 'groq',
        providerRawType: asString(item.object),
        notes: `Discovered from Groq models API. Active: ${String(item.active ?? 'unknown')}.`,
        rawMetadata: item,
        discoveredAt,
        costTier: costTierFromPricing(pricing.estimatedUnitCost),
        ...pricing,
      })
    })

    return { provider: 'groq', models, totalDiscovered: models.length, source: 'provider_api', catalogCompleteness: models[0]?.catalogCompleteness ?? 'unknown', discoveredAt, error: null }
  } catch (err) {
    return { provider: 'groq', models: [], totalDiscovered: 0, source: 'provider_api', catalogCompleteness: 'discovery_failed', discoveredAt, error: err instanceof Error ? err.message : 'Unknown error' }
  }
}

export async function discoverGenXPricing(apiKey: string, baseUrl?: string): Promise<GenXPricingResult> {
  const syncedAt = new Date().toISOString()
  const base = resolveGenxDiscoveryBaseUrl(baseUrl)

  try {
    const pricingUrl = new URL('/api/v1/account/pricing', base).toString()
    const response = await fetchJson(pricingUrl, apiKey)
    if (!response.ok) {
      return { pricing: {}, source: 'provider_api_failed', syncedAt, error: `GenX pricing API returned ${response.status} for ${safeEndpointDescriptor(pricingUrl)}` }
    }

    const pricing: Record<string, GenXPricingEntry> = {}
    const container = isRecord(response.payload) && isRecord(response.payload.pricing)
      ? response.payload.pricing
      : response.payload

    if (isRecord(container)) {
      for (const [modelId, value] of Object.entries(container)) {
        if (!isRecord(value)) continue
        const currency = asString(value.currency) || (asString(value.unit).includes('credit') ? 'genx_credits' : 'usd')
        const unit = asString(value.unit) || 'request'
        const input = asNumber(value.input ?? value.prompt ?? value.price ?? value.cost)
        const output = asNumber(value.output ?? value.completion)
        const usdEstimateCents = currency.toLowerCase() === 'usd'
          ? asNumber(value.usdEstimateCents ?? value.usd_cents ?? value.cents ?? value.priceCents)
          : null
        pricing[modelId] = {
          input,
          output,
          unit,
          currency,
          usdEstimateCents,
          pricingSource: 'provider_api',
          pricingConfidence: currency.toLowerCase() === 'usd' && usdEstimateCents !== null ? 'known' : 'unknown',
          rawMetadata: value,
          pricingBlocker: currency.toLowerCase() === 'usd' && usdEstimateCents !== null ? '' : 'genx_pricing_not_usd',
        }
      }
    }

    return { pricing, source: 'provider_api', syncedAt, error: null }
  } catch (err) {
    return { pricing: {}, source: 'provider_api_failed', syncedAt, error: err instanceof Error ? err.message : 'Unknown GenX pricing error' }
  }
}
