import { createHash } from 'node:crypto'
import { z } from 'zod'

export const RAG_NAMESPACE_PATTERN = /^[a-zA-Z0-9][a-zA-Z0-9._:-]*$/
export const RAG_MAX_SOURCE_CHARACTERS = 2_000_000
export const RAG_DEFAULT_CHUNK_SIZE = 1_200
export const RAG_DEFAULT_CHUNK_OVERLAP = 200

export const RagIngestRequestSchema = z.object({
  namespace: z.string().trim().min(1).max(100).regex(RAG_NAMESPACE_PATTERN),
  sourceId: z.string().trim().min(1).max(500),
  title: z.string().trim().min(1).max(1_000).optional(),
  url: z.string().url().max(4_000).optional(),
  text: z.string().trim().min(1).max(RAG_MAX_SOURCE_CHARACTERS),
  metadata: z.record(z.string(), z.unknown()).optional(),
  chunkSize: z.number().int().min(200).max(4_000).default(RAG_DEFAULT_CHUNK_SIZE),
  chunkOverlap: z.number().int().min(0).max(800).default(RAG_DEFAULT_CHUNK_OVERLAP),
}).superRefine((value, context) => {
  if (value.chunkOverlap >= value.chunkSize) {
    context.addIssue({
      code: 'custom',
      path: ['chunkOverlap'],
      message: 'chunkOverlap must be smaller than chunkSize',
    })
  }
})

export const RagSearchRequestSchema = z.object({
  namespace: z.string().trim().min(1).max(100).regex(RAG_NAMESPACE_PATTERN),
  query: z.string().trim().min(1).max(20_000),
  topK: z.number().int().min(1).max(50).default(8),
  minScore: z.number().min(0).max(1).default(0),
  rerank: z.boolean().default(true),
  answer: z.boolean().default(true),
})

export type RagIngestRequest = z.infer<typeof RagIngestRequestSchema>
export type RagSearchRequest = z.infer<typeof RagSearchRequestSchema>

export interface RagChunk {
  index: number
  text: string
  start: number
  end: number
  hash: string
  citationId: string
}

function sha256(value: string): string {
  return createHash('sha256').update(value, 'utf8').digest('hex')
}

function nearestBoundary(text: string, proposedEnd: number, minimumEnd: number): number {
  if (proposedEnd >= text.length) return text.length
  const candidates = [
    text.lastIndexOf('\n\n', proposedEnd),
    text.lastIndexOf('\n', proposedEnd),
    text.lastIndexOf('. ', proposedEnd),
    text.lastIndexOf(' ', proposedEnd),
  ].filter((value) => value >= minimumEnd)
  const best = Math.max(...candidates, -1)
  if (best < minimumEnd) return proposedEnd
  return text.startsWith('\n\n', best) ? best + 2 : best + 1
}

export function chunkRagText(input: {
  sourceId: string
  text: string
  chunkSize?: number
  chunkOverlap?: number
}): RagChunk[] {
  const text = input.text.replace(/\r\n?/g, '\n').trim()
  const chunkSize = input.chunkSize ?? RAG_DEFAULT_CHUNK_SIZE
  const chunkOverlap = input.chunkOverlap ?? RAG_DEFAULT_CHUNK_OVERLAP
  if (!text) throw new Error('RAG source text is empty')
  if (!Number.isInteger(chunkSize) || chunkSize < 200 || chunkSize > 4_000) throw new Error('RAG chunkSize is invalid')
  if (!Number.isInteger(chunkOverlap) || chunkOverlap < 0 || chunkOverlap >= chunkSize) throw new Error('RAG chunkOverlap is invalid')

  const chunks: RagChunk[] = []
  let start = 0
  while (start < text.length) {
    const proposedEnd = Math.min(text.length, start + chunkSize)
    const end = nearestBoundary(text, proposedEnd, start + Math.floor(chunkSize * 0.55))
    const chunkText = text.slice(start, end).trim()
    if (chunkText) {
      const index = chunks.length
      chunks.push({
        index,
        text: chunkText,
        start,
        end,
        hash: sha256(chunkText),
        citationId: `${input.sourceId}#chunk-${index}`,
      })
    }
    if (end >= text.length) break
    const nextStart = Math.max(start + 1, end - chunkOverlap)
    start = nextStart
  }
  return chunks
}

export function ragCollectionForDimensions(baseCollection: string, dimensions: number): string {
  if (!Number.isInteger(dimensions) || dimensions < 1 || dimensions > 65_536) {
    throw new Error('RAG embedding dimensions are invalid')
  }
  const base = baseCollection.trim().replace(/[^a-zA-Z0-9_-]/g, '_').slice(0, 180)
  if (!base) throw new Error('RAG collection base is empty')
  return `${base}_d${dimensions}`
}

export function ragPointId(input: {
  appSlug: string
  namespace: string
  sourceId: string
  chunkHash: string
}): string {
  const hex = sha256(`${input.appSlug}\u0000${input.namespace}\u0000${input.sourceId}\u0000${input.chunkHash}`).slice(0, 32)
  return `${hex.slice(0, 8)}-${hex.slice(8, 12)}-4${hex.slice(13, 16)}-a${hex.slice(17, 20)}-${hex.slice(20, 32)}`
}

export function ragIsolationFilter(appSlug: string, namespace: string): Record<string, unknown> {
  if (!appSlug.trim()) throw new Error('RAG appSlug is required')
  if (!RAG_NAMESPACE_PATTERN.test(namespace)) throw new Error('RAG namespace is invalid')
  return {
    must: [
      { key: 'appSlug', match: { value: appSlug } },
      { key: 'namespace', match: { value: namespace } },
    ],
  }
}

export function ragNamespaceAllowed(grantedNamespaces: readonly string[], namespace: string): boolean {
  return grantedNamespaces.includes('*') || grantedNamespaces.includes(namespace)
}
