import fs from 'fs'
import path from 'path'
import { fileURLToPath } from 'url'

const ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..')
const LIVE = process.argv.includes('--live')
const STRICT = process.argv.includes('--strict')
const STATIC_TIME = '1970-01-01T00:00:00.000Z'
const now = LIVE ? new Date().toISOString() : STATIC_TIME

const RUNTIME_PROVIDERS = ['genx', 'groq', 'together', 'deepinfra']
const APPROVED_PROVIDERS = ['genx', 'groq', 'together', 'mimo', 'deepinfra']
const MEDIA_CAPABILITIES = new Set(['image_generation', 'image_edit', 'video_generation', 'image_to_video', 'long_form_video', 'avatar_generation', 'music_generation', 'tts'])

const PROVIDER_TRUTH = {
  genx: {
    provider: 'genx',
    providerRole: 'runtime_execution_provider',
    docsCapabilityKnown: true,
    liveDiscoverySupported: true,
    docsFallbackSupported: true,
    apiKeyEnvName: 'GENX_API_KEY',
    apiKeyRequiredForLiveDiscovery: true,
    baseUrl: process.env.GENX_BASE_URL || 'https://query.genx.sh',
    alternateBaseUrls: ['https://query.genx.sh'],
    modelsEndpoint: '/api/v1/models',
    modelsEndpointRequiresAuth: true,
    modelsEndpointScope: 'authenticated_full_catalogue',
    runtimeExecutionAllowed: true,
    policyRestrictedByApp: false,
    policyExecutionDisabled: false,
    policyBlockedReason: null,
  },
  groq: {
    provider: 'groq',
    providerRole: 'runtime_execution_provider',
    docsCapabilityKnown: true,
    liveDiscoverySupported: true,
    docsFallbackSupported: true,
    apiKeyEnvName: 'GROQ_API_KEY',
    apiKeyRequiredForLiveDiscovery: true,
    baseUrl: 'https://api.groq.com/openai/v1',
    alternateBaseUrls: [],
    modelsEndpoint: 'https://api.groq.com/openai/v1/models',
    modelsEndpointRequiresAuth: true,
    modelsEndpointScope: 'authenticated_model_list',
    runtimeExecutionAllowed: true,
    policyRestrictedByApp: false,
    policyExecutionDisabled: false,
    policyBlockedReason: null,
  },
  together: {
    provider: 'together',
    providerRole: 'runtime_execution_provider',
    docsCapabilityKnown: true,
    liveDiscoverySupported: true,
    docsFallbackSupported: true,
    apiKeyEnvName: 'TOGETHER_API_KEY',
    apiKeyRequiredForLiveDiscovery: true,
    baseUrl: 'https://api.together.ai/v1',
    alternateBaseUrls: [],
    modelsEndpoint: 'https://api.together.ai/models',
    modelsEndpointRequiresAuth: true,
    modelsEndpointScope: 'authenticated_model_list',
    runtimeExecutionAllowed: true,
    policyRestrictedByApp: false,
    policyExecutionDisabled: false,
    policyBlockedReason: null,
  },
  deepinfra: {
    provider: 'deepinfra',
    providerRole: 'runtime_execution_provider',
    docsCapabilityKnown: true,
    liveDiscoverySupported: true,
    docsFallbackSupported: true,
    apiKeyEnvName: 'DEEPINFRA_API_KEY',
    apiKeyRequiredForLiveDiscovery: false,
    baseUrl: 'https://api.deepinfra.com',
    alternateBaseUrls: ['https://api.deepinfra.com/v1/openai'],
    modelsEndpoint: 'https://api.deepinfra.com/models/list',
    modelsEndpointRequiresAuth: false,
    modelsEndpointScope: 'public_model_catalogue',
    runtimeExecutionAllowed: true,
    policyRestrictedByApp: false,
    policyExecutionDisabled: false,
    policyBlockedReason: null,
  },
  mimo: {
    provider: 'mimo',
    providerRole: 'coding_agent_only',
    docsCapabilityKnown: true,
    liveDiscoverySupported: false,
    docsFallbackSupported: true,
    apiKeyEnvName: null,
    apiKeyRequiredForLiveDiscovery: false,
    baseUrl: 'https://api.xiaomimimo.com/v1',
    alternateBaseUrls: ['cluster-specific token-plan base URLs'],
    modelsEndpoint: 'docs_fallback_only',
    modelsEndpointRequiresAuth: false,
    modelsEndpointScope: 'docs_only_policy_restricted',
    runtimeExecutionAllowed: false,
    policyRestrictedByApp: true,
    policyExecutionDisabled: true,
    policyBlockedReason: 'coding_agent_only_not_backend_runtime',
  },
}

function inferCapabilities(modelId, category = '') {
  const text = `${modelId} ${category}`.toLowerCase()
  const caps = new Set()
  if (/music|lyria|song|text-to-music/.test(text)) caps.add('music_generation')
  if (/image|flux|stable-diffusion|sdxl|recraft|imagen|nano-banana/.test(text)) caps.add('image_generation')
  if (/edit|inpaint|vector/.test(text)) caps.add('image_edit')
  if (/video|seedance|veo|kling|pixverse|wan|grok-imagine-video/.test(text)) caps.add('video_generation')
  if (/avatar/.test(text)) caps.add('avatar_generation')
  if (/embed/.test(text)) caps.add('embeddings')
  if (/rerank/.test(text)) caps.add('reranking')
  if (/whisper|transcrib|asr|speech-to-text/.test(text)) caps.add('stt')
  if (/tts|speech|voice|aura|orpheus|playai/.test(text)) caps.add('tts')
  if (/code|coder/.test(text)) caps.add('code')
  if (/vision|multimodal|vl|ocr|image-input|video-input|audio-input/.test(text)) caps.add('multimodal')
  if (caps.size === 0) caps.add('chat')
  return [...caps]
}

