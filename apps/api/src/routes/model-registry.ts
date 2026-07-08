import type { FastifyInstance, FastifyReply, FastifyRequest } from 'fastify'
import { seedModelCatalog, getModelCatalog } from '../lib/model-registry.js'
import { getAllCapabilityGroupSummaries, getCapabilityGroupSummary } from '../lib/capability-groups.js'
import { planVideoBudget, getBudgetProfiles } from '../lib/video-planner.js'
import { selectRuntimeModel } from '../lib/runtime-selector.js'

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

export async function modelRegistryRoutes(app: FastifyInstance): Promise<void> {
  // Seed model catalog
  app.post('/api/admin/model-registry/seed', async (request, reply) => {
    if (!(await requireAdmin(app, request, reply))) return
    const result = await seedModelCatalog()
    return reply.send({ success: true, ...result })
  })

  // List model catalog
  app.get('/api/admin/model-registry', async (request, reply) => {
    if (!(await requireAdmin(app, request, reply))) return
    const { provider, category, capability } = request.query as Record<string, string>
    const models = await getModelCatalog({ provider, category, capability })
    return reply.send({
      models: models.map((m) => ({
        provider: m.provider,
        modelId: m.modelId,
        displayName: m.displayName,
        family: m.family,
        category: m.category,
        primaryRole: m.primaryRole,
        costTier: m.costTier,
        latencyTier: m.latencyTier,
        contextWindow: m.contextWindow,
        estimatedUnitCost: m.estimatedUnitCost,
        qualityTier: m.costTier,
        enabled: m.enabled,
        notes: m.notes,
      })),
      total: models.length,
    })
  })

  // Capability group summaries
  app.get('/api/admin/capability-groups', async (request, reply) => {
    if (!(await requireAdmin(app, request, reply))) return
    const summaries = await getAllCapabilityGroupSummaries()
    return reply.send({ capabilities: summaries })
  })

  // Single capability group summary
  app.get('/api/admin/capability-groups/:capability', async (request, reply) => {
    if (!(await requireAdmin(app, request, reply))) return
    const { capability } = request.params as { capability: string }
    const summary = await getCapabilityGroupSummary(capability)
    return reply.send(summary)
  })

  // Video budget planner
  app.post('/api/admin/video-planner', async (request, reply) => {
    if (!(await requireAdmin(app, request, reply))) return
    const plan = planVideoBudget(request.body as Record<string, unknown>)
    return reply.send(plan)
  })

  // Budget profiles
  app.get('/api/admin/budget-profiles', async (request, reply) => {
    if (!(await requireAdmin(app, request, reply))) return
    return reply.send(getBudgetProfiles())
  })

  // Runtime selector
  app.post('/api/admin/runtime-selector', async (request, reply) => {
    if (!(await requireAdmin(app, request, reply))) return
    const { capability, qualityTier, maxCostCents, excludeProviders } = request.body as Record<string, unknown>
    const selection = await selectRuntimeModel(capability as string, {
      qualityTier: qualityTier as string,
      maxCostCents: maxCostCents as number,
      excludeProviders: excludeProviders as string[],
    })
    return reply.send(selection)
  })
}
