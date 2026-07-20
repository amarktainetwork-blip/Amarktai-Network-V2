import type { CapabilityKey, ProviderDiscoveredModel, ProviderDiscoveryResult } from '@amarktai/core'
import { discoveryTimestamp, failedLiveResult, fetchModelList, modelFromProviderRecord, skippedResult, stringField, numberField, type DiscoveryAdapterOptions } from './common.js'

const DEEPINFRA_ACCOUNT_MODELS_ENDPOINT = 'https://api.deepinfra.com/v1/models'
const DEEPINFRA_TASK_MODELS_ENDPOINT = 'https://api.deepinfra.com/models/list'
const DEEPINFRA_DISCOVERY_SOURCE = `${DEEPINFRA_ACCOUNT_MODELS_ENDPOINT}+${DEEPINFRA_TASK_MODELS_ENDPOINT}`

const TEXT_CAPABILITIES: CapabilityKey[] = [
  'chat', 'streaming_chat', 'reasoning', 'code', 'summarization', 'translation',
  'question_answering', 'classification', 'extraction', 'structured_output', 'tool_use',
]

const TASK_CAPABILITIES: Record<string, CapabilityKey[]> = {
  'text-generation': TEXT_CAPABILITIES,
  text: TEXT_CAPABILITIES,
  chat: TEXT_CAPABILITIES,
  'zero-shot-classification': ['zero_shot_classification'],
  'text-classification': ['classification'],
  'token-classification': ['token_classification'],
  'fill-mask': ['fill_mask'],
  'table-question-answering': ['table_qa'],
  'question-answering': ['question_answering'],
  'feature-extraction': ['feature_extraction', 'embeddings'],
  embeddings: ['feature_extraction', 'sentence_similarity', 'embeddings'],
  'sentence-similarity': ['sentence_similarity'],
  reranker: ['reranking'],
  rerank: ['reranking'],
  'text-to-image': ['image_generation'],
  'image-to-image': ['image_edit', 'image_to_image'],
  'image-classification': ['image_classification'],
  'zero-shot-image-classification': ['image_classification'],
  'object-detection': ['object_detection'],
  'zero-shot-object-detection': ['zero_shot_object_detection'],
  'image-segmentation': ['image_segmentation', 'mask_generation'],
  'depth-estimation': ['depth_estimation'],
  'keypoint-detection': ['keypoint_detection'],
  'visual-question-answering': ['visual_question_answering'],
  'document-question-answering': ['document_qa'],
  ocr: ['ocr'],
  'text-to-video': ['video_generation'],
  'video-classification': ['video_classification'],
  'automatic-speech-recognition': ['stt'],
  'text-to-speech': ['tts'],
  'text-to-music': ['music_generation'],
  'audio-classification': ['audio_classification'],
  'voice-activity-detection': ['voice_activity_detection'],
}

function recordValue(value: unknown): Record<string, unknown> {
  return typeof value === 'object' && value !== null && !Array.isArray(value)
    ? value as Record<string, unknown>
    : {}
}

function modelIdFromRecord(record: Record<string, unknown>): string {
  return stringField(record, ['id', 'model_name', 'model', 'name'])
}

function normalizeTask(record: Record<string, unknown>, modelId: string): string {
  const task = stringField(record, ['task', 'pipeline_tag', 'reported_type', 'type', 'category']).toLowerCase().replace(/_/g, '-')
  if (task && task !== 'model') return task
  const id = modelId.toLowerCase()
  if (id.includes('rerank')) return 'reranker'
  if (id.includes('embed')) return 'embeddings'
  if (id.includes('whisper')) return 'automatic-speech-recognition'
  return 'contract-unknown'
}

function transportForTask(task: string): ProviderDiscoveredModel['transportProfile'] {
  if (['text-generation', 'text', 'chat'].includes(task)) return 'openai_chat_sse'
  if (['text-to-image', 'image-to-image', 'text-to-speech'].includes(task)) return 'native_inference_binary'
  if (task === 'text-to-video') return 'native_inference_async_webhook'
  return 'native_inference_json'
}

