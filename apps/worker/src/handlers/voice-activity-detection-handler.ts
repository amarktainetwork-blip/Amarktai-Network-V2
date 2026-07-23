import { execFile } from 'node:child_process'
import { createHash } from 'node:crypto'
import { mkdtemp, rm, writeFile } from 'node:fs/promises'
import { tmpdir } from 'node:os'
import { join } from 'node:path'
import { promisify } from 'node:util'
import { getArtifactFile, getArtifactRecord } from '@amarktai/artifacts'
import {
  VoiceActivityDetectionOutputSchema,
  VoiceActivityDetectionRequestSchema,
  validateSourceAudio,
  type AppCapabilityGrantContext,
  type VoiceActivitySegment,
} from '@amarktai/core'
import { prisma } from '@amarktai/db'
import type { ProcessorResult, WorkerJobData } from '../processors/job-processor.js'

const execFileAsync = promisify(execFile)

function sourceExtension(mimeType: string): string {
  if (mimeType === 'audio/wav' || mimeType === 'audio/x-wav') return 'wav'
  if (mimeType === 'audio/mpeg') return 'mp3'
  if (mimeType === 'audio/flac') return 'flac'
  if (mimeType === 'audio/ogg') return 'ogg'
  if (mimeType === 'audio/aac') return 'aac'
  return 'bin'
}

function roundSeconds(value: number): number {
  return Math.round(value * 1000) / 1000
}

function readGrant(payload: WorkerJobData): AppCapabilityGrantContext | null {
  const value = payload.appGrantSnapshot ?? payload.metadata?.appGrantSnapshot
  if (!value || typeof value !== 'object' || Array.isArray(value)) return null
  const grant = value as AppCapabilityGrantContext
  if (grant.appSlug !== payload.appSlug || grant.capability !== 'voice_activity_detection') return null
  return grant
}

async function isCancelled(jobId: string): Promise<boolean> {
  const job = await prisma.job.findUnique({ where: { id: jobId }, select: { status: true } })
  return job?.status === 'cancelled' || job?.status === 'cancelling'
}

async function probeDuration(filePath: string): Promise<number> {
  const ffprobe = process.env.FFPROBE_PATH?.trim() || 'ffprobe'
  const { stdout } = await execFileAsync(ffprobe, [
    '-v', 'error',
    '-show_entries', 'format=duration',
    '-of', 'default=noprint_wrappers=1:nokey=1',
    filePath,
  ], { timeout: 30_000, windowsHide: true })
  const duration = Number(stdout.trim())
  if (!Number.isFinite(duration) || duration <= 0) throw new Error('FFprobe did not return a finite positive audio duration')
  return duration
}

function parseSilenceIntervals(stderr: string, durationSeconds: number): Array<{ start: number; end: number }> {
  const events = [...stderr.matchAll(/silence_(start|end):\s*(-?\d+(?:\.\d+)?)/g)]
    .map((match) => ({ kind: match[1] as 'start' | 'end', value: Number(match[2]) }))
    .filter((event) => Number.isFinite(event.value))
  const intervals: Array<{ start: number; end: number }> = []
  let openStart: number | null = null

  for (const event of events) {
    const value = Math.min(durationSeconds, Math.max(0, event.value))
    if (event.kind === 'start') {
      if (openStart === null) openStart = value
      continue
    }
    const start = openStart ?? 0
    if (value > start) intervals.push({ start, end: value })
    openStart = null
  }
  if (openStart !== null && durationSeconds > openStart) intervals.push({ start: openStart, end: durationSeconds })

  return intervals
    .sort((left, right) => left.start - right.start)
    .reduce<Array<{ start: number; end: number }>>((merged, current) => {
      const last = merged.at(-1)
      if (!last || current.start > last.end) merged.push({ ...current })
      else last.end = Math.max(last.end, current.end)
      return merged
    }, [])
}

function speechSegmentsFromSilence(
  silence: Array<{ start: number; end: number }>,
  durationSeconds: number,
  minimumSpeechMs: number,
): VoiceActivitySegment[] {
  const segments: VoiceActivitySegment[] = []
  let cursor = 0
  const minimumSpeechSeconds = minimumSpeechMs / 1000

  const add = (start: number, end: number) => {
    const duration = end - start
    if (duration + 1e-9 < minimumSpeechSeconds) return
    segments.push({
      startSeconds: roundSeconds(start),
      endSeconds: roundSeconds(end),
      durationSeconds: roundSeconds(duration),
    })
  }

  for (const interval of silence) {
    if (interval.start > cursor) add(cursor, interval.start)
    cursor = Math.max(cursor, interval.end)
  }
  if (cursor < durationSeconds) add(cursor, durationSeconds)
  return segments
}

