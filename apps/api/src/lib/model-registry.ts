import { prisma } from '@amarktai/db'
import { APPROVED_PROVIDER_DEFINITIONS } from '@amarktai/core'
import type { DiscoveryResult, GenXPricingResult } from './provider-discovery.js'

const MAX_METADATA_CHARS = 500_000
const MAX_REFRESH_ERRORS = 25

export interface ModelCatalogEntry {
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
  notes: string
  pricingSource?: string
  pricingConfidence?: string
  pricingUnit?: string
  pricingCurrency?: string
  pricingRawMetadata?: Record<string, unknown>
  lastPricingSyncedAt?: string | null
  pricingBlocker?: string
}

export interface ModelCatalogRefreshSummary {
  providerKey: string
  totalFetched: number
  created: number
  updated: number
  failedRows: number
  errors: Array<{ modelId: string; message: string }>
}

export interface GenXPricingCatalogSummary {
  updated: number
  createdFromPricing: number
  missingPricingCount: number
  pricingKnownCount: number
  pricingUnknownCount: number
  failedRows: number
  errors: Array<{ modelId: string; message: string }>
  source: string
  catalogSource: string
  syncedAt: string
}

interface GenXPricingCatalogData {
  displayName: string
  family: string
  category: string
  primaryRole: string
  costTier: string
  latencyTier: string
  contextWindow: number
  estimatedUnitCost: number | null
  source: string
  catalogCompleteness: string
  isLiveDiscovered: boolean
  modelOwner: string
  providerRawType: string
  providerRawCategory: string
  rawMetadata: string
  discoveredAt: Date
  lastSyncedAt: Date
  pricingSource: string
  pricingConfidence: string
  pricingUnit: string
  pricingCurrency: string
  pricingRawMetadata: string
  lastPricingSyncedAt: Date
  pricingBlocker: string
  notes: string
  supportsText: boolean
  supportsReasoning: boolean
  supportsCode: boolean
  supportsChat: boolean
  supportsImageGeneration: boolean
  supportsImageEditing: boolean
  supportsVideoGeneration: boolean
  supportsStt: boolean
  supportsTts: boolean
  supportsEmbeddings: boolean
  supportsReranking: boolean
  supportsResearch: boolean
  supportsMultimodal: boolean
  supportsToolUse: boolean
  supportsStructuredOutput: boolean
}

function safeErrorMessage(err: unknown): string {
  const message = err instanceof Error ? err.message : String(err)
  return message
    .replace(/Bearer\s+[A-Za-z0-9._~+/=-]+/gi, 'Bearer [redacted]')
    .replace(/v1:[A-Za-z0-9+/=:_-]+/g, 'v1:[redacted]')
    .replace(/[A-Za-z0-9_-]*secret[A-Za-z0-9_-]*/gi, '[redacted]')
    .slice(0, 500)
}

export function stringifyMetadataSafely(value: unknown, label = 'metadata'): { json: string; warning: string } {
  const seen = new WeakSet<object>()
  let json: string

  try {
    json = JSON.stringify(value ?? {}, (_key, item) => {
      if (typeof item === 'bigint') return item.toString()
      if (typeof item === 'object' && item !== null) {
        if (seen.has(item)) return '[circular]'
        seen.add(item)
      }
      return item
    })
  } catch (err) {
    return {
      json: JSON.stringify({
        summarized: true,
        label,
        reason: `metadata_json_stringify_failed: ${safeErrorMessage(err)}`,
      }),
      warning: `${label}_stringify_failed`,
    }
  }

  if (!json) json = '{}'
  if (json.length <= MAX_METADATA_CHARS) return { json, warning: '' }

  return {
    json: JSON.stringify({
      summarized: true,
      truncated: true,
      label,
      originalChars: json.length,
      preview: json.slice(0, MAX_METADATA_CHARS),
    }),
    warning: `${label}_truncated`,
  }
}

function appendNote(notes: string, warning: string): string {
  if (!warning) return notes
  const suffix = `Metadata warning: ${warning}.`
  return notes ? `${notes} ${suffix}` : suffix
}

function appendBlocker(blocker: string, warning: string): string {
  if (!warning) return blocker
  return blocker ? `${blocker};${warning}` : warning
}

function costTierFromEstimatedUnitCost(estimatedUnitCost: number | null): string {
  if (estimatedUnitCost === null) return 'unknown'
  if (estimatedUnitCost === 0) return 'free'
  if (estimatedUnitCost < 0.000001) return 'very_low'
  if (estimatedUnitCost < 0.00001) return 'low'
  if (estimatedUnitCost < 0.0001) return 'medium'
  if (estimatedUnitCost < 0.001) return 'high'
  return 'premium'
}

