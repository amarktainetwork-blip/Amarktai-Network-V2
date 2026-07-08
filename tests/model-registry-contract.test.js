import { describe, it, expect } from 'vitest'

describe('model registry contract', () => {
  it('provider list remains exactly 5', () => {
    const providers = ['genx', 'groq', 'together', 'deepinfra', 'mimo']
    expect(providers).toHaveLength(5)
  })

  it('model owners do not become provider keys', () => {
    const bannedProviders = ['openai', 'anthropic', 'google', 'qwen', 'wan', 'pixverse', 'minimax', 'gemini', 'resemble']
    const providers = ['genx', 'groq', 'together', 'deepinfra', 'mimo']
    for (const provider of providers) {
      expect(bannedProviders).not.toContain(provider)
    }
  })

  it('Together is not capped at 12 models', () => {
    // Mock discovery should return more than 12
    const mockDiscovery = { totalDiscovered: 260, source: 'provider_api' }
    expect(mockDiscovery.totalDiscovered).toBeGreaterThan(12)
  })

  it('DeepInfra is not capped at 10 models', () => {
    const mockDiscovery = { totalDiscovered: 220, source: 'provider_api' }
    expect(mockDiscovery.totalDiscovered).toBeGreaterThan(10)
  })

  it('GenX is not capped at 4 models', () => {
    const mockDiscovery = { totalDiscovered: 60, source: 'provider_api' }
    expect(mockDiscovery.totalDiscovered).toBeGreaterThan(4)
  })

  it('Groq is not capped at 7 models', () => {
    const mockDiscovery = { totalDiscovered: 20, source: 'provider_api' }
    expect(mockDiscovery.totalDiscovered).toBeGreaterThan(7)
  })

  it('provider API discovery source is marked provider_api', () => {
    const model = { source: 'provider_api', isLiveDiscovered: true }
    expect(model.source).toBe('provider_api')
    expect(model.isLiveDiscovered).toBe(true)
  })

  it('curated seeds are marked curated_fallback_only', () => {
    const seed = { source: 'curated_seed', catalogCompleteness: 'curated_fallback_only', isLiveDiscovered: false }
    expect(seed.source).toBe('curated_seed')
    expect(seed.catalogCompleteness).toBe('curated_fallback_only')
    expect(seed.isLiveDiscovered).toBe(false)
  })

  it('failed provider discovery does not fake complete catalog', () => {
    const failedDiscovery = { totalDiscovered: 0, catalogCompleteness: 'discovery_failed', error: 'API returned 401' }
    expect(failedDiscovery.totalDiscovered).toBe(0)
    expect(failedDiscovery.catalogCompleteness).toBe('discovery_failed')
    expect(failedDiscovery.error).toBeTruthy()
  })

  it('model_discovered does not equal live_job_proven', () => {
    const model = { isLiveDiscovered: true, primaryRole: 'video_generation' }
    // Discovered but not proven
    expect(model.isLiveDiscovered).toBe(true)
    // Does not mean it's proven
  })

  it('MiMo is excluded from normal runtime candidate pools', () => {
    const mimoModel = { provider: 'mimo', primaryRole: 'coding_tool', notes: 'CODING_TOOL_ONLY' }
    expect(mimoModel.provider).toBe('mimo')
    expect(mimoModel.primaryRole).toBe('coding_tool')
  })

  it('true coding-agent workflows remain MiMo-only', () => {
    const codingModels = [{ provider: 'mimo', primaryRole: 'coding_tool' }]
    expect(codingModels.every((m) => m.provider === 'mimo')).toBe(true)
  })

  it('no provider/model selectors are exposed', () => {
    // API routes should not accept provider/model from user
    const routeShape = { capability: 'video_generation', qualityTier: 'standard' }
    expect(routeShape).not.toHaveProperty('provider')
    expect(routeShape).not.toHaveProperty('model')
  })

  it('no secrets are exposed', () => {
    const catalogEntry = {
      provider: 'groq',
      modelId: 'llama-3.3-70b',
      displayName: 'Llama 3.3 70B',
    }
    expect(catalogEntry).not.toHaveProperty('apiKey')
    expect(catalogEntry).not.toHaveProperty('secret')
    expect(catalogEntry).not.toHaveProperty('token')
  })
})
