import { describe, expect, it, vi, beforeEach, afterEach } from 'vitest'
import fs from 'fs'
import path from 'path'
import { createHash } from 'node:crypto'

const prismaMock = vi.hoisted(() => ({
  appApiKey: { findUnique: vi.fn() },
  appConnection: { update: vi.fn() },
  appBudgetConfig: { findUnique: vi.fn() },
  usageMeter: { aggregate: vi.fn() },
  job: { create: vi.fn(), update: vi.fn(), findUnique: vi.fn() },
  aiProvider: { findUnique: vi.fn(), findMany: vi.fn() },
}))

vi.mock('@amarktai/db', () => ({
  prisma: prismaMock,
  ProviderConfigError: class ProviderConfigError extends Error {
    constructor(message, providerKey = 'groq', code = 'missing-config') {
      super(message)
      this.providerKey = providerKey
      this.code = code
    }
  },
  getProviderCredentialStatus: vi.fn(),
  resolveProviderApiKey: vi.fn(),
}))

const mockQueueAdd = vi.fn()
vi.mock('bullmq', () => ({
  Queue: function MockQueueConstructor() { return { add: mockQueueAdd } },
}))

import {
  PROVIDER_KEYS,
  routeBrain,
  hasBlockedOverrides,
  extractRoutingMode,
  isValidRoutingMode,
  BLOCKED_OVERRIDE_FIELDS,
  VALID_ROUTING_MODES,
  CAPABILITY_KEYS,
  MODEL_CATALOGUE,
  getRuntimeTruth,
} from '../packages/core/src/index.ts'

const ROOT = path.join(import.meta.dirname, '..')

const RAW_API_KEY = 'amark_test_key_worker_integration_001'
const HASHED_API_KEY = createHash('sha256').update(RAW_API_KEY).digest('hex')
const VALID_BEARER = `Bearer ${RAW_API_KEY}`

function makeAppConnection(overrides = {}) {
  return {
    id: 'conn-001', appSlug: 'test-app', appName: 'Test App', status: 'active',
    allowedCapabilities: '[]', tokenBalance: 1000, ...overrides,
  }
}

function makeApiKey(overrides = {}) {
  return {
    id: 'key-001', key: HASHED_API_KEY, label: 'default', active: true,
    connectionId: 'conn-001', appConnection: makeAppConnection(), ...overrides,
  }
}

function makeJob(overrides = {}) {
  return {
    id: 'job-uuid-001', appSlug: 'test-app', capability: 'chat', prompt: 'Hello world',
    inputJson: '{}', metadataJson: '{}', traceId: 'trace_test-uuid', status: 'queued',
    provider: null, model: null, artifactId: null, progress: 0, error: null,
    callbackUrl: null, createdAt: new Date('2026-07-04T10:00:00Z'),
    startedAt: null, completedAt: null, updatedAt: new Date('2026-07-04T10:00:00Z'),
    ...overrides,
  }
}

