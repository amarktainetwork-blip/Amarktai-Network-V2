import { prisma } from '@amarktai/db'
import {
  APPROVED_PROVIDER_DEFINITIONS,
  CAPABILITY_FIELD_MAP,
  MODEL_CATALOGUE,
  type CapabilityKey,
  type ModelRecord,
} from '@amarktai/core'
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
  canonicalCapabilities?: CapabilityKey[]
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
  rawMetadata?: Record<string, unknown>
  providerRawType?: string
  providerRawCategory?: string
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
  supportsMusicGeneration: boolean
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
    return { category: 'audio', primaryRole: 'music_generation', capabilities: { supportsMusicGeneration: true } }
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
  | 'supportsMusicGeneration'
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
    supportsMusicGeneration: false,
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

// Curated DB projection is derived from the canonical core model catalogue.
// Always include ALL static catalogue entries so curated seed can overwrite
// discovery metadata with correct compatibility fields for TTS, music, etc.
const STATIC_MODEL_IDS = new Set(
  MODEL_CATALOGUE.filter((m) => !m.discoveredModel).map((m) => `${m.provider}/${m.modelId}`)
)

export const CURATED_MODEL_CATALOG: ModelCatalogEntry[] = MODEL_CATALOGUE
  .filter((model) => !model.discoveredModel || STATIC_MODEL_IDS.has(`${model.provider}/${model.modelId}`))
  .map(modelRecordToCatalogEntry)

function modelRecordToCatalogEntry(model: ModelRecord): ModelCatalogEntry {
  const capabilities: Record<string, boolean> = {}
  for (const capability of model.capabilities) capabilities[CAPABILITY_FIELD_MAP[capability]] = true
  return {
    provider: model.provider,
    modelId: model.modelId,
    displayName: model.displayName,
    family: model.modelId.split('/')[0] ?? model.provider,
    category: model.category ?? (model.capabilities.includes('embeddings') ? 'embeddings' : model.capabilities.includes('reranking') ? 'reranking' : 'text'),
    primaryRole: model.capabilities[0] ?? 'chat',
    costTier: model.costTier,
    latencyTier: model.latencyTier,
    contextWindow: 0,
    capabilities,
    canonicalCapabilities: [...model.capabilities],
    estimatedUnitCost: null,
    qualityTier: model.qualityTier,
    source: model.source ?? 'curated_seed',
    catalogCompleteness: 'curated_fallback_only',
    isLiveDiscovered: model.liveDiscovered === true,
    modelOwner: model.upstreamProvider ?? model.provider,
    notes: model.notes,
    pricingSource: 'unknown',
    pricingConfidence: 'unknown',
    pricingUnit: '',
    pricingCurrency: '',
    pricingRawMetadata: {},
    lastPricingSyncedAt: null,
    pricingBlocker: 'pricing_unknown',
    providerRawType: model.category ?? '',
    providerRawCategory: model.providerCategory ?? model.category ?? '',
    rawMetadata: {
      ...(model.rawMetadata ?? {}),
      compatibility: compatibilityMetadata(model),
    },
  }
}

function compatibilityMetadata(model: ModelRecord): Record<string, unknown> {
  return {
    category: model.category ?? null,
    capabilities: model.capabilities,
    modalitiesIn: model.modalitiesIn ?? [],
    modalitiesOut: model.modalitiesOut ?? [],
    transportProfile: model.transportProfile ?? null,
    endpointFamily: model.endpointFamily ?? null,
    endpointShapeKnown: model.endpointShapeKnown === true,
    requestShapeKnown: model.requestShapeKnown === true,
    responseShapeKnown: model.responseShapeKnown === true,
    providerClientExists: model.providerClientExists === true,
    workerExecutorExists: model.workerExecutorExists === true,
  }
}

function canonicalCapabilitiesFromFlags(flags: Record<string, boolean>): CapabilityKey[] {
  return Object.entries(CAPABILITY_FIELD_MAP)
    .filter(([, field]) => flags[field] === true)
    .map(([capability]) => capability as CapabilityKey)
}

