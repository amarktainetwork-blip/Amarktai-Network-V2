import { afterEach, describe, expect, it, vi } from 'vitest'
import { ResearchRequestSchema } from '@amarktai/core/research-platform'
import { searxngSearch } from '@amarktai/providers'

afterEach(() => {
  vi.unstubAllGlobals()
  delete process.env.SEARXNG_URL
})

describe('SearXNG governed search transport', () => {
  it('normalizes, filters and deduplicates provider results', async () => {
    process.env.SEARXNG_URL = 'http://searxng:8080/'
    const fetchMock = vi.fn(async (input: string | URL | Request) => {
      const url = new URL(typeof input === 'string' || input instanceof URL ? input.toString() : input.url)
      expect(url.origin).toBe('http://searxng:8080')
      expect(url.pathname).toBe('/search')
      expect(url.searchParams.get('q')).toBe('current market evidence')
      expect(url.searchParams.get('format')).toBe('json')
      expect(url.searchParams.get('language')).toBe('en')
      expect(url.searchParams.get('safesearch')).toBe('2')
      expect(url.searchParams.get('time_range')).toBe('month')
      return new Response(JSON.stringify({
        results: [
          {
            title: 'Allowed report',
            url: 'https://EXAMPLE.com/report/?z=2&a=1#section',
            content: 'Evidence summary',
            engine: 'fixture-engine',
            publishedDate: '2026-07-01T00:00:00Z',
            score: 9.5,
          },
          {
            title: 'Duplicate report',
            url: 'https://example.com/report?a=1&z=2',
            content: 'Duplicate',
          },
          {
            title: 'Blocked domain',
            url: 'https://blocked.example.com/report',
            content: 'Must be excluded',
          },
          {
            title: 'Insecure result',
            url: 'http://example.com/insecure',
            content: 'Must be excluded',
          },
          {
            title: 'Unlisted domain',
            url: 'https://outside.test/report',
            content: 'Must be excluded',
          },
        ],
        unresponsive_engines: [['slow-engine', 'timeout']],
      }), { status: 200, headers: { 'content-type': 'application/json' } })
    })
    vi.stubGlobal('fetch', fetchMock)

    const request = ResearchRequestSchema.parse({
      query: 'current market evidence',
      freshnessDays: 30,
      allowedDomains: ['example.com'],
      blockedDomains: ['blocked.example.com'],
      maxSearchResults: 10,
    })
    const result = await searxngSearch(request)

    expect(result.results).toEqual([{
      rank: 1,
      title: 'Allowed report',
      url: 'https://EXAMPLE.com/report/?z=2&a=1#section',
      canonicalUrl: 'https://example.com/report?a=1&z=2',
      snippet: 'Evidence summary',
      engine: 'fixture-engine',
      publishedAt: '2026-07-01T00:00:00.000Z',
      score: 9.5,
    }])
    expect(result.evidence).toMatchObject({
      query: 'current market evidence',
      resultCount: 1,
      unresponsiveEngines: ['slow-engine'],
    })
  })

  it('maps safe-search levels and enforces result limits', async () => {
    process.env.SEARXNG_URL = 'http://searxng:8080'
    const observed: string[] = []
    vi.stubGlobal('fetch', vi.fn(async (input: string | URL | Request) => {
      const url = new URL(typeof input === 'string' || input instanceof URL ? input.toString() : input.url)
      observed.push(url.searchParams.get('safesearch') ?? '')
      return new Response(JSON.stringify({
        results: [
          { title: 'One', url: 'https://example.com/one' },
          { title: 'Two', url: 'https://example.com/two' },
        ],
      }), { status: 200 })
    }))

    const strict = await searxngSearch(ResearchRequestSchema.parse({ query: 'strict research', safeSearch: 'strict', maxSearchResults: 1 }))
    const moderate = await searxngSearch(ResearchRequestSchema.parse({ query: 'moderate research', safeSearch: 'moderate', maxSearchResults: 1 }))
    const off = await searxngSearch(ResearchRequestSchema.parse({ query: 'unfiltered research', safeSearch: 'off', maxSearchResults: 1 }))

    expect(observed).toEqual(['2', '1', '0'])
    expect(strict.results).toHaveLength(1)
    expect(moderate.results).toHaveLength(1)
    expect(off.results).toHaveLength(1)
  })

  it('fails when the internal search service returns invalid or unsuccessful output', async () => {
    process.env.SEARXNG_URL = 'http://searxng:8080'
    vi.stubGlobal('fetch', vi.fn(async () => new Response('disabled', { status: 403 })))
    await expect(searxngSearch(ResearchRequestSchema.parse({ query: 'failed search request' }))).rejects.toThrow(/SearXNG search failed/)

    vi.stubGlobal('fetch', vi.fn(async () => new Response(JSON.stringify({ results: null }), { status: 200 })))
    await expect(searxngSearch(ResearchRequestSchema.parse({ query: 'invalid search response' }))).rejects.toThrow(/result array/)
  })
})
