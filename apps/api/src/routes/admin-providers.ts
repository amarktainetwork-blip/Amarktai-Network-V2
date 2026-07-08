/**
 * Admin provider credential routes.
 *
 * These endpoints are backend contracts for future dashboard UI. They never
 * return raw provider keys or encrypted ciphertext.
 */

import type { FastifyInstance, FastifyReply, FastifyRequest } from 'fastify'
import {
  ProviderConfigError,
  clearProviderCredential,
  listProviderCredentialStatuses,
  saveProviderCredential,
} from '@amarktai/db'
import { testProviderCredential } from '../lib/provider-health-test.js'

export async function adminProviderRoutes(app: FastifyInstance): Promise<void> {
  app.get('/api/admin/providers', async (request, reply) => {
    if (!(await requireAdmin(app, request, reply))) return

    const providers = await listProviderCredentialStatuses()
    return reply.send({ providers })
  })

  app.put('/api/admin/providers/:providerKey', async (request, reply) => {
    if (!(await requireAdmin(app, request, reply))) return

    const { providerKey } = request.params as { providerKey: string }
    const body = (request.body ?? {}) as Record<string, unknown>

    try {
      const status = await saveProviderCredential({
        providerKey,
        apiKey: typeof body.apiKey === 'string' ? body.apiKey : undefined,
        clearKey: body.clearKey === true,
        enabled: typeof body.enabled === 'boolean' ? body.enabled : undefined,
        baseUrl: typeof body.baseUrl === 'string' ? body.baseUrl : undefined,
        defaultModel: typeof body.defaultModel === 'string' ? body.defaultModel : undefined,
        fallbackModel: typeof body.fallbackModel === 'string' ? body.fallbackModel : undefined,
        credentialUsagePolicy: typeof body.credentialUsagePolicy === 'string' ? body.credentialUsagePolicy : undefined,
        notes: typeof body.notes === 'string' ? body.notes : undefined,
      })

      return reply.send({ provider: status })
    } catch (err) {
      if (err instanceof ProviderConfigError && err.code === 'invalid-provider') {
        return reply.status(400).send({ error: true, message: 'Invalid provider key' })
      }
      request.log.error({ err }, 'Failed to save provider credential')
      return reply.status(500).send({ error: true, message: 'Failed to save provider credential' })
    }
  })

  app.post('/api/admin/providers/:providerKey/test', async (request, reply) => {
    if (!(await requireAdmin(app, request, reply))) return

    const { providerKey } = request.params as { providerKey: string }

    try {
      const result = await testProviderCredential(providerKey)
      return reply.send(result)
    } catch (err) {
      if (err instanceof ProviderConfigError && err.code === 'invalid-provider') {
        return reply.status(400).send({ error: true, message: 'Invalid provider key' })
      }
      request.log.error({ err }, 'Failed to test provider credential')
      return reply.status(500).send({ error: true, message: 'Failed to test provider credential' })
    }
  })

  app.delete('/api/admin/providers/:providerKey/key', async (request, reply) => {
    if (!(await requireAdmin(app, request, reply))) return

    const { providerKey } = request.params as { providerKey: string }

    try {
      const status = await clearProviderCredential(providerKey)
      return reply.send({ provider: status })
    } catch (err) {
      if (err instanceof ProviderConfigError && err.code === 'invalid-provider') {
        return reply.status(400).send({ error: true, message: 'Invalid provider key' })
      }
      request.log.error({ err }, 'Failed to clear provider credential')
      return reply.status(500).send({ error: true, message: 'Failed to clear provider credential' })
    }
  })
}

async function requireAdmin(
  app: FastifyInstance,
  request: FastifyRequest,
  reply: FastifyReply,
): Promise<boolean> {
  const authHeader = request.headers.authorization
  if (!authHeader || typeof authHeader !== 'string' || !authHeader.startsWith('Bearer ')) {
    reply.status(401).send({ error: true, message: 'Missing or invalid Authorization header' })
    return false
  }

  const payload = await app.jwtVerify(authHeader.slice(7))
  if (!payload || payload.role !== 'admin') {
    reply.status(403).send({ error: true, message: 'Admin access required' })
    return false
  }

  return true
}