function canonicalCapabilitiesForDiscovered(model: DiscoveryResult['models'][number]): CapabilityKey[] {
  const task = (model.providerRawCategory || model.providerRawType || model.category).toLowerCase().replace(/_/g, '-')
  const byTask: Record<string, CapabilityKey[]> = {
    'zero-shot-classification': ['zero_shot_classification'], 'token-classification': ['token_classification'],
    'fill-mask': ['fill_mask'], 'table-question-answering': ['table_qa'], 'question-answering': ['question_answering'],
    'feature-extraction': ['feature_extraction', 'embeddings'], embeddings: ['feature_extraction', 'sentence_similarity', 'embeddings'],
    'sentence-similarity': ['sentence_similarity'], reranker: ['reranking'], rerank: ['reranking'],
    'text-to-image': ['image_generation'], 'image-to-image': ['image_edit', 'image_to_image'],
    'image-classification': ['image_classification'], 'object-detection': ['object_detection'],
    'image-segmentation': ['image_segmentation'], 'depth-estimation': ['depth_estimation'],
    'visual-question-answering': ['visual_question_answering'], 'document-question-answering': ['document_qa'], ocr: ['ocr'],
    'text-to-video': ['video_generation'], 'image-to-video': ['image_to_video'], 'video-to-video': ['video_to_video'],
    'automatic-speech-recognition': ['stt'], transcription: ['stt'], 'text-to-speech': ['tts'],
    'text-to-music': ['music_generation'], music: ['music_generation'], song: ['song_generation'],
  }
  if (byTask[task]) return byTask[task]
  if (['text-generation', 'chat', 'text'].includes(task)) return ['chat', 'streaming_chat', 'reasoning', 'code', 'summarization', 'translation', 'question_answering', 'classification', 'extraction', 'structured_output', 'tool_use']
  return canonicalCapabilitiesFromFlags(model.capabilities)
}

function discoveredCompatibility(model: DiscoveryResult['models'][number], capabilities: CapabilityKey[]): Record<string, unknown> | null {
  const category = (model.providerRawCategory || model.category).toLowerCase()
  const taskType = (model.providerRawCategory || model.providerRawType || model.category).toLowerCase().replace(/_/g, '-')
  if (model.provider === 'deepinfra' && capabilities.length > 0) {
    const text = ['text-generation', 'chat', 'text'].includes(taskType)
    const embeddings = ['embeddings', 'feature-extraction', 'sentence-similarity'].includes(taskType)
    const rerank = ['reranker', 'rerank'].includes(taskType)
    return {
      taskType, category: taskType, capabilities,
      modalitiesIn: embeddings || text || rerank ? ['text'] : [],
      modalitiesOut: embeddings ? ['embedding'] : text ? ['text'] : ['json'],
      transportProfile: text ? 'openai_chat_sse' : 'native_inference_json',
      endpointFamily: text ? 'deepinfra_openai_v1/openai_chat' : embeddings ? 'deepinfra_openai_v1/embeddings' : rerank ? 'deepinfra_native_v1/rerank/native_inference' : 'deepinfra_native_v1/native_inference',
      endpointShapeKnown: true, requestShapeKnown: true, responseShapeKnown: true,
      providerClientExists: true, workerExecutorExists: true, streamingSupported: text,
      structuredOutputModes: Array.isArray(model.rawMetadata?.structured_output_modes) ? model.rawMetadata.structured_output_modes : ['none'],
      supportedParameters: Array.isArray(model.rawMetadata?.supported_parameters) ? model.rawMetadata.supported_parameters : [],
    }
  }
  if (model.provider === 'together' && capabilities.length > 0) {
    const text = ['text', 'chat', 'language', 'code'].includes(taskType)
    return { taskType, category, capabilities, modalitiesIn: ['text'], modalitiesOut: text ? ['text'] : category === 'image' ? ['image'] : category === 'embedding' ? ['embedding'] : ['json'], transportProfile: text ? 'openai_chat_sse' : 'native_inference_json', endpointFamily: text ? 'together_openai_v1/openai_chat' : category === 'embedding' ? 'embeddings' : category === 'rerank' ? 'rerank' : 'image_generation', endpointShapeKnown: true, requestShapeKnown: true, responseShapeKnown: true, providerClientExists: true, workerExecutorExists: true, streamingSupported: text }
  }
  if (model.provider === 'genx' && category === 'video') {
    return {
      taskType, category: 'video', capabilities, modalitiesIn: taskType === 'image-to-video' ? ['text','image'] : taskType === 'video-to-video' ? ['text','video'] : ['text'], modalitiesOut: ['video'],
      transportProfile: 'async_job_poll', endpointFamily: 'genx_generation_v1',
      endpointShapeKnown: true, requestShapeKnown: true, responseShapeKnown: true,
      providerClientExists: true, workerExecutorExists: true,
    }
  }
  if (model.provider === 'genx' && (category === 'audio' || category === 'music')) {
    const isMusic = capabilities.includes('music_generation')
    return {
      taskType, category: isMusic ? 'music' : category, capabilities, modalitiesIn: capabilities.includes('stt') ? ['audio'] : ['text'], modalitiesOut: capabilities.includes('stt') ? ['text'] : ['audio'],
      transportProfile: 'async_job_poll', endpointFamily: 'genx_generation_v1',
      endpointShapeKnown: true, requestShapeKnown: true, responseShapeKnown: true,
      providerClientExists: true, workerExecutorExists: true,
      ...(isMusic ? { primaryRole: 'music_generation' } : {}),
    }
  }
  return null
}

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

      const canonicalCapabilities = canonicalCapabilitiesForDiscovered(model)
      const compatibility = discoveredCompatibility(model, canonicalCapabilities)
      const rawMetadata = stringifyMetadataSafely({
        ...model.rawMetadata,
        ...(compatibility ? { compatibility } : {}),
      }, 'raw_metadata')
      const pricingRawMetadata = stringifyMetadataSafely(model.pricingRawMetadata, 'pricing_raw_metadata')
      const metadataWarning = [rawMetadata.warning, pricingRawMetadata.warning].filter(Boolean).join(';')

      const data = {
        displayName: model.displayName,
        family: model.family,
        category: model.category,
        primaryRole: model.primaryRole,
        costTier: model.costTier,
        qualityTier: model.qualityTier,
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
        currentAvailability: model.isLiveDiscovered ? 'available' : 'defined',
        accountAccess: model.isLiveDiscovered ? 'accessible' : 'unknown',
        endpointFamily: typeof compatibility?.endpointFamily === 'string' ? compatibility.endpointFamily : '',
        transportProfile: typeof compatibility?.transportProfile === 'string' ? compatibility.transportProfile : '',
        structuredOutputModes: JSON.stringify(Array.isArray(model.rawMetadata?.structuredOutputModes) ? model.rawMetadata.structuredOutputModes : ['none']),
        supportedParameters: JSON.stringify(Array.isArray(model.rawMetadata?.supportedParameters) ? model.rawMetadata.supportedParameters : []),
        compatibilityVersion: compatibility ? 'transport-task-v1' : '',
        deprecated: model.rawMetadata?.deprecated === true,
        replacementModel: typeof model.rawMetadata?.replacedBy === 'string' ? model.rawMetadata.replacedBy : '',
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
        capabilitiesJson: JSON.stringify(canonicalCapabilities),
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

  await reconcileStoredProviderDefault(result.provider).catch(() => {})

  return { providerKey: result.provider, totalFetched: result.models.length, created, updated, failedRows, errors }
}

