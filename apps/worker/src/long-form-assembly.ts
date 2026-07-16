import { execFile } from 'node:child_process'
import { mkdtemp, rm, writeFile, readFile } from 'node:fs/promises'
import { tmpdir } from 'node:os'
import { join } from 'node:path'
import { promisify } from 'node:util'
import { prisma, classifyLongFormChildJobs, deriveLongFormComponentState } from '@amarktai/db'
import { getArtifactFile, saveArtifact } from '@amarktai/artifacts'
import type { ProcessorResult, WorkerJobData } from './processors/job-processor.js'

const execFileAsync = promisify(execFile)

export async function executeLongFormAssembly(payload: WorkerJobData): Promise<ProcessorResult> {
  const parentJobId = typeof payload.metadata?.parentJobId === 'string' ? payload.metadata.parentJobId : ''
  if (!parentJobId) return failure('Assembly job omitted parentJobId')
  const parent = await prisma.job.findUnique({ where: { id: parentJobId } })
  if (!parent || parent.appSlug !== payload.appSlug || parent.capability !== 'long_form_video') return failure('Long-form parent was not found')
  const children = await prisma.job.findMany({ where: { parentJobId: parent.id, appSlug: parent.appSlug }, orderBy: [{ sceneNumber: 'asc' }, { createdAt: 'asc' }] })
  const classified = classifyLongFormChildJobs(children)
  const parentMetadata = parseJson(parent.metadataJson)
  const subtitleId = stringValue(parentMetadata.subtitleArtifactId)
  const artifactIds = [...new Set([...children.map((job) => job.artifactId).filter((id): id is string => Boolean(id)), ...(subtitleId ? [subtitleId] : [])])]
  const artifacts = artifactIds.length ? await prisma.artifact.findMany({ where: { id: { in: artifactIds } } }) : []
  const state = deriveLongFormComponentState({ parentMetadata, children, artifacts })
  if (!state.scenes.ready || !state.voiceover.ready || !state.subtitles.ready || !state.musicBed.ready) {
    return failure(`Requested components are not ready: ${state.blockedReasons.join('; ')}`)
  }

  const existing = await prisma.artifact.findFirst({ where: { traceId: payload.traceId, subType: 'long_form_video_multimedia', status: 'completed' }, orderBy: { createdAt: 'asc' } })
  if (existing) {
    const metadata = parseJson(existing.metadata)
    const request = parseJson(parentMetadata.request)
    const requestedComponentsIncluded = (request.voiceoverEnabled !== true || metadata.voiceoverIncluded === true)
      && (request.subtitlesEnabled !== true || metadata.subtitlesIncluded === true)
      && (request.musicBedEnabled !== true || metadata.musicBedIncluded === true)
    if (metadata.finalVideoValidated === true && metadata.finalAudioValidated === true && requestedComponentsIncluded) {
      return completed(existing.id, existing.storageUrl, existing.mimeType, existing.fileSizeBytes, metadata, true)
    }
  }

  const request = parseJson(parentMetadata.request)
  const plan = parseJson(parentMetadata.plan)
  const storyboard = parseJson(plan.storyboard)
  const plannedScenes = Array.isArray(storyboard.scenes) ? storyboard.scenes.filter(isRecord) : []
  const expectedDuration = positiveNumber(request.targetDurationSeconds)
    ?? plannedScenes.reduce((sum, scene) => sum + (positiveNumber(scene.durationSeconds) ?? 0), 0)
  if (!(expectedDuration > 0)) return failure('Expected long-form duration is missing')

  const ffmpeg = process.env.FFMPEG_PATH?.trim() || 'ffmpeg'
  const ffprobe = process.env.FFPROBE_PATH?.trim() || 'ffprobe'
  const workDir = await mkdtemp(join(tmpdir(), 'amarktai-longform-'))
  try {
    await run(ffmpeg, ['-version'], 10_000)
    await run(ffprobe, ['-version'], 10_000)
    const resolution = outputResolution(stringValue(request.aspectRatio) || '16:9')
    const normalizedScenes: string[] = []
    for (const [index, sceneJob] of classified.scenes.entries()) {
      if (!sceneJob.artifactId) throw new Error(`scene_job_failed: scene ${sceneJob.sceneNumber ?? index + 1} has no artifact`)
      const plannedScene = plannedScenes.find((scene) => numberValue(scene.sceneNumber) === (sceneJob.sceneNumber ?? index + 1)) ?? plannedScenes[index]
      const sceneDuration = positiveNumber(plannedScene?.durationSeconds)
        ?? expectedDuration / Math.max(1, classified.scenes.length)
      const source = await materializeArtifact(sceneJob.artifactId, workDir, `scene-${index + 1}.input`)
      const target = join(workDir, `scene-${index + 1}.mp4`)
      await run(ffmpeg, [
        '-y', '-i', source,
        '-vf', `scale=${resolution.width}:${resolution.height}:force_original_aspect_ratio=decrease,pad=${resolution.width}:${resolution.height}:(ow-iw)/2:(oh-ih)/2,tpad=stop_mode=clone:stop_duration=${sceneDuration},trim=duration=${sceneDuration},setpts=PTS-STARTPTS,fps=30`,
        '-t', String(sceneDuration), '-an', '-c:v', 'libx264', '-preset', 'medium', '-crf', '20', '-pix_fmt', 'yuv420p', target,
      ])
      normalizedScenes.push(target)
    }
    const concatFile = join(workDir, 'scenes.txt')
    await writeFile(concatFile, normalizedScenes.map((file) => `file '${escapeConcat(file)}'`).join('\n'), 'utf8')
    const concatenatedVideo = join(workDir, 'concatenated.mp4')
    await run(ffmpeg, ['-y', '-f', 'concat', '-safe', '0', '-i', concatFile, '-c', 'copy', concatenatedVideo])

    const voiceRequested = request.voiceoverEnabled === true
    const musicRequested = request.musicBedEnabled === true
    const subtitleRequested = request.subtitlesEnabled === true
    let voiceTrack: string | null = null
    if (voiceRequested) {
      const voiceByScene = new Map(classified.voiceovers.filter((job) => job.status === 'completed' && job.artifactId).map((job) => [job.sceneNumber, job.artifactId!]))
      const pieces: string[] = []
      for (const [index, scene] of plannedScenes.entries()) {
        const sceneNumber = numberValue(scene.sceneNumber) ?? index + 1
        const duration = positiveNumber(scene.durationSeconds) ?? expectedDuration / Math.max(1, plannedScenes.length)
        const piece = join(workDir, `voice-${sceneNumber}.wav`)
        const voiceArtifactId = voiceByScene.get(sceneNumber)
        if (voiceArtifactId) {
          const source = await materializeArtifact(voiceArtifactId, workDir, `voice-${sceneNumber}.input`)
          await run(ffmpeg, ['-y', '-i', source, '-af', `apad,atrim=0:${duration}`, '-ar', '48000', '-ac', '2', '-c:a', 'pcm_s16le', piece])
        } else {
          await run(ffmpeg, ['-y', '-f', 'lavfi', '-i', 'anullsrc=r=48000:cl=stereo', '-t', String(duration), '-c:a', 'pcm_s16le', piece])
        }
        pieces.push(piece)
      }
      const voiceList = join(workDir, 'voices.txt')
      await writeFile(voiceList, pieces.map((file) => `file '${escapeConcat(file)}'`).join('\n'), 'utf8')
      voiceTrack = join(workDir, 'voice-track.wav')
      await run(ffmpeg, ['-y', '-f', 'concat', '-safe', '0', '-i', voiceList, '-c:a', 'pcm_s16le', voiceTrack])
    }

    let musicTrack: string | null = null
    if (musicRequested) {
      if (!state.musicBed.artifactId) throw new Error('music_bed_failed: completed music artifact is missing')
      const musicSource = await materializeArtifact(state.musicBed.artifactId, workDir, 'music.input')
      musicTrack = join(workDir, 'music-track.wav')
      const fadeOut = Math.max(0, expectedDuration - 0.75)
      await run(ffmpeg, ['-y', '-stream_loop', '-1', '-i', musicSource, '-af', `atrim=0:${expectedDuration},afade=t=in:st=0:d=0.5,afade=t=out:st=${fadeOut}:d=0.75`, '-ar', '48000', '-ac', '2', '-c:a', 'pcm_s16le', musicTrack])
    }

    let subtitlePath: string | null = null
    if (subtitleRequested) {
      if (!state.subtitles.artifactId) throw new Error('subtitle_generation_failed: subtitle artifact is missing')
      subtitlePath = await materializeArtifact(state.subtitles.artifactId, workDir, `subtitles.${state.subtitles.format || 'srt'}`)
    }

    const outputFile = join(workDir, 'final.mp4')
    const args = ['-y', '-i', concatenatedVideo]
    if (voiceTrack) args.push('-i', voiceTrack)
    if (musicTrack) args.push('-i', musicTrack)
    const audioInputs = Number(Boolean(voiceTrack)) + Number(Boolean(musicTrack))
    const filterParts: string[] = []
    let audioMap: string[] = []
    if (voiceTrack && musicTrack) {
      filterParts.push('[1:a]volume=1.0[narr]', '[2:a]volume=0.22[music]', '[narr][music]amix=inputs=2:duration=longest:dropout_transition=2[aout]')
      audioMap = ['-map', '[aout]']
    } else if (voiceTrack || musicTrack) {
      const audioIndex = 1
      filterParts.push(`[${audioIndex}:a]volume=${voiceTrack ? '1.0' : '0.35'}[aout]`)
      audioMap = ['-map', '[aout]']
    }
    if (subtitlePath) filterParts.push(`[0:v]subtitles='${escapeSubtitleFilter(subtitlePath)}'[vout]`)
    if (filterParts.length) args.push('-filter_complex', filterParts.join(';'))
    args.push('-map', subtitlePath ? '[vout]' : '0:v:0', ...audioMap, '-c:v', 'libx264', '-preset', 'medium', '-crf', '20', '-pix_fmt', 'yuv420p')
    if (audioInputs > 0) args.push('-c:a', 'aac', '-b:a', '192k')
    args.push('-t', String(expectedDuration), '-movflags', '+faststart', outputFile)
    await run(ffmpeg, args)

    const outputBuffer = await readFile(outputFile)
    const validation = await probeFinal(ffprobe, outputFile, expectedDuration, voiceRequested || musicRequested, outputBuffer.length)
    const artifact = await saveArtifact({
      input: {
        appSlug: parent.appSlug, type: 'video', subType: 'long_form_video_multimedia', title: `Long-form video ${parent.executionId}`,
        description: `Automatically assembled long-form video from ${classified.scenes.length} scenes`, provider: 'ffmpeg', model: 'durable-multimedia-assembly',
        traceId: payload.traceId, mimeType: 'video/mp4', metadata: {
          longFormVideo: true, executionId: parent.executionId, parentJobId: parent.id, sceneCount: classified.scenes.length,
          totalDurationSeconds: validation.duration, expectedDurationSeconds: expectedDuration, width: validation.width, height: validation.height,
          voiceoverIncluded: voiceRequested, subtitlesIncluded: subtitleRequested, musicBedIncluded: musicRequested,
          finalVideoValidated: validation.video, finalAudioValidated: validation.audio,
          componentArtifactIds: { scenes: state.scenes.artifactIds, voiceovers: state.voiceover.artifactIds, subtitle: state.subtitles.artifactId, musicBed: state.musicBed.artifactId },
        },
      }, data: outputBuffer, explicitMimeType: 'video/mp4',
    })
    return completed(artifact.id, artifact.storageUrl, artifact.mimeType, artifact.fileSizeBytes, {
      finalVideoValidated: validation.video, finalAudioValidated: validation.audio, duration: validation.duration, width: validation.width, height: validation.height,
      voiceoverIncluded: voiceRequested, subtitlesIncluded: subtitleRequested, musicBedIncluded: musicRequested,
      componentArtifactIds: { scenes: state.scenes.artifactIds, voiceovers: state.voiceover.artifactIds, subtitle: state.subtitles.artifactId, musicBed: state.musicBed.artifactId },
    }, false)
  } catch (error) {
    return failure(error instanceof Error ? error.message : 'FFmpeg assembly failed')
  } finally {
    await rm(workDir, { recursive: true, force: true })
  }
}

