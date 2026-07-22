/**
 * Job processor — BullMQ worker that processes capability jobs.
 *
 * - Validates payload shape (including prompt)
 * - Loads DB Job row and verifies ownership
 * - Updates status to processing with startedAt
 * - Delegates execution to the provider executor
 * - Runtime execution paths are selected dynamically from approved providers,
 *   and GenX video generation
 * - Fails closed when no canonical executor is registered
 * - Successful text jobs may store output
 * - Successful media jobs may store artifactId and safe output metadata
 * - Failed execution updates the DB and throws so BullMQ records queue failure
 * - Handles thrown errors safely
 */

import { randomUUID } from 'node:crypto'
import { prisma, refreshLongFormParentState } from '@amarktai/db'
import { QUEUE_NAMES, isValidCapability, type AppCapabilityGrantContext, type ExecutionProfile } from '@amarktai/core'
import { deliverTerminalJobWebhook } from '../webhook-delivery.js'

// ── Types ──────────────────────────────────────────────────────────────────────

export interface WorkerJobData {
  jobId: string
  appSlug: string
  capability: string
  executionProfile?: ExecutionProfile
  prompt: string
  input?: Record<string, unknown>
  metadata?: Record<string, unknown>
  traceId: string
  callbackUrl?: string
  routingMode?: string
  appGrantSnapshot?: AppCapabilityGrantContext
  queueRecoveryAttempt?: boolean
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
  advanceLongFormWorkflow?: (parentJobId: string) => Promise<unknown>
}

type PartialWorkerJobData = Partial<WorkerJobData> & { jobId?: string }
const TERMINAL_JOB_STATUSES = new Set(['completed', 'cancelled', 'cancelling'])