function metadataString(value: Record<string, unknown>, key: string): string {
  const direct = value[key]
  return typeof direct === 'string' ? direct.trim() : ''
}

function resolveGenXPricingModelId(key: string, rawMetadata: Record<string, unknown>): string {
  return metadataString(rawMetadata, 'model')
    || metadataString(rawMetadata, 'id')
    || metadataString(rawMetadata, 'slug')
    || key
}

function mapGenXPricingCapabilities(rawCategoryInput: string, modelId: string): {
  category: string
  primaryRole: string
  capabilities: Record<string, boolean>
} {
  const rawCategory = rawCategoryInput.toLowerCase()
  const id = modelId.toLowerCase()
  const text = `${rawCategory} ${id}`

  if (text.includes('transcription') || text.includes('speech-to-text') || text.includes('stt') || text.includes('whisper')) {
    return { category: 'audio', primaryRole: 'stt', capabilities: { supportsStt: true } }
  }

  if (text.includes('voice') || text.includes('tts') || text.includes('text-to-speech')) {
    return { category: 'audio', primaryRole: 'tts', capabilities: { supportsTts: true } }
  }

  if (text.includes('avatar')) {
    return { category: 'video', primaryRole: 'avatar_generation', capabilities: { supportsVideoGeneration: true } }
  }

  if (text.includes('image') || text.includes('img')) {
    return { category: 'image', primaryRole: 'image_generation', capabilities: { supportsImageGeneration: true } }
  }

  if (text.includes('audio') || text.includes('music')) {
    return { category: 'audio', primaryRole: 'music_generation', capabilities: {} }
  }

  if (text.includes('text') || text.includes('chat') || text.includes('reason')) {
    return { category: 'text', primaryRole: 'chat', capabilities: { supportsChat: true, supportsText: true } }
  }

  return { category: 'video', primaryRole: 'video_generation', capabilities: { supportsVideoGeneration: true } }
}

function defaultCapabilityFlags(): Pick<
  GenXPricingCatalogData,
  | 'supportsText'
  | 'supportsReasoning'
  | 'supportsCode'
  | 'supportsChat'
  | 'supportsImageGeneration'
  | 'supportsImageEditing'
  | 'supportsVideoGeneration'
  | 'supportsStt'
  | 'supportsTts'
  | 'supportsEmbeddings'
  | 'supportsReranking'
  | 'supportsResearch'
  | 'supportsMultimodal'
  | 'supportsToolUse'
  | 'supportsStructuredOutput'
> {
  return {
    supportsText: false,
    supportsReasoning: false,
    supportsCode: false,
    supportsChat: false,
    supportsImageGeneration: false,
    supportsImageEditing: false,
    supportsVideoGeneration: false,
    supportsStt: false,
    supportsTts: false,
    supportsEmbeddings: false,
    supportsReranking: false,
    supportsResearch: false,
    supportsMultimodal: false,
    supportsToolUse: false,
    supportsStructuredOutput: false,
  }
}

function buildGenXPricingCatalogData(
  key: string,
  pricing: GenXPricingResult['pricing'][string],
  syncedAt: string,
): {
  provider: 'genx'
  modelId: string
  data: GenXPricingCatalogData
} {
  const rawMetadata = pricing.rawMetadata ?? {}
  const modelId = resolveGenXPricingModelId(key, rawMetadata)
  const displayName = metadataString(rawMetadata, 'name')
    || metadataString(rawMetadata, 'displayName')
    || metadataString(rawMetadata, 'display_name')
    || modelId
  const modelOwner = metadataString(rawMetadata, 'provider') || 'genx'
  const providerRawCategory = metadataString(rawMetadata, 'category')
  const mapped = mapGenXPricingCapabilities(providerRawCategory, modelId)
  const rawMetadataJson = stringifyMetadataSafely({ ...rawMetadata, pricingCatalogKey: key }, 'raw_metadata')
  const pricingRawMetadata = stringifyMetadataSafely(rawMetadata, 'pricing_raw_metadata')
  const metadataWarning = [rawMetadataJson.warning, pricingRawMetadata.warning].filter(Boolean).join(';')
  const pricingBlocker = appendBlocker(pricing.pricingBlocker || (pricing.usdEstimateCents === null ? 'genx_pricing_not_usd' : ''), metadataWarning)
  const syncedAtDate = new Date(syncedAt)

  return {
    provider: 'genx',
    modelId,
    data: {
      displayName,
      family: 'genx',
      category: mapped.category,
      primaryRole: mapped.primaryRole,
      costTier: costTierFromEstimatedUnitCost(pricing.usdEstimateCents),
      latencyTier: mapped.category === 'video' ? 'high' : 'medium',
      contextWindow: 0,
      estimatedUnitCost: pricing.usdEstimateCents,
      source: 'provider_api',
      catalogCompleteness: 'partial_from_provider_api',
      isLiveDiscovered: true,
      modelOwner,
      providerRawType: 'pricing_entry',
      providerRawCategory,
      rawMetadata: rawMetadataJson.json,
      discoveredAt: syncedAtDate,
      lastSyncedAt: syncedAtDate,
      pricingSource: pricing.pricingSource,
      pricingConfidence: pricing.pricingConfidence,
      pricingUnit: pricing.unit,
      pricingCurrency: pricing.currency,
      pricingRawMetadata: pricingRawMetadata.json,
      lastPricingSyncedAt: syncedAtDate,
      pricingBlocker,
      notes: appendNote('Created from GenX pricing API because /api/v1/models returned no usable GenX catalog rows. Provider remains genx; upstream owner is metadata only.', metadataWarning),
      ...defaultCapabilityFlags(),
      ...mapped.capabilities,
    },
  }
}

