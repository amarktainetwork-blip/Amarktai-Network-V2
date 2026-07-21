import type { Queue } from 'bullmq'
import { findCompletedArtifactByTraceId, saveArtifact } from '@amarktai/artifacts'
import { QDRANT_COLLECTION, validateDirectProviderRequest } from '@amarktai/core'
import { ragCollectionForDimensions, ragIsolationFilter } from '@amarktai/core/rag-platform'
import { prisma } from '@amarktai/db'
import { searchVectors } from '@amarktai/providers'
import {
  booleanValue,
  failRagParent,
  findRagChild,
  grantFromParent,
  numberValue,
  parseAnswerOutput,
  parseEmbeddingOutput,
  parseRerankOutput,
  queueRagChild,
  safeJson,
  stringValue,
} from './rag-workflow-common.js'

interface RetrievedChunk {
  pointId: string
  citationId: string
  sourceId: string
  sourceArtifactId: string | null
  title: string | null
  url: string | null
  chunkIndex: number
  text: string
  qdrantScore: number
  rerankScore?: number
}

function retrievedFromPayload(input: {
  id: string
  score: number
  payload: Record<string, unknown>
  appSlug: string
  namespace: string
}): RetrievedChunk {
  if (input.payload.appSlug !== input.appSlug || input.payload.namespace !== input.namespace) {
    throw new Error('Qdrant returned a result outside the authorised app namespace')
  }
  const text = stringValue(input.payload.text).trim()
  const citationId = stringValue(input.payload.citationId).trim()
  const sourceId = stringValue(input.payload.sourceId).trim()
  if (!text || !citationId || !sourceId) throw new Error('Qdrant result is missing source lineage')
  return {
    pointId: input.id,
    citationId,
    sourceId,
    sourceArtifactId: stringValue(input.payload.sourceArtifactId) || null,
    title: stringValue(input.payload.title) || null,
    url: stringValue(input.payload.url) || null,
    chunkIndex: numberValue(input.payload.chunkIndex),
    text,
    qdrantScore: input.score,
  }
}

function retrievedFromMetadata(value: unknown): RetrievedChunk[] {
  if (!Array.isArray(value)) return []
  return value.map((item) => {
    if (!item || typeof item !== 'object' || Array.isArray(item)) throw new Error('Persisted RAG result is invalid')
    const record = item as Record<string, unknown>
    const chunk: RetrievedChunk = {
      pointId: stringValue(record.pointId),
      citationId: stringValue(record.citationId),
      sourceId: stringValue(record.sourceId),
      sourceArtifactId: stringValue(record.sourceArtifactId) || null,
      title: stringValue(record.title) || null,
      url: stringValue(record.url) || null,
      chunkIndex: numberValue(record.chunkIndex),
      text: stringValue(record.text),
      qdrantScore: numberValue(record.qdrantScore),
    }
    if (record.rerankScore !== undefined) chunk.rerankScore = numberValue(record.rerankScore)
    if (!chunk.pointId || !chunk.citationId || !chunk.sourceId || !chunk.text) throw new Error('Persisted RAG result has incomplete lineage')
    return chunk
  })
}

function contextFromChunks(chunks: readonly RetrievedChunk[]): string {
  return chunks.map((chunk) => [
    `[${chunk.citationId}]`,
    `Source: ${chunk.title ?? chunk.sourceId}`,
    chunk.url ? `URL: ${chunk.url}` : '',
    chunk.text,
  ].filter(Boolean).join('\n')).join('\n\n---\n\n')
}

