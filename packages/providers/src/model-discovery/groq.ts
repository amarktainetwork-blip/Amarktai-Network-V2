import type { ProviderDiscoveryResult } from '@amarktai/core'
import { discoveryTimestamp, failedLiveResult, fetchModelList, liveResult, modelFromProviderRecord, skippedResult, stringField, numberField, type DiscoveryAdapterOptions } from './common.js'

const GROQ_MODELS_ENDPOINT = 'https://api.groq.com/openai/v1/models'

export async function discoverGroqProviderModels(options: DiscoveryAdapterOptions = {}): Promise<ProviderDiscoveryResult> {
  const timestamp = discoveryTimestamp(options)
  const staticModels = [
    modelFromProviderRecord({ provider: 'groq', modelId: 'llama-3.3-70b-versatile', displayName: 'Llama 3.3 70B Versatile', category: 'text', endpointSource: 'repo_static_groq_client', lastDiscoveredAt: timestamp, source: 'static_verified', discoverySource: 'static_verified', providerClientExists: true, workerExecutorExists: true, requestShapeKnown: true, responseShapeKnown: true, streamingSupported: true, transportProfile: 'openai_chat_sse' }),
    modelFromProviderRecord({ provider: 'groq', modelId: 'llama-3.1-8b-instant', displayName: 'Llama 3.1 8B Instant', category: 'text', endpointSource: 'repo_static_groq_client', lastDiscoveredAt: timestamp, source: 'static_verified', discoverySource: 'static_verified', providerClientExists: true, workerExecutorExists: true, requestShapeKnown: true, responseShapeKnown: true, streamingSupported: true, transportProfile: 'openai_chat_sse' }),
    modelFromProviderRecord({ provider: 'groq', modelId: 'whisper-large-v3', displayName: 'Whisper Large V3', rawProviderType: 'stt', category: 'audio', endpointSource: 'Groq official docs fallback /openai/v1/audio/transcriptions', lastDiscoveredAt: timestamp, source: 'docs_fallback', providerClientExists: true, workerExecutorExists: false, transportProfile: 'openai_audio_transcription_multipart' }),
    modelFromProviderRecord({ provider: 'groq', modelId: 'canopylabs/orpheus-v1-english', displayName: 'Orpheus V1 English', rawProviderType: 'tts', category: 'audio', endpointSource: 'Groq official docs fallback /openai/v1/audio/speech', lastDiscoveredAt: timestamp, source: 'docs_fallback', providerClientExists: true, workerExecutorExists: false, transportProfile: 'openai_audio_speech_binary' }),
  ]

  if (!options.live || !options.apiKey) {
    return skippedResult('groq', GROQ_MODELS_ENDPOINT, staticModels, ['Groq live discovery uses GET /openai/v1/models only when --live and GROQ_API_KEY are present.'])
  }

  try {
    const records = await fetchModelList(GROQ_MODELS_ENDPOINT, options.apiKey)
    const models = records
      .filter((record): record is Record<string, unknown> => typeof record === 'object' && record !== null)
      .map((record) => modelFromProviderRecord({
        provider: 'groq',
        modelId: stringField(record, ['id', 'model']),
        displayName: stringField(record, ['id', 'name']),
        rawProviderType: stringField(record, ['object', 'type']),
        endpointSource: GROQ_MODELS_ENDPOINT,
        lastDiscoveredAt: timestamp,
        source: 'live_endpoint',
        discoverySource: 'live_endpoint',
        providerClientExists: true,
        workerExecutorExists: true,
        contextWindow: numberField(record, ['context_window', 'contextWindow']),
        rawMetadata: record,
        streamingSupported: true,
      }))
      .filter((model) => model.modelId)
    return liveResult('groq', GROQ_MODELS_ENDPOINT, 'live_model_list', models, ['Groq live discovery used the OpenAI-compatible models endpoint only.'])
  } catch (error) {
    return failedLiveResult('groq', GROQ_MODELS_ENDPOINT, error instanceof Error ? error.message : 'Groq discovery failed', [])
  }
}
