import type { FastifyInstance } from 'fastify'
import { prisma } from '@amarktai/db'
import { authenticateAppKey } from './jobs.js'
import { loadAppCapabilityGrant } from '../lib/app-grant-loader.js'

const MAX_QUERY_LENGTH = 2_000
const MAX_CONTENT_LENGTH = 100_000
const MAX_KEY_LENGTH = 500
const MAX_LIMIT = 50
const ALLOWED_MEMORY_TYPES = new Set(['event', 'summary', 'context', 'learned'])

function boundedString(value: unknown, maxLength: number): string {
  return typeof value === 'string' ? value.trim().slice(0, maxLength) : ''
}

function positiveInteger(value: unknown, fallback: number, max: number): number {
  const parsed = Number(value)
  if (!Number.isFinite(parsed) || parsed < 1) return fallback
  return Math.min(max, Math.floor(parsed))
}

async function memoryAuthority(appSlug: string, mode: 'read' | 'write') {
  const capability = mode === 'read' ? 'rag_search' : 'rag_ingest'
  const grant = await loadAppCapabilityGrant(appSlug, capability)
  if (!grant?.enabled) return null
  if (mode === 'read' && !grant.memoryRead) return null
  if (mode === 'write' && !grant.memoryWrite) return null
  return grant
}

export async function appMemoryRoutes(app: FastifyInstance): Promise<void> {
  app.get('/api/v1/memory/search', async (request, reply) => {
    const auth = await authenticateAppKey(request.headers.authorization)
    if (!auth.ok) {
      return reply.status(auth.statusCode).send({
        error: true,
        code: 'AUTHENTICATION_FAILED',
        message: auth.error,
      })
    }

    const grant = await memoryAuthority(auth.app!.slug, 'read')
    if (!grant) {
      return reply.status(403).send({
        error: true,
        code: 'MEMORY_READ_GRANT_REQUIRED',
        message: 'An enabled rag_search grant with memoryRead authority is required.',
      })
    }

    const query = request.query as Record<string, unknown>
    const text = boundedString(query.q, MAX_QUERY_LENGTH)
    const limit = positiveInteger(query.limit, 10, MAX_LIMIT)
    const requestedTypes = boundedString(query.types, 200)
      .split(',')
      .map((value) => value.trim())
      .filter((value) => ALLOWED_MEMORY_TYPES.has(value))

    const now = new Date()
    const entries = await prisma.memoryEntry.findMany({
      where: {
        appSlug: auth.app!.slug,
        AND: [
          { OR: [{ expiresAt: null }, { expiresAt: { gt: now } }] },
          ...(requestedTypes.length > 0 ? [{ memoryType: { in: requestedTypes } }] : []),
          ...(text
            ? [{
                OR: [
                  { key: { contains: text } },
                  { content: { contains: text } },
                ],
              }]
            : []),
        ],
      },
      orderBy: [{ importance: 'desc' }, { createdAt: 'desc' }],
      take: limit,
    })

    return reply.send({
      appSlug: auth.app!.slug,
      query: text,
      count: entries.length,
      namespaceAuthority: grant.ragNamespaces,
      entries: entries.map((entry) => ({
        id: entry.id,
        memoryType: entry.memoryType,
        key: entry.key,
        content: entry.content,
        importance: entry.importance,
        expiresAt: entry.expiresAt?.toISOString() ?? null,
        createdAt: entry.createdAt.toISOString(),
      })),
    })
  })

  app.post('/api/v1/memory', async (request, reply) => {
    const auth = await authenticateAppKey(request.headers.authorization)
    if (!auth.ok) {
      return reply.status(auth.statusCode).send({
        error: true,
        code: 'AUTHENTICATION_FAILED',
        message: auth.error,
      })
    }

    const grant = await memoryAuthority(auth.app!.slug, 'write')
    if (!grant) {
      return reply.status(403).send({
        error: true,
        code: 'MEMORY_WRITE_GRANT_REQUIRED',
        message: 'An enabled rag_ingest grant with memoryWrite authority is required.',
      })
    }

    const body = request.body as Record<string, unknown>
    const content = boundedString(body.content, MAX_CONTENT_LENGTH)
    if (!content) {
      return reply.status(400).send({
        error: true,
        code: 'INVALID_MEMORY_CONTENT',
        message: 'content is required.',
      })
    }

    const requestedType = boundedString(body.memoryType, 50) || 'context'
    if (!ALLOWED_MEMORY_TYPES.has(requestedType)) {
      return reply.status(400).send({
        error: true,
        code: 'INVALID_MEMORY_TYPE',
        message: `memoryType must be one of ${[...ALLOWED_MEMORY_TYPES].join(', ')}.`,
      })
    }

    const importanceRaw = Number(body.importance ?? 0.5)
    if (!Number.isFinite(importanceRaw) || importanceRaw < 0 || importanceRaw > 1) {
      return reply.status(400).send({
        error: true,
        code: 'INVALID_MEMORY_IMPORTANCE',
        message: 'importance must be between 0 and 1.',
      })
    }

    const ttlSecondsRaw = body.ttlSeconds === undefined ? null : Number(body.ttlSeconds)
    if (ttlSecondsRaw !== null && (!Number.isFinite(ttlSecondsRaw) || ttlSecondsRaw < 60 || ttlSecondsRaw > 31_536_000)) {
      return reply.status(400).send({
        error: true,
        code: 'INVALID_MEMORY_TTL',
        message: 'ttlSeconds must be between 60 and 31536000.',
      })
    }

    const expiresAt = ttlSecondsRaw === null
      ? null
      : new Date(Date.now() + Math.floor(ttlSecondsRaw) * 1000)

    const entry = await prisma.memoryEntry.create({
      data: {
        appSlug: auth.app!.slug,
        memoryType: requestedType,
        key: boundedString(body.key, MAX_KEY_LENGTH),
        content,
        importance: importanceRaw,
        expiresAt,
      },
    })

    return reply.status(201).send({
      entry: {
        id: entry.id,
        appSlug: entry.appSlug,
        memoryType: entry.memoryType,
        key: entry.key,
        content: entry.content,
        importance: entry.importance,
        expiresAt: entry.expiresAt?.toISOString() ?? null,
        createdAt: entry.createdAt.toISOString(),
      },
    })
  })

  app.delete('/api/v1/memory/:id', async (request, reply) => {
    const auth = await authenticateAppKey(request.headers.authorization)
    if (!auth.ok) {
      return reply.status(auth.statusCode).send({
        error: true,
        code: 'AUTHENTICATION_FAILED',
        message: auth.error,
      })
    }

    const grant = await memoryAuthority(auth.app!.slug, 'write')
    if (!grant) {
      return reply.status(403).send({
        error: true,
        code: 'MEMORY_WRITE_GRANT_REQUIRED',
        message: 'An enabled rag_ingest grant with memoryWrite authority is required.',
      })
    }

    const { id } = request.params as { id: string }
    const memoryId = Number(id)
    if (!Number.isInteger(memoryId) || memoryId < 1) {
      return reply.status(400).send({
        error: true,
        code: 'INVALID_MEMORY_ID',
        message: 'Memory id must be a positive integer.',
      })
    }

    const deleted = await prisma.memoryEntry.deleteMany({
      where: { id: memoryId, appSlug: auth.app!.slug },
    })
    if (deleted.count !== 1) {
      return reply.status(404).send({
        error: true,
        code: 'MEMORY_NOT_FOUND',
        message: 'Memory entry was not found for the authenticated app.',
      })
    }

    return reply.send({ id: memoryId, deleted: true })
  })
}
