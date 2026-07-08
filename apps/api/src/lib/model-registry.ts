import { prisma } from '@amarktai/db'
import type { DiscoveryResult } from './provider-discovery.js'

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
    qualityTier: 'premium',
    source: 'curated_seed',
    catalogCompleteness: 'curated_fallback_only',
    isLiveDiscovered: false,
    modelOwner: 'mimo',
    notes: 'CODING_TOOL_ONLY. Not backend runtime. Not Studio. Requires server-side terminal.',
  },
]

export async function upsertDiscoveredModels(result: DiscoveryResult): Promise<{ created: number; updated: number; total: number }> {
  let created = 0
  let updated = 0

  for (const model of result.models) {
    const existing = await prisma.modelRegistryEntry.findUnique({
      where: { provider_modelId: { provider: model.provider, modelId: model.modelId } },
    })

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
      rawMetadata: JSON.stringify(model.rawMetadata),
      discoveredAt: new Date(model.discoveredAt),
      lastSyncedAt: new Date(model.lastSyncedAt),
      pricingSource: model.pricingSource,
      pricingConfidence: model.pricingConfidence,
      notes: model.notes,
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
  }

  return { created, updated, total: result.models.length }
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