// Curated seed catalog — source = curated_seed, catalogCompleteness = curated_fallback_only
export const CURATED_MODEL_CATALOG: ModelCatalogEntry[] = [
  // ── MiMo: coding-tool only ───────────────────────────────────────────────
  {
    provider: 'mimo',
    modelId: 'mimo-coding-agent',
    displayName: 'MiMo Coding Agent',
    family: 'mimo',
    category: 'code',
    primaryRole: 'coding_tool',
    costTier: 'medium',
    latencyTier: 'medium',
    contextWindow: 128000,
    capabilities: { supportsCode: true, supportsToolUse: true },
    estimatedUnitCost: 0.00001,
    pricingSource: 'unknown',
    pricingConfidence: 'unknown',
    pricingUnit: '',
    pricingCurrency: '',
    pricingRawMetadata: {},
    lastPricingSyncedAt: null,
    pricingBlocker: 'coding_tool_only_not_backend_runtime',
    qualityTier: 'premium',
    source: 'curated_seed',
    catalogCompleteness: 'curated_fallback_only',
    isLiveDiscovered: false,
    modelOwner: 'mimo',
    notes: 'CODING_TOOL_ONLY. Not backend runtime. Not Studio. Requires server-side terminal.',
  },
]

export async function upsertDiscoveredModels(result: DiscoveryResult): Promise<ModelCatalogRefreshSummary> {
  let created = 0
  let updated = 0
  let failedRows = 0
  const errors: Array<{ modelId: string; message: string }> = []

  for (const model of result.models) {
    try {
      const existing = await prisma.modelRegistryEntry.findUnique({
        where: { provider_modelId: { provider: model.provider, modelId: model.modelId } },
      })

      const rawMetadata = stringifyMetadataSafely(model.rawMetadata, 'raw_metadata')
      const pricingRawMetadata = stringifyMetadataSafely(model.pricingRawMetadata, 'pricing_raw_metadata')
      const metadataWarning = [rawMetadata.warning, pricingRawMetadata.warning].filter(Boolean).join(';')

      const data = {
        displayName: model.displayName,
        family: model.family,
        category: model.category,
        primaryRole: model.primaryRole,
        costTier: model.costTier,
        latencyTier: model.latencyTier,
        contextWindow: model.contextWindow,
        estimatedUnitCost: model.estimatedUnitCost,
        source: model.source,
        catalogCompleteness: model.catalogCompleteness,
        isLiveDiscovered: model.isLiveDiscovered,
        modelOwner: model.modelOwner,
        providerRawType: model.providerRawType,
        providerRawCategory: model.providerRawCategory,
        rawMetadata: rawMetadata.json,
        discoveredAt: new Date(model.discoveredAt),
        lastSyncedAt: new Date(model.lastSyncedAt),
        pricingSource: model.pricingSource,
        pricingConfidence: model.pricingConfidence,
        pricingUnit: model.pricingUnit,
        pricingCurrency: model.pricingCurrency,
        pricingRawMetadata: pricingRawMetadata.json,
        lastPricingSyncedAt: model.lastPricingSyncedAt ? new Date(model.lastPricingSyncedAt) : null,
        pricingBlocker: appendBlocker(model.pricingBlocker, metadataWarning),
        notes: appendNote(model.notes, metadataWarning),
        ...model.capabilities,
      }

      if (existing) {
        await prisma.modelRegistryEntry.update({ where: { id: existing.id }, data })
        updated++
      } else {
        await prisma.modelRegistryEntry.create({
          data: {
            provider: model.provider,
            modelId: model.modelId,
            ...data,
          },
        })
        created++
      }
    } catch (err) {
      failedRows++
      if (errors.length < MAX_REFRESH_ERRORS) {
        errors.push({ modelId: model.modelId, message: safeErrorMessage(err) })
      }
    }
  }

  return { providerKey: result.provider, totalFetched: result.models.length, created, updated, failedRows, errors }
}