function modalitiesForCapabilities(capabilities, direction) {
  const values = new Set()
  for (const capability of capabilities) {
    if (['chat', 'reasoning', 'code', 'summarization', 'translation', 'classification', 'extraction', 'structured_output', 'tool_use'].includes(capability)) values.add('text')
    if (['image_generation', 'image_edit', 'ocr'].includes(capability)) values.add('image')
    if (['video_generation', 'image_to_video', 'long_form_video', 'avatar_generation'].includes(capability)) values.add('video')
    if (['music_generation', 'tts', 'stt'].includes(capability)) values.add('audio')
    if (['embeddings', 'reranking', 'rag_search', 'rag_ingest', 'research'].includes(capability)) values.add('retrieval')
    if (capability === 'multimodal') values.add('multimodal')
  }
  if (direction === 'in' && capabilities.includes('music_generation')) values.add('image')
  if (values.size === 0) values.add('text')
  return [...values]
}

function executableBlockers(input) {
  const blockers = []
  if (!RUNTIME_PROVIDERS.includes(input.executionProvider)) blockers.push('provider_not_runtime_execution_provider')
  if (input.policyRestrictedByApp) blockers.push('policy_restricted_by_app')
  if (!input.providerCapabilityKnown) blockers.push('provider_capability_unknown')
  if (!input.endpointShapeKnown) blockers.push('endpoint_shape_missing')
  if (!input.requestShapeKnown) blockers.push('request_shape_missing')
  if (!input.responseShapeKnown) blockers.push('response_shape_missing')
  if (!input.providerClientExists) blockers.push('provider_client_missing')
  if (!input.workerExecutorExists) blockers.push('worker_executor_missing')
  if (input.artifactOutput && !input.artifactPersistenceExists) blockers.push('artifact_persistence_missing')
  return blockers
}

function discovered(input) {
  const providerTruth = PROVIDER_TRUTH[input.executionProvider ?? input.provider]
  const capabilities = input.inferredCapabilities ?? inferCapabilities(input.modelId, input.category ?? input.providerCategory ?? input.rawProviderType)
  const artifactOutput = input.artifactOutput ?? capabilities.some((capability) => MEDIA_CAPABILITIES.has(capability))
  const policyRestrictedByApp = input.policyRestrictedByApp ?? providerTruth.policyRestrictedByApp
  const model = {
    provider: input.provider,
    modelId: input.modelId,
    displayName: input.displayName ?? input.modelId,
    executionProvider: input.executionProvider ?? input.provider,
    upstreamProvider: input.upstreamProvider ?? input.provider,
    discoverySource: input.discoverySource ?? 'docs_fallback',
    docsKnown: input.docsKnown ?? true,
    liveDiscovered: input.liveDiscovered ?? false,
    category: input.category ?? input.providerCategory ?? input.rawProviderType ?? 'text',
    providerCategory: input.providerCategory ?? input.category ?? input.rawProviderType ?? 'text',
    rawProviderType: input.rawProviderType ?? input.providerCategory ?? input.category ?? '',
    modalitiesIn: input.modalitiesIn ?? modalitiesForCapabilities(capabilities, 'in'),
    modalitiesOut: input.modalitiesOut ?? modalitiesForCapabilities(capabilities, 'out'),
    modalities: input.modalities ?? [...new Set([...modalitiesForCapabilities(capabilities, 'in'), ...modalitiesForCapabilities(capabilities, 'out')])],
    inferredCapabilities: capabilities,
    contextWindow: input.contextWindow ?? null,
    maxOutputTokens: input.maxOutputTokens ?? null,
    inputPrice: null,
    outputPrice: null,
    artifactOutput,
    artifactOutputKnown: input.artifactOutputKnown ?? artifactOutput,
    artifactPersistenceExists: input.artifactPersistenceExists ?? !artifactOutput,
    authRequired: input.authRequired ?? providerTruth.modelsEndpointRequiresAuth,
    providerCapabilityKnown: input.providerCapabilityKnown ?? true,
    policyRestrictedByApp,
    policyBlockedReason: input.policyBlockedReason ?? providerTruth.policyBlockedReason ?? '',
    transportProfile: input.transportProfile,
    endpointFamily: input.endpointFamily ?? providerTruth.modelsEndpoint,
    streamingSupported: input.streamingSupported ?? false,
    toolCallingSupported: input.toolCallingSupported ?? false,
    functionCallingSupported: input.functionCallingSupported ?? false,
    batchSupported: input.batchSupported ?? false,
    webhookSupported: input.webhookSupported ?? false,
    endpointSource: input.endpointSource ?? providerTruth.modelsEndpoint,
    endpointShapeKnown: input.endpointShapeKnown ?? false,
    requestShapeKnown: input.requestShapeKnown ?? false,
    responseShapeKnown: input.responseShapeKnown ?? false,
    providerClientExists: input.providerClientExists ?? false,
    workerExecutorExists: input.workerExecutorExists ?? false,
    lastDiscoveredAt: input.lastDiscoveredAt ?? now,
    source: input.discoverySource ?? 'docs_fallback',
    liveDiscoverySkipped: input.liveDiscoverySkipped ?? !LIVE,
    rawMetadata: input.rawMetadata ?? {},
  }
  const blockers = input.executableBlockers ?? executableBlockers(model)
  const executableNow = input.executableNow ?? blockers.length === 0
  return {
    ...model,
    executableNow,
    executableBlockers: blockers,
    catalogueOnlyReason: input.catalogueOnlyReason ?? (executableNow ? '' : blockers.join(', ')),
    blockedReason: input.blockedReason ?? (executableNow ? '' : blockers.join(', ')),
  }
}

function textModel(provider, modelId, displayName, overrides = {}) {
  return discovered({
    provider,
    modelId,
    displayName,
    category: 'text',
    inferredCapabilities: overrides.inferredCapabilities ?? ['chat', 'reasoning', 'summarization', 'classification', 'extraction'],
    transportProfile: 'openai_chat_sse',
    endpointShapeKnown: true,
    requestShapeKnown: overrides.requestShapeKnown ?? false,
    responseShapeKnown: overrides.responseShapeKnown ?? false,
    streamingSupported: true,
    ...overrides,
  })
}

