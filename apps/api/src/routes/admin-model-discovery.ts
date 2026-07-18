import type { FastifyInstance, FastifyReply, FastifyRequest } from 'fastify'
import {
  DISCOVERED_PROVIDER_MODELS,
  MODEL_CATALOGUE,
  PROVIDER_KEYS,
  RUNTIME_EXECUTION_PROVIDERS,
  hasExecutorRegistration,
  isProviderKey,
  type ModelRecord,
  type ProviderDiscoveredModel,
  type ProviderKey,
} from '@amarktai/core'
import { runProviderModelDiscovery } from '@amarktai/providers'
import { getProviderCredentialStatus, resolveProviderApiKey } from '@amarktai/db'
import { buildAdminRuntimeTruth } from '../lib/admin-runtime-truth.js'

const RUNTIME_EXECUTABLE_PROVIDERS = RUNTIME_EXECUTION_PROVIDERS

function hasRegisteredExecutor(model: Pick<ModelRecord, 'provider' | 'capabilities'>): boolean {
  return model.capabilities.some((capability) => hasExecutorRegistration(capability, model.provider))
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

function summarizeModels(models: readonly ModelRecord[]) {
  const executable = models.filter((model) => hasRegisteredExecutor(model) && model.status === 'available')
  const catalogueOnly = models.filter((model) => !hasRegisteredExecutor(model) || model.status !== 'available')
  const blocked = models.filter((model) => model.status === 'blocked')
  const missingClient = models.filter((model) => model.providerClientExists === false)
  const missingExecutor = models.filter((model) => model.workerExecutorExists === false)
  const docsKnown = models.filter((model) => model.docsKnown)
  const liveDiscovered = models.filter((model) => model.liveDiscovered)
  const policyRestricted = models.filter((model) => model.policyRestrictedByApp)
  const transportProfilesPresent = [...new Set(models.map((model) => model.transportProfile).filter(Boolean))]
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
    totalDocsFallbackModels: docsKnown.length,
    totalLiveDiscoveredModels: liveDiscovered.length,
    totalEffectiveCatalogueModels: models.length,
    modelsExecutableNow: executable.length,
    modelsKnownButBlocked: catalogueOnly.length,
    policyRestrictedModels: policyRestricted.length,
    transportProfilesPresent,
    runtimeExecutableProviders: RUNTIME_EXECUTABLE_PROVIDERS,
    countsByProvider,
  }
}

