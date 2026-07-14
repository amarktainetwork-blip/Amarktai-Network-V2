import { beforeEach, describe, expect, it, vi } from 'vitest'

const prisma = vi.hoisted(() => ({
  job: {
    findMany: vi.fn(),
    updateMany: vi.fn(),
  },
}))
vi.mock('@amarktai/db', () => ({ prisma }))

const { recoverStaleProcessingJobs } = await import('../apps/worker/src/recovery.ts')

describe('stale worker recovery contract', () => {
  beforeEach(() => vi.clearAllMocks())

  it('atomically requeues stale processing jobs without duplicating an existing live queue delivery', async () => {
    const startedAt = new Date('2026-07-14T00:00:00Z')
    prisma.job.findMany.mockResolvedValue([{ id: 'job-1', startedAt }])
    prisma.job.updateMany.mockResolvedValue({ count: 1 })
    const existing = { getState: vi.fn().mockResolvedValue('waiting'), remove: vi.fn() }
    const queue = { getJob: vi.fn().mockResolvedValue(existing), add: vi.fn() }
    expect(await recoverStaleProcessingJobs(queue as never, new Date('2026-07-14T00:20:00Z'))).toEqual(['job-1'])
    expect(prisma.job.updateMany).toHaveBeenCalledWith(expect.objectContaining({
      where: { id: 'job-1', status: 'processing', startedAt },
      data: expect.objectContaining({ status: 'queued', retryCount: { increment: 1 } }),
    }))
    expect(queue.add).not.toHaveBeenCalled()
  })

  it('replaces terminal BullMQ residue with one deterministic recovery delivery', async () => {
    prisma.job.findMany.mockResolvedValue([{ id: 'job-2', startedAt: new Date('2026-07-14T00:00:00Z') }])
    prisma.job.updateMany.mockResolvedValue({ count: 1 })
    const existing = { getState: vi.fn().mockResolvedValue('failed'), remove: vi.fn().mockResolvedValue(undefined) }
    const queue = { getJob: vi.fn().mockResolvedValue(existing), add: vi.fn().mockResolvedValue(undefined) }
    await recoverStaleProcessingJobs(queue as never, new Date('2026-07-14T00:20:00Z'))
    expect(existing.remove).toHaveBeenCalledOnce()
    expect(queue.add).toHaveBeenCalledWith('process-recovery', { jobId: 'job-2' }, { jobId: 'job-2' })
  })

  it('does not enqueue when another worker wins the atomic recovery claim', async () => {
    prisma.job.findMany.mockResolvedValue([{ id: 'job-3', startedAt: new Date('2026-07-14T00:00:00Z') }])
    prisma.job.updateMany.mockResolvedValue({ count: 0 })
    const queue = { getJob: vi.fn(), add: vi.fn() }
    expect(await recoverStaleProcessingJobs(queue as never, new Date('2026-07-14T00:20:00Z'))).toEqual([])
    expect(queue.getJob).not.toHaveBeenCalled()
  })
})
