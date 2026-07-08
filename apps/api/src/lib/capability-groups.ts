import { prisma } from '@amarktai/db'

export interface CapabilityGroupSummary {
  capabilityKey: string
  label: string
  category: string
  totalModels: number
  modelsByProvider: Record<string, number>
  modelsByTier: Record<string, number>
  executableModels: number
  provenModels: number
  dashboardReadyModels: number
  cheapestEstimatedCost: number | null
  standardEstimatedCost: number | null
  premiumEstimatedCost: number | null
  providerHealthBlockers: string[]
  missingExecutorBlockers: string[]
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

  for (const m of eligible) {
    modelsByProvider[m.provider] = (modelsByProvider[m.provider] || 0) + 1
    modelsByTier[m.costTier] = (modelsByTier[m.costTier] || 0) + 1
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

  return {
    capabilityKey,
    label: meta.label,
    category: meta.category,
    totalModels: eligible.length,
    modelsByProvider,
    modelsByTier,
    executableModels: eligible.filter((m) => m.provider !== 'mimo').length,
    provenModels: 0, // populated by runtime proof separately
    dashboardReadyModels: 0, // populated by runtime proof separately
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
