import type { FastifyInstance } from 'fastify'
import { randomUUID } from 'node:crypto'
import {
  DEFAULT_JOB_OPTIONS,
  validateDirectProviderRequest,
  type CapabilityKey,
  type JobPayload,
} from '@amarktai/core'
import { RagSearchRequestSchema } from '@amarktai/core/rag-platform'
import { prisma } from '@amarktai/db'
import { authenticateAppKey } from './jobs.js'
import { grantSnapshot, safeJson, validNamespace, type RagQueueGetter } from './app-rag-common.js'

export function registerRagSearchRoute(app: FastifyInstance, getQueue: RagQueueGetter): void {
  app.post('/api/v1/rag/search', async (request, reply) => {
    const auth = await authenticateAppKey(request.headers.authorization)
    if (!auth.ok) {
      return reply.status(auth.statusCode).send({ error: true, code: 'AUTHENTICATION_FAILED', message: auth.error })
    }
    const parsed = RagSearchRequestSchema.safeParse(request.body)
    if (!parsed.success) {
      return reply.status(400).send({
        error: true,
        code: 'INVALID_RAG_SEARCH_REQUEST',
        message: 'RAG search request validation failed.',
        issues: parsed.error.issues,
      })
    }

    const allowed = auth.allowedCapabilities ?? []
    const requestedCapabilities: CapabilityKey[] = [
      'rag_search',
      'embeddings',
      ...(parsed.data.rerank ? ['reranking' as CapabilityKey] : []),
      ...(parsed.data.answer ? ['question_answering' as CapabilityKey] : []),
    ]
    const entries = await Promise.all(requestedCapabilities.map(async (capability) => ({
      capability,
      snapshot: await grantSnapshot(auth.app!.slug, capability, allowed),
    })))
    const missing = entries.filter((entry) => !entry.snapshot).map((entry) => entry.capability)
    if (missing.length) {
      return reply.status(403).send({
        error: true,
        code: 'RAG_GRANT_REQUIRED',
        message: `Missing RAG grants: ${missing.join(', ')}`,
        missingCapabilities: missing,
      })
    }
    const grants = new Map(entries.map((entry) => [entry.capability, entry.snapshot]))
    const parentGrant = grants.get('rag_search')
    const embeddingGrant = grants.get('embeddings')
    const rerankingGrant = parsed.data.rerank ? grants.get('reranking') : null
    const answerGrant = parsed.data.answer ? grants.get('question_answering') : null
    if (!parentGrant || !embeddingGrant || (parsed.data.rerank && !rerankingGrant) || (parsed.data.answer && !answerGrant)) {
      return reply.status(403).send({
        error: true,
        code: 'RAG_GRANT_REQUIRED',
        message: 'One or more required RAG grant snapshots could not be resolved.',
      })
    }
    if (!validNamespace(parentGrant.grant, parsed.data.namespace)) {
      return reply.status(403).send({ error: true, code: 'RAG_NAMESPACE_DENIED', message: 'The requested namespace is not granted for rag_search.' })
    }
    if (!parentGrant.grant.artifactWrite) {
      return reply.status(403).send({ error: true, code: 'RAG_ARTIFACT_WRITE_REQUIRED', message: 'rag_search must allow result artifact writes.' })
    }

    const embeddingValidation = validateDirectProviderRequest('embeddings', 'Embed the authorised RAG query.', {
      texts: [parsed.data.query],
      normalize: true,
    })
    if (!embeddingValidation.success) {
      return reply.status(409).send({ error: true, code: 'RAG_QUERY_EMBEDDING_INVALID', message: embeddingValidation.error })
    }

    const executionId = randomUUID()
    const createdAt = new Date().toISOString()
    const parentMetadata: Record<string, unknown> = {
      ragWorkflow: true,
      ragKind: 'search',
      currentPhase: 'query_embedding',
      executionId,
      namespace: parsed.data.namespace,
      topK: parsed.data.topK,
      minScore: parsed.data.minScore,
      rerankRequested: parsed.data.rerank,
      answerRequested: parsed.data.answer,
      appGrantSnapshot: parentGrant.grant,
      appGrantSnapshotSource: parentGrant.source,
      appGrantSnapshotAt: createdAt,
      embeddingGrantSnapshot: embeddingGrant.grant,
      embeddingGrantSnapshotSource: embeddingGrant.source,
      embeddingGrantSnapshotAt: createdAt,
      ...(rerankingGrant ? {
        rerankingGrantSnapshot: rerankingGrant.grant,
        rerankingGrantSnapshotSource: rerankingGrant.source,
        rerankingGrantSnapshotAt: createdAt,
      } : {}),
      ...(answerGrant ? {
        answerGrantSnapshot: answerGrant.grant,
        answerGrantSnapshotSource: answerGrant.source,
        answerGrantSnapshotAt: createdAt,
      } : {}),
    }
    const parent = await prisma.job.create({
      data: {
        appSlug: auth.app!.slug,
        capability: 'rag_search',
        prompt: parsed.data.query,
        inputJson: JSON.stringify(parsed.data),
        metadataJson: JSON.stringify(parentMetadata),
        traceId: `trace_rag_search_${executionId}`,
        status: 'processing',
        progress: 5,
        executionId,
        workflowPhase: 'query_embedding',
      },
    })
    const childMetadata = {
      ragWorkflow: true,
      ragRole: 'query_embedding',
      ragKind: 'search',
      executionId,
      parentJobId: parent.id,
      namespace: parsed.data.namespace,
      appGrantSnapshot: embeddingGrant.grant,
      appGrantSnapshotSource: embeddingGrant.source,
      appGrantSnapshotAt: createdAt,
      routingMode: embeddingGrant.grant.routingMode ?? 'automatic',
      executionProfile: 'external_app',
    }
    const child = await prisma.job.create({
      data: {
        appSlug: auth.app!.slug,
        capability: 'embeddings',
        prompt: 'Embed the authorised RAG query.',
        inputJson: JSON.stringify(embeddingValidation.data),
        metadataJson: JSON.stringify(childMetadata),
        traceId: `${parent.traceId}_query_embedding`,
        status: 'queued',
        parentJobId: parent.id,
        executionId,
        workflowPhase: 'query_embedding_queued',
        queuedAt: new Date(),
      },
    })
    await prisma.job.update({
      where: { id: parent.id },
      data: { metadataJson: JSON.stringify({ ...parentMetadata, queryEmbeddingJobId: child.id }) },
    })
    const payload: JobPayload = {
      jobId: child.id,
      appSlug: child.appSlug,
      capability: 'embeddings',
      executionProfile: 'external_app',
      prompt: child.prompt,
      input: safeJson(child.inputJson),
      metadata: childMetadata,
      traceId: child.traceId,
      routingMode: typeof childMetadata.routingMode === 'string' ? childMetadata.routingMode : 'automatic',
      appGrantSnapshot: embeddingGrant.grant,
    }
    try {
      await getQueue().add('process', payload, { ...DEFAULT_JOB_OPTIONS, jobId: child.id })
      await prisma.job.update({ where: { id: child.id }, data: { queueJobId: child.id, queuedAt: new Date() } })
      return reply.status(202).send({
        executionId,
        parentJobId: parent.id,
        queryEmbeddingJobId: child.id,
        status: 'processing',
        phase: 'query_embedding',
        namespace: parsed.data.namespace,
      })
    } catch (error) {
      const message = error instanceof Error ? error.message : 'RAG search queue submission failed'
      await prisma.job.update({
        where: { id: child.id },
        data: { status: 'failed', workflowPhase: 'query_embedding_queue_failed', error: message, completedAt: new Date() },
      })
      await prisma.job.update({
        where: { id: parent.id },
        data: { status: 'failed', workflowPhase: 'query_embedding_queue_failed', error: message, completedAt: new Date() },
      })
      return reply.status(500).send({ error: true, code: 'RAG_SEARCH_QUEUE_FAILED', message })
    }
  })
}
