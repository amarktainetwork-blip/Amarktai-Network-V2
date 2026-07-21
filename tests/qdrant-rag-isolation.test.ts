import { afterEach, describe, expect, it, vi } from 'vitest'
import { ensureCollection, searchVectors, upsertPoints } from '../packages/providers/src/qdrant-client.ts'

afterEach(() => {
  vi.unstubAllGlobals()
  vi.restoreAllMocks()
})

describe('dimension-safe Qdrant RAG transport', () => {
  it('creates a collection with the exact runtime embedding dimensions', async () => {
    const calls: Array<{ url: string; init?: RequestInit }> = []
    vi.stubGlobal('fetch', vi.fn(async (url: string | URL | Request, init?: RequestInit) => {
      calls.push({ url: String(url), init })
      if (!init?.method) return new Response('not found', { status: 404 })
      return new Response(JSON.stringify({ result: true, status: 'ok' }), { status: 200 })
    }))

    await ensureCollection('rag_test_d3', 3)
    expect(calls).toHaveLength(2)
    expect(calls[0]!.url).toContain('/collections/rag_test_d3')
    expect(calls[1]!.init?.method).toBe('PUT')
    expect(JSON.parse(String(calls[1]!.init?.body))).toEqual({
      vectors: { size: 3, distance: 'Cosine' },
    })
  })

  it('rejects mixed vector dimensions before an upsert request', async () => {
    const transport = vi.fn()
    vi.stubGlobal('fetch', transport)
    await expect(upsertPoints([
      { id: 'a', vector: [1, 2], payload: {} },
      { id: 'b', vector: [1, 2, 3], payload: {} },
    ], 'rag_test_d2')).rejects.toThrow('identical dimensions')
    expect(transport).not.toHaveBeenCalled()
  })

  it('waits for durable upsert and sends the mandatory isolation filter and threshold', async () => {
    const calls: Array<{ url: string; init?: RequestInit }> = []
    vi.stubGlobal('fetch', vi.fn(async (url: string | URL | Request, init?: RequestInit) => {
      calls.push({ url: String(url), init })
      if (String(url).includes('/points/search')) {
        return new Response(JSON.stringify({
          result: [{ id: 'point-1', score: 0.91, payload: { appSlug: 'app-1', namespace: 'brand' } }],
        }), { status: 200 })
      }
      if (!init?.method) {
        return new Response(JSON.stringify({ result: { config: { params: { vectors: { size: 2 } } } } }), { status: 200 })
      }
      return new Response(JSON.stringify({ result: { operation_id: 7 }, status: 'ok' }), { status: 200 })
    }))

    await upsertPoints([
      { id: 'point-1', vector: [0.1, 0.2], payload: { appSlug: 'app-1', namespace: 'brand' } },
    ], 'rag_test_d2')
    const upsert = calls.find((call) => call.url.includes('/points?wait=true'))
    expect(upsert?.init?.method).toBe('PUT')

    const filter = {
      must: [
        { key: 'appSlug', match: { value: 'app-1' } },
        { key: 'namespace', match: { value: 'brand' } },
      ],
    }
    const results = await searchVectors([0.1, 0.2], 5, 'rag_test_d2', filter, 0.7)
    const search = calls.find((call) => call.url.includes('/points/search'))
    expect(JSON.parse(String(search?.init?.body))).toEqual({
      vector: [0.1, 0.2],
      limit: 5,
      with_payload: true,
      filter,
      score_threshold: 0.7,
    })
    expect(results).toEqual([
      { id: 'point-1', score: 0.91, payload: { appSlug: 'app-1', namespace: 'brand' } },
    ])
  })
})
