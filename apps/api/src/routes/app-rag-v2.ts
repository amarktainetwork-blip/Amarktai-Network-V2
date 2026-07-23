import type { FastifyInstance } from 'fastify'
import { Queue } from 'bullmq'
import { QUEUE_NAMES } from '@amarktai/core'
import { prisma } from '@amarktai/db'
import { registerRagIngestRoute } from './app-rag-ingest-route.js'
import { registerRagSearchRoute } from './app-rag-search-route.js'
import { authenticateAppKey } from './jobs.js'
import { safeJson, statusEvidence } from './app-rag-common.js'

export async function appRagRoutes(app: FastifyInstance): Promise<void> {
  let queue: Queue | null = null
  const getQueue = () => {
    if (!queue) {
      if (!app.redis) throw new Error('Redis is required for RAG execution')
      queue = new Queue(QUEUE_NAMES.JOBS, { connection: app.redis as never })
    }
    return queue
  }

  registerRagIngestRoute(app, getQueue)
  registerRagSearchRoute(app, getQueue)

  app.get('/api/v1/rag/executions/:id', async (request, reply) => {
    const authentication = await authenticateAppKey(request.headers.authorization)
    if (!authentication.ok) {
      return reply.status(authentication.statusCode).send({
        error: true,
        code: 'AUTHENTICATION_FAILED',
        message: authentication.error,
      })
    }
    const { id } = request.params as { id: string }
    const appSlug = authentication.app!.slug
    const parent = await prisma.job.findFirst({
      where: {
        appSlug,
        parentJobId: null,
        capability: { in: ['rag_ingest', 'rag_search'] },
        OR: [{ id }, { executionId: id }],
      },
    })
    if (!parent || safeJson(parent.metadataJson).ragWorkflow !== true) {
      return reply.status(404).send({
        error: true,
        code: 'RAG_EXECUTION_NOT_FOUND',
        message: 'RAG execution was not found for the authenticated app.',
      })
    }
    const children = await prisma.job.findMany({
      where: { appSlug, parentJobId: parent.id },
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
