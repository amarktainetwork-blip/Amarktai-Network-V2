import assert from 'node:assert/strict'
import { readFile } from 'node:fs/promises'
import { describe, it, vi } from 'vitest'
import {
  assertPremiumSpendConfirmed,
  createPremiumSpendDecision,
  rankPremiumGenxModels,
} from '../packages/core/src/premium-media-policy.js'
import {
  estimateGenxCredits,
  genxGetCreditBalance,
  genxGetModelPricing,
  genxGetPricing,
} from '../packages/providers/src/genx-account-client.js'

const jsonResponse = (value: unknown, status = 200) => new Response(JSON.stringify(value), {
  status,
  headers: { 'content-type': 'application/json' },
})

describe('GenX account pricing and wallet preflight', () => {
  it('reads nested credit balance, reserve, tier, and sends both supported auth headers', async () => {
    const fetchImpl = vi.fn(async (url: string | URL | Request, init?: RequestInit) => {
      assert.equal(String(url), 'https://query.genx.sh/api/v1/account/credits')
      const headers = new Headers(init?.headers)
      assert.equal(headers.get('authorization'), 'Bearer gnxk_test')
      assert.equal(headers.get('x-api-key'), 'gnxk_test')
      return jsonResponse({ data: { wallet: { balance: '1250.5', reserved_credits: 50 }, account_tier: 'operator' } })
    }) as unknown as typeof fetch

    const result = await genxGetCreditBalance({ apiKey: 'gnxk_test', baseUrl: 'https://query.genx.sh/', fetchImpl })
    assert.equal(result.balanceCredits, 1250.5)
    assert.equal(result.reservedCredits, 50)
    assert.equal(result.availableCredits, 1200.5)
    assert.equal(result.tier, 'operator')
  })

  it('normalizes collection and model pricing responses and estimates per-second spend', async () => {
    const fetchImpl = vi.fn(async (url: string | URL | Request) => {
      if (String(url).endsWith('/api/v1/account/pricing?category=video')) {
        return jsonResponse({ data: { models: [
          { model_id: 'seedance-2.0', category: 'video', pricing: { video_second: { credits: 12, unit: 'video_second' } } },
        ] } })
      }
      return jsonResponse({ data: { category: 'video', pricing: { video_second: { credits: '15', unit: 'video_second' } } } })
    }) as unknown as typeof fetch

    const rows = await genxGetPricing('video', { apiKey: 'key', baseUrl: 'https://query.genx.sh', fetchImpl })
    assert.equal(rows.length, 1)
    assert.equal(rows[0]?.modelId, 'seedance-2.0')
    assert.equal(estimateGenxCredits(rows[0]!, { videoSeconds: 5 }), 60)

    const model = await genxGetModelPricing('kling-v3-pro', { apiKey: 'key', baseUrl: 'https://query.genx.sh', fetchImpl })
    assert.equal(model.modelId, 'kling-v3-pro')
    assert.equal(estimateGenxCredits(model, { videoSeconds: 8 }), 120)
  })

  it('fails closed when credits or pricing are absent', async () => {
    const fetchImpl = vi.fn(async (url: string | URL | Request) => {
      if (String(url).includes('/credits')) return jsonResponse({ data: { status: 'ok' } })
      return jsonResponse({ data: { model_id: 'unknown-model' } })
    }) as unknown as typeof fetch

    await assert.rejects(() => genxGetCreditBalance({ apiKey: 'key', baseUrl: 'https://query.genx.sh', fetchImpl }), /valid non-negative balance/)
    await assert.rejects(() => genxGetModelPricing('unknown-model', { apiKey: 'key', baseUrl: 'https://query.genx.sh', fetchImpl }), /usable rates/)
  })
})