export async function seedCuratedFallback(): Promise<{ created: number; updated: number }> {
  let created = 0
  let updated = 0

  for (const model of CURATED_MODEL_CATALOG) {
    const existing = await prisma.modelRegistryEntry.findUnique({
      where: { provider_modelId: { provider: model.provider, modelId: model.modelId } },
    })

    if (existing) {
      await prisma.modelRegistryEntry.update({
        where: { id: existing.id },
        data: {
          displayName: model.displayName,
          family: model.family,
          category: model.category,
          primaryRole: model.primaryRole,
          costTier: model.costTier,
          latencyTier: model.latencyTier,
          contextWindow: model.contextWindow,
          estimatedUnitCost: model.estimatedUnitCost,
          pricingSource: model.pricingSource ?? 'unknown',
          pricingConfidence: model.pricingConfidence ?? 'unknown',
          pricingUnit: model.pricingUnit ?? '',
          pricingCurrency: model.pricingCurrency ?? '',
          pricingRawMetadata: stringifyMetadataSafely(model.pricingRawMetadata ?? {}, 'pricing_raw_metadata').json,
          lastPricingSyncedAt: model.lastPricingSyncedAt ? new Date(model.lastPricingSyncedAt) : null,
          pricingBlocker: model.pricingBlocker ?? 'pricing_unknown',
          source: model.source,
          catalogCompleteness: model.catalogCompleteness,
          isLiveDiscovered: model.isLiveDiscovered,
          modelOwner: model.modelOwner,
          notes: model.notes,
          ...model.capabilities,
        },
      })
      updated++
    } else {
      await prisma.modelRegistryEntry.create({
        data: {
          provider: model.provider,
          modelId: model.modelId,
          displayName: model.displayName,
          family: model.family,
          category: model.category,
          primaryRole: model.primaryRole,
          costTier: model.costTier,
          latencyTier: model.latencyTier,
          contextWindow: model.contextWindow,
          estimatedUnitCost: model.estimatedUnitCost,
          pricingSource: model.pricingSource ?? 'unknown',
          pricingConfidence: model.pricingConfidence ?? 'unknown',
          pricingUnit: model.pricingUnit ?? '',
          pricingCurrency: model.pricingCurrency ?? '',
          pricingRawMetadata: stringifyMetadataSafely(model.pricingRawMetadata ?? {}, 'pricing_raw_metadata').json,
          lastPricingSyncedAt: model.lastPricingSyncedAt ? new Date(model.lastPricingSyncedAt) : null,
          pricingBlocker: model.pricingBlocker ?? 'pricing_unknown',
          source: model.source,
          catalogCompleteness: model.catalogCompleteness,
          isLiveDiscovered: model.isLiveDiscovered,
          modelOwner: model.modelOwner,
          notes: model.notes,
          ...model.capabilities,
        },
      })
      created++
    }
  }

  return { created, updated }
}