function genxModel(modelId, displayName, upstreamProvider, category, overrides = {}) {
  const defaultTransport = category === 'text'
    ? 'openai_chat_sse'
    : category === 'voice' || category === 'audio' || category === 'music'
      ? 'async_job_poll'
      : 'async_job_poll'
  return discovered({
    provider: 'genx',
    executionProvider: 'genx',
    upstreamProvider,
    modelId,
    displayName,
    category,
    providerCategory: category,
    rawProviderType: category,
    discoverySource: 'docs_fallback',
    endpointSource: 'GenX docs/static fallback /api/v1/models',
    endpointFamily: category === 'text' ? '/v1/chat/completions' : '/api/v1/generate + /api/v1/jobs/:id',
    transportProfile: defaultTransport,
    endpointShapeKnown: true,
    requestShapeKnown: false,
    responseShapeKnown: false,
    artifactPersistenceExists: !['image', 'video', 'voice', 'audio', 'music'].includes(category),
    ...overrides,
  })
}

const GENX_DOCS_FALLBACK_SPEC = [
  { upstreamProvider: 'openai', category: 'image', models: ['gpt-image-2'] },
  { upstreamProvider: 'openai', category: 'text', models: ['gpt-5', 'gpt-5-mini', 'gpt-5-nano', 'gpt-5.3-codex', 'gpt-5.4', 'gpt-5.4-mini', 'gpt-5.4-pro', 'gpt-5.5'] },
  { upstreamProvider: 'anthropic', category: 'text', transportProfile: 'anthropic_messages_sse', models: ['claude-haiku-4-5', 'claude-opus-4-6', 'claude-opus-4-7', 'claude-opus-4-8', 'claude-sonnet-4-6', 'claude-sonnet-5'] },
  { upstreamProvider: 'google', category: 'text', models: ['gemini-3-flash', 'gemini-3.1-flash-lite', 'gemini-3.1-pro'] },
  { upstreamProvider: 'google', category: 'audio', models: ['lyria-3-clip-preview', 'lyria-3-pro-preview'] },
  { upstreamProvider: 'google', category: 'image', models: ['nano-banana-2', 'nano-banana-pro'] },
  { upstreamProvider: 'google', category: 'video', models: ['veo-3.1', 'veo-3.1-fast'] },
  { upstreamProvider: 'xai', category: 'text', models: ['grok-4.2', 'grok-4.2-multi-agent', 'grok-4.2-reasoning', 'grok-4.3'] },
  { upstreamProvider: 'xai', category: 'image', models: ['grok-imagine'] },
  { upstreamProvider: 'xai', category: 'video', models: ['grok-imagine-video'] },
  { upstreamProvider: 'xai', category: 'voice', models: ['grok-tts'] },
  { upstreamProvider: 'recraft', category: 'image', models: ['recraft-v4.1', 'recraft-v4.1-pro', 'recraft-v4.1-pro-vector', 'recraft-v4.1-utility', 'recraft-v4.1-utility-pro', 'recraft-v4.1-utility-pro-vector', 'recraft-v4.1-utility-vector', 'recraft-v4.1-vector'] },
  { upstreamProvider: 'kling', category: 'avatar', models: ['kling-avatar-v2-pro'] },
  { upstreamProvider: 'kling', category: 'video', models: ['kling-v2.5-turbo', 'kling-v2.5-turbo-i2v', 'kling-v2.6-pro', 'kling-v2.6-pro-i2v', 'kling-v3-pro', 'kling-v3-pro-i2v'] },
  { upstreamProvider: 'bytedance', category: 'video', models: ['seedance-2', 'seedance-2-i2v', 'seedance-2-r2v', 'seedance-v1-fast', 'seedance-v1-fast-i2v'] },
  { upstreamProvider: 'pixverse', category: 'video', models: ['pixverse-v5.5', 'pixverse-v5.5-i2v', 'pixverse-v6', 'pixverse-v6-i2v'] },
  { upstreamProvider: 'deepgram', category: 'voice', models: ['aura-2'] },
  { upstreamProvider: 'genx', category: 'image', models: ['genxlm-pro-v1-img', 'genxlm-pro-v1-img-fast'] },
  { upstreamProvider: 'genx', category: 'text', models: ['genxlm-pro-v1-tl', 'genxlm-pro-v1-tr'] },
  { upstreamProvider: 'modal', category: 'voice', models: ['genxlm-voice-v1'] },
]

function genxDisplayName(modelId) {
  return modelId
    .split(/[-/]/)
    .map((part) => part.length <= 3 ? part.toUpperCase() : part[0].toUpperCase() + part.slice(1))
    .join(' ')
}

function genxOverrides(modelId, upstreamProvider, category, transportProfile) {
  const overrides = {
    transportProfile: transportProfile ?? (category === 'text' ? 'openai_chat_sse' : 'async_job_poll'),
  }

  if (modelId === 'seedance-v1-fast') {
    Object.assign(overrides, {
      requestShapeKnown: true,
      responseShapeKnown: true,
      providerClientExists: true,
      workerExecutorExists: true,
      artifactPersistenceExists: true,
    })
  }

  if (modelId === 'lyria-3-clip-preview' || modelId === 'lyria-3-pro-preview') {
    Object.assign(overrides, {
      inferredCapabilities: ['music_generation'],
      modalitiesIn: ['text', 'image'],
      modalitiesOut: ['audio', 'text'],
      providerCapabilityKnown: true,
      docsKnown: true,
      endpointShapeKnown: true,
      requestShapeKnown: false,
      responseShapeKnown: false,
      providerClientExists: false,
      workerExecutorExists: false,
      artifactPersistenceExists: false,
      catalogueOnlyReason: 'GenX music capability is known from official docs/catalogue. Execution is blocked until GenX music request/response/artifact client and worker executor are wired.',
    })
  }

  if (upstreamProvider === 'anthropic' && category === 'text') {
    Object.assign(overrides, {
      inferredCapabilities: ['chat', 'reasoning', 'code'],
    })
  }

  if (modelId.includes('codex')) {
    Object.assign(overrides, {
      inferredCapabilities: ['chat', 'reasoning', 'code', 'tool_use', 'structured_output'],
    })
  }

  return overrides
}

const GENX_DOCS_MODELS = GENX_DOCS_FALLBACK_SPEC.flatMap((group) =>
  group.models.map((modelId) =>
    genxModel(modelId, genxDisplayName(modelId), group.upstreamProvider, group.category, genxOverrides(modelId, group.upstreamProvider, group.category, group.transportProfile))
  )
)

