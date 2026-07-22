/**
 * Voice Audio Handlers — isolated worker handlers for voice and audio operations.
 *
 * These handlers execute through the domain services with real FFmpeg operations
 * for internal audio transformations. Voice clone and voice conversion return
 * truthful provider blockers when no production provider route exists.
 */

import { execFile } from 'node:child_process'
import { mkdtemp, readFile, rm, writeFile } from 'node:fs/promises'
import { tmpdir } from 'node:os'
import { join } from 'node:path'
import { promisify } from 'node:util'
import {
  createVoiceCloneDomainService,
  createFixtureVoiceCloneProviderAdapter,
  type VoiceCloneResult,
} from '@amarktai/core/voice-clone-contracts'
import {
  createVoiceConversionDomainService,
  createFixtureVoiceConversionProviderAdapter,
  type VoiceConversionResult,
} from '@amarktai/core/voice-conversion-contracts'
import {
  type AudioToAudioOperation,
  type AudioToAudioResult,
} from '@amarktai/core/audio-to-audio-contracts'
import type { ProcessorResult, WorkerJobData } from '../processors/job-processor.js'

const execFileAsync = promisify(execFile)

// ── Types ─────────────────────────────────────────────────────────────────────

export interface VoiceAudioJobData {
  capability: 'voice_clone' | 'voice_conversion' | 'audio_to_audio'
  appSlug: string
  requestId: string
  input: Record<string, unknown>
  sourceAudioBuffer?: Buffer
  sourceMimeType?: string
  metadata?: Record<string, unknown>
}

export interface VoiceAudioJobResult {
  success: boolean
  status: string
  data?: VoiceCloneResult | VoiceConversionResult | AudioToAudioResult
  error?: string
  errorCode?: string
}

// ── FFmpeg Execution ──────────────────────────────────────────────────────────

async function runFfmpeg(args: string[], timeoutMs = 60_000): Promise<void> {
  const ffmpeg = process.env.FFMPEG_PATH?.trim() || 'ffmpeg'
  await execFileAsync(ffmpeg, args, { timeout: timeoutMs, windowsHide: true })
}

async function runFfprobe(args: string[], timeoutMs = 30_000): Promise<string> {
  const ffprobe = process.env.FFPROBE_PATH?.trim() || 'ffprobe'
  const { stdout } = await execFileAsync(ffprobe, args, { timeout: timeoutMs, windowsHide: true })
  return stdout
}

async function probeAudio(filePath: string): Promise<{
  duration: number
  sampleRate: number
  channels: number
  codec: string
  bitRate: number
}> {
  const stdout = await runFfprobe([
    '-v', 'error',
    '-select_streams', 'a:0',
    '-show_entries', 'stream=sample_rate,channels,codec_name,bit_rate',
    '-show_entries', 'format=duration,bit_rate',
    '-of', 'json',
    filePath,
  ])

  const data = JSON.parse(stdout)
  const stream = data.streams?.[0] ?? {}
  const format = data.format ?? {}

  return {
    duration: parseFloat(format.duration ?? '0'),
    sampleRate: parseInt(stream.sample_rate ?? '0', 10),
    channels: parseInt(stream.channels ?? '0', 10),
    codec: stream.codec_name ?? 'unknown',
    bitRate: parseInt(stream.bit_rate ?? format.bit_rate ?? '0', 10),
  }
}

// ── Internal FFmpeg Operations ────────────────────────────────────────────────

interface FfmpegOperationResult {
  outputBuffer: Buffer
  outputMimeType: string
  validation: {
    duration: number
    sampleRate: number
    channels: number
    codec: string
    bitRate: number
  }
}

