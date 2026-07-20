import fs from 'node:fs'
import path from 'node:path'
import { afterEach, describe, expect, it, vi } from 'vitest'
import {
  discoverDeepInfraProviderModels,
  discoverGenXProviderModels,
  discoverTogetherProviderModels,
  openAiStreamingChat,
} from '../packages/providers/src/index.ts'

const originalFetch = global.fetch

afterEach(() => {
  global.fetch = originalFetch
  vi.restoreAllMocks()
})

describe('final live provider gap repairs', () => {
  it('uses the canonical provider base URL when streaming receives an empty stored base URL', async () => {
    const calls: string[] = []
    global.fetch = vi.fn(async (input) => {
      calls.push(String(input))
      const body = [
        'data: {"model":"test-model","choices":[{"delta":{"content":"Hello "},"finish_reason":null}]}',
        '',
        'data: {"model":"test-model","choices":[{"delta":{"content":"world"},"finish_reason":"stop"}],"usage":{"prompt_tokens":1,"completion_tokens":2,"total_tokens":3}}',
        '',
        'data: [DONE]',
        '',
      ].join('\n')
      return new Response(body, {
        status: 200,
        headers: { 'content-type': 'text/event-stream' },
      })
    }) as typeof fetch

    const chunks = []
    for await (const chunk of openAiStreamingChat({
      provider: 'deepinfra',
      baseUrl: '',
      apiKey: 'test-key',
      model: 'test-model',
      messages: [{ role: 'user', content: 'Hello' }],
      maxRetries: 0,
    })) {
      chunks.push(chunk)
    }

    expect(calls).toHaveLength(1)
    expect(calls[0]).toMatch(/^https:\/\/api\.deepinfra\.com\//)
    expect(calls[0]).toEndWith('/chat/completions')
    expect(chunks.filter((chunk) => chunk.type === 'content').map((chunk) => chunk.content).join('')).toBe('Hello world')
  })

  it('combines DeepInfra OpenAI account models with callable native task models', async () => {
    global.fetch = vi.fn(async (input) => {
      const url = String(input)
      if (url.endsWith('/v1/models')) {
        return new Response(JSON.stringify({ data: [{ id: 'anthropic/claude-fable-5', object: 'model' }] }), { status: 200 })
      }
      if (url.endsWith('/models/list')) {
        return new Response(JSON.stringify([
          { model_name: 'anthropic/claude-fable-5', reported_type: 'text-generation' },
          { model_name: 'facebook/bart-large-mnli', reported_type: 'zero-shot-classification' },
          { model_name: 'dslim/bert-base-NER', reported_type: 'token-classification' },
          { model_name: 'bert-base-cased', reported_type: 'fill-mask' },
          { model_name: 'google/tapas-base-finetuned-wtq', reported_type: 'table-question-answering' },
          { model_name: 'Qwen/Qwen3-Reranker-0.6B', reported_type: 'reranker' },
          { model_name: 'private/fill-mask', reported_type: 'fill-mask', private: 1 },
          { model_name: 'deprecated/fill-mask', reported_type: 'fill-mask', deprecated: 1 },
        ]), { status: 200 })
      }
      return new Response('{}', { status: 404 })
    }) as typeof fetch

    const result = await discoverDeepInfraProviderModels({
      live: true,
      apiKey: 'test-key',
      now: '2026-07-20T00:00:00.000Z',
    })

    expect(result.liveDiscoverySucceeded).toBe(true)
    expect(result.models.map((model) => model.modelId)).toEqual(expect.arrayContaining([
      'anthropic/claude-fable-5',
      'facebook/bart-large-mnli',
      'dslim/bert-base-NER',
      'bert-base-cased',
      'google/tapas-base-finetuned-wtq',
      'Qwen/Qwen3-Reranker-0.6B',
    ]))
    expect(result.models.map((model) => model.modelId)).not.toContain('private/fill-mask')
    expect(result.models.map((model) => model.modelId)).not.toContain('deprecated/fill-mask')
    expect(result.models.find((model) => model.modelId === 'facebook/bart-large-mnli')).toMatchObject({
      inferredCapabilities: ['zero_shot_classification'],
      rawProviderType: 'zero-shot-classification',
      requestShapeKnown: true,
      responseShapeKnown: true,
      providerClientExists: true,
      workerExecutorExists: true,
      rawMetadata: expect.objectContaining({ nativeCatalogueOnly: true }),
    })
    expect(result.models.find((model) => model.modelId === 'Qwen/Qwen3-Reranker-0.6B')).toMatchObject({
      inferredCapabilities: ['reranking'],
      endpointFamily: 'deepinfra_native_v1/rerank/native_inference',
    })
  })

  it('preserves exact Together Whisper and Orpheus contracts when the inventory type is generic', async () => {
    global.fetch = vi.fn(async () => new Response(JSON.stringify([
      { id: 'openai/whisper-large-v3', object: 'model' },
      { id: 'canopylabs/orpheus-3b-0.1-ft', object: 'model' },
      { id: 'black-forest-labs/FLUX.1-schnell', object: 'model' },
    ]), { status: 200 })) as typeof fetch

    const result = await discoverTogetherProviderModels({
      live: true,
      apiKey: 'test-key',
      now: '2026-07-20T00:00:00.000Z',
    })

    expect(result.models.find((model) => model.modelId === 'openai/whisper-large-v3')).toMatchObject({
      inferredCapabilities: ['stt'],
      category: 'transcription',
      modalitiesIn: ['audio'],
      modalitiesOut: ['text'],
      transportProfile: 'openai_audio_transcription_multipart',
      endpointFamily: 'audio_transcriptions',
      providerClientExists: true,
      workerExecutorExists: true,
      rawMetadata: expect.objectContaining({ serverless: true }),
    })
    expect(result.models.find((model) => model.modelId === 'canopylabs/orpheus-3b-0.1-ft')).toMatchObject({
      inferredCapabilities: ['tts'],
      transportProfile: 'openai_audio_speech_binary',
      endpointFamily: 'audio_speech',
    })
  })

  it('classifies GenX text-to-video and image-to-video models as separate exact routes', async () => {
    global.fetch = vi.fn(async () => new Response(JSON.stringify({ models: [
      { id: 'seedance-v1-fast', category: 'video', task: 'text-to-video' },
      { id: 'seedance-v1-fast-i2v', category: 'video', task: 'image-to-video' },
    ] }), { status: 200 })) as typeof fetch

    const result = await discoverGenXProviderModels({
      live: true,
      apiKey: 'test-key',
      baseUrl: 'https://query.genx.sh',
      now: '2026-07-20T00:00:00.000Z',
    })

    const textVideo = result.models.find((model) => model.modelId === 'seedance-v1-fast')
    const imageVideo = result.models.find((model) => model.modelId === 'seedance-v1-fast-i2v')
    expect(textVideo?.inferredCapabilities).toEqual(['video_generation'])
    expect(textVideo?.inferredCapabilities).not.toContain('image_to_video')
    expect(textVideo?.modalitiesIn).toEqual(['text'])
    expect(imageVideo).toMatchObject({
      inferredCapabilities: ['image_to_video'],
      rawProviderType: 'image-to-video',
      providerCategory: 'image-to-video',
      modalitiesIn: ['text', 'image'],
      modalitiesOut: ['video'],
      endpointFamily: 'genx_generation_v1',
    })
  })

  it('persists the GenX route split through an additive migration', () => {
    const migration = fs.readFileSync(path.join(process.cwd(), 'prisma/migrations/20260720_split_genx_video_contracts/migration.sql'), 'utf8')
    expect(migration).toContain("'seedance-v1-fast-i2v'")
    expect(migration).toContain("'[\"image_to_video\"]'")
    expect(migration).toContain("'[\"video_generation\",\"video_to_video\"]'")
    expect(migration).toContain('ON DUPLICATE KEY UPDATE')
    expect(migration).not.toMatch(/\b(DROP|TRUNCATE|DELETE)\b/i)
  })
})