export async function upsertGenXPricingCatalog(result: GenXPricingResult): Promise<GenXPricingCatalogSummary> {
  const genxModels = await prisma.modelRegistryEntry.findMany({ where: { provider: 'genx' } })
  const existingByModelId = new Map(genxModels.map((model) => [model.modelId, model]))
  let updated = 0
  let createdFromPricing = 0
  let missingPricingCount = 0
  let pricingKnownCount = 0
  let pricingUnknownCount = 0
  let failedRows = 0
  const errors: Array<{ modelId: string; message: string }> = []
  const handledModelIds = new Set<string>()

  for (const [key, pricing] of Object.entries(result.pricing)) {
    const catalog = buildGenXPricingCatalogData(key, pricing, result.syncedAt)
    const existing = existingByModelId.get(catalog.modelId) ?? existingByModelId.get(key)
    try {
      handledModelIds.add(catalog.modelId)
      handledModelIds.add(key)
      if (pricing.pricingConfidence === 'known') pricingKnownCount++
      else pricingUnknownCount++

      if (existing) {
        await prisma.modelRegistryEntry.update({
          where: { id: existing.id },
          data: catalog.data,
        })
        updated++
      } else {
        await prisma.modelRegistryEntry.create({
          data: {
            provider: catalog.provider,
            modelId: catalog.modelId,
            ...catalog.data,
          },
        })
        createdFromPricing++
      }
    } catch (err) {
      failedRows++
      if (errors.length < MAX_REFRESH_ERRORS) {
        errors.push({ modelId: catalog.modelId, message: safeErrorMessage(err) })
      }
    }
  }

  for (const model of genxModels) {
    if (handledModelIds.has(model.modelId)) continue
    try {
      missingPricingCount++
      pricingUnknownCount++
      await prisma.modelRegistryEntry.update({
        where: { id: model.id },
        data: {
          pricingSource: 'unknown',
          pricingConfidence: 'unknown',
          pricingUnit: '',
          pricingCurrency: '',
          pricingRawMetadata: '{}',
          lastPricingSyncedAt: new Date(result.syncedAt),
          pricingBlocker: 'genx_pricing_missing_for_model',
          estimatedUnitCost: null,
        },
      })
      updated++
    } catch (err) {
      failedRows++
      if (errors.length < MAX_REFRESH_ERRORS) {
        errors.push({ modelId: model.modelId, message: safeErrorMessage(err) })
      }
    }
  }

  return {
    updated,
    createdFromPricing,
    missingPricingCount,
    pricingKnownCount,
    pricingUnknownCount,
    failedRows,
    errors,
    source: result.source,
    catalogSource: 'provider_api_pricing_fallback',
    syncedAt: result.syncedAt,
  }
}

export async function updateGenXPricingMetadata(result: GenXPricingResult): Promise<GenXPricingCatalogSummary> {
  return upsertGenXPricingCatalog(result)
}

export async function getModelCatalog(options?: {
  provider?: string
  category?: string
  capability?: string
  source?: string
  enabled?: boolean
}) {
  const where: Record<string, unknown> = {}
  if (options?.provider) where.provider = options.provider
  if (options?.category) where.category = options.category
  if (options?.source) where.source = options.source
  if (options?.enabled !== undefined) where.enabled = options.enabled

  const models = await prisma.modelRegistryEntry.findMany({
    where,
    orderBy: [{ provider: 'asc' }, { costTier: 'asc' }],
  })

  if (options?.capability) {
    const capability = options.capability
    return models.filter((m) => {
      const capKey = `supports${capability.charAt(0).toUpperCase()}${capability.slice(1)}`
      return (m as Record<string, unknown>)[capKey] === true
    })
  }

  return models
}

export async function getCatalogSummary() {
  const summaries = []

  for (const definition of APPROVED_PROVIDER_DEFINITIONS) {
    const provider = definition.key
    const models = await prisma.modelRegistryEntry.findMany({ where: { provider } })
    const healthRow = await prisma.aiProvider.findUnique({ where: { providerKey: provider } })

    const modelsByCategory: Record<string, number> = {}
    const modelsBySource: Record<string, number> = {}
    const modelsByCapability: Record<string, number> = {}
    let pricingKnown = 0
    let pricingUnknown = 0

    for (const m of models) {
      modelsByCategory[m.category] = (modelsByCategory[m.category] || 0) + 1
      modelsBySource[m.source] = (modelsBySource[m.source] || 0) + 1
      if (m.pricingSource === 'provider_api' || m.pricingSource === 'admin_manual') {
        pricingKnown++
      } else {
        pricingUnknown++
      }

      // Count capabilities
      const capFields = ['supportsChat', 'supportsText', 'supportsReasoning', 'supportsCode', 'supportsImageGeneration', 'supportsVideoGeneration', 'supportsStt', 'supportsTts', 'supportsEmbeddings', 'supportsReranking', 'supportsMultimodal']
      for (const field of capFields) {
        if ((m as Record<string, unknown>)[field]) {
          const capKey = field.replace('supports', '').toLowerCase()
          modelsByCapability[capKey] = (modelsByCapability[capKey] || 0) + 1
        }
      }
    }

    summaries.push({
      providerKey: provider,
      configured: !!healthRow,
      healthStatus: healthRow?.healthStatus || 'unconfigured',
      catalogSource: models.length > 0 && models[0] ? models[0].source : 'none',
      catalogCompleteness: models.length > 0 && models[0] ? models[0].catalogCompleteness : 'unknown',
      totalModels: models.length,
      modelsByCapability,
      modelsByCategory,
      modelsBySource,
      pricingKnownCount: pricingKnown,
      pricingUnknownCount: pricingUnknown,
      lastSyncedAt: models.length > 0 && models[0] ? models[0].lastSyncedAt?.toISOString() : null,
      warnings: definition.codingOnly ? ['coding_tool_only, not normal runtime'] : [],
    })
  }

  return summaries
}
