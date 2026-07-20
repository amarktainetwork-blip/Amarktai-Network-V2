import { getGenxBaseUrl, type CapabilityKey, type ProviderDiscoveryResult, type TransportProfile } from '@amarktai/core'
import { discoveryTimestamp, failedLiveResult, fetchModelList, liveResult, modelFromProviderRecord, skippedResult, stringField, type DiscoveryAdapterOptions } from './common.js'

const GENX_MODEL_CATEGORIES = ['', 'text', 'image', 'video', 'avatar', 'transcription', 'stt', 'voice', 'audio', 'music', 'multimodal']

function genxModelsEndpoint(baseUrl: string, category?: string): string {
  const url = new URL('/api/v1/models', baseUrl)
  if (category) url.searchParams.set('category', category)
  return url.toString()
}

function classifyGenx(record: Record<string, unknown>, modelId: string, rawType: string): {
  taskType: string; capabilities: CapabilityKey[]; inputs: string[]; outputs: string[]; transport: TransportProfile; endpointFamily: string
} {
  const advertised = [record.task, record.tasks, record.capabilities, record.modalities, record.description]
    .flatMap((value) => Array.isArray(value) ? value : [value]).filter((value): value is string => typeof value === 'string').join(' ')
  const text = `${modelId} ${rawType} ${advertised}`.toLowerCase()
  if (/transcri|speech-to-text|automatic-speech-recognition|\bstt\b|whisper/.test(text)) return { taskType: 'transcription', capabilities: ['stt'], inputs: ['audio'], outputs: ['text'], transport: 'async_job_poll', endpointFamily: 'genx_generation_v1' }
  if (/image-to-video|(^|[-_/])i2v($|[-_/])/.test(text)) return { taskType: 'image-to-video', capabilities: ['image_to_video'], inputs: ['text', 'image'], outputs: ['video'], transport: 'async_job_poll', endpointFamily: 'genx_generation_v1' }
  if (/video-to-video|reference-video|(^|[-_/])r2v($|[-_/])/.test(text)) return { taskType: 'video-to-video', capabilities: ['video_to_video'], inputs: ['text', 'video'], outputs: ['video'], transport: 'async_job_poll', endpointFamily: 'genx_generation_v1' }
  if (/text-to-video|video|seedance|veo|wan/.test(text)) return { taskType: 'text-to-video', capabilities: ['video_generation'], inputs: ['text'], outputs: ['video'], transport: 'async_job_poll', endpointFamily: 'genx_generation_v1' }
  if (/music|lyria|song|audio-generation|text-to-music/.test(text)) return { taskType: /song|vocal|lyrics/.test(text) ? 'song' : 'music', capabilities: /song|vocal|lyrics/.test(text) ? ['song_generation'] : ['music_generation'], inputs: ['text'], outputs: ['audio'], transport: 'async_job_poll', endpointFamily: 'genx_generation_v1' }
  if (/text-to-speech|\btts\b|voice|speech-synthesis/.test(text)) return { taskType: 'text-to-speech', capabilities: ['tts'], inputs: ['text'], outputs: ['audio'], transport: 'async_job_poll', endpointFamily: 'genx_generation_v1' }
  if (/avatar/.test(text)) return { taskType: 'avatar', capabilities: ['avatar_generation'], inputs: ['text', 'image', 'audio'], outputs: ['video'], transport: 'async_job_poll', endpointFamily: 'genx_generation_v1' }
  if (/image-edit|inpaint|image-to-image/.test(text)) return { taskType: 'image-to-image', capabilities: ['image_edit', 'image_to_image'], inputs: ['text', 'image'], outputs: ['image'], transport: 'async_job_poll', endpointFamily: 'genx_generation_v1' }
  if (/image/.test(text)) return { taskType: 'text-to-image', capabilities: ['image_generation'], inputs: ['text'], outputs: ['image'], transport: 'async_job_poll', endpointFamily: 'genx_generation_v1' }
  if (/chat|text|reasoning|code/.test(text)) return { taskType: 'text-generation', capabilities: ['chat', 'streaming_chat', 'reasoning', 'code', 'summarization', 'translation', 'question_answering', 'classification', 'extraction', 'structured_output'], inputs: ['text'], outputs: ['text'], transport: 'openai_chat_sse', endpointFamily: 'openai_chat' }
  return { taskType: 'contract-unknown', capabilities: [], inputs: [], outputs: [], transport: 'native_inference_json', endpointFamily: 'contract_unknown' }
}

