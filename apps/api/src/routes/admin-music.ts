import type { FastifyInstance, FastifyReply, FastifyRequest } from 'fastify'
import { randomUUID } from 'node:crypto'
import { Queue } from 'bullmq'
import { prisma } from '@amarktai/db'
import {
  BLOCKED_OVERRIDE_FIELDS,
  QUEUE_NAMES,
  createMusicGenerationPlan,
  getMusicCapabilityStatus,
  validateMusicGenerationRequest,
} from '@amarktai/core'

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

function blockedOverrideField(input: Record<string, unknown>): string | null {
  for (const field of BLOCKED_OVERRIDE_FIELDS) {
    if (field in input) return field
  }
  const nestedInput = typeof input.input === 'object' && input.input !== null && !Array.isArray(input.input)
    ? input.input as Record<string, unknown>
    : null
  if (nestedInput) {
    for (const field of BLOCKED_OVERRIDE_FIELDS) {
      if (field in nestedInput) return `input.${field}`
    }
  }
  return null
}

function parseMusicRequest(body: Record<string, unknown>) {
  const nestedInput = typeof body.input === 'object' && body.input !== null && !Array.isArray(body.input)
    ? body.input as Record<string, unknown>
    : null
  const input = nestedInput
    ? { ...nestedInput, prompt: body.prompt ?? nestedInput.prompt }
    : body

  return validateMusicGenerationRequest(input)
}

export async function adminMusicRoutes(app: FastifyInstance): Promise<void> {
  let queue: Queue | null = null
  function getQueue(): Queue {
    if (!queue) {
      if (!app.redis) throw new Error('Redis is required for job queue')
      queue = new Queue(QUEUE_NAMES.JOBS, { connection: app.redis as never })
    }
    return queue
  }

  app.get('/api/admin/music/status', async (request, reply) => {
    if (!(await requireAdmin(app, request, reply))) return

    const status = getMusicCapabilityStatus()
    return reply.send({
      success: true,
      status,
      message: status.blockedReason,
    })
  })

  app.post('/api/admin/music/plan', async (request, reply) => {
    if (!(await requireAdmin(app, request, reply))) return

    const body = request.body as Record<string, unknown>
    const override = blockedOverrideField(body)
    if (override) {
      return reply.status(400).send({
        error: true,
        message: `Provider/model override not allowed. Blocked field: ${override}`,
      })
    }

    try {
      const musicRequest = parseMusicRequest(body)
      const plan = createMusicGenerationPlan(musicRequest)
      const status = getMusicCapabilityStatus()

      return reply.send({
        success: true,
        plan,
        status,
        executionReady: status.musicGenerationReady && plan.executionReady,
        message: 'Music generation plan created. Execution remains blocked until an approved provider music client is wired.',
      })
    } catch (error) {
      return reply.status(400).send({
        error: true,
        message: 'Invalid music generation request',
        details: error instanceof Error ? error.message : 'Validation failed',
      })
    }
  })

  app.post('/api/admin/music/generate', async (request, reply) => {
    if (!(await requireAdmin(app, request, reply))) return

    const body = request.body as Record<string, unknown>
    const override = blockedOverrideField(body)
    if (override) {
      return reply.status(400).send({
        error: true,
        message: `Provider/model override not allowed. Blocked field: ${override}`,
      })
    }

    try {
      const musicRequest = parseMusicRequest(body)
      const plan = createMusicGenerationPlan(musicRequest)
      const status = getMusicCapabilityStatus()

      // Creation gate: preserve explicit development/test gating.
      // Music may be queued only when implementation gates are present.
      // Because live proof is still missing, block unless explicitly allowed.
      if (!status.musicGenerationReady) {
        return reply.status(409).send({
          error: true,
          success: false,
          executionBlocked: true,
          message: status.blockedReason,
          plan,
          status,
          missingDependencies: [
            'approved_provider_music_client',
            'music_worker_executor',
            'music_artifact_execution_path',
          ],
        })
      }

      // Create canonical Job
      const appSlug = 'admin-music'
      const traceId = `trace_${randomUUID()}`
      const safePrompt = musicRequest.prompt.substring(0, 10000)
      const inputObj = {
        prompt: safePrompt,
        genre: musicRequest.genre,
        mood: musicRequest.mood,
        durationSeconds: musicRequest.durationSeconds,
        instrumentalOnly: musicRequest.instrumentalOnly,
        style: musicRequest.style,
        outputFormat: musicRequest.outputFormat,
      }

      const job = await prisma.job.create({
        data: {
          appSlug,
          capability: 'music_generation',
          prompt: safePrompt,
          inputJson: JSON.stringify(inputObj),
          metadataJson: JSON.stringify({ routingMode: musicRequest.routingMode }),
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
          capability: 'music_generation',
          prompt: safePrompt,
          input: inputObj,
          metadata: { routingMode: musicRequest.routingMode },
          traceId,
        }
        app.log.info({ queueName: QUEUE_NAMES.JOBS, jobId: job.id, appSlug, capability: 'music_generation', traceId }, 'Enqueuing music generation job')
        await q.add('process-job', payload, { jobId: job.id })
      } catch {
        await prisma.job.update({
          where: { id: job.id },
          data: { status: 'failed', error: 'Failed to enqueue job' },
        })
        return reply.status(500).send({ error: true, message: 'Failed to enqueue job' })
      }

      return reply.status(202).send({
        jobId: job.id,
        status: job.status,
        capability: job.capability,
        traceId,
        createdAt: job.createdAt?.toISOString(),
      })
    } catch (error) {
      return reply.status(400).send({
        error: true,
        message: 'Invalid music generation request',
        details: error instanceof Error ? error.message : 'Validation failed',
      })
    }
  })
}
