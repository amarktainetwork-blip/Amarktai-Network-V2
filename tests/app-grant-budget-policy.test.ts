import { describe, expect, it } from 'vitest'
import {
  evaluateOrchestra,
  checkCandidateEligibility,
  mapBudgetPolicyToRoutingMode,
  getMixPolicyStepMode,
  checkBudgetConstraints,
  meetsQualityFloor,
  type OrchestraCandidate,
  type OrchestraRequest,
  type AppCapabilityGrantContext,
  type CapabilityKey,
  type ProviderKey,
} from '../packages/core/src/index.ts'

function makeCandidate(overrides: Partial<OrchestraCandidate> = {}): OrchestraCandidate {
  return {
    provider: 'groq' as ProviderKey,
    model: 'llama-3.3-70b-versatile',
    displayName: 'Groq Llama 3.3 70B',
    capability: 'chat' as CapabilityKey,
    executorId: 'groq.chat',
    providerConfigured: true,
    providerEnabled: true,
    providerHealth: 'live',
    providerHealthReady: true,
    providerAccountAllowed: true,
    providerPolicyAllowed: true,
    modelLifecycleAllowed: true,
    adapterSupported: true,
    executorSupported: true,
    requestShapeKnown: true,
    responseShapeKnown: true,
    infrastructureReady: true,
    executionReady: true,
    endpointReady: true,
    databaseReady: true,
    queueReady: true,
    modelCompatible: true,
    liveProven: false,
    estimatedCost: 0.0001,
    costTier: 'low',
    qualityTier: 'balanced',
    latencyTier: 'low',
    pricingConfidence: 'known',
    score: 0,
    scoreBreakdown: {},
    blockers: [],
    ...overrides,
  }
}

function makeRequest(overrides: Partial<OrchestraRequest> = {}): OrchestraRequest {
  return {
    capability: 'chat' as CapabilityKey,
    ...overrides,
  }
}

function makeAppGrant(overrides: Partial<AppCapabilityGrantContext> = {}): AppCapabilityGrantContext {
  return {
    appSlug: 'test-app',
    capability: 'chat' as CapabilityKey,
    enabled: true,
    qualityFloor: 'balanced',
    budgetPolicy: 'balanced',
    maxCostPerRequest: 0,
    maxCostPerWorkflow: 0,
    latencyPreference: 'medium',
    allowFallback: true,
    maxFallbackAttempts: 3,
    liveProofRequired: false,
    approvalRequired: false,
    artifactRead: true,
    artifactWrite: true,
    memoryRead: false,
    memoryWrite: false,
    ragNamespaces: [],
    policyProfile: 'standard',
    adultPermission: false,
    dataRetentionPolicy: 'default',
    passthroughModelAllowed: false,
    providerResidencyConstraints: [],
    ...overrides,
  }
}

