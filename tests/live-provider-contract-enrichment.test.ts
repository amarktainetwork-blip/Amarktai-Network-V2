import { afterEach, describe, expect, it, vi } from 'vitest'
import {
  discoverDeepInfraProviderModels,
  discoverTogetherProviderModels,
} from '../packages/providers/src/index.ts'

const originalFetch = global.fetch

afterEach(() => {
  global.fetch = originalFetch
  vi.restoreAllMocks()
})

describe('live provider contract enrichment', () => {
  it('combines DeepInfra account inventory with callable native task metadata', async () => {
    const calls: string[] = []
    global.fetch = vi.fn(async (url) => {
      const target = String(url)
      calls.push(target)
      if (target === 'https://api.deepinfra.com/v1/models') {
        return {
          ok: true,
          json: async () => ({
            object: 'list',
            data: [
              {
                id: 'meta-llama/Meta-Llama-3.1-8B-Instruct',
                object: 'model',
                metadata: { context_length: 131072, tags: ['llm'] },
              },
              {
                id: 'BAAI/bge-large-en-v1.5',
                object: 'model',
                metadata: { context_length: 512, tags: ['embedding'] },
              },
              {
                id: 'account-only/unknown-contract',
                object: 'model',
                metadata: {},
              },
            ],
          }),
        }
      }
      if (target === 'https://api.deepinfra.com/models/list') {
        return {
          ok: true,
          json: async () => ([
            {
              model_name: 'meta-llama/Meta-Llama-3.1-8B-Instruct',
              type: 'text-generation',
              reported_type: 'text-generation',
              max_tokens: 131072,
            },
            {
              model_name: 'BAAI/bge-large-en-v1.5',
              type: 'feature-extraction',
              reported_type: 'embeddings',
              max_tokens: 512,
            },
            {
              model_name: 'public-only/not-in-account',
              type: 'text-generation',
              reported_type: 'text-generation',
            },
          ]),
        }
      }
      throw new Error(`unexpected URL ${target}`)
    }) as typeof fetch

    const result = await discoverDeepInfraProviderModels({
      live: true,
      apiKey: 'test-key',
      now: '2026-07-20T04:00:00.000Z',
    })

    expect(calls).toEqual(expect.arrayContaining([
      'https://api.deepinfra.com/v1/models',
      'https://api.deepinfra.com/models/list',
    ]))
    expect(result.liveDiscoverySucceeded).toBe(true)
    expect(result.models).toHaveLength(4)

    const nativeOnly = result.models.find((model) => model.modelId === 'public-only/not-in-account')
    expect(nativeOnly).toMatchObject({
      rawProviderType: 'text-generation',
      requestShapeKnown: true,
      responseShapeKnown: true,
      providerClientExists: true,
      workerExecutorExists: true,
      rawMetadata: expect.objectContaining({ nativeCatalogueOnly: true }),
    })

    const text = result.models.find((model) => model.modelId === 'meta-llama/Meta-Llama-3.1-8B-Instruct')
    expect(text).toMatchObject({
      rawProviderType: 'text-generation',
      category: 'text-generation',
      requestShapeKnown: true,
      responseShapeKnown: true,
      providerClientExists: true,
      workerExecutorExists: true,
      streamingSupported: true,
      transportProfile: 'openai_chat_sse',
      endpointFamily: 'deepinfra_openai_v1/openai_chat',
    })
    expect(text?.inferredCapabilities).toEqual(expect.arrayContaining([
      'chat',
      'streaming_chat',
      'reasoning',
      'code',
      'summarization',
      'translation',
      'question_answering',
      'classification',
      'extraction',
      'structured_output',
      'tool_use',
    ]))
    expect(text?.rawMetadata).toMatchObject({
      taskContractEnriched: true,
      accountInventorySource: 'https://api.deepinfra.com/v1/models',
      taskMetadataSource: 'https://api.deepinfra.com/models/list',
    })

    const embedding = result.models.find((model) => model.modelId === 'BAAI/bge-large-en-v1.5')
    expect(embedding?.inferredCapabilities).toEqual(expect.arrayContaining([
      'feature_extraction',
      'sentence_similarity',
      'embeddings',
    ]))

    const unknown = result.models.find((model) => model.modelId === 'account-only/unknown-contract')
    expect(unknown).toMatchObject({
      rawProviderType: 'contract-unknown',
      requestShapeKnown: false,
      responseShapeKnown: false,
      providerClientExists: false,
      workerExecutorExists: false,
    })
  })

  it('grants Together serverless evidence only to implemented documented models', async () => {
    global.fetch = vi.fn(async () => ({
      ok: true,
      json: async () => ([
        { id: 'black-forest-labs/FLUX.1-schnell', type: 'image', display_name: 'Flux Schnell' },
        { id: 'canopylabs/orpheus-3b-0.1-ft', type: 'audio', display_name: 'Orpheus' },
        { id: 'openai/whisper-large-v3', type: 'audio', display_name: 'Whisper' },
        { id: 'meta-llama/unknown-chat', type: 'chat', display_name: 'Unknown Chat' },
      ]),
    })) as typeof fetch

    const result = await discoverTogetherProviderModels({
      live: true,
      apiKey: 'test-key',
      now: '2026-07-20T04:00:00.000Z',
    })

    const flux = result.models.find((model) => model.modelId === 'black-forest-labs/FLUX.1-schnell')
    expect(flux).toMatchObject({
      providerClientExists: true,
      workerExecutorExists: true,
      requestShapeKnown: true,
      responseShapeKnown: true,
      transportProfile: 'native_inference_json',
      endpointFamily: 'image_generation',
      modalitiesIn: ['text'],
      modalitiesOut: ['image'],
    })
    expect(flux?.rawMetadata).toMatchObject({
      serverless: true,
      serverlessEvidence: 'official_serverless_catalogue',
      dedicated_endpoint_required: false,
    })

    const tts = result.models.find((model) => model.modelId === 'canopylabs/orpheus-3b-0.1-ft')
    expect(tts).toMatchObject({
      inferredCapabilities: ['tts'],
      providerClientExists: true,
      workerExecutorExists: true,
      transportProfile: 'openai_audio_speech_binary',
      endpointFamily: 'audio_speech',
      modalitiesIn: ['text'],
      modalitiesOut: ['audio'],
    })
    expect(tts?.rawMetadata).toMatchObject({ serverless: true })

    const stt = result.models.find((model) => model.modelId === 'openai/whisper-large-v3')
    expect(stt).toMatchObject({
      inferredCapabilities: ['stt'],
      providerClientExists: true,
      workerExecutorExists: true,
      transportProfile: 'openai_audio_transcription_multipart',
      endpointFamily: 'audio_transcriptions',
      modalitiesIn: ['audio'],
      modalitiesOut: ['text'],
    })
    expect(stt?.rawMetadata).toMatchObject({ serverless: true })

    const unknown = result.models.find((model) => model.modelId === 'meta-llama/unknown-chat')
    expect(unknown?.rawMetadata?.serverless).not.toBe(true)
    expect(unknown?.providerClientExists).toBe(false)
    expect(unknown?.workerExecutorExists).toBe(false)
  })
})
