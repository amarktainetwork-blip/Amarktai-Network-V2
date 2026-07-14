import fs from 'node:fs'
import path from 'node:path'
import { beforeEach, describe, expect, it, vi } from 'vitest'

const dbMocks = vi.hoisted(() => ({
  prisma: {
    adminUser: {
      upsert: vi.fn(),
    },
  },
}))

const bcryptMocks = vi.hoisted(() => ({
  hash: vi.fn(),
}))

vi.mock('@amarktai/db', () => dbMocks)
vi.mock('bcryptjs', () => bcryptMocks)

const {
  DEFAULT_ADMIN_EMAIL,
  ensureDefaultAdminExists,
} = await import('../apps/api/src/lib/admin-bootstrap.ts')

const ROOT = process.cwd()

function makeLog() {
  return {
    info: vi.fn(),
    error: vi.fn(),
  }
}

describe('Docker admin bootstrap contract', () => {
  beforeEach(() => {
    vi.clearAllMocks()
    bcryptMocks.hash.mockResolvedValue('hashed-default-admin-password')
    dbMocks.prisma.adminUser.upsert.mockResolvedValue({ email: DEFAULT_ADMIN_EMAIL })
  })

  it('docker entrypoint does not call missing Prisma seed configuration', () => {
    const entrypoint = fs.readFileSync(path.join(ROOT, 'scripts/docker-entrypoint.sh'), 'utf8')

    expect(entrypoint).not.toContain('db seed')
    expect(entrypoint).not.toContain('Admin seed failed')
    expect(entrypoint).toContain('Admin bootstrap is handled idempotently by the API runtime')
  })

  it('ensures the default admin with an idempotent upsert', async () => {
    const log = makeLog()

    await ensureDefaultAdminExists(log, dbMocks.prisma, 'test-admin-password')

    expect(bcryptMocks.hash).toHaveBeenCalledWith(expect.any(String), 12)
    expect(dbMocks.prisma.adminUser.upsert).toHaveBeenCalledWith({
      where: { email: DEFAULT_ADMIN_EMAIL },
      update: {},
      create: { email: DEFAULT_ADMIN_EMAIL, passwordHash: 'hashed-default-admin-password' },
    })
    expect(log.info).toHaveBeenCalledWith(expect.stringContaining(DEFAULT_ADMIN_EMAIL))
  })

  it('does not throw or duplicate when the default admin already exists', async () => {
    const log = makeLog()
    dbMocks.prisma.adminUser.upsert.mockResolvedValueOnce({ email: DEFAULT_ADMIN_EMAIL })
    dbMocks.prisma.adminUser.upsert.mockResolvedValueOnce({ email: DEFAULT_ADMIN_EMAIL })

    await ensureDefaultAdminExists(log, dbMocks.prisma, 'test-admin-password')
    await ensureDefaultAdminExists(log, dbMocks.prisma, 'test-admin-password')

    expect(dbMocks.prisma.adminUser.upsert).toHaveBeenCalledTimes(2)
    expect(dbMocks.prisma.adminUser.upsert.mock.calls[0][0].where).toEqual({ email: DEFAULT_ADMIN_EMAIL })
    expect(dbMocks.prisma.adminUser.upsert.mock.calls[1][0].where).toEqual({ email: DEFAULT_ADMIN_EMAIL })
    expect(log.error).not.toHaveBeenCalled()
  })

  it('logs bootstrap failures with a safe message', async () => {
    const log = makeLog()
    dbMocks.prisma.adminUser.upsert.mockRejectedValueOnce(new Error('database unavailable'))

    await expect(ensureDefaultAdminExists(log, dbMocks.prisma, 'test-admin-password')).resolves.toBeUndefined()

    const serializedLogs = JSON.stringify(log.error.mock.calls)
    expect(serializedLogs).toContain('Failed to ensure default admin account')
  })
})