function durableDeliveryResult(job: {
  status: string
  error?: string | null
  output?: string | null
  provider?: string | null
  model?: string | null
  artifactId?: string | null
}): ProcessorResult {
  if (job.status === 'completed') {
    return {
      success: true,
      status: 'completed',
      output: job.output ?? undefined,
      provider: job.provider ?? undefined,
      model: job.model ?? undefined,
      artifactId: job.artifactId ?? undefined,
      metadata: { skipped: true, terminalStatus: job.status, deduplicatedDelivery: true, durableStatus: job.status },
    }
  }
  if (job.status === 'processing') {
    // A BullMQ retry can redeliver while the original worker still owns the
    // provider claim. The database is authoritative: acknowledge the duplicate
    // delivery without invoking the provider or turning it into a user failure.
    return {
      success: true,
      status: 'completed',
      provider: job.provider ?? undefined,
      model: job.model ?? undefined,
      artifactId: job.artifactId ?? undefined,
      metadata: { skipped: true, terminalStatus: job.status, deduplicatedDelivery: true, durableStatus: job.status, providerExecutionSkipped: true },
    }
  }
  return {
    success: false,
    status: 'failed',
    error: job.error ?? `Job is not execution-eligible: ${job.status}`,
    provider: job.provider ?? undefined,
    model: job.model ?? undefined,
    artifactId: job.artifactId ?? undefined,
    metadata: { skipped: true, terminalStatus: job.status, deduplicatedDelivery: true, durableStatus: job.status, providerExecutionSkipped: true },
  }
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

async function refreshParentFromPayload(payload: WorkerJobData, advance?: (parentJobId: string) => Promise<unknown>): Promise<void> {
  const parentJobId = typeof payload.metadata?.parentJobId === 'string' ? payload.metadata.parentJobId : null
  if (parentJobId) {
    await refreshLongFormParentState(parentJobId).catch(() => {})
    if (advance) await advance(parentJobId)
  }
}

async function deliverWebhookSafely(
  payload: WorkerJobData,
  status: 'completed' | 'failed',
  result: ProcessorResult | undefined,
  error?: string,
): Promise<void> {
  if (!payload.callbackUrl) return
  try {
    const delivery = await deliverTerminalJobWebhook({
      jobId: payload.jobId,
      appSlug: payload.appSlug,
      capability: payload.capability,
      status,
      callbackUrl: payload.callbackUrl,
      traceId: payload.traceId,
      provider: result?.provider,
      model: result?.model,
      artifactId: result?.artifactId,
      output: result?.output,
      error: status === 'failed' ? (error ?? result?.error ?? 'Execution failed') : null,
      completedAt: new Date(),
    })
    console.info('[worker] terminal webhook delivery', {
      dbJobId: payload.jobId,
      eventId: delivery.eventId ?? null,
      attempted: delivery.attempted,
      delivered: delivery.delivered,
      attempts: delivery.attempts,
      reason: delivery.reason ?? null,
    })
  } catch (deliveryError) {
    // Webhook delivery has its own durable attempt log. It must never rewrite a
    // truthful provider result or cause BullMQ to retry paid provider execution.
    console.error('[worker] terminal webhook delivery failed unexpectedly', {
      dbJobId: payload.jobId,
      message: deliveryError instanceof Error ? deliveryError.message : 'Unknown webhook delivery error',
    })
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

  const durableMetadata = safeParseJsonObject(dbJob.metadataJson)
  return {
    payload: {
      jobId: rawPayload.jobId!,
      appSlug: rawPayload.appSlug || dbJob.appSlug,
      capability: rawPayload.capability || dbJob.capability,
      executionProfile: rawPayload.executionProfile
        ?? (durableMetadata.executionProfile === 'internal_dashboard' ? 'internal_dashboard' : 'external_app'),
      prompt: rawPayload.prompt?.trim() ? rawPayload.prompt : dbJob.prompt,
      input: rawPayload.input ?? safeParseJsonObject(dbJob.inputJson),
      metadata: rawPayload.metadata ?? safeParseJsonObject(dbJob.metadataJson),
      // Recovery deliveries may contain only jobId. Preserve the durable trace
      // so retries reuse provider output and artifact identity.
      traceId: rawPayload.traceId || dbJob.traceId || makeTraceId(),
      callbackUrl: rawPayload.callbackUrl ?? dbJob.callbackUrl ?? undefined,
      routingMode: rawPayload.routingMode ?? (durableMetadata.routingMode as string | undefined),
      appGrantSnapshot: rawPayload.appGrantSnapshot
        ?? (durableMetadata.appGrantSnapshot as AppCapabilityGrantContext | undefined),
      queueRecoveryAttempt: rawPayload.queueRecoveryAttempt === true,
    },
    dbJob,
  }
}

// ── Default execution — delegates to provider executor ────────────────────────
// Delegates to the provider executor, which supports approved runtime routes,
// Together image generation, and GenX video generation.

async function defaultExecuteCapability(payload: WorkerJobData): Promise<ProcessorResult> {
  if (payload.capability === 'long_form_video' && payload.metadata?.longFormAssembly === true && payload.metadata.internalLocalExecution === true) {
    const { executeLongFormAssembly } = await import('../long-form-assembly.js')
    return executeLongFormAssembly(payload)
  }
  const { executeWithProvider } = await import('../providers/provider-executor.js')
  return executeWithProvider(payload)
}

// ── Job processor factory ──────────────────────────────────────────────────────

export function createJobProcessor(deps: ProcessorDeps = {}) {
  const executeCapability = deps.executeCapability ?? defaultExecuteCapability
  const advanceWorkflow = deps.advanceLongFormWorkflow

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
      await refreshParentFromPayload(payload, advanceWorkflow)
      return durableDeliveryResult(job)
    }

    if (job.status === 'processing') {
      console.info('[worker] acknowledging duplicate delivery for active durable execution', { dbJobId: jobId, appSlug, capability })
      await refreshParentFromPayload(payload, advanceWorkflow)
      return durableDeliveryResult(job)
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
      return durableDeliveryResult(latest ?? job)
    }

    let terminalResult: ProcessorResult | undefined
    try {
      // 6. Call execution (does NOT call providers in Phase 4)
      const result = await executeCapability(payload)
      terminalResult = result

      // 7. Handle result — must be honest about what happened
      if (result.success) {
        // Provider executors persist routing, grant, usage, and validation evidence
        // while they run. Reload the row before the terminal write so those durable
        // updates are not replaced by the stale metadata snapshot loaded at claim time.
        const latestJob = await prisma.job.findUnique({ where: { id: jobId } }).catch(() => null)
        const latestMetadata = safeParseJsonObject(latestJob?.metadataJson ?? job.metadataJson)
        const completedData: {
          status: string
          provider: string | null
          model: string | null
          output: string | null
          metadataJson: string
          progress: number
          completedAt: Date
          error: null
          artifactId?: string
        } = {
          status: 'completed',
          provider: result.provider ?? null,
          model: result.model ?? null,
          output: result.output ?? null,
          metadataJson: JSON.stringify({
            ...latestMetadata,
            executionEvidence: result.metadata ?? {},
            providerEvidence: {
              provider: result.provider ?? null,
              model: result.model ?? null,
              completedAt: new Date().toISOString(),
              evidenceSource: result.metadata?.evidenceSource ?? 'provider_executor',
              liveProviderProof: result.metadata?.liveProviderProof === true,
            },
            usageEvidence: result.metadata?.usage ?? null,
          }),
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
            await refreshParentFromPayload(payload, advanceWorkflow)
            return {
              ...result,
              metadata: {
                ...result.metadata,
                lateResultDiscarded: true,
                cancelledJobStatus: latest?.status,
              },
            }
          }
          await refreshParentFromPayload(payload, advanceWorkflow)
          return {
            ...result,
            metadata: { ...result.metadata, skippedTerminalOverwrite: true },
          }
        }
        console.info('[worker] status transition', { dbJobId: jobId, appSlug, capability, to: 'completed' })
        await refreshParentFromPayload(payload, advanceWorkflow)
        await deliverWebhookSafely(payload, 'completed', result)
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
          await refreshParentFromPayload(payload, advanceWorkflow)
        }
      } else {
        console.info('[worker] status transition', { dbJobId: jobId, appSlug, capability, to: 'failed' })
        await refreshParentFromPayload(payload, advanceWorkflow)
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
      const failedTerminalUpdate = await updateJobMany({
        where: { id: jobId, status: { notIn: ['completed', 'cancelled', 'cancelling'] } },
        data: {
          status: 'failed',
          error: errorMessage,
          completedAt: new Date(),
        },
      }).catch(() => {
        // If DB update fails, the original error is more important
        return { count: 0 }
      })
      await refreshParentFromPayload(payload, advanceWorkflow)
      if (failedTerminalUpdate.count === 1) {
        await deliverWebhookSafely(payload, 'failed', terminalResult, errorMessage)
      }

      // Re-throw so BullMQ records the failure
      throw err
    }
  }
}

// ── Default processor (for backward compatibility) ─────────────────────────────

export const processJob = createJobProcessor()
