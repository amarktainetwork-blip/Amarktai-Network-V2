import type { FastifyInstance } from 'fastify'
import { randomUUID } from 'node:crypto'
import { Queue } from 'bullmq'
import { saveArtifact } from '@amarktai/artifacts'
import {
  DEFAULT_JOB_OPTIONS,
  QUEUE_NAMES,
  validateDirectProviderRequest,
  type AppCapabilityGrantContext,
  type CapabilityKey,
  type JobPayload,
} from '@amarktai/core'
import {
  RagIngestRequestSchema,
  RagSearchRequestSchema,
  chunkRagText,
  ragNamespaceAllowed,
} from '@amarktai/core/rag-platform'
import { prisma } from '@amarktai/db'
import { resolveAppCapabilityGrantSnapshot } from '../lib/app-grant-loader.js'
import { authenticateAppKey } from './jobs.js'

function safeJson(value: string | null | undefined): Record<string, unknown> {
  if (!value?.trim()) return {}
  try {
    const parsed = JSON.parse(value)
    return typeof parsed === 'object' && parsed !== null && !Array.isArray(parsed)
      ? parsed as Record<string, unknown>
      : {}
  } catch {
    return {}
  }
}

async function grantSnapshot(
  appSlug: string,
  capability: CapabilityKey,
  allowedCapabilities: readonly string[],
) {
  return resolveAppCapabilityGrantSnapshot(appSlug, capability, allowedCapabilities)
}

function validNamespace(grant: AppCapabilityGrantContext, namespace: string): boolean {
  return grant.enabled && ragNamespaceAllowed(grant.ragNamespaces, namespace)
}

function statusEvidence(job: Awaited<ReturnType<typeof prisma.job.findMany>>[number]) {
  const metadata = safeJson(job.metadataJson)
  return {
    jobId: job.id,
    role: metadata.ragRole ?? null,
    capability: job.capability,
    status: job.status,
    phase: job.workflowPhase,
    progress: job.progress,
    provider: job.provider,
    model: job.model,
    artifactId: job.artifactId,
    error: job.error,
  }
}