async function executeFfmpegOperation(
  operation: AudioToAudioOperation,
  sourceBuffer: Buffer,
  sourceMimeType: string,
  parameters: Record<string, unknown>,
  outputFormat: string,
): Promise<FfmpegOperationResult> {
  const dir = await mkdtemp(join(tmpdir(), 'amarktai-audio-'))
  try {
    const ext = sourceMimeType === 'audio/wav' ? 'wav' :
      sourceMimeType === 'audio/mpeg' ? 'mp3' :
      sourceMimeType === 'audio/flac' ? 'flac' :
      sourceMimeType === 'audio/ogg' ? 'ogg' : 'wav'
    const inputFile = join(dir, `input.${ext}`)
    const outputFile = join(dir, `output.${outputFormat}`)

    await writeFile(inputFile, sourceBuffer)

    const inputProbe = await probeAudio(inputFile)

    const baseArgs = ['-hide_banner', '-loglevel', 'error', '-y', '-i', inputFile]

    switch (operation) {
      case 'trim': {
        const startTime = typeof parameters.startTime === 'number' ? parameters.startTime / 1000 : 0
        const endTime = typeof parameters.endTime === 'number' ? parameters.endTime / 1000 : inputProbe.duration
        const duration = endTime - startTime
        await runFfmpeg([...baseArgs, '-ss', String(startTime), '-t', String(duration), '-c', 'copy', outputFile])
        break
      }
      case 'resample': {
        const targetSampleRate = typeof parameters.sampleRate === 'number' ? parameters.sampleRate : 44100
        await runFfmpeg([...baseArgs, '-ar', String(targetSampleRate), outputFile])
        break
      }
      case 'channel_convert': {
        const targetChannels = typeof parameters.channels === 'number' ? parameters.channels : 1
        await runFfmpeg([...baseArgs, '-ac', String(targetChannels), outputFile])
        break
      }
      case 'loudness_normalize': {
        const targetLufs = typeof parameters.targetLufs === 'number' ? parameters.targetLufs : -16
        await runFfmpeg([...baseArgs, '-af', `loudnorm=I=${targetLufs}:TP=-1.5:LRA=11`, outputFile])
        break
      }
      case 'normalize': {
        await runFfmpeg([...baseArgs, '-af', 'loudnorm=I=-16:TP=-1.5:LRA=11', outputFile])
        break
      }
      default:
        throw new Error(`Unsupported internal FFmpeg operation: ${operation}`)
    }

    const outputBuffer = await readFile(outputFile)
    const outputProbe = await probeAudio(outputFile)

    const outputMimeType = outputFormat === 'wav' ? 'audio/wav' :
      outputFormat === 'mp3' ? 'audio/mpeg' :
      outputFormat === 'flac' ? 'audio/flac' : 'audio/ogg'

    return {
      outputBuffer,
      outputMimeType,
      validation: outputProbe,
    }
  } finally {
    await rm(dir, { recursive: true, force: true }).catch(() => {})
  }
}

// ── Voice Clone Handler ───────────────────────────────────────────────────────

export async function handleVoiceCloneJob(payload: WorkerJobData): Promise<ProcessorResult> {
  try {
    const domainService = createVoiceCloneDomainService(createFixtureVoiceCloneProviderAdapter())

    const input = payload.input ?? {}
    const validation = domainService.validateRequest(input)
    if (!validation.success) {
      return {
        success: false,
        status: 'failed',
        error: validation.error,
        provider: 'fixture',
        model: 'voice_clone',
      }
    }

    // Voice clone requires a provider route - return truthful blocker
    return {
      success: false,
      status: 'failed',
      error: 'VOICE_CLONE_PROVIDER_ROUTE_UNAVAILABLE: No production voice clone provider route is currently configured.',
      provider: 'fixture',
      model: 'voice_clone',
      metadata: {
        evidenceSource: 'local_fixture',
        liveProviderProof: false,
        blocker: 'PROVIDER_ACCOUNT_OR_ROUTE_REQUIRED',
      },
    }
  } catch (error) {
    const message = error instanceof Error ? error.message : 'Unknown error'
    return {
      success: false,
      status: 'failed',
      error: message,
      provider: 'fixture',
      model: 'voice_clone',
    }
  }
}

// ── Voice Conversion Handler ──────────────────────────────────────────────────

