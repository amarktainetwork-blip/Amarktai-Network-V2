import { prisma } from '@amarktai/db'
import { getRuntimeProofStatus } from './runtime-proof-status.js'

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

const MEDIA_CAPABILITIES = new Set(['image_generation', 'image_edit', 'video_generation', 'text_to_speech', 'speech_to_text'])

const CAPABILITY_LABELS: Record<string, { label: string; category: string }> = {
  chat: { label: 'Chat', category: 'text' },
  reasoning: { label: 'Reasoning', category: 'text' },
  code: { label: 'Code Explanation', category: 'text' },
  summarization: { label: 'Summarization', category: 'text' },
  translation: { label: 'Translation', category: 'text' },
  classification: { label: 'Classification', category: 'text' },
  extraction: { label: 'Extraction', category: 'text' },
  structured_output: { label: 'Structured Output', category: 'text' },
  image_generation: { label: 'Image Generation', category: 'image' },
  image_edit: { label: 'Image Edit', category: 'image' },
  video_generation: { label: 'Video Generation', category: 'video' },
  text_to_speech: { label: 'Text to Speech', category: 'audio' },
  speech_to_text: { label: 'Speech to Text', category: 'audio' },
  embeddings: { label: 'Embeddings', category: 'text' },
  reranking: { label: 'Reranking', category: 'text' },
  research: { label: 'Research', category: 'text' },
  moderation: { label: 'Moderation', category: 'text' },
}

const CAPABILITY_TO_MODEL_FIELD: Record<string, string> = {
  chat: 'supportsChat',
  reasoning: 'supportsReasoning',
  code: 'supportsCode',
  summarization: 'supportsText',
  translation: 'supportsText',
  classification: 'supportsText',
  extraction: 'supportsText',
  structured_output: 'supportsStructuredOutput',
  image_generation: 'supportsImageGeneration',
  image_edit: 'supportsImageEditing',
  video_generation: 'supportsVideoGeneration',
  text_to_speech: 'supportsTts',
  speech_to_text: 'supportsStt',
  embeddings: 'supportsEmbeddings',
  reranking: 'supportsReranking',
  research: 'supportsResearch',
  moderation: 'supportsText',
}

export async function getCapabilityGroupSummary(capabilityKey: string): Promise<CapabilityGroupSummary> {
  const meta = CAPABILITY_LABELS[capabilityKey] || { label: capabilityKey, category: 'text' }
  const modelField = CAPABILITY_TO_MODEL_FIELD[capabilityKey] || 'supportsText'

  const allModels = await prisma.modelRegistryEntry.findMany({
    where: { enabled: true },
  })

  const eligible = allModels.filter((m) => {
    const record = m as Record<string, unknown>
    return record[modelField] === true
  })

  const modelsByProvider: Record<string, number> = {}
  const modelsByTier: Record<string, number> = {}
  let liveDiscoveredCount = 0
  let providerCatalogCount = 0
  let curatedFallbackCount = 0
  let pricingKnownCount = 0
  let pricingUnknownCount = 0
  let standardEligibleCount = 0
  let premiumEligibleCount = 0
  let blockedUnknownPricingCount = 0

  for (const m of eligible) {
    modelsByProvider[m.provider] = (modelsByProvider[m.provider] || 0) + 1
    modelsByTier[m.costTier] = (modelsByTier[m.costTier] || 0) + 1
    if (m.isLiveDiscovered) liveDiscoveredCount++
    if (m.source === 'provider_api' || m.source === 'provider_docs_catalog') providerCatalogCount++
    if (m.source === 'curated_seed' || m.source === 'curated_provider_catalog') curatedFallbackCount++

    const pricingKnown = m.estimatedUnitCost !== null
      && (m.pricingSource === 'provider_api' || m.pricingSource === 'admin_manual')
      && (m.pricingConfidence === 'known' || m.pricingConfidence === 'admin_manual')
    if (pricingKnown) pricingKnownCount++
    else pricingUnknownCount++

    if (m.provider !== 'mimo' && pricingKnown) {
      if (m.costTier !== 'premium' && m.costTier !== 'high') standardEligibleCount++
      premiumEligibleCount++
    }
    if (m.provider !== 'mimo' && MEDIA_CAPABILITIES.has(capabilityKey) && !pricingKnown) {
      blockedUnknownPricingCount++
    }
  }

  const costs = eligible
    .map((m) => m.estimatedUnitCost)
    .filter((c): c is number => c !== null && c > 0)
    .sort((a, b) => a - b)

  // Check provider health for blockers
  const providers = await prisma.aiProvider.findMany()
  const providerHealth: Record<string, string> = {}
  for (const p of providers) {
    providerHealth[p.providerKey] = p.healthStatus || 'unconfigured'
  }

  const providerHealthBlockers: string[] = []
  const missingExecutorBlockers: string[] = []

  for (const [provider] of Object.entries(modelsByProvider)) {
    const health = providerHealth[provider]
    if (health === 'failed') providerHealthBlockers.push(`${provider}: health check failed`)
    if (health === 'unconfigured') providerHealthBlockers.push(`${provider}: not configured`)
    // MiMo is always blocked for normal runtime
    if (provider === 'mimo') missingExecutorBlockers.push('mimo: coding_tool_only, not normal runtime')
  }

  if (blockedUnknownPricingCount > 0) {
    missingExecutorBlockers.push(`${capabilityKey}: ${blockedUnknownPricingCount} media model(s) blocked by unknown pricing`)
  }

  const runtimeProof = getRuntimeProofStatus()
  const proof = runtimeProof.provenCapabilities.find((item) => item.capability === capabilityKey)
  const isLiveJobProven = proof?.status === 'proven'
  const isDashboardReady = proof?.readyForDashboardExecution === true
  const executorAdapterImplementedCount = isLiveJobProven ? eligible.filter((m) => m.provider !== 'mimo').length : 0
  const liveJobProvenCount = isLiveJobProven ? eligible.filter((m) => m.provider !== 'mimo').length : 0
  const dashboardReadyCount = isDashboardReady ? liveJobProvenCount : 0

  return {
    capabilityKey,
    label: meta.label,
    category: meta.category,
    totalModels: eligible.length,
    totalAvailableModels: eligible.length,
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
    executorAdapterImplementedCount,
    liveJobProvenCount,
    dashboardReadyCount,
    executableModels: eligible.filter((m) => m.provider !== 'mimo').length,
    provenModels: liveJobProvenCount,
    dashboardReadyModels: dashboardReadyCount,
    cheapestEstimatedCost: costs[0] || null,
    standardEstimatedCost: costs[Math.floor(costs.length * 0.25)] || null,
    premiumEstimatedCost: costs[Math.floor(costs.length * 0.75)] || null,
    providerHealthBlockers,
    missingExecutorBlockers,
  }
}

export async function getAllCapabilityGroupSummaries(): Promise<CapabilityGroupSummary[]> {
  return Promise.all(Object.keys(CAPABILITY_LABELS).map(getCapabilityGroupSummary))
}