const GROQ_DOCS_MODELS = [
  textModel('groq', 'llama-3.3-70b-versatile', 'Llama 3.3 70B Versatile', { discoverySource: 'static_verified', requestShapeKnown: true, responseShapeKnown: true, providerClientExists: true, workerExecutorExists: true }),
  textModel('groq', 'llama-3.1-8b-instant', 'Llama 3.1 8B Instant', { discoverySource: 'static_verified', requestShapeKnown: true, responseShapeKnown: true, providerClientExists: true, workerExecutorExists: true }),
  textModel('groq', 'openai/gpt-oss-120b', 'GPT OSS 120B', { inferredCapabilities: ['chat', 'reasoning', 'code'] }),
  textModel('groq', 'openai/gpt-oss-20b', 'GPT OSS 20B', { inferredCapabilities: ['chat', 'reasoning'] }),
  textModel('groq', 'meta-llama/llama-4-scout-17b-16e-instruct', 'Llama 4 Scout', { inferredCapabilities: ['chat', 'multimodal'] }),
  discovered({ provider: 'groq', modelId: 'whisper-large-v3', displayName: 'Whisper Large V3', category: 'audio', inferredCapabilities: ['stt'], transportProfile: 'openai_audio_transcription_multipart', endpointShapeKnown: true, requestShapeKnown: false, responseShapeKnown: false, providerClientExists: true, workerExecutorExists: false, endpointSource: 'Groq official docs fallback /openai/v1/audio/transcriptions', discoverySource: 'docs_fallback' }),
  discovered({ provider: 'groq', modelId: 'canopylabs/orpheus-v1-english', displayName: 'Orpheus V1 English', category: 'audio', inferredCapabilities: ['tts'], transportProfile: 'openai_audio_speech_binary', endpointShapeKnown: true, requestShapeKnown: false, responseShapeKnown: false, providerClientExists: true, workerExecutorExists: false, endpointSource: 'Groq official docs fallback /openai/v1/audio/speech', discoverySource: 'docs_fallback' }),
]

const TOGETHER_DOCS_MODELS = [
  textModel('together', 'meta-llama/Llama-3.3-70B-Instruct-Turbo', 'Llama 3.3 70B Instruct Turbo', { endpointSource: 'Together official docs fallback /models' }),
  textModel('together', 'Qwen/Qwen2.5-Coder-32B-Instruct', 'Qwen 2.5 Coder 32B', { inferredCapabilities: ['chat', 'code'], endpointSource: 'Together official docs fallback /models' }),
  discovered({ provider: 'together', modelId: 'black-forest-labs/FLUX.1-schnell', displayName: 'FLUX.1 Schnell', category: 'image', inferredCapabilities: ['image_generation'], transportProfile: 'native_inference_json', endpointShapeKnown: true, requestShapeKnown: true, responseShapeKnown: true, providerClientExists: true, workerExecutorExists: true, artifactPersistenceExists: true, batchSupported: true, endpointSource: 'Together image generation docs/static verified client', discoverySource: 'static_verified' }),
  discovered({ provider: 'together', modelId: 'black-forest-labs/FLUX.1-dev', displayName: 'FLUX.1 Dev', category: 'image', inferredCapabilities: ['image_generation'], transportProfile: 'native_inference_json', endpointShapeKnown: true, requestShapeKnown: false, responseShapeKnown: false, providerClientExists: true, workerExecutorExists: false, artifactPersistenceExists: true, endpointSource: 'Together official docs fallback /models' }),
  discovered({ provider: 'together', modelId: 'togethercomputer/m2-bert-80M-32k-retrieval', displayName: 'M2-BERT 80M 32K Retrieval', category: 'embedding', inferredCapabilities: ['embeddings'], transportProfile: 'native_inference_json', endpointShapeKnown: true, requestShapeKnown: false, responseShapeKnown: false, providerClientExists: true, workerExecutorExists: false, batchSupported: true, endpointSource: 'Together official docs fallback /models' }),
  discovered({ provider: 'together', modelId: 'BAAI/bge-reranker-base', displayName: 'BGE Reranker Base', category: 'rerank', inferredCapabilities: ['reranking'], transportProfile: 'native_inference_json', endpointShapeKnown: true, requestShapeKnown: false, responseShapeKnown: false, providerClientExists: false, workerExecutorExists: false, endpointSource: 'Together official docs fallback /models' }),
  discovered({ provider: 'together', modelId: 'together-stt-realtime', displayName: 'Together STT Realtime', category: 'audio', inferredCapabilities: ['stt'], transportProfile: 'websocket_realtime_audio', endpointShapeKnown: true, requestShapeKnown: false, responseShapeKnown: false, providerClientExists: false, workerExecutorExists: false, endpointSource: 'Together official docs fallback realtime STT' }),
  discovered({ provider: 'together', modelId: 'together-tts-streaming', displayName: 'Together TTS Streaming', category: 'audio', inferredCapabilities: ['tts'], transportProfile: 'http_audio_stream_sse', endpointShapeKnown: true, requestShapeKnown: false, responseShapeKnown: false, providerClientExists: false, workerExecutorExists: false, endpointSource: 'Together official docs fallback TTS streaming' }),
  discovered({ provider: 'together', modelId: 'together-video-async', displayName: 'Together Video Async', category: 'video', inferredCapabilities: ['video_generation'], transportProfile: 'async_job_poll', endpointShapeKnown: true, requestShapeKnown: false, responseShapeKnown: false, providerClientExists: false, workerExecutorExists: false, artifactPersistenceExists: false, endpointSource: 'Together official docs fallback video async' }),
]

