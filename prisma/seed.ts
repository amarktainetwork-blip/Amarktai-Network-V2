/**
 * Prisma seed script — creates the default admin account.
 *
 * Run with: npx prisma db seed
 * Or:       npx tsx prisma/seed.ts
 */

import { PrismaClient } from '@prisma/client'
import { hash } from 'bcryptjs'

const prisma = new PrismaClient()

const ADMIN_EMAIL = 'amarktainetwork@gmail.com'
const ADMIN_PASSWORD = 'Ashmor12@'

async function main(): Promise<void> {
  console.log(`[seed] Ensuring admin account exists for ${ADMIN_EMAIL}...`)

  const passwordHash = await hash(ADMIN_PASSWORD, 12)

  const admin = await prisma.adminUser.upsert({
    where: { email: ADMIN_EMAIL },
    update: { passwordHash },
    create: { email: ADMIN_EMAIL, passwordHash },
  })

  console.log(`[seed] Admin account ready: ${admin.email} (id: ${admin.id})`)
}

main()
  .catch((err) => {
    console.error('[seed] Failed:', err)
    process.exit(1)
  })
  .finally(async () => {
    await prisma.$disconnect()
  })
