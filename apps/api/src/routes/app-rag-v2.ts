import type { FastifyInstance } from 'fastify'
import { Queue } from 'bullmq'
import { QUEUE_NAMES } from '@amarktai/core'
import { registerRagIngestRoute } from './app-rag-ingest-route.js'
import { registerRagSearchRoute } from './app-rag-search-route.js'
import { registerRagStatusRoute } from './app-rag-status-route.js'

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
  registerRagStatusRoute(app)
}