const DEEPINFRA_DOCS_MODELS = [
  textModel('deepinfra', 'meta-llama/Meta-Llama-3.1-8B-Instruct', 'Meta Llama 3.1 8B Instruct', { discoverySource: 'static_verified', requestShapeKnown: true, responseShapeKnown: true, providerClientExists: true, workerExecutorExists: true, batchSupported: true, endpointSource: 'DeepInfra static verified OpenAI-compatible chat client' }),
  textModel('deepinfra', 'meta-llama/Llama-3.3-70B-Instruct', 'Llama 3.3 70B Instruct', { endpointSource: 'DeepInfra public /models/list docs fallback' }),
  textModel('deepinfra', 'Qwen/Qwen2.5-Coder-32B-Instruct', 'Qwen 2.5 Coder 32B', { inferredCapabilities: ['chat', 'code'], endpointSource: 'DeepInfra public /models/list docs fallback' }),
  discovered({ provider: 'deepinfra', modelId: 'BAAI/bge-large-en-v1.5', displayName: 'BGE Large EN', category: 'embedding', inferredCapabilities: ['embeddings'], transportProfile: 'native_inference_json', endpointShapeKnown: true, requestShapeKnown: false, responseShapeKnown: false, providerClientExists: false, workerExecutorExists: false, endpointSource: 'DeepInfra public /models/list docs fallback' }),
  discovered({ provider: 'deepinfra', modelId: 'BAAI/bge-reranker-large', displayName: 'BGE Reranker Large', category: 'rerank', inferredCapabilities: ['reranking'], transportProfile: 'native_inference_json', endpointShapeKnown: true, requestShapeKnown: false, responseShapeKnown: false, providerClientExists: false, workerExecutorExists: false, endpointSource: 'DeepInfra public /models/list docs fallback' }),
  discovered({ provider: 'deepinfra', modelId: 'stabilityai/sdxl-turbo', displayName: 'SDXL Turbo', category: 'image', inferredCapabilities: ['image_generation'], transportProfile: 'native_inference_binary', endpointShapeKnown: true, requestShapeKnown: false, responseShapeKnown: false, providerClientExists: false, workerExecutorExists: false, artifactPersistenceExists: false, endpointSource: 'DeepInfra public /models/list docs fallback' }),
  discovered({ provider: 'deepinfra', modelId: 'hexgrad/Kokoro-82M', displayName: 'Kokoro 82M', category: 'audio', inferredCapabilities: ['tts'], transportProfile: 'native_inference_binary', endpointShapeKnown: true, requestShapeKnown: false, responseShapeKnown: false, providerClientExists: false, workerExecutorExists: false, artifactPersistenceExists: false, endpointSource: 'DeepInfra public /models/list docs fallback' }),
  discovered({ provider: 'deepinfra', modelId: 'openai/whisper-large-v3', displayName: 'Whisper Large V3', category: 'audio', inferredCapabilities: ['stt'], transportProfile: 'native_inference_json', endpointShapeKnown: true, requestShapeKnown: false, responseShapeKnown: false, providerClientExists: false, workerExecutorExists: false, endpointSource: 'DeepInfra public /models/list docs fallback' }),
  discovered({ provider: 'deepinfra', modelId: 'Wan-AI/Wan2.1-T2V-14B', displayName: 'Wan 2.1 T2V 14B', category: 'video', inferredCapabilities: ['video_generation'], transportProfile: 'native_inference_async_webhook', endpointShapeKnown: true, requestShapeKnown: false, responseShapeKnown: false, providerClientExists: false, workerExecutorExists: false, artifactPersistenceExists: false, endpointSource: 'DeepInfra public /models/list docs fallback' }),
  discovered({ provider: 'deepinfra', modelId: 'facebook/musicgen-large', displayName: 'MusicGen Large', category: 'music', inferredCapabilities: ['music_generation'], transportProfile: 'native_inference_json', endpointShapeKnown: true, requestShapeKnown: false, responseShapeKnown: false, providerClientExists: false, workerExecutorExists: false, artifactPersistenceExists: false, endpointSource: 'DeepInfra public /models/list docs fallback' }),
]

const MIMO_DOCS_MODELS = [
  discovered({ provider: 'mimo', modelId: 'mimo-v2.5-pro', displayName: 'MiMo V2.5 Pro', category: 'text', inferredCapabilities: ['chat', 'reasoning', 'code', 'tool_use', 'structured_output', 'multimodal'], transportProfile: 'docs_only_policy_restricted', endpointShapeKnown: true, requestShapeKnown: true, responseShapeKnown: true, providerClientExists: false, workerExecutorExists: false, artifactPersistenceExists: true, endpointSource: 'MiMo official docs fallback only', policyRestrictedByApp: true, policyBlockedReason: 'coding_agent_only_not_backend_runtime' }),
  discovered({ provider: 'mimo', modelId: 'mimo-v2.5', displayName: 'MiMo V2.5', category: 'text', inferredCapabilities: ['chat', 'code', 'multimodal'], transportProfile: 'docs_only_policy_restricted', endpointShapeKnown: true, requestShapeKnown: true, responseShapeKnown: true, providerClientExists: false, workerExecutorExists: false, endpointSource: 'MiMo official docs fallback only', policyRestrictedByApp: true, policyBlockedReason: 'coding_agent_only_not_backend_runtime' }),
  discovered({ provider: 'mimo', modelId: 'mimo-v2.5-asr', displayName: 'MiMo V2.5 ASR', category: 'audio', inferredCapabilities: ['stt'], transportProfile: 'docs_only_policy_restricted', endpointShapeKnown: true, requestShapeKnown: true, responseShapeKnown: true, providerClientExists: false, workerExecutorExists: false, endpointSource: 'MiMo official docs fallback only', policyRestrictedByApp: true, policyBlockedReason: 'coding_agent_only_not_backend_runtime' }),
  discovered({ provider: 'mimo', modelId: 'mimo-v2.5-tts', displayName: 'MiMo V2.5 TTS', category: 'audio', inferredCapabilities: ['tts'], transportProfile: 'docs_only_policy_restricted', endpointShapeKnown: true, requestShapeKnown: true, responseShapeKnown: true, providerClientExists: false, workerExecutorExists: false, artifactPersistenceExists: false, endpointSource: 'MiMo official docs fallback only', policyRestrictedByApp: true, policyBlockedReason: 'coding_agent_only_not_backend_runtime' }),
  discovered({ provider: 'mimo', modelId: 'mimo-v2.5-tts-voiceclone', displayName: 'MiMo V2.5 TTS Voiceclone', category: 'audio', inferredCapabilities: ['tts'], transportProfile: 'docs_only_policy_restricted', endpointShapeKnown: true, requestShapeKnown: true, responseShapeKnown: true, providerClientExists: false, workerExecutorExists: false, artifactPersistenceExists: false, endpointSource: 'MiMo official docs fallback only', policyRestrictedByApp: true, policyBlockedReason: 'coding_agent_only_not_backend_runtime' }),
  discovered({ provider: 'mimo', modelId: 'mimo-v2.5-tts-voicedesign', displayName: 'MiMo V2.5 TTS Voice Design', category: 'audio', inferredCapabilities: ['tts'], transportProfile: 'docs_only_policy_restricted', endpointShapeKnown: true, requestShapeKnown: true, responseShapeKnown: true, providerClientExists: false, workerExecutorExists: false, artifactPersistenceExists: false, endpointSource: 'MiMo official docs fallback only', policyRestrictedByApp: true, policyBlockedReason: 'coding_agent_only_not_backend_runtime' }),
]