async function materializeArtifact(artifactId: string, directory: string, filename: string): Promise<string> {
  const file = await getArtifactFile(artifactId)
  if (!file?.buffer.length) throw new Error(`Artifact '${artifactId}' bytes are missing`)
  const target = join(directory, filename)
  await writeFile(target, file.buffer)
  return target
}

async function run(binary: string, args: string[], timeout = 300_000): Promise<void> {
  await execFileAsync(binary, args, { timeout, windowsHide: true, maxBuffer: 10 * 1024 * 1024 })
}

export interface FinalArtifactProbe {
  streams?: Array<{ codec_type?: string; width?: number; height?: number }>
  format?: { duration?: string }
}

export function validateFinalArtifact(input: {
  probe: FinalArtifactProbe
  expectedDuration: number
  audioRequested: boolean
  mimeType: string
  fileSizeBytes: number
}): { video: true; audio: true; duration: number; width: number; height: number } {
  const videoStream = input.probe.streams?.find((stream) => stream.codec_type === 'video')
  const duration = Number(input.probe.format?.duration)
  const width = Number(videoStream?.width)
  const height = Number(videoStream?.height)
  const video = Boolean(videoStream)
  const audio = !input.audioRequested || input.probe.streams?.some((stream) => stream.codec_type === 'audio') === true
  const tolerance = Math.max(2, input.expectedDuration * 0.1)
  const milestoneDurationValid = input.expectedDuration === 30 ? duration >= 25 && duration <= 40 : true
  if (!input.mimeType.startsWith('video/') || input.fileSizeBytes <= 0 || !video || !audio
      || !Number.isFinite(width) || width <= 0 || !Number.isFinite(height) || height <= 0
      || !Number.isFinite(duration) || duration <= 0 || Math.abs(duration - input.expectedDuration) > tolerance
      || !milestoneDurationValid) {
    throw new Error(`final_artifact_validation_failed: mime=${input.mimeType}; bytes=${input.fileSizeBytes}; video=${video}; audio=${audio}; width=${width}; height=${height}; duration=${duration}; expected=${input.expectedDuration}`)
  }
  return { video: true, audio: true, duration, width, height }
}

