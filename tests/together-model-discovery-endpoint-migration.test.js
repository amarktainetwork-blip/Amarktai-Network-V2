import { afterEach, describe, expect, it, vi } from 'vitest'
import { discoverTogetherProviderModels } from '../packages/providers/src/model-discovery/together.ts'

const originalFetch = global.fetch

afterEach(() => {
  global.fetch = originalFetch
  vi.restoreAllMocks()
})

describe('Together model discovery endpoint migration', () => {
  it('retries the canonical /v1/models endpoint when the legacy URL returns non-JSON HTML', async () => {
    const calls = []

    global.fetch = vi.fn(async (url, init) => {
      calls.push({ url: String(url), headers: init?.headers })

      if (calls.length === 1) {
        return {
          ok: true,
          status: 200,
          json: async () => {
            throw new SyntaxError("Unexpected token '<', \"<!DOCTYPE \"... is not valid JSON")
          },
        }
      }

      return {
        ok: true,
        status: 200,
        json: async () => ([
          {
            id: 'meta-llama/Llama-3.3-70B-Instruct-Turbo',
            type: 'chat',
            display_name: 'Llama 3.3 70B Instruct Turbo',
            context_length: 131072,
          },
        ]),
      }
    })

    const result = await discoverTogetherProviderModels({
      live: true,
      apiKey: 'test-key',
      now: '2026-07-15T00:00:00.000Z',
    })

    expect(calls.map((call) => call.url)).toEqual([
      'https://api.together.ai/models',
      'https://api.together.ai/v1/models',
    ])
    expect(calls[0].headers.Authorization).toBe('Bearer test-key')
    expect(calls[1].headers.Authorization).toBe('Bearer test-key')
    expect(result.liveDiscoverySucceeded).toBe(true)
    expect(result.returnedModelCount).toBe(1)
    expect(result.endpointSource).toBe('https://api.together.ai/v1/models')
    expect(result.models[0].endpointSource).toBe('https://api.together.ai/v1/models')
    expect(JSON.stringify(result)).not.toContain('test-key')
  })
})
