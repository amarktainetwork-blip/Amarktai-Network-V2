import type { FastifyInstance, FastifyReply, FastifyRequest } from 'fastify'
import { randomUUID } from 'node:crypto'
import { Queue } from 'bullmq'
import { prisma } from '@amarktai/db'
import { CAPABILITY_CATALOG, CAPABILITY_KEYS, QUEUE_NAMES, getDashboardAppSlug, validateOrchestraRequest, type CapabilityKey, type JobPayload } from '@amarktai/core'
import { getRuntimeProofStatus, type RuntimeProofStatusPayload } from '../lib/runtime-proof-status.js'
import { resolveAppCapabilityGrantSnapshot } from '../lib/app-grant-loader.js'

const STUDIO_CAPABILITY_ALIASES = Object.fromEntries(
  CAPABILITY_CATALOG.map((capability) => [capability.dashboardType, capability.key]),
) as Record<string, string>

const KNOWN_CAPABILITY_SET = new Set<string>(CAPABILITY_KEYS)

async function requireAdmin(app: FastifyInstance, request: FastifyRequest, reply: FastifyReply): Promise<boolean> {
  const auth = request.headers.authorization
  if (!auth?.startsWith('Bearer ')) {
    reply.status(401).send({ error: true, message: 'Authorization required' })
    return false
  }
  try {
    const payload = await app.jwtVerify(auth.replace('Bearer ', ''))
    if (payload?.role !== 'admin') {
      reply.status(403).send({ error: true, message: 'Admin access required' })
      return false
    }
    return true
  } catch {
    reply.status(401).send({ error: true, message: 'Invalid authorization' })
    return false
  }
}

function normalizeStudioCapability(capability: unknown, proofStatus: RuntimeProofStatusPayload): string | null {
  if (typeof capability !== 'string' || !capability.trim()) return null
  const value = capability.trim()
  if (STUDIO_CAPABILITY_ALIASES[value]) return STUDIO_CAPABILITY_ALIASES[value]
  if (KNOWN_CAPABILITY_SET.has(value)) return value
  const provenOrKnown = proofStatus.provenCapabilities.some((item) => item.capability === value)
    || proofStatus.unprovenCapabilities.some((item) => item.capability === value)
  return provenOrKnown ? value : null
}

function isCapabilityDashboardReady(capability: string, proofStatus: RuntimeProofStatusPayload): boolean {
  return [...proofStatus.provenCapabilities, ...proofStatus.unprovenCapabilities]
    .some((item) => item.capability === capability && item.readyForDashboardExecution)
}

export async function adminStudioRoutes(app: FastifyInstance): Promise<void> {
  // Lazily create queue
  let queue: Queue | null = null
  function getQueue(): Queue {
    if (!queue) {
      if (!app.redis) throw new Error('Redis is required for job queue')
      queue = new Queue(QUEUE_NAMES.JOBS, { connection: app.redis as never })
    }
    return queue
  }

  // Submit a Studio job
  app.post('/api/admin/studio/jobs', async (request, reply) => {
    if (!(await requireAdmin(app, request, reply))) return

    // Load canonical truth once per request
    const proofStatus = await getRuntimeProofStatus(app)

    const body = request.body as Record<string, unknown>
    const capability = normalizeStudioCapability(body.capability, proofStatus)
    const inputObj = (body.input || body) as Record<string, unknown>
    const prompt = String(body.prompt || inputObj.prompt || inputObj.text || '')
    const metadata = (body.metadata || {}) as Record<string, unknown>

    if (!capability) {
      return reply.status(400).send({ error: true, message: 'Capability is not mapped to a backend execution key' })
    }

    // Reject provider/model/routing override using shared validation
    const blockedField = validateOrchestraRequest(body) || validateOrchestraRequest(inputObj) || validateOrchestraRequest(metadata)
    if (blockedField) {
      return reply.status(400).send({ error: true, message: `Provider/model/routing override not allowed. Orchestra selects provider and model. Blocked field: ${blockedField}` })
    }

    const canonicalCapability = capability as CapabilityKey
    const appSlug = getDashboardAppSlug(canonicalCapability)
    const grantResolution = await resolveAppCapabilityGrantSnapshot(appSlug, canonicalCapability)
    if (!grantResolution || !grantResolution.grant.enabled) {
      return reply.status(403).send({ error: true, message: `No enabled AppCapabilityGrant exists for ${appSlug}/${capability}` })
    }
    if (capability.startsWith('adult_') && !grantResolution.grant.adultPermission) {
      return reply.status(403).send({ error: true, message: `Adult execution requires an explicit adult AppCapabilityGrant` })
    }

    // Evaluate runtime readiness only after authorization so a missing or
    // disabled grant is reported as an access denial, not a contract error.
    if (!isCapabilityDashboardReady(capability, proofStatus)) {
      return reply.status(400).send({ error: true, message: `Capability "${capability}" is not ready for dashboard execution` })
    }

    // Create job
    const immutableMetadata = {
      ...metadata,
      appGrantSnapshot: grantResolution.grant,
      appGrantSnapshotSource: grantResolution.source,
      appGrantSnapshotAt: new Date().toISOString(),
    }
    const traceId = `trace_${randomUUID()}`
    const safePrompt = prompt.substring(0, 10000)
    const job = await prisma.job.create({
      data: {
        appSlug,
        capability: capability as never,
        prompt: safePrompt,
        inputJson: JSON.stringify(inputObj),
        metadataJson: JSON.stringify(immutableMetadata),
        traceId,
        status: 'queued',
      },
    })

    // Enqueue in BullMQ
    try {
      const q = getQueue()
      const payload: JobPayload = {
        jobId: job.id,
        appSlug,
        capability: canonicalCapability,
        prompt: safePrompt,
        input: inputObj,
        metadata: immutableMetadata,
        traceId,
        routingMode: 'balanced',
        appGrantSnapshot: grantResolution.grant,
      }
      app.log.info({ queueName: QUEUE_NAMES.JOBS, jobId: job.id, appSlug, capability, traceId }, 'Enqueuing Studio job')
      await q.add('process-job', payload, { jobId: job.id })
    } catch {
      await prisma.job.update({
        where: { id: job.id },
        data: { status: 'failed', error: 'Failed to enqueue job' },
      })
      return reply.status(500).send({ error: true, message: 'Failed to enqueue job' })
    }

    return reply.send({
      jobId: job.id,
      status: job.status,
      capability: job.capability,
      createdAt: job.createdAt?.toISOString(),
    })
  })
}
