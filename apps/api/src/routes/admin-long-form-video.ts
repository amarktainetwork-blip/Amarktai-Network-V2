import type { FastifyInstance, FastifyReply, FastifyRequest } from 'fastify'
import {
  LongFormVideoRequestSchema,
  createLongFormVideoPlan,
  validateLongFormVideoRequest
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

export async function adminLongFormVideoRoutes(app: FastifyInstance): Promise<void> {
  /**
   * Create a long-form video plan (Phase 1: orchestration foundation)
   * 
   * This endpoint creates a plan but does NOT execute video generation.
   * It returns the plan with missing dependencies and executability status.
   */
  app.post('/api/admin/long-form-video/plan', async (request, reply) => {
    if (!(await requireAdmin(app, request, reply))) return

    const body = request.body as Record<string, unknown>

    // Validate input
    let validatedRequest
    try {
      validatedRequest = validateLongFormVideoRequest(body)
    } catch (error) {
      return reply.status(400).send({
        error: true,
        message: 'Invalid request',
        details: error instanceof Error ? error.message : 'Validation failed'
      })
    }

    // Create plan
    try {
      const plan = createLongFormVideoPlan(validatedRequest)

      return reply.status(200).send({
        success: true,
        plan,
        message: 'Long-form video plan created. Final rendering is not executable yet.',
        nextSteps: [
          'Phase 2: Implement per-scene video generation',
          'Phase 3: Implement voiceover/subtitles/music bed (if enabled)',
          'Phase 4: Implement scene stitching with ffmpeg',
          'Phase 5: Implement final assembly pipeline'
        ]
      })
    } catch (error) {
      return reply.status(500).send({
        error: true,
        message: 'Failed to create plan',
        details: error instanceof Error ? error.message : 'Unknown error'
      })
    }
  })

  /**
   * Get long-form video capability status
   */
  app.get('/api/admin/long-form-video/status', async (request, reply) => {
    if (!(await requireAdmin(app, request, reply))) return

    const { LONG_FORM_VIDEO_STATUS } = await import('@amarktai/core')

    return reply.status(200).send({
      success: true,
      status: LONG_FORM_VIDEO_STATUS,
      message: 'Long-form video orchestration foundation is ready. Final rendering is pending.'
    })
  })
}
