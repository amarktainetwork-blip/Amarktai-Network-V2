import { prisma } from '@amarktai/db'
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

export async function updateGenXPricingMetadata(result: GenXPricingResult): Promise<{
  updated: number
  missingPricingCount: number
  pricingKnownCount: number
  pricingUnknownCount: number
  failedRows: number
  errors: Array<{ modelId: string; message: string }>
  source: string
  syncedAt: string
}> {
  const genxModels = await prisma.modelRegistryEntry.findMany({ where: { provider: 'genx' } })
  let updated = 0
  let missingPricingCount = 0
  let pricingKnownCount = 0
  let pricingUnknownCount = 0
  let failedRows = 0
  const errors: Array<{ modelId: string; message: string }> = []

  for (const model of genxModels) {
    const pricing = result.pricing[model.modelId]
    try {
      if (!pricing) {
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
        continue
      }

      if (pricing.pricingConfidence === 'known') pricingKnownCount++
      else pricingUnknownCount++
      const pricingRawMetadata = stringifyMetadataSafely(pricing.rawMetadata, 'pricing_raw_metadata')
      await prisma.modelRegistryEntry.update({
        where: { id: model.id },
        data: {
          pricingSource: pricing.pricingSource,
          pricingConfidence: pricing.pricingConfidence,
          pricingUnit: pricing.unit,
          pricingCurrency: pricing.currency,
          pricingRawMetadata: pricingRawMetadata.json,
          lastPricingSyncedAt: new Date(result.syncedAt),
          pricingBlocker: appendBlocker(pricing.pricingBlocker, pricingRawMetadata.warning),
          estimatedUnitCost: pricing.usdEstimateCents,
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

  return { updated, missingPricingCount, pricingKnownCount, pricingUnknownCount, failedRows, errors, source: result.source, syncedAt: result.syncedAt }
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
  const providers = ['genx', 'groq', 'together', 'deepinfra', 'mimo']
  const summaries = []

  for (const provider of providers) {
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
      warnings: provider === 'mimo' ? ['coding_tool_only, not normal runtime'] : [],
    })
  }

  return summaries
}
