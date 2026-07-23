import { afterEach, describe, expect, it, vi } from 'vitest'
import { deepinfraVision } from '../packages/providers/src/deepinfra-client.js'

const originalFetch = globalThis.fetch

afterEach(() => {
  globalThis.fetch = originalFetch
  vi.restoreAllMocks()
})

describe('DeepInfra vision client', () => {
  it('sends model-selected multimodal OpenAI-compatible content', async () => {
    const fetchMock = vi.fn(async (_url: string | URL | Request, init?: RequestInit) => new Response(JSON.stringify({
      model: 'account-accessible-vision-model',
      choices: [{ message: { content: '{"summary":"valid"}' }, finish_reason: 'stop' }],
      usage: { prompt_tokens: 50, completion_tokens: 10, total_tokens: 60 },
    }), { status: 200, headers: { 'content-type': 'application/json' } }))
    globalThis.fetch = fetchMock as typeof fetch

    const result = await deepinfraVision({
      apiKey: 'secret-key',
      baseUrl: 'https://api.deepinfra.test/v1/openai',
      model: 'account-accessible-vision-model',
      prompt: 'Evaluate these representative video frames.',
      images: [
        { mimeType: 'image/jpeg', data: Buffer.from([0xff, 0xd8, 0xff, 0xd9]) },
        { mimeType: 'image/png', url: 'https://example.test/frame.png' },
      ],
      responseFormat: { type: 'json_object' },
    })

    expect(result.content).toBe('{"summary":"valid"}')
    expect(result.model).toBe('account-accessible-vision-model')
    const [url, init] = fetchMock.mock.calls[0]!
    expect(String(url)).toBe('https://api.deepinfra.test/v1/openai/chat/completions')
    expect((init?.headers as Record<string, string>).Authorization).toBe('Bearer secret-key')
    const body = JSON.parse(String(init?.body)) as Record<string, unknown>
    expect(body.model).toBe('account-accessible-vision-model')
    const messages = body.messages as Array<Record<string, unknown>>
    const content = messages[0]!.content as Array<Record<string, unknown>>
    expect(content.filter((part) => part.type === 'image_url')).toHaveLength(2)
    expect(JSON.stringify(body)).not.toContain('secret-key')
  })

  it('requires runtime-selected model and bounded image count', async () => {
    await expect(deepinfraVision({ apiKey: 'x', model: '', prompt: 'Analyze.', images: [{ mimeType: 'image/jpeg', url: 'https://example.test/a.jpg' }] }))
      .rejects.toThrow('Orchestra-selected model')
    await expect(deepinfraVision({ apiKey: 'x', model: 'vision-model', prompt: 'Analyze.', images: [] }))
      .rejects.toThrow('between 1 and 12 images')
  })

  it('rejects oversized local frames before a provider call', async () => {
    globalThis.fetch = vi.fn() as unknown as typeof fetch
    await expect(deepinfraVision({
      apiKey: 'x',
      model: 'vision-model',
      prompt: 'Analyze.',
      images: [{ mimeType: 'image/jpeg', data: Buffer.alloc(20 * 1024 * 1024 + 1) }],
    })).rejects.toThrow('exceeds 20MB')
    expect(globalThis.fetch).not.toHaveBeenCalled()
  })
})
