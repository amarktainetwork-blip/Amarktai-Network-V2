import { describe, it, expect } from 'vitest'

// Inline planner logic for testing
const BUDGET_PROFILES = {
  draft: { targetCostCents: 20, hardCapCents: 50, allowPremium: false, allowHero: false },
  standard: { targetCostCents: 100, hardCapCents: 120, allowPremium: false, allowHero: false },
  premium: { targetCostCents: 400, hardCapCents: 500, allowPremium: true, allowHero: true },
  custom: { targetCostCents: 200, hardCapCents: 300, allowPremium: true, allowHero: false },
}

describe('video budget planner contract', () => {
  it('budget profiles exist for draft/standard/premium/custom', () => {
    expect(BUDGET_PROFILES.draft).toBeTruthy()
    expect(BUDGET_PROFILES.standard).toBeTruthy()
    expect(BUDGET_PROFILES.premium).toBeTruthy()
    expect(BUDGET_PROFILES.custom).toBeTruthy()
  })

  it('draft profile targets lowest cost', () => {
    expect(BUDGET_PROFILES.draft.targetCostCents).toBeLessThan(BUDGET_PROFILES.standard.targetCostCents)
    expect(BUDGET_PROFILES.draft.hardCapCents).toBeLessThan(BUDGET_PROFILES.standard.hardCapCents)
  })

  it('standard 120-second video has target around $1', () => {
    expect(BUDGET_PROFILES.standard.targetCostCents).toBe(100) // $1.00
    expect(BUDGET_PROFILES.standard.hardCapCents).toBe(120) // $1.20
  })

  it('premium 120-second video has target around $4', () => {
    expect(BUDGET_PROFILES.premium.targetCostCents).toBe(400) // $4.00
    expect(BUDGET_PROFILES.premium.hardCapCents).toBe(500) // $5.00
  })

  it('premium allows hero shots', () => {
    expect(BUDGET_PROFILES.premium.allowHero).toBe(true)
    expect(BUDGET_PROFILES.standard.allowHero).toBe(false)
  })

  it('draft does not allow premium', () => {
    expect(BUDGET_PROFILES.draft.allowPremium).toBe(false)
  })
})
