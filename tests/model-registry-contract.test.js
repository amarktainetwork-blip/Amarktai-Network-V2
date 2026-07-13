import fs from 'node:fs'
import path from 'node:path'
import { beforeEach, describe, expect, it, vi } from 'vitest'
import { PROVIDER_KEYS } from '../packages/core/src/providers.ts'
import { discoverDeepInfraModels, discoverGenXModels, discoverGenXPricing, discoverGroqModels, discoverTogetherModels } from '../apps/api/src/lib/provider-discovery.ts'

const prismaMock = vi.hoisted(() => ({
  modelRegistryEntry: {
    findMany: vi.fn(),
    findUnique: vi.fn(),
    update: vi.fn(),
    create: vi.fn(),
  },
  aiProvider: {
    findMany: vi.fn(),
    findUnique: vi.fn(),
  },
}))

vi.mock('@amarktai/db', () => ({ prisma: prismaMock }))

const { stringifyMetadataSafely, updateGenXPricingMetadata, upsertDiscoveredModels } = await import('../apps/api/src/lib/model-registry.ts')
const { selectRuntimeModel } = await import('../apps/api/src/lib/runtime-selector.ts')
const { buildCapabilityGroupSummary } = await import('../apps/api/src/lib/capability-groups.ts')

const ROOT = process.cwd()

function jsonResponse(payload, ok = true, status = 200) {
  return {
    ok,
    status,
    text: async () => JSON.stringify(payload),
  }
}

function modelRow(overrides = {}) {
  return {
    id: 1,
    provider: 'genx',
    modelId: 'seedance-v1-fast',
    displayName: 'Seedance',
    category: 'video',
    primaryRole: 'video_generation',
    costTier: 'medium',
    latencyTier: 'medium',
    estimatedUnitCost: null,
    pricingSource: 'unknown',
    pricingConfidence: 'unknown',
    pricingBlocker: 'pricing_unknown',
    source: 'provider_api',
    catalogCompleteness: 'partial_from_provider_api',
    isLiveDiscovered: true,
    supportsChat: false,
    supportsText: false,
    supportsVideoGeneration: true,
    supportsImageGeneration: false,
    supportsTts: false,
    supportsStt: false,
    supportsEmbeddings: false,
    supportsReranking: false,
    supportsMultimodal: false,
    ...overrides,
  }
}

