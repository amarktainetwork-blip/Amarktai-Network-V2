/**
 * Qdrant vector database client — live integration for RAG operations.
 *
 * Manages dimension-safe collections, vector ingestion, and similarity search
 * against the configured Qdrant instance.
 */

import { getQdrantUrl, getQdrantApiKey, QDRANT_COLLECTION, EMBEDDING_DIMENSIONS } from '@amarktai/core'

export interface QdrantPoint {
  id: string
  vector: number[]
  payload: Record<string, unknown>
}

export interface QdrantSearchResult {
  id: string
  score: number
  payload: Record<string, unknown>
}

export interface QdrantUpsertResult {
  operationId: number
  status: string
}

function getHeaders(): Record<string, string> {
  const headers: Record<string, string> = { 'Content-Type': 'application/json' }
  const apiKey = getQdrantApiKey()
  if (apiKey) headers['api-key'] = apiKey
  return headers
}

async function qdrantFetch(path: string, options: RequestInit = {}): Promise<Response> {
  const url = `${getQdrantUrl()}${path}`
  return fetch(url, {
    ...options,
    headers: { ...getHeaders(), ...options.headers as Record<string, string> },
  })
}

function assertDimensions(dimensions: number): void {
  if (!Number.isInteger(dimensions) || dimensions < 1 || dimensions > 65_536) {
    throw new Error(`Qdrant vector dimensions are invalid: ${dimensions}`)
  }
}

export async function ensureCollection(
  name: string = QDRANT_COLLECTION,
  dimensions: number = EMBEDDING_DIMENSIONS,
): Promise<void> {
  assertDimensions(dimensions)
  const checkResp = await qdrantFetch(`/collections/${name}`)
  if (checkResp.ok) {
    const body = await checkResp.json().catch(() => null) as Record<string, unknown> | null
    const result = body?.result as Record<string, unknown> | undefined
    const config = result?.config as Record<string, unknown> | undefined
    const params = config?.params as Record<string, unknown> | undefined
    const vectors = params?.vectors as Record<string, unknown> | undefined
    const existingSize = Number(vectors?.size ?? 0)
    if (existingSize > 0 && existingSize !== dimensions) {
      throw new Error(`Qdrant collection '${name}' has ${existingSize} dimensions, expected ${dimensions}`)
    }
    return
  }
  if (checkResp.status !== 404) {
    const errBody = await checkResp.text()
    throw new Error(`Qdrant collection check error ${checkResp.status}: ${errBody}`)
  }

  const createResp = await qdrantFetch(`/collections/${name}`, {
    method: 'PUT',
    body: JSON.stringify({ vectors: { size: dimensions, distance: 'Cosine' } }),
  })
  if (!createResp.ok) {
    const errBody = await createResp.text()
    throw new Error(`Qdrant create collection error ${createResp.status}: ${errBody}`)
  }
}

export async function upsertPoints(
  points: QdrantPoint[],
  collection: string = QDRANT_COLLECTION,
): Promise<QdrantUpsertResult> {
  if (points.length === 0) throw new Error('Qdrant upsert requires at least one point')
  const dimensions = points[0]!.vector.length
  assertDimensions(dimensions)
  for (const point of points) {
    if (!point.id || point.vector.length !== dimensions || point.vector.some((value) => !Number.isFinite(value))) {
      throw new Error('Qdrant point vectors must be finite and have identical dimensions')
    }
  }
  await ensureCollection(collection, dimensions)

  const response = await qdrantFetch(`/collections/${collection}/points?wait=true`, {
    method: 'PUT',
    body: JSON.stringify({ points }),
  })
  if (!response.ok) {
    const errBody = await response.text()
    throw new Error(`Qdrant upsert error ${response.status}: ${errBody}`)
  }
  const data = await response.json() as Record<string, unknown>
  return {
    operationId: (data.result as Record<string, number>)?.operation_id ?? 0,
    status: (data.status as string) ?? 'ok',
  }
}

export async function deletePointsByFilter(
  filter: Record<string, unknown>,
  collection: string = QDRANT_COLLECTION,
): Promise<QdrantUpsertResult> {
  if (!filter || typeof filter !== 'object' || Array.isArray(filter)) throw new Error('Qdrant deletion requires an explicit filter')
  const response = await qdrantFetch(`/collections/${collection}/points/delete?wait=true`, {
    method: 'POST',
    body: JSON.stringify({ filter }),
  })
  if (response.status === 404) return { operationId: 0, status: 'collection_missing' }
  if (!response.ok) {
    const errBody = await response.text()
    throw new Error(`Qdrant filtered delete error ${response.status}: ${errBody}`)
  }
  const data = await response.json() as Record<string, unknown>
  return { operationId: (data.result as Record<string, number>)?.operation_id ?? 0, status: (data.status as string) ?? 'ok' }
}

export async function searchVectors(
  vector: number[],
  limit: number = 5,
  collection: string = QDRANT_COLLECTION,
  filter?: Record<string, unknown>,
  scoreThreshold?: number,
): Promise<QdrantSearchResult[]> {
  assertDimensions(vector.length)
  if (vector.some((value) => !Number.isFinite(value))) throw new Error('Qdrant search vector must be finite')
  if (!Number.isInteger(limit) || limit < 1 || limit > 100) throw new Error('Qdrant search limit must be between 1 and 100')
  if (scoreThreshold !== undefined && (!Number.isFinite(scoreThreshold) || scoreThreshold < 0 || scoreThreshold > 1)) {
    throw new Error('Qdrant score threshold must be between 0 and 1')
  }
  const body: Record<string, unknown> = { vector, limit, with_payload: true }
  if (filter) body.filter = filter
  if (scoreThreshold !== undefined) body.score_threshold = scoreThreshold

  const response = await qdrantFetch(`/collections/${collection}/points/search`, {
    method: 'POST',
    body: JSON.stringify(body),
  })
  if (!response.ok) {
    const errBody = await response.text()
    throw new Error(`Qdrant search error ${response.status}: ${errBody}`)
  }
  const data = await response.json() as Record<string, unknown>
  const results = data.result as Array<Record<string, unknown>> ?? []
  return results.map((result) => ({
    id: String(result.id),
    score: Number(result.score),
    payload: (result.payload as Record<string, unknown>) ?? {},
  })).filter((result) => Number.isFinite(result.score))
}

export async function getCollectionInfo(collection: string = QDRANT_COLLECTION): Promise<{
  pointsCount: number
  segmentsCount: number
  status: string
} | null> {
  const response = await qdrantFetch(`/collections/${collection}`)
  if (!response.ok) return null
  const data = await response.json() as Record<string, unknown>
  const result = data.result as Record<string, unknown> ?? {}
  return {
    pointsCount: (result.points_count as number) ?? 0,
    segmentsCount: (result.segments_count as number) ?? 0,
    status: (result.status as string) ?? 'unknown',
  }
}
