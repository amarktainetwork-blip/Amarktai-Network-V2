/**
 * Video simulation adapter — local mock for video.* capabilities.
 *
 * Handles: video_generation, avatar_generation
 *
 * Behavior:
 *   1. Simulate sequence state transitions with progress updates
 *   2. Generate a minimal mock video buffer (MP4 stub)
 *   3. Log updates to the dashboard interface via DB status updates
 *   4. Return status: 'completed'
 */

import { saveArtifact } from '@amarktai/artifacts'
import { prisma } from '@amarktai/db'
import type { ProviderAdapter, ProviderExecutionContext, ProviderExecutionResult } from './provider-adapter.js'

export class VideoSimulationAdapter implements ProviderAdapter {
  name = 'local-sim-video'
  supportedPrefixes = ['video']

  async execute(context: ProviderExecutionContext): Promise<ProviderExecutionResult> {
    // State transition: queued → processing
    await this.updateJobStatus(context, 'processing', 10)
    await sleep(800)

    // State transition: rendering
    await this.updateJobStatus(context, 'processing', 30)
    await sleep(800)

    // State transition: encoding
    await this.updateJobStatus(context, 'processing', 60)
    await sleep(800)

    // State transition: finalizing
    await this.updateJobStatus(context, 'processing', 90)
    await sleep(400)

    // Generate mock MP4 stub (not a real video, but valid enough for storage)
    const mockMp4 = Buffer.from('mock-video-data-' + context.jobId)

    const artifact = await saveArtifact({
      input: {
        appSlug: context.appSlug,
        type: 'video',
        subType: context.capability,
        title: `${context.capability} output for ${context.appSlug}`,
        description: `Simulated ${context.capability} video`,
        provider: this.name,
        model: 'local-sim-video-v1',
        traceId: context.traceId,
        mimeType: 'video/mp4',
        metadata: {
          simulated: true,
          capability: context.capability,
          durationSeconds: 5,
          width: 1920,
          height: 1080,
          fps: 30,
        },
      },
      data: mockMp4,
      explicitMimeType: 'video/mp4',
    })

    return {
      success: true,
      provider: this.name,
      model: 'local-sim-video-v1',
      artifactId: artifact.id,
      metadata: {
        simulated: true,
        artifactId: artifact.id,
        durationSeconds: 5,
        width: 1920,
        height: 1080,
      },
    }
  }

  private async updateJobStatus(
    context: ProviderExecutionContext,
    status: string,
    progress: number,
  ): Promise<void> {
    try {
      await prisma.job.update({
        where: { id: context.jobId },
        data: {
          status,
          progress,
          ...(status === 'processing' ? { startedAt: new Date() } : {}),
        },
      })
    } catch {
      // Non-critical
    }
  }
}

function sleep(ms: number): Promise<void> {
  return new Promise((resolve) => setTimeout(resolve, ms))
}
