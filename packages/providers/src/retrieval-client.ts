import { DEEPINFRA_OPENAI_BASE_URL, TOGETHER_BASE_URL } from '@amarktai/core'
import type { ProviderKey } from '@amarktai/core'
import { CanonicalProviderError, normalizeProviderError, providerHttpError } from './provider-errors.js'

export interface ProviderEmbeddingRequest {
  provider: Extract<ProviderKey, 'together' | 'deepinfra'>
  apiKey: string
  model: string
  texts: string[]
  dimensions?: number
  baseUrl?: string
  timeoutMs?: number
}

export interface ProviderEmbeddingResponse {
  vectors: number[][]
  model: string
  dimensions: number
  usage: { inputTokens: number; totalTokens: number; providerReportedCost: number | null; currency: string | null }
}

export interface ProviderRerankDocument { id?: string; text: string }
export interface ProviderRerankRequest {
  provider: Extract<ProviderKey, 'together' | 'deepinfra'>
  apiKey: string
  model: string
  query: string
  documents: ProviderRerankDocument[]
  topN?: number
  baseUrl?: string
  timeoutMs?: number
}

export interface ProviderRerankResponse {
  model: string
  results: Array<{ index: number; documentId: string | null; score: number }>
  usage: { inputTokens: number; totalTokens: number; providerReportedCost: number | null; currency: string | null }
}

export async function providerEmbeddings(request: ProviderEmbeddingRequest): Promise<ProviderEmbeddingResponse> {
  const defaultBase = request.provider === 'together' ? TOGETHER_BASE_URL : DEEPINFRA_OPENAI_BASE_URL
  const baseUrl = (request.baseUrl?.trim() || defaultBase).replace(/\/$/, '')
  const payload: Record<string, unknown> = { model: request.model, input: request.texts }
  if (request.dimensions !== undefined) payload.dimensions = request.dimensions
  const data = await postJson(request.provider, `${baseUrl}/embeddings`, request.apiKey, payload, request.timeoutMs)
  const items = arrayRecords(data.data).sort((left, right) => finiteNumber(left.index) - finiteNumber(right.index))
  const vectors = items.map((item) => Array.isArray(item.embedding) ? item.embedding.map(Number) : [])
  validateVectors(vectors, request.texts.length, request.provider)
  const usage = normalizeUsage(data.usage)
  return {
    vectors,
    model: typeof data.model === 'string' && data.model.trim() ? data.model : request.model,
    dimensions: vectors[0]!.length,
    usage,
  }
}

export async function providerRerank(request: ProviderRerankRequest): Promise<ProviderRerankResponse> {
  const isTogether = request.provider === 'together'
  const defaultBase = isTogether ? TOGETHER_BASE_URL : 'https://api.deepinfra.com/v1'
  const configuredBase = request.baseUrl?.trim() || defaultBase
  const baseUrl = (isTogether ? configuredBase : configuredBase.replace(/\/openai\/?$/, '')).replace(/\/$/, '')
  const url = isTogether ? `${baseUrl}/rerank` : `${baseUrl}/inference/${request.model}`
  const payload: Record<string, unknown> = {
    ...(isTogether ? { model: request.model } : {}),
    query: request.query,
    documents: request.documents.map((document) => document.text),
  }
  if (request.topN !== undefined && isTogether) payload.top_n = request.topN
  if (isTogether) payload.return_documents = false
  const data = await postJson(request.provider, url, request.apiKey, payload, request.timeoutMs)
  let results: ProviderRerankResponse['results']
  if (Array.isArray(data.results)) {
    results = arrayRecords(data.results).map((item) => ({
      index: finiteNumber(item.index),
      documentId: request.documents[finiteNumber(item.index)]?.id ?? null,
      score: Number(item.relevance_score ?? item.score),
    }))
  } else if (Array.isArray(data.scores)) {
    results = data.scores.map((score, index) => ({ index, documentId: request.documents[index]?.id ?? null, score: Number(score) }))
  } else {
    throw new CanonicalProviderError({ code: 'malformed_response', provider: request.provider, message: `${request.provider} reranking response had no results or scores` })
  }
  for (const result of results) {
    if (!Number.isInteger(result.index) || result.index < 0 || result.index >= request.documents.length) {
      throw new CanonicalProviderError({ code: 'malformed_response', provider: request.provider, message: `${request.provider} reranking returned an invalid document index` })
    }
    if (!Number.isFinite(result.score)) {
      throw new CanonicalProviderError({ code: 'malformed_response', provider: request.provider, message: `${request.provider} reranking returned a non-finite score` })
    }
  }
  results.sort((left, right) => right.score - left.score || left.index - right.index)
  if (request.topN !== undefined) results = results.slice(0, request.topN)
  return {
    model: typeof data.model === 'string' && data.model.trim() ? data.model : request.model,
    results,
    usage: normalizeUsage(data.usage),
  }
}

