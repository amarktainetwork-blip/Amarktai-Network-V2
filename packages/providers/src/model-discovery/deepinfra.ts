import type { CapabilityKey, ProviderDiscoveredModel, ProviderDiscoveryResult } from '@amarktai/core'
import { discoveryTimestamp, fetchModelList, modelFromProviderRecord, skippedResult, stringField, numberField, type DiscoveryAdapterOptions } from './common.js'

const DEEPINFRA_MODELS_ENDPOINT = 'https://api.deepinfra.com/models/list'
const DEEPINFRA_PUBLIC_DISCOVERY_DISABLED = process.env.DEEPINFRA_PUBLIC_DISCOVERY_DISABLED === 'true'
const DEEPINFRA_IMPLEMENTED_MODELS: Readonly<Record<string, CapabilityKey[]>> = {
  'meta-llama/Meta-Llama-3.1-8B-Instruct': ['chat', 'reasoning', 'code', 'summarization', 'translation', 'question_answering', 'classification', 'extraction', 'structured_output'],
  'meta-llama/Llama-3.3-70B-Instruct': ['chat', 'reasoning', 'code', 'summarization', 'translation', 'question_answering', 'classification', 'extraction', 'structured_output'],
  'facebook/bart-large-mnli': ['zero_shot_classification'],
  'dslim/bert-base-NER': ['token_classification'],
  'bert-base-cased': ['fill_mask'],
  'google/tapas-base-finetuned-wtq': ['table_qa'],
  'Qwen/Qwen3-Embedding-0.6B': ['embeddings', 'feature_extraction', 'sentence_similarity'],
  'BAAI/bge-large-en-v1.5': ['embeddings', 'feature_extraction', 'sentence_similarity'],
  'Qwen/Qwen3-Reranker-0.6B': ['reranking'],
  'BAAI/bge-reranker-large': ['reranking'],
}

function deepinfraCapabilities(modelId: string, rawType: string, record: Record<string, unknown>): CapabilityKey[] {
  const tags = Array.isArray(record.tags) ? record.tags.join(' ') : ''
  const text = `${modelId} ${rawType} ${tags} ${record.description ?? ''}`.toLowerCase()
  const capabilities = new Set<CapabilityKey>()

  if (/text-to-music|music-generation|musicgen/.test(text)) capabilities.add('music_generation')
  if (/text-to-video|video-generation/.test(text)) capabilities.add('video_generation')
  if (/text-to-image|image-generation/.test(text)) capabilities.add('image_generation')
  if (/image-to-image|inpaint|upscal/.test(text)) capabilities.add('image_edit')
  if (/text-to-speech|tts|speech-synthesis/.test(text)) capabilities.add('tts')
  if (/automatic-speech-recognition|speech-to-text|asr|whisper/.test(text)) capabilities.add('stt')
  if (/embedding/.test(text)) capabilities.add('embeddings')
  if (/rerank/.test(text)) capabilities.add('reranking')
  if (/ocr/.test(text)) capabilities.add('ocr')
  if (/vision|multimodal|image/.test(text)) capabilities.add('visual_question_answering')
  if (/text-generation|chat|llama|qwen|mistral|deepseek|claude/.test(text)) capabilities.add('chat')
  if (/reasoning/.test(text)) capabilities.add('reasoning')
  if (/tools|structured-output|json/.test(text)) capabilities.add('structured_output')

  if (capabilities.size === 0) capabilities.add('chat')
  return [...capabilities]
}

function deepinfraTransport(capabilities: CapabilityKey[]): ProviderDiscoveredModel['transportProfile'] {
  if (capabilities.some((capability) => ['image_generation', 'image_edit', 'tts'].includes(capability))) return 'native_inference_binary'
  if (capabilities.includes('video_generation')) return 'native_inference_async_webhook'
  return 'native_inference_json'
}

