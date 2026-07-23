import { describe, expect, it } from 'vitest'
import {
  RagIngestRequestSchema,
  RagSearchRequestSchema,
  chunkRagText,
  ragCollectionForDimensions,
  ragIsolationFilter,
  ragNamespaceAllowed,
  ragPointId,
} from '../packages/core/src/rag-platform.ts'

describe('canonical RAG platform contract', () => {
  it('validates bounded namespaced ingest and search requests', () => {
    expect(RagIngestRequestSchema.safeParse({
      namespace: 'marketing.docs',
      sourceId: 'homepage',
      text: 'A useful authorised source document.',
    }).success).toBe(true)
    expect(RagIngestRequestSchema.safeParse({
      namespace: '../other-app',
      sourceId: 'x',
      text: 'text',
    }).success).toBe(false)
    expect(RagIngestRequestSchema.safeParse({
      namespace: 'marketing',
      sourceId: 'x',
      text: 'text',
      chunkSize: 500,
      chunkOverlap: 500,
    }).success).toBe(false)
    expect(RagSearchRequestSchema.safeParse({
      namespace: 'marketing',
      query: 'What is the refund policy?',
      topK: 8,
      minScore: 0.5,
      rerank: true,
      answer: true,
    }).success).toBe(true)
  })

  it('chunks deterministically with bounded overlap and stable citations', () => {
    const text = Array.from({ length: 120 }, (_, index) => `Paragraph ${index}. This is authorised source content for retrieval.`).join('\n\n')
    const first = chunkRagText({ sourceId: 'source-1', text, chunkSize: 500, chunkOverlap: 80 })
    const second = chunkRagText({ sourceId: 'source-1', text, chunkSize: 500, chunkOverlap: 80 })
    expect(first).toEqual(second)
    expect(first.length).toBeGreaterThan(1)
    expect(first.map((chunk) => chunk.citationId)).toEqual(first.map((_, index) => `source-1#chunk-${index}`))
    expect(first.every((chunk) => chunk.text.length > 0 && chunk.hash.length === 64)).toBe(true)
    for (let index = 1; index < first.length; index++) {
      expect(first[index]!.start).toBeLessThan(first[index - 1]!.end)
      expect(first[index]!.start).toBeGreaterThan(first[index - 1]!.start)
    }
  })

  it('derives dimension-specific collections and deterministic tenant point ids', () => {
    expect(ragCollectionForDimensions('amarktai_knowledge', 1024)).toBe('amarktai_knowledge_d1024')
    expect(ragCollectionForDimensions('amarktai_knowledge', 1536)).toBe('amarktai_knowledge_d1536')
    const input = { appSlug: 'marketing-app', namespace: 'brand', sourceId: 'site', chunkHash: 'abc' }
    expect(ragPointId(input)).toBe(ragPointId(input))
    expect(ragPointId(input)).toMatch(/^[0-9a-f]{8}-[0-9a-f]{4}-4[0-9a-f]{3}-a[0-9a-f]{3}-[0-9a-f]{12}$/)
    expect(ragPointId({ ...input, appSlug: 'other-app' })).not.toBe(ragPointId(input))
    expect(ragPointId({ ...input, namespace: 'other' })).not.toBe(ragPointId(input))
  })

  it('requires both app and namespace in every vector query filter', () => {
    expect(ragIsolationFilter('marketing-app', 'brand')).toEqual({
      must: [
        { key: 'appSlug', match: { value: 'marketing-app' } },
        { key: 'namespace', match: { value: 'brand' } },
      ],
    })
    expect(ragNamespaceAllowed(['brand', 'campaigns'], 'brand')).toBe(true)
    expect(ragNamespaceAllowed(['*'], 'anything')).toBe(true)
    expect(ragNamespaceAllowed(['brand'], 'other')).toBe(false)
  })
})
