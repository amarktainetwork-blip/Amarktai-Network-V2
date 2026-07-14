import { beforeEach, describe, expect, it, vi } from 'vitest'

const memory = vi.hoisted(() => ({ apps: new Map<string, any>(), grants: new Map<string, any>(), runs: [] as any[] }))
const prisma = vi.hoisted(() => ({
  appConnection: {
    findUnique: vi.fn(async ({ where }) => memory.apps.get(where.appSlug) ?? null),
    create: vi.fn(async ({ data }) => { const row = { ...data }; memory.apps.set(data.appSlug, row); return row }),
  },
  appCapabilityGrant: {
    findUnique: vi.fn(async ({ where }) => {
      const key = where.app_capability_grant_unique
      return memory.grants.get(`${key.appSlug}/${key.capability}`) ?? null
    }),
    create: vi.fn(async ({ data }) => { const row = { ...data }; memory.grants.set(`${data.appSlug}/${data.capability}`, row); return row }),
  },
  platformBootstrapRun: {
    create: vi.fn(async ({ data }) => { memory.runs.push(data); return data }),
  },
}))

vi.mock('@amarktai/db', () => ({ prisma }))

const { bootstrapInternalDashboardApps } = await import('../apps/api/src/lib/internal-app-bootstrap.ts')
const { getInternalDashboardApps } = await import('../packages/core/src/dashboard-apps.ts')

describe('internal dashboard application bootstrap', () => {
  beforeEach(() => {
    vi.clearAllMocks(); memory.apps.clear(); memory.grants.clear(); memory.runs.length = 0
  })

  it('inserts only canonical release apps and non-adult grants, then records inserted defaults', async () => {
    const log = { info: vi.fn() }
    const result = await bootstrapInternalDashboardApps(log)
    expect(new Set(result.insertedApps)).toEqual(new Set(getInternalDashboardApps().map((app) => app.appSlug)))
    expect(result.insertedApps).toEqual(expect.arrayContaining([
      'dashboard-studio', 'dashboard-long-form', 'dashboard-video', 'dashboard-image',
      'dashboard-music', 'dashboard-voice', 'dashboard-capability-lab',
    ]))
    expect([...memory.grants.values()].every((grant) => grant.enabled && grant.adultPermission === false)).toBe(true)
    expect([...memory.grants.values()].some((grant) => String(grant.capability).startsWith('adult_'))).toBe(false)
    expect(memory.runs).toHaveLength(1)
    expect(JSON.parse(memory.runs[0].insertedJson)).toEqual(result)
  })

  it('is idempotent and never overwrites administrator-customised records', async () => {
    const log = { info: vi.fn() }
    await bootstrapInternalDashboardApps(log)
    const key = 'dashboard-image/image_generation'
    memory.grants.set(key, { ...memory.grants.get(key), enabled: false, artifactWrite: false, policyProfile: 'administrator_custom' })
    const second = await bootstrapInternalDashboardApps(log)
    expect(second).toEqual({ insertedApps: [], insertedGrants: [] })
    expect(memory.grants.get(key)).toMatchObject({ enabled: false, artifactWrite: false, policyProfile: 'administrator_custom' })
    expect(memory.runs).toHaveLength(1)
  })

  it('fails honestly when required schema tables are absent', async () => {
    prisma.appConnection.findUnique.mockRejectedValueOnce(new Error('table does not exist'))
    await expect(bootstrapInternalDashboardApps({ info: vi.fn() })).rejects.toThrow('table does not exist')
  })
})
