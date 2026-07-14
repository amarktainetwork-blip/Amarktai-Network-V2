/**
 * App Capability Grant Management Routes
 *
 * GET    /api/admin/app-grants/:appSlug — List all grants for an app
 * GET    /api/admin/app-grants/:appSlug/:capability — Get a specific grant
 * PUT    /api/admin/app-grants/:appSlug/:capability — Create/update a grant
 * DELETE /api/admin/app-grants/:appSlug/:capability — Delete a grant
 */

import type { FastifyInstance, FastifyReply, FastifyRequest } from 'fastify'
import { isValidCapability, type CapabilityKey } from '@amarktai/core'
import {
  loadAllAppCapabilityGrants,
  loadAppCapabilityGrant,
  upsertAppCapabilityGrant,
  deleteAppCapabilityGrant,
} from '../lib/app-grant-loader.js'

async function requireAdmin(app: FastifyInstance, request: FastifyRequest, reply: FastifyReply): Promise<boolean> {
  const auth = request.headers.authorization
  if (!auth?.startsWith('Bearer ')) {
    reply.status(401).send({ error: true, message: 'Authorization required' })
    return false
  }
  try {
    const payload = await app.jwtVerify(auth.replace('Bearer ', ''))
    if (payload?.role !== 'admin') {
      reply.status(403).send({ error: true, message: 'Admin access required' })
      return false
    }
    return true
  } catch {
    reply.status(401).send({ error: true, message: 'Invalid authorization' })
    return false
  }
}

export async function appGrantRoutes(app: FastifyInstance): Promise<void> {
  // GET /api/admin/app-grants/:appSlug — List all grants for an app
  app.get('/api/admin/app-grants/:appSlug', async (request, reply) => {
    if (!(await requireAdmin(app, request, reply))) return

    const { appSlug } = request.params as { appSlug: string }
    const grants = await loadAllAppCapabilityGrants(appSlug)

    return reply.send({
      appSlug,
      grants: Object.fromEntries(grants),
      total: grants.size,
    })
  })

  // GET /api/admin/app-grants/:appSlug/:capability — Get a specific grant
  app.get('/api/admin/app-grants/:appSlug/:capability', async (request, reply) => {
    if (!(await requireAdmin(app, request, reply))) return

    const { appSlug, capability } = request.params as { appSlug: string; capability: string }

    if (!isValidCapability(capability)) {
      return reply.status(400).send({ error: true, message: `Invalid capability: ${capability}` })
    }

    const grant = await loadAppCapabilityGrant(appSlug, capability as CapabilityKey)

    if (!grant) {
      return reply.status(404).send({ error: true, message: 'Grant not found' })
    }

    return reply.send(grant)
  })

  // PUT /api/admin/app-grants/:appSlug/:capability — Create/update a grant
  app.put('/api/admin/app-grants/:appSlug/:capability', async (request, reply) => {
    if (!(await requireAdmin(app, request, reply))) return

    const { appSlug, capability } = request.params as { appSlug: string; capability: string }

    if (!isValidCapability(capability)) {
      return reply.status(400).send({ error: true, message: `Invalid capability: ${capability}` })
    }

    const body = request.body as Record<string, unknown>

    const grant = await upsertAppCapabilityGrant(appSlug, capability as CapabilityKey, {
      enabled: body.enabled as boolean,
      qualityFloor: body.qualityFloor as string,
      budgetPolicy: body.budgetPolicy as string,
      maxCostPerRequest: body.maxCostPerRequest as number,
      maxCostPerWorkflow: body.maxCostPerWorkflow as number,
      latencyPreference: body.latencyPreference as string,
      allowFallback: body.allowFallback as boolean,
      maxFallbackAttempts: body.maxFallbackAttempts as number,
      liveProofRequired: body.liveProofRequired as boolean,
      approvalRequired: body.approvalRequired as boolean,
      artifactRead: body.artifactRead as boolean,
      artifactWrite: body.artifactWrite as boolean,
      memoryRead: body.memoryRead as boolean,
      memoryWrite: body.memoryWrite as boolean,
      ragNamespaces: body.ragNamespaces as string[],
      policyProfile: body.policyProfile as string,
      adultPermission: body.adultPermission as boolean,
      dataRetentionPolicy: body.dataRetentionPolicy as string,
      passthroughModelAllowed: body.passthroughModelAllowed as boolean,
      providerResidencyConstraints: body.providerResidencyConstraints as string[],
    })

    return reply.send(grant)
  })

  // DELETE /api/admin/app-grants/:appSlug/:capability — Delete a grant
  app.delete('/api/admin/app-grants/:appSlug/:capability', async (request, reply) => {
    if (!(await requireAdmin(app, request, reply))) return

    const { appSlug, capability } = request.params as { appSlug: string; capability: string }

    if (!isValidCapability(capability)) {
      return reply.status(400).send({ error: true, message: `Invalid capability: ${capability}` })
    }

    const deleted = await deleteAppCapabilityGrant(appSlug, capability as CapabilityKey)

    if (!deleted) {
      return reply.status(404).send({ error: true, message: 'Grant not found' })
    }

    return reply.send({ success: true, message: 'Grant deleted' })
  })
}
