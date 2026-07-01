/**
 * Groq voice adapter — live integration for voice.* capabilities.
 *
 * Handles: tts, stt, music_generation
 *
 * - STT: Processes inbound binary audio through Groq whisper-large-v3
 * - TTS: Slices prompts into sub-200 char segments, concatenates WAV buffers
 * - Music: Falls back to simulation (no live music provider yet)
 *
 * All WAV concatenation uses local buffer manipulation — no ffmpeg dependency required.
 */

import { saveArtifact } from '@amarktai/artifacts'
import { prisma } from '@amarktai/db'
import { groqStt, groqTts } from '@amarktai/providers'
import type { ProviderAdapter, ProviderExecutionContext, ProviderExecutionResult } from './provider-adapter.js'

export class GroqVoiceAdapter implements ProviderAdapter {
  name = 'groq'
  supportedPrefixes = ['voice']

  async execute(context: ProviderExecutionContext): Promise<ProviderExecutionResult> {
    switch (context.capability) {
      case 'stt':
        return this.executeStt(context)
      case 'tts':
        return this.executeTts(context)
      case 'music_generation':
        return this.executeMusicFallback(context)
      default:
        throw new Error(`Groq voice adapter does not support capability: ${context.capability}`)
    }
  }

  // ── Speech-to-Text ────────────────────────────────────────────────────────

  private async executeStt(context: ProviderExecutionContext): Promise<ProviderExecutionResult> {
    await this.updateJobStatus(context, 'processing', 10)

    // Extract audio buffer from input
    const audioBase64 = context.input.audio as string | undefined
    if (!audioBase64) {
      throw new Error('STT requires audio data in input.audio (base64 encoded)')
    }

    const audioBuffer = Buffer.from(audioBase64, 'base64')
    const filename = (context.input.filename as string) ?? 'audio.wav'

    await this.updateJobStatus(context, 'processing', 30)

    // Call Groq Whisper
    const sttResult = await groqStt(audioBuffer, filename)

    await this.updateJobStatus(context, 'processing', 70)

    // Save transcript artifact
    const artifact = await saveArtifact({
      input: {
        appSlug: context.appSlug,
        type: 'transcript',
        subType: 'stt',
        title: `STT transcript for ${context.appSlug}`,
        description: `Groq Whisper transcription`,
        provider: 'groq',
        model: 'whisper-large-v3',
        traceId: context.traceId,
        mimeType: 'text/plain',
        metadata: {
          language: sttResult.language,
          duration: sttResult.duration,
          capability: 'stt',
        },
      },
      data: Buffer.from(sttResult.text, 'utf-8'),
      explicitMimeType: 'text/plain',
    })

    return {
      success: true,
      provider: 'groq',
      model: 'whisper-large-v3',
      artifactId: artifact.id,
      output: sttResult.text,
      metadata: {
        artifactId: artifact.id,
        language: sttResult.language,
        duration: sttResult.duration,
      },
    }
  }

  // ── Text-to-Speech ────────────────────────────────────────────────────────

  private async executeTts(context: ProviderExecutionContext): Promise<ProviderExecutionResult> {
    await this.updateJobStatus(context, 'processing', 10)

    const text = context.prompt
    if (!text) {
      throw new Error('TTS requires text in the prompt field')
    }

    await this.updateJobStatus(context, 'processing', 30)

    // Call Groq Orpheus TTS (handles 200-char chunking internally)
    const ttsResult = await groqTts(text)

    await this.updateJobStatus(context, 'processing', 80)

    // Save audio artifact
    const artifact = await saveArtifact({
      input: {
        appSlug: context.appSlug,
        type: 'audio',
        subType: 'tts',
        title: `TTS audio for ${context.appSlug}`,
        description: `Groq Orpheus TTS output`,
        provider: 'groq',
        model: ttsResult.model,
        traceId: context.traceId,
        mimeType: 'audio/wav',
        metadata: {
          capability: 'tts',
          textLength: text.length,
          audioSizeBytes: ttsResult.audioBuffer.length,
        },
      },
      data: ttsResult.audioBuffer,
      explicitMimeType: 'audio/wav',
    })

    return {
      success: true,
      provider: 'groq',
      model: ttsResult.model,
      artifactId: artifact.id,
      metadata: {
        artifactId: artifact.id,
        audioSizeBytes: ttsResult.audioBuffer.length,
      },
    }
  }

  // ── Music Generation Fallback ─────────────────────────────────────────────

  private async executeMusicFallback(context: ProviderExecutionContext): Promise<ProviderExecutionResult> {
    // No live music provider yet — generate a mock WAV
    await this.updateJobStatus(context, 'processing', 25)
    await sleep(500)
    await this.updateJobStatus(context, 'processing', 50)
    await sleep(500)
    await this.updateJobStatus(context, 'processing', 75)
    await sleep(500)

    const mockWav = this.createMockWav()

    const artifact = await saveArtifact({
      input: {
        appSlug: context.appSlug,
        type: 'music',
        subType: 'music_generation',
        title: `Music output for ${context.appSlug}`,
        description: `Simulated music generation (no live provider)`,
        provider: 'groq',
        model: 'sim-music-v1',
        traceId: context.traceId,
        mimeType: 'audio/wav',
        metadata: { simulated: true, capability: 'music_generation' },
      },
      data: mockWav,
      explicitMimeType: 'audio/wav',
    })

    return {
      success: true,
      provider: 'groq',
      model: 'sim-music-v1',
      artifactId: artifact.id,
      metadata: { simulated: true, artifactId: artifact.id },
    }
  }

  // ── Helpers ─────────────────────────────────────────────────────────────

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

  private createMockWav(): Buffer {
    const sampleRate = 8000
    const numChannels = 1
    const bitsPerSample = 16
    const duration = 1
    const dataSize = sampleRate * numChannels * (bitsPerSample / 8) * duration
    const buf = Buffer.alloc(44 + dataSize)
    buf.write('RIFF', 0)
    buf.writeUInt32LE(36 + dataSize, 4)
    buf.write('WAVE', 8)
    buf.write('fmt ', 12)
    buf.writeUInt32LE(16, 16)
    buf.writeUInt16LE(1, 20)
    buf.writeUInt16LE(numChannels, 22)
    buf.writeUInt32LE(sampleRate, 24)
    buf.writeUInt32LE(sampleRate * numChannels * (bitsPerSample / 8), 28)
    buf.writeUInt16LE(numChannels * (bitsPerSample / 8), 32)
    buf.writeUInt16LE(bitsPerSample, 34)
    buf.write('data', 36)
    buf.writeUInt32LE(dataSize, 40)
    return buf
  }
}

function sleep(ms: number): Promise<void> {
  return new Promise((resolve) => setTimeout(resolve, ms))
}
