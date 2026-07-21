import { describe, expect, it, vi } from 'vitest'
import { AmarktAIClient } from './index.js'

describe('AmarktAIClient research methods', () => {
  it('starts and polls governed research without execution authority fields', async () => {
    const transport = vi.fn(async (_url: string, _init?: RequestInit) => new Response(JSON.stringify({ status: 'processing' }), {
      status: 200,
      headers: { 'content-type': 'application/json' },
    }))
    const client = new AmarktAIClient({ apiKey: 'app-key', baseUrl: 'https://example.test', fetch: transport as typeof fetch })
    const payload = {
      query: 'Compare current evidence about governed AI orchestration.',
      mode: 'deep' as const,
      seedUrls: ['https://example.com/source'],
      allowedDomains: ['example.com'],
      blockedDomains: ['blocked.example.com'],
      maxSearchResults: 10,
      maxPages: 8,
      maxDepth: 1,
      maxBytesPerPage: 1_500_000,
      freshnessDays: 30,
      language: 'en',
      safeSearch: 'strict' as const,
      answer: true,
      includeSnapshots: true,
      metadata: { purpose: 'market_research' },
    }

    await client.executeResearch(payload)
    await client.researchExecution('execution / one')

    expect(transport.mock.calls.map((call) => call[0])).toEqual([
      'https://example.test/api/v1/research/executions',
      'https://example.test/api/v1/research/executions/execution%20%2F%20one',
    ])
    expect(transport.mock.calls[0]![1]?.method).toBe('POST')
    expect(transport.mock.calls[1]![1]?.method).toBeUndefined()
    const body = JSON.parse(String(transport.mock.calls[0]![1]?.body)) as Record<string, unknown>
    expect(body).toEqual(payload)
    for (const field of ['appSlug', 'provider', 'model', 'route', 'executorId', 'endpoint', 'apiKey', 'ragNamespace']) {
      expect(body).not.toHaveProperty(field)
    }
  })
})
