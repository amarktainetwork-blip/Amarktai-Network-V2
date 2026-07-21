#!/usr/bin/env node

import { hash } from 'bcryptjs'
import { PrismaClient } from '@prisma/client'

const prisma = new PrismaClient()

function required(name) {
  const value = process.env[name]?.trim()
  if (!value) throw new Error(`${name} is required`)
  return value
}

async function main() {
  const email = required('ADMIN_EMAIL').toLowerCase()
  const password = required('ADMIN_RESET_PASSWORD')
  const confirmation = required('CONFIRM_ADMIN_PASSWORD_RESET').toLowerCase()

  if (confirmation !== email) {
    throw new Error('CONFIRM_ADMIN_PASSWORD_RESET must exactly match ADMIN_EMAIL')
  }
  if (password.length < 12) {
    throw new Error('ADMIN_RESET_PASSWORD must be at least 12 characters')
  }
  if (password.length > 256) {
    throw new Error('ADMIN_RESET_PASSWORD must not exceed 256 characters')
  }

  const existing = await prisma.adminUser.findUnique({ where: { email } })
  if (!existing) {
    throw new Error(`Administrator does not exist: ${email}. Use normal bootstrap for a fresh database.`)
  }

  const passwordHash = await hash(password, 12)
  await prisma.adminUser.update({
    where: { email },
    data: {
      passwordHash,
      enabled: true,
      tokenVersion: { increment: 1 },
    },
  })

  console.log(`ADMIN_PASSWORD_RESET=PASS email=${email} existing_tokens_invalidated=true`)
}

try {
  await main()
} catch (error) {
  console.error(`ADMIN_PASSWORD_RESET=FAIL ${error instanceof Error ? error.message : String(error)}`)
  process.exitCode = 1
} finally {
  await prisma.$disconnect()
}
