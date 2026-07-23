/**
 * Voice Audio Handlers — isolated worker handlers for voice and audio operations.
 *
 * - Workers load source artifacts from the artifact store with app isolation
 * - FFmpeg outputs are saved as durable artifacts
 * - Cancellation is checked before execution, before persistence, and after persistence
 * - Payload is validated in the worker (trust boundary)
 * - FFmpeg parameters are validated for safety
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
  AUDIO_TO_AUDIO_OPERATIONS,
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

// ── Parameter Validation ──────────────────────────────────────────────────────

function validateFiniteNumber(value: unknown, name: string): number {
  if (typeof value !== 'number' || !isFinite(value)) {
    throw new Error(`${name} must be a finite number, got ${typeof value === 'number' ? value : typeof value}`)
  }
  return value
}

function validatePositiveInteger(value: unknown, name: string): number {
  const num = validateFiniteNumber(value, name)
  if (num <= 0 || !Number.isInteger(num)) {
    throw new Error(`${name} must be a positive integer, got ${num}`)
  }
  return num
}

function validateTrimParameters(parameters: Record<string, unknown>, sourceDuration: number): { startTime: number; endTime: number } {
  const startTime = validateFiniteNumber(parameters.startTime, 'startTime')
  const endTime = validateFiniteNumber(parameters.endTime, 'endTime')

  if (startTime < 0) throw new Error(`startTime must be non-negative, got ${startTime}`)
  if (endTime <= startTime) throw new Error(`endTime (${endTime}) must exceed startTime (${startTime})`)
  if (endTime > sourceDuration + 0.5) {
    throw new Error(`endTime (${endTime}) exceeds source duration (${sourceDuration}) beyond tolerance`)
  }

  return { startTime, endTime }
}

function validateSampleRate(parameters: Record<string, unknown>): number {
  const sampleRate = validatePositiveInteger(parameters.sampleRate, 'sampleRate')
  const allowedRates = [8000, 11025, 16000, 22050, 44100, 48000, 96000, 192000]
  if (!allowedRates.includes(sampleRate)) {
    throw new Error(`sampleRate ${sampleRate} is not in allowed range: ${allowedRates.join(', ')}`)
  }
  return sampleRate
}

function validateChannels(parameters: Record<string, unknown>): number {
  const channels = validatePositiveInteger(parameters.channels, 'channels')
  if (channels > 8) throw new Error(`channels must be <= 8, got ${channels}`)
  return channels
}

function validateTargetLufs(parameters: Record<string, unknown>): number {
  const targetLufs = validateFiniteNumber(parameters.targetLufs, 'targetLufs')
  if (targetLufs < -70 || targetLufs > -5) {
    throw new Error(`targetLufs must be between -70 and -5, got ${targetLufs}`)
  }
  return targetLufs
}

function validateOutputFormat(outputFormat: unknown): string {
  if (typeof outputFormat !== 'string') throw new Error('outputFormat must be a string')
  const allowed = ['wav', 'mp3', 'flac', 'ogg']
  if (!allowed.includes(outputFormat)) throw new Error(`outputFormat must be one of: ${allowed.join(', ')}`)
  if (outputFormat.includes('/') || outputFormat.includes('\\') || outputFormat.includes('..')) {
    throw new Error('outputFormat contains unsafe characters')
  }
  return outputFormat
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
        const { startTime, endTime } = validateTrimParameters(parameters, inputProbe.duration)
        const durationMs = endTime - startTime
        const startSec = startTime / 1000
        const durationSec = durationMs / 1000
        // Re-encode for deterministic validation
        await runFfmpeg([...baseArgs, '-ss', String(startSec), '-t', String(durationSec), outputFile])
        break
      }
      case 'resample': {
        const targetSampleRate = validateSampleRate(parameters)
        await runFfmpeg([...baseArgs, '-ar', String(targetSampleRate), outputFile])
        break
      }
      case 'channel_convert': {
        const targetChannels = validateChannels(parameters)
        await runFfmpeg([...baseArgs, '-ac', String(targetChannels), outputFile])
        break
      }
      case 'loudness_normalize': {
        const targetLufs = validateTargetLufs(parameters)
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
    if (outputBuffer.length === 0) throw new Error('FFmpeg produced empty output')

    const outputProbe = await probeAudio(outputFile)

    // Validate transformation results
    switch (operation) {
      case 'resample': {
        const targetSampleRate = validateSampleRate(parameters)
        if (outputProbe.sampleRate !== targetSampleRate) {
          throw new Error(`Resample validation failed: expected ${targetSampleRate}Hz, got ${outputProbe.sampleRate}Hz`)
        }
        break
      }
      case 'channel_convert': {
        const targetChannels = validateChannels(parameters)
        if (outputProbe.channels !== targetChannels) {
          throw new Error(`Channel convert validation failed: expected ${targetChannels} channels, got ${outputProbe.channels}`)
        }
        break
      }
    }

    const outputMimeType = outputFormat === 'wav' ? 'audio/wav' :
      outputFormat === 'mp3' ? 'audio/mpeg' :
      outputFormat === 'flac' ? 'audio/flac' : 'audio/ogg'

    return { outputBuffer, outputMimeType, validation: outputProbe }
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

export async function handleVoiceCloneJob(_payload: WorkerJobData): Promise<ProcessorResult> {
  // Voice clone has no production provider route — this should never be reached
  // because the API route returns blocked immediately without enqueuing
  return {
    success: false,
    status: 'failed',
    error: 'VOICE_CLONE_PROVIDER_ROUTE_UNAVAILABLE: No production voice clone provider route is currently configured.',
    provider: 'amarktai-network',
    model: 'voice_clone',
    metadata: {
      evidenceSource: 'executor_unavailable',
      liveProviderProof: false,
      blocker: 'VOICE_CLONE_PROVIDER_ROUTE_UNAVAILABLE',
    },
  }
}

// ── Voice Conversion Handler ──────────────────────────────────────────────────

export async function handleVoiceConversionJob(_payload: WorkerJobData): Promise<ProcessorResult> {
  // Voice conversion has no production provider route — this should never be reached
  return {
    success: false,
    status: 'failed',
    error: 'VOICE_CONVERSION_PROVIDER_ROUTE_UNAVAILABLE: No production voice conversion provider route is currently configured.',
    provider: 'amarktai-network',
    model: 'voice_conversion',
    metadata: {
      evidenceSource: 'executor_unavailable',
      liveProviderProof: false,
      blocker: 'VOICE_CONVERSION_PROVIDER_ROUTE_UNAVAILABLE',
    },
  }
}

// ── Audio-to-Audio Handler ────────────────────────────────────────────────────

export async function handleAudioToAudioJob(payload: WorkerJobData): Promise<ProcessorResult> {
  try {
    // 1. Validate payload (trust boundary)
    if (!payload.jobId) return { success: false, status: 'failed', error: 'Missing jobId', provider: 'internal', model: 'audio_to_audio' }
    if (!payload.appSlug) return { success: false, status: 'failed', error: 'Missing appSlug', provider: 'internal', model: 'audio_to_audio' }
    if (!payload.traceId) return { success: false, status: 'failed', error: 'Missing traceId', provider: 'internal', model: 'audio_to_audio' }

    const input = payload.input ?? {}
    const operation = input.operation as AudioToAudioOperation

    // Validate operation
    if (!AUDIO_TO_AUDIO_OPERATIONS.includes(operation)) {
      return { success: false, status: 'failed', error: `Invalid operation: ${operation}`, provider: 'internal', model: 'audio_to_audio' }
    }

    // Internal FFmpeg operations only
    const internalOperations: AudioToAudioOperation[] = ['trim', 'resample', 'channel_convert', 'loudness_normalize', 'normalize']
    if (!internalOperations.includes(operation)) {
      return { success: false, status: 'failed', error: `Operation '${operation}' is not supported as internal FFmpeg`, provider: 'internal', model: `ffmpeg-${operation}` }
    }

    // 2. Check cancellation before expensive execution
    if (await isJobCancelled(payload.jobId)) {
      return { success: false, status: 'failed', error: 'Job was cancelled before execution', provider: 'internal', model: `ffmpeg-${operation}` }
    }

    // 3. Load source artifact with worker-side app isolation
    const sourceArtifactId = String(input.sourceAudioArtifactId ?? '')
    if (!sourceArtifactId) {
      return { success: false, status: 'failed', error: 'sourceAudioArtifactId is required', provider: 'internal', model: `ffmpeg-${operation}` }
    }

    const sourceRecord = await getArtifactRecord(sourceArtifactId)
    if (!sourceRecord) {
      return { success: false, status: 'failed', error: `Source artifact ${sourceArtifactId} not found`, provider: 'internal', model: `ffmpeg-${operation}` }
    }

    // Worker-side app isolation: verify artifact belongs to this app
    if (sourceRecord.appSlug !== payload.appSlug) {
      return { success: false, status: 'failed', error: `Source artifact ${sourceArtifactId} does not belong to app ${payload.appSlug}`, provider: 'internal', model: `ffmpeg-${operation}` }
    }

    if (sourceRecord.status !== 'completed') {
      return { success: false, status: 'failed', error: `Source artifact ${sourceArtifactId} is not completed (status: ${sourceRecord.status})`, provider: 'internal', model: `ffmpeg-${operation}` }
    }

    const sourceFile = await getArtifactFile(sourceArtifactId)
    if (!sourceFile) {
      return { success: false, status: 'failed', error: `Source artifact ${sourceArtifactId} file not readable`, provider: 'internal', model: `ffmpeg-${operation}` }
    }

    // 4. Validate output format
    const outputFormat = validateOutputFormat(input.outputFormat ?? 'wav')
    const parameters = (input.parameters ?? {}) as Record<string, unknown>

    // 5. Check cancellation again before FFmpeg
    if (await isJobCancelled(payload.jobId)) {
      return { success: false, status: 'failed', error: 'Job was cancelled before FFmpeg execution', provider: 'internal', model: `ffmpeg-${operation}` }
    }

    // 6. Execute real FFmpeg operation
    const result = await executeFfmpegOperation(
      operation,
      sourceFile.buffer,
      sourceFile.mimeType,
      parameters,
      outputFormat,
    )

    // 7. Check cancellation before artifact persistence
    if (await isJobCancelled(payload.jobId)) {
      return { success: false, status: 'failed', error: 'Job was cancelled before artifact persistence', provider: 'internal', model: `ffmpeg-${operation}` }
    }

    // 8. Save output artifact
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

    // 9. Final cancellation guard after artifact persistence
    if (await isJobCancelled(payload.jobId)) {
      // Artifact was saved but job was cancelled — mark artifact as non-deliverable
      await prisma.artifact.update({
        where: { id: outputArtifact.id },
        data: { status: 'expired', errorMessage: 'Cancelled during persistence' },
      }).catch(() => {})
      return { success: false, status: 'failed', error: 'Job was cancelled after artifact persistence', provider: 'internal', model: `ffmpeg-${operation}`, artifactId: outputArtifact.id }
    }

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
    return { success: false, status: 'failed', error: message, provider: 'internal', model: 'audio_to_audio' }
  }
}

// ── Handler Registry ──────────────────────────────────────────────────────────

export const VOICE_AUDIO_HANDLERS: Record<string, (payload: WorkerJobData) => Promise<ProcessorResult>> = {
  voice_clone: handleVoiceCloneJob,
  voice_conversion: handleVoiceConversionJob,
  audio_to_audio: handleAudioToAudioJob,
}

export function registerVoiceAudioHandlers(registry: Record<string, (payload: WorkerJobData) => Promise<ProcessorResult>>): void {
  registry.voice_clone = handleVoiceCloneJob
  registry.voice_conversion = handleVoiceConversionJob
  registry.audio_to_audio = handleAudioToAudioJob
}
