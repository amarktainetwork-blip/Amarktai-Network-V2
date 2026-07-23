import { getSearxngUrl, RESEARCH_SEARCH_TIMEOUT_MS } from '@amarktai/core/config'
import {
  ResearchSearchResultSchema,
  normalizeResearchUrl,
  researchDomainAllowed,
  type ResearchRequest,
  type ResearchSearchResult,
} from '@amarktai/core/research-platform'

interface SearxngRawResult {
  title?: unknown
  url?: unknown
  content?: unknown
  engine?: unknown
  engines?: unknown
  publishedDate?: unknown
  score?: unknown
}

interface SearxngRawResponse {
  query?: unknown
  number_of_results?: unknown
  results?: unknown
  answers?: unknown
  corrections?: unknown
  suggestions?: unknown
  unresponsive_engines?: unknown
}

export interface SearxngSearchEvidence {
  query: string
  queryHashInput: string
  resultCount: number
  unresponsiveEngines: string[]
}

export interface SearxngSearchResponse {
  results: ResearchSearchResult[]
  evidence: SearxngSearchEvidence
}

function publishedAt(value: unknown): string | null {
  if (typeof value !== 'string' || !value.trim()) return null
  const parsed = new Date(value)
  return Number.isNaN(parsed.getTime()) ? null : parsed.toISOString()
}

function timeRange(freshnessDays: number | undefined): 'day' | 'month' | 'year' | undefined {
  if (!freshnessDays) return undefined
  if (freshnessDays <= 1) return 'day'
  if (freshnessDays <= 31) return 'month'
  return 'year'
}

function safeSearch(level: ResearchRequest['safeSearch']): string {
  return level === 'strict' ? '2' : level === 'moderate' ? '1' : '0'
}

export async function searxngSearch(request: ResearchRequest): Promise<SearxngSearchResponse> {
  const endpoint = new URL('/search', `${getSearxngUrl()}/`)
  endpoint.searchParams.set('q', request.query)
  endpoint.searchParams.set('format', 'json')
  endpoint.searchParams.set('language', request.language)
  endpoint.searchParams.set('safesearch', safeSearch(request.safeSearch))
  endpoint.searchParams.set('categories', 'general')
  const range = timeRange(request.freshnessDays)
  if (range) endpoint.searchParams.set('time_range', range)

  const response = await fetch(endpoint, {
    method: 'GET',
    headers: {
      Accept: 'application/json',
      'User-Agent': 'AmarktAI-Network/1.0',
    },
    signal: AbortSignal.timeout(RESEARCH_SEARCH_TIMEOUT_MS),
  })
  if (!response.ok) {
    const detail = (await response.text()).slice(0, 2_000)
    throw new Error(`SearXNG search failed (${response.status}): ${detail}`)
  }
  const raw = await response.json() as SearxngRawResponse
  if (!Array.isArray(raw.results)) throw new Error('SearXNG response does not contain a result array.')

  const seen = new Set<string>()
  const results: ResearchSearchResult[] = []
  for (const entry of raw.results as SearxngRawResult[]) {
    if (results.length >= request.maxSearchResults) break
    if (typeof entry.url !== 'string' || typeof entry.title !== 'string') continue
    let canonicalUrl: string
    try {
      canonicalUrl = normalizeResearchUrl(entry.url)
    } catch {
      continue
    }
    const url = new URL(canonicalUrl)
    if (!researchDomainAllowed({
      hostname: url.hostname,
      allowedDomains: request.allowedDomains,
      blockedDomains: request.blockedDomains,
    })) continue
    if (seen.has(canonicalUrl)) continue
    seen.add(canonicalUrl)
    const parsed = ResearchSearchResultSchema.safeParse({
      rank: results.length + 1,
      title: entry.title.trim(),
      url: entry.url,
      canonicalUrl,
      snippet: typeof entry.content === 'string' ? entry.content.trim().slice(0, 10_000) : '',
      engine: typeof entry.engine === 'string'
        ? entry.engine
        : Array.isArray(entry.engines) && typeof entry.engines[0] === 'string'
          ? entry.engines[0]
          : null,
      publishedAt: publishedAt(entry.publishedDate),
      score: typeof entry.score === 'number' && Number.isFinite(entry.score) ? entry.score : null,
    })
    if (parsed.success) results.push(parsed.data)
  }

  const unresponsiveEngines = Array.isArray(raw.unresponsive_engines)
    ? raw.unresponsive_engines.flatMap((entry) => Array.isArray(entry) && typeof entry[0] === 'string' ? [entry[0]] : typeof entry === 'string' ? [entry] : [])
    : []

  return {
    results,
    evidence: {
      query: request.query,
      queryHashInput: `${request.query}\0${request.language}\0${request.safeSearch}\0${range ?? 'all'}`,
      resultCount: results.length,
      unresponsiveEngines,
    },
  }
}
