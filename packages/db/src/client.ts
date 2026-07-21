/**
 * Prisma client singleton — shared across the monorepo.
 *
 * All database access goes through this single instance.
 * No other module may create its own PrismaClient.
 */

import { PrismaClient } from '@prisma/client'

const globalForPrisma = globalThis as unknown as { __prisma: PrismaClient | undefined }

function createPrismaClient(): PrismaClient {
  const client = new PrismaClient({
    log: process.env.NODE_ENV === 'development' ? ['warn', 'error'] : ['error'],
  })
  if (process.env.AMARKTAI_UNIT_TEST !== '1' || process.env.AMARKTAI_INTEGRATION_TEST_DB === '1') return client
  const boundaryError = () => Promise.reject(new Error(
    'Unit test attempted database access. Mock the repository boundary or set AMARKTAI_INTEGRATION_TEST_DB=1 for an explicit fixture-stack integration test.',
  ))
  const delegateProxy = (delegate: object) => new Proxy(delegate, {
    get(target, property, receiver) {
      const value = Reflect.get(target, property, receiver)
      return typeof value === 'function' ? boundaryError : value
    },
  })
  return new Proxy(client, {
    get(target, property, receiver) {
      const value = Reflect.get(target, property, receiver)
      if (property === '$disconnect') return value.bind(target)
      if (typeof property === 'string' && property.startsWith('$')) return boundaryError
      return typeof value === 'object' && value !== null ? delegateProxy(value) : value
    },
  }) as PrismaClient
}

export const prisma =
  globalForPrisma.__prisma ??
  createPrismaClient()

if (process.env.NODE_ENV !== 'production') {
  globalForPrisma.__prisma = prisma
}
