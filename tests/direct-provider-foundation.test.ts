import { afterEach, describe, expect, it, vi } from 'vitest'
import {
  DIRECT_PROVIDER_CAPABILITIES,
  DIRECT_PROVIDER_OUTPUT_SCHEMAS,
  DIRECT_PROVIDER_REQUEST_SCHEMAS,
  EXECUTOR_REGISTRATIONS,
  createCanonicalProviderUsage,
  validateDirectProviderRequest,
  validateJsonSchemaValue,
} from '@amarktai/core'
import {
  CanonicalProviderError,
  deepinfraTaskInference,
  openAiChatCompletion,
  openAiStreamingChat,
  providerEmbeddings,
  providerHttpError,
  providerRerank,
} from '@amarktai/providers'
import { DIRECT_EXECUTOR_HANDLERS } from '../apps/worker/src/providers/direct-provider-executor.js'
import { executeInternalTool, getInternalToolDefinitions } from '../apps/worker/src/tools/tool-registry.js'

const EXPECTED_CAPABILITIES = [
  'chat', 'streaming_chat', 'reasoning', 'code', 'summarization', 'translation',
  'question_answering', 'classification', 'zero_shot_classification', 'extraction',
  'token_classification', 'fill_mask', 'feature_extraction', 'sentence_similarity',
  'table_qa', 'structured_output', 'tts', 'stt', 'embeddings',
  'reranking', 'image_generation', 'video_generation', 'image_to_video',
  'video_to_video', 'music_generation',
] as const

afterEach(() => {
  vi.unstubAllGlobals()
  vi.restoreAllMocks()
})

describe('canonical direct-provider contracts and registrations', () => {
  it('defines the complete direct-provider capabilities with request, output, and executable registrations', () => {
    expect(DIRECT_PROVIDER_CAPABILITIES).toEqual(EXPECTED_CAPABILITIES)
    for (const capability of EXPECTED_CAPABILITIES) {
      expect(DIRECT_PROVIDER_REQUEST_SCHEMAS[capability]).toBeDefined()
      expect(DIRECT_PROVIDER_OUTPUT_SCHEMAS[capability]).toBeDefined()
      const registrations = EXECUTOR_REGISTRATIONS.filter((entry) => entry.capability === capability)
      expect(registrations.length, capability).toBeGreaterThan(0)
      for (const entry of registrations) {
        expect(entry.modelCompatibility).toBe('transport_task_profile')
        expect(entry.compatibleModels).toEqual([])
        expect(entry.compatibilityProfile).not.toBeNull()
      }
    }
  })

  it('backs each queued direct registration with a callable handler', () => {
    const externallyDispatched = new Set([
      'deepinfra.chat',
      'deepinfra.streaming-chat',
      'together.streaming-chat',
      'genx.streaming-chat',
      'together.image-generation',
      'genx.video-generation',
      'genx.image-to-video',
      'genx.video-to-video',
      'genx.music-generation',
      'genx.song-generation',
      'genx.tts',
      'genx.stt',
    ])
    for (const id of new Set(EXECUTOR_REGISTRATIONS.map((entry) => entry.id))) {
      if (!externallyDispatched.has(id)) {
        expect(DIRECT_EXECUTOR_HANDLERS[id], `handler for ${id}`).toBeTypeOf('function')
      }
    }
  })

  it('fails closed for invalid task input and unsupported JSON Schema keywords', () => {
    expect(validateDirectProviderRequest('fill_mask', 'No mask here', {}).success).toBe(false)
    expect(validateDirectProviderRequest('reranking', '', {
      query: 'q', documents: ['a'], topN: 2,
    }).success).toBe(false)
    expect(validateDirectProviderRequest('structured_output', 'return data', {
      schema: { type: 'object', $ref: '#/$defs/value' },
    }).success).toBe(false)
    const validation = validateJsonSchemaValue({ answer: '' }, {
      type: 'object',
      properties: { answer: { type: 'string', minLength: 1 } },
      required: ['answer'],
      additionalProperties: false,
    })
    expect(validation.valid).toBe(false)
  })

  it('normalizes usage without inventing provider cost', () => {
    expect(createCanonicalProviderUsage({
      provider: 'deepinfra', model: 'llama-3.3-70b-versatile', inputTokens: 3, outputTokens: 4,
    })).toMatchObject({
      inputTokens: 3,
      outputTokens: 4,
      totalTokens: 7,
      providerReportedCost: null,
      estimatedCost: null,
      estimated: false,
      currency: null,
    })
  })
})