async function finalizeSearch(input: {
  parent: NonNullable<Awaited<ReturnType<typeof prisma.job.findUnique>>>
  metadata: Record<string, unknown>
  chunks: RetrievedChunk[]
  answer?: { answer: string; supportedByContext: boolean; sourceIds: string[] }
  collection: string
  dimensions: number
}): Promise<string> {
  const existing = await findCompletedArtifactByTraceId(input.parent.traceId, 'rag_search_result')
  if (existing) {
    await prisma.job.update({
      where: { id: input.parent.id },
      data: {
        status: 'completed', workflowPhase: 'completed', progress: 100,
        artifactId: existing.id, output: JSON.stringify({ artifactId: existing.id, reused: true }),
        error: null, completedAt: input.parent.completedAt ?? new Date(),
      },
    })
    return existing.id
  }
  const parentInput = safeJson(input.parent.inputJson)
  const result = {
    version: 'rag-search-v1',
    executionId: input.parent.executionId,
    parentJobId: input.parent.id,
    appSlug: input.parent.appSlug,
    namespace: input.metadata.namespace,
    query: parentInput.query,
    collection: input.collection,
    dimensions: input.dimensions,
    answer: input.answer ?? {
      answer: input.chunks.length ? null : 'No authorised sources matched the query.',
      supportedByContext: false,
      sourceIds: [],
    },
    citations: input.chunks.map((chunk) => ({
      citationId: chunk.citationId,
      sourceId: chunk.sourceId,
      sourceArtifactId: chunk.sourceArtifactId,
      title: chunk.title,
      url: chunk.url,
      chunkIndex: chunk.chunkIndex,
      text: chunk.text,
      qdrantScore: chunk.qdrantScore,
      rerankScore: chunk.rerankScore ?? null,
    })),
    evidence: {
      queryEmbeddingJobId: input.metadata.queryEmbeddingJobId ?? null,
      rerankingJobId: input.metadata.rerankingJobId ?? null,
      answerJobId: input.metadata.answerJobId ?? null,
    },
    completedAt: new Date().toISOString(),
  }
  const artifact = await saveArtifact({
    input: {
      appSlug: input.parent.appSlug,
      type: 'document',
      subType: 'rag_search_result',
      title: `RAG search result for ${String(parentInput.query).slice(0, 120)}`,
      description: `Authorised RAG result from namespace ${String(input.metadata.namespace)}`,
      provider: 'amarktai-network',
      model: 'qdrant-cited-search-v1',
      traceId: input.parent.traceId,
      mimeType: 'application/json',
      metadata: {
        ragWorkflow: true,
        ragKind: 'search',
        executionId: input.parent.executionId,
        parentJobId: input.parent.id,
        namespace: input.metadata.namespace,
        collection: input.collection,
        dimensions: input.dimensions,
        citationCount: input.chunks.length,
        answerSupported: input.answer?.supportedByContext ?? false,
        outputValidated: true,
      },
    },
    data: Buffer.from(JSON.stringify(result, null, 2), 'utf8'),
    explicitMimeType: 'application/json',
  })
  await prisma.job.update({
    where: { id: input.parent.id },
    data: {
      status: 'completed',
      workflowPhase: 'completed',
      progress: 100,
      artifactId: artifact.id,
      output: JSON.stringify({
        artifactId: artifact.id,
        namespace: input.metadata.namespace,
        citationCount: input.chunks.length,
        answer: result.answer,
      }),
      metadataJson: JSON.stringify({
        ...input.metadata,
        currentPhase: 'completed',
        resultArtifactId: artifact.id,
        citationIds: input.chunks.map((chunk) => chunk.citationId),
        completedAt: result.completedAt,
      }),
      error: null,
      completedAt: new Date(),
    },
  })
  return artifact.id
}