const DOCS_FALLBACK_MODELS = [
  ...GENX_DOCS_MODELS,
  ...GROQ_DOCS_MODELS,
  ...TOGETHER_DOCS_MODELS,
  ...DEEPINFRA_DOCS_MODELS,
  ...MIMO_DOCS_MODELS,
]

function sanitizeError(error) {
  return String(error instanceof Error ? error.message : error)
    .replace(/Bearer\s+[A-Za-z0-9._-]+/g, 'Bearer [redacted]')
    .slice(0, 600)
}

async function fetchModelList(url, apiKey) {
  const headers = { Accept: 'application/json' }
  if (apiKey) headers.Authorization = `Bearer ${apiKey}`
  const response = await fetch(url, { headers })
  const text = await response.text()
  if (!response.ok) {
    throw new Error(`model-list returned ${response.status}: ${text.slice(0, 240)}`)
  }
  const payload = text ? JSON.parse(text) : null
  if (Array.isArray(payload)) return payload
  for (const key of ['data', 'models', 'items', 'results']) {
    if (Array.isArray(payload?.[key])) return payload[key]
  }
  return []
}

function modelIdFromRecord(record) {
  return String(record?.id ?? record?.model ?? record?.slug ?? record?.name ?? '').trim()
}

function categoryFromRecord(record) {
  return String(record?.category ?? record?.type ?? record?.task ?? record?.pipeline_tag ?? record?.display_type ?? record?.object ?? '').trim()
}

function liveModel(provider, record) {
  const modelId = modelIdFromRecord(record)
  const category = categoryFromRecord(record)
  const displayName = String(record?.display_name ?? record?.displayName ?? record?.name ?? modelId)
  const providerDocs = DOCS_FALLBACK_MODELS.find((model) => model.provider === provider && model.modelId === modelId)
  const base = providerDocs ?? discovered({
    provider,
    modelId,
    displayName,
    category,
    discoverySource: 'live_endpoint',
    docsKnown: false,
    liveDiscovered: true,
    endpointSource: PROVIDER_TRUTH[provider].modelsEndpoint,
    transportProfile: provider === 'genx' ? (category === 'text' ? 'openai_chat_sse' : 'async_job_poll') : provider === 'deepinfra' ? 'native_inference_json' : 'openai_chat_sse',
    endpointShapeKnown: true,
  })
  return {
    ...base,
    displayName,
    discoverySource: 'live_endpoint',
    source: 'live_endpoint',
    liveDiscovered: true,
    liveDiscoverySkipped: false,
    lastDiscoveredAt: now,
    rawMetadata: {},
  }
}

function genxModelsEndpoint(baseUrl, category) {
  const url = new URL('/api/v1/models', baseUrl)
  if (category) url.searchParams.set('category', category)
  return url.toString()
}

