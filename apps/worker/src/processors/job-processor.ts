/**
 * Job processor — BullMQ worker that processes capability jobs.
 *
 * Phase 4: Worker Execution Foundation
 * - Validates payload shape (including prompt)
 * - Loads DB Job row and verifies ownership
 * - Updates status to processing with startedAt
 * - Calls isolated execution placeholder (NO provider execution)
 * - Marks as failed with honest "not implemented" error
 * - THROWS after DB failure so BullMQ records queue job as failed
 * - Handles thrown errors safely
 * - Does NOT create artifacts
 * - Does NOT call any provider
 */

import { prisma } from '@amarktai/db'
import { QUEUE_NAMES, isValidCapability, routeProvider, type CapabilityKey } from '@amarktai/core'

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

// ── Default execution placeholder ──────────────────────────────────────────────
// This is the ONLY place provider execution would happen.
// Phase 5: Consults routing skeleton but does NOT execute providers.

function defaultExecuteCapability(payload: WorkerJobData): Promise<ProcessorResult> {
  // Ask the router for a routing decision (no network calls)
  const decision = routeProvider(payload.capability as CapabilityKey)

  // Build a descriptive error that includes routing info
  const providerInfo = decision.selectedProvider
    ? `Selected provider: ${decision.selectedProvider}`
    : `No provider selected: ${decision.blockReason ?? 'unknown'}`
  const candidates = decision.candidates
    .filter((c) => c.supported)
    .map((c) => `${c.provider}(${c.configured ? 'configured' : 'missing-config'})`)
    .join(', ')

  return Promise.resolve({
    success: false,
    status: 'failed',
    error: `Provider execution not implemented. ${providerInfo}. Candidates: ${candidates || 'none'}. executionAllowed: false`,
  })
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
      },
    })

    try {
      // 6. Call execution (does NOT call providers in Phase 4)
      const result = await executeCapability(payload)

      // 7. Handle result — must be honest about what happened
      if (result.success) {
        // This branch should NOT be reached in Phase 4
        // because defaultExecuteCapability always returns success: false
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
      // Update DB job to failed, then THROW so BullMQ also records failure
      const errorMsg = result.error ?? 'Execution failed'
      await prisma.job.update({
        where: { id: jobId },
        data: {
          status: 'failed',
          error: errorMsg,
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