function discoverySummary(models: ProviderDiscoveredModel[]) {
  const musicModels = models.filter((model) => model.inferredCapabilities.includes('music_generation'))
  const genxMusicModels = musicModels.filter((model) => model.provider === 'genx')
  const providerStatuses = PROVIDER_KEYS.map((provider) => {
    const providerModels = models.filter((model) => model.provider === provider)
    const liveDiscovered = providerModels.some((model) => model.liveDiscovered)
    const docsFallbackUsed = providerModels.some((model) => model.docsKnown)
    const policyRestricted = provider === 'mimo' || providerModels.every((model) => model.policyRestrictedByApp)
    return {
      provider,
      docsCapabilityKnown: providerModels.some((model) => model.providerCapabilityKnown || model.docsKnown),
      liveDiscoveryAttempted: liveDiscovered,
      liveDiscoverySucceeded: liveDiscovered,
      liveDiscoverySkipped: !liveDiscovered,
      liveDiscoverySkipReason: provider === 'mimo' ? 'coding_agent_only_not_backend_runtime' : liveDiscovered ? null : 'not_live_discovered_in_committed_catalogue',
      docsFallbackUsed,
      providerUniverseKnown: false,
      providerUniversePartiallyKnown: docsFallbackUsed,
      publicDocsUniverseKnown: docsFallbackUsed,
      authenticatedUniverseKnown: false,
      runtimeExecutionAllowed: RUNTIME_EXECUTABLE_PROVIDERS.includes(provider as (typeof RUNTIME_EXECUTABLE_PROVIDERS)[number]),
      policyRestrictedByApp: policyRestricted,
      policyExecutionDisabled: provider === 'mimo',
      policyBlockedReason: provider === 'mimo' ? 'coding_agent_only_not_backend_runtime' : null,
      effectiveCatalogueCount: providerModels.length,
    }
  })
  const providersWithFullUniverseKnown = providerStatuses.filter((status) => status.providerUniverseKnown).map((status) => status.provider)
  const providersPartiallyKnown = providerStatuses.filter((status) => status.providerUniversePartiallyKnown).map((status) => status.provider)
  const providersUsingDocsFallback = providerStatuses.filter((status) => status.docsFallbackUsed).map((status) => status.provider)
  return {
    totalDiscovered: models.length,
    totalLiveDiscoveredModels: models.filter((model) => model.liveDiscovered).length,
    totalDocsFallbackModels: models.filter((model) => model.docsKnown).length,
    totalEffectiveCatalogueModels: models.length,
    modelsExecutableNow: 0,
    modelsKnownButBlocked: models.length,
    policyRestrictedModels: models.filter((model) => model.policyRestrictedByApp).length,
    transportProfilesPresent: [...new Set(models.map((model) => model.transportProfile).filter(Boolean))],
    providerDiscoveryStatus: providerStatuses,
    providersWithFullUniverseKnown,
    providersPartiallyKnown,
    providersUsingDocsFallback,
    providersSkipped: providerStatuses.filter((status) => status.liveDiscoverySkipped).map((status) => status.provider),
    providersFailed: [],
    fullProviderModelUniverseKnown: false,
    liveDiscoveryPartial: true,
    runtimeExecutableProviders: RUNTIME_EXECUTABLE_PROVIDERS,
    genxMusicCapabilityKnown: genxMusicModels.length > 0,
    genxMusicExecutionReady: false,
    mimoCapabilityKnown: models.some((model) => model.provider === 'mimo' && model.docsKnown),
    mimoPolicyRestricted: models.filter((model) => model.provider === 'mimo').every((model) => model.policyRestrictedByApp && !model.executableNow),
    countsByProvider: Object.fromEntries(PROVIDER_KEYS.map((provider) => [
      provider,
      models.filter((model) => model.provider === provider).length,
    ])),
    genxMusicDiscovery: {
      genxMusicModelsDiscovered: genxMusicModels.map((model) => model.modelId),
      lyriaClipDiscovered: genxMusicModels.some((model) => model.modelId === 'lyria-3-clip-preview'),
      lyriaProDiscovered: genxMusicModels.some((model) => model.modelId === 'lyria-3-pro-preview'),
      lyriaExactMatches: genxMusicModels.filter((model) => /^lyria-3-(clip|pro)-preview$/.test(model.modelId)).map((model) => model.modelId),
      genxMusicTransportProfile: [...new Set(genxMusicModels.map((model) => model.transportProfile))],
      genxMusicEndpointFamily: [...new Set(genxMusicModels.map((model) => model.endpointFamily))],
      genxMusicExecutorReady: genxMusicModels.some((model) => hasExecutorRegistration('music_generation', model.provider)),
      genxMusicBlockers: [...new Set(genxMusicModels.flatMap((model) => model.executableBlockers ?? []))],
    },
    musicReadiness: {
      discoveredMusicModels: musicModels.length,
      genxMusicModels: musicModels.filter((model) => model.provider === 'genx').map((model) => model.modelId),
      togetherMusicModels: musicModels.filter((model) => model.provider === 'together').map((model) => model.modelId),
      deepinfraMusicModels: musicModels.filter((model) => model.provider === 'deepinfra').map((model) => model.modelId),
      endpointShapeKnown: musicModels.some((model) => model.endpointShapeKnown),
      providerClientExists: musicModels.some((model) => model.providerClientExists),
      workerExecutorExists: musicModels.some((model) => model.workerExecutorExists),
      executableNow: false,
      lyriaLikeModels: musicModels.filter((model) => /lyria/i.test(model.modelId)).map((model) => `${model.provider}/${model.modelId}`),
    },
  }
}

