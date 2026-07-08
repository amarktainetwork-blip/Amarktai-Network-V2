import fs from 'node:fs'
import path from 'node:path'
import { describe, expect, it } from 'vitest'
import { getBudgetProfiles, planVideoBudget } from '../apps/api/src/lib/video-planner.ts'

const ROOT = process.cwd()

function candidate(overrides = {}) {
  return {
    provider: 'together',
    model: 'catalog-selected-model',
    displayName: 'Catalog Selected Model',
    costTier: 'low',
    qualityTier: 'standard',
    latencyTier: 'medium',
    estimatedCost: 12,
    pricingSource: 'provider_api',
    pricingConfidence: 'known',
    pricingBlocker: '',
    score: 80,
    reason: 'configured',
    ...overrides,
  }
}

describe('video budget planner contract', () => {
  it('budget profiles exist without claiming exact production prices', () => {
    const profiles = getBudgetProfiles()
    expect(profiles.draft).toBeTruthy()
    expect(profiles.standard).toBeTruthy()
    expect(profiles.premium).toBeTruthy()
    expect(profiles.custom).toBeTruthy()
  })

  it('does not keep hardcoded fake pricing constants or production model choices', () => {
    const source = fs.readFileSync(path.join(ROOT, 'apps/api/src/lib/video-planner.ts'), 'utf8')
    for (const banned of [
      'VIDEO_COST_PER_SECOND',
      'IMAGE_COST',
      'TEXT_COST_PER_1M_TOKENS',
      'wan-ai/Wan2.1-T2V-14B',
      'grok-imagine-video',
      'music-gen',
      'playai-tts',
      'llama-3.3-70b-versatile',
      'llama-3.1-8b-instant',
    ]) {
      expect(source).not.toContain(banned)
    }
  })

  it('blocks standard video when required media pricing is unknown', async () => {
    const plan = await planVideoBudget({
      qualityTier: 'standard',
      targetDurationSeconds: 120,
      selectedCandidates: {
        script: candidate({ provider: 'groq', model: 'catalog-script', estimatedCost: 1 }),
        prompts: candidate({ provider: 'groq', model: 'catalog-prompts', estimatedCost: 1 }),
        style_frames: candidate({ provider: 'together', model: 'catalog-image', estimatedCost: null, pricingSource: 'unknown', pricingConfidence: 'unknown', pricingBlocker: 'pricing_unknown' }),
        main_clips: candidate({ provider: 'genx', model: 'catalog-video', estimatedCost: null, pricingSource: 'unknown', pricingConfidence: 'unknown', pricingBlocker: 'genx_pricing_missing_for_model' }),
      },
    })

    expect(plan.estimatedCostCents).toBeNull()
    expect(plan.usdEstimateConfidence).toBe('unknown')
    expect(plan.selectedStrategy).toBe('blocked_pending_pricing')
    expect(plan.blockedReason).toContain('Pricing is unknown')
    expect(plan.blockedReason).toContain('style_frames')
    expect(plan.blockedReason).toContain('main_clips')
    expect(plan.requiresApproval).toBe(false)
  })

  it('premium unknown-cost media requires admin approval/manual pricing', async () => {
    const plan = await planVideoBudget({
      qualityTier: 'premium',
      targetDurationSeconds: 120,
      heroShotCount: 1,
      selectedCandidates: {
        script: candidate({ provider: 'groq', model: 'catalog-script', estimatedCost: 1 }),
        prompts: candidate({ provider: 'groq', model: 'catalog-prompts', estimatedCost: 1 }),
        style_frames: candidate({ provider: 'together', model: 'catalog-image', estimatedCost: 2 }),
        main_clips: candidate({ provider: 'genx', model: 'catalog-video', estimatedCost: null, pricingSource: 'unknown', pricingConfidence: 'unknown' }),
        hero_shots: candidate({ provider: 'genx', model: 'catalog-hero', estimatedCost: null, pricingSource: 'unknown', pricingConfidence: 'unknown' }),
      },
    })

    expect(plan.estimatedCostCents).toBeNull()
    expect(plan.usdEstimateConfidence).toBe('unknown')
    expect(plan.requiresApproval).toBe(true)
    expect(plan.blockedReason).toContain('Admin approval or manual pricing is required')
  })

  it('uses selected candidates from the runtime selector/catalog and totals only known USD pricing', async () => {
    const plan = await planVideoBudget({
      qualityTier: 'standard',
      selectedCandidates: {
        script: candidate({ provider: 'groq', model: 'catalog-script', estimatedCost: 1 }),
        prompts: candidate({ provider: 'groq', model: 'catalog-prompts', estimatedCost: 1 }),
        style_frames: candidate({ provider: 'together', model: 'catalog-style-frame', estimatedCost: 3 }),
        main_clips: candidate({ provider: 'genx', model: 'catalog-main-video', estimatedCost: 75 }),
      },
    })

    expect(plan.estimatedCostCents).toBe(80)
    expect(plan.usdEstimateConfidence).toBe('known')
    expect(plan.blockedReason).toBeNull()
    expect(plan.plannedSteps.find((step) => step.stepKey === 'main_clips')).toMatchObject({
      provider: 'genx',
      model: 'catalog-main-video',
      pricingSource: 'provider_api',
      selectedCandidate: expect.objectContaining({ model: 'catalog-main-video' }),
    })
    expect(plan.plannedSteps.find((step) => step.stepKey === 'assembly')).toMatchObject({
      provider: 'local',
      model: 'ffmpeg',
      estimatedCostCents: 0,
      pricingSource: 'local_free_tool',
    })
  })
})
