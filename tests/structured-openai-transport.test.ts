import { afterEach, describe, expect, it, vi } from 'vitest'
import { openAiChatCompletion } from '@amarktai/providers'

afterEach(() => {
  vi.unstubAllGlobals()
  vi.restoreAllMocks()
})

describe('structured OpenAI-compatible response normalization', () => {
  it('extracts the final fenced JSON object after reasoning text', async () => {
    vi.stubGlobal('fetch', vi.fn(async () => new Response(JSON.stringify({
      model: 'deepseek-reasoning-model',
      choices: [{
        finish_reason: 'stop',
        message: {
          reasoning_content: 'The provider performed private reasoning.',
          content: '<think>Draft {"draft":true}</think>\n```json\n{"answer":"ready","count":2}\n```',
        },
      }],
      usage: { prompt_tokens: 5, completion_tokens: 8, total_tokens: 13 },
    }), { status: 200 })))

    const result = await openAiChatCompletion({
      provider: 'deepinfra',
      baseUrl: 'https://provider.example/v1',
      apiKey: 'test-key',
      model: 'deepseek-reasoning-model',
      messages: [
        { role: 'system', content: 'Return only one JSON object matching this schema: {"type":"object"}' },
        { role: 'user', content: 'Return the result.' },
      ],
      responseFormat: { type: 'json_object' },
    })

    expect(JSON.parse(result.content)).toEqual({ answer: 'ready', count: 2 })
    expect(result.reasoningSummary).toBe('The provider performed private reasoning.')
  })

  it('normalizes prompt-only structured output after response-format downgrade', async () => {
    vi.stubGlobal('fetch', vi.fn(async () => new Response(JSON.stringify({
      model: 'deepseek-chat-model',
      choices: [{
        finish_reason: 'stop',
        message: {
          content: 'Here is the repaired object:\n{"label":"positive","labels":[{"label":"positive","score":0.98}]}',
        },
      }],
      usage: { prompt_tokens: 3, completion_tokens: 4, total_tokens: 7 },
    }), { status: 200 })))

    const result = await openAiChatCompletion({
      provider: 'deepinfra',
      baseUrl: 'https://provider.example/v1',
      apiKey: 'test-key',
      model: 'deepseek-chat-model',
      messages: [
        { role: 'system', content: 'Return only one JSON object matching this schema: {"type":"object"}' },
        { role: 'user', content: 'Classify the input.' },
      ],
    })

    expect(JSON.parse(result.content)).toEqual({
      label: 'positive',
      labels: [{ label: 'positive', score: 0.98 }],
    })
  })

  it('does not rewrite ordinary chat containing an inline JSON example', async () => {
    const content = 'Use {"status":"ready"} as an example, but keep this explanatory sentence.'
    vi.stubGlobal('fetch', vi.fn(async () => new Response(JSON.stringify({
      model: 'deepseek-chat-model',
      choices: [{ finish_reason: 'stop', message: { content } }],
      usage: { prompt_tokens: 2, completion_tokens: 5, total_tokens: 7 },
    }), { status: 200 })))

    const result = await openAiChatCompletion({
      provider: 'deepinfra',
      baseUrl: 'https://provider.example/v1',
      apiKey: 'test-key',
      model: 'deepseek-chat-model',
      messages: [{ role: 'user', content: 'Explain the example.' }],
    })

    expect(result.content).toBe(content)
  })
})
