import { describe, expect, it } from 'vitest'
import {
  PROVIDER_KEYS,
  MODEL_CATALOGUE,
  ROUTING_MODES,
  routeBrain,
  getExecutableModels,
  getPlannedModels,
  getBlockedModels,
  hasBlockedOverrides,
} from '../packages/core/src/index.ts'
import { BRAIN_ROUTER_V1, MODEL_CATALOGUE_SUMMARY, APPROVED_PROVIDERS, ROUTING_TRUTH } from '../lib/capability-routing-map.js'

describe('Brain Router v1 foundation', () => {
  describe('1. Approved provider list', () => {
    it('PROVIDER_KEYS is exactly genx, groq, together, mimo, deepinfra', () => {
      expect([...PROVIDER_KEYS]).toEqual(['genx', 'groq', 'together', 'mimo', 'deepinfra'])
    })

    it('PROVIDER_KEYS has exactly 5 entries', () => {
      expect(PROVIDER_KEYS).toHaveLength(5)
    })

    it('all catalogue models use approved providers only', () => {
      for (const model of MODEL_CATALOGUE) {
        expect(PROVIDER_KEYS).toContain(model.provider)
      }
    })
  })

  describe('2. Brain router skips disabled providers', () => {
    it('disabled groq is not selected for chat', () => {
      const decision = routeBrain({
        capability: 'chat',
        routingMode: 'balanced',
        providerStates: { groq: { disabled: true } },
      })
      expect(decision.selectedProvider).not.toBe('groq')
      const rejected = decision.rejectedCandidates.filter((r) => r.provider === 'groq')
      expect(rejected.length).toBeGreaterThan(0)
      expect(rejected[0].reason).toContain('disabled')
    })

    it('disabled together is not selected for image_generation', () => {
      const decision = routeBrain({
        capability: 'image_generation',
        routingMode: 'balanced',
        providerStates: { together: { disabled: true } },
      })
      expect(decision.selectedProvider).toBeNull()
      expect(decision.executionAllowed).toBe(false)
    })

    it('disabled genx is not selected for video_generation', () => {
      const decision = routeBrain({
        capability: 'video_generation',
        routingMode: 'balanced',
        providerStates: { genx: { disabled: true } },
      })
      expect(decision.selectedProvider).toBeNull()
      expect(decision.executionAllowed).toBe(false)
    })
  })

  describe('3. Brain router skips runtime_restricted providers', () => {
    it('runtime_restricted groq is not selected for chat', () => {
      const decision = routeBrain({
        capability: 'chat',
        routingMode: 'balanced',
        providerStates: { groq: { runtimeRestricted: true } },
      })
      const groqRejected = decision.rejectedCandidates.filter((r) => r.provider === 'groq')
      expect(groqRejected.length).toBeGreaterThan(0)
      expect(groqRejected[0].reason).toContain('runtime_restricted')
    })

    it('runtime_restricted together is not selected for image', () => {
      const decision = routeBrain({
        capability: 'image_generation',
        routingMode: 'balanced',
        providerStates: { together: { runtimeRestricted: true } },
      })
      expect(decision.selectedProvider).toBeNull()
    })
  })

  describe('4. Brain router never selects MiMo for runtime jobs', () => {
    it('MiMo is never selected for chat', () => {
      const decision = routeBrain({ capability: 'chat', routingMode: 'balanced' })
      expect(decision.selectedProvider).not.toBe('mimo')
    })

    it('MiMo is never selected for code', () => {
      const decision = routeBrain({ capability: 'code', routingMode: 'balanced' })
      expect(decision.selectedProvider).not.toBe('mimo')
    })

    it('MiMo is never selected for image_generation', () => {
      const decision = routeBrain({ capability: 'image_generation', routingMode: 'balanced' })
      expect(decision.selectedProvider).not.toBe('mimo')
    })

    it('MiMo models are always in rejected candidates for runtime', () => {
      const decision = routeBrain({ capability: 'chat', routingMode: 'balanced' })
      const mimoRejected = decision.rejectedCandidates.filter((r) => r.provider === 'mimo')
      expect(mimoRejected.length).toBeGreaterThan(0)
      expect(mimoRejected[0].reason).toContain('coding_tools_only')
    })

    it('MiMo model status is blocked in catalogue', () => {
      const mimoModels = MODEL_CATALOGUE.filter((m) => m.provider === 'mimo')
      for (const m of mimoModels) {
        expect(m.status).toBe('blocked')
        expect(m.executable).toBe(false)
      }
    })
  })

  describe('5. Brain router blocks app-facing provider/model override', () => {
    it('decision always has appFacingProviderOverride false', () => {
      const decision = routeBrain({ capability: 'chat', routingMode: 'balanced' })
      expect(decision.appFacingProviderOverride).toBe(false)
    })

    it('decision always has appFacingModelOverride false', () => {
      const decision = routeBrain({ capability: 'image_generation', routingMode: 'premium' })
      expect(decision.appFacingModelOverride).toBe(false)
    })

    it('hasBlockedOverrides rejects provider field', () => {
      expect(hasBlockedOverrides({ capability: 'chat', prompt: 'hi', provider: 'groq' })).toBe('provider')
    })

    it('hasBlockedOverrides rejects model field', () => {
      expect(hasBlockedOverrides({ capability: 'chat', prompt: 'hi', model: 'llama' })).toBe('model')
    })

    it('routing map all caps have app override false', () => {
      const { CAPABILITY_ROUTING_MAP } = require('../lib/capability-routing-map.js')
      for (const cap of CAPABILITY_ROUTING_MAP) {
        expect(cap.appFacingProviderOverride).toBe(false)
        expect(cap.appFacingModelOverride).toBe(false)
      }
    })
  })

  describe('6. Brain router returns selectedProvider and selectedModel for executable paths', () => {
    it('chat/text selects groq', () => {
      const decision = routeBrain({ capability: 'chat', routingMode: 'balanced' })
      expect(decision.selectedProvider).toBe('groq')
      expect(decision.selectedModel).toBeTruthy()
      expect(decision.executionAllowed).toBe(true)
    })

    it('image_generation selects together', () => {
      const decision = routeBrain({ capability: 'image_generation', routingMode: 'balanced' })
      expect(decision.selectedProvider).toBe('together')
      expect(decision.selectedModel).toBe('black-forest-labs/FLUX.1-schnell')
      expect(decision.executionAllowed).toBe(true)
    })

    it('video_generation selects genx', () => {
      const decision = routeBrain({ capability: 'video_generation', routingMode: 'balanced' })
      expect(decision.selectedProvider).toBe('genx')
      expect(decision.selectedModel).toBe('seedance-v1-fast')
      expect(decision.executionAllowed).toBe(true)
    })
  })

  describe('7. DeepInfra disabled is not selected', () => {
    it('disabled DeepInfra is not selected for chat when groq also disabled', () => {
      const decision = routeBrain({
        capability: 'chat',
        routingMode: 'balanced',
        providerStates: {
          deepinfra: { disabled: true },
          groq: { disabled: true },
        },
      })
      expect(decision.selectedProvider).toBeNull()
      expect(decision.executionAllowed).toBe(false)
    })

    it('disabled DeepInfra appears in rejected candidates', () => {
      const decision = routeBrain({
        capability: 'chat',
        routingMode: 'balanced',
        providerStates: { deepinfra: { disabled: true } },
      })
      const diRejected = decision.rejectedCandidates.filter((r) => r.provider === 'deepinfra')
      expect(diRejected.length).toBeGreaterThan(0)
      expect(diRejected[0].reason).toContain('disabled')
    })
  })

  describe('8. DeepInfra enabled/live can appear as fallback for text/chat', () => {
    it('DeepInfra appears in fallback chain for chat when groq is selected', () => {
      const decision = routeBrain({ capability: 'chat', routingMode: 'balanced' })
      expect(decision.selectedProvider).toBe('groq')
      const diFallback = decision.fallbackChain.find((f) => f.provider === 'deepinfra')
      expect(diFallback).toBeDefined()
    })

    it('DeepInfra is selected when groq is disabled', () => {
      const decision = routeBrain({
        capability: 'chat',
        routingMode: 'balanced',
        providerStates: { groq: { disabled: true } },
      })
      expect(decision.selectedProvider).toBe('deepinfra')
      expect(decision.executionAllowed).toBe(true)
    })
  })

  describe('9. Balanced mode selects a balanced executable model', () => {
    it('balanced mode for chat selects a balanced-tier model', () => {
      const decision = routeBrain({ capability: 'chat', routingMode: 'balanced' })
      expect(decision.executionAllowed).toBe(true)
      const selected = MODEL_CATALOGUE.find(
        (m) => m.provider === decision.selectedProvider && m.modelId === decision.selectedModel
      )
      expect(selected).toBeDefined()
      expect(selected.qualityTier).toBe('balanced')
    })

    it('balanced mode for image selects balanced model', () => {
      const decision = routeBrain({ capability: 'image_generation', routingMode: 'balanced' })
      const selected = MODEL_CATALOGUE.find(
        (m) => m.provider === decision.selectedProvider && m.modelId === decision.selectedModel
      )
      expect(selected.qualityTier).toBe('balanced')
    })
  })

  describe('10. Premium mode does not choose non-executable planned models', () => {
    it('premium mode only selects executable models', () => {
      const decision = routeBrain({ capability: 'chat', routingMode: 'premium' })
      expect(decision.executionAllowed).toBe(true)
      const selected = MODEL_CATALOGUE.find(
        (m) => m.provider === decision.selectedProvider && m.modelId === decision.selectedModel
      )
      expect(selected.status).toBe('available')
      expect(selected.executable).toBe(true)
    })

    it('premium mode for image does not select planned genx image model', () => {
      const decision = routeBrain({ capability: 'image_generation', routingMode: 'premium' })
      expect(decision.selectedModel).not.toBe('genx-image-v1')
      expect(decision.selectedProvider).toBe('together')
    })
  })

  describe('11. Budget mode prefers low-cost executable model', () => {
    it('budget mode for chat selects lowest cost model', () => {
      const decision = routeBrain({ capability: 'chat', routingMode: 'budget' })
      expect(decision.executionAllowed).toBe(true)
      const selected = MODEL_CATALOGUE.find(
        (m) => m.provider === decision.selectedProvider && m.modelId === decision.selectedModel
      )
      expect(selected.costTier === 'very_low' || selected.costTier === 'free' || selected.costTier === 'low').toBe(true)
    })

    it('budget mode selects groq 8b instant over 70b versatile', () => {
      const decision = routeBrain({ capability: 'chat', routingMode: 'budget' })
      expect(decision.selectedModel).toBe('llama-3.1-8b-instant')
    })
  })

  describe('12. Fast mode prefers low-latency executable model', () => {
    it('fast mode for chat selects lowest latency model', () => {
      const decision = routeBrain({ capability: 'chat', routingMode: 'fast' })
      expect(decision.executionAllowed).toBe(true)
      const selected = MODEL_CATALOGUE.find(
        (m) => m.provider === decision.selectedProvider && m.modelId === decision.selectedModel
      )
      expect(selected.latencyTier === 'ultra_low' || selected.latencyTier === 'low').toBe(true)
    })

    it('fast mode selects groq 8b instant for ultra_low latency', () => {
      const decision = routeBrain({ capability: 'chat', routingMode: 'fast' })
      expect(decision.selectedModel).toBe('llama-3.1-8b-instant')
    })
  })

  describe('13. Experimental models are blocked unless explicitly allowed', () => {
    it('no experimental models exist in current catalogue', () => {
      const experimentalModels = MODEL_CATALOGUE.filter((m) => m.qualityTier === 'experimental')
      expect(experimentalModels.length).toBe(0)
    })

    it('routing modes include experimental', () => {
      expect(ROUTING_MODES).toContain('experimental')
    })

    it('allowExperimental false does not error', () => {
      const decision = routeBrain({
        capability: 'chat',
        routingMode: 'balanced',
        allowExperimental: false,
      })
      expect(decision.executionAllowed).toBe(true)
    })
  })

  describe('14. music_generation remains pending', () => {
    it('music_generation returns executionAllowed false', () => {
      const decision = routeBrain({ capability: 'music_generation', routingMode: 'balanced' })
      expect(decision.executionAllowed).toBe(false)
      expect(decision.selectedProvider).toBeNull()
      expect(decision.selectedModel).toBeNull()
    })

    it('music_generation has blockReason', () => {
      const decision = routeBrain({ capability: 'music_generation', routingMode: 'balanced' })
      expect(decision.blockReason).toBeTruthy()
      expect(decision.blockReason).toContain('music_generation')
    })

    it('routing map shows music_generation as pending', () => {
      expect(ROUTING_TRUTH.music_generation).toBe('pending')
    })
  })

  describe('15. long_form_video remains pending', () => {
    it('long_form_video returns executionAllowed false', () => {
      const decision = routeBrain({ capability: 'long_form_video', routingMode: 'balanced' })
      expect(decision.executionAllowed).toBe(false)
      expect(decision.selectedProvider).toBeNull()
    })

    it('long_form_video planned model is not executable', () => {
      const lfModels = MODEL_CATALOGUE.filter((m) => m.capabilities.includes('long_form_video'))
      for (const m of lfModels) {
        expect(m.executable).toBe(false)
        expect(m.status).toBe('planned')
      }
    })

    it('routing map shows long_form_video as pending', () => {
      expect(ROUTING_TRUTH.long_form_video).toBe('pending')
    })
  })

  describe('16. No new providers were added', () => {
    it('PROVIDER_KEYS has no banned providers', () => {
      const banned = ['openai', 'anthropic', 'huggingface', 'gemini', 'replicate', 'heygen', 'minimax', 'qwen']
      for (const p of banned) {
        expect(PROVIDER_KEYS).not.toContain(p)
      }
    })

    it('APPROVED_PROVIDERS matches PROVIDER_KEYS', () => {
      expect(APPROVED_PROVIDERS).toEqual([...PROVIDER_KEYS])
    })

    it('all catalogue models use only approved providers', () => {
      const catalogueProviders = new Set(MODEL_CATALOGUE.map((m) => m.provider))
      for (const p of catalogueProviders) {
        expect(PROVIDER_KEYS).toContain(p)
      }
    })
  })

  describe('17. Adult generation remains on hold', () => {
    it('no model in catalogue supports adult capabilities', () => {
      const adultCaps = ['adult_text', 'adult_image', 'adult_voice', 'adult_avatar', 'adult_video']
      for (const cap of adultCaps) {
        const models = MODEL_CATALOGUE.filter((m) => m.capabilities.includes(cap))
        expect(models.length).toBe(0)
      }
    })

    it('routing map shows adult capabilities as blocked', () => {
      const { CAPABILITY_ROUTING_MAP } = require('../lib/capability-routing-map.js')
      const adultCaps = CAPABILITY_ROUTING_MAP.filter((c) => c.id.startsWith('adult_'))
      for (const cap of adultCaps) {
        expect(cap.executionStatus).toBe('blocked')
      }
    })

    it('ROUTING_TRUTH shows adult_generation on_hold', () => {
      expect(ROUTING_TRUTH.adult_generation).toBe('on_hold')
    })
  })

  describe('18. Existing PR #75 API key tests still pass', () => {
    it('hasBlockedOverrides still works for provider', () => {
      expect(hasBlockedOverrides({ provider: 'groq' })).toBe('provider')
    })

    it('hasBlockedOverrides still works for model', () => {
      expect(hasBlockedOverrides({ model: 'llama' })).toBe('model')
    })

    it('hasBlockedOverrides still works for providerOverride', () => {
      expect(hasBlockedOverrides({ providerOverride: 'genx' })).toBe('providerOverride')
    })

    it('hasBlockedOverrides still works for modelOverride', () => {
      expect(hasBlockedOverrides({ modelOverride: 'gpt-4' })).toBe('modelOverride')
    })

    it('hasBlockedOverrides returns null for clean request', () => {
      expect(hasBlockedOverrides({ capability: 'chat', prompt: 'hi' })).toBeNull()
    })
  })

  describe('Brain Router v1 structural integrity', () => {
    it('BRAIN_ROUTER_V1 exists in routing map', () => {
      expect(BRAIN_ROUTER_V1.exists).toBe(true)
      expect(BRAIN_ROUTER_V1.version).toBe('v1')
    })

    it('MODEL_CATALOGUE_SUMMARY counts match', () => {
      expect(MODEL_CATALOGUE_SUMMARY.executable.length).toBe(5)
      expect(MODEL_CATALOGUE_SUMMARY.planned.length).toBe(5)
      expect(MODEL_CATALOGUE_SUMMARY.blocked.length).toBe(1)
    })

    it('ROUTING_TRUTH includes brain_router_v1 and model_catalogue_v1', () => {
      expect(ROUTING_TRUTH.brain_router_v1).toBe(true)
      expect(ROUTING_TRUTH.model_catalogue_v1).toBe(true)
    })

    it('ROUTING_TRUTH includes routing_modes', () => {
      expect(ROUTING_TRUTH.routing_modes).toEqual(['balanced', 'premium', 'fast', 'budget', 'experimental'])
    })

    it('getExecutableModels returns only executable models', () => {
      const exec = getExecutableModels()
      for (const m of exec) {
        expect(m.executable).toBe(true)
        expect(m.status).toBe('available')
      }
    })

    it('getPlannedModels returns only planned models', () => {
      const planned = getPlannedModels()
      for (const m of planned) {
        expect(m.status).toBe('planned')
      }
    })

    it('getBlockedModels returns only blocked models', () => {
      const blocked = getBlockedModels()
      for (const m of blocked) {
        expect(m.status).toBe('blocked')
      }
    })

    it('routeBrain returns truth message', () => {
      const decision = routeBrain({ capability: 'chat', routingMode: 'balanced' })
      expect(decision.truth).toBeTruthy()
      expect(decision.truth).toContain('Brain Router v1')
    })

    it('routeBrain returns fallback chain', () => {
      const decision = routeBrain({ capability: 'chat', routingMode: 'balanced' })
      expect(decision.fallbackChain.length).toBeGreaterThan(0)
    })

    it('routeBrain returns rejected candidates', () => {
      const decision = routeBrain({ capability: 'chat', routingMode: 'balanced' })
      expect(decision.rejectedCandidates.length).toBeGreaterThan(0)
    })
  })
})
