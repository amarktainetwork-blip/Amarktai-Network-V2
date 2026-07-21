import { execFile } from 'node:child_process'
import { mkdtemp, readFile, rm, writeFile } from 'node:fs/promises'
import { tmpdir } from 'node:os'
import { extname, join } from 'node:path'
import { promisify } from 'node:util'

const execFileAsync = promisify(execFile)
const MAX_VIDEO_BYTES = 750 * 1024 * 1024

export interface SampledVideoFrame {
  index: number
  timestampSeconds: number
  mimeType: 'image/jpeg'
  data: Buffer
}

export interface VideoFrameSampleResult {
  durationSeconds: number
  sampleCount: number
  frames: SampledVideoFrame[]
}

export function deriveVideoSampleTimestamps(durationSeconds: number, sampleCount: number): number[] {
  if (!Number.isFinite(durationSeconds) || durationSeconds <= 0) throw new Error('Video duration must be positive')
  if (!Number.isInteger(sampleCount) || sampleCount < 2 || sampleCount > 12) throw new Error('Video sample count must be between 2 and 12')
  const start = Math.min(0.25, durationSeconds * 0.05)
  const end = Math.max(start, durationSeconds - Math.min(0.25, durationSeconds * 0.05))
  if (sampleCount === 2) return [start, end]
  const step = (end - start) / (sampleCount - 1)
  return Array.from({ length: sampleCount }, (_, index) => Math.round((start + step * index) * 1000) / 1000)
}

function extensionForMime(mimeType: string): string {
  if (mimeType === 'video/webm') return '.webm'
  if (mimeType === 'video/quicktime') return '.mov'
  if (mimeType === 'video/mp4') return '.mp4'
  throw new Error(`Unsupported video MIME type for frame sampling: ${mimeType}`)
}

async function probeDuration(path: string): Promise<number> {
  const { stdout } = await execFileAsync('ffprobe', [
    '-v', 'error',
    '-show_entries', 'format=duration',
    '-of', 'default=noprint_wrappers=1:nokey=1',
    path,
  ], { timeout: 30_000, maxBuffer: 1024 * 1024, windowsHide: true })
  const duration = Number(String(stdout).trim())
  if (!Number.isFinite(duration) || duration <= 0) throw new Error('FFprobe did not return a positive video duration')
  return duration
}

export async function sampleVideoFrames(input: {
  videoBuffer: Buffer
  mimeType: string
  sampleCount?: number
  maxWidth?: number
}): Promise<VideoFrameSampleResult> {
  if (!input.videoBuffer.length) throw new Error('Video frame sampling requires nonempty bytes')
  if (input.videoBuffer.length > MAX_VIDEO_BYTES) throw new Error('Video exceeds the 750MB frame-sampling limit')
  const sampleCount = input.sampleCount ?? 6
  const maxWidth = Math.max(320, Math.min(input.maxWidth ?? 1280, 1920))
  const directory = await mkdtemp(join(tmpdir(), 'amarktai-video-frames-'))
  const sourcePath = join(directory, `source${extensionForMime(input.mimeType)}`)

  try {
    await writeFile(sourcePath, input.videoBuffer)
    const durationSeconds = await probeDuration(sourcePath)
    const timestamps = deriveVideoSampleTimestamps(durationSeconds, sampleCount)
    const frames: SampledVideoFrame[] = []

    for (let index = 0; index < timestamps.length; index++) {
      const timestampSeconds = timestamps[index]!
      const framePath = join(directory, `frame-${String(index + 1).padStart(2, '0')}.jpg`)
      await execFileAsync('ffmpeg', [
        '-hide_banner', '-loglevel', 'error',
        '-ss', timestampSeconds.toFixed(3),
        '-i', sourcePath,
        '-frames:v', '1',
        '-vf', `scale='min(${maxWidth},iw)':-2`,
        '-q:v', '2',
        '-y', framePath,
      ], { timeout: 60_000, maxBuffer: 4 * 1024 * 1024, windowsHide: true })
      const data = await readFile(framePath)
      if (data.length < 4 || data[0] !== 0xff || data[1] !== 0xd8 || data[data.length - 2] !== 0xff || data[data.length - 1] !== 0xd9) {
        throw new Error(`FFmpeg frame ${index + 1} was not a valid JPEG`)
      }
      frames.push({ index: index + 1, timestampSeconds, mimeType: 'image/jpeg', data })
    }

    return { durationSeconds, sampleCount: frames.length, frames }
  } finally {
    await rm(directory, { recursive: true, force: true }).catch(() => {})
  }
}

export function videoExtensionFromPath(path: string): string {
  return extname(path).toLowerCase()
}