async function liveDiscoverProvider(provider) {
  const truth = PROVIDER_TRUTH[provider]
  const fallbackModels = DOCS_FALLBACK_MODELS.filter((model) => model.provider === provider)
  if (provider === 'mimo') {
    return {
      ...truth,
      mode: LIVE ? 'live_model_list' : 'safe_static',
      source: 'docs_fallback',
      models: fallbackModels,
      totalDiscovered: fallbackModels.length,
      liveDiscoveryAttempted: false,
      liveDiscoverySucceeded: false,
      liveDiscoverySkipped: true,
      liveDiscoverySkipReason: 'coding_agent_only_not_backend_runtime',
      docsFallbackUsed: true,
      providerUniverseKnown: false,
      providerUniversePartiallyKnown: true,
      publicDocsUniverseKnown: true,
      authenticatedUniverseKnown: false,
      endpointSource: truth.modelsEndpoint,
      error: null,
      returnedModelCount: 0,
      staticFallbackCount: fallbackModels.length,
      docsFallbackCount: fallbackModels.length,
      effectiveCatalogueCount: fallbackModels.length,
      discoveredAt: now,
      notes: ['MiMo is docs-known but policy-disabled for backend runtime. No MiMo endpoint is called.'],
    }
  }
  if (!LIVE) {
    return {
      ...truth,
      apiKeyPresent: Boolean(truth.apiKeyEnvName && process.env[truth.apiKeyEnvName]),
      mode: 'safe_static',
      source: 'docs_fallback',
      models: fallbackModels,
      totalDiscovered: fallbackModels.length,
      liveDiscoveryAttempted: false,
      liveDiscoverySucceeded: false,
      liveDiscoverySkipped: true,
      liveDiscoverySkipReason: 'safe_static_mode',
      docsFallbackUsed: true,
      providerUniverseKnown: false,
      providerUniversePartiallyKnown: true,
      publicDocsUniverseKnown: true,
      authenticatedUniverseKnown: false,
      endpointSource: truth.modelsEndpoint,
      error: null,
      returnedModelCount: 0,
      staticFallbackCount: fallbackModels.length,
      docsFallbackCount: fallbackModels.length,
      effectiveCatalogueCount: fallbackModels.length,
      discoveredAt: now,
      notes: ['Safe discovery uses docs/static fallback only; no authenticated provider calls were made.'],
    }
  }

  const apiKey = truth.apiKeyEnvName ? process.env[truth.apiKeyEnvName] : ''
  if (truth.modelsEndpointRequiresAuth && !apiKey) {
    return {
      ...truth,
      apiKeyPresent: false,
      mode: 'live_model_list',
      source: 'docs_fallback',
      models: fallbackModels,
      totalDiscovered: fallbackModels.length,
      liveDiscoveryAttempted: false,
      liveDiscoverySucceeded: false,
      liveDiscoverySkipped: true,
      liveDiscoverySkipReason: `${truth.apiKeyEnvName}_missing`,
      docsFallbackUsed: true,
      providerUniverseKnown: false,
      providerUniversePartiallyKnown: true,
      publicDocsUniverseKnown: true,
      authenticatedUniverseKnown: false,
      endpointSource: truth.modelsEndpoint,
      error: null,
      returnedModelCount: 0,
      staticFallbackCount: fallbackModels.length,
      docsFallbackCount: fallbackModels.length,
      effectiveCatalogueCount: fallbackModels.length,
      discoveredAt: now,
      notes: [`${provider} live discovery skipped because ${truth.apiKeyEnvName} is missing. Docs fallback remains partial truth.`],
    }
  }

  try {
    let records = []
    if (provider === 'genx') {
      const byId = new Map()
      for (const category of ['', 'text', 'image', 'video', 'voice', 'audio']) {
        const endpoint = genxModelsEndpoint(truth.baseUrl, category)
        for (const record of await fetchModelList(endpoint, apiKey)) {
          const id = modelIdFromRecord(record)
          if (id) byId.set(id, { ...byId.get(id), ...record, category: record.category ?? category })
        }
      }
      records = [...byId.values()]
    } else {
      records = await fetchModelList(truth.modelsEndpoint, apiKey)
    }
    const liveModels = records.map((record) => liveModel(provider, record)).filter((model) => model.modelId)
    const merged = [...new Map([...liveModels, ...fallbackModels].map((model) => [`${model.provider}:${model.modelId}`, model])).values()]
    const liveDiscoverySucceeded = liveModels.length > 0
    return {
      ...truth,
      apiKeyPresent: Boolean(apiKey),
      mode: 'live_model_list',
      source: liveDiscoverySucceeded ? 'live_endpoint' : 'docs_fallback',
      models: merged,
      totalDiscovered: merged.length,
      liveDiscoveryAttempted: true,
      liveDiscoverySucceeded,
      liveDiscoverySkipped: false,
      liveDiscoverySkipReason: null,
      docsFallbackUsed: fallbackModels.length > 0,
      providerUniverseKnown: liveDiscoverySucceeded,
      providerUniversePartiallyKnown: !liveDiscoverySucceeded,
      publicDocsUniverseKnown: true,
      authenticatedUniverseKnown: liveDiscoverySucceeded,
      endpointSource: truth.modelsEndpoint,
      error: liveDiscoverySucceeded ? null : 'model-list returned zero usable models',
      returnedModelCount: liveModels.length,
      staticFallbackCount: fallbackModels.length,
      docsFallbackCount: fallbackModels.length,
      effectiveCatalogueCount: merged.length,
      discoveredAt: now,
      notes: ['Live discovery called provider model-list endpoints only. No generation calls or artifacts were created.'],
    }
  } catch (error) {
    return {
      ...truth,
      apiKeyPresent: Boolean(apiKey),
      mode: 'live_model_list',
      source: 'docs_fallback',
      models: fallbackModels,
      totalDiscovered: fallbackModels.length,
      liveDiscoveryAttempted: true,
      liveDiscoverySucceeded: false,
      liveDiscoverySkipped: false,
      liveDiscoverySkipReason: null,
      docsFallbackUsed: true,
      providerUniverseKnown: false,
      providerUniversePartiallyKnown: true,
      publicDocsUniverseKnown: true,
      authenticatedUniverseKnown: false,
      endpointSource: truth.modelsEndpoint,
      error: sanitizeError(error),
      returnedModelCount: 0,
      staticFallbackCount: fallbackModels.length,
      docsFallbackCount: fallbackModels.length,
      effectiveCatalogueCount: fallbackModels.length,
      discoveredAt: now,
      notes: ['Live model-list discovery failed safely; docs fallback remains partial truth.'],
    }
  }
}

const providerDiscoveryStatus = await Promise.all(APPROVED_PROVIDERS.map(liveDiscoverProvider))

if (STRICT) {
  const strictFailures = providerDiscoveryStatus
    .filter((status) => RUNTIME_PROVIDERS.includes(status.provider))
    .filter((status) => !status.liveDiscoverySucceeded)
  if (strictFailures.length > 0) {
    console.error(`Strict live discovery failed: ${strictFailures.map((status) => `${status.provider}:${status.liveDiscoverySkipReason ?? status.error ?? 'not_live_discovered'}`).join(', ')}`)
    process.exitCode = 1
  }
}

const models = providerDiscoveryStatus.flatMap((status) => status.models)
const countsByProvider = Object.fromEntries(APPROVED_PROVIDERS.map((provider) => [provider, models.filter((model) => model.provider === provider).length]))
const capabilityCoverage = {}
for (const model of models) {
  for (const capability of model.inferredCapabilities) {
    capabilityCoverage[capability] ??= { total: 0, executable: 0, docsKnown: 0, liveDiscovered: 0, providers: [] }
    capabilityCoverage[capability].total += 1
    if (model.executableNow) capabilityCoverage[capability].executable += 1
    if (model.docsKnown) capabilityCoverage[capability].docsKnown += 1
    if (model.liveDiscovered) capabilityCoverage[capability].liveDiscovered += 1
    if (!capabilityCoverage[capability].providers.includes(model.provider)) capabilityCoverage[capability].providers.push(model.provider)
  }
}

const genxMusicModels = models.filter((model) => model.provider === 'genx' && model.inferredCapabilities.includes('music_generation'))
const lyriaExactMatches = genxMusicModels.filter((model) => /^lyria-3-(clip|pro)-preview$/.test(model.modelId)).map((model) => model.modelId)
const runtimeStatuses = providerDiscoveryStatus.filter((status) => RUNTIME_PROVIDERS.includes(status.provider))
const providersWithFullUniverseKnown = runtimeStatuses.filter((status) => status.providerUniverseKnown).map((status) => status.provider)
const providersPartiallyKnown = providerDiscoveryStatus.filter((status) => status.providerUniversePartiallyKnown).map((status) => status.provider)
const providersUsingDocsFallback = providerDiscoveryStatus.filter((status) => status.docsFallbackUsed).map((status) => status.provider)
const providersSkipped = providerDiscoveryStatus.filter((status) => status.liveDiscoverySkipped).map((status) => status.provider)
const providersFailed = providerDiscoveryStatus.filter((status) => status.error).map((status) => status.provider)
const transportProfilesPresent = [...new Set(models.map((model) => model.transportProfile))].sort()
const policyRestrictedModels = models.filter((model) => model.policyRestrictedByApp)
const executableModels = models.filter((model) => model.executableNow)
const knownButBlockedModels = models.filter((model) => !model.executableNow)
const musicExecutionReady = genxMusicModels.some((model) => model.executableNow)

