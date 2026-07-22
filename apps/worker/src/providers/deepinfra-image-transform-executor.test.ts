import { describe, expect, it } from 'vitest'
import { executeDeepInfraImageTransform } from './deepinfra-image-transform-executor.js'
import type { WorkerJobData } from '../processors/job-processor.js'

const SOURCE_ID = 'a0eebc99-9c0b-4ef8-bb6d-6bb9bd380a11'

function payload(overrides: Partial<WorkerJobData> = {}): WorkerJobData {
  return {
    jobId: 'job-image-transform',
    appSlug: 'test-app',
    capability: 'image_edit',
    prompt: 'Replace the background',
    traceId: 'trace-image-transform',
    input: { sourceImageArtifactId: SOURCE_ID },
    appGrantSnapshot: {
      appSlug: 'test-app',
      capability: 'image_edit',
      enabled: true,
      qualityFloor: 'standard',
      budgetPolicy: 'default',
      maxCostPerRequest: 100,
      maxCostPerWorkflow: 100,
      latencyPreference: 'medium',
      allowFallback: true,
      maxFallbackAttempts: 1,
      liveProofRequired: false,
      approvalRequired: false,
      artifactRead: true,
      artifactWrite: true,
      memoryRead: false,
      memoryWrite: false,
      ragNamespaces: [],
      policyProfile: 'default',
      adultPermission: false,
      dataRetentionPolicy: 'default',
      passthroughModelAllowed: false,
      providerResidencyConstraints: [],
    },
    ...overrides,
  }
}

describe('executeDeepInfraImageTransform policy boundary', () => {
  it('rejects malformed source artifact IDs before credentials or providers are touched', async () => {
    const result = await executeDeepInfraImageTransform(payload({ input: { sourceImageArtifactId: 'not-an-id' } }), 'provider/image-edit-model')
    expect(result).toMatchObject({
      success: false,
      status: 'failed',
      provider: 'deepinfra',
      metadata: { evidenceSource: 'platform_policy', liveProviderProof: false },
    })
    expect(result.error).toContain('sourceImageArtifactId')
  })

  it('requires a matching immutable capability grant with artifact permissions', async () => {
    const result = await executeDeepInfraImageTransform(payload({
      appGrantSnapshot: { ...payload().appGrantSnapshot!, artifactRead: false },
    }), 'provider/image-edit-model')
    expect(result).toMatchObject({
      success: false,
      metadata: { evidenceSource: 'platform_policy', liveProviderProof: false },
    })
    expect(result.error).toContain('source-artifact read')
  })

  it('rejects non-image-transform capabilities rather than falling through to a provider call', async () => {
    const result = await executeDeepInfraImageTransform(payload({ capability: 'object_detection' }), 'provider/image-edit-model')
    expect(result.success).toBe(false)
    expect(result.error).toContain('Unsupported DeepInfra image transform capability')
  })
})
