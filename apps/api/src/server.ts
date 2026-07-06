/**
 * AmarktAI Network — Fastify API Server
 *
 * Production-grade HTTP API engine with:
 * - Rate limiting
 * - Global error interception
 * - Redis connection
 * - Health, jobs, and artifact routes
 * - All validation from @amarktai/core (single source of truth)
 */

import Fastify, { type FastifyInstance } from 'fastify'
import rateLimit from '@fastify/rate-limit'
import cors from '@fastify/cors'
import { API_PORT, API_HOST, RATE_LIMIT_MAX, RATE_LIMIT_WINDOW_MS } from '@amarktai/core'
import { prisma } from '@amarktai/db'
import { redisPluginDecorated } from './plugins/redis.js'
import { jwtPluginDecorated } from './plugins/jwt.js'
import { errorHandlerPlugin } from './plugins/error-handler.js'
import { healthRoutes } from './routes/health.js'
import { jobRoutes } from './routes/jobs.js'
import { artifactRoutes } from './routes/artifacts.js'
import { authRoutes } from './routes/auth.js'
import { adminProviderRoutes } from './routes/admin-providers.js'

// ── Admin Safety Net ──────────────────────────────────────────────────────────

const DEFAULT_ADMIN_EMAIL = 'amarktainetwork@gmail.com'
const DEFAULT_ADMIN_PASSWORD = 'Ashmor12@'

async function ensureAdminExists(log: FastifyInstance['log']): Promise<void> {
  try {
    const count = await prisma.adminUser.count()
    if (count === 0) {
      log.warn('[boot] No admin user found — creating default admin account')
      const { hash } = await import('bcryptjs')
      const passwordHash = await hash(DEFAULT_ADMIN_PASSWORD, 12)
      await prisma.adminUser.create({
        data: { email: DEFAULT_ADMIN_EMAIL, passwordHash },
      })
      log.info(`[boot] Default admin created: ${DEFAULT_ADMIN_EMAIL}`)
    }
  } catch (err) {
    log.error({ err }, '[boot] Failed to verify/create admin user — login may not work')
  }
}

async function main(): Promise<void> {
  const app = Fastify({
    logger: {
      level: process.env.LOG_LEVEL ?? 'info',
      transport:
        process.env.NODE_ENV === 'development'
          ? { target: 'pino-pretty', options: { colorize: true } }
          : undefined,
    },
    trustProxy: true,
  })

  // ── Plugins ──────────────────────────────────────────────────────────────

  await app.register(cors, { origin: true })
  await app.register(rateLimit, {
    max: RATE_LIMIT_MAX,
    timeWindow: RATE_LIMIT_WINDOW_MS,
  })
  await app.register(redisPluginDecorated)
  await app.register(jwtPluginDecorated)
  await app.register(errorHandlerPlugin)

  // ── Routes ───────────────────────────────────────────────────────────────

  await app.register(healthRoutes)
  await app.register(authRoutes)
  await app.register(adminProviderRoutes)
  await app.register(jobRoutes)
  await app.register(artifactRoutes)

  // ── Start ────────────────────────────────────────────────────────────────

  try {
    await app.listen({ port: API_PORT, host: API_HOST })
    app.log.info(`AmarktAI API server listening on ${API_HOST}:${API_PORT}`)
  } catch (err) {
    app.log.fatal(err, 'Failed to start server')
    process.exit(1)
  }

  // Safety net: ensure admin account exists (covers seed failures)
  await ensureAdminExists(app.log)

  // ── Graceful shutdown ────────────────────────────────────────────────────

  const shutdown = async (signal: string) => {
    app.log.info(`Received ${signal}, shutting down gracefully...`)
    await app.close()
    process.exit(0)
  }

  process.on('SIGTERM', () => shutdown('SIGTERM'))
  process.on('SIGINT', () => shutdown('SIGINT'))
}

main()
