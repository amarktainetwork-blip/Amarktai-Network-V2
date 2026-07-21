import { describe, expect, it, vi } from 'vitest'
import { AmarktAIClient } from './index.js'

describe('AmarktAIClient RAG methods', () => {
  it('ingests, searches and polls without provider or app authority fields', async () => {
    const transport = vi.fn(async (_url: string, _init?: RequestInit) => new Response(JSON.stringify({ status: 'processing' }), {
      status: 200,
      headers: { 'content-type': 'application/json' },
    }))
    const client = new AmarktAIClient({ apiKey: 'app-key', baseUrl: 'https://example.test', fetch: transport as typeof fetch })
    const ingest = {
      namespace: 'marketing.docs',
      sourceId: 'website-home',
      title: 'Website home page',
      url: 'https://example.test/',
      text: 'Authorised source content.',
      metadata: { sourceType: 'website' },
      chunkSize: 1200,
      chunkOverlap: 200,
    }
    const search = {
      namespace: 'marketing.docs',
      query: 'What does the company offer?',
      topK: 8,
      minScore: 0.4,
      rerank: true,
      answer: true,
    }

    await client.ingestRag(ingest)
    await client.searchRag(search)
    await client.ragExecution('execution / one')

    expect(transport.mock.calls.map((call) => call[0])).toEqual([
      'https://example.test/api/v1/rag/ingest',
      'https://example.test/api/v1/rag/search',
      'https://example.test/api/v1/rag/executions/execution%20%2F%20one',
    ])
    expect(transport.mock.calls[0]![1]?.method).toBe('POST')
    expect(transport.mock.calls[1]![1]?.method).toBe('POST')
    expect(transport.mock.calls[2]![1]?.method).toBeUndefined()
    const ingestBody = JSON.parse(String(transport.mock.calls[0]![1]?.body)) as Record<string, unknown>
    const searchBody = JSON.parse(String(transport.mock.calls[1]![1]?.body)) as Record<string, unknown>
    for (const body of [ingestBody, searchBody]) {
      expect(body).not.toHaveProperty('appSlug')
      expect(body).not.toHaveProperty('provider')
      expect(body).not.toHaveProperty('model')
      expect(body).not.toHaveProperty('route')
      expect(body).not.toHaveProperty('executorId')
    }
  })
})