function safeDeepInfraMetadata(record: Record<string, unknown>): Record<string, unknown> {
  return {
    model_name: record.model_name,
    type: record.type,
    reported_type: record.reported_type,
    description: record.description,
    tags: Array.isArray(record.tags) ? record.tags : [],
    pricing: record.pricing,
    max_tokens: record.max_tokens,
    deprecated: record.deprecated,
    replaced_by: record.replaced_by,
    quantization: record.quantization,
    create_ts: record.create_ts,
    private: record.private,
    is_partner: record.is_partner,
  }
}

function deepinfraPublicModel(record: Record<string, unknown>, timestamp: string): ProviderDiscoveredModel {
  const modelId = stringField(record, ['model_name', 'id', 'model', 'name'])
  const rawType = stringField(record, ['reported_type', 'type', 'task', 'pipeline_tag', 'object'])
  const capabilities = DEEPINFRA_IMPLEMENTED_MODELS[modelId] ?? deepinfraCapabilities(modelId, rawType, record)
  const implemented = modelId in DEEPINFRA_IMPLEMENTED_MODELS
  return modelFromProviderRecord({
    provider: 'deepinfra',
    modelId,
    displayName: stringField(record, ['display_name', 'name', 'model_name'], modelId),
    rawProviderType: rawType,
    inferredCapabilities: capabilities,
    category: rawType,
    providerCategory: rawType,
    endpointSource: DEEPINFRA_MODELS_ENDPOINT,
    lastDiscoveredAt: timestamp,
    source: 'docs_fallback',
    discoverySource: 'docs_fallback',
    providerClientExists: implemented,
    workerExecutorExists: implemented,
    endpointShapeKnown: true,
    requestShapeKnown: implemented,
    responseShapeKnown: implemented,
    artifactPersistenceExists: !capabilities.some((capability) => ['image_generation', 'image_edit', 'video_generation', 'music_generation', 'tts'].includes(capability)),
    contextWindow: numberField(record, ['max_tokens', 'max_model_len', 'context_window', 'context']),
    transportProfile: deepinfraTransport(capabilities),
    rawMetadata: safeDeepInfraMetadata(record),
    publicEndpointDiscovered: true,
  })
}

