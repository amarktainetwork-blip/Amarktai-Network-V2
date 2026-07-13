/**
 * Safe Prisma migration deploy script.
 *
 * This script runs `prisma migrate deploy` which:
 * - Applies pending migrations in order
 * - Does NOT create new migrations
 * - Does NOT reset the database
 * - Does NOT accept data loss
 * - Fails if migrations are inconsistent
 *
 * Used by the one-shot migrate service or deployment command.
 * NEVER called by API or worker startup.
 */

import { spawnSync } from 'node:child_process'
import { existsSync } from 'node:fs'

const prismaBin = process.platform === 'win32'
  ? './node_modules/.bin/prisma.cmd'
  : './node_modules/.bin/prisma'
const command = existsSync(prismaBin) ? prismaBin : 'prisma'

const result = spawnSync(command, [
  'migrate',
  'deploy',
  '--schema=./prisma/schema.prisma',
], {
  encoding: 'utf8',
  stdio: 'inherit',
})

process.exit(result.status ?? 1)
