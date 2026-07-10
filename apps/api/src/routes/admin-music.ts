import type { FastifyInstance, FastifyReply, FastifyRequest } from 'fastify'
import {
  BLOCKED_OVERRIDE_FIELDS,
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
    } catch (error) {
      return reply.status(400).send({
        error: true,
        message: 'Invalid music generation request',
        details: error instanceof Error ? error.message : 'Validation failed',
      })
    }
  })
}
