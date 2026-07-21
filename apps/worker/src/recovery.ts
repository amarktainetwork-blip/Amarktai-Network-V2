import type { Queue } from 'bullmq'
import { prisma } from '@amarktai/db'

export const STALE_PROCESSING_JOB_MS = Number(process.env.STALE_PROCESSING_JOB_MS || 10 * 60 * 1000)

/** Recover only jobs whose worker lease has been stale for the configured window. */
export async function recoverStaleProcessingJobs(queue: Queue, now = new Date()): Promise<string[]> {
  const cutoff = new Date(now.getTime() - STALE_PROCESSING_JOB_MS)
  const stale = await prisma.job.findMany({
    where: { status: 'processing', startedAt: { lte: cutoff } },
    select: { id: true, startedAt: true },
    take: 500,
  })
  const recovered: string[] = []
  for (const job of stale) {
    const claimed = await prisma.job.updateMany({
      where: { id: job.id, status: 'processing', startedAt: job.startedAt },
      data: { status: 'queued', queuedAt: now, retryCount: { increment: 1 }, error: 'Recovered after stale worker claim' },
    })
    if (claimed.count !== 1) continue
    const existing = await queue.getJob(job.id)
    if (!existing) {
      await queue.add('process-recovery', { jobId: job.id }, { jobId: job.id })
    } else {
      const state = await existing.getState()
      if (state === 'completed' || state === 'failed') {
        await existing.remove()
        await queue.add('process-recovery', { jobId: job.id }, { jobId: job.id })
      }
    }
    recovered.push(job.id)
  }
  return recovered
}
