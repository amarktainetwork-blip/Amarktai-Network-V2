/**
 * Together AI image adapter — live integration for image.* capabilities.
 *
 * Handles: image_generation, image_edit
 *
 * Routes image payloads to active FLUX model families via Together AI.
 * Pipes returned base64 image data into packages/artifacts for storage,
 * dimension capture, and database Artifact row creation.
 */

import { saveArtifact } from '@amarktai/artifacts'
import { togetherGenerateImage, type TogetherImageRequest } from '@amarktai/providers'
import type { ProviderAdapter, ProviderExecutionContext, ProviderExecutionResult } from './provider-adapter.js'

export class TogetherImageAdapter implements ProviderAdapter {
  name = 'together'
  supportedPrefixes = ['image']

  async execute(context: ProviderExecutionContext): Promise<ProviderExecutionResult> {
    const request: TogetherImageRequest = {
      prompt: context.prompt,
      width: (context.input.width as number) ?? 1024,
      height: (context.input.height as number) ?? 1024,
      steps: (context.input.steps as number) ?? 4,
      seed: context.input.seed as number | undefined,
      negativePrompt: context.input.negativePrompt as string | undefined,
    }

    const result = await togetherGenerateImage(request)

    if (result.images.length === 0) {
      throw new Error('Together returned no images')
    }

    const image = result.images[0]!

    // Save image artifact via packages/artifacts
    const artifact = await saveArtifact({
      input: {
        appSlug: context.appSlug,
        type: 'image',
        subType: context.capability,
        title: `${context.capability} output for ${context.appSlug}`,
        description: `Together AI ${context.capability} image`,
        provider: 'together',
        model: result.model,
        traceId: context.traceId,
        mimeType: image.mimeType,
        metadata: {
          capability: context.capability,
          width: image.width,
          height: image.height,
          format: 'png',
          usage: result.usage,
        },
      },
      data: image.buffer,
      explicitMimeType: image.mimeType,
    })

    return {
      success: true,
      provider: 'together',
      model: result.model,
      artifactId: artifact.id,
      metadata: {
        artifactId: artifact.id,
        width: image.width,
        height: image.height,
        usage: result.usage,
      },
    }
  }
}
