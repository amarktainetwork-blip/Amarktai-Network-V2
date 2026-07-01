/**
 * Redis connection plugin for Fastify.
 *
 * Provides a shared ioredis client instance on `app.redis`.
 * Gracefully degrades to null when REDIS_URL is not set.
 */

import type { FastifyInstance } from 'fastify'
import fp from 'fastify-plugin'
import Redis from 'ioredis'
import { getRedisUrl } from '@amarktai/core'

declare module 'fastify' {
  interface FastifyInstance {
    redis: Redis | null
  }
}

async function redisPlugin(app: FastifyInstance): Promise<void> {
  const url = getRedisUrl()
  let client: Redis | null = null

  if (url) {
    client = new Redis(url, {
      maxRetriesPerRequest: 3,
      retryStrategy(times) {
        if (times > 5) return null
        return Math.min(times * 200, 2000)
      },
    })

    client.on('error', (err) => {
      app.log.error({ err }, '[Redis] connection error')
    })

    app.log.info('[Redis] connected')
  } else {
    app.log.warn('[Redis] REDIS_URL not set — running without Redis')
  }

  app.decorate('redis', client)

  app.addHook('onClose', async () => {
    if (client) {
      await client.quit()
      app.log.info('[Redis] disconnected')
    }
  })
}

export const redisPluginDecorated = fp(redisPlugin, { name: 'redis' })
