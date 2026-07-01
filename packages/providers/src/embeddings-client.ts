/**
 * Together AI embeddings client — generates vector embeddings for RAG.
 *
 * Uses Together AI's multilingual text embedding models to generate
 * coordinate vectors that are then stored in Qdrant.
 */

import { getTogetherApiKey, TOGETHER_BASE_URL, TOGETHER_EMBEDDING_MODEL } from '@amarktai/core'

// ── Types ─────────────────────────────────────────────────────────────────────

export interface EmbeddingRequest {
  texts: string[]
  model?: string
}

export interface EmbeddingResponse {
  embeddings: number[][]
  model: string
  usage: { promptTokens: number; totalTokens: number }
}

// ── Generate Embeddings ───────────────────────────────────────────────────────

export async function generateEmbeddings(request: EmbeddingRequest): Promise<EmbeddingResponse> {
  const apiKey = getTogetherApiKey()
  const model = request.model ?? TOGETHER_EMBEDDING_MODEL

  const response = await fetch(`${TOGETHER_BASE_URL}/embeddings`, {
    method: 'POST',
    headers: {
      'Authorization': `Bearer ${apiKey}`,
      'Content-Type': 'application/json',
    },
    body: JSON.stringify({
      model,
      input: request.texts,
    }),
  })

  if (!response.ok) {
    const errBody = await response.text()
    throw new Error(`Together embeddings error ${response.status}: ${errBody}`)
  }

  const data = await response.json() as Record<string, unknown>
  const rawData = data.data as Array<Record<string, unknown>> ?? []
  const usage = data.usage as Record<string, number> | undefined

  const embeddings = rawData.map((item) => item.embedding as number[])

  return {
    embeddings,
    model: (data.model as string) ?? model,
    usage: {
      promptTokens: usage?.prompt_tokens ?? 0,
      totalTokens: usage?.total_tokens ?? 0,
    },
  }
}