export async function handleVoiceConversionJob(payload: WorkerJobData): Promise<ProcessorResult> {
  try {
    const domainService = createVoiceConversionDomainService(createFixtureVoiceConversionProviderAdapter())

    const input = payload.input ?? {}
    const validation = domainService.validateRequest(input)
    if (!validation.success) {
      return {
        success: false,
        status: 'failed',
        error: validation.error,
        provider: 'fixture',
        model: 'voice_conversion',
      }
    }

    // Voice conversion requires a provider route - return truthful blocker
    return {
      success: false,
      status: 'failed',
      error: 'VOICE_CONVERSION_PROVIDER_ROUTE_UNAVAILABLE: No production voice conversion provider route is currently configured.',
      provider: 'fixture',
      model: 'voice_conversion',
      metadata: {
        evidenceSource: 'local_fixture',
        liveProviderProof: false,
        blocker: 'PROVIDER_ACCOUNT_OR_ROUTE_REQUIRED',
      },
    }
  } catch (error) {
    const message = error instanceof Error ? error.message : 'Unknown error'
    return {
      success: false,
      status: 'failed',
      error: message,
      provider: 'fixture',
      model: 'voice_conversion',
    }
  }
}

// ── Audio-to-Audio Handler ────────────────────────────────────────────────────

export async function handleAudioToAudioJob(payload: WorkerJobData): Promise<ProcessorResult> {
  try {
    const input = payload.input ?? {}
    const operation = input.operation as AudioToAudioOperation

    // Internal FFmpeg operations
    const internalOperations: AudioToAudioOperation[] = ['trim', 'resample', 'channel_convert', 'loudness_normalize', 'normalize']

    if (internalOperations.includes(operation)) {
      // Source audio buffer must be provided in the job payload
      const sourceBuffer = input.sourceAudioBuffer
      if (!sourceBuffer || !Buffer.isBuffer(sourceBuffer)) {
        return {
          success: false,
          status: 'failed',
          error: 'Source audio buffer is required for internal FFmpeg operations',
          provider: 'internal',
          model: operation,
        }
      }

      const sourceMimeType = String(input.sourceMimeType ?? 'audio/wav')
      const outputFormat = String(input.outputFormat ?? 'wav')
      const parameters = (input.parameters ?? {}) as Record<string, unknown>

      const result = await executeFfmpegOperation(
        operation,
        sourceBuffer,
        sourceMimeType,
        parameters,
        outputFormat,
      )

      return {
        success: true,
        status: 'completed',
        provider: 'internal',
        model: `ffmpeg-${operation}`,
        output: JSON.stringify({
          outputMimeType: result.outputMimeType,
          outputSizeBytes: result.outputBuffer.length,
          validation: result.validation,
        }),
        metadata: {
          evidenceSource: 'internal_ffmpeg',
          liveProviderProof: false,
          operation,
          parameters,
          outputValidation: result.validation,
        },
      }
    }

    // Non-internal operations require a provider
    return {
      success: false,
      status: 'failed',
      error: `Operation '${operation}' requires a provider route. No production provider is currently configured for this operation.`,
      provider: 'fixture',
      model: operation,
      metadata: {
        evidenceSource: 'local_fixture',
        liveProviderProof: false,
        blocker: 'PROVIDER_OPERATION_NOT_SUPPORTED',
      },
    }
  } catch (error) {
    const message = error instanceof Error ? error.message : 'Unknown error'
    return {
      success: false,
      status: 'failed',
      error: message,
      provider: 'internal',
      model: 'audio_to_audio',
    }
  }
}

// ── Handler Registry ──────────────────────────────────────────────────────────

export const VOICE_AUDIO_HANDLERS: Record<string, (payload: WorkerJobData) => Promise<ProcessorResult>> = {
  voice_clone: handleVoiceCloneJob,
  voice_conversion: handleVoiceConversionJob,
  audio_to_audio: handleAudioToAudioJob,
}

export function registerVoiceAudioHandlers(): void {
  // This function would be called during worker initialization
  // to register the handlers with the job processor
  // Central worker import remains deferred, but the isolated registry
  // is directly usable and type-compatible with ProcessorResult
}
