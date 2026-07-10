import type { FastifyInstance, FastifyReply, FastifyRequest } from 'fastify'
import {
  DISCOVERED_PROVIDER_MODELS,
  MODEL_CATALOGUE,
  PROVIDER_KEYS,
  buildCapabilityReadiness,
  isProviderKey,
  type ModelRecord,
  type ProviderDiscoveredModel,
  type ProviderKey,
} from '@amarktai/core'
import { runProviderModelDiscovery } from '@amarktai/providers'

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

function summarizeModels(models: readonly ModelRecord[]) {
  const executable = models.filter((model) => model.executable && model.status === 'available')
  const catalogueOnly = models.filter((model) => !model.executable || model.status !== 'available')
  const blocked = models.filter((model) => model.status === 'blocked')
  const missingClient = models.filter((model) => model.providerClientExists === false)
  const missingExecutor = models.filter((model) => model.workerExecutorExists === false)
  const countsByProvider = Object.fromEntries(PROVIDER_KEYS.map((provider) => [
    provider,
    models.filter((model) => model.provider === provider).length,
  ]))
  return {
    total: models.length,
    executable: executable.length,
    catalogueOnly: catalogueOnly.length,
    blocked: blocked.length,
    missingClient: missingClient.length,
    missingExecutor: missingExecutor.length,
    countsByProvider,
  }
}

function discoverySummary(models: ProviderDiscoveredModel[]) {
  const musicModels = models.filter((model) => model.inferredCapabilities.includes('music_generation'))
  return {
    totalDiscovered: models.length,
    countsByProvider: Object.fromEntries(PROVIDER_KEYS.map((provider) => [
      provider,
      models.filter((model) => model.provider === provider).length,
    ])),
    musicReadiness: {
      discoveredMusicModels: musicModels.length,
      genxMusicModels: musicModels.filter((model) => model.provider === 'genx').map((model) => model.modelId),
      togetherMusicModels: musicModels.filter((model) => model.provider === 'together').map((model) => model.modelId),
      deepinfraMusicModels: musicModels.filter((model) => model.provider === 'deepinfra').map((model) => model.modelId),
      groqMusicModels: musicModels.filter((model) => model.provider === 'groq').map((model) => model.modelId),
      endpointShapeKnown: musicModels.some((model) => model.endpointShapeKnown),
      providerClientExists: musicModels.some((model) => model.providerClientExists),
      workerExecutorExists: musicModels.some((model) => model.workerExecutorExists),
      executableNow: musicModels.some((model) => model.executableNow),
      lyriaLikeModels: musicModels.filter((model) => /lyria/i.test(model.modelId)).map((model) => `${model.provider}/${model.modelId}`),
    },
  }
}

function envApiKeys(): Partial<Record<ProviderKey, string>> {
  return {
    genx: process.env.GENX_API_KEY,
    groq: process.env.GROQ_API_KEY,
    together: process.env.TOGETHER_API_KEY,
    mimo: process.env.MIMO_API_KEY,
    deepinfra: process.env.DEEPINFRA_API_KEY,
  }
}

export async function adminModelDiscoveryRoutes(app: FastifyInstance): Promise<void> {
  app.get('/api/admin/models/discovery/status', async (request, reply) => {
    if (!(await requireAdmin(app, request, reply))) return
    return reply.send({
      success: true,
      generatedLayer: discoverySummary(DISCOVERED_PROVIDER_MODELS),
      catalogue: summarizeModels(MODEL_CATALOGUE),
      distinction: 'Provider has model is not the same as AmarktAI can execute capability.',
    })
  })

  app.post('/api/admin/models/discovery/run', async (request, reply) => {
    if (!(await requireAdmin(app, request, reply))) return
    const body = request.body as Record<string, unknown> | undefined
    const live = body?.live === true
    const results = await runProviderModelDiscovery({
      live,
      apiKeys: live ? envApiKeys() : {},
      genxBaseUrl: process.env.GENX_BASE_URL,
    })
    const models = results.flatMap((result) => result.models)
    return reply.send({
      success: true,
      live,
      results,
      summary: discoverySummary(models),
      note: live
        ? 'Live discovery called provider model-list endpoints only; no generation calls were made.'
        : 'Safe discovery used repo/static truth only; live provider calls were skipped.',
    })
  })

  app.get('/api/admin/models/catalogue', async (request, reply) => {
    if (!(await requireAdmin(app, request, reply))) return
    return reply.send({
      success: true,
      summary: summarizeModels(MODEL_CATALOGUE),
      models: MODEL_CATALOGUE,
    })
  })

  app.get('/api/admin/models/capabilities', async (request, reply) => {
    if (!(await requireAdmin(app, request, reply))) return
    return reply.send({
      success: true,
      capabilities: buildCapabilityReadiness(DISCOVERED_PROVIDER_MODELS),
    })
  })

  app.get('/api/admin/providers/:provider/models', async (request, reply) => {
    if (!(await requireAdmin(app, request, reply))) return
    const { provider } = request.params as { provider: string }
    if (!isProviderKey(provider)) {
      return reply.status(400).send({ error: true, message: 'Invalid provider key' })
    }
    return reply.send({
      success: true,
      provider,
      models: MODEL_CATALOGUE.filter((model) => model.provider === provider),
      discoveredModels: DISCOVERED_PROVIDER_MODELS.filter((model) => model.provider === provider),
    })
  })
}