async function postJson(provider: string, url: string, apiKey: string, payload: Record<string, unknown>, timeoutMs = 60_000): Promise<Record<string, unknown>> {
  const controller = new AbortController()
  let timedOut = false
  const timeout = setTimeout(() => {
    timedOut = true
    controller.abort(new Error('provider timeout'))
  }, timeoutMs)
  try {
    const response = await fetch(url, {
      method: 'POST',
      headers: { Authorization: `Bearer ${apiKey}`, 'Content-Type': 'application/json', Accept: 'application/json' },
      body: JSON.stringify(payload),
      signal: controller.signal,
    })
    const body = await response.text()
    if (!response.ok) throw providerHttpError({ provider, status: response.status, body })
    try {
      const parsed = body ? JSON.parse(body) : {}
      if (!isRecord(parsed)) throw new Error('response is not an object')
      return parsed
    } catch (error) {
      throw new CanonicalProviderError({ code: 'malformed_response', provider, message: `${provider} returned unreadable retrieval JSON`, cause: error })
    }
  } catch (error) {
    if (timedOut) {
      throw new CanonicalProviderError({ code: 'provider_timeout', provider, message: `${provider} retrieval request timed out`, cause: error })
    }
    throw normalizeProviderError(provider, error)
  } finally {
    clearTimeout(timeout)
  }
}

function validateVectors(vectors: number[][], expectedCount: number, provider: string): void {
  if (vectors.length !== expectedCount || vectors.length === 0) {
    throw new CanonicalProviderError({ code: 'malformed_response', provider, message: `${provider} returned ${vectors.length} vectors for ${expectedCount} inputs` })
  }
  const dimensions = vectors[0]?.length ?? 0
  if (dimensions === 0 || vectors.some((vector) => vector.length !== dimensions || vector.some((value) => !Number.isFinite(value)))) {
    throw new CanonicalProviderError({ code: 'malformed_response', provider, message: `${provider} returned invalid or inconsistent embedding vectors` })
  }
}

function normalizeUsage(value: unknown): ProviderEmbeddingResponse['usage'] {
  const usage = isRecord(value) ? value : {}
  const inputTokens = finiteNumber(usage.prompt_tokens ?? usage.input_tokens)
  return {
    inputTokens,
    totalTokens: finiteNumber(usage.total_tokens) || inputTokens,
    providerReportedCost: nullableNumber(usage.cost ?? usage.total_cost),
    currency: typeof usage.currency === 'string' ? usage.currency : null,
  }
}

function arrayRecords(value: unknown): Record<string, unknown>[] { return Array.isArray(value) ? value.filter(isRecord) : [] }
function isRecord(value: unknown): value is Record<string, unknown> { return typeof value === 'object' && value !== null && !Array.isArray(value) }
function finiteNumber(value: unknown): number { return typeof value === 'number' && Number.isFinite(value) && value >= 0 ? value : 0 }
function nullableNumber(value: unknown): number | null { return typeof value === 'number' && Number.isFinite(value) && value >= 0 ? value : null }