describe('premium GenX model and spend policy', () => {
  it('selects only account-accessible, executable, priced premium GenX families', () => {
    const ranked = rankPremiumGenxModels([
      { provider: 'genx', modelId: 'seedance-2.0-reference', capabilities: ['video_generation'], qualityTier: 'premium', costTier: 'premium', liveProven: true, accountAccessible: true, executable: true, pricingKnown: true, estimatedCredits: 180 },
      { provider: 'genx', modelId: 'kling-v3-pro', capabilities: ['video_generation'], qualityTier: 'premium', costTier: 'premium', liveProven: false, accountAccessible: true, executable: true, pricingKnown: true, estimatedCredits: 160 },
      { provider: 'genx', modelId: 'veo-3.1-fast', capabilities: ['video_generation'], qualityTier: 'premium', costTier: 'high', liveProven: true, accountAccessible: true, executable: true, pricingKnown: true, estimatedCredits: 40 },
      { provider: 'genx', modelId: 'pixverse-v6', capabilities: ['video_generation'], qualityTier: 'premium', costTier: 'premium', liveProven: true, accountAccessible: false, executable: true, pricingKnown: true, estimatedCredits: 90 },
      { provider: 'together', modelId: 'ByteDance/Seedance-2.0', capabilities: ['video_generation'], qualityTier: 'premium', costTier: 'premium', liveProven: true, accountAccessible: true, executable: true, pricingKnown: true, estimatedCredits: 80 },
      { provider: 'genx', modelId: 'unpriced-premium-video', capabilities: ['video_generation'], qualityTier: 'premium', costTier: 'premium', liveProven: true, accountAccessible: true, executable: true, pricingKnown: false, estimatedCredits: null },
    ], { role: 'video_scene', capability: 'video_generation', candidateLimit: 4 })

    assert.deepEqual(ranked.map((item) => item.modelId), ['seedance-2.0-reference', 'kling-v3-pro'])
    assert.ok(ranked[0]!.premiumScore > ranked[1]!.premiumScore)
  })

  it('requires known pricing, a hard ceiling, reserve coverage, and an explicit confirmation token', () => {
    const allowed = createPremiumSpendDecision({
      availableCredits: 2000,
      reserveCredits: 200,
      maxCredits: 1000,
      lines: [
        { role: 'hero_image', modelId: 'nano-banana-pro', quantity: 4, estimatedCreditsPerUnit: 20 },
        { role: 'video_scene', modelId: 'seedance-2.0-reference', quantity: 6, estimatedCreditsPerUnit: 100 },
        { role: 'full_song', modelId: 'lyria-3-pro-preview', quantity: 1, estimatedCreditsPerUnit: 150 },
      ],
    })
    assert.equal(allowed.allowed, true)
    assert.equal(allowed.estimatedCredits, 830)
    assert.doesNotThrow(() => assertPremiumSpendConfirmed(allowed, 'CONFIRM_PREMIUM_GENX_SPEND'))
    assert.throws(() => assertPremiumSpendConfirmed(allowed, 'YES'), /confirmation token/)

    const blocked = createPremiumSpendDecision({
      availableCredits: 900,
      reserveCredits: 200,
      maxCredits: 750,
      lines: [
        { role: 'video_scene', modelId: 'seedance-2.0-reference', quantity: 6, estimatedCreditsPerUnit: 100 },
        { role: 'full_song', modelId: 'lyria-3-pro-preview', quantity: 1, estimatedCreditsPerUnit: null },
      ],
    })
    assert.equal(blocked.allowed, false)
    assert.ok(blocked.blockers.includes('pricing_unknown:lyria-3-pro-preview'))
    assert.throws(() => assertPremiumSpendConfirmed(blocked, 'CONFIRM_PREMIUM_GENX_SPEND'), /preflight blocked/)
  })

  it('publishes stable package subpaths for later music and advert runners', async () => {
    const corePackage = JSON.parse(await readFile(new URL('../packages/core/package.json', import.meta.url), 'utf8'))
    const providersPackage = JSON.parse(await readFile(new URL('../packages/providers/package.json', import.meta.url), 'utf8'))
    assert.equal(corePackage.exports['./premium-media-policy'].import, './dist/premium-media-policy.js')
    assert.equal(providersPackage.exports['./genx-account-client'].import, './dist/genx-account-client.js')
  })
})
