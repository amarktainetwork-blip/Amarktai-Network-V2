import { describe, expect, it } from 'vitest'
import { executeDeepInfraTts } from './deepinfra-tts-executor.js'
import type { WorkerJobData } from '../processors/job-processor.js'

function payload(overrides: Partial<WorkerJobData> = {}): WorkerJobData {
  return {
    jobId: 'job-tts',
    appSlug: 'test-app',
    capability: 'tts',
    prompt: 'Hello from AmarktAI',
    traceId: 'trace-tts',
    input: { text: 'Hello from AmarktAI', outputFormat: 'wav' },
    appGrantSnapshot: {
      appSlug: 'test-app', capability: 'tts', enabled: true,
      qualityFloor: 'standard', budgetPolicy: 'default', maxCostPerRequest: 100, maxCostPerWorkflow: 100,
      latencyPreference: 'medium', allowFallback: true, maxFallbackAttempts: 1, liveProofRequired: false,
      approvalRequired: false, artifactRead: false, artifactWrite: true, memoryRead: false, memoryWrite: false,
      ragNamespaces: [], policyProfile: 'default', adultPermission: false, dataRetentionPolicy: 'default',
      passthroughModelAllowed: false, providerResidencyConstraints: [],
    },
    ...overrides,
  }
}

describe('executeDeepInfraTts policy boundary', () => {
  it('rejects a mismatched capability before any provider call', async () => {
    const result = await executeDeepInfraTts(payload({ capability: 'text_to_audio' }), 'hexgrad/Kokoro-82M')
    expect(result.success).toBe(false)
    expect(result.error).toContain('Unsupported DeepInfra audio capability')
  })

  it('requires artifact-write permission', async () => {
    const result = await executeDeepInfraTts(payload({
      appGrantSnapshot: { ...payload().appGrantSnapshot!, artifactWrite: false },
    }), 'hexgrad/Kokoro-82M')
    expect(result).toMatchObject({
      success: false,
      metadata: { evidenceSource: 'platform_policy', liveProviderProof: false },
    })
    expect(result.error).toContain('artifact write')
  })

  it('validates documented output format and speed before touching credentials', async () => {
    const result = await executeDeepInfraTts(payload({ input: { text: 'Hello', outputFormat: 'aac', speed: 9 } }), 'hexgrad/Kokoro-82M')
    expect(result).toMatchObject({ success: false, metadata: { evidenceSource: 'platform_policy' } })
    expect(result.error).toContain('outputFormat')
  })
})
