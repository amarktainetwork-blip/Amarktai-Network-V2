import type { RuntimeProofStatusPayload } from './runtime-proof-status.js'

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

const MEDIA_CAPABILITIES = new Set(['image_generation', 'image_edit', 'video_generation', 'text_to_speech', 'speech_to_text', 'tts', 'stt'])
const HEALTHY_PROVIDER_STATUSES = new Set(['configured', 'live'])
const EXECUTOR_ADAPTER_PROVIDERS: Record<string, string[]> = {
  chat: ['groq', 'deepinfra'],
  reasoning: ['groq', 'deepinfra'],
  code: ['groq', 'deepinfra'],
  summarization: ['groq', 'deepinfra'],
  translation: ['groq', 'deepinfra'],
  classification: ['groq', 'deepinfra'],
  extraction: ['groq', 'deepinfra'],
  structured_output: ['groq', 'deepinfra'],
  image_generation: ['together'],
  video_generation: ['genx'],
}

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
  tts: 'supportsTts',
  stt: 'supportsStt',
  embeddings: 'supportsEmbeddings',
  reranking: 'supportsReranking',
  research: 'supportsResearch',
  moderation: 'supportsText',
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

interface ProviderRecord {
  providerKey: string
  enabled: boolean
  healthStatus: string | null
}

function providerIsHealthyForRuntime(health: { enabled?: boolean; status?: string } | undefined): boolean {
  if (!health) return false
  if (health.enabled === false) return false
  return HEALTHY_PROVIDER_STATUSES.has(health.status || 'unconfigured')
}

export function buildCapabilityGroupSummary(
  capabilityKey: string,
  allModels: ModelRecord[],
  providers: ProviderRecord[],
  proofStatus: RuntimeProofStatusPayload,
): CapabilityGroupSummary {
  const meta = CAPABILITY_LABELS[capabilityKey] || { label: capabilityKey, category: 'text' }
  const modelField = CAPABILITY_TO_MODEL_FIELD[capabilityKey] || 'supportsText'

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

    if (m.provider !== 'mimo' && MEDIA_CAPABILITIES.has(capabilityKey) && !pricingKnown) {
      blockedUnknownPricingCount++
    }
  }

  const costs = eligible
    .map((m) => m.estimatedUnitCost)
    .filter((c): c is number => c !== null && c > 0)
    .sort((a, b) => a - b)

  const providerHealth: Record<string, { enabled: boolean; status: string }> = {}
  for (const p of providers) {
    providerHealth[p.providerKey] = { enabled: p.enabled, status: p.healthStatus || 'unconfigured' }
  }

  const providerHealthBlockers: string[] = []
  const missingExecutorBlockers: string[] = []
  const implementedProviders = EXECUTOR_ADAPTER_PROVIDERS[capabilityKey] ?? []
  const implementedProviderSet = new Set(implementedProviders)
  let executorAdapterImplementedCount = 0

  for (const [provider, count] of Object.entries(modelsByProvider)) {
    const health = providerHealth[provider]
    const healthStatus = health?.status || 'unconfigured'
    if (healthStatus === 'failed') providerHealthBlockers.push(`${provider}: health check failed`)
    if (healthStatus === 'unconfigured') providerHealthBlockers.push(`${provider}: not configured`)
    if (provider === 'mimo') {
      missingExecutorBlockers.push('mimo: coding_tool_only, not normal runtime')
    } else if (implementedProviderSet.has(provider)) {
      executorAdapterImplementedCount++
    } else {
      missingExecutorBlockers.push(`${provider}: discovered_but_no_executor_adapter for ${capabilityKey} (${count} model(s))`)
    }
  }

  for (const m of eligible) {
    const pricingKnown = m.estimatedUnitCost !== null
      && (m.pricingSource === 'provider_api' || m.pricingSource === 'admin_manual')
      && (m.pricingConfidence === 'known' || m.pricingConfidence === 'admin_manual')
    const hasExecutorAdapter = implementedProviderSet.has(m.provider)
    const providerReady = providerIsHealthyForRuntime(providerHealth[m.provider])
    if (m.provider !== 'mimo' && pricingKnown && hasExecutorAdapter && providerReady) {
      if (m.costTier !== 'premium' && m.costTier !== 'high') standardEligibleCount++
      premiumEligibleCount++
    }
  }

  if (blockedUnknownPricingCount > 0) {
    missingExecutorBlockers.push(`${capabilityKey}: ${blockedUnknownPricingCount} media model(s) blocked by unknown pricing`)
  }

  const proof = proofStatus.provenCapabilities.find((item) => item.capability === capabilityKey)
  const isLiveJobProven = proof?.status === 'proven'
  const isDashboardReady = proof?.readyForDashboardExecution === true
  const liveJobProvenCount = isLiveJobProven ? 1 : 0
  const dashboardReadyCount = isDashboardReady ? liveJobProvenCount : 0
  if (!isLiveJobProven) missingExecutorBlockers.push(`${capabilityKey}: not_live_job_proven`)
  if (!isDashboardReady) missingExecutorBlockers.push(`${capabilityKey}: not_dashboard_ready`)

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
    executableModels: executorAdapterImplementedCount,
    provenModels: liveJobProvenCount,
    dashboardReadyModels: dashboardReadyCount,
    cheapestEstimatedCost: costs[0] || null,
    standardEstimatedCost: costs[Math.floor(costs.length * 0.25)] || null,
    premiumEstimatedCost: costs[Math.floor(costs.length * 0.75)] || null,
    providerHealthBlockers,
    missingExecutorBlockers,
  }
}

export async function getAllCapabilityGroupSummaries(
  allModels: ModelRecord[],
  providers: ProviderRecord[],
  proofStatus: RuntimeProofStatusPayload,
): Promise<CapabilityGroupSummary[]> {
  return Object.keys(CAPABILITY_LABELS).map((key) =>
    buildCapabilityGroupSummary(key, allModels, providers, proofStatus),
  )
}
