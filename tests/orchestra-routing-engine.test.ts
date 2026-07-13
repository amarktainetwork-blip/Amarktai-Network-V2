import { describe, expect, it } from 'vitest'
import {
  evaluateOrchestra,
  checkCandidateEligibility,
  validateOrchestraRequest,
  ORCHESTRA_BLOCKED_REQUEST_FIELDS,
  type OrchestraCandidate,
  type OrchestraRequest,
  type CapabilityKey,
  type ProviderKey,
} from '../packages/core/src/orchestra.ts'

function makeCandidate(overrides: Partial<OrchestraCandidate> = {}): OrchestraCandidate {
  return {
    provider: 'groq' as ProviderKey,
    model: 'llama-3.3-70b-versatile',
    displayName: 'Groq Llama 3.3 70B',
    capability: 'chat' as CapabilityKey,
    providerConfigured: true,
    providerEnabled: true,
    providerHealth: 'configured',
    providerAccountAllowed: true,
    providerPolicyAllowed: true,
    modelLifecycleAllowed: true,
    adapterSupported: true,
    executorSupported: true,
    requestShapeKnown: true,
    responseShapeKnown: true,
    infrastructureReady: true,
    executionReady: true,
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

describe('Orchestra routing engine', () => {
  describe('eligibility', () => {
    it('rejects disabled provider', () => {
      const candidate = makeCandidate({ providerEnabled: false })
      const blockers = checkCandidateEligibility(candidate, 'chat')
      expect(blockers).toContain('provider_disabled')
    })

    it('rejects account-blocked provider', () => {
      const candidate = makeCandidate({ providerAccountAllowed: false })
      const blockers = checkCandidateEligibility(candidate, 'chat')
      expect(blockers).toContain('provider_account_blocked')
    })

    it('rejects policy-restricted provider', () => {
      const candidate = makeCandidate({ providerPolicyAllowed: false })
      const blockers = checkCandidateEligibility(candidate, 'chat')
      expect(blockers).toContain('provider_policy_restricted')
    })

    it('rejects MiMo for ordinary chat', () => {
      const candidate = makeCandidate({ provider: 'mimo' as ProviderKey })
      const blockers = checkCandidateEligibility(candidate, 'chat')
      expect(blockers).toContain('mimo_coding_tool_only')
    })

    it('allows MiMo for approved coding capabilities', () => {
      const candidate = makeCandidate({ provider: 'mimo' as ProviderKey, providerPolicyAllowed: true })
      const blockers = checkCandidateEligibility(candidate, 'code')
      expect(blockers).not.toContain('mimo_coding_tool_only')
    })

    it('rejects lifecycle-blocked model', () => {
      const candidate = makeCandidate({ modelLifecycleAllowed: false })
      const blockers = checkCandidateEligibility(candidate, 'chat')
      expect(blockers).toContain('model_lifecycle_blocked')
    })

    it('rejects model without adapter support', () => {
      const candidate = makeCandidate({ adapterSupported: false })
      const blockers = checkCandidateEligibility(candidate, 'chat')
      expect(blockers).toContain('adapter_not_supported')
    })

    it('rejects model without executor support', () => {
      const candidate = makeCandidate({ executorSupported: false })
      const blockers = checkCandidateEligibility(candidate, 'chat')
      expect(blockers).toContain('executor_not_supported')
    })

    it('rejects unconfigured provider', () => {
      const candidate = makeCandidate({ providerConfigured: false })
      const blockers = checkCandidateEligibility(candidate, 'chat')
      expect(blockers).toContain('provider_not_configured')
    })

    it('rejects provider with health failed', () => {
      const candidate = makeCandidate({ providerHealth: 'failed' })
      const blockers = checkCandidateEligibility(candidate, 'chat')
      expect(blockers).toContain('provider_health_failed')
    })

    it('rejects provider with runtime_restricted health', () => {
      const candidate = makeCandidate({ providerHealth: 'runtime_restricted' })
      const blockers = checkCandidateEligibility(candidate, 'chat')
      expect(blockers).toContain('provider_runtime_restricted')
    })
  })

  describe('scoring', () => {
    it('produces deterministic decisions for identical input', () => {
      const candidates = [
        makeCandidate({ provider: 'groq' as ProviderKey, model: 'llama-3.3-70b' }),
        makeCandidate({ provider: 'together' as ProviderKey, model: 'mixtral-8x7b' }),
      ]
      const request = makeRequest()

      const decision1 = evaluateOrchestra(request, candidates)
      const decision2 = evaluateOrchestra(request, candidates)

      expect(decision1.selectedProvider).toBe(decision2.selectedProvider)
      expect(decision1.selectedModel).toBe(decision2.selectedModel)
      expect(decision1.score).toBe(decision2.score)
    })

    it('includes score breakdown in decision', () => {
      const candidates = [makeCandidate()]
      const decision = evaluateOrchestra(makeRequest(), candidates)

      expect(decision.scoreBreakdown).toBeDefined()
      expect(typeof decision.scoreBreakdown.capabilityFit).toBe('number')
      expect(typeof decision.scoreBreakdown.providerHealth).toBe('number')
    })

    it('uses stable tie-breaking for equal scores', () => {
      const candidates = [
        makeCandidate({ provider: 'groq' as ProviderKey, model: 'b-model', estimatedCost: 0.002 }),
        makeCandidate({ provider: 'groq' as ProviderKey, model: 'a-model', estimatedCost: 0.001 }),
      ]
      const decision = evaluateOrchestra(makeRequest(), candidates)

      expect(decision.selectedModel).toBe('a-model')
    })

    it('live-proven improves confidence', () => {
      const liveProven = makeCandidate({ provider: 'groq' as ProviderKey, model: 'proven-model', liveProven: true })
      const notProven = makeCandidate({ provider: 'groq' as ProviderKey, model: 'unproven-model', liveProven: false })

      const decision = evaluateOrchestra(makeRequest(), [notProven, liveProven])
      expect(decision.selectedModel).toBe('proven-model')
    })
  })

  describe('routing modes', () => {
    it('quality mode prefers higher quality candidates', () => {
      const premium = makeCandidate({ provider: 'groq' as ProviderKey, model: 'premium-model', qualityTier: 'premium', costTier: 'premium' })
      const budget = makeCandidate({ provider: 'groq' as ProviderKey, model: 'budget-model', qualityTier: 'budget', costTier: 'very_low' })

      const decision = evaluateOrchestra(makeRequest({ routingMode: 'quality' }), [budget, premium])
      expect(decision.selectedModel).toBe('premium-model')
    })

    it('economy mode prefers lower cost candidates', () => {
      const expensive = makeCandidate({ provider: 'groq' as ProviderKey, model: 'expensive-model', costTier: 'premium', estimatedCost: 0.01 })
      const cheap = makeCandidate({ provider: 'groq' as ProviderKey, model: 'cheap-model', costTier: 'very_low', estimatedCost: 0.0001 })

      const decision = evaluateOrchestra(makeRequest({ routingMode: 'economy' }), [expensive, cheap])
      expect(decision.selectedModel).toBe('cheap-model')
    })

    it('fast mode prefers lower latency candidates', () => {
      const slow = makeCandidate({ provider: 'groq' as ProviderKey, model: 'slow-model', latencyTier: 'high' })
      const fast = makeCandidate({ provider: 'groq' as ProviderKey, model: 'fast-model', latencyTier: 'ultra_low' })

      const decision = evaluateOrchestra(makeRequest({ routingMode: 'fast' }), [slow, fast])
      expect(decision.selectedModel).toBe('fast-model')
    })
  })

  describe('fallbacks', () => {
    it('generates fallback routes from eligible candidates', () => {
      const candidates = [
        makeCandidate({ provider: 'groq' as ProviderKey, model: 'primary' }),
        makeCandidate({ provider: 'together' as ProviderKey, model: 'fallback-1' }),
        makeCandidate({ provider: 'deepinfra' as ProviderKey, model: 'fallback-2' }),
      ]
      const decision = evaluateOrchestra(makeRequest(), candidates)

      expect(decision.fallbackRoutes.length).toBeGreaterThan(0)
      expect(decision.fallbackRoutes[0].provider).not.toBe(decision.selectedProvider)
      expect(decision.fallbackRoutes[0].model).toBeDefined()
    })

    it('each fallback has its own provider and model', () => {
      const candidates = [
        makeCandidate({ provider: 'groq' as ProviderKey, model: 'primary' }),
        makeCandidate({ provider: 'together' as ProviderKey, model: 'together-fb' }),
        makeCandidate({ provider: 'deepinfra' as ProviderKey, model: 'deepinfra-fb' }),
      ]
      const decision = evaluateOrchestra(makeRequest(), candidates)

      for (const fallback of decision.fallbackRoutes) {
        expect(fallback.provider).toBeDefined()
        expect(fallback.model).toBeDefined()
        expect(fallback.provider).not.toBe(decision.selectedProvider)
      }
    })

    it('fallback never inherits incompatible primary model', () => {
      const candidates = [
        makeCandidate({ provider: 'groq' as ProviderKey, model: 'groq-only-model' }),
        makeCandidate({ provider: 'together' as ProviderKey, model: 'together-model' }),
      ]
      const decision = evaluateOrchestra(makeRequest(), candidates)

      for (const fallback of decision.fallbackRoutes) {
        if (fallback.provider === 'together') {
          expect(fallback.model).toBe('together-model')
        }
      }
    })
  })

  describe('request governance', () => {
    it('blocks execution when no eligible candidates exist', () => {
      const candidates = [
        makeCandidate({ providerEnabled: false }),
      ]
      const decision = evaluateOrchestra(makeRequest(), candidates)

      expect(decision.executionAllowed).toBe(false)
      expect(decision.blockReason).toContain('No eligible candidate')
      expect(decision.selectedProvider).toBeNull()
    })

    it('rejects candidates with blockers', () => {
      const candidates = [
        makeCandidate({ provider: 'groq' as ProviderKey, model: 'blocked', providerEnabled: false }),
        makeCandidate({ provider: 'together' as ProviderKey, model: 'eligible' }),
      ]
      const decision = evaluateOrchestra(makeRequest(), candidates)

      expect(decision.blockersRejected.length).toBeGreaterThan(0)
      expect(decision.blockersRejected[0].provider).toBe('groq')
    })
  })

  describe('snapshot metadata', () => {
    it('includes snapshot timestamp', () => {
      const decision = evaluateOrchestra(makeRequest(), [makeCandidate()])
      expect(decision.snapshotTimestamp).toBeDefined()
      expect(new Date(decision.snapshotTimestamp).getTime()).toBeGreaterThan(0)
    })

    it('includes truth version', () => {
      const decision = evaluateOrchestra(makeRequest(), [makeCandidate()])
      expect(decision.truthVersion).toBe('orchestra-v1')
    })

    it('includes execution ID', () => {
      const decision = evaluateOrchestra(makeRequest({ executionId: 'test-exec-123' }), [makeCandidate()])
      expect(decision.executionId).toBe('test-exec-123')
    })
  })

  describe('request validation', () => {
    it('accepts clean request with no blocked fields', () => {
      const input = { capability: 'chat', prompt: 'hello' }
      expect(validateOrchestraRequest(input)).toBeNull()
    })

    it('rejects provider field', () => {
      const input = { capability: 'chat', provider: 'groq' }
      expect(validateOrchestraRequest(input)).toBe('provider')
    })

    it('rejects model field', () => {
      const input = { capability: 'chat', model: 'llama-3.3-70b' }
      expect(validateOrchestraRequest(input)).toBe('model')
    })

    it('rejects providerId field', () => {
      const input = { capability: 'chat', providerId: 'groq' }
      expect(validateOrchestraRequest(input)).toBe('providerId')
    })

    it('rejects modelId field', () => {
      const input = { capability: 'chat', modelId: 'llama-3.3-70b' }
      expect(validateOrchestraRequest(input)).toBe('modelId')
    })

    it('rejects adapter field', () => {
      const input = { capability: 'chat', adapter: 'groq-adapter' }
      expect(validateOrchestraRequest(input)).toBe('adapter')
    })

    it('rejects endpoint field', () => {
      const input = { capability: 'chat', endpoint: 'https://api.groq.com' }
      expect(validateOrchestraRequest(input)).toBe('endpoint')
    })

    it('rejects fallbackProvider field', () => {
      const input = { capability: 'chat', fallbackProvider: 'deepinfra' }
      expect(validateOrchestraRequest(input)).toBe('fallbackProvider')
    })

    it('rejects fallbackModel field', () => {
      const input = { capability: 'chat', fallbackModel: 'mixtral-8x7b' }
      expect(validateOrchestraRequest(input)).toBe('fallbackModel')
    })

    it('rejects forceProvider field', () => {
      const input = { capability: 'chat', forceProvider: 'groq' }
      expect(validateOrchestraRequest(input)).toBe('forceProvider')
    })

    it('rejects forceModel field', () => {
      const input = { capability: 'chat', forceModel: 'llama-3.3-70b' }
      expect(validateOrchestraRequest(input)).toBe('forceModel')
    })

    it('all blocked fields are defined', () => {
      expect(ORCHESTRA_BLOCKED_REQUEST_FIELDS).toContain('provider')
      expect(ORCHESTRA_BLOCKED_REQUEST_FIELDS).toContain('model')
      expect(ORCHESTRA_BLOCKED_REQUEST_FIELDS).toContain('adapter')
      expect(ORCHESTRA_BLOCKED_REQUEST_FIELDS).toContain('endpoint')
      expect(ORCHESTRA_BLOCKED_REQUEST_FIELDS).toContain('fallbackProvider')
      expect(ORCHESTRA_BLOCKED_REQUEST_FIELDS).toContain('fallbackModel')
      expect(ORCHESTRA_BLOCKED_REQUEST_FIELDS).toContain('forceProvider')
      expect(ORCHESTRA_BLOCKED_REQUEST_FIELDS).toContain('forceModel')
    })
  })
})
