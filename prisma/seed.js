/**
 * Prisma seed script — creates the default admin account.
 *
 * Run with: npx prisma db seed
 * Or:       npx tsx prisma/seed.ts
 */

const { PrismaClient } = require('@prisma/client')
const bcrypt = require('bcryptjs')

const prisma = new PrismaClient()

async function main() {
  const email = 'amarktainetwork@gmail.com'
  const password = 'Ashmor12@'

  console.log(`[seed] Ensuring admin account exists for ${email}...`)

  const passwordHash = await bcrypt.hash(password, 12)

  const admin = await prisma.adminUser.upsert({
    where: { email },
    update: { passwordHash },
    create: { email, passwordHash },
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
