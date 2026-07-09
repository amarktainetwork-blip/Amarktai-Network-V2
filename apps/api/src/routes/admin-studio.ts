import type { FastifyInstance, FastifyReply, FastifyRequest } from 'fastify'
import { randomUUID } from 'node:crypto'
import { Queue } from 'bullmq'
import { prisma } from '@amarktai/db'
import { QUEUE_NAMES } from '@amarktai/core'
import { getRuntimeProofStatus } from '../lib/runtime-proof-status.js'

const STUDIO_CAPABILITY_ALIASES: Record<string, string> = {
  'text.chat': 'chat',
  'text.reasoning': 'reasoning',
  'text.code': 'code',
  'text.summarization': 'summarization',
  'text.translation': 'translation',
  'text.classification': 'classification',
  'text.extraction': 'extraction',
  'text.structured_output': 'structured_output',
  'image.generate': 'image_generation',
  'video.generate': 'video_generation',
}

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

function getProvenCapabilities(): string[] {
  return getRuntimeProofStatus()
    .provenCapabilities
    .filter((c) => c.readyForDashboardExecution)
    .map((c) => c.capability)
}

function normalizeStudioCapability(capability: unknown): string | null {
  if (typeof capability !== 'string' || !capability.trim()) return null
  const value = capability.trim()
  if (STUDIO_CAPABILITY_ALIASES[value]) return STUDIO_CAPABILITY_ALIASES[value]
  const provenOrKnown = getRuntimeProofStatus().provenCapabilities.some((item) => item.capability === value)
    || getRuntimeProofStatus().unprovenCapabilities.some((item) => item.capability === value)
  return provenOrKnown ? value : null
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

    const body = request.body as Record<string, unknown>
    const capability = normalizeStudioCapability(body.capability)
    const inputObj = (body.input || body) as Record<string, unknown>
    const prompt = String(body.prompt || inputObj.prompt || inputObj.text || '')
    const metadata = (body.metadata || {}) as Record<string, unknown>

    if (!capability) {
      return reply.status(400).send({ error: true, message: 'Capability is not mapped to a backend execution key' })
    }

    // Reject provider/model override
    if (body.provider || body.model || metadata.provider || metadata.model) {
      return reply.status(400).send({ error: true, message: 'Provider/model override not allowed. Runtime selects provider/model.' })
    }

    // Evaluate runtime proof per request
    const provenCapabilities = getProvenCapabilities()
    if (!provenCapabilities.includes(capability)) {
      return reply.status(400).send({ error: true, message: `Capability "${capability}" is not proven or not ready for dashboard execution` })
    }

    // Create job
    const appSlug = 'dashboard-studio'
    const traceId = `trace_${randomUUID()}`
    const safePrompt = prompt.substring(0, 10000)
    const job = await prisma.job.create({
      data: {
        appSlug,
        capability: capability as never,
        prompt: safePrompt,
        inputJson: JSON.stringify(inputObj),
        metadataJson: JSON.stringify(metadata),
        traceId,
        status: 'queued',
      },
    })

    // Enqueue in BullMQ
    try {
      const q = getQueue()
      const payload = {
        jobId: job.id,
        appSlug,
        capability,
        prompt: safePrompt,
        input: inputObj,
        metadata,
        traceId,
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
