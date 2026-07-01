/**
 * GET /health — Live health check reporting status for PostgreSQL, Redis, and Qdrant.
 */

import type { FastifyInstance } from 'fastify'
import { prisma } from '@amarktai/db'

export async function healthRoutes(app: FastifyInstance): Promise<void> {
  app.get('/health', async (_request, reply) => {
    const checks: Record<string, { ok: boolean; latencyMs: number; error?: string }> = {}
    let overall = true

    // PostgreSQL check
    const pgStart = Date.now()
    try {
      await prisma.$queryRaw`SELECT 1`
      checks.postgresql = { ok: true, latencyMs: Date.now() - pgStart }
    } catch (err) {
      checks.postgresql = {
        ok: false,
        latencyMs: Date.now() - pgStart,
        error: err instanceof Error ? err.message : 'unknown',
      }
      overall = false
    }

    // Redis check
    const redisStart = Date.now()
    try {
      if (app.redis) {
        const pong = await app.redis.ping()
        checks.redis = { ok: pong === 'PONG', latencyMs: Date.now() - redisStart }
      } else {
        checks.redis = { ok: false, latencyMs: 0, error: 'not configured' }
        overall = false
      }
    } catch (err) {
      checks.redis = {
        ok: false,
        latencyMs: Date.now() - redisStart,
        error: err instanceof Error ? err.message : 'unknown',
      }
      overall = false
    }

    // Qdrant check
    const qdrantStart = Date.now()
    try {
      const qdrantUrl = process.env.QDRANT_URL ?? 'http://127.0.0.1:6333'
      const resp = await fetch(`${qdrantUrl}/healthz`, { signal: AbortSignal.timeout(3000) })
      checks.qdrant = { ok: resp.ok, latencyMs: Date.now() - qdrantStart }
      if (!resp.ok) overall = false
    } catch (err) {
      checks.qdrant = {
        ok: false,
        latencyMs: Date.now() - qdrantStart,
        error: err instanceof Error ? err.message : 'unreachable',
      }
      overall = false
    }

    const statusCode = overall ? 200 : 503
    return reply.status(statusCode).send({
      status: overall ? 'healthy' : 'degraded',
      timestamp: new Date().toISOString(),
      checks,
    })
  })
}
