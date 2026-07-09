import type { FastifyInstance, FastifyReply, FastifyRequest } from 'fastify'
import { randomUUID } from 'node:crypto'
import { Queue } from 'bullmq'
import { prisma } from '@amarktai/db'
import { QUEUE_NAMES } from '@amarktai/core'

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

export async function adminJobRoutes(app: FastifyInstance): Promise<void> {
  let queue: Queue | null = null
  function getQueue(): Queue {
    if (!queue) {
      if (!app.redis) throw new Error('Redis is required for job queue')
      queue = new Queue(QUEUE_NAMES.JOBS, { connection: app.redis as never })
    }
    return queue
  }

  app.get('/api/admin/jobs', async (request, reply) => {
    if (!(await requireAdmin(app, request, reply))) return

    const { status, capability, provider, limit = '50', offset = '0' } = request.query as Record<string, string>

    const where: Record<string, unknown> = {}
    if (status) where.status = status
    if (capability) where.capability = capability
    if (provider) where.provider = provider

    const jobs = await prisma.job.findMany({
      where,
      orderBy: { createdAt: 'desc' },
      take: Math.min(Number(limit) || 50, 200),
      skip: Number(offset) || 0,
    })

    const total = await prisma.job.count({ where })

    return reply.send({
      jobs: jobs.map((job) => ({
        id: job.id,
        appSlug: job.appSlug,
        capability: job.capability,
        status: job.status,
        provider: job.provider || null,
        model: job.model || null,
        artifactId: job.artifactId || null,
        progress: job.progress,
        error: job.error || null,
        createdAt: job.createdAt?.toISOString(),
        startedAt: job.startedAt?.toISOString() || null,
        completedAt: job.completedAt?.toISOString() || null,
      })),
      total,
      limit: Math.min(Number(limit) || 50, 200),
      offset: Number(offset) || 0,
    })
  })

  app.get('/api/admin/jobs/:id', async (request, reply) => {
    if (!(await requireAdmin(app, request, reply))) return

    const { id } = request.params as { id: string }
    const job = await prisma.job.findUnique({ where: { id } })
    if (!job) return reply.status(404).send({ error: true, message: 'Job not found' })

    return reply.send({
      id: job.id,
      appSlug: job.appSlug,
      capability: job.capability,
      status: job.status,
      provider: job.provider || null,
      model: job.model || null,
      artifactId: job.artifactId || null,
      progress: job.progress,
      output: job.output || null,
      error: job.error || null,
      createdAt: job.createdAt?.toISOString(),
      startedAt: job.startedAt?.toISOString() || null,
      completedAt: job.completedAt?.toISOString() || null,
    })
  })

  app.post('/api/admin/jobs/:id/requeue', async (request, reply) => {
    if (!(await requireAdmin(app, request, reply))) return

    const { id } = request.params as { id: string }
    const job = await prisma.job.findUnique({ where: { id } })
    if (!job) return reply.status(404).send({ error: true, message: 'Job not found' })

    const traceId = job.traceId || `trace_${randomUUID()}`
    const payload = {
      jobId: job.id,
      appSlug: job.appSlug,
      capability: job.capability,
      prompt: job.prompt,
      input: safeParseJsonObject(job.inputJson),
      metadata: safeParseJsonObject(job.metadataJson),
      traceId,
      callbackUrl: job.callbackUrl || undefined,
    }

    await prisma.job.update({
      where: { id: job.id },
      data: {
        status: 'queued',
        error: null,
        completedAt: null,
        startedAt: null,
        progress: 0,
        traceId,
      },
    })

    try {
      const q = getQueue()
      app.log.info({ queueName: QUEUE_NAMES.JOBS, jobId: job.id, appSlug: job.appSlug, capability: job.capability, traceId }, 'Requeuing admin job')
      await q.add('process-job', payload, { jobId: job.id })
    } catch {
      await prisma.job.update({
        where: { id: job.id },
        data: { status: 'failed', error: 'Failed to requeue job', completedAt: new Date() },
      })
      return reply.status(500).send({ error: true, message: 'Failed to requeue job' })
    }

    return reply.send({
      jobId: job.id,
      status: 'queued',
      capability: job.capability,
      traceId,
    })
  })
}

function safeParseJsonObject(value: unknown): Record<string, unknown> {
  if (typeof value !== 'string' || !value.trim()) return {}
  try {
    const parsed = JSON.parse(value)
    return typeof parsed === 'object' && parsed !== null && !Array.isArray(parsed)
      ? parsed as Record<string, unknown>
      : {}
  } catch {
    return {}
  }
}