describe('App Grant and Budget Policy', () => {
  describe('App grant eligibility', () => {
    it('rejects when app capability is disabled', () => {
      const candidate = makeCandidate()
      const grant = makeAppGrant({ enabled: false })
      const blockers = checkCandidateEligibility(candidate, 'chat', grant)
      expect(blockers).toContain('app_capability_disabled')
    })

    it('rejects when approval is required', () => {
      const candidate = makeCandidate()
      const grant = makeAppGrant({ approvalRequired: true })
      const blockers = checkCandidateEligibility(candidate, 'chat', grant)
      expect(blockers).toContain('app_approval_required')
    })

    it('rejects when live proof required but candidate not proven', () => {
      const candidate = makeCandidate({ liveProven: false })
      const grant = makeAppGrant({ liveProofRequired: true })
      const blockers = checkCandidateEligibility(candidate, 'chat', grant)
      expect(blockers).toContain('app_live_proof_required')
    })

    it('allows when live proof required and candidate is proven', () => {
      const candidate = makeCandidate({ liveProven: true })
      const grant = makeAppGrant({ liveProofRequired: true })
      const blockers = checkCandidateEligibility(candidate, 'chat', grant)
      expect(blockers).not.toContain('app_live_proof_required')
    })

    it('rejects adult capability without adult permission', () => {
      const candidate = makeCandidate()
      const grant = makeAppGrant({ adultPermission: false })
      const blockers = checkCandidateEligibility(candidate, 'adult_image', grant)
      expect(blockers).toContain('app_adult_permission_required')
    })

    it('allows adult capability with adult permission', () => {
      const candidate = makeCandidate()
      const grant = makeAppGrant({ adultPermission: true })
      const blockers = checkCandidateEligibility(candidate, 'adult_image', grant)
      expect(blockers).not.toContain('app_adult_permission_required')
    })

    it('rejects provider not in residency constraints', () => {
      const candidate = makeCandidate({ provider: 'groq' as ProviderKey })
      const grant = makeAppGrant({ providerResidencyConstraints: ['together'] })
      const blockers = checkCandidateEligibility(candidate, 'chat', grant)
      expect(blockers).toContain('app_provider_residency_constraint')
    })

    it('allows provider in residency constraints', () => {
      const candidate = makeCandidate({ provider: 'groq' as ProviderKey })
      const grant = makeAppGrant({ providerResidencyConstraints: ['groq', 'together'] })
      const blockers = checkCandidateEligibility(candidate, 'chat', grant)
      expect(blockers).not.toContain('app_provider_residency_constraint')
    })
  })

  describe('Budget policy mapping', () => {
    it('maps premium to quality routing mode', () => {
      expect(mapBudgetPolicyToRoutingMode('premium')).toBe('quality')
    })

    it('maps budget to economy routing mode', () => {
      expect(mapBudgetPolicyToRoutingMode('budget')).toBe('economy')
    })

    it('maps mix to balanced routing mode', () => {
      expect(mapBudgetPolicyToRoutingMode('mix')).toBe('balanced')
    })

    it('getMixPolicyStepMode escalates quality-critical steps', () => {
      expect(getMixPolicyStepMode('narration', 'premium')).toBe('quality')
      expect(getMixPolicyStepMode('hero_clip', 'balanced')).toBe('balanced')
      expect(getMixPolicyStepMode('assembly', 'premium')).toBe('quality')
    })

    it('getMixPolicyStepMode uses economy for background steps', () => {
      expect(getMixPolicyStepMode('indexing', 'balanced')).toBe('economy')
      expect(getMixPolicyStepMode('classification', 'premium')).toBe('economy')
    })
  })

  describe('Budget constraints', () => {
    it('allows request within per-request limit', () => {
      const result = checkBudgetConstraints(50, 100, 0, 0)
      expect(result.allowed).toBe(true)
    })

    it('rejects request exceeding per-request limit', () => {
      const result = checkBudgetConstraints(150, 100, 0, 0)
      expect(result.allowed).toBe(false)
      expect(result.reason).toContain('per-request limit')
    })

    it('allows request within workflow limit', () => {
      const result = checkBudgetConstraints(50, 0, 1000, 500)
      expect(result.allowed).toBe(true)
      expect(result.remainingBudgetCents).toBe(500)
    })

    it('rejects request exceeding workflow limit', () => {
      const result = checkBudgetConstraints(600, 0, 1000, 500)
      expect(result.allowed).toBe(false)
      expect(result.reason).toContain('workflow limit')
    })

    it('allows unlimited when max is 0', () => {
      const result = checkBudgetConstraints(999999, 0, 0, 0)
      expect(result.allowed).toBe(true)
    })
  })

  describe('Quality floor', () => {
    it('rejects candidate below quality floor', () => {
      expect(meetsQualityFloor('budget', 'premium')).toBe(false)
    })

    it('allows candidate meeting quality floor', () => {
      expect(meetsQualityFloor('premium', 'premium')).toBe(true)
      expect(meetsQualityFloor('balanced', 'budget')).toBe(true)
    })
  })

  describe('Orchestra with app grant', () => {
    it('respects app grant fallback limits', () => {
      const candidates = [
        makeCandidate({ provider: 'groq' as ProviderKey, model: 'primary' }),
        makeCandidate({ provider: 'together' as ProviderKey, model: 'fallback-1' }),
        makeCandidate({ provider: 'deepinfra' as ProviderKey, model: 'fallback-2' }),
      ]
      const grant = makeAppGrant({ allowFallback: true, maxFallbackAttempts: 1 })
      const decision = evaluateOrchestra(makeRequest({ appGrant: grant }), candidates)

      expect(decision.fallbackRoutes.length).toBeLessThanOrEqual(1)
    })

    it('disables fallbacks when app grant disallows', () => {
      const candidates = [
        makeCandidate({ provider: 'groq' as ProviderKey, model: 'primary' }),
        makeCandidate({ provider: 'together' as ProviderKey, model: 'fallback-1' }),
      ]
      const grant = makeAppGrant({ allowFallback: false })
      const decision = evaluateOrchestra(makeRequest({ appGrant: grant }), candidates)

      expect(decision.fallbackRoutes).toHaveLength(0)
    })

    it('rejects candidates exceeding app cost limit', () => {
      const candidates = [
        makeCandidate({ provider: 'groq' as ProviderKey, model: 'expensive', estimatedCost: 100 }),
        makeCandidate({ provider: 'together' as ProviderKey, model: 'cheap', estimatedCost: 0.001 }),
      ]
      const grant = makeAppGrant({ maxCostPerRequest: 1 }) // 1 cent limit
      const decision = evaluateOrchestra(makeRequest({ appGrant: grant }), candidates)

      // Both candidates should be rejected since costs are in dollars, not cents
      // The cheap model at 0.001 dollars = 0.1 cents should pass
      expect(decision.selectedModel).toBe('cheap')
    })
  })
})