describe('real provider model discovery and catalog truth', () => {
  beforeEach(() => {
    vi.restoreAllMocks()
    vi.unstubAllGlobals()
    vi.clearAllMocks()
  })

  it('keeps provider list exactly final five and never promotes model owners to providers', () => {
    expect([...PROVIDER_KEYS]).toEqual(['genx', 'groq', 'together', 'mimo', 'deepinfra'])
    for (const banned of ['openai', 'anthropic', 'google', 'qwen', 'wan', 'pixverse', 'minimax', 'gemini', 'resemble']) {
      expect(PROVIDER_KEYS).not.toContain(banned)
    }
  })

  it('stores provider raw metadata and pricing metadata in LongText fields', () => {
    const schema = fs.readFileSync(path.join(ROOT, 'prisma/schema.prisma'), 'utf8')

    expect(schema).toMatch(/rawMetadata\s+String\s+@default\("\{}"\)\s+@map\("raw_metadata"\)\s+@db\.LongText/)
    expect(schema).toMatch(/pricingRawMetadata\s+String\s+@default\("\{}"\)\s+@map\("pricing_raw_metadata"\)\s+@db\.LongText/)
    expect(schema).toMatch(/notes\s+String\s+@default\(""\)\s+@db\.LongText/)
  })

  it('stringifies circular and very large metadata safely', () => {
    const circular = { id: 'model-a' }
    circular.self = circular
    const circularResult = stringifyMetadataSafely(circular, 'raw_metadata')
    expect(circularResult.json).toContain('[circular]')
    expect(circularResult.warning).toBe('')

    const largeResult = stringifyMetadataSafely({ payload: 'x'.repeat(600_000) }, 'raw_metadata')
    const parsed = JSON.parse(largeResult.json)
    expect(parsed).toMatchObject({ summarized: true, truncated: true, label: 'raw_metadata' })
    expect(largeResult.warning).toBe('raw_metadata_truncated')
  })

  it('provider refresh persists large metadata safely and does not fail all rows when one row fails', async () => {
    prismaMock.modelRegistryEntry.findUnique.mockResolvedValue(null)
    prismaMock.modelRegistryEntry.create
      .mockResolvedValueOnce({})
      .mockRejectedValueOnce(new Error('Row too large for raw_metadata secret-token'))

    const result = await upsertDiscoveredModels({
      provider: 'together',
      totalDiscovered: 2,
      source: 'provider_api',
      catalogCompleteness: 'partial_from_provider_api',
      discoveredAt: new Date().toISOString(),
      error: null,
      models: [
        {
          provider: 'together',
          modelId: 'safe-large-model',
          displayName: 'Safe Large Model',
          family: 'owner',
          category: 'text',
          primaryRole: 'chat',
          costTier: 'low',
          latencyTier: 'medium',
          contextWindow: 4096,
          capabilities: { supportsChat: true, supportsText: true },
          estimatedUnitCost: null,
          qualityTier: 'standard',
          source: 'provider_api',
          catalogCompleteness: 'partial_from_provider_api',
          isLiveDiscovered: true,
          modelOwner: 'owner',
          providerRawType: 'model',
          providerRawCategory: '',
          notes: 'large metadata test',
          rawMetadata: { payload: 'x'.repeat(600_000) },
          discoveredAt: new Date().toISOString(),
          lastSyncedAt: new Date().toISOString(),
          pricingSource: 'unknown',
          pricingConfidence: 'unknown',
          pricingUnit: '',
          pricingCurrency: '',
          pricingRawMetadata: { pricePayload: 'y'.repeat(600_000) },
          lastPricingSyncedAt: null,
          pricingBlocker: 'pricing_unknown',
        },
        {
          provider: 'together',
          modelId: 'failing-model',
          displayName: 'Failing Model',
          family: 'owner',
          category: 'text',
          primaryRole: 'chat',
          costTier: 'low',
          latencyTier: 'medium',
          contextWindow: 4096,
          capabilities: { supportsChat: true, supportsText: true },
          estimatedUnitCost: null,
          qualityTier: 'standard',
          source: 'provider_api',
          catalogCompleteness: 'partial_from_provider_api',
          isLiveDiscovered: true,
          modelOwner: 'owner',
          providerRawType: 'model',
          providerRawCategory: '',
          notes: 'failing row test',
          rawMetadata: {},
          discoveredAt: new Date().toISOString(),
          lastSyncedAt: new Date().toISOString(),
          pricingSource: 'unknown',
          pricingConfidence: 'unknown',
          pricingUnit: '',
          pricingCurrency: '',
          pricingRawMetadata: {},
          lastPricingSyncedAt: null,
          pricingBlocker: 'pricing_unknown',
        },
      ],
    })

    expect(result).toMatchObject({
      providerKey: 'together',
      totalFetched: 2,
      created: 1,
      updated: 0,
      failedRows: 1,
    })
    expect(result.errors[0]).toMatchObject({ modelId: 'failing-model' })
    expect(result.errors[0].message).not.toContain('secret-token')
    const firstCreateData = prismaMock.modelRegistryEntry.create.mock.calls[0][0].data
    expect(JSON.parse(firstCreateData.rawMetadata)).toMatchObject({ summarized: true, truncated: true })
    expect(JSON.parse(firstCreateData.pricingRawMetadata)).toMatchObject({ summarized: true, truncated: true })
    expect(firstCreateData.notes).toContain('raw_metadata_truncated')
    expect(firstCreateData.pricingBlocker).toContain('pricing_raw_metadata_truncated')
  })

  it('Together discovery returns all API models, captures pricing, and does not claim full video/audio completeness', async () => {
    const togetherModels = Array.from({ length: 260 }, (_, index) => ({
      id: index % 5 === 0 ? `owner/image-${index}` : `owner/text-${index}`,
      type: index % 5 === 0 ? 'image' : index % 7 === 0 ? 'embedding' : 'chat',
      display_name: `Together ${index}`,
      organization: index % 2 === 0 ? 'qwen' : 'meta',
      context_length: 8192,
      pricing: { prompt: 0.000001, unit: 'token', currency: 'usd' },
    }))
    vi.stubGlobal('fetch', vi.fn().mockResolvedValue(jsonResponse(togetherModels)))

    const result = await discoverTogetherModels('together-secret')

    expect(result.totalDiscovered).toBe(260)
    expect(result.models).toHaveLength(260)
    expect(result.source).toBe('provider_api')
    expect(result.catalogCompleteness).toBe('partial_from_provider_api')
    expect(result.models[0]).toMatchObject({
      provider: 'together',
      source: 'provider_api',
      pricingSource: 'provider_api',
      pricingConfidence: 'known',
      pricingUnit: 'token',
      pricingCurrency: 'usd',
    })
    expect(new Set(result.models.map((model) => model.provider))).toEqual(new Set(['together']))
    expect(new Set(result.models.map((model) => model.modelOwner))).toEqual(new Set(['qwen', 'meta']))
    expect(result.models.some((model) => model.category === 'video')).toBe(false)
  })

  it('DeepInfra discovery maps all returned task categories without claiming complete non-chat coverage', async () => {
    const tasks = [
      'text-generation',
      'text-to-image',
      'text-to-video',
      'text-to-music',
      'text-to-speech',
      'automatic-speech-recognition',
      'feature-extraction',
      'rerank',
      'ocr',
      'code',
    ]
    const deepinfraModels = Array.from({ length: 220 }, (_, index) => ({
      id: `deepinfra/model-${index}`,
      task: tasks[index % tasks.length],
      owned_by: `owner-${index % 3}`,
      max_model_len: 32768,
    }))
    vi.stubGlobal('fetch', vi.fn().mockResolvedValue(jsonResponse({ data: deepinfraModels })))

    const result = await discoverDeepInfraModels('deepinfra-secret')
    const categories = new Set(result.models.map((model) => model.category))
    const roles = new Set(result.models.map((model) => model.primaryRole))

    expect(result.totalDiscovered).toBe(220)
    expect(result.source).toBe('provider_api')
    expect(result.catalogCompleteness).toBe('partial_from_provider_api')
    expect(categories.has('text')).toBe(true)
    expect(categories.has('image')).toBe(true)
    expect(categories.has('video')).toBe(true)
    expect(categories.has('audio')).toBe(true)
    expect(categories.has('embeddings')).toBe(true)
    expect(categories.has('reranking')).toBe(true)
    expect(categories.has('multimodal')).toBe(true)
    expect(roles.has('tts')).toBe(true)
    expect(roles.has('stt')).toBe(true)
    expect(roles.has('ocr')).toBe(true)
  })

  it('GenX discovery sweeps categories, follows pagination, dedupes IDs, and marks partial without completion proof', async () => {
    const fetchMock = vi.fn(async (url) => {
      const parsed = new URL(url)
      const category = parsed.searchParams.get('category') || 'root'
      const cursor = parsed.searchParams.get('cursor')
      if (category === 'video' && !cursor) {
        return jsonResponse({
          data: Array.from({ length: 10 }, (_, index) => ({ id: `video-${index}`, category: 'video' })),
          next_cursor: 'page-2',
        })
      }
      if (category === 'video' && cursor === 'page-2') {
        return jsonResponse({ data: Array.from({ length: 10 }, (_, index) => ({ id: `video-${index + 10}`, category: 'video' })) })
      }
      const models = Array.from({ length: 8 }, (_, index) => ({
        id: index === 0 ? 'shared-model' : `${category}-${index}`,
        category,
      }))
      return jsonResponse({ models })
    })
    vi.stubGlobal('fetch', fetchMock)

    const result = await discoverGenXModels('genx-secret', 'https://query.genx.sh')
    const ids = new Set(result.models.map((model) => model.modelId))

    expect(fetchMock).toHaveBeenCalledWith(expect.stringContaining('/api/v1/models'), expect.anything())
    expect(fetchMock).toHaveBeenCalledWith(expect.stringContaining('category=video'), expect.anything())
    expect(fetchMock).toHaveBeenCalledWith(expect.stringContaining('category=image'), expect.anything())
    expect(fetchMock).toHaveBeenCalledWith(expect.stringContaining('category=avatar'), expect.anything())
    expect(fetchMock).toHaveBeenCalledWith(expect.stringContaining('category=audio'), expect.anything())
    expect(fetchMock).toHaveBeenCalledWith(expect.stringContaining('category=voice'), expect.anything())
    expect(fetchMock).toHaveBeenCalledWith(expect.stringContaining('category=multimodal'), expect.anything())
    expect(result.totalDiscovered).toBe(ids.size)
    expect(result.totalDiscovered).toBeGreaterThan(60)
    expect(result.catalogCompleteness).toBe('partial_from_provider_api')
    expect(result.models.some((model) => model.category === 'video')).toBe(true)
    expect(result.models.some((model) => model.category === 'image')).toBe(true)
    expect(result.models.some((model) => model.primaryRole === 'avatar_generation')).toBe(true)
    expect(result.models.some((model) => model.category === 'audio')).toBe(true)
  })

  it('GenX discovery uses the existing runtime base URL default when no DB baseUrl is configured', async () => {
    const fetchMock = vi.fn().mockResolvedValue(jsonResponse({ models: [{ id: 'seedance-v1-fast', category: 'video' }] }))
    vi.stubGlobal('fetch', fetchMock)

    await discoverGenXModels('genx-secret')

    expect(fetchMock.mock.calls[0][0]).toContain('https://query.genx.sh/api/v1/models')
  })

  it('GenX fetch failure returns safe diagnostics without crashing or exposing keys', async () => {
    vi.stubGlobal('fetch', vi.fn().mockRejectedValue(new Error('getaddrinfo ENOTFOUND query.genx.sh genx-secret')))

    const result = await discoverGenXModels('genx-secret', 'https://query.genx.sh')

    expect(result).toMatchObject({
      provider: 'genx',
      totalDiscovered: 0,
      source: 'provider_api_failed',
      catalogCompleteness: 'discovery_failed',
    })
    expect(result.error).toContain('/api/v1/models')
    expect(result.error).toContain('host=query.genx.sh')
    expect(result.error).not.toContain('genx-secret')
  })

  it('Groq discovery returns all models and maps STT/TTS/vision/tool capabilities', async () => {
    const groqModels = Array.from({ length: 20 }, (_, index) => ({
      id: [
        'whisper-large-v3',
        'playai-tts',
        'llama-3.2-vision-preview',
        'compound-beta-tool',
      ][index] || `llama-model-${index}`,
      owned_by: 'groq',
      context_window: 8192,
      capabilities: index === 4 ? { structured_output: true, tool_use: true } : {},
    }))
    vi.stubGlobal('fetch', vi.fn().mockResolvedValue(jsonResponse({ data: groqModels, has_more: false })))

    const result = await discoverGroqModels('groq-secret')

    expect(result.totalDiscovered).toBe(20)
    expect(result.totalDiscovered).toBeGreaterThan(7)
    expect(result.models.find((model) => model.modelId === 'whisper-large-v3')?.capabilities.supportsStt).toBe(true)
    expect(result.models.find((model) => model.modelId === 'playai-tts')?.capabilities.supportsTts).toBe(true)
    expect(result.models.find((model) => model.modelId === 'llama-3.2-vision-preview')?.capabilities.supportsMultimodal).toBe(true)
    expect(result.models.find((model) => model.modelId === 'compound-beta-tool')?.capabilities.supportsToolUse).toBe(true)
  })

  it('GenX pricing refresh updates catalog rows and keeps credit-only pricing out of fake USD estimates', async () => {
    vi.stubGlobal('fetch', vi.fn().mockResolvedValue(jsonResponse({
      pricing: {
        'seedance-v1-fast': { input: 12, unit: 'genx_credits_per_second', currency: 'genx_credits', metadata: 'z'.repeat(600_000) },
      },
    })))
    prismaMock.modelRegistryEntry.findMany.mockResolvedValue([
      modelRow({ id: 1, modelId: 'seedance-v1-fast' }),
      modelRow({ id: 2, modelId: 'missing-price-model' }),
    ])
    prismaMock.modelRegistryEntry.update.mockResolvedValue({})

    const pricing = await discoverGenXPricing('genx-secret', 'https://query.genx.sh')
    const update = await updateGenXPricingMetadata(pricing)

    expect(update).toMatchObject({ updated: 2, missingPricingCount: 1, pricingKnownCount: 0, pricingUnknownCount: 2, source: 'provider_api' })
    expect(pricing.pricing['seedance-v1-fast']).toMatchObject({
      currency: 'genx_credits',
      usdEstimateCents: null,
      pricingConfidence: 'unknown',
      pricingBlocker: 'genx_pricing_not_usd',
    })
    expect(prismaMock.modelRegistryEntry.update).toHaveBeenCalledWith(expect.objectContaining({
      where: { id: 1 },
      data: expect.objectContaining({
        pricingSource: 'provider_api',
        pricingConfidence: 'unknown',
        pricingUnit: 'genx_credits_per_second',
        pricingCurrency: 'genx_credits',
        estimatedUnitCost: null,
        pricingBlocker: expect.stringContaining('genx_pricing_not_usd'),
      }),
    }))
    expect(prismaMock.modelRegistryEntry.update).toHaveBeenCalledWith(expect.objectContaining({
      where: { id: 2 },
      data: expect.objectContaining({
        pricingSource: 'unknown',
        estimatedUnitCost: null,
        pricingBlocker: 'genx_pricing_missing_for_model',
      }),
    }))
  })

  it('GenX pricing entries create catalog rows when model discovery returned zero', async () => {
    vi.stubGlobal('fetch', vi.fn().mockResolvedValue(jsonResponse({
      pricing: {
        'seedance-v1-fast': { input: 12, unit: 'genx_credits_per_second', currency: 'genx_credits', category: 'video', provider: 'bytedance', name: 'Seedance Fast' },
        'genxlm-pro-v1-img': { input: 8, unit: 'genx_credits_per_image', currency: 'genx_credits', category: 'image', provider: 'xai', name: 'GenXLM Image' },
        'genxlm-voice-v1': { input: 4, unit: 'genx_credits_per_request', currency: 'genx_credits', category: 'voice', provider: 'genx', name: 'GenX Voice' },
        'genxlm-pro-v1-tr': { input: 3, unit: 'genx_credits_per_minute', currency: 'genx_credits', category: 'transcription', provider: 'genx', name: 'GenX Transcription' },
        'kling-avatar-v2-pro': { input: 20, unit: 'genx_credits_per_second', currency: 'genx_credits', category: 'video', provider: 'kling', name: 'Kling Avatar Pro' },
      },
    })))
    prismaMock.modelRegistryEntry.findMany.mockResolvedValue([])
    prismaMock.modelRegistryEntry.create.mockResolvedValue({})

    const pricing = await discoverGenXPricing('genx-secret', 'https://query.genx.sh')
    const update = await updateGenXPricingMetadata(pricing)
    const createdRows = prismaMock.modelRegistryEntry.create.mock.calls.map((call) => call[0].data)

    expect(update).toMatchObject({
      updated: 0,
      createdFromPricing: 5,
      pricingKnownCount: 0,
      pricingUnknownCount: 5,
      catalogSource: 'provider_api_pricing_fallback',
    })
    expect(new Set(createdRows.map((row) => row.provider))).toEqual(new Set(['genx']))
    expect(new Set(createdRows.map((row) => row.modelOwner))).toEqual(new Set(['bytedance', 'xai', 'genx', 'kling']))
    expect(createdRows.find((row) => row.modelId === 'seedance-v1-fast')).toMatchObject({
      category: 'video',
      primaryRole: 'video_generation',
      supportsVideoGeneration: true,
      pricingConfidence: 'unknown',
      pricingCurrency: 'genx_credits',
      estimatedUnitCost: null,
      pricingBlocker: expect.stringContaining('genx_pricing_not_usd'),
    })
    expect(createdRows.find((row) => row.modelId === 'genxlm-pro-v1-img')).toMatchObject({
      category: 'image',
      primaryRole: 'image_generation',
      supportsImageGeneration: true,
    })
    expect(createdRows.find((row) => row.modelId === 'genxlm-voice-v1')).toMatchObject({
      category: 'audio',
      primaryRole: 'tts',
      supportsTts: true,
    })
    expect(createdRows.find((row) => row.modelId === 'genxlm-pro-v1-tr')).toMatchObject({
      category: 'audio',
      primaryRole: 'stt',
      supportsStt: true,
    })
    expect(createdRows.find((row) => row.modelId === 'kling-avatar-v2-pro')).toMatchObject({
      provider: 'genx',
      modelOwner: 'kling',
      primaryRole: 'avatar_generation',
      supportsVideoGeneration: true,
    })
  })

  it('GenX pricing refresh route exposes createdFromPricing for pricing fallback rows', () => {
    const routeSource = fs.readFileSync(path.join(ROOT, 'apps/api/src/routes/model-registry.ts'), 'utf8')

    expect(routeSource).toContain('upsertGenXPricingCatalog')
    expect(routeSource).toContain('createdFromPricing')
    expect(routeSource).toContain('catalogSource')
  })

  it('GenX pricing fetch failure returns safe diagnostics and no fake prices', async () => {
    vi.stubGlobal('fetch', vi.fn().mockRejectedValue(new Error('TLS failed for genx-secret')))

    const pricing = await discoverGenXPricing('genx-secret', 'https://query.genx.sh')

    expect(pricing).toMatchObject({
      pricing: {},
      source: 'provider_api_failed',
    })
    expect(pricing.error).toContain('/api/v1/account/pricing')
    expect(pricing.error).toContain('host=query.genx.sh')
    expect(pricing.error).not.toContain('genx-secret')
  })

  it('runtime selector blocks unknown-cost media for standard automatic selection and excludes MiMo', async () => {
    prismaMock.modelRegistryEntry.findMany.mockResolvedValue([
      modelRow({ provider: 'genx', modelId: 'unknown-video', supportsVideoGeneration: true, estimatedUnitCost: null, pricingSource: 'unknown', pricingConfidence: 'unknown' }),
      modelRow({ provider: 'together', modelId: 'priced-video', supportsVideoGeneration: true, estimatedUnitCost: 75, pricingSource: 'provider_api', pricingConfidence: 'known', pricingBlocker: '' }),
      modelRow({ provider: 'mimo', modelId: 'mimo-coder', supportsVideoGeneration: true, estimatedUnitCost: 1, pricingSource: 'provider_api', pricingConfidence: 'known' }),
    ])
    prismaMock.aiProvider.findMany.mockResolvedValue([
      { providerKey: 'genx', enabled: true, healthStatus: 'live' },
      { providerKey: 'together', enabled: true, healthStatus: 'live' },
      { providerKey: 'mimo', enabled: false, healthStatus: 'runtime_restricted' },
    ])

    const selection = await selectRuntimeModel('video_generation', { qualityTier: 'standard' })

    expect(selection.selected).toMatchObject({ provider: 'together', model: 'priced-video' })
    expect(selection.rejected).toContainEqual({ provider: 'genx', model: 'unknown-video', reason: 'unknown_pricing_blocks_standard_auto_selection' })
    expect(selection.selected?.provider).not.toBe('mimo')
    expect(selection.fallbacks.map((candidate) => candidate.provider)).not.toContain('mimo')
  })

  it('capability grouping reports pricing blockers and separates catalog from executable/proven truth', async () => {
    const allModels = [
      modelRow({ provider: 'genx', modelId: 'grok-imagine-video', estimatedUnitCost: null, pricingSource: 'provider_api', pricingConfidence: 'unknown', source: 'provider_api', isLiveDiscovered: true }),
      modelRow({ provider: 'together', modelId: 'priced-video-a', estimatedUnitCost: 75, pricingSource: 'provider_api', pricingConfidence: 'known', pricingBlocker: '', source: 'provider_api', isLiveDiscovered: true }),
      modelRow({ provider: 'together', modelId: 'priced-video-b', estimatedUnitCost: 80, pricingSource: 'provider_api', pricingConfidence: 'known', pricingBlocker: '', source: 'provider_api', isLiveDiscovered: true }),
      modelRow({ provider: 'mimo', modelId: 'mimo-coder', estimatedUnitCost: null, pricingSource: 'unknown', pricingConfidence: 'unknown', source: 'curated_seed', isLiveDiscovered: false }),
    ]
    const providers = [
      { providerKey: 'genx', enabled: true, healthStatus: 'live' },
      { providerKey: 'together', enabled: true, healthStatus: 'live' },
      { providerKey: 'mimo', enabled: false, healthStatus: 'runtime_restricted' },
    ]
    const proofStatus = {
      providers: ['genx', 'groq', 'together', 'mimo', 'deepinfra'],
      provenCapabilities: [{ capability: 'video_generation', status: 'proven', provider: 'genx', model: 'grok-imagine-video', artifactRequired: true, proofLevel: 'live_external_app_job_with_artifact_download', readyForDashboardExecution: true, description: 'test' }],
      unprovenCapabilities: [],
      evidenceAvailable: true,
      summary: { provenCount: 1, providerCount: 5, lastUpdatedFrom: 'canonical-truth', source: 'backend-runtime-proof-status' },
    }

    const summary = buildCapabilityGroupSummary('video_generation', allModels, providers, proofStatus)

    expect(summary).toMatchObject({
      totalAvailableModels: 4,
      modelsByProvider: { genx: 1, together: 2, mimo: 1 },
      liveDiscoveredCount: 3,
      providerCatalogCount: 3,
      curatedFallbackCount: 1,
      pricingKnownCount: 2,
      pricingUnknownCount: 2,
      executorAdapterImplementedCount: 1,
      executableModels: 1,
      liveJobProvenCount: 1,
      provenModels: 1,
      dashboardReadyCount: 1,
      dashboardReadyModels: 1,
      standardEligibleCount: 0,
      premiumEligibleCount: 0,
      blockedUnknownPricingCount: 1,
    })
    expect(summary.missingExecutorBlockers).toContain('video_generation: 1 media model(s) blocked by unknown pricing')
    expect(summary.missingExecutorBlockers).toContain('together: discovered_but_no_executor_adapter for video_generation (2 model(s))')
    expect(summary.missingExecutorBlockers).toContain('mimo: coding_tool_only, not normal runtime')
  })

  it('separates discovery, provider health, and capability proof truth', () => {
    const model = { isLiveDiscovered: true, primaryRole: 'video_generation' }
    const provider = { healthStatus: 'live' }
    const capabilityProof = { status: 'unproven', readyForDashboardExecution: false }

    expect(model.isLiveDiscovered).toBe(true)
    expect(provider.healthStatus).toBe('live')
    expect(capabilityProof.status).not.toBe('proven')
    expect(capabilityProof.readyForDashboardExecution).toBe(false)
  })

  it('does not expose secrets or user provider/model selectors in catalog shapes', () => {
    const catalogEntry = {
      provider: 'groq',
      modelId: 'llama-3.3-70b',
      displayName: 'Llama 3.3 70B',
      pricingSource: 'provider_api',
    }
    const routeShape = { capability: 'video_generation', qualityTier: 'standard' }
    expect(catalogEntry).not.toHaveProperty('apiKey')
    expect(catalogEntry).not.toHaveProperty('secret')
    expect(catalogEntry).not.toHaveProperty('token')
    expect(routeShape).not.toHaveProperty('provider')
    expect(routeShape).not.toHaveProperty('model')
  })
})
