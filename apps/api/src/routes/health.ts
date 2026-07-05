/**
 * GET /health — Live health check reporting status for MariaDB, Redis, and Qdrant.
 *
 * MariaDB and Redis are critical — API reports unhealthy if either is down.
 * Qdrant is optional (used for RAG) — reported as degraded, not blocking.
 */

import type { FastifyInstance, FastifyReply, FastifyRequest } from 'fastify'
import { prisma } from '@amarktai/db'

export async function healthRoutes(app: FastifyInstance): Promise<void> {
  const healthHandler = async (_request: FastifyRequest, reply: FastifyReply) => {
    const checks: Record<string, { ok: boolean; latencyMs: number; error?: string }> = {}
    let criticalHealthy = true

    // MariaDB check (CRITICAL)
    const dbStart = Date.now()
    try {
      await prisma.$queryRaw`SELECT 1`
      checks.mariadb = { ok: true, latencyMs: Date.now() - dbStart }
    } catch (err) {
      checks.mariadb = {
        ok: false,
        latencyMs: Date.now() - dbStart,
        error: err instanceof Error ? err.message : 'unknown',
      }
      criticalHealthy = false
    }

    // Redis check (CRITICAL)
    const redisStart = Date.now()
    try {
      if (app.redis) {
        const pong = await app.redis.ping()
        checks.redis = { ok: pong === 'PONG', latencyMs: Date.now() - redisStart }
      } else {
        checks.redis = { ok: false, latencyMs: 0, error: 'not configured' }
        criticalHealthy = false
      }
    } catch (err) {
      checks.redis = {
        ok: false,
        latencyMs: Date.now() - redisStart,
        error: err instanceof Error ? err.message : 'unknown',
      }
      criticalHealthy = false
    }

    // Qdrant check (OPTIONAL — used for RAG, not critical for API boot)
    const qdrantStart = Date.now()
    try {
      const qdrantUrl = process.env.QDRANT_URL ?? 'http://127.0.0.1:6333'
      const resp = await fetch(`${qdrantUrl}/healthz`, { signal: AbortSignal.timeout(3000) })
      checks.qdrant = { ok: resp.ok, latencyMs: Date.now() - qdrantStart }
    } catch {
      checks.qdrant = {
        ok: false,
        latencyMs: Date.now() - qdrantStart,
        error: 'unavailable — RAG features disabled',
      }
    }

    const statusCode = criticalHealthy ? 200 : 503
    return reply.status(statusCode).send({
      status: criticalHealthy ? 'healthy' : 'degraded',
      timestamp: new Date().toISOString(),
      checks,
    })
  }

  app.get('/health', healthHandler)
  app.get('/api/v1/health', healthHandler)
}