describe('Brain Router worker integration', () => {
  beforeEach(() => {
    vi.clearAllMocks()
    mockQueueAdd.mockResolvedValue({ id: 'bmq-001' })
    prismaMock.appBudgetConfig.findUnique.mockResolvedValue(null)
    prismaMock.usageMeter.aggregate.mockResolvedValue({ _sum: { costUsdCents: 0 } })
    prismaMock.appConnection.update.mockResolvedValue({})
    prismaMock.job.update.mockResolvedValue({})
    prismaMock.aiProvider.findUnique.mockResolvedValue(null)
  })

  describe('1. Worker calls Brain Router for chat', () => {
    it('provider-executor.ts imports routeBrain', () => {
      const content = fs.readFileSync(path.join(ROOT, 'apps/worker/src/providers/provider-executor.ts'), 'utf8')
      expect(content).toContain('routeBrain')
    })

    it('executeWithProvider calls resolveBrainRouterDecision', () => {
      const content = fs.readFileSync(path.join(ROOT, 'apps/worker/src/providers/provider-executor.ts'), 'utf8')
      expect(content).toContain('resolveBrainRouterDecision')
    })

    it('routeBrain returns executionAllowed true for chat with groq', () => {
      const decision = routeBrain({ capability: 'chat', routingMode: 'balanced' })
      expect(decision.executionAllowed).toBe(true)
      expect(decision.selectedProvider).toBe('groq')
    })
  })

  describe('2. Worker calls Brain Router for image_generation', () => {
    it('routeBrain returns executionAllowed true for image_generation', () => {
      const decision = routeBrain({ capability: 'image_generation', routingMode: 'balanced' })
      expect(decision.executionAllowed).toBe(true)
      expect(decision.selectedProvider).toBe('together')
    })

    it('selected model is FLUX.1-schnell', () => {
      const decision = routeBrain({ capability: 'image_generation', routingMode: 'balanced' })
      expect(decision.selectedModel).toBe('black-forest-labs/FLUX.1-schnell')
    })
  })

  describe('3. Worker calls Brain Router for video_generation', () => {
    it('routeBrain returns executionAllowed true for video_generation', () => {
      const decision = routeBrain({ capability: 'video_generation', routingMode: 'balanced' })
      expect(decision.executionAllowed).toBe(true)
      expect(decision.selectedProvider).toBe('genx')
    })

    it('selected model is seedance-v1-fast', () => {
      const decision = routeBrain({ capability: 'video_generation', routingMode: 'balanced' })
      expect(decision.selectedModel).toBe('seedance-v1-fast')
    })
  })

  describe('4. Default routingMode is balanced', () => {
    it('extractRoutingMode returns balanced when no routingMode provided', () => {
      expect(extractRoutingMode(undefined)).toBe('balanced')
      expect(extractRoutingMode({})).toBe('balanced')
      expect(extractRoutingMode({ routingMode: 'invalid' })).toBe('balanced')
    })

    it('extractRoutingMode returns valid routingMode when provided', () => {
      expect(extractRoutingMode({ routingMode: 'premium' })).toBe('premium')
      expect(extractRoutingMode({ routingMode: 'fast' })).toBe('fast')
      expect(extractRoutingMode({ routingMode: 'budget' })).toBe('budget')
    })

    it('isValidRoutingMode validates correctly', () => {
      expect(isValidRoutingMode('balanced')).toBe(true)
      expect(isValidRoutingMode('premium')).toBe(true)
      expect(isValidRoutingMode('fast')).toBe(true)
      expect(isValidRoutingMode('budget')).toBe(true)
      expect(isValidRoutingMode('experimental')).toBe(true)
      expect(isValidRoutingMode('invalid')).toBe(false)
      expect(isValidRoutingMode(123)).toBe(false)
      expect(isValidRoutingMode(null)).toBe(false)
    })
  })

  describe('5. routingMode is accepted as safe metadata/input', () => {
    it('routingMode is NOT in BLOCKED_OVERRIDE_FIELDS', () => {
      expect(BLOCKED_OVERRIDE_FIELDS).not.toContain('routingMode')
    })

    it('hasBlockedOverrides does not block routingMode', () => {
      expect(hasBlockedOverrides({ routingMode: 'premium' })).toBeNull()
    })

    it('VALID_ROUTING_MODES contains all 5 modes', () => {
      expect(VALID_ROUTING_MODES).toEqual(['balanced', 'premium', 'fast', 'budget', 'experimental'])
    })

    it('jobs route accepts routingMode in metadata', () => {
      const content = fs.readFileSync(path.join(ROOT, 'apps/api/src/routes/jobs.ts'), 'utf8')
      expect(content).toContain('routingMode')
      expect(content).toContain('isValidRoutingMode')
    })
  })

  describe('6. Provider/model override remains blocked', () => {
    it('BLOCKED_OVERRIDE_FIELDS includes selectedProvider', () => {
      expect(BLOCKED_OVERRIDE_FIELDS).toContain('selectedProvider')
    })

    it('BLOCKED_OVERRIDE_FIELDS includes selectedModel', () => {
      expect(BLOCKED_OVERRIDE_FIELDS).toContain('selectedModel')
    })

    it('hasBlockedOverrides blocks provider', () => {
      expect(hasBlockedOverrides({ provider: 'groq' })).toBe('provider')
    })

    it('hasBlockedOverrides blocks model', () => {
      expect(hasBlockedOverrides({ model: 'llama' })).toBe('model')
    })

    it('hasBlockedOverrides blocks selectedProvider', () => {
      expect(hasBlockedOverrides({ selectedProvider: 'groq' })).toBe('selectedProvider')
    })

    it('hasBlockedOverrides blocks selectedModel', () => {
      expect(hasBlockedOverrides({ selectedModel: 'llama' })).toBe('selectedModel')
    })
  })

  describe('7. Disabled DeepInfra is skipped', () => {
    it('routeBrain skips disabled DeepInfra', () => {
      const decision = routeBrain({
        capability: 'chat',
        routingMode: 'balanced',
        providerStates: { deepinfra: { disabled: true } },
      })
      const diRejected = decision.rejectedCandidates.filter((r) => r.provider === 'deepinfra')
      expect(diRejected.length).toBeGreaterThan(0)
      expect(diRejected[0].reason).toContain('disabled')
    })

    it('worker executor checks isProviderDisabledInDb before DeepInfra fallback', () => {
      const content = fs.readFileSync(path.join(ROOT, 'apps/worker/src/providers/provider-executor.ts'), 'utf8')
      expect(content).toContain('isProviderDisabledInDb')
      expect(content).toContain('deepinfra')
    })
  })

  describe('8. Runtime-restricted provider is skipped', () => {
    it('routeBrain skips runtime_restricted provider', () => {
      const decision = routeBrain({
        capability: 'chat',
        routingMode: 'balanced',
        providerStates: { groq: { runtimeRestricted: true } },
      })
      const groqRejected = decision.rejectedCandidates.filter((r) => r.provider === 'groq')
      expect(groqRejected.length).toBeGreaterThan(0)
      expect(groqRejected[0].reason).toContain('runtime_restricted')
    })

    it('worker executor has isProviderRuntimeRestrictedInDb function', () => {
      const content = fs.readFileSync(path.join(ROOT, 'apps/worker/src/providers/provider-executor.ts'), 'utf8')
      expect(content).toContain('isProviderRuntimeRestrictedInDb')
    })
  })

  describe('9. MiMo is never selected', () => {
    it('routeBrain never selects MiMo for any runtime capability', () => {
      for (const cap of ['chat', 'code', 'image_generation', 'video_generation']) {
        const decision = routeBrain({ capability: cap, routingMode: 'balanced' })
        expect(decision.selectedProvider).not.toBe('mimo')
      }
    })

    it('MiMo models are rejected with coding_tools_only reason', () => {
      const decision = routeBrain({ capability: 'chat', routingMode: 'balanced' })
      const mimoRejected = decision.rejectedCandidates.filter((r) => r.provider === 'mimo')
      expect(mimoRejected.length).toBeGreaterThan(0)
      expect(mimoRejected[0].reason).toContain('coding_tools_only')
    })
  })

  describe('10. Planned models are not executed', () => {
    it('all planned models have executable=false', () => {
      const planned = MODEL_CATALOGUE.filter((m) => m.status === 'planned')
      for (const m of planned) {
        expect(m.executable).toBe(false)
      }
    })

    it('routeBrain does not select planned models', () => {
      const decision = routeBrain({ capability: 'stt', routingMode: 'balanced' })
      expect(decision.executionAllowed).toBe(false)
    })

    it('worker executor only calls implemented providers', () => {
      const content = fs.readFileSync(path.join(ROOT, 'apps/worker/src/providers/provider-executor.ts'), 'utf8')
      expect(content).toContain('canExecuteProviderForCapability')
    })
  })

  describe('11. music_generation remains blocked/pending', () => {
    it('routeBrain returns executionAllowed false for music_generation', () => {
      const decision = routeBrain({ capability: 'music_generation', routingMode: 'balanced' })
      expect(decision.executionAllowed).toBe(false)
      expect(decision.selectedProvider).toBeNull()
    })

    it('runtime truth keeps music_generation not live-proven until proof exists', () => {
      const music = getRuntimeTruth().capabilities.find((capability) => capability.capability === 'music_generation')
      expect(music?.liveProven).toBe(false)
    })
  })

  describe('12. long_form_video remains blocked/pending', () => {
    it('routeBrain returns executionAllowed false for long_form_video', () => {
      const decision = routeBrain({ capability: 'long_form_video', routingMode: 'balanced' })
      expect(decision.executionAllowed).toBe(false)
    })

    it('runtime truth keeps long_form_video not live-proven until full multimedia proof exists', () => {
      const longForm = getRuntimeTruth().capabilities.find((capability) => capability.capability === 'long_form_video')
      expect(longForm?.liveProven).toBe(false)
      expect(longForm?.fullMultimediaReady).toBe(false)
    })
  })

  describe('13. image_generation still resolves to Together executable path', () => {
    it('routeBrain selects together for image_generation', () => {
      const decision = routeBrain({ capability: 'image_generation', routingMode: 'balanced' })
      expect(decision.selectedProvider).toBe('together')
      expect(decision.executionAllowed).toBe(true)
    })

    it('worker executor has executeTogetherImage', () => {
      const content = fs.readFileSync(path.join(ROOT, 'apps/worker/src/providers/provider-executor.ts'), 'utf8')
      expect(content).toContain('executeTogetherImage')
    })
  })

  describe('14. video_generation still resolves to GenX executable path', () => {
    it('routeBrain selects genx for video_generation', () => {
      const decision = routeBrain({ capability: 'video_generation', routingMode: 'balanced' })
      expect(decision.selectedProvider).toBe('genx')
      expect(decision.executionAllowed).toBe(true)
    })

    it('worker executor has executeGenxVideo', () => {
      const content = fs.readFileSync(path.join(ROOT, 'apps/worker/src/providers/provider-executor.ts'), 'utf8')
      expect(content).toContain('executeGenxVideo')
    })
  })

  describe('15. chat/text still resolves to Groq with DeepInfra fallback', () => {
    it('routeBrain selects groq for chat', () => {
      const decision = routeBrain({ capability: 'chat', routingMode: 'balanced' })
      expect(decision.selectedProvider).toBe('groq')
      expect(decision.executionAllowed).toBe(true)
    })

    it('DeepInfra appears in fallback chain for chat', () => {
      const decision = routeBrain({ capability: 'chat', routingMode: 'balanced' })
      const diFallback = decision.fallbackChain.find((f) => f.provider === 'deepinfra')
      expect(diFallback).toBeDefined()
    })

    it('worker executor has executeChatWithFallback and executeTextCapabilityWithFallback', () => {
      const content = fs.readFileSync(path.join(ROOT, 'apps/worker/src/providers/provider-executor.ts'), 'utf8')
      expect(content).toContain('executeChatWithFallback')
      expect(content).toContain('executeTextCapabilityWithFallback')
    })
  })

  describe('16. App API key hashing tests from PR #75 still pass', () => {
    it('hashAppApiKey produces SHA-256 hex digest', async () => {
      const { hashAppApiKey } = await import('../packages/core/src/index.ts')
      const raw = 'amark_test123'
      const expected = createHash('sha256').update(raw).digest('hex')
      expect(hashAppApiKey(raw)).toBe(expected)
    })

    it('hashAppApiKey output is 64 hex characters', async () => {
      const { hashAppApiKey } = await import('../packages/core/src/index.ts')
      const hash = hashAppApiKey('amark_anything')
      expect(hash).toMatch(/^[a-f0-9]{64}$/)
    })
  })

  describe('17. Brain Router tests from PR #76 still pass', () => {
    it('routeBrain returns Brain Router v1 truth', () => {
      expect(routeBrain({ capability: 'chat', routingMode: 'balanced' }).truth).toContain('Brain Router v1')
    })

    it('provider executor integrates routeBrain in worker', () => {
      const content = fs.readFileSync(path.join(ROOT, 'apps/worker/src/providers/provider-executor.ts'), 'utf8')
      expect(content).toContain('routeBrain')
      expect(content).toContain('resolveBrainRouterDecision')
    })

    it('5 routing modes exist', () => {
      expect(VALID_ROUTING_MODES).toEqual(['balanced', 'premium', 'fast', 'budget', 'experimental'])
    })
  })

  describe('18. No new providers added', () => {
    it('PROVIDER_KEYS is exactly 5 approved providers', () => {
      expect([...PROVIDER_KEYS]).toEqual(['genx', 'groq', 'together', 'mimo', 'deepinfra'])
      expect(PROVIDER_KEYS).toHaveLength(5)
    })

    it('runtime execution providers are a subset of PROVIDER_KEYS', () => {
      for (const provider of getRuntimeTruth().providerPolicy.runtimeExecutionProviders) {
        expect(PROVIDER_KEYS).toContain(provider)
      }
    })

    it('no banned providers in PROVIDER_KEYS', () => {
      const banned = ['openai', 'anthropic', 'huggingface', 'gemini', 'replicate', 'heygen', 'minimax', 'qwen']
      for (const p of banned) {
        expect(PROVIDER_KEYS).not.toContain(p)
      }
    })
  })

  describe('19. Adult generation remains on hold', () => {
    it('no model in catalogue supports adult capabilities', () => {
      const adultCaps = ['adult_text', 'adult_image', 'adult_voice', 'adult_avatar', 'adult_video']
      for (const cap of adultCaps) {
        const models = MODEL_CATALOGUE.filter((m) => m.capabilities.includes(cap))
        expect(models.length).toBe(0)
      }
    })

    it('runtime truth shows adult generation on hold', () => {
      const adult = getRuntimeTruth().capabilities.filter((capability) => capability.capability.startsWith('adult_'))
      expect(adult.every((capability) => capability.classification === 'POLICY_RESTRICTED')).toBe(true)
    })

    it('routeBrain blocks adult capabilities', () => {
      const decision = routeBrain({ capability: 'adult_text', routingMode: 'balanced' })
      expect(decision.executionAllowed).toBe(false)
    })
  })

  describe('Worker integration structural checks', () => {
    it('provider-executor.ts imports routeBrain and extractRoutingMode', () => {
      const content = fs.readFileSync(path.join(ROOT, 'apps/worker/src/providers/provider-executor.ts'), 'utf8')
      expect(content).toContain('routeBrain')
      expect(content).toContain('extractRoutingMode')
    })

    it('provider-executor.ts has buildProviderStates function', () => {
      const content = fs.readFileSync(path.join(ROOT, 'apps/worker/src/providers/provider-executor.ts'), 'utf8')
      expect(content).toContain('buildProviderStates')
    })

    it('provider-executor.ts attaches brainRouter metadata to results', () => {
      const content = fs.readFileSync(path.join(ROOT, 'apps/worker/src/providers/provider-executor.ts'), 'utf8')
      expect(content).toContain('attachBrainRouterMetadata')
      expect(content).toContain('brainRouter')
    })

    it('JobPayload includes routingMode', () => {
      const content = fs.readFileSync(path.join(ROOT, 'packages/core/src/queue.ts'), 'utf8')
      expect(content).toContain('routingMode')
    })

    it('WorkerJobData includes routingMode', () => {
      const content = fs.readFileSync(path.join(ROOT, 'apps/worker/src/processors/job-processor.ts'), 'utf8')
      expect(content).toContain('routingMode')
    })

    it('routing mode remains preference-only metadata', () => {
      const queue = fs.readFileSync(path.join(ROOT, 'packages/core/src/queue.ts'), 'utf8')
      expect(queue).toContain('routingMode')
      expect(queue).not.toContain('providerOverride')
    })

    it('provider/model override remains blocked', () => {
      expect(hasBlockedOverrides({ provider: 'groq' })).toBe('provider')
      expect(hasBlockedOverrides({ model: 'llama' })).toBe('model')
    })
  })
})
