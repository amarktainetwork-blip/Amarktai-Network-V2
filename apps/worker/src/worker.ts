/**
 * AmarktAI Network — BullMQ Worker Entry Point
 *
 * Connects to Redis, listens on the jobs queue, and dispatches
 * each job to the job processor.
 *
 * The worker validates immutable job authority, claims durable state, and
 * dispatches only canonically registered execution paths.
 *
 * Run with:  pnpm --filter @amarktai/worker dev
 *            or: tsx apps/worker/src/worker.ts
 */

import { Queue, Worker } from 'bullmq'
import { getRedisUrl, getStorageRoot, QUEUE_NAMES, WORKER_CONCURRENCY } from '@amarktai/core'
import { assertDatabaseSchemaCurrent, getDatabaseSchemaStatus, prisma } from '@amarktai/db'
import { createJobProcessor, type WorkerJobData } from './processors/job-processor.js'
import { advanceLongFormWorkflow } from './long-form-workflow.js'
import { recoverStaleProcessingJobs } from './recovery.js'
import { executeWithDurableProviderFallback } from './providers/durable-provider-fallback.js'
import { assertFixtureAdapterConfiguration } from './providers/release-fixture-executor.js'
import { createServer, type Server } from 'node:http'
import { readFileSync } from 'node:fs'
import { join } from 'node:path'
import { mkdir, rm, writeFile } from 'node:fs/promises'
import { randomUUID } from 'node:crypto'
import { execFile } from 'node:child_process'
import { promisify } from 'node:util'

const execFileAsync = promisify(execFile)

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

type WorkerCheck = { ok: boolean; error?: string; [key: string]: unknown }

function startHealthServer(getChecks: () => Promise<Record<string, WorkerCheck>>): Server {
  const build = loadBuildInfo()
  const port = Number(process.env.WORKER_HEALTH_PORT ?? 3002)
  const server = createServer(async (request, response) => {
    if (request.method !== 'GET' || (request.url !== '/health' && request.url !== '/api/v1/health')) {
      response.writeHead(404, { 'content-type': 'application/json' })
      response.end(JSON.stringify({ error: 'not_found' }))
      return
    }

    const checks = await getChecks()
    const healthy = Object.values(checks).every((check) => check.ok)
    response.writeHead(healthy ? 200 : 503, { 'content-type': 'application/json' })
    response.end(JSON.stringify({
      status: healthy ? 'healthy' : 'degraded',
      processAlive: true,
      ready: healthy,
      timestamp: new Date().toISOString(),
      build,
      checks,
    }))
  })
  server.listen(port, '0.0.0.0', () => console.log(`[worker] Health endpoint listening on 0.0.0.0:${port}`))
  return server
}

async function main(): Promise<void> {
  assertFixtureAdapterConfiguration()
  await assertDatabaseSchemaCurrent()
  const redisUrl = getRedisUrl()
  let queueReady = false

  console.log(`[worker] Starting AmarktAI worker...`)
  console.log(`[worker] Redis: ${redisUrl}`)
  console.log(`[worker] Queue: ${QUEUE_NAMES.JOBS}`)
  console.log(`[worker] Concurrency: ${WORKER_CONCURRENCY}`)

  const connection = { url: redisUrl, maxRetriesPerRequest: null }
  const queue = new Queue(QUEUE_NAMES.JOBS, { connection })
  const recovered = await recoverStaleProcessingJobs(queue)
  if (recovered.length) console.log(`[worker] Recovered ${recovered.length} stale processing jobs`)
  const processJob = createJobProcessor({
    executeCapability: executeWithDurableProviderFallback,
    advanceLongFormWorkflow: (parentJobId) => advanceLongFormWorkflow(parentJobId, queue),
  })
  const worker = new Worker(
    QUEUE_NAMES.JOBS,
    async (job) => {
      const payload = {
        ...(job.data as WorkerJobData),
        queueRecoveryAttempt: job.attemptsStarted > 1 || job.name === 'process-recovery',
      }
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
  const healthServer = startHealthServer(async () => {
    const checks: Record<string, WorkerCheck> = {
      queue: { ok: queueReady }, mariadb: { ok: false }, redis: { ok: false },
      migrations: { ok: false }, artifactStorage: { ok: false }, ffmpeg: { ok: false },
    }
    try { await prisma.$queryRaw`SELECT 1`; checks.mariadb = { ok: true } } catch { checks.mariadb = { ok: false, error: 'MariaDB unavailable' } }
    try { await queue.waitUntilReady(); checks.redis = { ok: true } } catch { checks.redis = { ok: false, error: 'Redis unavailable' } }
    const schema = await getDatabaseSchemaStatus()
    checks.migrations = { ok: schema.current, requiredMigration: schema.requiredMigration, ...(schema.current ? {} : { error: 'Database migration is not current' }) }
    try {
      const root = getStorageRoot(); await mkdir(root, { recursive: true })
      const path = join(root, `.worker-health-${randomUUID()}`); await writeFile(path, 'ok', { flag: 'wx' }); await rm(path)
      checks.artifactStorage = { ok: true }
    } catch { checks.artifactStorage = { ok: false, error: 'Artifact storage is not writable' } }
    try { await execFileAsync('ffmpeg', ['-version'], { timeout: 3000, windowsHide: true }); checks.ffmpeg = { ok: true } }
    catch { checks.ffmpeg = { ok: false, error: 'FFmpeg unavailable' } }
    return checks
  })

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
