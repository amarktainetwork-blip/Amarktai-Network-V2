import type { RuntimeProofStatusPayload } from './runtime-proof-status.js'
import { EXECUTOR_CAPABILITY_MAP, HEALTHY_PROVIDER_STATUSES } from '@amarktai/core'

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

const MEDIA_CAPABILITIES = new Set(['image_generation', 'image_edit', 'video_generation', 'tts', 'stt'])

const CAPABILITY_LABELS: Record<string, { label: string; category: string }> = {
  chat: { label: 'Chat', category: 'text' },
  streaming_chat: { label: 'Streaming Chat', category: 'text' },
  reasoning: { label: 'Reasoning', category: 'text' },
  code: { label: 'Code', category: 'text' },
  summarization: { label: 'Summarization', category: 'text' },
  translation: { label: 'Translation', category: 'text' },
  question_answering: { label: 'Question Answering', category: 'text' },
  classification: { label: 'Classification', category: 'text' },
  zero_shot_classification: { label: 'Zero-Shot Classification', category: 'text' },
  extraction: { label: 'Extraction', category: 'text' },
  token_classification: { label: 'Token Classification', category: 'text' },
  fill_mask: { label: 'Fill Mask', category: 'text' },
  feature_extraction: { label: 'Feature Extraction', category: 'text' },
  sentence_similarity: { label: 'Sentence Similarity', category: 'text' },
  table_qa: { label: 'Table Q&A', category: 'text' },
  structured_output: { label: 'Structured Output', category: 'text' },
  tool_use: { label: 'Tool Use', category: 'text' },
  image_generation: { label: 'Image Generation', category: 'image' },
  image_edit: { label: 'Image Edit', category: 'image' },
  image_to_image: { label: 'Image To Image', category: 'image' },
  image_upscale: { label: 'Image Upscale', category: 'image' },
  image_classification: { label: 'Image Classification', category: 'image' },
  object_detection: { label: 'Object Detection', category: 'image' },
  image_segmentation: { label: 'Image Segmentation', category: 'image' },
  depth_estimation: { label: 'Depth Estimation', category: 'image' },
  keypoint_detection: { label: 'Keypoint Detection', category: 'image' },
  visual_question_answering: { label: 'Visual Q&A', category: 'image' },
  document_qa: { label: 'Document Q&A', category: 'document' },
  ocr: { label: 'OCR', category: 'document' },
  zero_shot_object_detection: { label: 'Zero-Shot Object Detection', category: 'image' },
  mask_generation: { label: 'Mask Generation', category: 'image' },
  visual_document_retrieval: { label: 'Visual Document Retrieval', category: 'image' },
  video_generation: { label: 'Video Generation', category: 'video' },
  image_to_video: { label: 'Image To Video', category: 'video' },
  video_to_video: { label: 'Video To Video', category: 'video' },
  long_form_video: { label: 'Long-form Video', category: 'video' },
  video_understanding: { label: 'Video Understanding', category: 'video' },
  video_classification: { label: 'Video Classification', category: 'video' },
  storyboard_generation: { label: 'Storyboard Generation', category: 'video' },
  subtitle_generation: { label: 'Subtitle Generation', category: 'video' },
  lip_sync: { label: 'Lip Sync', category: 'video' },
  avatar_generation: { label: 'Avatar Generation', category: 'video' },
  text_to_3d: { label: 'Text To 3D', category: 'three_d' },
  image_to_3d: { label: 'Image To 3D', category: 'three_d' },
  tts: { label: 'Text To Speech', category: 'audio' },
  stt: { label: 'Speech To Text', category: 'audio' },
  voice_clone: { label: 'Voice Clone', category: 'audio' },
  voice_conversion: { label: 'Voice Conversion', category: 'audio' },
  text_to_audio: { label: 'Text To Audio', category: 'audio' },
  audio_to_audio: { label: 'Audio To Audio', category: 'audio' },
  audio_classification: { label: 'Audio Classification', category: 'audio' },
  voice_activity_detection: { label: 'Voice Activity Detection', category: 'audio' },
  music_generation: { label: 'Music Generation', category: 'audio' },
  song_generation: { label: 'Song Generation', category: 'audio' },
  embeddings: { label: 'Embeddings', category: 'text' },
  reranking: { label: 'Reranking', category: 'text' },
  rag_ingest: { label: 'RAG Ingest', category: 'retrieval' },
  rag_search: { label: 'RAG Search', category: 'retrieval' },
  research: { label: 'Research', category: 'text' },
  brand_scrape: { label: 'Brand Scrape', category: 'scraping' },
  document_ingest: { label: 'Document Ingest', category: 'document' },
  campaign_generation: { label: 'Campaign Generation', category: 'text' },
  social_content_generation: { label: 'Social Content Generation', category: 'text' },
  adult_text: { label: 'Adult Text', category: 'text' },
  adult_image: { label: 'Adult Image', category: 'image' },
  adult_voice: { label: 'Adult Voice', category: 'audio' },
  adult_avatar: { label: 'Adult Avatar', category: 'video' },
  adult_video: { label: 'Adult Video', category: 'video' },
}

