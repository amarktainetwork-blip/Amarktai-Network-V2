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

import { randomUUID } from 'node:crypto'
import { prisma, refreshLongFormParentState } from '@amarktai/db'
import { QUEUE_NAMES, isValidCapability, type AppCapabilityGrantContext } from '@amarktai/core'

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
  routingMode?: string
  appGrantSnapshot?: AppCapabilityGrantContext
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

type PartialWorkerJobData = Partial<WorkerJobData> & { jobId?: string }
const TERMINAL_JOB_STATUSES = new Set(['completed', 'cancelled', 'cancelling'])

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

function makeTraceId(): string {
  return `trace_${randomUUID()}`
}

async function updateJobMany(args: Parameters<typeof prisma.job.updateMany>[0]): Promise<{ count: number }> {
  const maybeUpdateMany = (prisma.job as typeof prisma.job & { updateMany?: typeof prisma.job.updateMany }).updateMany
  if (typeof maybeUpdateMany === 'function') {
    return await maybeUpdateMany(args)
  }

  // Compatibility for older unit-test mocks. Real Prisma clients always expose
  // updateMany, which is required for the atomic cancellation guard.
  const id = args.where && 'id' in args.where && typeof args.where.id === 'string' ? args.where.id : null
  if (id) {
    await prisma.job.update({ where: { id }, data: args.data })
    return { count: 1 }
  }
  return { count: 0 }
}

async function markJobFailed(jobId: string, error: string): Promise<void> {
  await updateJobMany({
    where: { id: jobId, status: { notIn: ['completed', 'cancelled', 'cancelling'] } },
    data: {
      status: 'failed',
      error,
      completedAt: new Date(),
    },
  }).catch(() => {
    // Preserve the original worker error for BullMQ if the status write fails.
  })
}

async function refreshParentFromPayload(payload: WorkerJobData): Promise<void> {
  const parentJobId = typeof payload.metadata?.parentJobId === 'string' ? payload.metadata.parentJobId : null
  if (parentJobId) {
    await refreshLongFormParentState(parentJobId).catch(() => {})
  }
}