export async function advanceRagSearchWorkflow(parentId: string, queue: Queue): Promise<{
  phase: 'query_embedding' | 'reranking' | 'answer_generation' | 'completed' | 'failed'
  artifactId?: string
}> {
  const parent = await prisma.job.findUnique({ where: { id: parentId } })
  if (!parent || parent.capability !== 'rag_search') throw new Error('RAG search parent was not found')
  if (parent.status === 'completed' && parent.artifactId) return { phase: 'completed', artifactId: parent.artifactId }
  if (parent.status === 'failed') return { phase: 'failed' }
  let metadata = safeJson(parent.metadataJson)
  if (metadata.ragWorkflow !== true || metadata.ragKind !== 'search') throw new Error('Job is not a RAG search workflow')

  try {
    const queryEmbedding = await findRagChild(parent.id, parent.appSlug, 'query_embedding')
    if (!queryEmbedding) return { phase: 'query_embedding' }
    if (queryEmbedding.status === 'failed' || queryEmbedding.status === 'cancelled') {
      await failRagParent(parent.id, 'query_embedding_failed', queryEmbedding.error ?? 'RAG query embedding failed')
      return { phase: 'failed' }
    }
    if (queryEmbedding.status !== 'completed') return { phase: 'query_embedding' }

    const { vectors, dimensions } = parseEmbeddingOutput(queryEmbedding.output)
    if (vectors.length !== 1) throw new Error('RAG query embedding must contain exactly one vector')
    const namespace = stringValue(metadata.namespace)
    if (!namespace) throw new Error('RAG search namespace is missing')
    const collection = ragCollectionForDimensions(QDRANT_COLLECTION, dimensions)
    let chunks = retrievedFromMetadata(metadata.retrievedResults)
    if (chunks.length === 0 && metadata.retrievalCompleted !== true) {
      await prisma.job.update({ where: { id: parent.id }, data: { workflowPhase: 'qdrant_search', progress: 45, error: null } })
      const topK = Math.max(1, Math.min(50, numberValue(metadata.topK, 8)))
      const rerankRequested = booleanValue(metadata.rerankRequested)
      const results = await searchVectors(
        vectors[0]!,
        Math.min(100, rerankRequested ? topK * 3 : topK),
        collection,
        ragIsolationFilter(parent.appSlug, namespace),
        numberValue(metadata.minScore, 0),
      )
      chunks = results.map((result) => retrievedFromPayload({
        ...result,
        appSlug: parent.appSlug,
        namespace,
      }))
      metadata = {
        ...metadata,
        currentPhase: 'retrieval_complete',
        collection,
        dimensions,
        retrievalCompleted: true,
        retrievedResults: chunks,
        retrievedAt: new Date().toISOString(),
      }
      await prisma.job.update({
        where: { id: parent.id },
        data: { workflowPhase: 'retrieval_complete', progress: 60, metadataJson: JSON.stringify(metadata) },
      })
    }

    if (chunks.length === 0) {
      const artifactId = await finalizeSearch({ parent, metadata, chunks, collection, dimensions })
      return { phase: 'completed', artifactId }
    }

    if (booleanValue(metadata.rerankRequested)) {
      const grant = grantFromParent({ parentMetadata: metadata, key: 'rerankingGrantSnapshot', capability: 'reranking', appSlug: parent.appSlug })
      const validation = validateDirectProviderRequest('reranking', 'Rerank authorised RAG sources.', {
        query: parent.prompt,
        documents: chunks.map((chunk) => ({ id: chunk.citationId, text: chunk.text })),
        topN: Math.min(chunks.length, Math.max(1, numberValue(metadata.topK, 8))),
      })
      if (!validation.success) throw new Error(validation.error ?? 'RAG reranking request is invalid')
      const reranking = await queueRagChild({
        parent, queue, role: 'reranking', capability: 'reranking',
        prompt: 'Rerank the authorised RAG sources for the user query.',
        requestInput: validation.data ?? {}, grant,
        grantSource: metadata.rerankingGrantSnapshotSource, phase: 'reranking',
      })
      if (reranking.status === 'failed' || reranking.status === 'cancelled') {
        await failRagParent(parent.id, 'reranking_failed', reranking.error ?? 'RAG reranking failed')
        return { phase: 'failed' }
      }
      if (reranking.status !== 'completed') {
        await prisma.job.update({ where: { id: parent.id }, data: { workflowPhase: 'reranking', progress: 70 } })
        return { phase: 'reranking' }
      }
      if (metadata.rerankingCompleted !== true) {
        const ranked = parseRerankOutput(reranking.output, chunks.length)
        chunks = ranked.map((entry) => ({ ...chunks[entry.index]!, rerankScore: entry.score }))
        metadata = {
          ...metadata,
          currentPhase: 'reranking_complete',
          rerankingCompleted: true,
          rerankingJobId: reranking.id,
          rerankedResults: chunks,
        }
        await prisma.job.update({
          where: { id: parent.id },
          data: { workflowPhase: 'reranking_complete', progress: 78, metadataJson: JSON.stringify(metadata) },
        })
      } else {
        chunks = retrievedFromMetadata(metadata.rerankedResults)
      }
    }

    if (booleanValue(metadata.answerRequested)) {
      const grant = grantFromParent({ parentMetadata: metadata, key: 'answerGrantSnapshot', capability: 'question_answering', appSlug: parent.appSlug })
      const sourceIds = chunks.map((chunk) => chunk.citationId)
      const validation = validateDirectProviderRequest('question_answering', parent.prompt, {
        question: parent.prompt,
        context: contextFromChunks(chunks),
        sourceIds,
      })
      if (!validation.success) throw new Error(validation.error ?? 'RAG answer request is invalid')
      const answerJob = await queueRagChild({
        parent, queue, role: 'answer_generation', capability: 'question_answering',
        prompt: parent.prompt, requestInput: validation.data ?? {}, grant,
        grantSource: metadata.answerGrantSnapshotSource, phase: 'answer_generation',
      })
      if (answerJob.status === 'failed' || answerJob.status === 'cancelled') {
        await failRagParent(parent.id, 'answer_generation_failed', answerJob.error ?? 'RAG answer generation failed')
        return { phase: 'failed' }
      }
      if (answerJob.status !== 'completed') {
        await prisma.job.update({ where: { id: parent.id }, data: { workflowPhase: 'answer_generation', progress: 88 } })
        return { phase: 'answer_generation' }
      }
      const answer = parseAnswerOutput(answerJob.output, sourceIds)
      metadata = { ...metadata, answerJobId: answerJob.id }
      const artifactId = await finalizeSearch({ parent, metadata, chunks, answer, collection, dimensions })
      return { phase: 'completed', artifactId }
    }

    const artifactId = await finalizeSearch({ parent, metadata, chunks, collection, dimensions })
    return { phase: 'completed', artifactId }
  } catch (error) {
    await failRagParent(parent.id, 'rag_search_failed', error)
    return { phase: 'failed' }
  }
}
