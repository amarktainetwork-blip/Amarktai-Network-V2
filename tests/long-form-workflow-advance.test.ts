import { beforeEach, describe, expect, it, vi } from 'vitest'
import { makeAppGrantSnapshot } from './helpers/app-grant.js'

const harness = vi.hoisted(() => {
  const jobs = new Map<string, any>()
  const grant = {
    appSlug: 'dashboard-long-form',
    capability: 'long_form_video',
    enabled: true,
    qualityFloor: 'balanced',
    budgetPolicy: 'balanced',
    maxCostPerRequest: 0,
    maxCostPerWorkflow: 0,
    latencyPreference: 'medium',
    allowFallback: true,
    maxFallbackAttempts: 3,
    liveProofRequired: false,
    approvalRequired: false,
    artifactRead: true,
    artifactWrite: true,
    memoryRead: false,
    memoryWrite: false,
    ragNamespaces: [],
    policyProfile: 'test',
    adultPermission: false,
    dataRetentionPolicy: 'default',
    passthroughModelAllowed: false,
    providerResidencyConstraints: [],
  }
  const parent = {
    id: 'parent-1',
    appSlug: 'dashboard-long-form',
    executionId: 'execution-1',
    metadataJson: JSON.stringify({
      appGrantSnapshot: grant,
      appGrantSnapshotSource: 'database',
      appGrantSnapshotAt: '2026-07-21T00:00:00.000Z',
    }),
  }
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
    metadata: JSON.parse(parent.metadataJson),
    componentState: { readyToQueueAssembly: true, assembly: { jobId: null } },
  }))
  return { jobs, job, refresh, parent, grant }
})

vi.mock('../packages/db/src/client.ts', () => ({ prisma: { job: harness.job } }))
vi.mock('../packages/db/src/long-form-parent-state.ts', () => ({ refreshLongFormParentState: harness.refresh }))

import { advanceLongFormWorkflow, longFormAssemblyJobId } from '../packages/db/src/long-form-workflow.ts'

describe('durable long-form assembly scheduling', () => {
  beforeEach(() => {
    harness.jobs.clear()
    harness.parent.metadataJson = JSON.stringify({
      appGrantSnapshot: makeAppGrantSnapshot('dashboard-long-form', 'long_form_video'),
      appGrantSnapshotSource: 'database',
      appGrantSnapshotAt: '2026-07-21T00:00:00.000Z',
    })
    vi.clearAllMocks()
  })

  it('uses a stable UUID assembly identity, propagates immutable authority, and queues duplicate callbacks exactly once', async () => {
    const queue = { add: vi.fn(async () => ({ id: 'queued' })) }
    const expectedId = longFormAssemblyJobId(harness.parent.id)
    expect(expectedId).toMatch(/^[0-9a-f]{8}-[0-9a-f]{4}-5[0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/)
    const [first, second] = await Promise.all([
      advanceLongFormWorkflow(harness.parent.id, queue as any),
      advanceLongFormWorkflow(harness.parent.id, queue as any),
    ])
    expect([first.scheduled, second.scheduled].filter(Boolean)).toHaveLength(1)
    expect(queue.add).toHaveBeenCalledTimes(1)
    expect(queue.add).toHaveBeenCalledWith('process', expect.objectContaining({
      jobId: expectedId,
      capability: 'long_form_video',
      appGrantSnapshot: expect.objectContaining({
        appSlug: 'dashboard-long-form',
        capability: 'long_form_video',
        artifactRead: true,
        artifactWrite: true,
      }),
      metadata: expect.objectContaining({
        longFormAssembly: true,
        appGrantSnapshot: expect.objectContaining({ capability: 'long_form_video' }),
        appGrantSnapshotSource: 'database',
      }),
    }), expect.objectContaining({ jobId: expectedId }))
    const assembly = harness.jobs.get(expectedId)
    expect(assembly).toMatchObject({ status: 'queued', queueJobId: expectedId, parentJobId: harness.parent.id })
    expect(JSON.parse(assembly.metadataJson)).toMatchObject({
      longFormAssembly: true,
      appGrantSnapshot: { appSlug: 'dashboard-long-form', capability: 'long_form_video' },
    })
  })

  it('repairs a previously planned assembly record with the parent grant before retrying', async () => {
    const queue = { add: vi.fn(async () => ({ id: 'queued' })) }
    const id = longFormAssemblyJobId(harness.parent.id)
    harness.jobs.set(id, {
      id,
      appSlug: 'dashboard-long-form',
      capability: 'long_form_video',
      prompt: 'Assemble long-form execution execution-1',
      traceId: 'trace-long-form-assembly',
      metadataJson: JSON.stringify({ longFormAssembly: true, legacyMissingGrant: true }),
      status: 'planned',
      queueJobId: '',
      parentJobId: harness.parent.id,
    })

    const result = await advanceLongFormWorkflow(harness.parent.id, queue as any)

    expect(result.scheduled).toBe(true)
    const metadata = JSON.parse(harness.jobs.get(id).metadataJson)
    expect(metadata.legacyMissingGrant).toBe(true)
    expect(metadata.appGrantSnapshot).toMatchObject({
      appSlug: 'dashboard-long-form',
      capability: 'long_form_video',
      artifactRead: true,
      artifactWrite: true,
    })
  })

  it('fails closed before creating or queueing assembly when the parent grant is missing or mismatched', async () => {
    const queue = { add: vi.fn(async () => ({ id: 'queued' })) }
    harness.parent.metadataJson = JSON.stringify({
      appGrantSnapshot: makeAppGrantSnapshot('dashboard-long-form', 'video_generation'),
    })

    await expect(advanceLongFormWorkflow(harness.parent.id, queue as any))
      .rejects.toThrow('valid immutable long_form_video AppCapabilityGrant snapshot')
    expect(queue.add).not.toHaveBeenCalled()
    expect(harness.job.create).not.toHaveBeenCalled()
    expect(harness.jobs.size).toBe(0)
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
