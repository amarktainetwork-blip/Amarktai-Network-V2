import type { ProviderDiscoveryResult, TransportProfile } from '@amarktai/core'
import { discoveryTimestamp, failedLiveResult, fetchModelList, liveResult, modelFromProviderRecord, skippedResult, stringField, numberField, type DiscoveryAdapterOptions } from './common.js'

const TOGETHER_LEGACY_MODELS_ENDPOINT = 'https://api.together.ai/models'
const TOGETHER_MODELS_ENDPOINT = 'https://api.together.ai/v1/models'

const IMPLEMENTED_MODELS = new Set([
  'black-forest-labs/FLUX.1-schnell',
  'intfloat/multilingual-e5-large-instruct',
  'togethercomputer/m2-bert-80M-32k-retrieval',
  'Salesforce/Llama-Rank-v1',
  'canopylabs/orpheus-3b-0.1-ft',
  'openai/whisper-large-v3',
])

/**
 * These exact models are both implemented by this repository and listed in
 * Together's official serverless catalogue. The general /models inventory is
 * not treated as serverless evidence for any other model.
 */
const VERIFIED_SERVERLESS_MODELS = new Set([
  'black-forest-labs/FLUX.1-schnell',
  'intfloat/multilingual-e5-large-instruct',
  'canopylabs/orpheus-3b-0.1-ft',
  'openai/whisper-large-v3',
])

