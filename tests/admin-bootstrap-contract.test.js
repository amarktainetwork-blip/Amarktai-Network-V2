import fs from 'node:fs'
import path from 'node:path'
import { beforeEach, describe, expect, it, vi } from 'vitest'

const dbMocks = vi.hoisted(() => ({
  prisma: {
    adminUser: {
      findUnique: vi.fn(),
      create: vi.fn(),
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
    dbMocks.prisma.adminUser.findUnique.mockResolvedValue(null)
    dbMocks.prisma.adminUser.create.mockResolvedValue({ email: DEFAULT_ADMIN_EMAIL })
  })

  it('docker entrypoint does not call missing Prisma seed configuration', () => {
    const entrypoint = fs.readFileSync(path.join(ROOT, 'scripts/docker-entrypoint.sh'), 'utf8')

    expect(entrypoint).not.toContain('db seed')
    expect(entrypoint).not.toContain('Admin seed failed')
    expect(entrypoint).toContain('Admin bootstrap is handled idempotently by the API runtime')
  })

  it('creates the missing default admin without an overwrite path', async () => {
    const log = makeLog()

    await ensureDefaultAdminExists(log, dbMocks.prisma, 'test-admin-password')

    expect(bcryptMocks.hash).toHaveBeenCalledWith(expect.any(String), 12)
    expect(dbMocks.prisma.adminUser.create).toHaveBeenCalledWith({
      data: { email: DEFAULT_ADMIN_EMAIL, passwordHash: 'hashed-default-admin-password', enabled: true },
    })
    expect(log.info).toHaveBeenCalledWith(expect.stringContaining(DEFAULT_ADMIN_EMAIL))
  })

  it('does not throw or duplicate when the default admin already exists', async () => {
    const log = makeLog()
    dbMocks.prisma.adminUser.findUnique.mockResolvedValue({ email: DEFAULT_ADMIN_EMAIL })

    await ensureDefaultAdminExists(log, dbMocks.prisma, 'test-admin-password')
    await ensureDefaultAdminExists(log, dbMocks.prisma, 'test-admin-password')

    expect(dbMocks.prisma.adminUser.findUnique).toHaveBeenCalledTimes(2)
    expect(dbMocks.prisma.adminUser.create).not.toHaveBeenCalled()
    expect(bcryptMocks.hash).not.toHaveBeenCalled()
    expect(log.error).not.toHaveBeenCalled()
  })

  it('logs bootstrap failures with a safe message', async () => {
    const log = makeLog()
    dbMocks.prisma.adminUser.findUnique.mockRejectedValueOnce(new Error('database unavailable'))

    await expect(ensureDefaultAdminExists(log, dbMocks.prisma, 'test-admin-password')).rejects.toThrow('database unavailable')

    const serializedLogs = JSON.stringify(log.error.mock.calls)
    expect(serializedLogs).toContain('Failed to ensure default admin account')
  })
})
