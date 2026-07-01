/**
 * Job ingestion and status routes.
 *
 * POST /api/v1/jobs — Ingest a new capability request from an external app.
 * GET  /api/v1/jobs/:id — Poll job status for external callers.
 *
 * Validation pulls strictly from @amarktai/core (single source of truth).
 */

import type { FastifyInstance } from 'fastify'
import { Queue } from 'bullmq'
import { prisma } from '@amarktai/db'
import {
  CreateJobRequestSchema,
  hasBlockedOverrides,
  parseBearerToken,
  QUEUE_NAMES,
  DEFAULT_JOB_OPTIONS,
  type JobPayload,
  type CreateJobResponse,
  type JobStatusResponse,
} from '@amarktai/core'

// ── Auth Helper ───────────────────────────────────────────────────────────────

async function authenticateAppKey(bearerHeader: string | undefined): Promise<{
  ok: boolean
  statusCode: number
  error?: string
  app?: { id: number; name: string; slug: string }
  allowedCapabilities?: string[]
  dailyBudgetCents?: number
}> {
  if (!bearerHeader) {
    return { ok: false, statusCode: 401, error: 'Missing Authorization header' }
  }

  const token = parseBearerToken(bearerHeader)
  if (!token) {
    return { ok: false, statusCode: 401, error: 'Invalid Authorization format. Use: Bearer <KEY>' }
  }

  // Look up the AppApiKey record
  const apiKey = await prisma.appApiKey.findUnique({
    where: { key: token },
    include: {
      appConnection: {
        select: {
          id: true,
          appSlug: true,
          appName: true,
          status: true,
          allowedCapabilities: true,
        },
      },
    },
  })

  if (!apiKey) {
    return { ok: false, statusCode: 401, error: 'Invalid API key' }
  }

  if (!apiKey.active) {
    return { ok: false, statusCode: 403, error: 'API key is deactivated' }
  }

  const conn = apiKey.appConnection
  if (!conn || conn.status !== 'active') {
    return { ok: false, statusCode: 403, error: 'App connection is not active' }
  }

  // Parse allowed capabilities
  let allowedCaps: string[] = []
  try {
    allowedCaps = JSON.parse(conn.allowedCapabilities ?? '[]')
  } catch {
    allowedCaps = []
  }

  // Get daily budget
  const budget = await prisma.appBudgetConfig.findUnique({
    where: { appSlug: conn.appSlug },
  })

  return {
    ok: true,
    statusCode: 200,
    app: { id: conn.id, name: conn.appName, slug: conn.appSlug },
    allowedCapabilities: allowedCaps,
    dailyBudgetCents: budget?.dailyBudgetCents ?? 0,
  }
}

// ── Route Registration ────────────────────────────────────────────────────────

