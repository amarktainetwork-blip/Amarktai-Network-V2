/**
 * Voice Audio Handlers — isolated worker handlers for voice and audio operations.
 *
 * These handlers execute through the domain services with real FFmpeg operations
 * for internal audio transformations. Voice clone and voice conversion return
 * truthful provider blockers when no production provider route exists.
 *
 * - Workers load source artifacts from the artifact store
 * - FFmpeg outputs are saved as durable artifacts
 * - Cancellation is checked before expensive execution
 * - Registration is real and type-compatible with the worker registry
 */

import { execFile } from 'node:child_process'
import { mkdtemp, readFile, rm, writeFile } from 'node:fs/promises'
import { tmpdir } from 'node:os'
import { join } from 'node:path'
import { promisify } from 'node:util'
import { createHash } from 'node:crypto'
import { prisma } from '@amarktai/db'
import {
  type AudioToAudioOperation,
} from '@amarktai/core/audio-to-audio-contracts'
import {
  getArtifactFile,
  getArtifactRecord,
  saveArtifact,
} from '@amarktai/artifacts'
import type { ProcessorResult, WorkerJobData } from '../processors/job-processor.js'

const execFileAsync = promisify(execFile)

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
        // Re-encode for deterministic validation
        await runFfmpeg([...baseArgs, '-ss', String(startTime), '-t', String(duration), outputFile])
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

// ── Cancellation Check ────────────────────────────────────────────────────────

async function isJobCancelled(jobId: string): Promise<boolean> {
  const job = await prisma.job.findUnique({ where: { id: jobId }, select: { status: true } })
  return job?.status === 'cancelled'
}

// ── Checksum ──────────────────────────────────────────────────────────────────

function computeChecksum(buffer: Buffer): string {
  return createHash('sha256').update(buffer).digest('hex')
}

// ── Voice Clone Handler ───────────────────────────────────────────────────────

export async function handleVoiceCloneJob(payload: WorkerJobData): Promise<ProcessorResult> {
  try {
    // Voice clone requires a provider route - return truthful blocker
    // No production voice clone provider route is currently configured
    return {
      success: false,
      status: 'failed',
      error: 'VOICE_CLONE_PROVIDER_ROUTE_UNAVAILABLE: No production voice clone provider route is currently configured.',
      provider: 'amarktai-network',
      model: 'voice_clone',
      metadata: {
        evidenceSource: 'local_fixture',
        liveProviderProof: false,
        blocker: 'PROVIDER_ACCOUNT_OR_ROUTE_REQUIRED',
        capability: 'voice_clone',
        appSlug: payload.appSlug,
        jobId: payload.jobId,
      },
    }
  } catch (error) {
    const message = error instanceof Error ? error.message : 'Unknown error'
    return {
      success: false,
      status: 'failed',
      error: message,
      provider: 'amarktai-network',
      model: 'voice_clone',
    }
  }
}

// ── Voice Conversion Handler ──────────────────────────────────────────────────

export async function handleVoiceConversionJob(payload: WorkerJobData): Promise<ProcessorResult> {
  try {
    // Voice conversion requires a provider route - return truthful blocker
    // No production voice conversion provider route is currently configured
    return {
      success: false,
      status: 'failed',
      error: 'VOICE_CONVERSION_PROVIDER_ROUTE_UNAVAILABLE: No production voice conversion provider route is currently configured.',
      provider: 'amarktai-network',
      model: 'voice_conversion',
      metadata: {
        evidenceSource: 'local_fixture',
        liveProviderProof: false,
        blocker: 'PROVIDER_ACCOUNT_OR_ROUTE_REQUIRED',
        capability: 'voice_conversion',
        appSlug: payload.appSlug,
        jobId: payload.jobId,
      },
    }
  } catch (error) {
    const message = error instanceof Error ? error.message : 'Unknown error'
    return {
      success: false,
      status: 'failed',
      error: message,
      provider: 'amarktai-network',
      model: 'voice_conversion',
    }
  }
}

// ── Audio-to-Audio Handler ────────────────────────────────────────────────────

