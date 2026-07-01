/**
 * Voice simulation adapter — local mock for voice.* capabilities.
 *
 * Handles: tts, stt, music_generation
 *
 * Behavior:
 *   1. Simulate sequence state transitions (queued → processing → completed)
 *   2. Generate a minimal mock audio buffer
 *   3. Log updates to the dashboard interface via DB status updates
 *   4. Return status: 'completed'
 */

import { saveArtifact } from '@amarktai/artifacts'
import { prisma } from '@amarktai/db'
import type { ProviderAdapter, ProviderExecutionContext, ProviderExecutionResult } from './provider-adapter.js'

// Minimal valid WAV header (silent, 1 second, 8kHz, 16-bit mono)
function createMockWav(): Buffer {
  const sampleRate = 8000
  const numChannels = 1
  const bitsPerSample = 16
  const duration = 1
  const dataSize = sampleRate * numChannels * (bitsPerSample / 8) * duration
  const headerSize = 44
  const buf = Buffer.alloc(headerSize + dataSize)

  // RIFF header
  buf.write('RIFF', 0)
  buf.writeUInt32LE(36 + dataSize, 4)
  buf.write('WAVE', 8)

  // fmt chunk
  buf.write('fmt ', 12)
  buf.writeUInt32LE(16, 16)
  buf.writeUInt16LE(1, 20) // PCM
  buf.writeUInt16LE(numChannels, 22)
  buf.writeUInt32LE(sampleRate, 24)
  buf.writeUInt32LE(sampleRate * numChannels * (bitsPerSample / 8), 28)
  buf.writeUInt16LE(numChannels * (bitsPerSample / 8), 32)
  buf.writeUInt16LE(bitsPerSample, 34)

  // data chunk
  buf.write('data', 36)
  buf.writeUInt32LE(dataSize, 40)
  // rest is zeros (silence)

  return buf
}

export class VoiceSimulationAdapter implements ProviderAdapter {
  name = 'local-sim-voice'
  supportedPrefixes = ['voice']

  async execute(context: ProviderExecutionContext): Promise<ProviderExecutionResult> {
    // State transition: processing
    await this.updateJobStatus(context, 'processing', 25)
    await sleep(500)

    // State transition: generating
    await this.updateJobStatus(context, 'processing', 50)
    await sleep(500)

    // State transition: finalizing
    await this.updateJobStatus(context, 'processing', 75)
    await sleep(500)

    // Generate mock audio
    const audioData = createMockWav()

    // Determine artifact type and MIME
    const isMusic = context.capability === 'music_generation'
    const artifactType = isMusic ? 'music' : 'audio'
    const mimeType = 'audio/wav'

    // Save artifact
    const artifact = await saveArtifact({
      input: {
        appSlug: context.appSlug,
        type: artifactType as 'audio' | 'music',
        subType: context.capability,
        title: `${context.capability} output for ${context.appSlug}`,
        description: `Simulated ${context.capability} audio`,
        provider: this.name,
        model: 'local-sim-voice-v1',
        traceId: context.traceId,
        mimeType,
        metadata: {
          simulated: true,
          capability: context.capability,
          durationSeconds: 1,
          sampleRate: 8000,
          channels: 1,
        },
      },
      data: audioData,
      explicitMimeType: mimeType,
    })

    return {
      success: true,
      provider: this.name,
      model: 'local-sim-voice-v1',
      artifactId: artifact.id,
      metadata: { simulated: true, artifactId: artifact.id, durationSeconds: 1 },
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
      // Non-critical — don't fail the job over status update
    }
  }
}

function sleep(ms: number): Promise<void> {
  return new Promise((resolve) => setTimeout(resolve, ms))
}
