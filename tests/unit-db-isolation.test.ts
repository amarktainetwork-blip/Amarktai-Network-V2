import { describe, expect, it } from 'vitest'
import { prisma } from '../packages/db/src/client.ts'

describe('unit database isolation', () => {
  it('fails at the repository boundary before attempting mariadb:3306', async () => {
    await expect(prisma.modelRegistryEntry.findMany()).rejects.toThrow('Unit test attempted database access')
  })
})
