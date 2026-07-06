import { spawnSync } from 'node:child_process'

const placeholderDatabaseUrl = 'mysql://audit:audit@localhost:3306/amarktai_audit'

if (!process.env.DATABASE_URL) {
  process.env.DATABASE_URL = placeholderDatabaseUrl
}

const command = 'npx'
const result = spawnSync(command, ['prisma', 'validate'], {
  stdio: 'inherit',
  env: process.env,
  shell: process.platform === 'win32',
})

if (result.error) {
  console.error(result.error)
}

process.exit(result.status ?? 1)