async function hydratePayload(rawPayload: PartialWorkerJobData): Promise<{
  payload: WorkerJobData
  dbJob: Awaited<ReturnType<typeof prisma.job.findUnique>> | null
}> {
  const needsHydration = !!rawPayload.jobId
    && (!rawPayload.appSlug || !rawPayload.capability || !rawPayload.prompt?.trim() || !rawPayload.traceId)

  if (!needsHydration) {
    return { payload: rawPayload as WorkerJobData, dbJob: null }
  }

  const dbJob = await prisma.job.findUnique({ where: { id: rawPayload.jobId! } })
  if (!dbJob) {
    return { payload: rawPayload as WorkerJobData, dbJob: null }
  }

  return {
    payload: {
      jobId: rawPayload.jobId!,
      appSlug: rawPayload.appSlug || dbJob.appSlug,
      capability: rawPayload.capability || dbJob.capability,
      prompt: rawPayload.prompt?.trim() ? rawPayload.prompt : dbJob.prompt,
      input: rawPayload.input ?? safeParseJsonObject(dbJob.inputJson),
      metadata: rawPayload.metadata ?? safeParseJsonObject(dbJob.metadataJson),
      traceId: rawPayload.traceId || makeTraceId(),
      callbackUrl: rawPayload.callbackUrl ?? dbJob.callbackUrl ?? undefined,
      routingMode: rawPayload.routingMode ?? (safeParseJsonObject(dbJob.metadataJson).routingMode as string | undefined),
      appGrantSnapshot: rawPayload.appGrantSnapshot
        ?? (safeParseJsonObject(dbJob.metadataJson).appGrantSnapshot as AppCapabilityGrantContext | undefined),
    },
    dbJob,
  }
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

  return async function processJob(rawPayload: WorkerJobData): Promise<ProcessorResult> {
    const rawJobId = (rawPayload as PartialWorkerJobData).jobId
    const hydrated = await hydratePayload(rawPayload as PartialWorkerJobData)
    const payload = hydrated.payload

    console.info('[worker] received queue job', {
      queueName: WORKER_QUEUE_NAME,
      dbJobId: payload.jobId || rawJobId || null,
      appSlug: payload.appSlug || null,
      capability: payload.capability || null,
    })

    // 1. Validate payload after legacy payload hydration
    const validationError = validatePayload(payload)
    if (validationError) {
      if (rawJobId) await markJobFailed(rawJobId, validationError)
      throw new Error(validationError)
    }

    const { jobId, appSlug, capability } = payload

    // 2. Load DB Job row
    const job = hydrated.dbJob ?? await prisma.job.findUnique({ where: { id: jobId } })
    if (!job) {
      throw new Error(`Job not found: ${jobId}`)
    }

    // 3. Verify ownership — appSlug must match
    if (job.appSlug !== appSlug) {
      const error = `Job appSlug mismatch: expected '${job.appSlug}', got '${appSlug}'`
      await markJobFailed(jobId, error)
      throw new Error(error)
    }

    // 4. Verify capability must match
    if (job.capability !== capability) {
      const error = `Job capability mismatch: expected '${job.capability}', got '${capability}'`
      await markJobFailed(jobId, error)
      throw new Error(error)
    }

    // 5. Atomically claim an execution-eligible queued job.
    if (TERMINAL_JOB_STATUSES.has(job.status)) {
      console.info('[worker] skipping terminal job', { dbJobId: jobId, appSlug, capability, status: job.status })
      return {
        success: false,
        status: 'failed',
        error: `Job skipped because it is already terminal: ${job.status}`,
        metadata: { skipped: true, terminalStatus: job.status },
      }
    }

    console.info('[worker] status transition', { dbJobId: jobId, appSlug, capability, from: job.status, to: 'processing' })
    const processingClaim = await updateJobMany({
      where: { id: jobId, status: 'queued' },
      data: {
        status: 'processing',
        startedAt: new Date(),
        completedAt: null,
        error: null,
        progress: 0,
      },
    })
    if (processingClaim.count !== 1) {
      const latest = await prisma.job.findUnique({ where: { id: jobId } }).catch(() => null)
      console.info('[worker] skipped non-executable job state', { dbJobId: jobId, appSlug, capability, status: latest?.status ?? job.status })
      return {
        success: false,
        status: 'failed',
        error: `Job skipped because status is not execution-eligible: ${latest?.status ?? job.status}`,
        metadata: { skipped: true, terminalStatus: latest?.status ?? job.status },
      }
    }

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

        const completed = await updateJobMany({
          where: { id: jobId, status: 'processing' },
          data: completedData,
        })
        if (completed.count !== 1) {
          const latest = await prisma.job.findUnique({ where: { id: jobId } }).catch(() => null)
          const isCancelled = latest?.status === 'cancelled' || latest?.status === 'cancelling'
          if (isCancelled) {
            console.info('[worker] late provider result discarded for cancelled job', {
              dbJobId: jobId,
              jobStatus: latest?.status,
              lateArtifactId: result.artifactId ?? null,
            })
            await refreshParentFromPayload(payload)
            return {
              ...result,
              metadata: {
                ...result.metadata,
                lateResultDiscarded: true,
                cancelledJobStatus: latest?.status,
              },
            }
          }
          await refreshParentFromPayload(payload)
          return {
            ...result,
            metadata: { ...result.metadata, skippedTerminalOverwrite: true },
          }
        }
        console.info('[worker] status transition', { dbJobId: jobId, appSlug, capability, to: 'completed' })
        await refreshParentFromPayload(payload)
        return result
      }

      // 8. Execution failed (expected in Phase 4)
      // Update DB job to failed, then THROW so BullMQ also records failure
      const errorMsg = result.error ?? 'Execution failed'
      const failedUpdate = await updateJobMany({
        where: { id: jobId, status: 'processing' },
        data: {
          status: 'failed',
          error: errorMsg,
          provider: result.provider ?? null,
          model: result.model ?? null,
          progress: 0,
          completedAt: new Date(),
        },
      })
      if (failedUpdate.count !== 1) {
        const latest = await prisma.job.findUnique({ where: { id: jobId } }).catch(() => null)
        const isCancelled = latest?.status === 'cancelled' || latest?.status === 'cancelling'
        if (isCancelled) {
          console.info('[worker] late provider failure discarded for cancelled job', {
            dbJobId: jobId,
            jobStatus: latest?.status,
          })
          await refreshParentFromPayload(payload)
        }
      } else {
        console.info('[worker] status transition', { dbJobId: jobId, appSlug, capability, to: 'failed' })
        await refreshParentFromPayload(payload)
      }

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
      await updateJobMany({
        where: { id: jobId, status: { notIn: ['completed', 'cancelled', 'cancelling'] } },
        data: {
          status: 'failed',
          error: errorMessage,
          completedAt: new Date(),
        },
      }).catch(() => {
        // If DB update fails, the original error is more important
      })
      await refreshParentFromPayload(payload)

      // Re-throw so BullMQ records the failure
      throw err
    }
  }
}

// ── Default processor (for backward compatibility) ─────────────────────────────

export const processJob = createJobProcessor()