export async function jobRoutes(app: FastifyInstance): Promise<void> {
  // Lazily create queue (only when Redis is available)
  let queue: Queue | null = null
  function getQueue(): Queue {
    if (!queue) {
      if (!app.redis) throw new Error('Redis is required for job queue')
      queue = new Queue(QUEUE_NAMES.JOBS, { connection: app.redis })
    }
    return queue
  }

  // ── POST /api/v1/jobs ──────────────────────────────────────────────────────

  app.post('/api/v1/jobs', async (request, reply) => {
    // 1. Authenticate
    const auth = await authenticateAppKey(request.headers.authorization)
    if (!auth.ok) {
      return reply.status(auth.statusCode).send({ error: true, message: auth.error })
    }

    const body = request.body as Record<string, unknown>

    // 2. COMPLIANCE GATE: Block provider/model overrides
    const blockedField = hasBlockedOverrides(body)
    if (blockedField) {
      return reply.status(400).send({
        error: true,
        message: `Field '${blockedField}' is not allowed. Provider and model routing decisions are made exclusively by the AmarktAI Network engine.`,
      })
    }

    // 3. Validate request body against single source of truth
    const parsed = CreateJobRequestSchema.safeParse(body)
    if (!parsed.success) {
      return reply.status(400).send({
        error: true,
        message: 'Invalid request body',
        details: parsed.error.issues,
      })
    }

    const { capability, prompt, input, metadata, callbackUrl } = parsed.data

    // 4. Check capability allowlist
    const allowedCaps = auth.allowedCapabilities ?? []
    if (allowedCaps.length > 0 && !allowedCaps.includes(capability)) {
      return reply.status(403).send({
        error: true,
        message: `Capability '${capability}' is not allowed for this app. Allowed: ${allowedCaps.join(', ')}`,
      })
    }

    // 5. Check daily budget
    if (auth.dailyBudgetCents && auth.dailyBudgetCents > 0) {
      const today = new Date()
      today.setHours(0, 0, 0, 0)
      const usage = await prisma.usageMeter.aggregate({
        where: {
          appSlug: auth.app!.slug,
          date: { gte: today },
        },
        _sum: { costUsdCents: true },
      })
      const dailySpend = usage._sum.costUsdCents ?? 0
      if (dailySpend >= auth.dailyBudgetCents) {
        return reply.status(429).send({
          error: true,
          message: 'Daily cost budget limit reached. Try again tomorrow.',
        })
      }
    }

    // 6. Create Job record in PostgreSQL
    const traceId = `trace_${Date.now()}_${Math.random().toString(36).slice(2, 10)}`
    const job = await prisma.job.create({
      data: {
        appSlug: auth.app!.slug,
        capability,
        prompt,
        inputJson: JSON.stringify(input),
        metadataJson: JSON.stringify(metadata),
        traceId,
        status: 'queued',
        callbackUrl: callbackUrl ?? null,
      },
    })

    // 7. Push to BullMQ queue
    const payload: JobPayload = {
      jobId: job.id,
      appSlug: auth.app!.slug,
      capability,
      prompt,
      input,
      metadata,
      traceId,
      callbackUrl,
    }

    try {
      const q = getQueue()
      await q.add('process', payload, {
        ...DEFAULT_JOB_OPTIONS,
        jobId: job.id,
      })
    } catch (err) {
      // If queue push fails, mark job as failed
      await prisma.job.update({
        where: { id: job.id },
        data: { status: 'failed', error: 'Failed to enqueue job' },
      })
      app.log.error({ err }, 'Failed to push job to queue')
      return reply.status(500).send({ error: true, message: 'Failed to enqueue job' })
    }

    // 8. Return tracking ID
    const response: CreateJobResponse = {
      jobId: job.id,
      status: 'queued',
      capability,
      createdAt: job.createdAt.toISOString(),
    }

    return reply.status(201).send(response)
  })

  // ── GET /api/v1/jobs/:id ───────────────────────────────────────────────────

  app.get('/api/v1/jobs/:id', async (request, reply) => {
    const { id } = request.params as { id: string }

    // Authenticate
    const auth = await authenticateAppKey(request.headers.authorization)
    if (!auth.ok) {
      return reply.status(auth.statusCode).send({ error: true, message: auth.error })
    }

    // Fetch job
    const job = await prisma.job.findUnique({ where: { id } })
    if (!job) {
      return reply.status(404).send({ error: true, message: 'Job not found' })
    }

    // Ensure the job belongs to the authenticated app
    if (job.appSlug !== auth.app!.slug) {
      return reply.status(404).send({ error: true, message: 'Job not found' })
    }

    const response: JobStatusResponse = {
      jobId: job.id,
      status: job.status as JobStatusResponse['status'],
      capability: job.capability,
      provider: job.provider,
      model: job.model,
      artifactId: job.artifactId,
      progress: job.progress,
      error: job.error,
      createdAt: job.createdAt.toISOString(),
      startedAt: job.startedAt?.toISOString() ?? null,
      completedAt: job.completedAt?.toISOString() ?? null,
    }

    return reply.send(response)
  })
}
