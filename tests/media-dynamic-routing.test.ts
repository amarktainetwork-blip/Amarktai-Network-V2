import { describe, expect, it } from 'vitest'
import { evaluateOrchestra, normalizeDbCandidates, type AppCapabilityGrantContext, type DbModelRecord } from '../packages/core/src/orchestra.ts'
import { getExecutorRegistration, isExecutorModelCompatible } from '../packages/core/src/executor-registry.ts'

const readyProvider = (providerKey: string, overrides: Record<string, unknown> = {}) => ({
  providerKey, enabled: true, healthStatus: 'live', apiKey: 'configured-secret', ...overrides,
})

const mediaModel = (provider: string, modelId: string, compatibility: Record<string, unknown>, capability = 'video_generation'): DbModelRecord => ({
  provider, modelId, displayName: modelId, status: 'available', enabled: true,
  capabilitiesJson: JSON.stringify([capability]),
  rawMetadata: JSON.stringify({ compatibility: { capabilities: [capability], endpointShapeKnown: true, requestShapeKnown: true, responseShapeKnown: true, providerClientExists: true, workerExecutorExists: true, ...compatibility } }),
})

const genx = (id: string) => mediaModel('genx', id, { taskType: 'text-to-video', category: 'video', modalitiesIn: ['text'], modalitiesOut: ['video'], transportProfile: 'async_job_poll', endpointFamily: 'genx_generation_v1' })
const together = (id: string) => mediaModel('together', id, { category: 'text-to-video', modalitiesIn: ['text'], modalitiesOut: ['video'], transportProfile: 'async_job_poll', endpointFamily: 'together_v2_videos' })

const grant = (overrides: Partial<AppCapabilityGrantContext> = {}): AppCapabilityGrantContext => ({
  appSlug: 'test', capability: 'video_generation', enabled: true, qualityFloor: 'balanced', budgetPolicy: 'balanced',
  maxCostPerRequest: 0, maxCostPerWorkflow: 0, latencyPreference: 'medium', allowFallback: true, maxFallbackAttempts: 3,
  liveProofRequired: false, approvalRequired: false, artifactRead: true, artifactWrite: true, memoryRead: false, memoryWrite: false,
  ragNamespaces: [], policyProfile: 'test', adultPermission: false, dataRetentionPolicy: 'default', passthroughModelAllowed: false,
  providerResidencyConstraints: [], ...overrides,
})

describe('dynamic media routing', () => {
  it('accepts newly discovered compatible GenX models without registry model edits', () => {
    const models = [genx('provider-new-video-2030')]
    const candidates = normalizeDbCandidates(models, [readyProvider('genx')], 'video_generation', { databaseReady: true, queueReady: true })
    expect(candidates).toHaveLength(1)
    expect(candidates.every((candidate) => candidate.modelCompatible && candidate.executionReady)).toBe(true)
    expect(getExecutorRegistration('video_generation', 'genx')?.compatibleModels).toEqual([])
  })

  it('blocks endpoint-incompatible, unhealthy, and unconfigured routes', () => {
    const incompatible = mediaModel('together', 'new-but-wrong-transport', { category: 'video', modalitiesIn: ['text'], modalitiesOut: ['video'], transportProfile: 'async_job_poll', endpointFamily: 'dedicated_container' })
    const wrong = normalizeDbCandidates([incompatible], [readyProvider('together')], 'video_generation', { databaseReady: true, queueReady: true })[0]!
    expect(wrong.modelCompatible).toBe(false)
    const unhealthy = normalizeDbCandidates([together('healthy-model')], [readyProvider('together', { healthStatus: 'failed' })], 'video_generation', { databaseReady: true, queueReady: true })[0]!
    expect(unhealthy.infrastructureReady).toBe(false)
    const unconfigured = normalizeDbCandidates([genx('compatible-model')], [readyProvider('genx', { apiKey: '' })], 'video_generation', { databaseReady: true, queueReady: true })[0]!
    expect(unconfigured.providerConfigured).toBe(false)
  })

  it('Orchestra selects GenX video and carries exact authorised fallbacks', () => {
    const models = [
      { ...genx('genx-dynamic-video'), costTier: 'premium', latencyTier: 'high', estimatedUnitCost: 0.1 },
      { ...genx('genx-cheap-video'), costTier: 'low', latencyTier: 'low', estimatedUnitCost: 0.01 },
    ]
    const candidates = normalizeDbCandidates(models, [readyProvider('genx')], 'video_generation', { databaseReady: true, queueReady: true })
    const economy = evaluateOrchestra({ capability: 'video_generation', routingMode: 'economy', appGrant: grant() }, candidates)
    expect(economy.selectedProvider).toBe('genx')
    expect(economy.selectedModel).toBe('genx-cheap-video')
    expect(economy.fallbackRoutes[0]).toMatchObject({ provider: 'genx', model: 'genx-dynamic-video', executorId: 'genx.video-generation' })
    const denied = evaluateOrchestra({ capability: 'video_generation', appGrant: grant({ allowFallback: false }) }, candidates)
    expect(denied.fallbackRoutes).toEqual([])
    const bounded = evaluateOrchestra({ capability: 'video_generation', appGrant: grant({ maxFallbackAttempts: 1 }) }, candidates)
    expect(bounded.fallbackRoutes).toHaveLength(1)
  })

  it('keeps music dynamic but transport-specific', () => {
    const registration = getExecutorRegistration('music_generation', 'genx')!
    expect(isExecutorModelCompatible(registration, 'future-instrumental-model', {
      taskType: 'music', category: 'music', capabilities: ['music_generation'], modalitiesIn: ['text'], modalitiesOut: ['audio'],
      transportProfile: 'async_job_poll', endpointFamily: 'genx_generation_v1', endpointShapeKnown: true,
      requestShapeKnown: true, responseShapeKnown: true, providerClientExists: true, workerExecutorExists: true,
    })).toBe(true)
    expect(isExecutorModelCompatible(registration, 'future-instrumental-model', {
      taskType: 'music', category: 'music', capabilities: ['music_generation'], modalitiesIn: ['text'], modalitiesOut: ['audio'],
      transportProfile: 'native_inference_json', endpointFamily: 'unknown', endpointShapeKnown: true,
      requestShapeKnown: true, responseShapeKnown: true, providerClientExists: true, workerExecutorExists: true,
    })).toBe(false)
  })
})
