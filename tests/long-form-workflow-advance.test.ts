import { beforeEach, describe, expect, it, vi } from 'vitest'

const harness = vi.hoisted(() => {
  const jobs = new Map<string, any>()
  const parent = { id: 'parent-1', appSlug: 'dashboard-long-form', executionId: 'execution-1' }
  const job = {
    findUnique: vi.fn(async ({ where }: any) => jobs.get(where.id) ?? null),
    create: vi.fn(async ({ data }: any) => {
      if (jobs.has(data.id)) throw new Error('unique constraint')
      const row = { ...data, queueJobId: data.queueJobId ?? '', status: data.status ?? 'planned' }
      jobs.set(row.id, row); return row
    }),
    updateMany: vi.fn(async ({ where, data }: any) => {
      const row = jobs.get(where.id)
      const statusMatches = typeof where.status === 'string' ? row?.status === where.status : where.status.in.includes(row?.status)
      if (!row || !statusMatches || row.queueJobId !== where.queueJobId) return { count: 0 }
      Object.assign(row, data); return { count: 1 }
    }),
  }
  const refresh = vi.fn(async () => ({
    parent,
    componentState: { readyToQueueAssembly: true, assembly: { jobId: null } },
  }))
  return { jobs, job, refresh, parent }
})

vi.mock('../packages/db/src/client.ts', () => ({ prisma: { job: harness.job } }))
vi.mock('../packages/db/src/long-form-parent-state.ts', () => ({ refreshLongFormParentState: harness.refresh }))

import { advanceLongFormWorkflow, longFormAssemblyJobId } from '../packages/db/src/long-form-workflow.ts'

describe('durable long-form assembly scheduling', () => {
  beforeEach(() => {
    harness.jobs.clear()
    vi.clearAllMocks()
  })

  it('uses a stable UUID assembly identity and queues duplicate callbacks exactly once', async () => {
    const queue = { add: vi.fn(async () => ({ id: 'queued' })) }
    const expectedId = longFormAssemblyJobId(harness.parent.id)
    expect(expectedId).toMatch(/^[0-9a-f]{8}-[0-9a-f]{4}-5[0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/)
    const [first, second] = await Promise.all([
      advanceLongFormWorkflow(harness.parent.id, queue as any),
      advanceLongFormWorkflow(harness.parent.id, queue as any),
    ])
    expect([first.scheduled, second.scheduled].filter(Boolean)).toHaveLength(1)
    expect(queue.add).toHaveBeenCalledTimes(1)
    expect(queue.add).toHaveBeenCalledWith('process', expect.objectContaining({ jobId: expectedId, capability: 'long_form_video', metadata: expect.objectContaining({ longFormAssembly: true }) }), expect.objectContaining({ jobId: expectedId }))
    expect(harness.jobs.get(expectedId)).toMatchObject({ status: 'queued', queueJobId: expectedId, parentJobId: harness.parent.id })
  })

  it('releases the database queue claim after a queue failure so recovery can retry', async () => {
    const queue = { add: vi.fn().mockRejectedValueOnce(new Error('redis unavailable')).mockResolvedValueOnce({ id: 'queued' }) }
    await expect(advanceLongFormWorkflow(harness.parent.id, queue as any)).rejects.toThrow('redis unavailable')
    const id = longFormAssemblyJobId(harness.parent.id)
    expect(harness.jobs.get(id)).toMatchObject({ status: 'planned', queueJobId: '' })
    const retry = await advanceLongFormWorkflow(harness.parent.id, queue as any)
    expect(retry.scheduled).toBe(true)
    expect(queue.add).toHaveBeenCalledTimes(2)
  })
})
