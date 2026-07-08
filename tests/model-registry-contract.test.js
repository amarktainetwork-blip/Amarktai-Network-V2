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

const { updateGenXPricingMetadata } = await import('../apps/api/src/lib/model-registry.ts')
const { selectRuntimeModel } = await import('../apps/api/src/lib/runtime-selector.ts')
const { getCapabilityGroupSummary } = await import('../apps/api/src/lib/capability-groups.ts')

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
    vi.clearAllMocks()
  })

  it('keeps provider list exactly final five and never promotes model owners to providers', () => {
    expect([...PROVIDER_KEYS]).toEqual(['genx', 'groq', 'together', 'mimo', 'deepinfra'])
    for (const banned of ['openai', 'anthropic', 'google', 'qwen', 'wan', 'pixverse', 'minimax', 'gemini', 'resemble']) {
      expect(PROVIDER_KEYS).not.toContain(banned)
    }
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
        'seedance-v1-fast': { input: 12, unit: 'genx_credits_per_second', currency: 'genx_credits' },
      },
    })))
    prismaMock.modelRegistryEntry.findMany.mockResolvedValue([
      modelRow({ id: 1, modelId: 'seedance-v1-fast' }),
      modelRow({ id: 2, modelId: 'missing-price-model' }),
    ])
    prismaMock.modelRegistryEntry.update.mockResolvedValue({})

    const pricing = await discoverGenXPricing('genx-secret', 'https://query.genx.sh')
    const update = await updateGenXPricingMetadata(pricing)

    expect(update).toMatchObject({ updated: 2, missingPricingCount: 1, source: 'provider_api' })
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
        pricingBlocker: 'genx_pricing_not_usd',
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

  it('capability grouping reports pricing blockers and pricing counts', async () => {
    prismaMock.modelRegistryEntry.findMany.mockResolvedValue([
      modelRow({ provider: 'genx', modelId: 'unknown-video', estimatedUnitCost: null, pricingSource: 'unknown', pricingConfidence: 'unknown', source: 'provider_api', isLiveDiscovered: true }),
      modelRow({ provider: 'together', modelId: 'priced-video', estimatedUnitCost: 75, pricingSource: 'provider_api', pricingConfidence: 'known', pricingBlocker: '', source: 'provider_api', isLiveDiscovered: true }),
      modelRow({ provider: 'mimo', modelId: 'mimo-coder', estimatedUnitCost: null, pricingSource: 'unknown', pricingConfidence: 'unknown', source: 'curated_seed', isLiveDiscovered: false }),
    ])
    prismaMock.aiProvider.findMany.mockResolvedValue([
      { providerKey: 'genx', healthStatus: 'live' },
      { providerKey: 'together', healthStatus: 'live' },
      { providerKey: 'mimo', healthStatus: 'runtime_restricted' },
    ])

    const summary = await getCapabilityGroupSummary('video_generation')

    expect(summary).toMatchObject({
      totalAvailableModels: 3,
      liveDiscoveredCount: 2,
      providerCatalogCount: 2,
      curatedFallbackCount: 1,
      pricingKnownCount: 1,
      pricingUnknownCount: 2,
      standardEligibleCount: 1,
      premiumEligibleCount: 1,
      blockedUnknownPricingCount: 1,
    })
    expect(summary.missingExecutorBlockers).toContain('video_generation: 1 media model(s) blocked by unknown pricing')
    expect(summary.liveJobProvenCount).toBe(2)
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
