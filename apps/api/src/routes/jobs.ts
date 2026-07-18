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
import { randomUUID } from 'node:crypto'
import { prisma } from '@amarktai/db'
import {
  CreateJobRequestSchema,
  hasBlockedOverrides,
  parseBearerToken,
  hashAppApiKey,
  QUEUE_NAMES,
  DEFAULT_JOB_OPTIONS,
  TOKEN_COST_MULTIPLIER,
  isValidRoutingMode,
  type JobPayload,
  type CreateJobResponse,
  type JobStatusResponse,
  validateDirectProviderRequest,
} from '@amarktai/core'
import { resolveAppCapabilityGrantSnapshot } from '../lib/app-grant-loader.js'

// ── Auth Helper ───────────────────────────────────────────────────────────────

export async function authenticateAppKey(bearerHeader: string | undefined): Promise<{
  ok: boolean
  statusCode: number
  error?: string
  app?: { id: string; name: string; slug: string }
  allowedCapabilities?: string[]
  dailyBudgetCents?: number
  tokenBalance?: number
  connectionId?: string
  webhookUrl?: string
}> {
  if (!bearerHeader) {
    return { ok: false, statusCode: 401, error: 'Missing Authorization header' }
  }

  const token = parseBearerToken(bearerHeader)
  if (!token) {
    return { ok: false, statusCode: 401, error: 'Invalid Authorization format. Use: Bearer <KEY>' }
  }

  const hashedToken = hashAppApiKey(token)

  const apiKey = await prisma.appApiKey.findUnique({
    where: { key: hashedToken },
    include: {
      appConnection: {
        select: {
          id: true,
          appSlug: true,
          appName: true,
          status: true,
          allowedCapabilities: true,
          tokenBalance: true,
          webhookUrl: true,
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
    tokenBalance: conn.tokenBalance,
    connectionId: conn.id,
    webhookUrl: conn.webhookUrl,
  }
}

// ── Route Registration ────────────────────────────────────────────────────────

export async function jobRoutes(app: FastifyInstance): Promise<void> {
  // Lazily create queue (only when Redis is available)
  let queue: Queue | null = null
  function getQueue(): Queue {
    if (!queue) {
      if (!app.redis) throw new Error('Redis is required for job queue')
      queue = new Queue(QUEUE_NAMES.JOBS, { connection: app.redis as never })
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
      || hasBlockedOverrides((body.input ?? {}) as Record<string, unknown>)
      || hasBlockedOverrides((body.metadata ?? {}) as Record<string, unknown>)
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

    const { capability, prompt, input, metadata, callbackUrl, route } = parsed.data

    const configuredWebhookUrl = auth.webhookUrl || undefined
    if (callbackUrl && callbackUrl !== configuredWebhookUrl) {
      return reply.status(400).send({
        error: true,
        message: 'callbackUrl must exactly match the app webhook configured by an administrator.',
      })
    }
    const effectiveCallbackUrl = configuredWebhookUrl

    const capabilityRequest = validateDirectProviderRequest(capability, prompt, input)
    if (!capabilityRequest.success) {
      return reply.status(400).send({
        error: true,
        message: capabilityRequest.error,
        details: capabilityRequest.issues,
      })
    }
    const validatedInput = capabilityRequest.data ?? input

    // 4. Resolve the one immutable AppCapabilityGrant authority. The legacy
    // allowlist is migration input only and is never consulted by the worker.
    const allowedCaps = auth.allowedCapabilities ?? []
    const grantResolution = await resolveAppCapabilityGrantSnapshot(auth.app!.slug, capability, allowedCaps)
    if (!grantResolution || !grantResolution.grant.enabled) {
      return reply.status(403).send({
        error: true,
        message: `Capability '${capability}' has no enabled AppCapabilityGrant for this app.`,
      })
    }
    if (capability.startsWith('adult_') && !grantResolution.grant.adultPermission) {
      return reply.status(403).send({
        error: true,
        message: `Capability '${capability}' requires an explicit adult AppCapabilityGrant.`,
      })
    }
    if (route) {
      const routeKey = `${route.provider}/${route.model}`
      if (grantResolution.grant.routingMode !== 'app_selectable_allowlist'
          || !grantResolution.grant.selectableAllowlist?.includes(routeKey)) {
        return reply.status(403).send({ error: true, message: `Route '${routeKey}' is not approved for this app and capability.` })
      }
    }

    const grantSnapshotAt = new Date().toISOString()
    const immutableMetadata = {
      ...metadata,
      executionProfile: 'external_app',
      appGrantSnapshot: grantResolution.grant,
      appGrantSnapshotSource: grantResolution.source,
      appGrantSnapshotAt: grantSnapshotAt,
      requestedRoute: route ?? null,
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

    // 6. TOKEN TOLLBOOTH: Check token ledger balance
    const costMultiplier = TOKEN_COST_MULTIPLIER[capability] ?? 1
    if (auth.tokenBalance !== undefined && auth.tokenBalance < costMultiplier) {
      return reply.status(402).send({
        error: true,
        message: `Insufficient token balance. This capability requires ${costMultiplier} tokens, but only ${auth.tokenBalance} remain. Please top up your account.`,
        required: costMultiplier,
        remaining: auth.tokenBalance,
      })
    }

    // 7. Create Job record in MySQL
    const traceId = `trace_${randomUUID()}`
    const job = await prisma.job.create({
      data: {
        appSlug: auth.app!.slug,
        capability,
        prompt,
        inputJson: JSON.stringify(validatedInput),
        metadataJson: JSON.stringify(immutableMetadata),
        traceId,
        status: 'queued',
        callbackUrl: effectiveCallbackUrl ?? null,
      },
    })

    // 8. Deduct tokens from ledger (pre-paid model)
    if (auth.connectionId && costMultiplier > 0) {
      await prisma.appConnection.update({
        where: { id: auth.connectionId },
        data: { tokenBalance: { decrement: costMultiplier } },
      })
    }

    // 9. Push to BullMQ queue
    const routingMode = isValidRoutingMode(metadata?.routingMode) ? metadata.routingMode as string : 'balanced'
    const payload: JobPayload = {
      jobId: job.id,
      appSlug: auth.app!.slug,
      capability,
      executionProfile: 'external_app',
      prompt,
      input: validatedInput,
      metadata: immutableMetadata,
      traceId,
      callbackUrl: effectiveCallbackUrl,
      routingMode,
      appGrantSnapshot: grantResolution.grant,
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

    // 10. Return tracking ID
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

    const jobMetadata = parseJobMetadata(job.metadataJson)
    const routeAttempts = Array.isArray(jobMetadata.orchestraRouteAttempts) ? jobMetadata.orchestraRouteAttempts : []

    const response: JobStatusResponse = {
      jobId: job.id,
      executionId: job.executionId || stringMetadata(jobMetadata.orchestraExecutionId),
      appSlug: job.appSlug,
      status: job.status as JobStatusResponse['status'],
      capability: job.capability,
      provider: job.provider,
      model: job.model,
      artifactId: job.artifactId,
      progress: job.progress,
      error: job.error,
      output: job.output,
      executionEvidence: {
        grantSnapshotSource: stringMetadata(jobMetadata.appGrantSnapshotSource),
        executorId: stringMetadata(jobMetadata.directProviderExecutorId) || stringMetadata(jobMetadata.orchestraActualExecutorId) || stringMetadata(jobMetadata.orchestraSelectedExecutorId),
        routeType: stringMetadata(jobMetadata.directProviderRouteType),
        fallbackAttempts: routeAttempts,
        usage: jobMetadata.directProviderUsage ?? null,
        cost: jobMetadata.directProviderCostEvidence ?? null,
        outputValidation: jobMetadata.directProviderOutputValidation ?? null,
        errorClassification: jobMetadata.directProviderErrorClassification ?? null,
      },
      createdAt: job.createdAt.toISOString(),
      startedAt: job.startedAt?.toISOString() ?? null,
      completedAt: job.completedAt?.toISOString() ?? null,
    }

    return reply.send(response)
  })
}

function parseJobMetadata(value: string): Record<string, unknown> {
  try {
    const parsed = JSON.parse(value)
    return typeof parsed === 'object' && parsed !== null && !Array.isArray(parsed) ? parsed as Record<string, unknown> : {}
  } catch {
    return {}
  }
}

function stringMetadata(value: unknown): string | null {
  return typeof value === 'string' && value.trim() ? value : null
}
