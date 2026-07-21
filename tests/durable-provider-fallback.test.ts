import { beforeEach, describe, expect, it, vi } from 'vitest'

const state = vi.hoisted(() => ({
  claimAt: new Date('2026-07-20T20:00:00.000Z') as Date | null,
  metadata: {} as Record<string, unknown>,
}))

const executeWithProvider = vi.hoisted(() => vi.fn())
const findUnique = vi.hoisted(() => vi.fn())
const updateMany = vi.hoisted(() => vi.fn())

vi.mock('@amarktai/db', () => ({
  prisma: {
    job: {
      findUnique,
      updateMany,
    },
  },
}))

vi.mock('../apps/worker/src/providers/provider-executor.ts', () => ({
  executeWithProvider,
}))

import { executeWithDurableProviderFallback } from '../apps/worker/src/providers/durable-provider-fallback.ts'
import { makeAppGrantSnapshot } from './helpers/app-grant.js'

function payload() {
  const appSlug = 'dashboard-video'
  const capability = 'image_to_video'
  return {
    jobId: 'i2v-fallback-job',
    appSlug,
    capability,
    prompt: 'Animate the authorised source image',
    input: { sourceImageArtifactId: 'source-image', duration: 3 },
    metadata: {},
    traceId: 'trace-i2v-fallback',
    appGrantSnapshot: makeAppGrantSnapshot(appSlug, capability),
  }
}

function attempts() {
  return [
    {
      provider: 'genx',
      model: 'premium-primary-i2v',
      executorId: 'genx.image-to-video',
      success: false,
      error: 'GenX execution failed before provider submission',
    },
    {
      provider: 'genx',
      model: 'seedance-v1-fast-i2v',
      executorId: 'genx.image-to-video',
      success: false,
      error: 'Execution already claimed by another worker',
    },
  ]
}

describe('durable provider fallback claim recovery', () => {
  beforeEach(() => {
    vi.clearAllMocks()
    state.claimAt = new Date('2026-07-20T20:00:00.000Z')
    state.metadata = { orchestraRouteAttempts: attempts() }
    findUnique.mockImplementation(async () => ({
      status: 'processing',
      providerClaimAt: state.claimAt,
      metadataJson: JSON.stringify(state.metadata),
    }))
    updateMany.mockImplementation(async ({ where, data }: any) => {
      if (where.providerClaimAt !== state.claimAt || state.claimAt === null) return { count: 0 }
      state.claimAt = data.providerClaimAt
      state.metadata = JSON.parse(data.metadataJson)
      return { count: 1 }
    })
  })

  it('atomically transfers the same execution claim to the recorded fallback route and retries once', async () => {
    executeWithProvider
      .mockResolvedValueOnce({
        success: false,
        status: 'failed',
        provider: 'genx',
        model: 'seedance-v1-fast-i2v',
        error: 'Execution already claimed by another worker',
        metadata: { routeAttempts: attempts() },
      })
      .mockResolvedValueOnce({
        success: true,
        status: 'completed',
        provider: 'genx',
        model: 'seedance-v1-fast-i2v',
        artifactId: 'i2v-artifact',
        metadata: { outputValidation: { valid: true } },
      })

    const result = await executeWithDurableProviderFallback(payload())

    expect(result.success).toBe(true)
    expect(result.artifactId).toBe('i2v-artifact')
    expect(executeWithProvider).toHaveBeenCalledTimes(2)
    expect(updateMany).toHaveBeenCalledTimes(1)
    expect(updateMany).toHaveBeenCalledWith(expect.objectContaining({
      where: expect.objectContaining({
        id: 'i2v-fallback-job',
        status: 'processing',
        providerClaimAt: new Date('2026-07-20T20:00:00.000Z'),
      }),
      data: expect.objectContaining({ providerClaimAt: null }),
    }))
    expect(state.metadata.orchestraSelectedProvider).toBe('genx')
    expect(state.metadata.orchestraSelectedModel).toBe('seedance-v1-fast-i2v')
    expect(state.metadata.orchestraSelectedExecutorId).toBe('genx.image-to-video')
    expect(result.metadata?.durableProviderFallbackRecovery).toEqual(expect.objectContaining({
      recovered: true,
      model: 'seedance-v1-fast-i2v',
    }))
  })

  it('resumes the exact submitted GenX model instead of changing models or submitting a duplicate', async () => {
    state.metadata = {
      orchestraRouteAttempts: attempts(),
      genxProviderJobId: 'remote-video-job',
      genxProviderModel: 'premium-primary-i2v',
    }
    executeWithProvider
      .mockResolvedValueOnce({ success: false, status: 'failed', error: 'Execution already claimed by another worker' })
      .mockResolvedValueOnce({ success: true, status: 'completed', provider: 'genx', model: 'premium-primary-i2v', artifactId: 'resumed-artifact' })

    const result = await executeWithDurableProviderFallback(payload())

    expect(result.success).toBe(true)
    expect(state.metadata.orchestraSelectedModel).toBe('premium-primary-i2v')
    expect(state.metadata.orchestraSelectedExecutorId).toBe('genx.image-to-video')
    expect(executeWithProvider).toHaveBeenCalledTimes(2)
  })

  it('does not clear a genuine single-owner claim without a primary and fallback sequence', async () => {
    state.metadata = {
      orchestraRouteAttempts: [{
        provider: 'genx', model: 'seedance-v1-fast-i2v', executorId: 'genx.image-to-video',
        success: false, error: 'Execution already claimed by another worker',
      }],
    }
    const failure = { success: false, status: 'failed' as const, error: 'Execution already claimed by another worker' }
    executeWithProvider.mockResolvedValueOnce(failure)

    const result = await executeWithDurableProviderFallback(payload())

    expect(result).toEqual(failure)
    expect(executeWithProvider).toHaveBeenCalledTimes(1)
    expect(updateMany).not.toHaveBeenCalled()
  })

  it('fails closed when the compare-and-set cannot release the exact claim timestamp', async () => {
    const failure = { success: false, status: 'failed' as const, error: 'Execution already claimed by another worker' }
    executeWithProvider.mockResolvedValueOnce(failure)
    updateMany.mockResolvedValueOnce({ count: 0 })

    const result = await executeWithDurableProviderFallback(payload())

    expect(result).toEqual(failure)
    expect(executeWithProvider).toHaveBeenCalledTimes(1)
  })
})