async function probeFinal(ffprobe: string, output: string, expectedDuration: number, audioRequested: boolean, fileSizeBytes: number): Promise<{ video: true; audio: true; duration: number; width: number; height: number }> {
  const { stdout } = await execFileAsync(ffprobe, ['-v', 'error', '-show_streams', '-show_format', '-of', 'json', output], { timeout: 30_000, windowsHide: true })
  return validateFinalArtifact({
    probe: JSON.parse(stdout) as FinalArtifactProbe,
    expectedDuration,
    audioRequested,
    mimeType: 'video/mp4',
    fileSizeBytes,
  })
}

function completed(id: string, url: string, mimeType: string, fileSizeBytes: number, metadata: Record<string, unknown>, reused: boolean): ProcessorResult {
  const output = { artifactId: id, artifactUrl: url, mimeType, fileSizeBytes, ...metadata, reused }
  return { success: true, status: 'completed', provider: 'local', model: 'ffmpeg-durable-assembly', artifactId: id, output: JSON.stringify(output), metadata: output }
}
function failure(error: string): ProcessorResult { return { success: false, status: 'failed', provider: 'local', model: 'ffmpeg-durable-assembly', error } }
function parseJson(value: unknown): Record<string, unknown> { if (isRecord(value)) return value; if (typeof value !== 'string') return {}; try { const parsed = JSON.parse(value); return isRecord(parsed) ? parsed : {} } catch { return {} } }
function isRecord(value: unknown): value is Record<string, unknown> { return typeof value === 'object' && value !== null && !Array.isArray(value) }
function stringValue(value: unknown): string { return typeof value === 'string' ? value.trim() : '' }
function numberValue(value: unknown): number | null { return typeof value === 'number' && Number.isFinite(value) ? value : null }
function positiveNumber(value: unknown): number | null { return typeof value === 'number' && Number.isFinite(value) && value > 0 ? value : null }
function escapeConcat(value: string): string { return value.replace(/'/g, "'\\''") }
function escapeSubtitleFilter(value: string): string { return value.replace(/\\/g, '/').replace(/:/g, '\\:').replace(/'/g, "\\'") }
function outputResolution(aspectRatio: string): { width: number; height: number } {
  if (aspectRatio === '9:16') return { width: 720, height: 1280 }
  if (aspectRatio === '1:1') return { width: 1080, height: 1080 }
  if (aspectRatio === '4:3') return { width: 960, height: 720 }
  if (aspectRatio === '21:9') return { width: 1680, height: 720 }
  return { width: 1280, height: 720 }
}
