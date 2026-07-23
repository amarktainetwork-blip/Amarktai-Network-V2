import { prisma } from './client.js'

export const REQUIRED_SCHEMA_MIGRATION = '20260722_specialist_workflow_closure'

export interface DatabaseSchemaStatus {
  current: boolean
  requiredMigration: string
  appliedAt: string | null
  error: string | null
}

export async function getDatabaseSchemaStatus(): Promise<DatabaseSchemaStatus> {
  try {
    const rows = await prisma.$queryRawUnsafe<Array<{
      migration_name: string
      finished_at: Date | null
      rolled_back_at: Date | null
    }>>(
      'SELECT migration_name, finished_at, rolled_back_at FROM `_prisma_migrations` WHERE migration_name = ? LIMIT 1',
      REQUIRED_SCHEMA_MIGRATION,
    )
    const migration = rows[0]
    const current = Boolean(migration?.finished_at && !migration.rolled_back_at)
    return {
      current,
      requiredMigration: REQUIRED_SCHEMA_MIGRATION,
      appliedAt: migration?.finished_at?.toISOString() ?? null,
      error: current ? null : `Required migration ${REQUIRED_SCHEMA_MIGRATION} is not applied`,
    }
  } catch (error) {
    return {
      current: false,
      requiredMigration: REQUIRED_SCHEMA_MIGRATION,
      appliedAt: null,
      error: error instanceof Error ? error.message : 'Migration status query failed',
    }
  }
}

export async function assertDatabaseSchemaCurrent(): Promise<void> {
  const status = await getDatabaseSchemaStatus()
  if (!status.current) {
    throw new Error(`Database schema is incompatible: ${status.error ?? status.requiredMigration}`)
  }
}
