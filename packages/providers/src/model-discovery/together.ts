import type { ProviderDiscoveryResult } from '@amarktai/core'
import { discoveryTimestamp, failedLiveResult, fetchModelList, liveResult, modelFromProviderRecord, skippedResult, stringField, numberField, type DiscoveryAdapterOptions } from './common.js'

const TOGETHER_LEGACY_MODELS_ENDPOINT = 'https://api.together.ai/models'
const TOGETHER_MODELS_ENDPOINT = 'https://api.together.ai/v1/models'

function togetherCapabilities(modelId: string, rawType: string): Array<'chat' | 'reasoning' | 'summarization' | 'classification' | 'extraction' | 'code' | 'image_generation' | 'embeddings' | 'reranking' | 'video_generation' | 'tts' | 'stt' | 'music_generation'> {
  const type = rawType.toLowerCase()
  const text = `${modelId} ${type}`.toLowerCase()
  if (type === 'chat' || type === 'language') return ['chat', 'reasoning', 'summarization', 'classification', 'extraction']
  if (type === 'code') return ['code']
  if (type === 'image') return ['image_generation']
  if (type === 'embedding') return ['embeddings']
  if (type === 'rerank') return ['reranking']
  if (type === 'moderation') return ['classification']
  if (type === 'video') return ['video_generation']
  if (type === 'audio') {
    if (/whisper|parakeet|voxtral|speech.to.text|transcri/.test(text)) return ['stt']
    return /music|text-to-music/.test(text) ? ['music_generation'] : ['tts']
  }
  return ['chat']
}

