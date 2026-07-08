import type { FastifyInstance, FastifyReply, FastifyRequest } from 'fastify'
import { resolveProviderApiKey, getProviderCredentialStatus } from '@amarktai/db'
import { seedCuratedFallback, getModelCatalog, getCatalogSummary, upsertDiscoveredModels, upsertGenXPricingCatalog } from '../lib/model-registry.js'
import { getAllCapabilityGroupSummaries, getCapabilityGroupSummary } from '../lib/capability-groups.js'
import { planVideoBudget, getBudgetProfiles } from '../lib/video-planner.js'
import { selectRuntimeModel } from '../lib/runtime-selector.js'
import { discoverTogetherModels, discoverDeepInfraModels, discoverGenXModels, discoverGroqModels, discoverGenXPricing } from '../lib/provider-discovery.js'

interface ProviderRefreshRouteSummary {
  providerKey: string
  totalFetched: number
  created: number
  updated: number
  failedRows: number
  errors: Array<{ modelId: string; message: string }>
  discoveryError: string | null
}

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
  // Seed curated fallback
  app.post('/api/admin/model-catalog/seed', async (request, reply) => {
    if (!(await requireAdmin(app, request, reply))) return
    const result = await seedCuratedFallback()
    return reply.send({ success: true, ...result, source: 'curated_seed', note: 'Fallback only — not provider truth' })
  })

  // Refresh all provider catalogs
  app.post('/api/admin/model-catalog/refresh', async (request, reply) => {
    if (!(await requireAdmin(app, request, reply))) return

    const results: Record<string, ProviderRefreshRouteSummary | { providerKey: string; totalFetched: number; created: number; updated: number; failedRows: number; errors: string[]; discoveryError: string | null }> = {}

    // Together
    try {
      const cred = await resolveProviderApiKey('together')
      const result = await discoverTogetherModels(cred.apiKey)
      const upsert = await upsertDiscoveredModels(result)
      results.together = { ...upsert, discoveryError: result.error }
    } catch (err) {
      results.together = { providerKey: 'together', totalFetched: 0, created: 0, updated: 0, failedRows: 0, errors: [], discoveryError: err instanceof Error ? err.message : 'Not configured' }
    }

    // DeepInfra
    try {
      const cred = await resolveProviderApiKey('deepinfra')
      const result = await discoverDeepInfraModels(cred.apiKey)
      const upsert = await upsertDiscoveredModels(result)
      results.deepinfra = { ...upsert, discoveryError: result.error }
    } catch (err) {
      results.deepinfra = { providerKey: 'deepinfra', totalFetched: 0, created: 0, updated: 0, failedRows: 0, errors: [], discoveryError: err instanceof Error ? err.message : 'Not configured' }
    }

    // GenX
    try {
      const cred = await resolveProviderApiKey('genx')
      const status = await getProviderCredentialStatus('genx')
      const result = await discoverGenXModels(cred.apiKey, status.baseUrl)
      const upsert = await upsertDiscoveredModels(result)
      results.genx = { ...upsert, discoveryError: result.error }
    } catch (err) {
      results.genx = { providerKey: 'genx', totalFetched: 0, created: 0, updated: 0, failedRows: 0, errors: [], discoveryError: err instanceof Error ? err.message : 'Not configured' }
    }

    // Groq
    try {
      const cred = await resolveProviderApiKey('groq')
      const result = await discoverGroqModels(cred.apiKey)
      const upsert = await upsertDiscoveredModels(result)
      results.groq = { ...upsert, discoveryError: result.error }
    } catch (err) {
      results.groq = { providerKey: 'groq', totalFetched: 0, created: 0, updated: 0, failedRows: 0, errors: [], discoveryError: err instanceof Error ? err.message : 'Not configured' }
    }

    // MiMo stays as curated seed
    results.mimo = { providerKey: 'mimo', totalFetched: 1, created: 0, updated: 0, failedRows: 0, errors: [], discoveryError: null }

    return reply.send({ success: true, results })
  })

  // Refresh single provider
  app.post('/api/admin/model-catalog/:provider/refresh', async (request, reply) => {
    if (!(await requireAdmin(app, request, reply))) return
    const { provider } = request.params as { provider: string }

    try {
      const cred = await resolveProviderApiKey(provider)
      let result

      switch (provider) {
        case 'together':
          result = await discoverTogetherModels(cred.apiKey)
          break
        case 'deepinfra':
          result = await discoverDeepInfraModels(cred.apiKey)
          break
        case 'genx': {
          const status = await getProviderCredentialStatus('genx')
          result = await discoverGenXModels(cred.apiKey, status.baseUrl)
          break
        }
        case 'groq':
          result = await discoverGroqModels(cred.apiKey)
          break
        case 'mimo':
          return reply.send({ success: true, total: 1, source: 'curated_seed', note: 'MiMo is coding-tool-only' })
        default:
          return reply.status(400).send({ error: true, message: 'Unknown provider' })
      }

      const upsert = await upsertDiscoveredModels(result)
      return reply.send({ success: true, ...upsert, source: result.source, discoveryError: result.error })
    } catch (err) {
      return reply.status(400).send({ error: true, message: err instanceof Error ? err.message : 'Provider not configured' })
    }
  })

  // Refresh GenX pricing
  app.post('/api/admin/model-catalog/genx/pricing/refresh', async (request, reply) => {
    if (!(await requireAdmin(app, request, reply))) return

    try {
      const cred = await resolveProviderApiKey('genx')
      const status = await getProviderCredentialStatus('genx')
      const result = await discoverGenXPricing(cred.apiKey, status.baseUrl)

      if (result.error) {
        return reply.send({ success: false, error: result.error, source: result.source, modelsUpdated: 0, createdFromPricing: 0, pricingKnown: 0, pricingUnknown: 0 })
      }

      const update = await upsertGenXPricingCatalog(result)
      return reply.send({
        success: true,
        pricing: result.pricing,
        source: result.source,
        catalogSource: update.catalogSource,
        update,
        modelsUpdated: update.updated,
        createdFromPricing: update.createdFromPricing,
        pricingKnown: update.pricingKnownCount,
        pricingUnknown: update.pricingUnknownCount,
      })
    } catch (err) {
      return reply.status(400).send({ error: true, message: err instanceof Error ? err.message : 'GenX not configured' })
    }
  })

  // List model catalog
  app.get('/api/admin/model-catalog', async (request, reply) => {
    if (!(await requireAdmin(app, request, reply))) return
    const { provider, category, capability, source } = request.query as Record<string, string>
    const models = await getModelCatalog({ provider, category, capability, source })
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
        enabled: m.enabled,
        source: m.source,
        catalogCompleteness: m.catalogCompleteness,
        isLiveDiscovered: m.isLiveDiscovered,
        modelOwner: m.modelOwner,
        pricingSource: m.pricingSource,
        pricingConfidence: m.pricingConfidence,
        pricingUnit: m.pricingUnit,
        pricingCurrency: m.pricingCurrency,
        pricingBlocker: m.pricingBlocker,
        lastPricingSyncedAt: m.lastPricingSyncedAt,
        notes: m.notes,
      })),
      total: models.length,
    })
  })

  // Catalog summary
  app.get('/api/admin/model-catalog/summary', async (request, reply) => {
    if (!(await requireAdmin(app, request, reply))) return
    const summaries = await getCatalogSummary()
    return reply.send({ providers: summaries })
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
    const plan = await planVideoBudget(request.body as Record<string, unknown>)
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