export async function appRagRoutes(app: FastifyInstance): Promise<void> {
  let queue: Queue | null = null
  const getQueue = () => {
    if (!queue) {
      if (!app.redis) throw new Error('Redis is required for RAG execution')
      queue = new Queue(QUEUE_NAMES.JOBS, { connection: app.redis as never })
    }
    return queue
  }

  app.post('/api/v1/rag/ingest', async (request, reply) => {
    const auth = await authenticateAppKey(request.headers.authorization)
    if (!auth.ok) return reply.status(auth.statusCode).send({ error: true, code: 'AUTHENTICATION_FAILED', message: auth.error })
    const parsed = RagIngestRequestSchema.safeParse(request.body)
    if (!parsed.success) {
      return reply.status(400).send({ error: true, code: 'INVALID_RAG_INGEST_REQUEST', message: 'RAG ingest request validation failed.', issues: parsed.error.issues })
    }

    const allowed = auth.allowedCapabilities ?? []
    const [parentGrant, embeddingGrant] = await Promise.all([
      grantSnapshot(auth.app!.slug, 'rag_ingest', allowed),
      grantSnapshot(auth.app!.slug, 'embeddings', allowed),
    ])
    const missing = [
      !parentGrant ? 'rag_ingest' : null,
      !embeddingGrant ? 'embeddings' : null,
    ].filter((value): value is string => Boolean(value))
    if (missing.length) {
      return reply.status(403).send({ error: true, code: 'RAG_GRANT_REQUIRED', message: `Missing RAG grants: ${missing.join(', ')}`, missingCapabilities: missing })
    }
    if (!validNamespace(parentGrant.grant, parsed.data.namespace)) {
      return reply.status(403).send({ error: true, code: 'RAG_NAMESPACE_DENIED', message: 'The requested namespace is not granted for rag_ingest.' })
    }
    if (!parentGrant.grant.artifactWrite) {
      return reply.status(403).send({ error: true, code: 'RAG_ARTIFACT_WRITE_REQUIRED', message: 'rag_ingest must allow artifact writes.' })
    }

    const chunks = chunkRagText({
      sourceId: parsed.data.sourceId,
      text: parsed.data.text,
      chunkSize: parsed.data.chunkSize,
      chunkOverlap: parsed.data.chunkOverlap,
    })
    const embeddingValidation = validateDirectProviderRequest('embeddings', 'Embed authorised RAG source chunks.', {
      texts: chunks.map((chunk) => chunk.text),
      normalize: true,
    })
    if (!embeddingValidation.success) {
      return reply.status(409).send({ error: true, code: 'RAG_EMBEDDING_REQUEST_INVALID', message: embeddingValidation.error })
    }

    const executionId = randomUUID()
    const createdAt = new Date().toISOString()
    const parent = await prisma.job.create({
      data: {
        appSlug: auth.app!.slug,
        capability: 'rag_ingest',
        prompt: `Ingest source '${parsed.data.sourceId}' into namespace '${parsed.data.namespace}'.`,
        inputJson: JSON.stringify({
          namespace: parsed.data.namespace,
          sourceId: parsed.data.sourceId,
          title: parsed.data.title ?? null,
          url: parsed.data.url ?? null,
          metadata: parsed.data.metadata ?? {},
          chunkSize: parsed.data.chunkSize,
          chunkOverlap: parsed.data.chunkOverlap,
        }),
        metadataJson: JSON.stringify({
          ragWorkflow: true,
          ragKind: 'ingest',
          currentPhase: 'source_persistence',
          executionId,
          namespace: parsed.data.namespace,
          sourceId: parsed.data.sourceId,
          appGrantSnapshot: parentGrant.grant,
          appGrantSnapshotSource: parentGrant.source,
          appGrantSnapshotAt: createdAt,
          embeddingGrantSnapshot: embeddingGrant.grant,
          embeddingGrantSnapshotSource: embeddingGrant.source,
          embeddingGrantSnapshotAt: createdAt,
          chunkCount: chunks.length,
          chunkHashes: chunks.map((chunk) => chunk.hash),
        }),
        traceId: `trace_rag_ingest_${executionId}`,
        status: 'processing',
        progress: 2,
        executionId,
        workflowPhase: 'source_persistence',
      },
    })

    try {
      const sourceArtifact = await saveArtifact({
        input: {
          appSlug: auth.app!.slug,
          type: 'document',
          subType: 'rag_source',
          title: parsed.data.title ?? parsed.data.sourceId,
          description: `RAG source for namespace ${parsed.data.namespace}`,
          provider: 'amarktai-network',
          model: 'source-persistence-v1',
          traceId: parent.traceId,
          mimeType: 'text/plain',
          metadata: {
            ragSource: true,
            executionId,
            parentJobId: parent.id,
            namespace: parsed.data.namespace,
            sourceId: parsed.data.sourceId,
            url: parsed.data.url ?? null,
            sourceMetadata: parsed.data.metadata ?? {},
          },
        },
        data: Buffer.from(parsed.data.text, 'utf8'),
        explicitMimeType: 'text/plain',
      })
      const childMetadata = {
        ragWorkflow: true,
        ragRole: 'source_embedding',
        ragKind: 'ingest',
        executionId,
        parentJobId: parent.id,
        namespace: parsed.data.namespace,
        sourceArtifactId: sourceArtifact.id,
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
          prompt: 'Embed authorised RAG source chunks.',
          inputJson: JSON.stringify(embeddingValidation.data),
          metadataJson: JSON.stringify(childMetadata),
          traceId: `${parent.traceId}_embedding`,
          status: 'queued',
          parentJobId: parent.id,
          executionId,
          workflowPhase: 'embedding_queued',
          queuedAt: new Date(),
        },
      })
      const parentMetadata = safeJson(parent.metadataJson)
      await prisma.job.update({
        where: { id: parent.id },
        data: {
          workflowPhase: 'source_embedding',
          progress: 5,
          metadataJson: JSON.stringify({
            ...parentMetadata,
            currentPhase: 'source_embedding',
            sourceArtifactId: sourceArtifact.id,
            embeddingJobId: child.id,
          }),
        },
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
      await getQueue().add('process', payload, { ...DEFAULT_JOB_OPTIONS, jobId: child.id })
      await prisma.job.update({ where: { id: child.id }, data: { queueJobId: child.id, queuedAt: new Date() } })
      return reply.status(202).send({
        executionId,
        parentJobId: parent.id,
        sourceArtifactId: sourceArtifact.id,
        embeddingJobId: child.id,
        status: 'processing',
        phase: 'source_embedding',
        namespace: parsed.data.namespace,
        chunkCount: chunks.length,
      })
    } catch (error) {
      const message = error instanceof Error ? error.message : 'RAG ingestion setup failed'
      await prisma.job.update({ where: { id: parent.id }, data: { status: 'failed', workflowPhase: 'ingest_setup_failed', error: message, completedAt: new Date() } })
      return reply.status(500).send({ error: true, code: 'RAG_INGEST_SETUP_FAILED', message })
    }
  })

  app.post('/api/v1/rag/search', async (request, reply) => {
    const auth = await authenticateAppKey(request.headers.authorization)
    if (!auth.ok) return reply.status(auth.statusCode).send({ error: true, code: 'AUTHENTICATION_FAILED', message: auth.error })
    const parsed = RagSearchRequestSchema.safeParse(request.body)
    if (!parsed.success) {
      return reply.status(400).send({ error: true, code: 'INVALID_RAG_SEARCH_REQUEST', message: 'RAG search request validation failed.', issues: parsed.error.issues })
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
      return reply.status(403).send({ error: true, code: 'RAG_GRANT_REQUIRED', message: `Missing RAG grants: ${missing.join(', ')}`, missingCapabilities: missing })
    }
    const grants = new Map(entries.map((entry) => [entry.capability, entry.snapshot!]))
    const parentGrant = grants.get('rag_search')!
    if (!validNamespace(parentGrant.grant, parsed.data.namespace)) {
      return reply.status(403).send({ error: true, code: 'RAG_NAMESPACE_DENIED', message: 'The requested namespace is not granted for rag_search.' })
    }
    if (!parentGrant.grant.artifactWrite) {
      return reply.status(403).send({ error: true, code: 'RAG_ARTIFACT_WRITE_REQUIRED', message: 'rag_search must allow result artifact writes.' })
    }

    const embeddingGrant = grants.get('embeddings')!
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
      ...(parsed.data.rerank ? {
        rerankingGrantSnapshot: grants.get('reranking')!.grant,
        rerankingGrantSnapshotSource: grants.get('reranking')!.source,
        rerankingGrantSnapshotAt: createdAt,
      } : {}),
      ...(parsed.data.answer ? {
        answerGrantSnapshot: grants.get('question_answering')!.grant,
        answerGrantSnapshotSource: grants.get('question_answering')!.source,
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
      await prisma.job.update({ where: { id: child.id }, data: { status: 'failed', workflowPhase: 'query_embedding_queue_failed', error: message, completedAt: new Date() } })
      await prisma.job.update({ where: { id: parent.id }, data: { status: 'failed', workflowPhase: 'query_embedding_queue_failed', error: message, completedAt: new Date() } })
      return reply.status(500).send({ error: true, code: 'RAG_SEARCH_QUEUE_FAILED', message })
    }
  })

  app.get('/api/v1/rag/executions/:id', async (request, reply) => {
    const auth = await authenticateAppKey(request.headers.authorization)
    if (!auth.ok) return reply.status(auth.statusCode).send({ error: true, code: 'AUTHENTICATION_FAILED', message: auth.error })
    const { id } = request.params as { id: string }
    const parent = await prisma.job.findFirst({
      where: {
        appSlug: auth.app!.slug,
        parentJobId: null,
        capability: { in: ['rag_ingest', 'rag_search'] },
        OR: [{ id }, { executionId: id }],
      },
    })
    if (!parent || safeJson(parent.metadataJson).ragWorkflow !== true) {
      return reply.status(404).send({ error: true, code: 'RAG_EXECUTION_NOT_FOUND', message: 'RAG execution was not found for the authenticated app.' })
    }
    const children = await prisma.job.findMany({
      where: { appSlug: auth.app!.slug, parentJobId: parent.id },
      orderBy: { createdAt: 'asc' },
    })
    const metadata = safeJson(parent.metadataJson)
    return reply.send({
      executionId: parent.executionId,
      parentJobId: parent.id,
      kind: metadata.ragKind,
      namespace: metadata.namespace,
      status: parent.status,
      phase: parent.workflowPhase,
      progress: parent.progress,
      artifactId: parent.artifactId,
      error: parent.error,
      result: parent.output ? safeJson(parent.output) : null,
      evidence: children.map(statusEvidence),
    })
  })
}