export async function handleVoiceActivityDetectionJob(payload: WorkerJobData): Promise<ProcessorResult> {
  const parsed = VoiceActivityDetectionRequestSchema.safeParse(payload.input ?? {})
  if (!parsed.success) {
    return {
      success: false,
      status: 'failed',
      provider: 'internal',
      model: 'ffmpeg-silencedetect',
      error: `Invalid voice_activity_detection request: ${parsed.error.issues.map((issue) => `${issue.path.join('.') || 'input'} ${issue.message}`).join('; ')}`,
    }
  }

  const grant = readGrant(payload)
  if (!grant?.enabled || !grant.artifactRead) {
    return { success: false, status: 'failed', provider: 'internal', model: 'ffmpeg-silencedetect', error: 'AppCapabilityGrant denies source-audio read.' }
  }
  if (await isCancelled(payload.jobId)) {
    return { success: false, status: 'failed', provider: 'internal', model: 'ffmpeg-silencedetect', error: 'Job was cancelled before voice activity detection.' }
  }

  const request = parsed.data
  const source = await getArtifactRecord(request.sourceAudioArtifactId)
  if (!source || source.status !== 'completed' || source.appSlug !== payload.appSlug) {
    return { success: false, status: 'failed', provider: 'internal', model: 'ffmpeg-silencedetect', error: 'Authorised completed source audio artifact was not found.' }
  }
  if (!source.mimeType.startsWith('audio/')) {
    return { success: false, status: 'failed', provider: 'internal', model: 'ffmpeg-silencedetect', error: 'voice_activity_detection requires an audio artifact.' }
  }
  const file = await getArtifactFile(request.sourceAudioArtifactId)
  if (!file?.buffer.length) {
    return { success: false, status: 'failed', provider: 'internal', model: 'ffmpeg-silencedetect', error: 'Source audio bytes are unavailable.' }
  }
  const sourceValidation = validateSourceAudio({
    artifactId: request.sourceAudioArtifactId,
    appSlug: payload.appSlug,
    buffer: file.buffer,
    declaredMimeType: file.mimeType,
  })
  if (!sourceValidation.valid) {
    return { success: false, status: 'failed', provider: 'internal', model: 'ffmpeg-silencedetect', error: sourceValidation.errorMessage ?? 'Source audio validation failed.' }
  }

  const directory = await mkdtemp(join(tmpdir(), 'amarktai-vad-'))
  try {
    const inputPath = join(directory, `source.${sourceExtension(file.mimeType)}`)
    await writeFile(inputPath, file.buffer)
    const durationSeconds = await probeDuration(inputPath)
    const ffmpeg = process.env.FFMPEG_PATH?.trim() || 'ffmpeg'
    const minimumSilenceSeconds = request.minimumSilenceMs / 1000
    const { stderr } = await execFileAsync(ffmpeg, [
      '-hide_banner',
      '-nostats',
      '-i', inputPath,
      '-af', `silencedetect=noise=${request.thresholdDb}dB:d=${minimumSilenceSeconds}`,
      '-f', 'null',
      '-',
    ], { timeout: 60_000, windowsHide: true, maxBuffer: 4 * 1024 * 1024 })

    if (await isCancelled(payload.jobId)) {
      return { success: false, status: 'failed', provider: 'internal', model: 'ffmpeg-silencedetect', error: 'Job was cancelled during voice activity detection.' }
    }

    const silence = parseSilenceIntervals(stderr, durationSeconds)
    const segments = speechSegmentsFromSilence(silence, durationSeconds, request.minimumSpeechMs)
    const speechDurationSeconds = roundSeconds(segments.reduce((total, segment) => total + segment.durationSeconds, 0))
    const output = VoiceActivityDetectionOutputSchema.parse({
      sourceAudioArtifactId: request.sourceAudioArtifactId,
      durationSeconds: roundSeconds(durationSeconds),
      speechDurationSeconds,
      speechRatio: Math.min(1, Math.max(0, Number((speechDurationSeconds / durationSeconds).toFixed(6)))),
      segments,
      thresholdDb: request.thresholdDb,
      minimumSpeechMs: request.minimumSpeechMs,
      minimumSilenceMs: request.minimumSilenceMs,
      evidence: {
        evidenceSource: 'internal_ffmpeg',
        liveProviderProof: false,
        engine: 'ffmpeg',
        filter: 'silencedetect',
        sourceChecksum: createHash('sha256').update(file.buffer).digest('hex'),
        outputValidation: {
          durationProbed: true,
          finiteOrderedSegments: true,
          segmentCount: segments.length,
        },
      },
    })

    return {
      success: true,
      status: 'completed',
      provider: 'internal',
      model: 'ffmpeg-silencedetect',
      output: JSON.stringify(output),
      metadata: {
        ...output.evidence,
        sourceArtifactId: request.sourceAudioArtifactId,
        durationSeconds: output.durationSeconds,
        speechDurationSeconds: output.speechDurationSeconds,
        speechRatio: output.speechRatio,
        segmentCount: output.segments.length,
      },
    }
  } catch (error) {
    return {
      success: false,
      status: 'failed',
      provider: 'internal',
      model: 'ffmpeg-silencedetect',
      error: error instanceof Error ? error.message : 'Voice activity detection failed.',
    }
  } finally {
    await rm(directory, { recursive: true, force: true }).catch(() => {})
  }
}