export async function discoverGenXProviderModels(options: DiscoveryAdapterOptions = {}): Promise<ProviderDiscoveryResult> {
  const timestamp = discoveryTimestamp(options)
  const baseUrl = options.baseUrl || getGenxBaseUrl()
  const endpointSource = `${new URL('/api/v1/models', baseUrl).toString()}?category=*`
  const staticModels = [
    modelFromProviderRecord({ provider: 'genx', executionProvider: 'genx', upstreamProvider: 'bytedance', modelId: 'seedance-v1-fast', displayName: 'Seedance V1 Fast', rawProviderType: 'text-to-video', inferredCapabilities: ['video_generation', 'video_to_video'], category: 'video', providerCategory: 'video', modalitiesIn: ['text', 'video'], modalitiesOut: ['video'], endpointSource: 'repo_static_genx_client', endpointFamily: 'genx_generation_v1', lastDiscoveredAt: timestamp, source: 'static_verified', discoverySource: 'static_verified', providerClientExists: true, workerExecutorExists: true, requestShapeKnown: true, responseShapeKnown: true, artifactPersistenceExists: true, transportProfile: 'async_job_poll' }),
    modelFromProviderRecord({ provider: 'genx', executionProvider: 'genx', upstreamProvider: 'bytedance', modelId: 'seedance-v1-fast-i2v', displayName: 'Seedance V1 Fast I2V', rawProviderType: 'image-to-video', inferredCapabilities: ['image_to_video'], category: 'video', providerCategory: 'image-to-video', modalitiesIn: ['text', 'image'], modalitiesOut: ['video'], endpointSource: 'repo_static_genx_client', endpointFamily: 'genx_generation_v1', lastDiscoveredAt: timestamp, source: 'static_verified', discoverySource: 'static_verified', providerClientExists: true, workerExecutorExists: true, requestShapeKnown: true, responseShapeKnown: true, artifactPersistenceExists: true, transportProfile: 'async_job_poll' }),
    modelFromProviderRecord({ provider: 'genx', executionProvider: 'genx', upstreamProvider: 'google', modelId: 'veo-3.1', displayName: 'Veo 3.1', rawProviderType: 'video', category: 'video', endpointSource: 'GenX official docs fallback /api/v1/models', endpointFamily: '/api/v1/generate + /api/v1/jobs/:id', lastDiscoveredAt: timestamp, source: 'docs_fallback', providerClientExists: false, workerExecutorExists: false, endpointShapeKnown: true, requestShapeKnown: false, responseShapeKnown: false, artifactPersistenceExists: false, transportProfile: 'async_job_poll' }),
    modelFromProviderRecord({ provider: 'genx', executionProvider: 'genx', upstreamProvider: 'xai', modelId: 'grok-imagine-video', displayName: 'Grok Imagine Video', rawProviderType: 'video', category: 'video', endpointSource: 'GenX official docs fallback /api/v1/models', endpointFamily: '/api/v1/generate + /api/v1/jobs/:id', lastDiscoveredAt: timestamp, source: 'docs_fallback', providerClientExists: false, workerExecutorExists: false, endpointShapeKnown: true, requestShapeKnown: false, responseShapeKnown: false, artifactPersistenceExists: false, transportProfile: 'async_job_poll' }),
    modelFromProviderRecord({ provider: 'genx', executionProvider: 'genx', upstreamProvider: 'genx', modelId: 'genx-image-v1', displayName: 'GenX Image V1', rawProviderType: 'image', category: 'image', endpointSource: 'GenX official docs fallback /api/v1/models', endpointFamily: '/api/v1/generate + /api/v1/jobs/:id', lastDiscoveredAt: timestamp, source: 'docs_fallback', providerClientExists: false, workerExecutorExists: false, endpointShapeKnown: true, requestShapeKnown: false, responseShapeKnown: false, artifactPersistenceExists: false, transportProfile: 'async_job_poll' }),
    modelFromProviderRecord({ provider: 'genx', executionProvider: 'genx', upstreamProvider: 'google', modelId: 'lyria-3-clip-preview', displayName: 'Lyria 3 Clip Preview', rawProviderType: 'music', inferredCapabilities: ['music_generation'], category: 'music', modalitiesIn: ['text'], modalitiesOut: ['audio'], endpointSource: 'GenX official docs fallback /api/v1/models', endpointFamily: 'genx_generation_v1', lastDiscoveredAt: timestamp, source: 'docs_fallback', providerClientExists: true, workerExecutorExists: true, endpointShapeKnown: true, requestShapeKnown: true, responseShapeKnown: true, artifactPersistenceExists: true, transportProfile: 'async_job_poll', catalogueOnlyReason: '' }),
    modelFromProviderRecord({ provider: 'genx', executionProvider: 'genx', upstreamProvider: 'google', modelId: 'lyria-3-pro-preview', displayName: 'Lyria 3 Pro Preview', rawProviderType: 'music', inferredCapabilities: ['music_generation'], category: 'music', modalitiesIn: ['text'], modalitiesOut: ['audio'], endpointSource: 'GenX official docs fallback /api/v1/models', endpointFamily: 'genx_generation_v1', lastDiscoveredAt: timestamp, source: 'docs_fallback', providerClientExists: true, workerExecutorExists: true, endpointShapeKnown: true, requestShapeKnown: true, responseShapeKnown: true, artifactPersistenceExists: true, transportProfile: 'async_job_poll', catalogueOnlyReason: '' }),
  ]

  if (!options.live || !options.apiKey) {
    return skippedResult('genx', endpointSource, staticModels, ['GenX safe discovery inspects repo/client truth only. Live mode sweeps /api/v1/models categories and checks for music/Lyria-like models without generation calls.'])
  }

  try {
    const byId = new Map<string, Record<string, unknown>>()
    for (const category of GENX_MODEL_CATEGORIES) {
      const records = await fetchModelList(genxModelsEndpoint(baseUrl, category), options.apiKey)
      for (const item of records) {
        if (typeof item !== 'object' || item === null) continue
        const record = item as Record<string, unknown>
        const modelId = stringField(record, ['id', 'model', 'model_id', 'slug', 'name'])
        if (!modelId) continue
        byId.set(modelId, { ...byId.get(modelId), ...record, category: record.category ?? category })
      }
    }

    const models = [...byId.values()].map((record) => {
      const modelId = stringField(record, ['id', 'model', 'model_id', 'slug', 'name'])
      const rawType = stringField(record, ['category', 'type', 'kind'])
      const classification = classifyGenx(record, modelId, rawType)
      const contractKnown = classification.capabilities.length > 0
      return modelFromProviderRecord({
        provider: 'genx',
        modelId,
        displayName: stringField(record, ['name', 'displayName', 'id'], modelId),
        rawProviderType: classification.taskType,
        inferredCapabilities: classification.capabilities,
        category: 'video' === rawType.toLowerCase() || classification.outputs.includes('video') ? 'video' : classification.taskType,
        providerCategory: classification.taskType,
        modalitiesIn: classification.inputs,
        modalitiesOut: classification.outputs,
        endpointSource,
        lastDiscoveredAt: timestamp,
        source: 'live_endpoint',
        discoverySource: 'live_endpoint',
        upstreamProvider: stringField(record, ['provider', 'upstreamProvider', 'upstream_provider'], 'genx'),
        endpointFamily: classification.endpointFamily,
        providerClientExists: contractKnown,
        workerExecutorExists: contractKnown,
        endpointShapeKnown: contractKnown,
        requestShapeKnown: contractKnown,
        responseShapeKnown: contractKnown,
        artifactPersistenceExists: contractKnown,
        streamingSupported: classification.transport === 'openai_chat_sse',
        transportProfile: classification.transport,
        rawMetadata: { ...record, taskType: classification.taskType, capabilities: classification.capabilities, modalitiesIn: classification.inputs, modalitiesOut: classification.outputs, endpointFamily: classification.endpointFamily, transportProfile: classification.transport, endpointShapeKnown: contractKnown, requestShapeKnown: contractKnown, responseShapeKnown: contractKnown, providerClientExists: contractKnown, workerExecutorExists: contractKnown, streamingSupported: classification.transport === 'openai_chat_sse' },
      })
    })

    return liveResult('genx', endpointSource, 'live_model_list', models, ['GenX live discovery swept model-list categories only. Music/Lyria-like models use the existing GenX music client, worker executor, and artifact path when configured; this does not prove live completion.'])
  } catch (error) {
    return failedLiveResult('genx', endpointSource, error instanceof Error ? error.message : 'GenX discovery failed', [])
  }
}
