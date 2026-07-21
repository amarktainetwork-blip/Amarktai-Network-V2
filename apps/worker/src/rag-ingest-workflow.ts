import { findCompletedArtifactByTraceId, getArtifactFile, saveArtifact } from '@amarktai/artifacts'
import { QDRANT_COLLECTION } from '@amarktai/core'
import {
  chunkRagText,
  ragCollectionForDimensions,
  ragPointId,
} from '@amarktai/core/rag-platform'
import { prisma } from '@amarktai/db'
import { upsertPoints } from '@amarktai/providers'
import {
  failRagParent,
  findRagChild,
  parseEmbeddingOutput,
  safeJson,
  stringValue,
} from './rag-workflow-common.js'

export async function advanceRagIngestWorkflow(parentId: string): Promise<{
  phase: 'source_embedding' | 'qdrant_ingestion' | 'completed' | 'failed'
  artifactId?: string
}> {
  const parent = await prisma.job.findUnique({ where: { id: parentId } })
  if (!parent || parent.capability !== 'rag_ingest') throw new Error('RAG ingest parent was not found')
  if (parent.status === 'completed' && parent.artifactId) return { phase: 'completed', artifactId: parent.artifactId }
  if (parent.status === 'failed') return { phase: 'failed' }

  const metadata = safeJson(parent.metadataJson)
  if (metadata.ragWorkflow !== true || metadata.ragKind !== 'ingest') throw new Error('Job is not a RAG ingest workflow')
  const embeddingJob = await findRagChild(parent.id, parent.appSlug, 'source_embedding')
  if (!embeddingJob) return { phase: 'source_embedding' }
  if (embeddingJob.status === 'failed' || embeddingJob.status === 'cancelled') {
    await failRagParent(parent.id, 'source_embedding_failed', embeddingJob.error ?? 'RAG source embedding failed')
    return { phase: 'failed' }
  }
  if (embeddingJob.status !== 'completed') return { phase: 'source_embedding' }

  try {
    const existing = await findCompletedArtifactByTraceId(parent.traceId, 'rag_ingest_manifest')
    if (existing) {
      await prisma.job.update({
        where: { id: parent.id },
        data: {
          status: 'completed',
          workflowPhase: 'completed',
          progress: 100,
          artifactId: existing.id,
          output: JSON.stringify({ artifactId: existing.id, reused: true }),
          error: null,
          completedAt: parent.completedAt ?? new Date(),
        },
      })
      return { phase: 'completed', artifactId: existing.id }
    }

    await prisma.job.update({ where: { id: parent.id }, data: { workflowPhase: 'qdrant_ingestion', progress: 70, error: null } })
    const { vectors, dimensions } = parseEmbeddingOutput(embeddingJob.output)
    const parentInput = safeJson(parent.inputJson)
    const namespace = stringValue(parentInput.namespace)
    const sourceId = stringValue(parentInput.sourceId)
    const sourceArtifactId = stringValue(metadata.sourceArtifactId)
    if (!namespace || !sourceId || !sourceArtifactId) throw new Error('RAG ingest source identity is incomplete')
    const source = await getArtifactFile(sourceArtifactId)
    if (!source?.buffer.length || !source.mimeType.startsWith('text/')) throw new Error('RAG source artifact is missing or not text')
    const chunks = chunkRagText({
      sourceId,
      text: source.buffer.toString('utf8'),
      chunkSize: Number(parentInput.chunkSize),
      chunkOverlap: Number(parentInput.chunkOverlap),
    })
    if (vectors.length !== chunks.length) {
      throw new Error(`RAG embedding count ${vectors.length} does not match chunk count ${chunks.length}`)
    }

    const collection = ragCollectionForDimensions(QDRANT_COLLECTION, dimensions)
    const ingestedAt = new Date().toISOString()
    const points = chunks.map((chunk, index) => ({
      id: ragPointId({ appSlug: parent.appSlug, namespace, sourceId, chunkHash: chunk.hash }),
      vector: vectors[index]!,
      payload: {
        appSlug: parent.appSlug,
        namespace,
        sourceId,
        sourceArtifactId,
        title: parentInput.title ?? null,
        url: parentInput.url ?? null,
        sourceMetadata: parentInput.metadata ?? {},
        chunkIndex: chunk.index,
        citationId: chunk.citationId,
        text: chunk.text,
        start: chunk.start,
        end: chunk.end,
        chunkHash: chunk.hash,
        parentJobId: parent.id,
        executionId: parent.executionId,
        ingestedAt,
      },
    }))
    const upsert = await upsertPoints(points, collection)
    const manifest = {
      version: 'rag-ingest-v1',
      executionId: parent.executionId,
      parentJobId: parent.id,
      appSlug: parent.appSlug,
      namespace,
      sourceId,
      sourceArtifactId,
      title: parentInput.title ?? null,
      url: parentInput.url ?? null,
      collection,
      dimensions,
      chunkCount: chunks.length,
      pointIds: points.map((point) => point.id),
      chunkCitations: chunks.map((chunk) => ({
        citationId: chunk.citationId,
        chunkIndex: chunk.index,
        hash: chunk.hash,
      })),
      embeddingEvidence: {
        jobId: embeddingJob.id,
        provider: embeddingJob.provider,
        model: embeddingJob.model,
      },
      qdrant: upsert,
      ingestedAt,
    }
    const artifact = await saveArtifact({
      input: {
        appSlug: parent.appSlug,
        type: 'document',
        subType: 'rag_ingest_manifest',
        title: `${stringValue(parentInput.title) || sourceId} RAG ingestion manifest`,
        description: `RAG ingestion evidence for namespace ${namespace}`,
        provider: 'amarktai-network',
        model: 'qdrant-ingest-v1',
        traceId: parent.traceId,
        mimeType: 'application/json',
        metadata: {
          ragWorkflow: true,
          ragKind: 'ingest',
          executionId: parent.executionId,
          parentJobId: parent.id,
          namespace,
          sourceId,
          collection,
          dimensions,
          chunkCount: chunks.length,
          outputValidated: true,
        },
      },
      data: Buffer.from(JSON.stringify(manifest, null, 2), 'utf8'),
      explicitMimeType: 'application/json',
    })
    await prisma.job.update({
      where: { id: parent.id },
      data: {
        status: 'completed',
        workflowPhase: 'completed',
        progress: 100,
        artifactId: artifact.id,
        output: JSON.stringify({
          artifactId: artifact.id,
          namespace,
          sourceId,
          sourceArtifactId,
          collection,
          dimensions,
          chunkCount: chunks.length,
        }),
        metadataJson: JSON.stringify({
          ...metadata,
          currentPhase: 'completed',
          collection,
          dimensions,
          ingestedPointIds: points.map((point) => point.id),
          manifestArtifactId: artifact.id,
          completedAt: ingestedAt,
        }),
        error: null,
        completedAt: new Date(),
      },
    })
    return { phase: 'completed', artifactId: artifact.id }
  } catch (error) {
    await failRagParent(parent.id, 'qdrant_ingestion_failed', error)
    return { phase: 'failed' }
  }
}
