import { prisma } from '@amarktai/db'

export interface RuntimeCandidate {
  provider: string
  model: string
  displayName: string
  costTier: string
  qualityTier: string
  latencyTier: string
  estimatedCost: number | null
  pricingSource: string
  pricingConfidence: string
  pricingBlocker: string
  score: number
  reason: string
}

export interface RuntimeSelection {
  selected: RuntimeCandidate | null
  fallbacks: RuntimeCandidate[]
  rejected: Array<{ provider: string; model: string; reason: string }>
  estimatedCost: number | null
  expectedOutputType: string
  proofStatus: string
}

export async function selectRuntimeModel(
  capability: string,
  options?: {
    qualityTier?: string
    maxCostCents?: number
    budgetProfile?: string
    excludeProviders?: string[]
    allowUnknownCostPremium?: boolean
  },
): Promise<RuntimeSelection> {
  const { qualityTier = 'standard', maxCostCents, excludeProviders = [], allowUnknownCostPremium = false } = options || {}

  // Map capability to model support field
  const capabilityFieldMap: Record<string, string> = {
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
  }

  const supportField = capabilityFieldMap[capability]
  if (!supportField) {
    return {
      selected: null,
      fallbacks: [],
      rejected: [],
      estimatedCost: null,
      expectedOutputType: 'unknown',
      proofStatus: 'unsupported',
    }
  }

  const isMediaCapability = ['image_generation', 'image_edit', 'video_generation', 'text_to_speech', 'speech_to_text'].includes(capability)
  const isStandardAutoSelection = qualityTier === 'standard' || qualityTier === 'draft'
  const isPremiumAutoSelection = qualityTier === 'premium' || qualityTier === 'hero'

  // Get all enabled models
  const allModels = await prisma.modelRegistryEntry.findMany({
    where: { enabled: true },
  })

  // Filter by capability
  let eligible = allModels.filter((m) => {
    const record = m as Record<string, unknown>
    return record[supportField] === true
  })

  // Exclude MiMo from normal runtime
  eligible = eligible.filter((m) => m.provider !== 'mimo')

  // Exclude blocked providers
  eligible = eligible.filter((m) => !excludeProviders.includes(m.provider))

  // Get provider health
  const providers = await prisma.aiProvider.findMany()
  const providerHealth: Record<string, { enabled: boolean; healthStatus: string }> = {}
  for (const p of providers) {
    providerHealth[p.providerKey] = { enabled: p.enabled, healthStatus: p.healthStatus || 'unconfigured' }
  }

  // Score and rank candidates
  const candidates: RuntimeCandidate[] = []
  const rejected: Array<{ provider: string; model: string; reason: string }> = []

  for (const model of eligible) {
    const health = providerHealth[model.provider]

    // Reject disabled providers
    if (health && !health.enabled) {
      rejected.push({ provider: model.provider, model: model.modelId, reason: 'provider_disabled' })
      continue
    }

    // Reject unconfigured providers
    if (!health || health.healthStatus === 'unconfigured') {
      rejected.push({ provider: model.provider, model: model.modelId, reason: 'provider_not_configured' })
      continue
    }

    // Reject failed providers
    if (health.healthStatus === 'failed') {
      rejected.push({ provider: model.provider, model: model.modelId, reason: 'provider_health_failed' })
      continue
    }

    // Reject disabled providers by health status
    if (health.healthStatus === 'disabled') {
      rejected.push({ provider: model.provider, model: model.modelId, reason: 'provider_health_disabled' })
      continue
    }

    // Reject runtime-restricted providers
    if (health.healthStatus === 'runtime_restricted') {
      rejected.push({ provider: model.provider, model: model.modelId, reason: 'provider_runtime_restricted' })
      continue
    }

    // Reject MiMo
    if (model.provider === 'mimo') {
      rejected.push({ provider: model.provider, model: model.modelId, reason: 'mimo_coding_tool_only' })
      continue
    }

    const pricingKnown = model.estimatedUnitCost !== null
      && (model.pricingSource === 'provider_api' || model.pricingSource === 'admin_manual')
      && (model.pricingConfidence === 'known' || model.pricingConfidence === 'admin_manual')

    if (isMediaCapability && !pricingKnown && isStandardAutoSelection) {
      rejected.push({ provider: model.provider, model: model.modelId, reason: 'unknown_pricing_blocks_standard_auto_selection' })
      continue
    }

    if (isMediaCapability && !pricingKnown && isPremiumAutoSelection && !allowUnknownCostPremium) {
      rejected.push({ provider: model.provider, model: model.modelId, reason: 'unknown_pricing_requires_admin_approval' })
      continue
    }

    // Check cost cap
    if (maxCostCents && model.estimatedUnitCost && model.estimatedUnitCost * 100 > maxCostCents) {
      rejected.push({ provider: model.provider, model: model.modelId, reason: 'exceeds_cost_cap' })
      continue
    }

    // Calculate score
    let score = 50

    // Quality tier match
    const qualityMap: Record<string, number> = { draft: 0, standard: 1, premium: 2, hero: 3 }
    const modelQuality = qualityMap[model.costTier] || 1
    const targetQuality = qualityMap[qualityTier] || 1
    score -= Math.abs(modelQuality - targetQuality) * 15

    // Cost preference (lower is better for standard, higher ok for premium)
    if (qualityTier === 'standard' || qualityTier === 'draft') {
      const costMap: Record<string, number> = { free: 0, very_low: 1, low: 2, medium: 3, high: 4, premium: 5 }
      score -= (costMap[model.costTier] || 3) * 5
    } else {
      score += modelQuality * 5
    }

    // Latency preference
    const latencyMap: Record<string, number> = { ultra_low: 0, low: 1, medium: 2, high: 3 }
    score -= (latencyMap[model.latencyTier] || 2) * 3

    // Live proof bonus
    if (health.healthStatus === 'live') score += 20

    candidates.push({
      provider: model.provider,
      model: model.modelId,
      displayName: model.displayName,
      costTier: model.costTier,
      qualityTier: model.costTier,
      latencyTier: model.latencyTier,
      estimatedCost: model.estimatedUnitCost,
      pricingSource: model.pricingSource,
      pricingConfidence: model.pricingConfidence,
      pricingBlocker: model.pricingBlocker,
      score,
      reason: health.healthStatus === 'live' ? 'live_proven' : 'configured',
    })
  }

  // Sort by score descending
  candidates.sort((a, b) => b.score - a.score)

  const selected = candidates[0] || null
  const fallbacks = candidates.slice(1, 4)

  return {
    selected,
    fallbacks,
    rejected,
    estimatedCost: selected?.estimatedCost || null,
    expectedOutputType: capability.includes('image') ? 'image' : capability.includes('video') ? 'video' : capability.includes('audio') || capability.includes('tts') || capability.includes('stt') ? 'audio' : 'text',
    proofStatus: selected?.reason === 'live_proven' ? 'live_proven' : 'configured_not_proven',
  }
}