const genxMusicDiscovery = {
  genxMusicModelsDiscovered: genxMusicModels.map((model) => model.modelId),
  lyriaClipDiscovered: genxMusicModels.some((model) => model.modelId === 'lyria-3-clip-preview'),
  lyriaProDiscovered: genxMusicModels.some((model) => model.modelId === 'lyria-3-pro-preview'),
  lyriaExactMatches,
  genxMusicTransportProfile: [...new Set(genxMusicModels.map((model) => model.transportProfile))],
  genxMusicEndpointFamily: [...new Set(genxMusicModels.map((model) => model.endpointFamily))],
  genxMusicExecutorReady: musicExecutionReady,
  genxMusicBlockers: [...new Set(genxMusicModels.flatMap((model) => model.executableBlockers))],
}

const report = {
  discoveryMode: LIVE ? 'live_model_list' : 'safe_static',
  mode: LIVE ? 'live_model_list' : 'safe_static',
  strictMode: STRICT,
  generatedAt: now,
  approvedProviders: APPROVED_PROVIDERS,
  runtimeExecutableProviders: RUNTIME_PROVIDERS,
  liveDiscoveryAttempted: LIVE,
  liveDiscoverySkipped: !LIVE || providerDiscoveryStatus.some((status) => status.liveDiscoverySkipped),
  providerDiscoveryStatus: providerDiscoveryStatus.map((status) => ({ ...status, models: undefined })),
  genxMusicDiscovery,
  fullProviderModelUniverseKnown: runtimeStatuses.every((status) => status.providerUniverseKnown),
  liveDiscoveryPartial: runtimeStatuses.some((status) => !status.providerUniverseKnown),
  providersWithFullUniverseKnown,
  providersPartiallyKnown,
  providersUsingDocsFallback,
  providersSkipped,
  providersFailed,
  staticFallbackUsedByProvider: Object.fromEntries(providerDiscoveryStatus.map((status) => [status.provider, status.staticFallbackCount ?? 0])),
  totalLiveDiscoveredModels: models.filter((model) => model.liveDiscovered).length,
  totalDocsFallbackModels: models.filter((model) => model.docsKnown).length,
  totalEffectiveCatalogueModels: models.length,
  modelsExecutableNow: executableModels.length,
  modelsKnownButBlocked: knownButBlockedModels.length,
  policyRestrictedModels: policyRestrictedModels.length,
  transportProfilesPresent,
  genxMusicCapabilityKnown: genxMusicModels.length > 0,
  genxMusicExecutionReady: musicExecutionReady,
  mimoCapabilityKnown: models.some((model) => model.provider === 'mimo' && model.docsKnown),
  mimoPolicyRestricted: models.filter((model) => model.provider === 'mimo').every((model) => model.policyRestrictedByApp && !model.executableNow),
  countsByProvider,
  totals: {
    discovered: models.length,
    executableNow: executableModels.length,
    catalogueOnly: knownButBlockedModels.length,
    missingClient: models.filter((model) => !model.providerClientExists).length,
    missingExecutor: models.filter((model) => !model.workerExecutorExists).length,
  },
  capabilityCoverage,
  musicReadiness: {
    discoveredMusicModels: models.filter((model) => model.inferredCapabilities.includes('music_generation')).length,
    genxMusicModels: genxMusicModels.map((model) => model.modelId),
    togetherMusicModels: models.filter((model) => model.provider === 'together' && model.inferredCapabilities.includes('music_generation')).map((model) => model.modelId),
    deepinfraMusicModels: models.filter((model) => model.provider === 'deepinfra' && model.inferredCapabilities.includes('music_generation')).map((model) => model.modelId),
    groqMusicModels: models.filter((model) => model.provider === 'groq' && model.inferredCapabilities.includes('music_generation')).map((model) => model.modelId),
    lyriaLikeModels: genxMusicModels.filter((model) => /lyria/i.test(model.modelId)).map((model) => `${model.provider}/${model.modelId}`),
    endpointShapeKnown: genxMusicModels.some((model) => model.endpointShapeKnown),
    providerClientExists: genxMusicModels.some((model) => model.providerClientExists),
    workerExecutorExists: genxMusicModels.some((model) => model.workerExecutorExists),
    executableNow: musicExecutionReady,
  },
}

fs.writeFileSync(path.join(ROOT, 'BUILD_MODEL_DISCOVERY_REPORT.json'), `${JSON.stringify(report, null, 2)}\n`)
fs.writeFileSync(path.join(ROOT, 'MODEL_CATALOGUE_DISCOVERED.json'), `${JSON.stringify(models, null, 2)}\n`)
fs.writeFileSync(path.join(ROOT, 'packages/core/src/generated/provider-model-catalogue.generated.json'), `${JSON.stringify(models, null, 2)}\n`)

console.log('Provider model discovery complete')
console.log(`Mode: ${report.discoveryMode}${STRICT ? ' strict' : ''}`)
console.log(`Total effective catalogue models: ${report.totalEffectiveCatalogueModels}`)
console.log(`Docs-known models: ${report.totalDocsFallbackModels}`)
console.log(`Live-discovered models: ${report.totalLiveDiscoveredModels}`)
console.log(`Executable now: ${report.modelsExecutableNow}`)
console.log(`Catalogue-only/blocked: ${report.modelsKnownButBlocked}`)
console.log(`Policy-restricted models: ${report.policyRestrictedModels}`)
console.log(`GenX Lyria/music capability known: ${report.genxMusicCapabilityKnown}`)
console.log(`GenX music execution ready: ${report.genxMusicExecutionReady}`)
console.log(`MiMo policy restricted: ${report.mimoPolicyRestricted}`)
if (LIVE && report.liveDiscoveryPartial) {
  console.log('Live discovery is partial; docs fallback remains in use for skipped or failed providers.')
}