export async function discoverTogetherProviderModels(options: DiscoveryAdapterOptions = {}): Promise<ProviderDiscoveryResult> {
  const timestamp = discoveryTimestamp(options)
  const staticModels = [
    modelFromProviderRecord({ provider: 'together', modelId: 'black-forest-labs/FLUX.1-schnell', displayName: 'FLUX.1 Schnell', rawProviderType: 'image', category: 'image', endpointSource: 'repo_static_together_client', lastDiscoveredAt: timestamp, source: 'static_verified', discoverySource: 'static_verified', providerClientExists: true, workerExecutorExists: true, requestShapeKnown: true, responseShapeKnown: true, artifactPersistenceExists: true, transportProfile: 'native_inference_json', batchSupported: true }),
    modelFromProviderRecord({ provider: 'together', modelId: 'intfloat/multilingual-e5-large-instruct', displayName: 'Multilingual E5 Large Instruct', rawProviderType: 'embedding', category: 'embedding', endpointSource: 'Together official embeddings docs', lastDiscoveredAt: timestamp, source: 'docs_fallback', providerClientExists: true, workerExecutorExists: true, endpointShapeKnown: true, requestShapeKnown: true, responseShapeKnown: true, transportProfile: 'native_inference_json', batchSupported: true }),
    modelFromProviderRecord({ provider: 'together', modelId: 'Salesforce/Llama-Rank-v1', displayName: 'Llama Rank V1', rawProviderType: 'rerank', category: 'rerank', endpointSource: 'Together official rerank docs', lastDiscoveredAt: timestamp, source: 'docs_fallback', providerClientExists: true, workerExecutorExists: true, endpointShapeKnown: true, requestShapeKnown: true, responseShapeKnown: true, transportProfile: 'native_inference_json', batchSupported: true }),
    modelFromProviderRecord({ provider: 'together', modelId: 'canopylabs/orpheus-3b-0.1-ft', displayName: 'Orpheus 3B TTS', rawProviderType: 'audio', category: 'tts', inferredCapabilities: ['tts'], endpointSource: 'Together official text-to-speech docs', lastDiscoveredAt: timestamp, source: 'docs_fallback', providerClientExists: true, workerExecutorExists: true, endpointShapeKnown: true, requestShapeKnown: true, responseShapeKnown: true, artifactPersistenceExists: true, transportProfile: 'openai_audio_speech_binary', modalitiesIn: ['text'], modalitiesOut: ['audio'], batchSupported: false }),
    modelFromProviderRecord({ provider: 'together', modelId: 'openai/whisper-large-v3', displayName: 'Whisper Large V3', rawProviderType: 'audio', category: 'transcription', inferredCapabilities: ['stt'], endpointSource: 'Together official transcription docs', lastDiscoveredAt: timestamp, source: 'docs_fallback', providerClientExists: true, workerExecutorExists: true, endpointShapeKnown: true, requestShapeKnown: true, responseShapeKnown: true, artifactPersistenceExists: false, transportProfile: 'openai_audio_transcription_multipart', modalitiesIn: ['audio'], modalitiesOut: ['text'], batchSupported: false }),
  ]

  if (!options.live || !options.apiKey) {
    return skippedResult('together', TOGETHER_MODELS_ENDPOINT, staticModels, ['Together live discovery uses the canonical GET /v1/models endpoint when --live and TOGETHER_API_KEY are present.'])
  }

  try {
    const records = await fetchModelList(TOGETHER_LEGACY_MODELS_ENDPOINT, options.apiKey)
    const models = records
      .filter((record): record is Record<string, unknown> => typeof record === 'object' && record !== null)
      .map((record) => {
        const rawType = stringField(record, ['type', 'object', 'display_type'])
        const modelId = stringField(record, ['id', 'model', 'name'])
        const capabilities = togetherCapabilities(modelId, rawType)
        const implementedModels = new Set([
          'black-forest-labs/FLUX.1-schnell',
          'intfloat/multilingual-e5-large-instruct',
          'togethercomputer/m2-bert-80M-32k-retrieval',
          'Salesforce/Llama-Rank-v1',
        ])
        const implemented = implementedModels.has(modelId)
        const isExecutableImage = capabilities.includes('image_generation') && modelId === 'black-forest-labs/FLUX.1-schnell'
        return modelFromProviderRecord({
          provider: 'together',
          modelId,
          displayName: stringField(record, ['display_name', 'name', 'id'], modelId),
          rawProviderType: rawType,
          inferredCapabilities: capabilities,
          category: rawType,
          providerCategory: rawType,
          modalitiesIn: capabilities.includes('image_generation') ? ['text'] : undefined,
          modalitiesOut: capabilities.includes('image_generation') ? ['image'] : undefined,
          endpointSource: TOGETHER_MODELS_ENDPOINT,
          lastDiscoveredAt: timestamp,
          source: 'live_endpoint',
          discoverySource: 'live_endpoint',
          providerClientExists: implemented,
          workerExecutorExists: implemented,
          requestShapeKnown: implemented,
          responseShapeKnown: implemented,
          artifactPersistenceExists: isExecutableImage || !capabilities.some((capability) => ['image_generation', 'video_generation', 'tts', 'music_generation'].includes(capability)),
          contextWindow: numberField(record, ['context_length', 'contextWindow']),
          rawMetadata: {
            id: record.id,
            object: record.object,
            created: record.created,
            type: record.type,
            display_name: record.display_name,
            organization: record.organization,
            link: record.link,
            license: record.license,
            context_length: record.context_length,
            pricing: record.pricing,
            serverless: record.serverless,
            availability: record.availability,
            status: record.status,
            endpoint_type: record.endpoint_type,
            dedicated_endpoint_required: record.dedicated_endpoint_required,
            deprecated: record.deprecated,
          },
          batchSupported: true,
        })
      })
      .filter((model) => model.modelId)
    return liveResult('together', TOGETHER_MODELS_ENDPOINT, 'live_model_list', models, ['Together live discovery used the canonical model-list endpoint, with a legacy URL compatibility retry during the endpoint migration.'])
  } catch (error) {
    return failedLiveResult('together', TOGETHER_MODELS_ENDPOINT, error instanceof Error ? error.message : 'Together discovery failed', [])
  }
}
