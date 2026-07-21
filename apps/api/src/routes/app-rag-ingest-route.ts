import type { FastifyInstance } from 'fastify'
import { randomUUID } from 'node:crypto'
import { saveArtifact } from '@amarktai/artifacts'
import {
  DEFAULT_JOB_OPTIONS,
  validateDirectProviderRequest,
  type JobPayload,
} from '@amarktai/core'
import { RagIngestRequestSchema, chunkRagText } from '@amarktai/core/rag-platform'
import { prisma } from '@amarktai/db'
import { authenticateAppKey } from './jobs.js'
import { grantSnapshot, safeJson, validNamespace, type RagQueueGetter } from './app-rag-common.js'

export function registerRagIngestRoute(app: FastifyInstance, getQueue: RagQueueGetter): void {
  app.post('/api/v1/rag/ingest', async (request, reply) => {
    const auth = await authenticateAppKey(request.headers.authorization)
    if (!auth.ok) {
      return reply.status(auth.statusCode).send({ error: true, code: 'AUTHENTICATION_FAILED', message: auth.error })
    }
    const parsed = RagIngestRequestSchema.safeParse(request.body)
    if (!parsed.success) {
      return reply.status(400).send({
        error: true,
        code: 'INVALID_RAG_INGEST_REQUEST',
        message: 'RAG ingest request validation failed.',
        issues: parsed.error.issues,
      })
    }

    const allowed = auth.allowedCapabilities ?? []
    const [parentGrant, embeddingGrant] = await Promise.all([
      grantSnapshot(auth.app!.slug, 'rag_ingest', allowed),
      grantSnapshot(auth.app!.slug, 'embeddings', allowed),
    ])
    if (!parentGrant || !embeddingGrant) {
      const missing = [
        !parentGrant ? 'rag_ingest' : null,
        !embeddingGrant ? 'embeddings' : null,
      ].filter((value): value is string => Boolean(value))
      return reply.status(403).send({
        error: true,
        code: 'RAG_GRANT_REQUIRED',
        message: `Missing RAG grants: ${missing.join(', ')}`,
        missingCapabilities: missing,
      })
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
    const parentMetadata = {
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
    }
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
        metadataJson: JSON.stringify(parentMetadata),
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
      await prisma.job.update({
        where: { id: parent.id },
        data: { status: 'failed', workflowPhase: 'ingest_setup_failed', error: message, completedAt: new Date() },
      })
      return reply.status(500).send({ error: true, code: 'RAG_INGEST_SETUP_FAILED', message })
    }
  })
}
