import { getGenxApiKey, getGenxBaseUrl } from '@amarktai/core'

export interface GenxAccountClientOptions {
  apiKey?: string
  baseUrl?: string
  fetchImpl?: typeof fetch
  timeoutMs?: number
}

export interface GenxCreditBalance {
  availableCredits: number
  balanceCredits: number
  reservedCredits: number
  tier: string | null
  raw: Record<string, unknown>
}

export interface GenxPricingMetric {
  metric: string
  credits: number
  unit: string
}

export interface GenxModelPricing {
  modelId: string
  category: string | null
  metrics: GenxPricingMetric[]
  raw: Record<string, unknown>
}

export interface GenxUsageEstimate {
  generations?: number
  images?: number
  videoSeconds?: number
  audioSeconds?: number
  inputTokens?: number
  outputTokens?: number
}

const CREDIT_KEYS = ['available_credits', 'availableCredits', 'credits_available', 'creditBalance', 'balance', 'credits'] as const
const RESERVED_KEYS = ['reserved_credits', 'reservedCredits', 'held_credits', 'heldCredits'] as const
const TIER_KEYS = ['tier', 'account_tier', 'accountTier', 'pricing_tier', 'pricingTier'] as const
const MODEL_KEYS = ['model_id', 'modelId', 'model', 'id', 'slug'] as const
const CATEGORY_KEYS = ['category', 'type', 'kind'] as const

function resolveApiKey(value?: string): string {
  return value?.trim() || getGenxApiKey()
}

function resolveBaseUrl(value?: string): string {
  return (value?.trim() || getGenxBaseUrl()).replace(/\/$/, '')
}

function asRecord(value: unknown): Record<string, unknown> {
  return value && typeof value === 'object' && !Array.isArray(value) ? value as Record<string, unknown> : {}
}

function finiteNumber(value: unknown): number | null {
  if (typeof value === 'number' && Number.isFinite(value)) return value
  if (typeof value === 'string' && value.trim()) {
    const parsed = Number(value.replaceAll(',', ''))
    if (Number.isFinite(parsed)) return parsed
  }
  return null
}

function firstNumber(records: Record<string, unknown>[], keys: readonly string[]): number | null {
  for (const record of records) {
    for (const key of keys) {
      const value = finiteNumber(record[key])
      if (value !== null) return value
    }
  }
  return null
}

function firstString(records: Record<string, unknown>[], keys: readonly string[]): string | null {
  for (const record of records) {
    for (const key of keys) {
      const value = record[key]
      if (typeof value === 'string' && value.trim()) return value.trim()
    }
  }
  return null
}

function nestedRecords(payload: Record<string, unknown>): Record<string, unknown>[] {
  return [
    payload,
    asRecord(payload.data),
    asRecord(payload.account),
    asRecord(payload.wallet),
    asRecord(asRecord(payload.data).account),
    asRecord(asRecord(payload.data).wallet),
  ]
}

async function requestJson(path: string, options: GenxAccountClientOptions): Promise<Record<string, unknown>> {
  const apiKey = resolveApiKey(options.apiKey)
  const fetchImpl = options.fetchImpl ?? fetch
  const response = await fetchImpl(`${resolveBaseUrl(options.baseUrl)}${path}`, {
    headers: {
      Authorization: `Bearer ${apiKey}`,
      'X-Api-Key': apiKey,
      Accept: 'application/json',
    },
    signal: AbortSignal.timeout(options.timeoutMs ?? 30_000),
  })

  const text = await response.text()
  let payload: unknown = {}
  if (text.trim()) {
    try { payload = JSON.parse(text) } catch { payload = { message: text.slice(0, 500) } }
  }
  if (!response.ok) {
    const record = asRecord(payload)
    const message = firstString([record, asRecord(record.error)], ['message', 'detail', 'error']) || `HTTP ${response.status}`
    throw new Error(`GenX account API request failed (${response.status}): ${message}`)
  }
  return asRecord(payload)
}

export async function genxGetCreditBalance(options: GenxAccountClientOptions = {}): Promise<GenxCreditBalance> {
  const raw = await requestJson('/api/v1/account/credits', options)
  const records = nestedRecords(raw)
  const available = firstNumber(records, CREDIT_KEYS)
  if (available === null || available < 0) throw new Error('GenX credit response did not contain a valid non-negative balance')
  const reserved = firstNumber(records, RESERVED_KEYS) ?? 0
  return {
    availableCredits: Math.max(0, available - reserved),
    balanceCredits: available,
    reservedCredits: reserved,
    tier: firstString(records, TIER_KEYS),
    raw,
  }
}