const CAPABILITY_TO_MODEL_FIELD: Record<string, string> = {
  chat: 'supportsChat',
  streaming_chat: 'supportsChat',
  reasoning: 'supportsReasoning',
  code: 'supportsCode',
  summarization: 'supportsText',
  translation: 'supportsText',
  question_answering: 'supportsText',
  classification: 'supportsText',
  zero_shot_classification: 'supportsText',
  extraction: 'supportsText',
  token_classification: 'supportsText',
  fill_mask: 'supportsText',
  feature_extraction: 'supportsText',
  sentence_similarity: 'supportsText',
  table_qa: 'supportsText',
  structured_output: 'supportsStructuredOutput',
  tool_use: 'supportsToolUse',
  image_generation: 'supportsImageGeneration',
  image_edit: 'supportsImageEditing',
  image_to_image: 'supportsImageEditing',
  image_upscale: 'supportsImageEditing',
  image_classification: 'supportsVision',
  object_detection: 'supportsVision',
  image_segmentation: 'supportsVision',
  depth_estimation: 'supportsVision',
  keypoint_detection: 'supportsVision',
  visual_question_answering: 'supportsVision',
  document_qa: 'supportsText',
  ocr: 'supportsVision',
  zero_shot_object_detection: 'supportsVision',
  mask_generation: 'supportsVision',
  visual_document_retrieval: 'supportsVision',
  video_generation: 'supportsVideoGeneration',
  image_to_video: 'supportsVideoGeneration',
  video_to_video: 'supportsVideoGeneration',
  long_form_video: 'supportsVideoGeneration',
  video_understanding: 'supportsVision',
  video_classification: 'supportsVision',
  storyboard_generation: 'supportsVision',
  subtitle_generation: 'supportsTts',
  lip_sync: 'supportsVideoGeneration',
  avatar_generation: 'supportsVideoGeneration',
  text_to_3d: 'supportsVision',
  image_to_3d: 'supportsVision',
  tts: 'supportsTts',
  stt: 'supportsStt',
  voice_clone: 'supportsTts',
  voice_conversion: 'supportsTts',
  text_to_audio: 'supportsTts',
  audio_to_audio: 'supportsTts',
  audio_classification: 'supportsStt',
  voice_activity_detection: 'supportsStt',
  music_generation: 'supportsMusicGeneration',
  song_generation: 'supportsMusicGeneration',
  embeddings: 'supportsEmbeddings',
  reranking: 'supportsReranking',
  rag_ingest: 'supportsText',
  rag_search: 'supportsText',
  research: 'supportsResearch',
  brand_scrape: 'supportsText',
  document_ingest: 'supportsText',
  campaign_generation: 'supportsText',
  social_content_generation: 'supportsText',
  adult_text: 'supportsChat',
  adult_image: 'supportsImageGeneration',
  adult_voice: 'supportsTts',
  adult_avatar: 'supportsVideoGeneration',
  adult_video: 'supportsVideoGeneration',
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
  const implementedProviders = EXECUTOR_CAPABILITY_MAP[capabilityKey] ?? []
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
