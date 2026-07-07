/**
 * Job processor — BullMQ worker that processes capability jobs.
 *
 * - Validates payload shape (including prompt)
 * - Loads DB Job row and verifies ownership
 * - Updates status to processing with startedAt
 * - Delegates execution to the provider executor
 * - Currently proven execution paths are Groq chat, Together image generation,
 *   and GenX video generation
 * - Fails all other capabilities honestly as not implemented
 * - Successful text jobs may store output
 * - Successful media jobs may store artifactId and safe output metadata
 * - Failed execution updates the DB and throws so BullMQ records queue failure
 * - Handles thrown errors safely
 */

import { prisma } from '@amarktai/db'
import { QUEUE_NAMES, isValidCapability } from '@amarktai/core'

// ── Types ──────────────────────────────────────────────────────────────────────

export interface WorkerJobData {
  jobId: string
  appSlug: string
  capability: string
  prompt: string
  input?: Record<string, unknown>
  metadata?: Record<string, unknown>
  traceId: string
  callbackUrl?: string
}

export interface ProcessorResult {
  success: boolean
  status: 'completed' | 'failed'
  error?: string
  output?: string
  provider?: string
  model?: string
  artifactId?: string
  metadata?: Record<string, unknown>
}

export interface ProcessorDeps {
  executeCapability?: (payload: WorkerJobData) => Promise<ProcessorResult>
}

// ── Canonical queue name (must match API ingestion) ────────────────────────────

export const WORKER_QUEUE_NAME = QUEUE_NAMES.JOBS

// ── Payload validation ─────────────────────────────────────────────────────────

export function validatePayload(payload: WorkerJobData): string | null {
  if (!payload.jobId) return 'Missing required field: jobId'
  if (!payload.appSlug) return 'Missing required field: appSlug'
  if (!payload.capability) return 'Missing required field: capability'
  if (!payload.prompt || !payload.prompt.trim()) return 'Missing required field: prompt'
  if (!payload.traceId) return 'Missing required field: traceId'
  if (!isValidCapability(payload.capability)) return `Invalid capability: ${payload.capability}`
  return null
}

// ── Default execution — delegates to provider executor ────────────────────────
// Delegates to the provider executor, which currently supports Groq chat,
// Together image generation, and GenX video generation.

async function defaultExecuteCapability(payload: WorkerJobData): Promise<ProcessorResult> {
  const { executeWithProvider } = await import('../providers/provider-executor.js')
  return executeWithProvider(payload)
}

// ── Job processor factory ──────────────────────────────────────────────────────

export function createJobProcessor(deps: ProcessorDeps = {}) {
  const executeCapability = deps.executeCapability ?? defaultExecuteCapability

  return async function processJob(payload: WorkerJobData): Promise<ProcessorResult> {
    // 1. Validate payload
    const validationError = validatePayload(payload)
    if (validationError) {
      throw new Error(validationError)
    }

    const { jobId, appSlug, capability } = payload

    // 2. Load DB Job row
    const job = await prisma.job.findUnique({ where: { id: jobId } })
    if (!job) {
      throw new Error(`Job not found: ${jobId}`)
    }

    // 3. Verify ownership — appSlug must match
    if (job.appSlug !== appSlug) {
      throw new Error(`Job appSlug mismatch: expected '${job.appSlug}', got '${appSlug}'`)
    }

    // 4. Verify capability must match
    if (job.capability !== capability) {
      throw new Error(`Job capability mismatch: expected '${job.capability}', got '${capability}'`)
    }

    // 5. Update status to processing
    await prisma.job.update({
      where: { id: jobId },
      data: {
        status: 'processing',
        startedAt: new Date(),
        completedAt: null,
        error: null,
        progress: 0,
      },
    })

    try {
      // 6. Call execution (does NOT call providers in Phase 4)
      const result = await executeCapability(payload)

      // 7. Handle result — must be honest about what happened
      if (result.success) {
        const completedData: {
          status: string
          provider: string | null
          model: string | null
          output: string | null
          progress: number
          completedAt: Date
          error: null
          artifactId?: string
        } = {
          status: 'completed',
          provider: result.provider ?? null,
          model: result.model ?? null,
          output: result.output ?? null,
          progress: 100,
          completedAt: new Date(),
          error: null,
        }

        if (result.artifactId) {
          completedData.artifactId = result.artifactId
        }

        await prisma.job.update({
          where: { id: jobId },
          data: completedData,
        })
        return result
      }

      // 8. Execution failed (expected in Phase 4)
      // Update DB job to failed, then THROW so BullMQ also records failure
      const errorMsg = result.error ?? 'Execution failed'
      await prisma.job.update({
        where: { id: jobId },
        data: {
          status: 'failed',
          error: errorMsg,
          provider: result.provider ?? null,
          model: result.model ?? null,
          progress: 0,
          completedAt: new Date(),
        },
      })

      // Throw so BullMQ records the queue job as failed too
      throw new Error(errorMsg)
    } catch (err) {
      // 9. Handle thrown errors safely
      // This catches:
      //   - Our throw from step 8 (DB already updated)
      //   - Errors thrown by executeCapability (DB not yet updated to failed)
      //   - DB update errors from step 5 or step 8
      const errorMessage = err instanceof Error ? err.message : 'Unknown worker error'

      // Attempt to update DB to failed state
      // If step 8 already updated it, this is a harmless no-op (same status)
      // If executeCapability threw, this records the error
      await prisma.job.update({
        where: { id: jobId },
        data: {
          status: 'failed',
          error: errorMessage,
          completedAt: new Date(),
        },
      }).catch(() => {
        // If DB update fails, the original error is more important
      })

      // Re-throw so BullMQ records the failure
      throw err
    }
  }
}

// ── Default processor (for backward compatibility) ─────────────────────────────

export const processJob = createJobProcessor()