function pricingRows(raw: Record<string, unknown>): Record<string, unknown>[] {
  const candidates = [raw.data, raw.pricing, raw.prices, raw.models, raw.items, asRecord(raw.data).pricing, asRecord(raw.data).models]
  for (const candidate of candidates) {
    if (Array.isArray(candidate)) return candidate.map(asRecord).filter((row) => Object.keys(row).length > 0)
    if (candidate && typeof candidate === 'object') {
      return Object.entries(candidate as Record<string, unknown>).map(([modelId, value]) => ({ model_id: modelId, ...asRecord(value) }))
    }
  }
  return Object.keys(raw).length ? [raw] : []
}

function metricUnit(name: string): string {
  const value = name.toLowerCase()
  if (value.includes('million') || value.includes('1m') || value.includes('token')) return '1m_tokens'
  if (value.includes('video') && value.includes('second')) return 'video_second'
  if ((value.includes('audio') || value.includes('voice')) && value.includes('second')) return 'audio_second'
  if (value.includes('image')) return 'image'
  if (value.includes('generation') || value.includes('request') || value === 'price' || value === 'cost' || value === 'credits') return 'generation'
  return name
}

function collectPricingMetrics(row: Record<string, unknown>): GenxPricingMetric[] {
  const sources = [row, asRecord(row.pricing), asRecord(row.rates), asRecord(row.price), asRecord(row.cost)]
  const metrics = new Map<string, GenxPricingMetric>()
  const ignored = new Set([...MODEL_KEYS, ...CATEGORY_KEYS, 'name', 'display_name', 'displayName', 'provider', 'description'])

  for (const source of sources) {
    for (const [key, rawValue] of Object.entries(source)) {
      if (ignored.has(key)) continue
      const direct = finiteNumber(rawValue)
      const valueRecord = asRecord(rawValue)
      const nested = direct ?? firstNumber([valueRecord], ['credits', 'price', 'cost', 'amount', 'rate', 'value'])
      if (nested === null || nested < 0) continue
      const unit = firstString([valueRecord], ['unit', 'metric', 'billing_unit', 'billingUnit']) || metricUnit(key)
      const metric = key.toLowerCase()
      metrics.set(`${metric}:${unit}`, { metric, credits: nested, unit })
    }
  }
  return [...metrics.values()]
}

function normalizePricingRow(row: Record<string, unknown>): GenxModelPricing | null {
  const modelId = firstString([row], MODEL_KEYS)
  if (!modelId) return null
  return {
    modelId,
    category: firstString([row], CATEGORY_KEYS),
    metrics: collectPricingMetrics(row),
    raw: row,
  }
}

export async function genxGetPricing(category?: string, options: GenxAccountClientOptions = {}): Promise<GenxModelPricing[]> {
  const query = category?.trim() ? `?category=${encodeURIComponent(category.trim())}` : ''
  const raw = await requestJson(`/api/v1/account/pricing${query}`, options)
  return pricingRows(raw).map(normalizePricingRow).filter((row): row is GenxModelPricing => row !== null)
}

export async function genxGetModelPricing(modelId: string, options: GenxAccountClientOptions = {}): Promise<GenxModelPricing> {
  const normalized = modelId.trim()
  if (!normalized) throw new Error('GenX model ID is required for pricing lookup')
  const raw = await requestJson(`/api/v1/account/pricing/${encodeURIComponent(normalized)}`, options)
  const row = normalizePricingRow({ model_id: normalized, ...asRecord(raw.data), ...raw })
  if (!row || row.metrics.length === 0) throw new Error(`GenX pricing for ${normalized} did not contain usable rates`)
  return row
}

function usageForUnit(unit: string, usage: GenxUsageEstimate): number | null {
  const normalized = unit.toLowerCase()
  if (normalized.includes('video') && normalized.includes('second')) return usage.videoSeconds ?? null
  if ((normalized.includes('audio') || normalized.includes('voice')) && normalized.includes('second')) return usage.audioSeconds ?? null
  if (normalized.includes('image')) return usage.images ?? usage.generations ?? null
  if (normalized.includes('input') && normalized.includes('token')) return usage.inputTokens === undefined ? null : usage.inputTokens / 1_000_000
  if (normalized.includes('output') && normalized.includes('token')) return usage.outputTokens === undefined ? null : usage.outputTokens / 1_000_000
  if (normalized.includes('token')) {
    const tokens = (usage.inputTokens ?? 0) + (usage.outputTokens ?? 0)
    return tokens > 0 ? tokens / 1_000_000 : null
  }
  if (normalized.includes('generation') || normalized.includes('request') || normalized.includes('job')) return usage.generations ?? 1
  return null
}

export function estimateGenxCredits(pricing: GenxModelPricing, usage: GenxUsageEstimate): number | null {
  let total = 0
  let matched = false
  for (const metric of pricing.metrics) {
    const quantity = usageForUnit(metric.unit, usage) ?? usageForUnit(metric.metric, usage)
    if (quantity === null) continue
    total += metric.credits * quantity
    matched = true
  }
  return matched && Number.isFinite(total) ? Math.ceil(total * 1000) / 1000 : null
}
