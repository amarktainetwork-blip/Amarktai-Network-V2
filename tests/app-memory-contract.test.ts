import { readFileSync } from 'node:fs'
import { describe, expect, it } from 'vitest'

const server = readFileSync(new URL('../apps/api/src/server.ts', import.meta.url), 'utf8')
const route = readFileSync(new URL('../apps/api/src/routes/app-memory.ts', import.meta.url), 'utf8')
const sdk = readFileSync(new URL('../packages/sdk/src/index.ts', import.meta.url), 'utf8')

describe('app memory contract', () => {
  it('registers a dedicated thin-app memory route', () => {
    expect(server).toContain("import { appMemoryRoutes } from './routes/app-memory.js'")
    expect(server).toContain('await app.register(appMemoryRoutes)')
  })

  it('requires explicit read and write authority', () => {
    expect(route).toContain("loadAppCapabilityGrant(appSlug, capability)")
    expect(route).toContain("mode === 'read' ? 'rag_search' : 'rag_ingest'")
    expect(route).toContain('grant.memoryRead')
    expect(route).toContain('grant.memoryWrite')
    expect(route).toContain('MEMORY_READ_GRANT_REQUIRED')
    expect(route).toContain('MEMORY_WRITE_GRANT_REQUIRED')
  })

  it('scopes every database operation to the authenticated app', () => {
    expect(route).toContain('appSlug: auth.app!.slug')
    expect(route).toContain("where: { id: memoryId, appSlug: auth.app!.slug }")
    expect(route).not.toContain('body.appSlug')
    expect(route).not.toContain('query.appSlug')
  })

  it('excludes expired entries and bounds input sizes', () => {
    expect(route).toContain("{ OR: [{ expiresAt: null }, { expiresAt: { gt: now } }] }")
    expect(route).toContain('MAX_QUERY_LENGTH')
    expect(route).toContain('MAX_CONTENT_LENGTH')
    expect(route).toContain('MAX_LIMIT')
    expect(route).toContain('INVALID_MEMORY_TTL')
  })

  it('exposes provider-neutral SDK methods', () => {
    expect(sdk).toContain('searchMemory(')
    expect(sdk).toContain('writeMemory(')
    expect(sdk).toContain('deleteMemory(')
    const memoryInterfaces = sdk.match(/export interface MemorySearchOptions[\s\S]+?export class AmarktAIError/)?.[0] ?? ''
    expect(memoryInterfaces).not.toMatch(/provider|model|route|executorId|endpoint|apiKey/)
  })
})
