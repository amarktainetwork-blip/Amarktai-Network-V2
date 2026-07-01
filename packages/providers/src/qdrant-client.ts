/**
 * Qdrant vector database client — live integration for RAG operations.
 *
 * Manages collections, vector ingestion, and similarity search
 * against the local Qdrant instance.
 */

import { getQdrantUrl, getQdrantApiKey, QDRANT_COLLECTION, EMBEDDING_DIMENSIONS } from '@amarktai/core'

// ── Types ─────────────────────────────────────────────────────────────────────

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

// ── HTTP Helpers ──────────────────────────────────────────────────────────────

function getHeaders(): Record<string, string> {
  const headers: Record<string, string> = { 'Content-Type': 'application/json' }
  const apiKey = getQdrantApiKey()
  if (apiKey) headers['api-key'] = apiKey
  return headers
}

async function qdrantFetch(path: string, options: RequestInit = {}): Promise<Response> {
  const url = `${getQdrantUrl()}${path}`
  const response = await fetch(url, {
    ...options,
    headers: { ...getHeaders(), ...options.headers as Record<string, string> },
  })
  return response
}

// ── Collection Management ─────────────────────────────────────────────────────

export async function ensureCollection(name: string = QDRANT_COLLECTION): Promise<void> {
  // Check if collection exists
  const checkResp = await qdrantFetch(`/collections/${name}`)
  if (checkResp.ok) return

  // Create collection
  const createResp = await qdrantFetch(`/collections/${name}`, {
    method: 'PUT',
    body: JSON.stringify({
      vectors: {
        size: EMBEDDING_DIMENSIONS,
        distance: 'Cosine',
      },
    }),
  })

  if (!createResp.ok) {
    const errBody = await createResp.text()
    throw new Error(`Qdrant create collection error ${createResp.status}: ${errBody}`)
  }
}

// ── Vector Ingestion ──────────────────────────────────────────────────────────

export async function upsertPoints(
  points: QdrantPoint[],
  collection: string = QDRANT_COLLECTION,
): Promise<QdrantUpsertResult> {
  await ensureCollection(collection)

  const response = await qdrantFetch(`/collections/${collection}/points`, {
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

// ── Similarity Search ─────────────────────────────────────────────────────────

export async function searchVectors(
  vector: number[],
  limit: number = 5,
  collection: string = QDRANT_COLLECTION,
  filter?: Record<string, unknown>,
): Promise<QdrantSearchResult[]> {
  const body: Record<string, unknown> = {
    vector,
    limit,
    with_payload: true,
  }
  if (filter) body.filter = filter

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

  return results.map((r) => ({
    id: r.id as string,
    score: r.score as number,
    payload: (r.payload as Record<string, unknown>) ?? {},
  }))
}

// ── Collection Info ───────────────────────────────────────────────────────────

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
