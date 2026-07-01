/**
 * GenX video adapter — live integration for video.* capabilities.
 *
 * Handles: video_generation, avatar_generation
 *
 * Implements async video generation with long-polling:
 *   1. Submit prompt to GenX, recover remote job tracker ID
 *   2. Transition DB job status to 'processing'
 *   3. Poll GenX servers at regular intervals (5s)
 *   4. On completion, fetch MP4 binary, save to artifact storage
 *   5. Mark job as 'completed'
 */

import { saveArtifact } from '@amarktai/artifacts'
import { prisma } from '@amarktai/db'
import {
  genxSubmitVideo,
  genxPollVideo,
  genxDownloadVideo,
  GENX_POLL_INTERVAL_MS,
  GENX_POLL_MAX_ATTEMPTS,
  type GenxVideoRequest,
} from '@amarktai/providers'
import type { ProviderAdapter, ProviderExecutionContext, ProviderExecutionResult } from './provider-adapter.js'

export class GenxVideoAdapter implements ProviderAdapter {
  name = 'genx'
  supportedPrefixes = ['video']

  async execute(context: ProviderExecutionContext): Promise<ProviderExecutionResult> {
    // 1. Build video request from context
    const request: GenxVideoRequest = {
      prompt: context.prompt,
      duration: (context.input.duration as number) ?? 5,
      aspectRatio: (context.input.aspectRatio as string) ?? '16:9',
      style: context.input.style as string | undefined,
      negativePrompt: context.input.negativePrompt as string | undefined,
    }

    // 2. Submit to GenX and get remote job tracker ID
    await this.updateJobStatus(context, 'processing', 5)
    const submitResult = await genxSubmitVideo(request)

    if (!submitResult.jobId) {
      throw new Error('GenX did not return a job ID')
    }

    // 3. Store the remote job ID in metadata for tracking
    await prisma.job.update({
      where: { id: context.jobId },
      data: {
        metadataJson: JSON.stringify({
          ...context.metadata,
          genxJobId: submitResult.jobId,
        }),
      },
    })

    await this.updateJobStatus(context, 'processing', 10)

    // 4. Long-poll GenX servers at regular intervals
    let attempts = 0
    while (attempts < GENX_POLL_MAX_ATTEMPTS) {
      await sleep(GENX_POLL_INTERVAL_MS)
      attempts++

      const pollResult = await genxPollVideo(submitResult.jobId)

      // Update progress based on GenX's reported progress
      const mappedProgress = Math.min(90, Math.max(10, pollResult.progress))
      await this.updateJobStatus(context, 'processing', mappedProgress)

      if (pollResult.status === 'failed') {
        throw new Error(`GenX video generation failed: ${pollResult.error ?? 'unknown error'}`)
      }

      if (pollResult.status === 'completed' && pollResult.resultUrl) {
        // 5. Download the completed MP4
        await this.updateJobStatus(context, 'processing', 95)
        const videoResult = await genxDownloadVideo(pollResult.resultUrl)

        // 6. Save to artifact storage
        const artifact = await saveArtifact({
          input: {
            appSlug: context.appSlug,
            type: 'video',
            subType: context.capability,
            title: `${context.capability} output for ${context.appSlug}`,
            description: `GenX ${context.capability} video`,
            provider: 'genx',
            model: 'genx-video',
            traceId: context.traceId,
            mimeType: videoResult.mimeType,
            metadata: {
              capability: context.capability,
              durationSeconds: videoResult.duration,
              width: videoResult.width,
              height: videoResult.height,
              genxJobId: submitResult.jobId,
              pollAttempts: attempts,
              sizeBytes: videoResult.videoBuffer.length,
            },
          },
          data: videoResult.videoBuffer,
          explicitMimeType: videoResult.mimeType,
        })

        return {
          success: true,
          provider: 'genx',
          model: 'genx-video',
          artifactId: artifact.id,
          metadata: {
            artifactId: artifact.id,
            durationSeconds: videoResult.duration,
            width: videoResult.width,
            height: videoResult.height,
            genxJobId: submitResult.jobId,
          },
        }
      }
    }

    throw new Error(`GenX video generation timed out after ${GENX_POLL_MAX_ATTEMPTS} poll attempts`)
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