describe('shared provider transports', () => {
  it('normalizes OpenAI-compatible chat content, tools, usage, and exact route', async () => {
    const fetchMock = vi.fn(async (url: string | URL | Request, init?: RequestInit) => {
      expect(String(url)).toBe('https://provider.example/v1/chat/completions')
      expect(init?.headers).toMatchObject({ Authorization: 'Bearer test-key' })
      const body = JSON.parse(String(init?.body))
      expect(body).toMatchObject({ model: 'exact-model', stream: false, max_completion_tokens: 99 })
      return new Response(JSON.stringify({
        model: 'exact-model',
        choices: [{ finish_reason: 'tool_calls', message: {
          content: '',
          tool_calls: [{ id: 'call-1', type: 'function', function: { name: 'calculator', arguments: '{"expression":"2+2"}' } }],
        } }],
        usage: { prompt_tokens: 5, completion_tokens: 2, total_tokens: 7, cost: 0.001, currency: 'USD' },
      }), { status: 200 })
    })
    vi.stubGlobal('fetch', fetchMock)

    const result = await openAiChatCompletion({
      provider: 'deepinfra', baseUrl: 'https://provider.example/v1/', apiKey: 'test-key',
      model: 'exact-model', messages: [{ role: 'user', content: 'calculate' }], maxOutputTokens: 99,
    })
    expect(result.toolCalls[0]?.function.name).toBe('calculator')
    expect(result.usage).toEqual({ inputTokens: 5, outputTokens: 2, totalTokens: 7, providerReportedCost: 0.001, currency: 'USD' })
    expect(fetchMock).toHaveBeenCalledOnce()
  })

  it('delivers multiple real SSE chunks before completion and preserves final usage', async () => {
    const sse = [
      'data: {"model":"exact-model","choices":[{"delta":{"content":"Hello "}}]}\n\n',
      'data: {"model":"exact-model","choices":[{"delta":{"content":"world"}}]}\n\n',
      'data: {"model":"exact-model","choices":[{"delta":{},"finish_reason":"stop"}],"usage":{"prompt_tokens":2,"completion_tokens":2,"total_tokens":4}}\n\n',
      'data: [DONE]\n\n',
    ].join('')
    vi.stubGlobal('fetch', vi.fn(async () => new Response(sse, {
      status: 200,
      headers: { 'content-type': 'text/event-stream' },
    })))

    const chunks = []
    for await (const chunk of openAiStreamingChat({
      provider: 'deepinfra', baseUrl: 'https://provider.example/v1', apiKey: 'test-key',
      model: 'exact-model', messages: [{ role: 'user', content: 'hello' }],
    })) chunks.push(chunk)

    expect(chunks.filter((chunk) => chunk.type === 'content').map((chunk) => chunk.content)).toEqual(['Hello ', 'world'])
    expect(chunks.at(-1)).toMatchObject({ type: 'done', finishReason: 'stop', model: 'exact-model' })
    expect(chunks.at(-1)?.usage?.totalTokens).toBe(4)
  })

  it('uses DeepInfra native inference and validates embedding and reranking responses', async () => {
    const fetchMock = vi.fn(async (url: string | URL | Request) => {
      const target = String(url)
      if (target.endsWith('/inference/specialist-model')) {
        return new Response(JSON.stringify([{ label: 'yes', score: 0.9 }]), { status: 200 })
      }
      if (target.endsWith('/embeddings')) {
        return new Response(JSON.stringify({
          model: 'embed-model',
          data: [{ index: 1, embedding: [0.3, 0.4] }, { index: 0, embedding: [0.1, 0.2] }],
          usage: { prompt_tokens: 4, total_tokens: 4 },
        }), { status: 200 })
      }
      if (target.endsWith('/rerank')) {
        return new Response(JSON.stringify({
          model: 'rank-model',
          results: [{ index: 0, relevance_score: 0.2 }, { index: 1, relevance_score: 0.9 }],
        }), { status: 200 })
      }
      return new Response('not found', { status: 404 })
    })
    vi.stubGlobal('fetch', fetchMock)

    await expect(deepinfraTaskInference({
      apiKey: 'test-key', model: 'specialist-model', baseUrl: 'https://api.deepinfra.com/v1/openai', input: { input: 'text' },
    })).resolves.toEqual([{ label: 'yes', score: 0.9 }])

    const embeddings = await providerEmbeddings({
      provider: 'together', apiKey: 'test-key', model: 'embed-model', texts: ['a', 'b'], baseUrl: 'https://provider.example/v1',
    })
    expect(embeddings).toMatchObject({ vectors: [[0.1, 0.2], [0.3, 0.4]], dimensions: 2 })

    const reranked = await providerRerank({
      provider: 'together', apiKey: 'test-key', model: 'rank-model', query: 'q',
      documents: [{ id: 'a', text: 'A' }, { id: 'b', text: 'B' }], topN: 1,
      baseUrl: 'https://provider.example/v1',
    })
    expect(reranked.results).toEqual([{ index: 1, documentId: 'b', score: 0.9 }])
  })

  it('classifies HTTP failures canonically and redacts credentials', () => {
    process.env.deepinfra_API_KEY = 'super-secret-provider-key'
    const error = providerHttpError({ provider: 'deepinfra', status: 401, body: 'Bearer super-secret-provider-key' })
    expect(error).toBeInstanceOf(CanonicalProviderError)
    expect(error).toMatchObject({ code: 'authentication', retryable: false, status: 401 })
    expect(error.message).not.toContain('super-secret-provider-key')
    delete process.env.deepinfra_API_KEY
  })
})

describe('controlled internal tools', () => {
  it('executes only registered deterministic arithmetic without eval or code execution', async () => {
    const grant = { artifactRead: false } as never
    await expect(executeInternalTool('calculator', '{"expression":"2^(3+1) / 4"}', { appSlug: 'proof-app', grant }))
      .resolves.toEqual({ expression: '2^(3+1) / 4', result: 4 })
    await expect(executeInternalTool('calculator', '{"expression":"process.exit()"}', { appSlug: 'proof-app', grant }))
      .rejects.toThrow('Unsupported calculator character')
    await expect(executeInternalTool('shell', '{}', { appSlug: 'proof-app', grant }))
      .rejects.toThrow("Tool 'shell' is not registered")
    expect(getInternalToolDefinitions(['calculator']).map((tool) => tool.function.name)).toEqual(['calculator'])
  })
})
