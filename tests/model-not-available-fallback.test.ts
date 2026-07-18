import { beforeEach, describe, expect, it, vi } from 'vitest'

const state = vi.hoisted(() => ({ metadata: '{}', attempts: [] as string[] }))
const accessFailure = vi.hoisted(() => vi.fn())
const accessSuccess = vi.hoisted(() => vi.fn())
const chat = vi.hoisted(() => vi.fn())

const models = vi.hoisted(() => {
  const compatibility = (provider: string) => JSON.stringify({ compatibility: {
    taskType: 'text', category: 'text', capabilities: ['chat'], modalitiesIn: ['text'], modalitiesOut: ['text'],
    transportProfile: 'openai_chat_sse', endpointFamily: `${provider}_openai_v1/openai_chat`,
    endpointShapeKnown: true, requestShapeKnown: true, responseShapeKnown: true,
    providerClientExists: true, workerExecutorExists: true, streamingSupported: true,
  } })
  return [
    { provider: 'together', modelId: 'account/first', displayName: 'First', enabled: true, status: 'available', currentAvailability: 'available', accountAccess: 'accessible', costTier: 'low', qualityTier: 'premium', latencyTier: 'low', capabilitiesJson: '["chat"]', rawMetadata: compatibility('together') },
    { provider: 'deepinfra', modelId: 'account/second', displayName: 'Second', enabled: true, status: 'available', currentAvailability: 'available', accountAccess: 'accessible', costTier: 'medium', qualityTier: 'balanced', latencyTier: 'medium', capabilitiesJson: '["chat"]', rawMetadata: compatibility('deepinfra') },
  ]
})

vi.mock('@amarktai/db', () => {
  class ProviderConfigError extends Error {}
  return {
    ProviderConfigError,
    resolveProviderApiKey: vi.fn(async (provider: string) => ({ providerKey: provider, apiKey: `${provider}-secret`, source: 'database' })),
    getProviderCredentialStatus: vi.fn(async (provider: string) => ({ providerKey: provider, baseUrl: provider === 'together' ? 'https://api.together.xyz/v1' : 'https://api.deepinfra.com/v1/openai', healthStatus: 'live' })),
    recordModelAccessibilityFailure: accessFailure,
    recordModelAccessibilitySuccess: accessSuccess,
    prisma: {
      modelRegistryEntry: {
        findMany: vi.fn(async () => models),
        findUnique: vi.fn(async ({ where }: any) => models.find((model) => model.provider === where.provider_modelId.provider && model.modelId === where.provider_modelId.modelId) ?? null),
      },
      aiProvider: { findMany: vi.fn(async () => [
        { providerKey: 'together', enabled: true, healthStatus: 'live', apiKey: 'encrypted' },
        { providerKey: 'deepinfra', enabled: true, healthStatus: 'live', apiKey: 'encrypted' },
      ]) },
      job: {
        findUnique: vi.fn(async () => ({ metadataJson: state.metadata })),
        update: vi.fn(async ({ data }: any) => { if (data.metadataJson) state.metadata = data.metadataJson; return data }),
      },
      usageMeter: { upsert: vi.fn(async () => ({})) },
    },
  }
})

vi.mock('@amarktai/providers', async () => {
  const actual = await vi.importActual<typeof import('../packages/providers/src/provider-errors.ts')>('../packages/providers/src/provider-errors.ts')
  return {
    ...actual,
    openAiChatCompletion: chat,
    providerEmbeddings: vi.fn(), providerRerank: vi.fn(), deepinfraTaskInference: vi.fn(),
  }
})
vi.mock('@amarktai/artifacts', () => ({
  findCompletedArtifactByTraceId: vi.fn(async () => null), getArtifactFile: vi.fn(), getArtifactRecord: vi.fn(), saveArtifact: vi.fn(),
}))

import { CanonicalProviderError } from '../packages/providers/src/provider-errors.ts'
import { executeWithProvider } from '../apps/worker/src/providers/provider-executor.ts'
import { makeAppGrantSnapshot } from './helpers/app-grant.js'

describe('credential-scoped model fallback', () => {
  beforeEach(() => {
    state.metadata = '{}'
    state.attempts = []
    accessFailure.mockReset().mockResolvedValue(true)
    accessSuccess.mockReset().mockResolvedValue(true)
    chat.mockReset().mockImplementation(async ({ provider }: { provider: string }) => {
      state.attempts.push(provider)
      if (provider === 'together') throw new CanonicalProviderError({ code: 'model_not_available', provider, status: 400, message: 'unable to access non-serverless model; dedicated endpoint required' })
      return { content: 'fallback succeeded', finishReason: 'stop', reasoningSummary: null, toolCalls: [], usage: { inputTokens: 2, outputTokens: 2, totalTokens: 4, providerReportedCost: null, currency: null } }
    })
  })

  it('records the unavailable Together model once and succeeds through the next eligible DeepInfra route', async () => {
    const appSlug = 'fallback-proof'
    const result = await executeWithProvider({
      jobId: 'fallback-job', appSlug, capability: 'chat', prompt: 'Say hello', input: {}, metadata: {}, traceId: 'fallback-trace',
      appGrantSnapshot: makeAppGrantSnapshot(appSlug, 'chat'),
    })
    expect(result.success).toBe(true)
    expect(result.provider).toBe('deepinfra')
    expect(result.model).toBe('account/second')
    expect(state.attempts).toEqual(['together', 'deepinfra'])
    expect(accessFailure).toHaveBeenCalledTimes(1)
    expect(accessFailure).toHaveBeenCalledWith({ provider: 'together', modelId: 'account/first', blocker: 'dedicated_endpoint_required' })
    expect((result.metadata?.routeAttempts as Array<unknown>)).toHaveLength(2)
    expect(accessSuccess).toHaveBeenCalledWith({ provider: 'deepinfra', modelId: 'account/second' })
    const finalMetadata = JSON.parse(state.metadata)
    expect(finalMetadata.orchestraInitialSelectedProvider).toBe('together')
    expect(finalMetadata.orchestraSelectedProvider).toBe('deepinfra')
  })
})