function togetherCapabilities(modelId: string, rawType: string): Array<'chat' | 'reasoning' | 'summarization' | 'classification' | 'extraction' | 'code' | 'image_generation' | 'embeddings' | 'reranking' | 'video_generation' | 'tts' | 'stt' | 'music_generation'> {
  const type = rawType.toLowerCase()
  const normalizedModel = modelId.toLowerCase()
  const text = `${normalizedModel} ${type}`
  if (normalizedModel === 'black-forest-labs/flux.1-schnell') return ['image_generation']
  if (normalizedModel === 'intfloat/multilingual-e5-large-instruct' || normalizedModel === 'togethercomputer/m2-bert-80m-32k-retrieval') return ['embeddings']
  if (normalizedModel === 'salesforce/llama-rank-v1') return ['reranking']
  if (normalizedModel === 'canopylabs/orpheus-3b-0.1-ft') return ['tts']
  if (normalizedModel === 'openai/whisper-large-v3') return ['stt']
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

function transportForCapabilities(capabilities: ReturnType<typeof togetherCapabilities>): TransportProfile {
  if (capabilities.includes('tts')) return 'openai_audio_speech_binary'
  if (capabilities.includes('stt')) return 'openai_audio_transcription_multipart'
  if (capabilities.includes('chat') || capabilities.includes('code')) return 'openai_chat_sse'
  return 'native_inference_json'
}

function endpointFamilyForCapabilities(capabilities: ReturnType<typeof togetherCapabilities>): string {
  if (capabilities.includes('tts')) return 'audio_speech'
  if (capabilities.includes('stt')) return 'audio_transcriptions'
  if (capabilities.includes('image_generation')) return 'image_generation'
  if (capabilities.includes('embeddings')) return 'embeddings'
  if (capabilities.includes('reranking')) return 'rerank'
  if (capabilities.includes('chat') || capabilities.includes('code')) return 'together_openai_v1/openai_chat'
  return 'native_inference'
}

export async function discoverTogetherProviderModels(options: DiscoveryAdapterOptions = {}): Promise<ProviderDiscoveryResult> {
  const timestamp = discoveryTimestamp(options)
  const staticModels = [
    modelFromProviderRecord({ provider: 'together', modelId: 'black-forest-labs/FLUX.1-schnell', displayName: 'FLUX.1 Schnell', rawProviderType: 'image', category: 'image', endpointSource: 'repo_static_together_client', lastDiscoveredAt: timestamp, source: 'static_verified', discoverySource: 'static_verified', providerClientExists: true, workerExecutorExists: true, requestShapeKnown: true, responseShapeKnown: true, artifactPersistenceExists: true, transportProfile: 'native_inference_json', endpointFamily: 'image_generation', modalitiesIn: ['text'], modalitiesOut: ['image'], batchSupported: true, rawMetadata: { serverless: true, serverlessEvidence: 'official_serverless_catalogue' } }),
    modelFromProviderRecord({ provider: 'together', modelId: 'intfloat/multilingual-e5-large-instruct', displayName: 'Multilingual E5 Large Instruct', rawProviderType: 'embedding', category: 'embedding', endpointSource: 'Together official embeddings docs', lastDiscoveredAt: timestamp, source: 'docs_fallback', providerClientExists: true, workerExecutorExists: true, endpointShapeKnown: true, requestShapeKnown: true, responseShapeKnown: true, transportProfile: 'native_inference_json', endpointFamily: 'embeddings', modalitiesIn: ['text'], modalitiesOut: ['embedding'], batchSupported: true, rawMetadata: { serverless: true, serverlessEvidence: 'official_serverless_catalogue' } }),
    modelFromProviderRecord({ provider: 'together', modelId: 'Salesforce/Llama-Rank-v1', displayName: 'Llama Rank V1', rawProviderType: 'rerank', category: 'rerank', endpointSource: 'Together official rerank docs', lastDiscoveredAt: timestamp, source: 'docs_fallback', providerClientExists: true, workerExecutorExists: true, endpointShapeKnown: true, requestShapeKnown: true, responseShapeKnown: true, transportProfile: 'native_inference_json', endpointFamily: 'rerank', modalitiesIn: ['text'], modalitiesOut: ['json'], batchSupported: true }),
    modelFromProviderRecord({ provider: 'together', modelId: 'canopylabs/orpheus-3b-0.1-ft', displayName: 'Orpheus 3B TTS', rawProviderType: 'audio', category: 'tts', inferredCapabilities: ['tts'], endpointSource: 'Together official text-to-speech docs', lastDiscoveredAt: timestamp, source: 'docs_fallback', providerClientExists: true, workerExecutorExists: true, endpointShapeKnown: true, requestShapeKnown: true, responseShapeKnown: true, artifactPersistenceExists: true, transportProfile: 'openai_audio_speech_binary', endpointFamily: 'audio_speech', modalitiesIn: ['text'], modalitiesOut: ['audio'], batchSupported: false, rawMetadata: { serverless: true, serverlessEvidence: 'official_serverless_catalogue' } }),
    modelFromProviderRecord({ provider: 'together', modelId: 'openai/whisper-large-v3', displayName: 'Whisper Large V3', rawProviderType: 'audio', category: 'transcription', inferredCapabilities: ['stt'], endpointSource: 'Together official transcription docs', lastDiscoveredAt: timestamp, source: 'docs_fallback', providerClientExists: true, workerExecutorExists: true, endpointShapeKnown: true, requestShapeKnown: true, responseShapeKnown: true, artifactPersistenceExists: false, transportProfile: 'openai_audio_transcription_multipart', endpointFamily: 'audio_transcriptions', modalitiesIn: ['audio'], modalitiesOut: ['text'], batchSupported: false, rawMetadata: { serverless: true, serverlessEvidence: 'official_serverless_catalogue' } }),
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
        const implemented = IMPLEMENTED_MODELS.has(modelId)
        const verifiedServerless = VERIFIED_SERVERLESS_MODELS.has(modelId)
        const isExecutableImage = capabilities.includes('image_generation') && modelId === 'black-forest-labs/FLUX.1-schnell'
        const transportProfile = transportForCapabilities(capabilities)
        const endpointFamily = endpointFamilyForCapabilities(capabilities)
        const modalitiesIn = capabilities.includes('stt') ? ['audio'] : ['text']
        const modalitiesOut = capabilities.includes('image_generation') ? ['image']
          : capabilities.includes('tts') ? ['audio']
            : capabilities.includes('embeddings') ? ['embedding']
              : capabilities.includes('reranking') ? ['json'] : ['text']
        return modelFromProviderRecord({
          provider: 'together',
          modelId,
          displayName: stringField(record, ['display_name', 'name', 'id'], modelId),
          rawProviderType: rawType,
          inferredCapabilities: capabilities,
          category: capabilities.includes('tts') ? 'tts' : capabilities.includes('stt') ? 'transcription' : capabilities.includes('reranking') ? 'rerank' : capabilities.includes('embeddings') ? 'embedding' : rawType,
          providerCategory: rawType,
          modalitiesIn,
          modalitiesOut,
          endpointSource: TOGETHER_MODELS_ENDPOINT,
          endpointFamily,
          lastDiscoveredAt: timestamp,
          source: 'live_endpoint',
          discoverySource: 'live_endpoint',
          providerClientExists: implemented,
          workerExecutorExists: implemented,
          requestShapeKnown: implemented,
          responseShapeKnown: implemented,
          artifactPersistenceExists: isExecutableImage || capabilities.includes('tts') || !capabilities.some((capability) => ['image_generation', 'video_generation', 'tts', 'music_generation'].includes(capability)),
          contextWindow: numberField(record, ['context_length', 'contextWindow']),
          transportProfile,
          streamingSupported: (capabilities.includes('chat') || capabilities.includes('code')) && record.streaming !== false,
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
            serverless: verifiedServerless ? true : record.serverless,
            serverlessEvidence: verifiedServerless ? 'official_serverless_catalogue' : undefined,
            availability: verifiedServerless ? 'serverless' : record.availability,
            status: record.status,
            endpoint_type: verifiedServerless ? 'serverless' : record.endpoint_type,
            dedicated_endpoint_required: verifiedServerless ? false : record.dedicated_endpoint_required,
            deprecated: record.deprecated,
            endpointFamily,
            transportProfile,
            modalitiesIn,
            modalitiesOut,
            requestShapeKnown: implemented,
            responseShapeKnown: implemented,
            providerClientExists: implemented,
            workerExecutorExists: implemented,
            streamingSupported: (capabilities.includes('chat') || capabilities.includes('code')) && record.streaming !== false,
          },
          batchSupported: !capabilities.includes('tts') && !capabilities.includes('stt'),
        })
      })
      .filter((model) => model.modelId)
    return liveResult('together', TOGETHER_MODELS_ENDPOINT, 'live_model_list', models, ['Together live discovery used the canonical model-list endpoint, with a legacy URL compatibility retry during the endpoint migration. Serverless execution evidence is limited to implemented models listed in Together official serverless documentation.'])
  } catch (error) {
    return failedLiveResult('together', TOGETHER_MODELS_ENDPOINT, error instanceof Error ? error.message : 'Together discovery failed', [])
  }
}
