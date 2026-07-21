import type { FastifyInstance, FastifyReply, FastifyRequest } from 'fastify'
import { prisma, getDatabaseSchemaStatus } from '@amarktai/db'
import { getStorageRoot } from '@amarktai/core'
import { readFileSync } from 'node:fs'
import { mkdir, rm, writeFile } from 'node:fs/promises'
import { join } from 'node:path'
import { randomUUID } from 'node:crypto'
import { execFile } from 'node:child_process'
import { promisify } from 'node:util'
import { buildAdminRuntimeTruth } from '../lib/admin-runtime-truth.js'

const execFileAsync = promisify(execFile)
const BUILD_INFO = loadBuildInfo()

type Check = { ok: boolean; latencyMs: number; error?: string; [key: string]: unknown }

function loadBuildInfo(): { gitSha: string; buildTime: string; serviceName: string; version: string } {
  try {
    const parsed = JSON.parse(readFileSync(join(process.cwd(), 'build-info.json'), 'utf-8'))
    return {
      ...parsed,
      serviceName: process.env.SERVICE_NAME ?? 'amarktai-api',
      version: process.env.APP_VERSION ?? parsed.version,
    }
  } catch {
    return {
      gitSha: process.env.GIT_SHA ?? 'unknown',
      buildTime: process.env.BUILD_TIME ?? 'unknown',
      serviceName: process.env.SERVICE_NAME ?? 'amarktai-api',
      version: process.env.APP_VERSION ?? process.env.npm_package_version ?? '0.0.0',
    }
  }
}

async function timed(check: () => Promise<Record<string, unknown> | void>, safeError: string): Promise<Check> {
  const started = Date.now()
  try {
    const detail = await check()
    return { ok: true, latencyMs: Date.now() - started, ...detail }
  } catch {
    return { ok: false, latencyMs: Date.now() - started, error: safeError }
  }
}

export async function healthRoutes(app: FastifyInstance): Promise<void> {
  const healthHandler = async (_request: FastifyRequest, reply: FastifyReply) => {
    const checks: Record<string, Check> = {
      process: { ok: true, latencyMs: 0 },
      mariadb: await timed(async () => { await prisma.$queryRaw`SELECT 1` }, 'MariaDB unavailable'),
      migrations: await timed(async () => {
        const status = await getDatabaseSchemaStatus()
        if (!status.current) throw new Error(status.error ?? 'outdated')
        return { requiredMigration: status.requiredMigration, appliedAt: status.appliedAt }
      }, 'Database migration is not current'),
      redis: await timed(async () => {
        if (!app.redis || await app.redis.ping() !== 'PONG') throw new Error('unavailable')
      }, 'Redis unavailable'),
      qdrant: await timed(async () => {
        const response = await fetch(`${process.env.QDRANT_URL ?? 'http://127.0.0.1:6333'}/healthz`, {
          signal: AbortSignal.timeout(3000),
        })
        if (!response.ok) throw new Error('unavailable')
      }, 'Qdrant unavailable'),
      artifactStorage: await timed(async () => {
        const root = getStorageRoot()
        await mkdir(root, { recursive: true })
        const path = join(root, `.health-${randomUUID()}`)
        await writeFile(path, 'ok', { flag: 'wx' })
        await rm(path)
      }, 'Artifact storage is not writable'),
      ffmpeg: await timed(async () => {
        await execFileAsync('ffmpeg', ['-version'], { timeout: 3000, windowsHide: true })
      }, 'FFmpeg unavailable'),
      worker: await timed(async () => {
        const response = await fetch(process.env.WORKER_HEALTH_URL ?? 'http://127.0.0.1:3002/health', {
          signal: AbortSignal.timeout(3000),
        })
        const body = await response.json() as { status?: string; timestamp?: string; build?: { gitSha?: string } }
        if (!response.ok || body.status !== 'healthy') throw new Error('unavailable')
        if (BUILD_INFO.gitSha !== 'unknown' && body.build?.gitSha !== BUILD_INFO.gitSha) throw new Error('identity mismatch')
        return { heartbeatAt: body.timestamp ?? null, gitSha: body.build?.gitSha ?? 'unknown' }
      }, 'Worker heartbeat unavailable or build identity mismatched'),
    }

    const ready = Object.values(checks).every((check) => check.ok)
    const runtimeTruth = await buildAdminRuntimeTruth(app).catch(() => null)
    return reply.status(ready ? 200 : 503).send({
      status: ready ? 'healthy' : 'degraded',
      processAlive: true,
      ready,
      timestamp: new Date().toISOString(),
      build: BUILD_INFO,
      checks,
      runtimeTruth: runtimeTruth ? {
        providerCount: runtimeTruth.providers.length,
        runtimeProviderCount: runtimeTruth.providers.filter((provider) => provider.runtimeExecutionProvider).length,
        releaseCandidateCount: runtimeTruth.releaseCandidateCapabilities.length,
        liveProvenCount: runtimeTruth.releaseReadiness.filter((capability) => capability.liveProven).length,
        providerPolicy: runtimeTruth.providerPolicy,
      } : null,
    })
  }

  app.get('/health', healthHandler)
  app.get('/api/v1/health', healthHandler)
}
