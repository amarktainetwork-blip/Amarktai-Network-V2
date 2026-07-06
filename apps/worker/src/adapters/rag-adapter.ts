/**
 * RAG adapter — real operational pipeline for rag.ingest and rag.search.
 *
 * rag.ingest: Parses text blocks → generates embeddings via Together AI
 *             → seeds vectors into Qdrant collection points.
 *
 * rag.search: Generates query embedding → searches Qdrant for similar vectors
 *             → returns accurate citation strings in response structures.
 */

import { saveArtifact } from '@amarktai/artifacts'
import { prisma } from '@amarktai/db'
import {
  generateEmbeddings,
  upsertPoints,
  searchVectors,
  ensureCollection,
  type QdrantPoint,
  type QdrantSearchResult,
} from '@amarktai/providers'
import { QDRANT_COLLECTION } from '@amarktai/core'
import { randomUUID } from 'crypto'
import type { ProviderAdapter, ProviderExecutionContext, ProviderExecutionResult } from './provider-adapter.js'

// ── Adapter ───────────────────────────────────────────────────────────────────

export class RagAdapter implements ProviderAdapter {
  name = 'qdrant-rag'
  supportedPrefixes = ['rag']

  async execute(context: ProviderExecutionContext): Promise<ProviderExecutionResult> {
    switch (context.capability) {
      case 'rag_ingest':
        return this.executeIngest(context)
      case 'rag_search':
        return this.executeSearch(context)
      default:
        throw new Error(`RAG adapter does not support capability: ${context.capability}`)
    }
  }

  // ── RAG Ingest ────────────────────────────────────────────────────────────

  private async executeIngest(context: ProviderExecutionContext): Promise<ProviderExecutionResult> {
    await this.updateJobStatus(context, 'processing', 10)

    // Parse text blocks from input
    const textBlocks = this.extractTextBlocks(context)
    if (textBlocks.length === 0) {
      throw new Error('rag.ingest requires text content in prompt or input.textBlocks')
    }

    await this.updateJobStatus(context, 'processing', 20)

    // Ensure Qdrant collection exists
    const collection = (context.input.collection as string) ?? QDRANT_COLLECTION
    await ensureCollection(collection)

    await this.updateJobStatus(context, 'processing', 30)

    // Generate embeddings via Together AI
    const embeddingResult = await generateEmbeddings({ texts: textBlocks })

    await this.updateJobStatus(context, 'processing', 60)

    // Build Qdrant points with metadata
    const points: QdrantPoint[] = textBlocks.map((text, i) => ({
      id: randomUUID(),
      vector: embeddingResult.embeddings[i]!,
      payload: {
        text,
        appSlug: context.appSlug,
        capability: 'rag_ingest',
        index: i,
        ingestedAt: new Date().toISOString(),
        ...(context.input.metadata as Record<string, unknown> ?? {}),
      },
    }))

    // Upsert to Qdrant
    await upsertPoints(points, collection)

    await this.updateJobStatus(context, 'processing', 90)

    // Save ingest receipt as artifact
    const receipt = {
      collection,
      pointsIngested: points.length,
      embeddingModel: embeddingResult.model,
      usage: embeddingResult.usage,
      ingestedAt: new Date().toISOString(),
    }
    const receiptBuffer = Buffer.from(JSON.stringify(receipt, null, 2), 'utf-8')

    const artifact = await saveArtifact({
      input: {
        appSlug: context.appSlug,
        type: 'document',
        subType: 'rag_ingest',
        title: `RAG ingest receipt for ${context.appSlug}`,
        description: `Ingested ${points.length} text blocks into ${collection}`,
        provider: 'qdrant',
        model: embeddingResult.model,
        traceId: context.traceId,
        mimeType: 'application/json',
        metadata: { capability: 'rag_ingest', collection, pointsIngested: points.length },
      },
      data: receiptBuffer,
      explicitMimeType: 'application/json',
    })

    return {
      success: true,
      provider: 'qdrant',
      model: embeddingResult.model,
      artifactId: artifact.id,
      output: JSON.stringify(receipt),
      metadata: {
        artifactId: artifact.id,
        pointsIngested: points.length,
        collection,
        usage: embeddingResult.usage,
      },
    }
  }

  // ── RAG Search ────────────────────────────────────────────────────────────

  private async executeSearch(context: ProviderExecutionContext): Promise<ProviderExecutionResult> {
    await this.updateJobStatus(context, 'processing', 10)

    const query = context.prompt.trim()
    if (!query) {
      throw new Error('rag.search requires a query in the prompt field')
    }

    const limit = (context.input.limit as number) ?? 5
    const collection = (context.input.collection as string) ?? QDRANT_COLLECTION

    await this.updateJobStatus(context, 'processing', 20)

    // Generate query embedding
    const embeddingResult = await generateEmbeddings({ texts: [query] })
    const queryVector = embeddingResult.embeddings[0]!

    await this.updateJobStatus(context, 'processing', 50)

    // Search Qdrant
    const searchResults = await searchVectors(queryVector, limit, collection)

    await this.updateJobStatus(context, 'processing', 80)

    // Build citation strings from results
    const citations = searchResults.map((r: QdrantSearchResult, i: number) => ({
      rank: i + 1,
      score: r.score,
      text: (r.payload.text as string) ?? '',
      source: (r.payload.source as string) ?? (r.payload.url as string) ?? 'unknown',
      metadata: r.payload,
    }))

    const responseText = citations
      .map((c) => `[${c.rank}] (score: ${c.score.toFixed(3)}) ${c.text}`)
      .join('\n\n')

    // Save search results as artifact
    const resultBuffer = Buffer.from(JSON.stringify({ query, citations }, null, 2), 'utf-8')

    const artifact = await saveArtifact({
      input: {
        appSlug: context.appSlug,
        type: 'document',
        subType: 'rag_search',
        title: `RAG search results for: ${query.slice(0, 50)}`,
        description: `Found ${citations.length} results from ${collection}`,
        provider: 'qdrant',
        model: 'm2-bert-80M',
        traceId: context.traceId,
        mimeType: 'application/json',
        metadata: { capability: 'rag_search', collection, resultCount: citations.length },
      },
      data: resultBuffer,
      explicitMimeType: 'application/json',
    })

    return {
      success: true,
      provider: 'qdrant',
      model: 'm2-bert-80M',
      artifactId: artifact.id,
      output: responseText,
      metadata: {
        artifactId: artifact.id,
        citations,
        collection,
        usage: embeddingResult.usage,
      },
    }
  }

  // ── Helpers ───────────────────────────────────────────────────────────────

  private extractTextBlocks(context: ProviderExecutionContext): string[] {
    // From input.textBlocks array
    const blocks = context.input.textBlocks as string[] | undefined
    if (blocks && blocks.length > 0) return blocks

    // From prompt (split by double newlines)
    if (context.prompt) {
      const segments = context.prompt.split(/\n\n+/).filter((s) => s.trim().length > 10)
      if (segments.length > 0) return segments
    }

    return []
  }

  private async updateJobStatus(
    context: ProviderExecutionContext,
    status: string,
    progress: number,
  ): Promise<void> {
    try {
      await prisma.job.update({
        where: { id: context.jobId },
        data: {
          status,
          progress,
          ...(status === 'processing' ? { startedAt: new Date() } : {}),
        },
      })
    } catch { /* non-critical */ }
  }
}
