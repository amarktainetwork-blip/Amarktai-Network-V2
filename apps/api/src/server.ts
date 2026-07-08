/**
 * AmarktAI Network API server.
 *
 * Production HTTP API engine with rate limiting, Redis, auth, jobs,
 * artifact routes, provider admin routes, and source-of-truth validation.
 */

import Fastify from 'fastify'
import rateLimit from '@fastify/rate-limit'
import cors from '@fastify/cors'
import { API_PORT, API_HOST, RATE_LIMIT_MAX, RATE_LIMIT_WINDOW_MS } from '@amarktai/core'
import { redisPluginDecorated } from './plugins/redis.js'
import { jwtPluginDecorated } from './plugins/jwt.js'
import { errorHandlerPlugin } from './plugins/error-handler.js'
import { healthRoutes } from './routes/health.js'
import { jobRoutes } from './routes/jobs.js'
import { artifactRoutes } from './routes/artifacts.js'
import { authRoutes } from './routes/auth.js'
import { adminProviderRoutes } from './routes/admin-providers.js'
import { adminRuntimeProofRoutes } from './routes/admin-runtime-proofs.js'
import { adminJobRoutes } from './routes/admin-jobs.js'
import { adminArtifactRoutes } from './routes/admin-artifacts.js'
import { modelRegistryRoutes } from './routes/model-registry.js'
import { ensureDefaultAdminExists } from './lib/admin-bootstrap.js'

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

  await app.register(cors, { origin: true })
  await app.register(rateLimit, {
    max: RATE_LIMIT_MAX,
    timeWindow: RATE_LIMIT_WINDOW_MS,
  })
  await app.register(redisPluginDecorated)
  await app.register(jwtPluginDecorated)
  await app.register(errorHandlerPlugin)

  await app.register(healthRoutes)
  await app.register(authRoutes)
  await app.register(adminProviderRoutes)
  await app.register(adminRuntimeProofRoutes)
  await app.register(adminJobRoutes)
  await app.register(adminArtifactRoutes)
  await app.register(modelRegistryRoutes)
  await app.register(jobRoutes)
  await app.register(artifactRoutes)

  await ensureDefaultAdminExists(app.log)

  try {
    await app.listen({ port: API_PORT, host: API_HOST })
    app.log.info(`AmarktAI API server listening on ${API_HOST}:${API_PORT}`)
  } catch (err) {
    app.log.fatal(err, 'Failed to start server')
    process.exit(1)
  }

  const shutdown = async (signal: string) => {
    app.log.info(`Received ${signal}, shutting down gracefully...`)
    await app.close()
    process.exit(0)
  }

  process.on('SIGTERM', () => shutdown('SIGTERM'))
  process.on('SIGINT', () => shutdown('SIGINT'))
}

main()
