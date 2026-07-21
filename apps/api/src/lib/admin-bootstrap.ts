import { hash } from 'bcryptjs'
import { prisma } from '@amarktai/db'

export const DEFAULT_ADMIN_EMAIL = 'amarktainetwork@gmail.com'

interface AdminBootstrapLogger {
  info: (...args: unknown[]) => void
  error: (...args: unknown[]) => void
}

interface AdminBootstrapPrisma {
  adminUser: {
    findUnique: (args: { where: { email: string } }) => Promise<{ email: string } | null>
    create: (args: { data: { email: string; passwordHash: string; enabled: true } }) => Promise<{ email: string }>
  }
}

export async function ensureDefaultAdminExists(
  log: AdminBootstrapLogger,
  prismaClient: AdminBootstrapPrisma = prisma,
  adminPassword = process.env.ADMIN_PASSWORD?.trim(),
): Promise<void> {
  const adminEmail = process.env.ADMIN_EMAIL?.trim().toLowerCase() || DEFAULT_ADMIN_EMAIL
  const policy = process.env.ADMIN_BOOTSTRAP_POLICY?.trim()
    || (process.env.NODE_ENV === 'production' ? 'required_if_missing' : 'if_configured')
  if (!['required_if_missing', 'if_configured', 'disabled'].includes(policy)) {
    throw new Error('ADMIN_BOOTSTRAP_POLICY must be required_if_missing, if_configured, or disabled')
  }
  if (policy === 'disabled') {
    log.info('[boot] Admin bootstrap disabled by explicit policy')
    return
  }
  try {
    const existing = await prismaClient.adminUser.findUnique({ where: { email: adminEmail } })
    if (existing) {
      log.info(`[boot] Default admin account already exists: ${existing.email}`)
      return
    }
    if (!adminPassword) {
      if (policy === 'required_if_missing') {
        throw new Error('ADMIN_PASSWORD is required because the bootstrap administrator does not exist')
      }
      log.info('[boot] Admin bootstrap skipped: ADMIN_PASSWORD is not configured')
      return
    }
    const passwordHash = await hash(adminPassword, 12)
    const admin = await prismaClient.adminUser.create({
      data: { email: adminEmail, passwordHash, enabled: true },
    })

    log.info(`[boot] Default admin account ensured: ${admin.email}`)
  } catch (err) {
    log.error({ err }, '[boot] Failed to ensure default admin account - login may not work on a fresh database')
    throw err
  }
}