export async function handleAudioToAudioJob(payload: WorkerJobData): Promise<ProcessorResult> {
  try {
    const input = payload.input ?? {}
    const operation = input.operation as AudioToAudioOperation

    // Check cancellation before expensive execution
    if (await isJobCancelled(payload.jobId)) {
      return {
        success: false,
        status: 'failed',
        error: 'Job was cancelled before execution',
        provider: 'internal',
        model: `ffmpeg-${operation}`,
      }
    }

    // Internal FFmpeg operations
    const internalOperations: AudioToAudioOperation[] = ['trim', 'resample', 'channel_convert', 'loudness_normalize', 'normalize']

    if (!internalOperations.includes(operation)) {
      return {
        success: false,
        status: 'failed',
        error: `Operation '${operation}' is not supported as an internal FFmpeg operation. Only ${internalOperations.join(', ')} are supported.`,
        provider: 'internal',
        model: operation,
      }
    }

    // Load source artifact from artifact store
    const sourceArtifactId = String(input.sourceAudioArtifactId ?? '')
    if (!sourceArtifactId) {
      return {
        success: false,
        status: 'failed',
        error: 'sourceAudioArtifactId is required',
        provider: 'internal',
        model: `ffmpeg-${operation}`,
      }
    }

    const sourceRecord = await getArtifactRecord(sourceArtifactId)
    if (!sourceRecord) {
      return {
        success: false,
        status: 'failed',
        error: `Source artifact ${sourceArtifactId} not found`,
        provider: 'internal',
        model: `ffmpeg-${operation}`,
      }
    }

    const sourceFile = await getArtifactFile(sourceArtifactId)
    if (!sourceFile) {
      return {
        success: false,
        status: 'failed',
        error: `Source artifact ${sourceArtifactId} file not found or not readable`,
        provider: 'internal',
        model: `ffmpeg-${operation}`,
      }
    }

    const sourceMimeType = sourceFile.mimeType
    const outputFormat = String(input.outputFormat ?? 'wav')
    const parameters = (input.parameters ?? {}) as Record<string, unknown>

    // Check cancellation again before FFmpeg
    if (await isJobCancelled(payload.jobId)) {
      return {
        success: false,
        status: 'failed',
        error: 'Job was cancelled before FFmpeg execution',
        provider: 'internal',
        model: `ffmpeg-${operation}`,
      }
    }

    // Execute real FFmpeg operation
    const result = await executeFfmpegOperation(
      operation,
      sourceFile.buffer,
      sourceMimeType,
      parameters,
      outputFormat,
    )

    // Check cancellation before artifact persistence
    if (await isJobCancelled(payload.jobId)) {
      return {
        success: false,
        status: 'failed',
        error: 'Job was cancelled before artifact persistence',
        provider: 'internal',
        model: `ffmpeg-${operation}`,
      }
    }

    // Save output artifact
    const outputChecksum = computeChecksum(result.outputBuffer)
    const outputArtifact = await saveArtifact({
      input: {
        appSlug: payload.appSlug,
        type: 'audio',
        subType: `audio_to_audio_${operation}`,
        title: `Audio ${operation} output`,
        description: `Real FFmpeg ${operation} operation`,
        provider: 'internal',
        model: `ffmpeg-${operation}`,
        traceId: payload.traceId,
        mimeType: result.outputMimeType,
        metadata: {
          operation,
          parameters,
          sourceArtifactId,
          sourceChecksum: sourceRecord.metadata ? JSON.parse(sourceRecord.metadata).checksum : undefined,
          outputChecksum,
          outputValidation: result.validation,
          sourceLineage: sourceArtifactId,
          evidenceSource: 'internal_ffmpeg',
          liveProviderProof: false,
        },
      },
      data: result.outputBuffer,
      explicitMimeType: result.outputMimeType,
    })

    return {
      success: true,
      status: 'completed',
      provider: 'internal',
      model: `ffmpeg-${operation}`,
      artifactId: outputArtifact.id,
      output: JSON.stringify({
        artifactId: outputArtifact.id,
        artifactUrl: outputArtifact.storageUrl,
        mimeType: outputArtifact.mimeType,
        fileSizeBytes: outputArtifact.fileSizeBytes,
        checksum: outputChecksum,
        validation: result.validation,
      }),
      metadata: {
        evidenceSource: 'internal_ffmpeg',
        liveProviderProof: false,
        operation,
        parameters,
        sourceArtifactId,
        outputArtifactId: outputArtifact.id,
        outputChecksum,
        outputValidation: result.validation,
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

/**
 * Register voice audio handlers with the worker's capability registry.
 * When passed the canonical registry object, this performs real registration.
 */
export function registerVoiceAudioHandlers(registry: Record<string, (payload: WorkerJobData) => Promise<ProcessorResult>>): void {
  registry.voice_clone = handleVoiceCloneJob
  registry.voice_conversion = handleVoiceConversionJob
  registry.audio_to_audio = handleAudioToAudioJob
}
