import {
  CAPABILITY_BY_KEY,
  CAPABILITY_CATALOG,
  CAPABILITY_FIELD_MAP,
  isValidCapability,
  type RuntimeTruth,
} from '@amarktai/core'

export interface CapabilityGroupSummary {
  capabilityKey: string
  label: string
  category: string
  totalModels: number
  totalAvailableModels: number
  modelsByProvider: Record<string, number>
  modelsByTier: Record<string, number>
  liveDiscoveredCount: number
  providerCatalogCount: number
  curatedFallbackCount: number
  pricingKnownCount: number
  pricingUnknownCount: number
  standardEligibleCount: number
  premiumEligibleCount: number
  blockedUnknownPricingCount: number
  executorAdapterImplementedCount: number
  liveJobProvenCount: number
  dashboardReadyCount: number
  executableModels: number
  provenModels: number
  dashboardReadyModels: number
  cheapestEstimatedCost: number | null
  standardEstimatedCost: number | null
  premiumEstimatedCost: number | null
  providerHealthBlockers: string[]
  missingExecutorBlockers: string[]
}

interface ModelRecord {
  provider: string
  costTier: string
  isLiveDiscovered: boolean
  source: string
  estimatedUnitCost: number | null
  pricingSource: string | null
  pricingConfidence: string | null
  enabled: boolean
  [key: string]: unknown
}

function pricingIsKnown(model: ModelRecord): boolean {
  return model.estimatedUnitCost !== null
    && (model.pricingSource === 'provider_api' || model.pricingSource === 'admin_manual')
    && (model.pricingConfidence === 'known' || model.pricingConfidence === 'admin_manual')
}

export function buildCapabilityGroupSummary(
  capabilityKey: string,
  allModels: ModelRecord[],
  runtimeTruth: RuntimeTruth,
): CapabilityGroupSummary {
  const validCapability = isValidCapability(capabilityKey) ? capabilityKey : null
  const meta = validCapability ? CAPABILITY_BY_KEY[validCapability] : null
  const modelField = validCapability ? CAPABILITY_FIELD_MAP[validCapability] : undefined
  const eligible = modelField
    ? allModels.filter((model) => (model as Record<string, unknown>)[modelField] === true)
    : []

  const modelsByProvider: Record<string, number> = {}
  const modelsByTier: Record<string, number> = {}
  let liveDiscoveredCount = 0
  let providerCatalogCount = 0
  let curatedFallbackCount = 0
  let pricingKnownCount = 0
  let pricingUnknownCount = 0

  for (const model of eligible) {
    modelsByProvider[model.provider] = (modelsByProvider[model.provider] || 0) + 1
    modelsByTier[model.costTier] = (modelsByTier[model.costTier] || 0) + 1
    if (model.isLiveDiscovered) liveDiscoveredCount++
    if (model.source === 'provider_api' || model.source === 'provider_docs_catalog') providerCatalogCount++
    if (model.source === 'curated_seed' || model.source === 'curated_provider_catalog') curatedFallbackCount++
    if (pricingIsKnown(model)) pricingKnownCount++
    else pricingUnknownCount++
  }

  const capabilityTruth = validCapability
    ? runtimeTruth.capabilities.find((capability) => capability.capability === validCapability)
    : undefined
  const implementedProviders = new Set(capabilityTruth?.eligibleProviders ?? [])
  const providerHealthBlockers: string[] = []
  const missingExecutorBlockers: string[] = []

  for (const [provider, count] of Object.entries(modelsByProvider)) {
    const providerTruth = runtimeTruth.providers.find((entry) => entry.provider === provider)
    if (providerTruth?.configured !== true) providerHealthBlockers.push(`${provider}: not runtime ready`)
    if (!implementedProviders.has(provider as never)) {
      missingExecutorBlockers.push(`${provider}: catalogued but no executor registration for ${capabilityKey} (${count} model(s))`)
    }
  }

  const mediaCapability = meta?.artifactRequired === true
  const blockedUnknownPricingCount = mediaCapability
    ? eligible.filter((model) => model.provider !== 'mimo' && !pricingIsKnown(model)).length
    : 0
  if (blockedUnknownPricingCount > 0) {
    missingExecutorBlockers.push(`${capabilityKey}: ${blockedUnknownPricingCount} media model(s) blocked by unknown pricing`)
  }

  const executable = capabilityTruth?.executableNow
    ? eligible.filter((model) => implementedProviders.has(model.provider as never))
    : []
  const standardEligibleCount = executable.filter((model) =>
    pricingIsKnown(model) && model.costTier !== 'premium' && model.costTier !== 'high',
  ).length
  const premiumEligibleCount = executable.filter(pricingIsKnown).length
  const costs = eligible
    .map((model) => model.estimatedUnitCost)
    .filter((cost): cost is number => cost !== null && cost > 0)
    .sort((a, b) => a - b)
  const liveJobProvenCount = capabilityTruth?.liveProven === true ? 1 : 0
  const dashboardReadyCount = capabilityTruth?.liveProven === true ? 1 : 0

  if (!liveJobProvenCount) missingExecutorBlockers.push(`${capabilityKey}: not_live_job_proven`)
  if (!dashboardReadyCount) missingExecutorBlockers.push(`${capabilityKey}: not_dashboard_ready`)

  return {
    capabilityKey,
    label: meta?.label ?? capabilityKey,
    category: meta?.category ?? 'system_ops',
    totalModels: eligible.length,
    totalAvailableModels: eligible.filter((model) => model.enabled).length,
    modelsByProvider,
    modelsByTier,
    liveDiscoveredCount,
    providerCatalogCount,
    curatedFallbackCount,
    pricingKnownCount,
    pricingUnknownCount,
    standardEligibleCount,
    premiumEligibleCount,
    blockedUnknownPricingCount,
    executorAdapterImplementedCount: implementedProviders.size,
    liveJobProvenCount,
    dashboardReadyCount,
    executableModels: executable.length,
    provenModels: liveJobProvenCount,
    dashboardReadyModels: dashboardReadyCount,
    cheapestEstimatedCost: costs[0] ?? null,
    standardEstimatedCost: costs[Math.floor(costs.length * 0.25)] ?? null,
    premiumEstimatedCost: costs[Math.floor(costs.length * 0.75)] ?? null,
    providerHealthBlockers,
    missingExecutorBlockers,
  }
}

export async function getAllCapabilityGroupSummaries(
  allModels: ModelRecord[],
  runtimeTruth: RuntimeTruth,
): Promise<CapabilityGroupSummary[]> {
  return CAPABILITY_CATALOG.map((capability) =>
    buildCapabilityGroupSummary(capability.key, allModels, runtimeTruth),
  )
}
