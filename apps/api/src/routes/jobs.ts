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
  SPECIALIST_VISION_CAPABILITIES,
  ImageUpscaleRequestSchema,
  durableIdempotencyTrace,
  isValidRoutingMode,
  type JobPayload,
  type CreateJobResponse,
  type JobStatusResponse,
  validateDirectProviderRequest,
} from '@amarktai/core'
import { resolveAppCapabilityGrantSnapshot } from '../lib/app-grant-loader.js'

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
  if (!bearerHeader) return { ok: false, statusCode: 401, error: 'Missing Authorization header' }
  const token = parseBearerToken(bearerHeader)
  if (!token) return { ok: false, statusCode: 401, error: 'Invalid Authorization format. Use: Bearer <KEY>' }

  const apiKey = await prisma.appApiKey.findUnique({
    where: { key: hashAppApiKey(token) },
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
  if (!apiKey) return { ok: false, statusCode: 401, error: 'Invalid API key' }
  if (!apiKey.active) return { ok: false, statusCode: 403, error: 'API key is deactivated' }
  const conn = apiKey.appConnection
  if (!conn || conn.status !== 'active') return { ok: false, statusCode: 403, error: 'App connection is not active' }

  let allowedCaps: string[] = []
  try { allowedCaps = JSON.parse(conn.allowedCapabilities ?? '[]') } catch { allowedCaps = [] }
  const budget = await prisma.appBudgetConfig.findUnique({ where: { appSlug: conn.appSlug } })
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

export async function jobRoutes(app: FastifyInstance): Promise<void> {
  let queue: Queue | null = null
  function getQueue(): Queue {
    if (!queue) {
      if (!app.redis) throw new Error('Redis is required for job queue')
      queue = new Queue(QUEUE_NAMES.JOBS, { connection: app.redis as never })
    }
    return queue
  }

  app.post('/api/v1/jobs', async (request, reply) => {
    const auth = await authenticateAppKey(request.headers.authorization)
    if (!auth.ok) return reply.status(auth.statusCode).send({ error: true, message: auth.error })

    const body = request.body as Record<string, unknown>
    const blockedField = hasBlockedOverrides(body)
      || hasBlockedOverrides((body.input ?? {}) as Record<string, unknown>)
      || hasBlockedOverrides((body.metadata ?? {}) as Record<string, unknown>)
    if (blockedField) {
      return reply.status(400).send({ error: true, message: `Field '${blockedField}' is not allowed. Provider and model routing decisions are made exclusively by the AmarktAI Network engine.` })
    }

    const parsed = CreateJobRequestSchema.safeParse(body)
    if (!parsed.success) return reply.status(400).send({ error: true, message: 'Invalid request body', details: parsed.error.issues })

    const { capability, prompt, input, metadata, callbackUrl, route } = parsed.data
    const configuredWebhookUrl = auth.webhookUrl || undefined
    if (callbackUrl && callbackUrl !== configuredWebhookUrl) {
      return reply.status(400).send({ error: true, message: 'callbackUrl must exactly match the app webhook configured by an administrator.' })
    }
    const effectiveCallbackUrl = configuredWebhookUrl

    const imageUpscale = capability === 'image_upscale'
    let validatedInput: Record<string, unknown>
    if (imageUpscale) {
      const upscaleRequest = ImageUpscaleRequestSchema.safeParse(input)
      if (!upscaleRequest.success) {
        return reply.status(400).send({
          error: true,
          message: `Invalid image_upscale request: ${upscaleRequest.error.issues.map((issue) => `${issue.path.join('.') || 'input'} ${issue.message}`).join('; ')}`,
          details: upscaleRequest.error.issues,
        })
      }
      validatedInput = upscaleRequest.data
    } else {
      const capabilityRequest = validateDirectProviderRequest(capability, prompt, input)
      if (!capabilityRequest.success) {
        return reply.status(400).send({ error: true, message: capabilityRequest.error, details: capabilityRequest.issues })
      }
      validatedInput = capabilityRequest.data ?? input
    }

    const specialistVision = (SPECIALIST_VISION_CAPABILITIES as readonly string[]).includes(capability)
    const governedSourceArtifact = specialistVision || imageUpscale
    if (governedSourceArtifact) {
      const sourceArtifactId = ['sourceImageArtifactId', 'sourceVideoArtifactId', 'sourceDocumentArtifactId']
        .map((field) => validatedInput[field])
        .find((value): value is string => typeof value === 'string' && Boolean(value.trim()))
      if (sourceArtifactId) {
        const sourceArtifact = await prisma.artifact.findFirst({
          where: { id: sourceArtifactId, appSlug: auth.app!.slug, status: 'completed' },
          select: { id: true, type: true, mimeType: true },
        })
        if (!sourceArtifact) return reply.status(404).send({ error: true, code: 'SOURCE_ARTIFACT_NOT_FOUND', message: 'Authorised source artifact was not found.' })
        if (imageUpscale && sourceArtifact.type !== 'image' && !sourceArtifact.mimeType.startsWith('image/')) {
          return reply.status(400).send({ error: true, code: 'INVALID_SOURCE_ARTIFACT_TYPE', message: 'image_upscale requires a completed image artifact.' })
        }
      }
    }

    const grantResolution = await resolveAppCapabilityGrantSnapshot(auth.app!.slug, capability, auth.allowedCapabilities ?? [])
    if (!grantResolution || !grantResolution.grant.enabled) {
      return reply.status(403).send({ error: true, message: `Capability '${capability}' has no enabled AppCapabilityGrant for this app.` })
    }
    if (capability.startsWith('adult_') && !grantResolution.grant.adultPermission) {
      return reply.status(403).send({ error: true, message: `Capability '${capability}' requires an explicit adult AppCapabilityGrant.` })
    }
    if (governedSourceArtifact && (!grantResolution.grant.artifactRead || !grantResolution.grant.artifactWrite)) {
      return reply.status(403).send({ error: true, code: 'SOURCE_ARTIFACT_GRANT_REQUIRED', message: `${capability} requires artifact read and write grants.` })
    }
    if (route) {
      const routeKey = `${route.provider}/${route.model}`
      if (grantResolution.grant.routingMode !== 'app_selectable_allowlist' || !grantResolution.grant.selectableAllowlist?.includes(routeKey)) {
        return reply.status(403).send({ error: true, message: `Route '${routeKey}' is not approved for this app and capability.` })
      }
    }

    const immutableMetadata = {
      ...metadata,
      executionProfile: 'external_app',
      appGrantSnapshot: grantResolution.grant,
      appGrantSnapshotSource: grantResolution.source,
      appGrantSnapshotAt: new Date().toISOString(),
      requestedRoute: route ?? null,
      ...(imageUpscale ? { internalSourceArtifactId: validatedInput.sourceImageArtifactId, internalExecutionEngine: 'ffmpeg' } : {}),
    }

    if (auth.dailyBudgetCents && auth.dailyBudgetCents > 0) {
      const today = new Date()
      today.setHours(0, 0, 0, 0)
      const usage = await prisma.usageMeter.aggregate({
        where: { appSlug: auth.app!.slug, date: { gte: today } },
        _sum: { costUsdCents: true },
      })
      if ((usage._sum.costUsdCents ?? 0) >= auth.dailyBudgetCents) {
        return reply.status(429).send({ error: true, message: 'Daily cost budget limit reached. Try again tomorrow.' })
      }
    }

    const costMultiplier = TOKEN_COST_MULTIPLIER[capability] ?? 1
    if (auth.tokenBalance !== undefined && auth.tokenBalance < costMultiplier) {
      return reply.status(402).send({
        error: true,
        message: `Insufficient token balance. This capability requires ${costMultiplier} tokens, but only ${auth.tokenBalance} remain. Please top up your account.`,
        required: costMultiplier,
        remaining: auth.tokenBalance,
      })
    }

    const idempotencyKey = governedSourceArtifact && typeof validatedInput.idempotencyKey === 'string' ? validatedInput.idempotencyKey : null
    const traceId = idempotencyKey ? durableIdempotencyTrace(auth.app!.slug, capability, idempotencyKey) : `trace_${randomUUID()}`
    if (idempotencyKey) {
      const existing = await prisma.job.findFirst({ where: { appSlug: auth.app!.slug, capability, traceId }, orderBy: { createdAt: 'desc' } })
      if (existing) {
        return reply.status(200).send({ jobId: existing.id, status: existing.status, capability, createdAt: existing.createdAt.toISOString(), deduplicated: true })
      }
    }

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

    if (auth.connectionId && costMultiplier > 0) {
      await prisma.appConnection.update({ where: { id: auth.connectionId }, data: { tokenBalance: { decrement: costMultiplier } } })
    }

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
      routingMode: isValidRoutingMode(metadata?.routingMode) ? metadata.routingMode as string : 'balanced',
      appGrantSnapshot: grantResolution.grant,
    }

    try {
      await getQueue().add('process', payload, { ...DEFAULT_JOB_OPTIONS, jobId: job.id })
    } catch (err) {
      await prisma.job.update({ where: { id: job.id }, data: { status: 'failed', error: 'Failed to enqueue job' } })
      app.log.error({ err }, 'Failed to push job to queue')
      return reply.status(500).send({ error: true, message: 'Failed to enqueue job' })
    }

    const response: CreateJobResponse = { jobId: job.id, status: 'queued', capability, createdAt: job.createdAt.toISOString() }
    return reply.status(201).send(response)
  })

  app.get('/api/v1/jobs/:id', async (request, reply) => {
    const { id } = request.params as { id: string }
    const auth = await authenticateAppKey(request.headers.authorization)
    if (!auth.ok) return reply.status(auth.statusCode).send({ error: true, message: auth.error })

    const job = await prisma.job.findUnique({ where: { id } })
    if (!job || job.appSlug !== auth.app!.slug) return reply.status(404).send({ error: true, message: 'Job not found' })

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
        outputValidation: jobMetadata.directProviderOutputValidation ?? jobMetadata.outputValidation ?? null,
        errorClassification: jobMetadata.directProviderErrorClassification ?? null,
        sourceArtifactId: stringMetadata(jobMetadata.directProviderSourceArtifactId) || stringMetadata(jobMetadata.internalSourceArtifactId),
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
