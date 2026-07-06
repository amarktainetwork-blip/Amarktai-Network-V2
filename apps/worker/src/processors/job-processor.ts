/**
 * Job processor — BullMQ worker that processes capability jobs.
 *
 * Phase 4: Worker Execution Foundation
 * - Validates payload shape
 * - Loads DB Job row and verifies ownership
 * - Updates status to processing with startedAt
 * - Calls isolated execution placeholder (NO provider execution)
 * - Marks as failed with honest "not implemented" error
 * - Handles thrown errors safely
 * - Does NOT create artifacts
 * - Does NOT call any provider
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
}

// ── Canonical queue name (must match API ingestion) ────────────────────────────

export const WORKER_QUEUE_NAME = QUEUE_NAMES.JOBS

// ── Payload validation ─────────────────────────────────────────────────────────

export function validatePayload(payload: WorkerJobData): string | null {
  if (!payload.jobId) return 'Missing required field: jobId'
  if (!payload.appSlug) return 'Missing required field: appSlug'
  if (!payload.capability) return 'Missing required field: capability'
  if (!payload.traceId) return 'Missing required field: traceId'
  if (!isValidCapability(payload.capability)) return `Invalid capability: ${payload.capability}`
  return null
}

// ── Execution placeholder ──────────────────────────────────────────────────────
// This is the ONLY place provider execution would happen.
// Phase 4 intentionally does NOT implement it.

function executeCapability(_payload: WorkerJobData): Promise<ProcessorResult> {
  // Provider execution is not implemented in this phase.
  // This must return a failed result — never a fake completed result.
  return Promise.resolve({
    success: false,
    status: 'failed',
    error: 'Provider execution not implemented in this phase. Backend Phase 4 proves worker foundation only.',
  })
}

// ── Job processor ──────────────────────────────────────────────────────────────

export async function processJob(payload: WorkerJobData): Promise<ProcessorResult> {
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
    },
  })

  try {
    // 6. Call execution placeholder (does NOT call providers)
    const result = await executeCapability(payload)

    // 7. Handle result — must be honest about what happened
    if (result.success) {
      // This branch should NOT be reached in Phase 4
      // because executeCapability always returns success: false
      await prisma.job.update({
        where: { id: jobId },
        data: {
          status: 'completed',
          progress: 100,
          completedAt: new Date(),
        },
      })
      return result
    }

    // 8. Execution failed (expected in Phase 4)
    await prisma.job.update({
      where: { id: jobId },
      data: {
        status: 'failed',
        error: result.error ?? 'Execution failed',
        completedAt: new Date(),
      },
    })

    return result
  } catch (err) {
    // 9. Handle thrown errors safely
    const errorMessage = err instanceof Error ? err.message : 'Unknown worker error'

    await prisma.job.update({
      where: { id: jobId },
      data: {
        status: 'failed',
        error: errorMessage,
        completedAt: new Date(),
      },
    })

    // Re-throw so BullMQ records the failure
    throw err
  }
}
