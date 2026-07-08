import { spawnSync } from 'node:child_process'
import { existsSync } from 'node:fs'

const prismaBin = process.platform === 'win32'
  ? './node_modules/.bin/prisma.cmd'
  : './node_modules/.bin/prisma'
const command = existsSync(prismaBin) ? prismaBin : 'prisma'

const result = spawnSync(command, [
  'db',
  'push',
  '--schema=./prisma/schema.prisma',
  '--accept-data-loss',
  '--skip-generate',
], {
  encoding: 'utf8',
})

const output = `${result.stdout ?? ''}${result.stderr ?? ''}`
const duplicateCredentialPolicyColumn = /Duplicate column name ['"`]?credential_usage_policy['"`]?/i.test(output)

if (result.status === 0) {
  process.stdout.write(result.stdout ?? '')
  process.stderr.write(result.stderr ?? '')
  process.exit(0)
}

if (duplicateCredentialPolicyColumn) {
  console.log('[boot] Schema already contains credential_usage_policy; continuing without destructive reset.')
  process.exit(0)
}

process.stdout.write(result.stdout ?? '')
process.stderr.write(result.stderr ?? '')
process.exit(result.status ?? 1)
