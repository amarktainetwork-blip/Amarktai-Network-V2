/**
 * AmarktAI Network — BullMQ Worker Entry Point
 *
 * Connects to Redis, listens on the jobs queue, and dispatches
 * each job to the correct provider adapter via the job processor.
 *
 * Run with:  pnpm --filter @amarktai/worker dev
 *            or: tsx apps/worker/src/worker.ts
 */

import { Worker } from 'bullmq'
import { getRedisUrl, QUEUE_NAMES, WORKER_CONCURRENCY } from '@amarktai/core'
import { processJob } from './processors/job-processor.js'

async function main(): Promise<void> {
  const redisUrl = getRedisUrl()

  console.log(`[worker] Starting AmarktAI worker...`)
  console.log(`[worker] Redis: ${redisUrl}`)
  console.log(`[worker] Queue: ${QUEUE_NAMES.JOBS}`)
  console.log(`[worker] Concurrency: ${WORKER_CONCURRENCY}`)

  const worker = new Worker(QUEUE_NAMES.JOBS, processJob, {
    connection: {
      url: redisUrl,
      maxRetriesPerRequest: null,
    },
    concurrency: WORKER_CONCURRENCY,
    limiter: {
      max: 50,
      duration: 60_000,
    },
  })

  worker.on('ready', () => {
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
    await worker.close()
    process.exit(0)
  }

  process.on('SIGTERM', () => shutdown('SIGTERM'))
  process.on('SIGINT', () => shutdown('SIGINT'))
}

main().catch((err) => {
  console.error('[worker] Fatal error:', err)
  process.exit(1)
})