function endpointFamilyForTask(task: string): string {
  if (['text-generation', 'text', 'chat'].includes(task)) return 'deepinfra_openai_v1/openai_chat'
  if (task === 'embeddings' || task === 'feature-extraction' || task === 'sentence-similarity') return 'deepinfra_openai_v1/embeddings'
  if (task === 'reranker' || task === 'rerank') return 'deepinfra_native_v1/rerank/native_inference'
  return 'deepinfra_native_v1/native_inference'
}

function structuredModes(record: Record<string, unknown>): string[] {
  const raw = record.structured_output_modes ?? record.response_formats
  const values = Array.isArray(raw) ? raw.filter((value): value is string => typeof value === 'string') : []
  if (record.supports_json_schema === true || record.json_schema === true) values.push('json_schema')
  if (record.supports_json_object === true || record.json_object === true) values.push('json_object')
  return [...new Set(values)]
}

function enrichAccountRecord(
  accountRecord: Record<string, unknown>,
  taskRecord: Record<string, unknown> | undefined,
): Record<string, unknown> {
  const modelId = modelIdFromRecord(accountRecord)
  const accountMetadata = recordValue(accountRecord.metadata)
  const taskMetadata = taskRecord ?? {}
  const taskTags = Array.isArray(taskMetadata.tags) ? taskMetadata.tags : undefined
  const accountTags = Array.isArray(accountMetadata.tags) ? accountMetadata.tags : undefined
  const maxTokens = numberField(taskMetadata, ['max_tokens', 'context_length'])
    ?? numberField(accountMetadata, ['max_tokens', 'context_length'])
    ?? numberField(accountRecord, ['max_tokens', 'context_length'])

  return {
    ...taskMetadata,
    ...accountMetadata,
    ...accountRecord,
    id: modelId,
    model_name: modelId,
    tags: taskTags ?? accountTags ?? accountRecord.tags,
    max_tokens: maxTokens,
    pricing: taskMetadata.pricing ?? accountMetadata.pricing ?? accountRecord.pricing,
    account_model_metadata: accountMetadata,
    task_contract_enriched: taskRecord !== undefined,
  }
}

function toModel(record: Record<string, unknown>, timestamp: string): ProviderDiscoveredModel {
  const modelId = modelIdFromRecord(record)
  const task = normalizeTask(record, modelId)
  const capabilities = TASK_CAPABILITIES[task] ?? []
  const contractKnown = capabilities.length > 0
  const modes = structuredModes(record)
  const parameters = Array.isArray(record.supported_parameters) ? record.supported_parameters : []
  return modelFromProviderRecord({
    provider: 'deepinfra',
    modelId,
    displayName: stringField(record, ['display_name', 'name', 'model_name'], modelId),
    rawProviderType: task,
    inferredCapabilities: capabilities,
    category: task,
    providerCategory: task,
    endpointSource: DEEPINFRA_DISCOVERY_SOURCE,
    endpointFamily: endpointFamilyForTask(task),
    lastDiscoveredAt: timestamp,
    source: 'live_endpoint',
    discoverySource: 'live_endpoint',
    providerClientExists: contractKnown,
    workerExecutorExists: contractKnown,
    endpointShapeKnown: contractKnown,
    requestShapeKnown: contractKnown,
    responseShapeKnown: contractKnown,
    artifactPersistenceExists: !capabilities.some((capability) => ['image_generation', 'image_edit', 'video_generation', 'music_generation', 'tts'].includes(capability)),
    contextWindow: numberField(record, ['max_tokens', 'max_model_len', 'context_window', 'context_length']),
    streamingSupported: ['text-generation', 'text', 'chat'].includes(task) && record.streaming !== false,
    transportProfile: transportForTask(task),
    rawMetadata: {
      taskType: task,
      category: task,
      capabilities,
      structuredOutputModes: modes.length ? modes : ['none'],
      supportedParameters: parameters,
      endpointFamily: endpointFamilyForTask(task),
      transportProfile: transportForTask(task),
      endpointShapeKnown: contractKnown,
      requestShapeKnown: contractKnown,
      responseShapeKnown: contractKnown,
      providerClientExists: contractKnown,
      workerExecutorExists: contractKnown,
      streamingSupported: ['text-generation', 'text', 'chat'].includes(task) && record.streaming !== false,
      accountInventorySource: DEEPINFRA_ACCOUNT_MODELS_ENDPOINT,
      taskMetadataSource: DEEPINFRA_TASK_MODELS_ENDPOINT,
      taskContractEnriched: record.task_contract_enriched === true,
      pricing: record.pricing,
      tags: record.tags,
      deprecated: record.deprecated,
      replacedBy: record.replaced_by,
    },
  })
}