async function reconcileStoredProviderDefault(provider: string): Promise<void> {
  const [stored, accessible] = await Promise.all([
    prisma.aiProvider.findUnique({ where: { providerKey: provider } }),
    prisma.modelRegistryEntry.findMany({ where: { provider, enabled: true, isLiveDiscovered: true }, orderBy: [{ qualityTier: 'desc' }, { modelId: 'asc' }] }),
  ])
  if (!stored?.defaultModel || accessible.some((model) => model.modelId === stored.defaultModel)) return
  await prisma.aiProvider.update({ where: { providerKey: provider }, data: { defaultModel: accessible[0]?.modelId ?? '' } })
}

export async function seedCuratedFallback(): Promise<{ created: number; updated: number }> {
  let created = 0
  let updated = 0

  for (const model of CURATED_MODEL_CATALOG) {
    const existing = await prisma.modelRegistryEntry.findUnique({
      where: { provider_modelId: { provider: model.provider, modelId: model.modelId } },
    })

    const statusModel = MODEL_CATALOGUE.find((m) => m.provider === model.provider && m.modelId === model.modelId)
    const shouldBeEnabled = statusModel?.status === 'available'

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
          providerRawType: model.providerRawType ?? '',
          providerRawCategory: model.providerRawCategory ?? model.category,
          rawMetadata: stringifyMetadataSafely(model.rawMetadata ?? {}, 'raw_metadata').json,
          notes: model.notes,
          capabilitiesJson: JSON.stringify(model.canonicalCapabilities ?? []),
          enabled: shouldBeEnabled,
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
          providerRawType: model.providerRawType ?? '',
          providerRawCategory: model.providerRawCategory ?? model.category,
          rawMetadata: stringifyMetadataSafely(model.rawMetadata ?? {}, 'raw_metadata').json,
          notes: model.notes,
          capabilitiesJson: JSON.stringify(model.canonicalCapabilities ?? []),
          enabled: shouldBeEnabled,
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
      const capFields = ['supportsChat', 'supportsText', 'supportsReasoning', 'supportsCode', 'supportsImageGeneration', 'supportsVideoGeneration', 'supportsMusicGeneration', 'supportsStt', 'supportsTts', 'supportsEmbeddings', 'supportsReranking', 'supportsMultimodal']
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