export async function discoverDeepInfraProviderModels(options: DiscoveryAdapterOptions = {}): Promise<ProviderDiscoveryResult> {
  const timestamp = discoveryTimestamp(options)
  const staticModels = [
    modelFromProviderRecord({ provider: 'deepinfra', modelId: 'meta-llama/Meta-Llama-3.1-8B-Instruct', displayName: 'Meta Llama 3.1 8B Instruct', rawProviderType: 'chat', category: 'text', endpointSource: 'repo_static_deepinfra_client', lastDiscoveredAt: timestamp, source: 'static_verified', discoverySource: 'static_verified', providerClientExists: true, workerExecutorExists: true, requestShapeKnown: true, responseShapeKnown: true, streamingSupported: true, transportProfile: 'openai_chat_sse', batchSupported: true }),
    ...Object.entries(DEEPINFRA_IMPLEMENTED_MODELS)
      .filter(([modelId]) => modelId !== 'meta-llama/Meta-Llama-3.1-8B-Instruct')
      .map(([modelId, capabilities]) => modelFromProviderRecord({
        provider: 'deepinfra',
        modelId,
        displayName: modelId,
        inferredCapabilities: capabilities,
        rawProviderType: capabilities.includes('reranking') ? 'reranker' : capabilities.includes('embeddings') ? 'embeddings' : 'specialist-task',
        category: capabilities.includes('reranking') ? 'reranker' : capabilities.includes('embeddings') ? 'embeddings' : 'text',
        endpointSource: 'DeepInfra official native/OpenAI-compatible API docs',
        lastDiscoveredAt: timestamp,
        source: 'docs_fallback',
        providerClientExists: true,
        workerExecutorExists: true,
        endpointShapeKnown: true,
        requestShapeKnown: true,
        responseShapeKnown: true,
        artifactPersistenceExists: true,
        transportProfile: 'native_inference_json',
        batchSupported: capabilities.includes('embeddings'),
      })),
  ]

  if (DEEPINFRA_PUBLIC_DISCOVERY_DISABLED) {
    return skippedResult('deepinfra', DEEPINFRA_MODELS_ENDPOINT, staticModels, ['DeepInfra public model-list discovery was explicitly disabled; static verified fallback remains in use.'])
  }

  try {
    const records = await fetchModelList(DEEPINFRA_MODELS_ENDPOINT, options.live ? options.apiKey : undefined)
    const publicModels = records
      .filter((record): record is Record<string, unknown> => typeof record === 'object' && record !== null)
      .map((record) => deepinfraPublicModel(record, timestamp))
      .filter((model) => model.modelId)
    const merged = [...new Map([...publicModels, ...staticModels].map((model) => [`${model.provider}:${model.modelId}`, model])).values()]
    const publicDiscoverySucceeded = publicModels.length > 0

    return {
      provider: 'deepinfra',
      providerRole: 'runtime_execution_provider',
      docsCapabilityKnown: true,
      liveDiscoverySupported: true,
      docsFallbackSupported: true,
      apiKeyEnvName: 'DEEPINFRA_API_KEY',
      apiKeyRequiredForLiveDiscovery: false,
      apiKeyPresent: Boolean(options.apiKey),
      modelsEndpointRequiresAuth: false,
      modelsEndpointScope: 'public_model_catalogue',
      mode: options.live ? 'live_model_list' : 'safe_static',
      source: 'docs_fallback',
      models: publicDiscoverySucceeded ? merged : staticModels,
      totalDiscovered: publicDiscoverySucceeded ? merged.length : staticModels.length,
      liveDiscoveryAttempted: options.live === true,
      liveDiscoverySucceeded: publicDiscoverySucceeded,
      liveDiscoverySkipped: false,
      liveDiscoverySkipReason: null,
      docsFallbackUsed: !publicDiscoverySucceeded,
      publicDiscoveryAttempted: true,
      publicDiscoverySucceeded,
      publicEndpointUsed: publicDiscoverySucceeded,
      providerUniverseKnown: publicDiscoverySucceeded,
      providerUniversePartiallyKnown: !publicDiscoverySucceeded,
      publicDocsUniverseKnown: publicDiscoverySucceeded,
      authenticatedUniverseKnown: options.live === true && Boolean(options.apiKey) && publicDiscoverySucceeded,
      endpointSource: DEEPINFRA_MODELS_ENDPOINT,
      error: publicDiscoverySucceeded ? null : 'public model-list returned zero usable models',
      returnedModelCount: publicModels.length,
      publicEndpointModelCount: publicModels.length,
      staticFallbackCount: staticModels.length,
      docsFallbackCount: publicDiscoverySucceeded ? 0 : staticModels.length,
      effectiveCatalogueCount: publicDiscoverySucceeded ? merged.length : staticModels.length,
      runtimeExecutionAllowed: true,
      policyRestrictedByApp: false,
      policyExecutionDisabled: false,
      policyBlockedReason: null,
      discoveredAt: timestamp,
      notes: publicDiscoverySucceeded
        ? ['DeepInfra public model-list discovery succeeded. Catalogue entries are not executable until endpoint/request/response/client/executor gates are satisfied.']
        : ['DeepInfra public model-list returned no usable models; static verified fallback remains in use.'],
    }
  } catch (error) {
    const message = error instanceof Error ? error.message : 'DeepInfra public discovery failed'
    const skipped = skippedResult('deepinfra', DEEPINFRA_MODELS_ENDPOINT, staticModels, ['DeepInfra public model-list discovery failed safely; static verified fallback remains in use.'])
    return {
      ...skipped,
      mode: options.live ? 'live_model_list' : 'safe_static',
      liveDiscoveryAttempted: options.live === true,
      liveDiscoverySucceeded: false,
      liveDiscoverySkipped: false,
      liveDiscoverySkipReason: null,
      publicDiscoveryAttempted: true,
      publicDiscoverySucceeded: false,
      publicEndpointUsed: false,
      error: message,
    }
  }
}
