/**
 * Image simulation adapter — local mock for image.* capabilities.
 *
 * Handles: image_generation, image_edit
 *
 * Behavior:
 *   1. Generate a minimal valid PNG mock image
 *   2. Write image asset with width/height metadata
 *   3. Return status: 'completed'
 */

import { saveArtifact } from '@amarktai/artifacts'
import type { ProviderAdapter, ProviderExecutionContext, ProviderExecutionResult } from './provider-adapter.js'

// Minimal valid 1x1 red PNG (67 bytes)
const MOCK_PNG = Buffer.from(
  'iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAYAAAAfFcSJAAAADUlEQVR42mP8/5+hHgAHggJ/PchI7wAAAABJRU5ErkJggg==',
  'base64',
)

export class ImageSimulationAdapter implements ProviderAdapter {
  name = 'local-sim-image'
  supportedPrefixes = ['image']

  async execute(context: ProviderExecutionContext): Promise<ProviderExecutionResult> {
    // Simulate processing latency
    await sleep(1500)

    const width = 1024
    const height = 1024

    // Save mock image artifact
    const artifact = await saveArtifact({
      input: {
        appSlug: context.appSlug,
        type: 'image',
        subType: context.capability,
        title: `${context.capability} output for ${context.appSlug}`,
        description: `Simulated ${context.capability} image`,
        provider: this.name,
        model: 'local-sim-image-v1',
        traceId: context.traceId,
        mimeType: 'image/png',
        metadata: {
          simulated: true,
          capability: context.capability,
          width,
          height,
          format: 'png',
        },
      },
      data: MOCK_PNG,
      explicitMimeType: 'image/png',
    })

    return {
      success: true,
      provider: this.name,
      model: 'local-sim-image-v1',
      artifactId: artifact.id,
      metadata: { simulated: true, artifactId: artifact.id, width, height },
    }
  }
}

function sleep(ms: number): Promise<void> {
  return new Promise((resolve) => setTimeout(resolve, ms))
}
