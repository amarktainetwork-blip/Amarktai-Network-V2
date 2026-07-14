/**
 * AmarktAI Network — BullMQ Worker Entry Point
 *
 * Connects to Redis, listens on the jobs queue, and dispatches
 * each job to the job processor.
 *
 * Phase 4: Worker uses processJob which validates payload,
 * verifies DB ownership, updates status, and marks execution
 * as not-implemented honestly.
 *
 * Run with:  pnpm --filter @amarktai/worker dev
 *            or: tsx apps/worker/src/worker.ts
 */

import { Queue, Worker } from 'bullmq'
import { getRedisUrl, QUEUE_NAMES, WORKER_CONCURRENCY } from '@amarktai/core'
import { createJobProcessor, type WorkerJobData } from './processors/job-processor.js'
import { advanceLongFormWorkflow } from './long-form-workflow.js'
import { createServer, type Server } from 'node:http'
import { readFileSync } from 'node:fs'
import { join } from 'node:path'

type BuildInfo = {
  gitSha: string
  buildTime: string
  serviceName: string
  version: string
}

function loadBuildInfo(): BuildInfo {
  let fileInfo: Partial<BuildInfo> = {}
  try {
    fileInfo = JSON.parse(readFileSync(join(process.cwd(), 'build-info.json'), 'utf8')) as Partial<BuildInfo>
  } catch {
    // Local development and tests may not have a generated build-info file.
  }

  return {
    gitSha: process.env.GIT_SHA ?? fileInfo.gitSha ?? 'unknown',
    buildTime: process.env.BUILD_TIME ?? fileInfo.buildTime ?? 'unknown',
    serviceName: process.env.SERVICE_NAME ?? 'amarktai-worker',
    version: process.env.APP_VERSION ?? fileInfo.version ?? '0.0.0',
  }
}

function startHealthServer(isQueueReady: () => boolean): Server {
  const build = loadBuildInfo()
  const port = Number(process.env.WORKER_HEALTH_PORT ?? 3002)
  const server = createServer((request, response) => {
    if (request.method !== 'GET' || (request.url !== '/health' && request.url !== '/api/v1/health')) {
      response.writeHead(404, { 'content-type': 'application/json' })
      response.end(JSON.stringify({ error: 'not_found' }))
      return
    }

    const queueReady = isQueueReady()
    response.writeHead(queueReady ? 200 : 503, { 'content-type': 'application/json' })
    response.end(JSON.stringify({
      status: queueReady ? 'healthy' : 'starting',
      timestamp: new Date().toISOString(),
      build,
      checks: { queue: { ok: queueReady } },
    }))
  })
  server.listen(port, '0.0.0.0', () => console.log(`[worker] Health endpoint listening on 0.0.0.0:${port}`))
  return server
}

async function main(): Promise<void> {
  const redisUrl = getRedisUrl()
  let queueReady = false

  console.log(`[worker] Starting AmarktAI worker...`)
  console.log(`[worker] Redis: ${redisUrl}`)
  console.log(`[worker] Queue: ${QUEUE_NAMES.JOBS}`)
  console.log(`[worker] Concurrency: ${WORKER_CONCURRENCY}`)

  const connection = { url: redisUrl, maxRetriesPerRequest: null }
  const queue = new Queue(QUEUE_NAMES.JOBS, { connection })
  const processJob = createJobProcessor({ advanceLongFormWorkflow: (parentJobId) => advanceLongFormWorkflow(parentJobId, queue) })
  const worker = new Worker(
    QUEUE_NAMES.JOBS,
    async (job) => {
      const payload = job.data as WorkerJobData
      return processJob(payload)
    },
    {
      connection,
      concurrency: WORKER_CONCURRENCY,
      limiter: {
        max: 50,
        duration: 60_000,
      },
    }
  )
  const healthServer = startHealthServer(() => queueReady)

  worker.on('ready', () => {
    queueReady = true
    console.log('[worker] Connected and listening for jobs')
  })

  worker.on('completed', (job) => {
    console.log(`[worker] Job ${job.id} completed`)
  })

  worker.on('failed', (job, err) => {
    console.error(`[worker] Job ${job?.id} failed: ${err.message}`)
  })

  worker.on('error', (err) => {
    console.error('[worker] Worker error:', err.message)
  })

  // Graceful shutdown
  const shutdown = async (signal: string) => {
    console.log(`[worker] Received ${signal}, shutting down...`)
    queueReady = false
    await new Promise<void>((resolve) => healthServer.close(() => resolve()))
    await worker.close()
    await queue.close()
    process.exit(0)
  }

  process.on('SIGTERM', () => shutdown('SIGTERM'))
  process.on('SIGINT', () => shutdown('SIGINT'))
}

main().catch((err) => {
  console.error('[worker] Fatal error:', err)
  process.exit(1)
})
