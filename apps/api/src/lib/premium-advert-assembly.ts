import { execFile } from 'node:child_process'
import { promisify } from 'node:util'
import { mkdtemp, readFile, rm, writeFile } from 'node:fs/promises'
import { existsSync } from 'node:fs'
import { join } from 'node:path'
import { tmpdir } from 'node:os'
import { prisma } from '@amarktai/db'
import { saveArtifact } from '@amarktai/artifacts'
import { getStorageRoot } from '@amarktai/core'
import type { PremiumAdvertPlan, PremiumCandidateScore } from '@amarktai/core/premium-advert'

const execFileAsync = promisify(execFile)

export interface SelectedPremiumAdvertCandidate {
  candidateId: string
  sceneNumber: number
  jobId: string
  artifactId: string
  provider: string
  model: string
  durationSeconds: number
  score: PremiumCandidateScore
}

export interface PremiumAdvertAssemblyInput {
  executionId: string
  parentJobId: string
  plan: PremiumAdvertPlan
  winners: SelectedPremiumAdvertCandidate[]
  narrationArtifactId: string
  musicArtifactId: string
  subtitleArtifactId: string
}

export interface PremiumAdvertAssemblyResult {
  artifactId: string
  fileSizeBytes: number
  width: number
  height: number
  durationSeconds: number
  winnerEvidence: SelectedPremiumAdvertCandidate[]
}

interface ResolvedArtifact {
  id: string
  path: string
  mimeType: string
}

async function resolveArtifact(id: string, acceptedMime: string | string[]): Promise<ResolvedArtifact> {
  const artifact = await prisma.artifact.findUnique({ where: { id } })
  if (!artifact) throw new Error(`Premium advert artifact not found: ${id}`)
  const accepted = Array.isArray(acceptedMime) ? acceptedMime : [acceptedMime]
  if (!accepted.some((value) => artifact.mimeType === value || artifact.mimeType.startsWith(value))) {
    throw new Error(`Premium advert artifact ${id} has unsupported MIME ${artifact.mimeType}`)
  }
  const path = join(getStorageRoot(), artifact.storagePath)
  if (!existsSync(path)) throw new Error(`Premium advert artifact file is missing: ${id}`)
  return { id, path, mimeType: artifact.mimeType }
}

function dimensions(aspectRatio: PremiumAdvertPlan['aspectRatio']): { width: number; height: number } {
  return aspectRatio === '9:16' ? { width: 1080, height: 1920 } : { width: 1920, height: 1080 }
}

function concatLine(path: string): string {
  return `file '${path.replaceAll("'", "'\\''")}'`
}

function subtitleFilter(path: string): string {
  return path.replaceAll('\\', '/').replaceAll(':', '\\:').replaceAll("'", "\\'")
}

async function run(command: string, args: string[], timeout = 600_000): Promise<void> {
  await execFileAsync(command, args, { timeout, maxBuffer: 20 * 1024 * 1024 })
}

async function probe(path: string): Promise<{ width: number; height: number; durationSeconds: number; hasVideo: boolean; hasAudio: boolean }> {
  const { stdout } = await execFileAsync('ffprobe', [
    '-v', 'error', '-show_streams', '-show_format', '-of', 'json', path,
  ], { timeout: 60_000, maxBuffer: 10 * 1024 * 1024 })
  const parsed = JSON.parse(stdout) as { streams?: Array<Record<string, unknown>>; format?: Record<string, unknown> }
  const video = parsed.streams?.find((stream) => stream.codec_type === 'video')
  const audio = parsed.streams?.find((stream) => stream.codec_type === 'audio')
  return {
    width: Number(video?.width ?? 0),
    height: Number(video?.height ?? 0),
    durationSeconds: Number(parsed.format?.duration ?? video?.duration ?? 0),
    hasVideo: Boolean(video),
    hasAudio: Boolean(audio),
  }
}

