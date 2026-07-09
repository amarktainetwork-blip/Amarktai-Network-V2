import type { FastifyInstance, FastifyReply, FastifyRequest } from 'fastify'
import { randomUUID } from 'node:crypto'
import { Queue } from 'bullmq'
import { prisma } from '@amarktai/db'
import {
  LongFormVideoRequestSchema,
  createLongFormVideoPlan,
  validateLongFormVideoRequest,
  createSceneExecutionPayloads,
  createLongFormExecutionState,
  QUEUE_NAMES,
  DEFAULT_JOB_OPTIONS,
  isValidRoutingMode,
  type JobPayload,
} from '@amarktai/core'

// In-memory execution state store (Phase 2 - will be replaced with DB in Phase 3)
const executionStates = new Map<string, ReturnType<typeof createLongFormExecutionState>>()

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
  // Lazily create queue
  let queue: Queue | null = null
  function getQueue(): Queue {
    if (!queue) {
      if (!app.redis) throw new Error('Redis is required for job queue')
      queue = new Queue(QUEUE_NAMES.JOBS, { connection: app.redis as never })
    }
    return queue
  }

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
   * Execute per-scene video generation (Phase 2)
   * 
   * Creates video_generation jobs for each scene in the plan.
   * Uses existing Brain Router / worker video_generation path.
   * Final assembly remains blocked until stitching exists.
   */
  app.post('/api/admin/long-form-video/execute-scenes', async (request, reply) => {
    if (!(await requireAdmin(app, request, reply))) return

    const body = request.body as Record<string, unknown>
    const dryRun = body.dryRun === true

    // Validate routing mode
    const routingMode = isValidRoutingMode(body.routingMode) ? body.routingMode as string : 'balanced'

    // Get or create plan
    let plan
    if (body.plan) {
      // Use provided plan
      plan = body.plan as ReturnType<typeof createLongFormVideoPlan>
    } else if (body.request) {
      // Create plan from request
      try {
        const validatedRequest = validateLongFormVideoRequest(body.request)
        plan = createLongFormVideoPlan(validatedRequest)
      } catch (error) {
        return reply.status(400).send({
          error: true,
          message: 'Invalid request',
          details: error instanceof Error ? error.message : 'Validation failed'
        })
      }
    } else {
      return reply.status(400).send({
        error: true,
        message: 'Either plan or request must be provided'
      })
    }

    // Create execution payloads
    const payloads = createSceneExecutionPayloads(plan, routingMode)
    const executionState = createLongFormExecutionState(plan, routingMode)

    // Store execution state
    executionStates.set(executionState.executionId, executionState)

    if (dryRun) {
      return reply.status(200).send({
        success: true,
        executionId: executionState.executionId,
        dryRun: true,
        scenePayloads: payloads,
        totalScenes: payloads.length,
        finalAssemblyReady: false,
        missingDependencies: executionState.missingDependencies,
        message: 'Dry run: Scene payloads created but not queued. Final assembly remains blocked.',
        nextSteps: [
          'Remove dryRun flag to queue scene jobs',
          'Phase 3: Implement voiceover/subtitles/music bed',
          'Phase 4: Implement scene stitching with ffmpeg',
          'Phase 5: Implement final assembly'
        ]
      })
    }

    // Queue scene jobs
    const queuedJobs: Array<{ sceneNumber: number; jobId: string }> = []

    try {
      const q = getQueue()

      for (const payload of payloads) {
        const traceId = `trace_${randomUUID()}`
        const appSlug = 'dashboard-long-form'

        // Create job record
        const job = await prisma.job.create({
          data: {
            appSlug,
            capability: 'video_generation',
            prompt: payload.prompt,
            inputJson: JSON.stringify(payload.input),
            metadataJson: JSON.stringify(payload.metadata),
            traceId,
            status: 'queued',
          },
        })

        // Push to queue
        const jobPayload: JobPayload = {
          jobId: job.id,
          appSlug,
          capability: 'video_generation',
          prompt: payload.prompt,
          input: payload.input,
          metadata: payload.metadata,
          traceId,
          routingMode: payload.routingMode,
        }

        await q.add('process', jobPayload, {
          ...DEFAULT_JOB_OPTIONS,
          jobId: job.id,
        })

        queuedJobs.push({
          sceneNumber: payload.sceneNumber,
          jobId: job.id,
        })

        // Update execution state
        const updatedState = executionStates.get(executionState.executionId)!
        const sceneIndex = updatedState.scenes.findIndex(
          (s) => s.sceneNumber === payload.sceneNumber
        )
        if (sceneIndex !== -1) {
          updatedState.scenes[sceneIndex].jobId = job.id
          updatedState.scenes[sceneIndex].status = 'queued'
        }
      }

      return reply.status(200).send({
        success: true,
        executionId: executionState.executionId,
        dryRun: false,
        queuedJobs,
        totalScenes: queuedJobs.length,
        finalAssemblyReady: false,
        missingDependencies: executionState.missingDependencies,
        message: 'Scene jobs queued. Final assembly remains blocked until stitching is implemented.',
        nextSteps: [
          'Monitor scene job progress via GET /api/admin/long-form-video/executions/:id',
          'Phase 3: Implement voiceover/subtitles/music bed',
          'Phase 4: Implement scene stitching with ffmpeg',
          'Phase 5: Implement final assembly'
        ]
      })
    } catch (error) {
      return reply.status(500).send({
        error: true,
        message: 'Failed to queue scene jobs',
        details: error instanceof Error ? error.message : 'Unknown error',
        queuedJobs,
        executionId: executionState.executionId
      })
    }
  })

  /**
   * Get execution status (Phase 2)
   */
  app.get('/api/admin/long-form-video/executions/:id', async (request, reply) => {
    if (!(await requireAdmin(app, request, reply))) return

    const { id } = request.params as { id: string }
    const state = executionStates.get(id)

    if (!state) {
      return reply.status(404).send({
        error: true,
        message: 'Execution not found'
      })
    }

    // Update state from DB jobs
    for (const scene of state.scenes) {
      if (scene.jobId) {
        try {
          const job = await prisma.job.findUnique({ where: { id: scene.jobId } })
          if (job) {
            scene.status = job.status as 'queued' | 'processing' | 'completed' | 'failed'
            scene.artifactId = job.artifactId || undefined
            scene.provider = job.provider || undefined
            scene.model = job.model || undefined
            scene.error = job.error || undefined
            scene.startedAt = job.startedAt?.toISOString()
            scene.completedAt = job.completedAt?.toISOString()
          }
        } catch {
          // Ignore DB errors for status check
        }
      }
    }

    // Calculate progress
    const completedCount = state.scenes.filter((s) => s.status === 'completed').length
    state.progress = Math.round((completedCount / state.totalScenes) * 100)

    return reply.status(200).send({
      success: true,
      execution: state,
      finalAssemblyReady: false,
      message: 'Per-scene execution in progress. Final assembly remains blocked.',
      nextSteps: state.progress === 100
        ? [
            'All scenes completed. Ready for Phase 4: scene stitching',
            'Phase 4: Implement scene stitching with ffmpeg',
            'Phase 5: Implement final assembly'
          ]
        : [
            'Monitor scene job progress',
            'Phase 4: Implement scene stitching with ffmpeg',
            'Phase 5: Implement final assembly'
          ]
    })
  })

  /**
   * Get long-form video capability status
   */
  app.get('/api/admin/long-form-video/status', async (request, reply) => {
    if (!(await requireAdmin(app, request, reply))) return

    const { LONG_FORM_VIDEO_STATUS } = await import('@amarktai/core')

    return reply.status(200).send({
      success: true,
      status: {
        ...LONG_FORM_VIDEO_STATUS,
        perSceneExecutionReady: true, // Phase 2
        sceneExecutionPipelineReady: true,
      },
      message: 'Long-form video Phase 2: per-scene execution ready. Final assembly pending.',
      phases: {
        phase1: 'Orchestration foundation - READY',
        phase2: 'Per-scene execution - READY',
        phase3: 'Voiceover/subtitles/music bed - PENDING',
        phase4: 'Scene stitching with ffmpeg - PENDING',
        phase5: 'Final assembly - PENDING'
      }
    })
  })
}
