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

import Fastify from 'fastify'
import rateLimit from '@fastify/rate-limit'
import cors from '@fastify/cors'
import { API_PORT, API_HOST, RATE_LIMIT_MAX, RATE_LIMIT_WINDOW_MS } from '@amarktai/core'
import { redisPluginDecorated } from './plugins/redis.js'
import { errorHandlerPlugin } from './plugins/error-handler.js'
import { healthRoutes } from './routes/health.js'
import { jobRoutes } from './routes/jobs.js'
import { artifactRoutes } from './routes/artifacts.js'

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
  await app.register(errorHandlerPlugin)

  // ── Routes ───────────────────────────────────────────────────────────────

  await app.register(healthRoutes)
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