export async function discoverDeepInfraProviderModels(options: DiscoveryAdapterOptions = {}): Promise<ProviderDiscoveryResult> {
  const timestamp = discoveryTimestamp(options)
  if (!options.live || !options.apiKey) {
    return skippedResult('deepinfra', DEEPINFRA_ACCOUNT_MODELS_ENDPOINT, [], ['DeepInfra documentation fallback is display-only. Authenticated GET /v1/models plus task metadata from /models/list are required for executable catalogue truth.'])
  }
  try {
    const [accountRecordsRaw, taskRecordsRaw] = await Promise.all([
      fetchModelList(DEEPINFRA_ACCOUNT_MODELS_ENDPOINT, options.apiKey),
      fetchModelList(DEEPINFRA_TASK_MODELS_ENDPOINT, options.apiKey),
    ])
    const accountRecords = accountRecordsRaw.filter((record): record is Record<string, unknown> => typeof record === 'object' && record !== null)
    const taskRecords = taskRecordsRaw.filter((record): record is Record<string, unknown> => typeof record === 'object' && record !== null)
    const taskByModelId = new Map(taskRecords.map((record) => [modelIdFromRecord(record), record]).filter(([modelId]) => modelId))
    const models = accountRecords
      .map((record) => enrichAccountRecord(record, taskByModelId.get(modelIdFromRecord(record))))
      .map((record) => toModel(record, timestamp))
      .filter((model) => model.modelId)
    if (!models.length) return failedLiveResult('deepinfra', DEEPINFRA_DISCOVERY_SOURCE, 'authenticated model list returned zero usable models', [])
    const enrichedCount = models.filter((model) => model.rawMetadata?.taskContractEnriched === true).length
    return {
      provider: 'deepinfra', providerRole: 'runtime_execution_provider', docsCapabilityKnown: true,
      liveDiscoverySupported: true, docsFallbackSupported: true, apiKeyEnvName: 'DEEPINFRA_API_KEY',
      apiKeyRequiredForLiveDiscovery: true, apiKeyPresent: true, modelsEndpointRequiresAuth: true,
      modelsEndpointScope: 'authenticated_account_catalogue_enriched_with_task_contracts', mode: 'live_model_list', source: 'live_endpoint',
      models, totalDiscovered: models.length, liveDiscoveryAttempted: true, liveDiscoverySucceeded: true,
      liveDiscoverySkipped: false, liveDiscoverySkipReason: null, docsFallbackUsed: false,
      providerUniverseKnown: true, providerUniversePartiallyKnown: false, publicDocsUniverseKnown: true,
      authenticatedUniverseKnown: true, endpointSource: DEEPINFRA_DISCOVERY_SOURCE, error: null,
      returnedModelCount: models.length, staticFallbackCount: 0, docsFallbackCount: 0,
      effectiveCatalogueCount: models.length, runtimeExecutionAllowed: true, policyRestrictedByApp: false,
      policyExecutionDisabled: false, policyBlockedReason: null, discoveredAt: timestamp,
      notes: [`Authenticated DeepInfra /v1/models inventory intersected with /models/list task contracts. Enriched ${enrichedCount}/${models.length} account-accessible models; unknown contracts remain visible but non-executable.`],
    }
  } catch (error) {
    return failedLiveResult('deepinfra', DEEPINFRA_DISCOVERY_SOURCE, error instanceof Error ? error.message : 'DeepInfra discovery failed', [])
  }
}