async function storedRuntimeCredentials(): Promise<{
  apiKeys: Partial<Record<ProviderKey, string>>
  genxBaseUrl?: string
}> {
  const apiKeys: Partial<Record<ProviderKey, string>> = {}
  await Promise.all(RUNTIME_EXECUTABLE_PROVIDERS.map(async (provider) => {
    try {
      apiKeys[provider] = (await resolveProviderApiKey(provider)).apiKey
    } catch {
      // The discovery adapter records a redacted missing-credential result.
    }
  }))
  const genxStatus = await getProviderCredentialStatus('genx').catch(() => null)
  return { apiKeys, genxBaseUrl: genxStatus?.baseUrl || process.env.GENX_BASE_URL }
}

export async function adminModelDiscoveryRoutes(app: FastifyInstance): Promise<void> {
  app.get('/api/admin/models/discovery/status', async (request, reply) => {
    if (!(await requireAdmin(app, request, reply))) return
    const truth = await buildAdminRuntimeTruth(app)
    return reply.send({
      success: true,
      generatedLayer: discoverySummary(DISCOVERED_PROVIDER_MODELS),
      catalogue: summarizeModels(MODEL_CATALOGUE),
      canonicalTruth: {
        providerPolicy: truth.providerPolicy,
        countsByClassification: truth.countsByClassification,
        capabilities: truth.capabilities,
      },
      distinction: 'Provider has model is not the same as AmarktAI can execute capability.',
    })
  })

  app.post('/api/admin/models/discovery/run', async (request, reply) => {
    if (!(await requireAdmin(app, request, reply))) return
    const body = request.body as Record<string, unknown> | undefined
    const live = body?.live === true
    const strict = body?.strict === true
    const credentials = live ? await storedRuntimeCredentials() : { apiKeys: {} }
    const results = await runProviderModelDiscovery({
      live,
      apiKeys: credentials.apiKeys,
      genxBaseUrl: credentials.genxBaseUrl,
    })
    const models = results.flatMap((result) => result.models)
    const strictFailures = strict
      ? results.filter((result) => RUNTIME_EXECUTABLE_PROVIDERS.includes(result.provider as (typeof RUNTIME_EXECUTABLE_PROVIDERS)[number]) && result.liveDiscoverySucceeded !== true)
      : []
    if (strictFailures.length > 0) {
      return reply.status(424).send({
        success: false,
        live,
        strict,
        results,
        summary: discoverySummary(models),
        message: 'Strict live model discovery requires successful authenticated model-list discovery for GenX, Together, and DeepInfra. MiMo is excluded by coding-agent-only policy.',
      })
    }
    return reply.send({
      success: true,
      live,
      strict,
      results,
      summary: discoverySummary(models),
      note: live
        ? 'Live discovery called provider model-list endpoints only; no generation calls were made.'
        : 'Safe discovery used repo/static truth only; live provider calls were skipped.',
    })
  })

  app.get('/api/admin/models/catalogue', async (request, reply) => {
    if (!(await requireAdmin(app, request, reply))) return
    const truth = await buildAdminRuntimeTruth(app)
    return reply.send({
      success: true,
      summary: summarizeModels(MODEL_CATALOGUE),
      models: MODEL_CATALOGUE,
      canonicalTruth: {
        providers: truth.providers,
        capabilities: truth.capabilities,
      },
    })
  })

  app.get('/api/admin/models/capabilities', async (request, reply) => {
    if (!(await requireAdmin(app, request, reply))) return
    const truth = await buildAdminRuntimeTruth(app)
    return reply.send({
      success: true,
      capabilities: truth.capabilities,
      countsByClassification: truth.countsByClassification,
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
