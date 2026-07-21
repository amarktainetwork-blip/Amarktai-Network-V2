import { beforeEach, describe, expect, it, vi } from 'vitest'
import { makeAppGrantSnapshot } from './helpers/app-grant.js'

const executeWithProvider = vi.hoisted(() => vi.fn())
const executeLongFormAssembly = vi.hoisted(() => vi.fn())

vi.mock('@amarktai/db', () => ({
  prisma: {
    job: {
      findUnique: vi.fn(),
      updateMany: vi.fn(),
    },
  },
}))

vi.mock('../apps/worker/src/providers/provider-executor.ts', () => ({ executeWithProvider }))
vi.mock('../apps/worker/src/long-form-assembly.ts', () => ({ executeLongFormAssembly }))

import { executeWithDurableProviderFallback } from '../apps/worker/src/providers/durable-provider-fallback.ts'

describe('durable worker local assembly dispatch', () => {
  beforeEach(() => {
    vi.clearAllMocks()
  })

  it('executes internal FFmpeg assembly locally and never enters provider routing', async () => {
    executeLongFormAssembly.mockResolvedValueOnce({
      success: true,
      status: 'completed',
      provider: 'local',
      model: 'ffmpeg-durable-assembly',
      artifactId: 'final-video-artifact',
      output: JSON.stringify({
        finalVideoValidated: true,
        finalAudioValidated: true,
        voiceoverIncluded: true,
        subtitlesIncluded: true,
        musicBedIncluded: true,
      }),
    })

    const payload = {
      jobId: 'b1a1f1dd-5264-5e12-9cb0-d06af8b0b142',
      appSlug: 'dashboard-long-form',
      capability: 'long_form_video',
      executionProfile: 'internal_dashboard' as const,
      prompt: 'Assemble long-form execution',
      input: {},
      metadata: {
        longFormVideo: true,
        longFormAssembly: true,
        internalLocalExecution: true,
        parentJobId: '13b0f04b-2470-4dd1-809e-265d72179764',
        appGrantSnapshot: makeAppGrantSnapshot('dashboard-long-form', 'long_form_video'),
      },
      traceId: 'trace-long-form-assembly',
      routingMode: 'balanced',
      appGrantSnapshot: makeAppGrantSnapshot('dashboard-long-form', 'long_form_video'),
    }

    const result = await executeWithDurableProviderFallback(payload)

    expect(result).toMatchObject({
      success: true,
      provider: 'local',
      model: 'ffmpeg-durable-assembly',
      artifactId: 'final-video-artifact',
    })
    expect(executeLongFormAssembly).toHaveBeenCalledTimes(1)
    expect(executeLongFormAssembly).toHaveBeenCalledWith(payload)
    expect(executeWithProvider).not.toHaveBeenCalled()
  })

  it('continues to route ordinary provider-backed work through Orchestra', async () => {
    executeWithProvider.mockResolvedValueOnce({
      success: true,
      status: 'completed',
      provider: 'genx',
      model: 'seedance-v1-fast-i2v',
      artifactId: 'provider-video',
    })

    const payload = {
      jobId: '6f76479e-d85f-4be7-a607-f7e03743ef77',
      appSlug: 'dashboard-video',
      capability: 'image_to_video',
      executionProfile: 'internal_dashboard' as const,
      prompt: 'Animate the source image',
      input: { sourceImageArtifactId: 'source-image' },
      metadata: {},
      traceId: 'trace-provider-video',
      routingMode: 'balanced',
      appGrantSnapshot: makeAppGrantSnapshot('dashboard-video', 'image_to_video'),
    }

    const result = await executeWithDurableProviderFallback(payload)

    expect(result.success).toBe(true)
    expect(executeWithProvider).toHaveBeenCalledTimes(1)
    expect(executeLongFormAssembly).not.toHaveBeenCalled()
  })
})
