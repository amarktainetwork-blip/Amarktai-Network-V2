/**
 * Job processor — BullMQ worker that processes capability jobs.
 *
 * Flow:
 *   1. Receive job payload from Redis queue
 *   2. Update job status to 'processing' in PostgreSQL
 *   3. Route to the correct provider adapter based on capability prefix
 *   4. Save artifact and update job with result
 *   5. Mark job as 'completed' or 'failed'
 */

import { prisma } from '@amarktai/db'
import type { Job } from 'bullmq'
import type { JobPayload } from '@amarktai/core'
import { getAdapterForCapability, type ProviderExecutionContext } from '../adapters/index.js'

export async function processJob(job: Job<JobPayload>): Promise<void> {
  const payload = job.data
  const { jobId, appSlug, capability, prompt, input, metadata, traceId } = payload

  // 1. Mark job as processing
  await prisma.job.update({
    where: { id: jobId },
    data: {
      status: 'processing',
      startedAt: new Date(),
    },
  })

  try {
    // 2. Build execution context
    const context: ProviderExecutionContext = {
      jobId,
      appSlug,
      capability,
      prompt,
      input,
      metadata,
      traceId,
    }

    // 3. Route to adapter
    const adapter = getAdapterForCapability(capability)
    const result = await adapter.execute(context)

    if (!result.success) {
      throw new Error(result.error ?? 'Provider adapter returned failure')
    }

    // 4. Update job as completed
    await prisma.job.update({
      where: { id: jobId },
      data: {
        status: 'completed',
        provider: result.provider,
        model: result.model,
        artifactId: result.artifactId ?? null,
        progress: 100,
        output: result.output ?? null,
        completedAt: new Date(),
      },
    })
  } catch (err) {
    // 5. Mark job as failed
    const errorMessage = err instanceof Error ? err.message : 'Unknown worker error'
    await prisma.job.update({
      where: { id: jobId },
      data: {
        status: 'failed',
        error: errorMessage,
        completedAt: new Date(),
      },
    })
    throw err // Re-throw so BullMQ records the failure
  }
}
