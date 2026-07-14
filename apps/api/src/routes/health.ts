/**
 * GET /health — Live health check reporting status for MariaDB, Redis, and Qdrant.
 *
 * MariaDB and Redis are critical — API reports unhealthy if either is down.
 * Qdrant is optional (used for RAG) — reported as degraded, not blocking.
 *
 * Exposes immutable build identity: git SHA, build time, service name, version.
 */

import type { FastifyInstance, FastifyReply, FastifyRequest } from 'fastify'
import { prisma } from '@amarktai/db'
import { readFileSync } from 'node:fs'
import { join } from 'node:path'
import { buildAdminRuntimeTruth } from '../lib/admin-runtime-truth.js'

const BUILD_INFO = loadBuildInfo()

function loadBuildInfo(): { gitSha: string; buildTime: string; serviceName: string; version: string } {
  // Try to read from build-info.json (generated at build time)
  try {
    const buildInfoPath = join(process.cwd(), 'build-info.json')
    const raw = readFileSync(buildInfoPath, 'utf-8')
    return JSON.parse(raw)
  } catch {
    // Fallback: try git SHA from environment (set in Dockerfile or CI)
    return {
      gitSha: process.env.GIT_SHA ?? 'unknown',
      buildTime: process.env.BUILD_TIME ?? 'unknown',
      serviceName: 'amarktai-api',
      version: process.env.npm_package_version ?? '0.0.0',
    }
  }
}

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
    const runtimeTruth = await buildAdminRuntimeTruth(app).catch(() => null)
    return reply.status(statusCode).send({
      status: criticalHealthy ? 'healthy' : 'degraded',
      timestamp: new Date().toISOString(),
      build: {
        gitSha: BUILD_INFO.gitSha,
        buildTime: BUILD_INFO.buildTime,
        serviceName: BUILD_INFO.serviceName,
        version: BUILD_INFO.version,
      },
      checks,
      runtimeTruth: runtimeTruth ? {
        providerCount: runtimeTruth.providers.length,
        capabilityCount: runtimeTruth.capabilities.length,
        countsByClassification: runtimeTruth.countsByClassification,
        providerPolicy: runtimeTruth.providerPolicy,
      } : null,
    })
  }

  app.get('/health', healthHandler)
  app.get('/api/v1/health', healthHandler)
}
