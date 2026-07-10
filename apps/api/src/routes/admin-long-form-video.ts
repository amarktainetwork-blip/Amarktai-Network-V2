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
import {
  checkFfmpegAvailable,
  resolveSceneArtifacts,
  validateSceneArtifactsForAssembly,
  createAssemblyPlan,
  assembleLongFormVideo,
} from '../lib/long-form-assembly.js'

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

    // Create execution state first to get a single executionId
    const executionState = createLongFormExecutionState(plan, routingMode)

    // Create execution payloads using the same executionId
    const payloads = createSceneExecutionPayloads(plan, routingMode, executionState.executionId)

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
   * 
   * If in-memory state is missing (e.g., after API restart), attempts to
   * reconstruct from DB job records using metadataJson.longFormExecutionId.
   */
  app.get('/api/admin/long-form-video/executions/:id', async (request, reply) => {
    if (!(await requireAdmin(app, request, reply))) return

    const { id } = request.params as { id: string }
    let state = executionStates.get(id)

    // If in-memory state is missing, attempt to reconstruct from DB
    if (!state) {
      try {
        // Find all jobs with this executionId in metadata
        const jobs = await prisma.job.findMany({
          where: {
            capability: 'video_generation',
            metadataJson: { contains: id },
          },
          orderBy: { createdAt: 'asc' },
        })

        if (jobs.length === 0) {
          return reply.status(404).send({
            error: true,
            message: 'Execution not found. In-memory state may have been lost after API restart.',
            note: 'Execution state is currently stored in-memory. Persistent storage will be added in a future phase.'
          })
        }

        // Reconstruct execution state from jobs
        const firstJobMetadata = JSON.parse(jobs[0].metadataJson)
        state = {
          executionId: id,
          planId: firstJobMetadata.planId || 'unknown',
          routingMode: firstJobMetadata.routingMode || 'balanced',
          totalScenes: jobs.length,
          scenes: jobs.map((job) => {
            const metadata = JSON.parse(job.metadataJson)
            return {
              sceneNumber: metadata.sceneNumber,
              sceneTitle: metadata.sceneTitle || `Scene ${metadata.sceneNumber}`,
              status: job.status as 'queued' | 'processing' | 'completed' | 'failed',
              jobId: job.id,
              artifactId: job.artifactId || undefined,
              provider: job.provider || undefined,
              model: job.model || undefined,
              error: job.error || undefined,
              startedAt: job.startedAt?.toISOString(),
              completedAt: job.completedAt?.toISOString(),
            }
          }),
          progress: 0,
          finalAssemblyReady: false,
          missingDependencies: [
            'ffmpeg/stitching',
            'final_assembly_pipeline',
            'persistent_execution_tracking'
          ],
          createdAt: jobs[0].createdAt.toISOString(),
          updatedAt: new Date().toISOString(),
        }

        // Cache reconstructed state in memory
        executionStates.set(id, state)
      } catch (error) {
        return reply.status(500).send({
          error: true,
          message: 'Failed to reconstruct execution state from DB',
          details: error instanceof Error ? error.message : 'Unknown error'
        })
      }
    } else {
      // Update state from DB jobs if in-memory state exists
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
    }

    // Calculate progress
    const completedCount = state.scenes.filter((s) => s.status === 'completed').length
    state.progress = Math.round((completedCount / state.totalScenes) * 100)

    return reply.status(200).send({
      success: true,
      execution: state,
      finalAssemblyReady: false,
      message: 'Per-scene execution in progress. Final assembly remains blocked.',
      note: 'Execution state is stored in-memory. Persistent storage will be added in a future phase.',
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
   * Assemble final long-form video (Phase 3)
   * 
   * Stitches completed scene artifacts into a single final video.
   * Requires ffmpeg to be available on the system.
   */
  app.post('/api/admin/long-form-video/assemble/:executionId', async (request, reply) => {
    if (!(await requireAdmin(app, request, reply))) return

    const { executionId } = request.params as { executionId: string }
    const body = request.body as Record<string, unknown>
    const dryRun = body.dryRun === true
    const outputTitle = body.outputTitle as string | undefined

    try {
      // Get or reconstruct execution state
      let state = executionStates.get(executionId)
      
      if (!state) {
        // Attempt to reconstruct from DB
        const jobs = await prisma.job.findMany({
          where: {
            capability: 'video_generation',
            metadataJson: { contains: executionId },
          },
          orderBy: { createdAt: 'asc' },
        })

        if (jobs.length === 0) {
          return reply.status(404).send({
            error: true,
            message: 'Execution not found',
          })
        }

        // Reconstruct state
        const firstJobMetadata = JSON.parse(jobs[0].metadataJson)
        state = {
          executionId,
          planId: firstJobMetadata.planId || 'unknown',
          routingMode: firstJobMetadata.routingMode || 'balanced',
          totalScenes: jobs.length,
          scenes: jobs.map((job) => {
            const metadata = JSON.parse(job.metadataJson)
            return {
              sceneNumber: metadata.sceneNumber,
              sceneTitle: metadata.sceneTitle || `Scene ${metadata.sceneNumber}`,
              status: job.status as 'queued' | 'processing' | 'completed' | 'failed',
              jobId: job.id,
              artifactId: job.artifactId || undefined,
              provider: job.provider || undefined,
              model: job.model || undefined,
            }
          }),
          progress: 0,
          finalAssemblyReady: false,
          missingDependencies: [],
          createdAt: jobs[0].createdAt.toISOString(),
          updatedAt: new Date().toISOString(),
        }
      }

      // Check if all scenes are completed
      const completedScenes = state.scenes.filter(s => s.status === 'completed')
      if (completedScenes.length !== state.totalScenes) {
        return reply.status(409).send({
          error: true,
          message: 'Cannot assemble: not all scenes are completed',
          completedScenes: completedScenes.length,
          totalScenes: state.totalScenes,
          missingScenes: state.scenes
            .filter(s => s.status !== 'completed')
            .map(s => s.sceneNumber),
        })
      }

      // Resolve scene artifacts
      const sceneArtifacts = await resolveSceneArtifacts(executionId)
      
      if (sceneArtifacts.length !== state.totalScenes) {
        return reply.status(409).send({
          error: true,
          message: 'Cannot assemble: missing scene artifacts',
          expectedArtifacts: state.totalScenes,
          foundArtifacts: sceneArtifacts.length,
        })
      }

      // Validate scene artifacts
      const validation = validateSceneArtifactsForAssembly(sceneArtifacts, state.totalScenes)
      if (!validation.valid) {
        return reply.status(422).send({
          error: true,
          message: 'Scene artifacts validation failed',
          errors: validation.errors,
          warnings: validation.warnings,
        })
      }

      // Check ffmpeg availability
      const ffmpeg = await checkFfmpegAvailable()
      
      // Create assembly plan
      const plan = await createAssemblyPlan(executionId, state.totalScenes)

      if (dryRun) {
        // Dry run returns 200 even if ffmpeg is missing
        return reply.status(200).send({
          success: true,
          dryRun: true,
          plan,
          message: 'Assembly plan created. Remove dryRun flag to execute assembly.',
          canAssemble: plan.canAssemble,
          blockedReason: plan.blockedReason,
          ffmpegAvailable: ffmpeg.available,
          wouldCreateArtifact: false,
        })
      }

      // Non-dryRun requires ffmpeg
      if (!ffmpeg.available) {
        return reply.status(422).send({
          error: true,
          message: 'Cannot assemble: ffmpeg is not available',
          ffmpegError: ffmpeg.error,
          note: 'Install ffmpeg on the system to enable video assembly',
        })
      }

      // Execute assembly
      const result = await assembleLongFormVideo({
        executionId,
        sceneArtifacts,
        outputTitle,
        aspectRatio: plan.aspectRatio,
      })

      if (!result.success) {
        return reply.status(500).send({
          error: true,
          message: 'Assembly failed',
          details: result.error,
          assemblyMode: result.assemblyMode,
        })
      }

      // Update execution state
      state.finalAssemblyReady = true
      state.finalAssemblyCompleted = true
      state.finalArtifactId = result.artifactId
      state.finalArtifactUrl = result.artifactUrl
      state.finalAssemblyCompletedAt = new Date().toISOString()
      state.finalAssemblyMode = 'video_only'
      executionStates.set(executionId, state)

      return reply.status(200).send({
        success: true,
        executionId,
        artifactId: result.artifactId,
        artifactUrl: result.artifactUrl,
        storagePath: result.storagePath,
        mimeType: result.mimeType,
        fileSizeBytes: result.fileSizeBytes,
        assemblyMode: result.assemblyMode,
        voiceoverIncluded: result.voiceoverIncluded,
        subtitlesIncluded: result.subtitlesIncluded,
        musicBedIncluded: result.musicBedIncluded,
        message: 'Long-form video assembled successfully',
        note: 'Video-only assembly complete. Voiceover/subtitles/music bed not included.',
      })
    } catch (error) {
      return reply.status(500).send({
        error: true,
        message: 'Assembly failed',
        details: error instanceof Error ? error.message : 'Unknown error',
      })
    }
  })

  /**
   * Get assembly status (Phase 3)
   * 
   * Returns whether assembly is possible and what dependencies are missing.
   */
  app.get('/api/admin/long-form-video/assembly/:executionId', async (request, reply) => {
    if (!(await requireAdmin(app, request, reply))) return

    const { executionId } = request.params as { executionId: string }

    try {
      // Get or reconstruct execution state
      let state = executionStates.get(executionId)
      
      if (!state) {
        // Attempt to reconstruct from DB
        const jobs = await prisma.job.findMany({
          where: {
            capability: 'video_generation',
            metadataJson: { contains: executionId },
          },
          orderBy: { createdAt: 'asc' },
        })

        if (jobs.length === 0) {
          return reply.status(404).send({
            error: true,
            message: 'Execution not found',
          })
        }

        // Reconstruct state
        const firstJobMetadata = JSON.parse(jobs[0].metadataJson)
        state = {
          executionId,
          planId: firstJobMetadata.planId || 'unknown',
          routingMode: firstJobMetadata.routingMode || 'balanced',
          totalScenes: jobs.length,
          scenes: jobs.map((job) => {
            const metadata = JSON.parse(job.metadataJson)
            return {
              sceneNumber: metadata.sceneNumber,
              sceneTitle: metadata.sceneTitle || `Scene ${metadata.sceneNumber}`,
              status: job.status as 'queued' | 'processing' | 'completed' | 'failed',
              jobId: job.id,
              artifactId: job.artifactId || undefined,
              provider: job.provider || undefined,
              model: job.model || undefined,
            }
          }),
          progress: 0,
          finalAssemblyReady: false,
          missingDependencies: [],
          createdAt: jobs[0].createdAt.toISOString(),
          updatedAt: new Date().toISOString(),
        }
      }

      // Check scene completion
      const completedScenes = state.scenes.filter(s => s.status === 'completed')
      const allScenesComplete = completedScenes.length === state.totalScenes

      // Resolve scene artifacts
      const sceneArtifacts = await resolveSceneArtifacts(executionId)

      // Validate scene artifacts
      const validation = validateSceneArtifactsForAssembly(sceneArtifacts, state.totalScenes)

      // Check ffmpeg availability
      const ffmpeg = await checkFfmpegAvailable()

      // Determine if assembly is possible
      const canAssemble = allScenesComplete && validation.valid && ffmpeg.available

      const missingDependencies: string[] = []
      if (!allScenesComplete) {
        missingDependencies.push('scene_completion')
      }
      if (!validation.valid) {
        missingDependencies.push('scene_artifact_validation')
      }
      if (!ffmpeg.available) {
        missingDependencies.push('ffmpeg')
      }

      // Check if final artifact already exists
      const finalArtifact = await prisma.artifact.findFirst({
        where: {
          appSlug: 'dashboard-long-form',
          type: 'video',
          subType: 'long_form_video',
          metadata: { contains: executionId },
        },
      })

      return reply.status(200).send({
        success: true,
        executionId,
        canAssemble,
        missingDependencies,
        scenes: {
          total: state.totalScenes,
          completed: completedScenes.length,
          artifacts: sceneArtifacts.length,
          validation: {
            valid: validation.valid,
            errors: validation.errors,
            warnings: validation.warnings,
          },
        },
        ffmpeg: {
          available: ffmpeg.available,
          version: ffmpeg.version,
          path: ffmpeg.path,
          error: ffmpeg.error,
        },
        finalArtifact: finalArtifact
          ? {
              id: finalArtifact.id,
              url: finalArtifact.storageUrl,
              mimeType: finalArtifact.mimeType,
              fileSizeBytes: finalArtifact.fileSizeBytes,
            }
          : null,
        message: canAssemble
          ? 'Ready for assembly'
          : 'Assembly blocked',
      })
    } catch (error) {
      return reply.status(500).send({
        error: true,
        message: 'Failed to get assembly status',
        details: error instanceof Error ? error.message : 'Unknown error',
      })
    }
  })

  /**
   * Get long-form video capability status
   */
  app.get('/api/admin/long-form-video/status', async (request, reply) => {
    if (!(await requireAdmin(app, request, reply))) return

    const { LONG_FORM_VIDEO_STATUS } = await import('@amarktai/core')
    const ffmpeg = await checkFfmpegAvailable()

    return reply.status(200).send({
      success: true,
      status: {
        ...LONG_FORM_VIDEO_STATUS,
        phase1PlannerReady: true,
        phase2SceneExecutionReady: true,
        ffmpegAvailable: ffmpeg.available,
        finalAssemblyPipelineReady: true, // Module and routes exist
        videoOnlyLongFormReady: ffmpeg.available, // Requires ffmpeg
        fullMultimediaReady: false, // Voiceover/subtitles/music not implemented
        voiceoverReady: false,
        subtitlesReady: false,
        musicBedReady: false,
        persistentExecutionTracking: false, // In-memory only for now
      },
      ffmpeg: {
        available: ffmpeg.available,
        version: ffmpeg.version,
        path: ffmpeg.path,
        error: ffmpeg.error,
      },
      message: ffmpeg.available
        ? 'Long-form video Phase 3: video-only assembly ready. Voiceover/subtitles/music bed pending.'
        : 'Long-form video Phase 2: per-scene execution ready. Assembly blocked (ffmpeg missing).',
      limitations: {
        executionStateStorage: 'In-memory only (lost on API restart)',
        executionStateRecovery: 'Can reconstruct from DB job metadata when possible',
        persistentStorage: 'Will be added in a future phase',
        assemblyMode: 'video_only',
        voiceoverIncluded: false,
        subtitlesIncluded: false,
        musicBedIncluded: false,
      },
      phases: {
        phase1: 'Orchestration foundation - READY',
        phase2: 'Per-scene execution - READY',
        phase3: ffmpeg.available
          ? 'Scene stitching with ffmpeg - READY (video-only)'
          : 'Scene stitching with ffmpeg - BLOCKED (ffmpeg not available)',
        phase4: 'Voiceover/subtitles/music bed - PENDING',
        phase5: 'Full multimedia assembly - PENDING'
      }
    })
  })
}
