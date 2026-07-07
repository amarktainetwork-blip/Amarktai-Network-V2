import { hash } from 'bcryptjs'
import { prisma } from '@amarktai/db'

export const DEFAULT_ADMIN_EMAIL = 'amarktainetwork@gmail.com'
const DEFAULT_ADMIN_PASSWORD = 'Ashmor12@'

interface AdminBootstrapLogger {
  info: (...args: unknown[]) => void
  error: (...args: unknown[]) => void
}

interface AdminBootstrapPrisma {
  adminUser: {
    upsert: (args: {
      where: { email: string }
      update: Record<string, never>
      create: { email: string; passwordHash: string }
    }) => Promise<{ email: string }>
  }
}

export async function ensureDefaultAdminExists(
  log: AdminBootstrapLogger,
  prismaClient: AdminBootstrapPrisma = prisma,
): Promise<void> {
  try {
    const passwordHash = await hash(DEFAULT_ADMIN_PASSWORD, 12)
    const admin = await prismaClient.adminUser.upsert({
      where: { email: DEFAULT_ADMIN_EMAIL },
      update: {},
      create: { email: DEFAULT_ADMIN_EMAIL, passwordHash },
    })

    log.info(`[boot] Default admin account ensured: ${admin.email}`)
  } catch (err) {
    log.error({ err }, '[boot] Failed to ensure default admin account - login may not work on a fresh database')
  }
}