export async function assemblePremiumAdvert(input: PremiumAdvertAssemblyInput): Promise<PremiumAdvertAssemblyResult> {
  if (input.winners.length !== input.plan.scenes.length) {
    throw new Error(`Premium advert requires ${input.plan.scenes.length} winners, received ${input.winners.length}`)
  }
  const expectedScenes = input.plan.scenes.map((scene) => scene.sceneNumber)
  const actualScenes = input.winners.map((winner) => winner.sceneNumber).sort((a, b) => a - b)
  if (JSON.stringify(expectedScenes) !== JSON.stringify(actualScenes)) throw new Error('Premium advert winners do not cover every scene exactly once')

  const target = dimensions(input.plan.aspectRatio)
  const workspace = await mkdtemp(join(tmpdir(), `amarktai-premium-advert-${input.executionId}-`))
  try {
    const normalised: string[] = []
    for (const winner of [...input.winners].sort((a, b) => a.sceneNumber - b.sceneNumber)) {
      const source = await resolveArtifact(winner.artifactId, 'video/')
      const destination = join(workspace, `scene-${String(winner.sceneNumber).padStart(2, '0')}.mp4`)
      const filter = `scale=${target.width}:${target.height}:force_original_aspect_ratio=decrease,pad=${target.width}:${target.height}:(ow-iw)/2:(oh-ih)/2:black,fps=30,format=yuv420p`
      await run('ffmpeg', [
        '-hide_banner', '-loglevel', 'error', '-i', source.path,
        '-vf', filter, '-an', '-t', String(winner.durationSeconds),
        '-c:v', 'libx264', '-preset', 'slow', '-crf', '17', '-movflags', '+faststart',
        '-y', destination,
      ])
      const sceneProbe = await probe(destination)
      if (!sceneProbe.hasVideo || sceneProbe.width !== target.width || sceneProbe.height !== target.height) {
        throw new Error(`Normalised premium scene ${winner.sceneNumber} failed video validation`)
      }
      normalised.push(destination)
    }

    const concatFile = join(workspace, 'scenes.txt')
    await writeFile(concatFile, normalised.map(concatLine).join('\n'), 'utf8')
    const videoOnly = join(workspace, 'video-only.mp4')
    await run('ffmpeg', [
      '-hide_banner', '-loglevel', 'error', '-f', 'concat', '-safe', '0', '-i', concatFile,
      '-c', 'copy', '-movflags', '+faststart', '-y', videoOnly,
    ])

    const narration = await resolveArtifact(input.narrationArtifactId, 'audio/')
    const music = await resolveArtifact(input.musicArtifactId, 'audio/')
    const subtitles = await resolveArtifact(input.subtitleArtifactId, ['text/', 'application/x-subrip'])
    const finalPath = join(workspace, 'amarktai-network-premium-advert.mp4')
    const audioFilter = [
      '[1:a]loudnorm=I=-16:TP=-1.5:LRA=11,volume=1.0[narration]',
      `[2:a]atrim=0:${input.plan.targetDurationSeconds},afade=t=in:st=0:d=1.2,afade=t=out:st=${Math.max(0, input.plan.targetDurationSeconds - 2)}:d=2,volume=0.22[music]`,
      '[narration][music]amix=inputs=2:duration=longest:dropout_transition=2[audio]',
    ].join(';')
    const videoFilter = `subtitles='${subtitleFilter(subtitles.path)}':force_style='FontName=Arial,FontSize=18,PrimaryColour=&H00FFFFFF,OutlineColour=&H00101010,BorderStyle=1,Outline=2,Shadow=0,MarginV=54'`

    await run('ffmpeg', [
      '-hide_banner', '-loglevel', 'error',
      '-i', videoOnly, '-i', narration.path, '-stream_loop', '-1', '-i', music.path,
      '-filter_complex', audioFilter, '-map', '0:v:0', '-map', '[audio]',
      '-vf', videoFilter, '-t', String(input.plan.targetDurationSeconds),
      '-c:v', 'libx264', '-preset', 'slow', '-crf', '17', '-pix_fmt', 'yuv420p',
      '-c:a', 'aac', '-b:a', '256k', '-ar', '48000', '-movflags', '+faststart',
      '-y', finalPath,
    ])

    const finalProbe = await probe(finalPath)
    if (!finalProbe.hasVideo || !finalProbe.hasAudio) throw new Error('Premium advert final output lacks video or audio')
    if (finalProbe.width !== target.width || finalProbe.height !== target.height) throw new Error('Premium advert final dimensions are invalid')
    if (!Number.isFinite(finalProbe.durationSeconds) || Math.abs(finalProbe.durationSeconds - input.plan.targetDurationSeconds) > 0.75) {
      throw new Error(`Premium advert duration ${finalProbe.durationSeconds} does not match ${input.plan.targetDurationSeconds}`)
    }

    const bytes = await readFile(finalPath)
    if (bytes.length < 1024 || !bytes.subarray(0, 64).includes(Buffer.from('ftyp'))) throw new Error('Premium advert final MP4 signature is invalid')
    const artifact = await saveArtifact({
      input: {
        appSlug: 'dashboard-long-form',
        type: 'video',
        subType: 'premium_amarktai_advert',
        title: input.plan.campaignTitle,
        description: `Premium AmarktAI advert assembled from ${input.winners.length} selected GenX candidates`,
        provider: 'ffmpeg',
        model: 'premium-candidate-assembly-v1',
        traceId: `trace_premium_advert_${input.executionId}`,
        mimeType: 'video/mp4',
        metadata: {
          premiumAdvert: true,
          executionId: input.executionId,
          parentJobId: input.parentJobId,
          planVersion: input.plan.version,
          targetDurationSeconds: input.plan.targetDurationSeconds,
          duration: finalProbe.durationSeconds,
          width: finalProbe.width,
          height: finalProbe.height,
          aspectRatio: input.plan.aspectRatio,
          finalVideoValidated: true,
          finalAudioValidated: true,
          voiceoverIncluded: true,
          subtitlesIncluded: true,
          musicBedIncluded: true,
          selectedCandidates: input.winners,
          narrationArtifactId: input.narrationArtifactId,
          musicArtifactId: input.musicArtifactId,
          subtitleArtifactId: input.subtitleArtifactId,
          spend: input.plan.spend,
        },
      },
      data: bytes,
      explicitMimeType: 'video/mp4',
    })

    return {
      artifactId: artifact.id,
      fileSizeBytes: artifact.fileSizeBytes,
      width: finalProbe.width,
      height: finalProbe.height,
      durationSeconds: finalProbe.durationSeconds,
      winnerEvidence: input.winners,
    }
  } finally {
    await rm(workspace, { recursive: true, force: true })
  }
}
