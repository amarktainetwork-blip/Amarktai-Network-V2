/**
 * Groq voice adapter - live integration for voice.* capabilities.
 *
 * Handles: tts, stt
 *
 * - STT: Processes inbound binary audio through Groq whisper-large-v3
 * - TTS: Slices prompts into sub-200 char segments, concatenates WAV buffers
 *
 * All WAV concatenation uses local buffer manipulation; no ffmpeg dependency required.
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
      default:
        throw new Error(`Groq voice adapter does not support capability: ${context.capability}`)
    }
  }

  private async executeStt(context: ProviderExecutionContext): Promise<ProviderExecutionResult> {
    await this.updateJobStatus(context, 'processing', 10)

    const audioBase64 = context.input.audio as string | undefined
    if (!audioBase64) {
      throw new Error('STT requires audio data in input.audio (base64 encoded)')
    }

    const audioBuffer = Buffer.from(audioBase64, 'base64')
    const filename = (context.input.filename as string) ?? 'audio.wav'

    await this.updateJobStatus(context, 'processing', 30)

    const sttResult = await groqStt(audioBuffer, filename)

    await this.updateJobStatus(context, 'processing', 70)

    const artifact = await saveArtifact({
      input: {
        appSlug: context.appSlug,
        type: 'transcript',
        subType: 'stt',
        title: `STT transcript for ${context.appSlug}`,
        description: 'Groq Whisper transcription',
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

  private async executeTts(context: ProviderExecutionContext): Promise<ProviderExecutionResult> {
    await this.updateJobStatus(context, 'processing', 10)

    const text = context.prompt
    if (!text) {
      throw new Error('TTS requires text in the prompt field')
    }

    await this.updateJobStatus(context, 'processing', 30)

    const ttsResult = await groqTts(text)

    await this.updateJobStatus(context, 'processing', 80)

    const artifact = await saveArtifact({
      input: {
        appSlug: context.appSlug,
        type: 'audio',
        subType: 'tts',
        title: `TTS audio for ${context.appSlug}`,
        description: 'Groq Orpheus TTS output',
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
      // Non-critical status updates should not hide provider execution results.
    }
  }
}
