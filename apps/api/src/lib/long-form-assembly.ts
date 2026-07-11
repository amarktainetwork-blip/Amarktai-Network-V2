/**
 * Long-form video final assembly module.
 * 
 * Handles scene stitching and final artifact creation for long-form videos.
 * Uses ffmpeg for video concatenation when available.
 */

import { exec } from 'child_process'
import { promisify } from 'util'
import fs from 'fs/promises'
import { existsSync } from 'fs'
import path from 'path'
import { prisma } from '@amarktai/db'
import { saveArtifact } from '@amarktai/artifacts'
import { getStorageRoot } from '@amarktai/core'

const execAsync = promisify(exec)

// ── Types ─────────────────────────────────────────────────────────────────────

export interface FfmpegAvailability {
  available: boolean
  version?: string
  path?: string
  error?: string
}

export interface SceneArtifactInfo {
  sceneNumber: number
  jobId: string
  artifactId: string
  storagePath: string
  mimeType: string
  durationSeconds?: number
  provider?: string
  model?: string
}

export interface AssemblyValidation {
  valid: boolean
  errors: string[]
  warnings: string[]
  sceneCount: number
  completedScenes: number
  missingScenes: number[]
}

export interface AssemblyPlan {
  executionId: string
  sceneArtifacts: SceneArtifactInfo[]
  totalDurationSeconds: number
  aspectRatio: string
  outputPath: string
  ffmpegAvailable: boolean
  canAssemble: boolean
  blockedReason?: string
}

export interface AssemblyResult {
  success: boolean
  artifactId?: string
  artifactUrl?: string
  storagePath?: string
  mimeType?: string
  fileSizeBytes?: number
  error?: string
  assemblyMode: 'video_only' | 'multimedia'
  voiceoverIncluded: boolean
  subtitlesIncluded: boolean
  musicBedIncluded: boolean
  componentArtifactIds?: {
    sceneArtifacts: string[]
    voiceoverArtifactIds?: string[]
    subtitleArtifactId?: string
    musicBedArtifactId?: string
  }
}

// ── FFmpeg Availability Check ─────────────────────────────────────────────────

export async function checkFfmpegAvailable(): Promise<FfmpegAvailability> {
  try {
    const { stdout } = await execAsync('ffmpeg -version', { timeout: 5000 })
    const versionMatch = stdout.match(/ffmpeg version\s+([^\s]+)/)
    const pathMatch = stdout.match(/configuration:.*--prefix=([^\s]+)/)
    
    return {
      available: true,
      version: versionMatch?.[1] || 'unknown',
      path: pathMatch?.[1] ? `${pathMatch[1]}/bin/ffmpeg` : 'ffmpeg',
    }
  } catch (error) {
    return {
      available: false,
      error: error instanceof Error ? error.message : 'ffmpeg not found',
    }
  }
}

// ── Resolve Scene Artifacts ───────────────────────────────────────────────────

export async function resolveSceneArtifacts(executionId: string): Promise<SceneArtifactInfo[]> {
  // Find all scene jobs with this exact durable executionId.
  const jobs = await prisma.job.findMany({
    where: {
      capability: 'video_generation',
      executionId,
    },
    orderBy: { sceneNumber: 'asc' },
  })

  const sceneArtifacts: SceneArtifactInfo[] = []

  for (const job of jobs) {
    const metadata = JSON.parse(job.metadataJson)
    
    if (job.status !== 'completed' || !job.artifactId) {
      continue
    }

    // Get artifact details
    const artifact = await prisma.artifact.findUnique({
      where: { id: job.artifactId },
    })

    if (!artifact) {
      continue
    }

    sceneArtifacts.push({
      sceneNumber: metadata.sceneNumber,
      jobId: job.id,
      artifactId: artifact.id,
      storagePath: artifact.storagePath,
      mimeType: artifact.mimeType,
      durationSeconds: metadata.sceneDurationSeconds,
      provider: job.provider || undefined,
      model: job.model || undefined,
    })
  }

  // Sort by scene number
  return sceneArtifacts.sort((a, b) => a.sceneNumber - b.sceneNumber)
}

// ── Validate Scene Artifacts ──────────────────────────────────────────────────

export function validateSceneArtifactsForAssembly(
  sceneArtifacts: SceneArtifactInfo[],
  expectedSceneCount: number
): AssemblyValidation {
  const errors: string[] = []
  const warnings: string[] = []
  const missingScenes: number[] = []

  // Check scene count
  if (sceneArtifacts.length !== expectedSceneCount) {
    errors.push(`Expected ${expectedSceneCount} scenes, found ${sceneArtifacts.length}`)
  }

  // Check for missing scene numbers
  const sceneNumbers = sceneArtifacts.map(s => s.sceneNumber)
  for (let i = 1; i <= expectedSceneCount; i++) {
    if (!sceneNumbers.includes(i)) {
      missingScenes.push(i)
    }
  }

  if (missingScenes.length > 0) {
    errors.push(`Missing scenes: ${missingScenes.join(', ')}`)
  }

  // Check MIME types
  const nonVideoScenes = sceneArtifacts.filter(
    s => !s.mimeType.startsWith('video/')
  )
  if (nonVideoScenes.length > 0) {
    errors.push(
      `Non-video artifacts found: scenes ${nonVideoScenes.map(s => s.sceneNumber).join(', ')}`
    )
  }

  // Check for missing durations
  const missingDurations = sceneArtifacts.filter(s => !s.durationSeconds)
  if (missingDurations.length > 0) {
    warnings.push(
      `Missing duration metadata for scenes: ${missingDurations.map(s => s.sceneNumber).join(', ')}`
    )
  }

  // Check artifact file existence
  const missingFiles: number[] = []
  for (const scene of sceneArtifacts) {
    if (!scene.storagePath) {
      missingFiles.push(scene.sceneNumber)
      continue
    }
    
    // Check if file exists on filesystem
    const fullPath = path.join(getStorageRoot(), scene.storagePath)
    if (!existsSync(fullPath)) {
      missingFiles.push(scene.sceneNumber)
    }
  }

  if (missingFiles.length > 0) {
    errors.push(
      `Artifact files missing on disk: scenes ${missingFiles.join(', ')}`
    )
  }

  return {
    valid: errors.length === 0,
    errors,
    warnings,
    sceneCount: expectedSceneCount,
    completedScenes: sceneArtifacts.length,
    missingScenes,
  }
}

// ── Build FFmpeg Concat List ──────────────────────────────────────────────────

export async function buildFfmpegConcatList(
  sceneArtifacts: SceneArtifactInfo[]
): Promise<string> {
  const storageRoot = getStorageRoot()
  const lines: string[] = []

  for (const scene of sceneArtifacts) {
    const fullPath = path.join(storageRoot, scene.storagePath)
    // Escape single quotes in path for ffmpeg
    const escapedPath = fullPath.replace(/'/g, "'\\''")
    lines.push(`file '${escapedPath}'`)
  }

  return lines.join('\n')
}

// ── Assemble Long-Form Video ──────────────────────────────────────────────────

export interface AssembleOptions {
  executionId: string
  sceneArtifacts: SceneArtifactInfo[]
  outputTitle?: string
  aspectRatio?: string
  dryRun?: boolean
}

export async function assembleLongFormVideo(
  options: AssembleOptions
): Promise<AssemblyResult> {
  const {
    executionId,
    sceneArtifacts,
    outputTitle = 'Long-form Video',
    aspectRatio = '16:9',
    dryRun = false,
  } = options

  // Check ffmpeg availability
  const ffmpeg = await checkFfmpegAvailable()
  if (!ffmpeg.available) {
    return {
      success: false,
      error: `ffmpeg is not available: ${ffmpeg.error}. Cannot assemble video.`,
      assemblyMode: 'video_only',
      voiceoverIncluded: false,
      subtitlesIncluded: false,
      musicBedIncluded: false,
    }
  }

  // Calculate total duration
  const totalDuration = sceneArtifacts.reduce(
    (sum, scene) => sum + (scene.durationSeconds || 0),
    0
  )

  // Build concat list
  const concatList = await buildFfmpegConcatList(sceneArtifacts)

  if (dryRun) {
    // Return plan without executing
    return {
      success: true,
      assemblyMode: 'video_only',
      voiceoverIncluded: false,
      subtitlesIncluded: false,
      musicBedIncluded: false,
    }
  }

  // Create temporary concat file
  const storageRoot = getStorageRoot()
  const tempDir = path.join(storageRoot, 'temp')
  await fs.mkdir(tempDir, { recursive: true })
  
  const concatFile = path.join(tempDir, `concat_${executionId}.txt`)
  await fs.writeFile(concatFile, concatList, 'utf-8')

  // Build output path
  const outputDir = path.join(storageRoot, 'artifacts', 'dashboard-long-form', 'video')
  await fs.mkdir(outputDir, { recursive: true })
  
  const timestamp = Date.now()
  const outputFile = path.join(outputDir, `longform_${executionId}_${timestamp}.mp4`)

  try {
    // Run ffmpeg concat
    const ffmpegCommand = `ffmpeg -f concat -safe 0 -i "${concatFile}" -c copy "${outputFile}" -y`
    await execAsync(ffmpegCommand, { timeout: 300000 }) // 5 minute timeout

    // Read output file
    const outputBuffer = await fs.readFile(outputFile)

    // Save as artifact
    const artifact = await saveArtifact({
      input: {
        appSlug: 'dashboard-long-form',
        type: 'video',
        subType: 'long_form_video',
        title: outputTitle,
        description: `Assembled long-form video from ${sceneArtifacts.length} scenes`,
        provider: 'ffmpeg',
        model: 'concat',
        traceId: `trace_longform_${executionId}`,
        mimeType: 'video/mp4',
        metadata: {
          longFormVideo: true,
          executionId,
          sceneCount: sceneArtifacts.length,
          totalDurationSeconds: totalDuration,
          aspectRatio,
          assembledFromSceneJobs: sceneArtifacts.map(s => s.jobId),
          sceneProviders: sceneArtifacts.map(s => ({
            sceneNumber: s.sceneNumber,
            provider: s.provider,
            model: s.model,
          })),
          voiceoverIncluded: false,
          subtitlesIncluded: false,
          musicBedIncluded: false,
          assemblyMode: 'video_only',
        },
      },
      data: outputBuffer,
      explicitMimeType: 'video/mp4',
    })

    // Clean up temp files
    await fs.unlink(concatFile).catch(() => {})
    await fs.unlink(outputFile).catch(() => {})

    return {
      success: true,
      artifactId: artifact.id,
      artifactUrl: artifact.storageUrl,
      storagePath: artifact.storagePath,
      mimeType: artifact.mimeType,
      fileSizeBytes: artifact.fileSizeBytes,
      assemblyMode: 'video_only',
      voiceoverIncluded: false,
      subtitlesIncluded: false,
      musicBedIncluded: false,
    }
  } catch (error) {
    // Clean up on error
    await fs.unlink(concatFile).catch(() => {})
    await fs.unlink(outputFile).catch(() => {})

    return {
      success: false,
      error: `FFmpeg assembly failed: ${error instanceof Error ? error.message : 'Unknown error'}`,
      assemblyMode: 'video_only',
      voiceoverIncluded: false,
      subtitlesIncluded: false,
      musicBedIncluded: false,
    }
  }
}

// ── Resolve Component Artifacts ─────────────────────────────────────────────

export async function resolveComponentArtifacts(executionId: string): Promise<{
  voiceoverArtifactIds: string[]
  subtitleArtifactId?: string
  musicBedArtifactId?: string
}> {
  const parentJob = await prisma.job.findFirst({
    where: { executionId, capability: 'long_form_video' },
  })

  if (!parentJob) return { voiceoverArtifactIds: [] }

  const metadata = JSON.parse(parentJob.metadataJson || '{}')
  const voiceoverArtifactIds: string[] = []

  // Find voiceover child jobs
  const voiceoverJobs = await prisma.job.findMany({
    where: {
      executionId,
      capability: 'tts',
      parentJobId: parentJob.id,
      status: 'completed',
    },
    orderBy: { sceneNumber: 'asc' },
  })

  for (const job of voiceoverJobs) {
    if (job.artifactId) voiceoverArtifactIds.push(job.artifactId)
  }

  return {
    voiceoverArtifactIds,
    subtitleArtifactId: metadata.subtitleArtifactId || undefined,
    musicBedArtifactId: metadata.musicBedArtifactId || undefined,
  }
}

export async function getArtifactPath(artifactId: string): Promise<string | null> {
  const artifact = await prisma.artifact.findUnique({ where: { id: artifactId } })
  if (!artifact?.storagePath) return null
  const fullPath = path.join(getStorageRoot(), artifact.storagePath)
  return existsSync(fullPath) ? fullPath : null
}

// ── Assemble Multimedia Long-Form Video ─────────────────────────────────────

export interface MultimediaAssemblyOptions {
  executionId: string
  sceneArtifacts: SceneArtifactInfo[]
  outputTitle?: string
  aspectRatio?: string
  dryRun?: boolean
}

export async function assembleMultimediaLongFormVideo(
  options: MultimediaAssemblyOptions
): Promise<AssemblyResult> {
  const {
    executionId,
    sceneArtifacts,
    outputTitle = 'Long-form Video',
    aspectRatio = '16:9',
    dryRun = false,
  } = options

  const ffmpeg = await checkFfmpegAvailable()
  if (!ffmpeg.available) {
    return {
      success: false,
      error: `ffmpeg is not available: ${ffmpeg.error}`,
      assemblyMode: 'multimedia',
      voiceoverIncluded: false,
      subtitlesIncluded: false,
      musicBedIncluded: false,
    }
  }

  const components = await resolveComponentArtifacts(executionId)
  const hasVoiceover = components.voiceoverArtifactIds.length > 0
  const hasSubtitles = !!components.subtitleArtifactId
  const hasMusicBed = !!components.musicBedArtifactId

  if (dryRun) {
    return {
      success: true,
      assemblyMode: 'multimedia',
      voiceoverIncluded: hasVoiceover,
      subtitlesIncluded: hasSubtitles,
      musicBedIncluded: hasMusicBed,
    }
  }

  const storageRoot = getStorageRoot()
  const tempDir = path.join(storageRoot, 'temp')
  await fs.mkdir(tempDir, { recursive: true })

  const outputDir = path.join(storageRoot, 'artifacts', 'dashboard-long-form', 'video')
  await fs.mkdir(outputDir, { recursive: true })

  const timestamp = Date.now()
  const outputFile = path.join(outputDir, `longform_${executionId}_${timestamp}.mp4`)
  const concatFile = path.join(tempDir, `concat_${executionId}.txt`)

  try {
    // Step 1: Concat scene videos
    const concatList = await buildFfmpegConcatList(sceneArtifacts)
    await fs.writeFile(concatFile, concatList, 'utf-8')

    let currentVideo = path.join(tempDir, `step1_${executionId}.mp4`)
    await execAsync(
      `ffmpeg -f concat -safe 0 -i "${concatFile}" -c copy "${currentVideo}" -y`,
      { timeout: 300000 }
    )

    // Step 2: Add voiceover if available
    if (hasVoiceover) {
      // Concatenate all voiceover WAV files
      const voConcatFile = path.join(tempDir, `vo_concat_${executionId}.txt`)
      const voLines: string[] = []
      for (const voId of components.voiceoverArtifactIds) {
        const voPath = await getArtifactPath(voId)
        if (voPath) voLines.push(`file '${voPath.replace(/'/g, "'\\''")}'`)
      }

      if (voLines.length > 0) {
        await fs.writeFile(voConcatFile, voLines.join('\n'), 'utf-8')
        const voCombined = path.join(tempDir, `vo_combined_${executionId}.wav`)
        await execAsync(
          `ffmpeg -f concat -safe 0 -i "${voConcatFile}" -c copy "${voCombined}" -y`,
          { timeout: 120000 }
        ).catch(async () => {
          // If concat fails (different formats), re-encode
          await execAsync(
            `ffmpeg -f concat -safe 0 -i "${voConcatFile}" -c:a pcm_s16le "${voCombined}" -y`,
            { timeout: 120000 }
          )
        })

        const withVo = path.join(tempDir, `step2_${executionId}.mp4`)
        await execAsync(
          `ffmpeg -i "${currentVideo}" -i "${voCombined}" -c:v copy -c:a aac -b:a 192k -map 0:v:0 -map 1:a:0 -shortest "${withVo}" -y`,
          { timeout: 300000 }
        )

        await fs.unlink(currentVideo).catch(() => {})
        await fs.unlink(voCombined).catch(() => {})
        await fs.unlink(voConcatFile).catch(() => {})
        currentVideo = withVo
      }
    }

    // Step 3: Add music bed if available
    if (hasMusicBed) {
      const musicPath = await getArtifactPath(components.musicBedArtifactId!)
      if (musicPath) {
        const withMusic = path.join(tempDir, `step3_${executionId}.mp4`)
        // Mix music at lower volume (0.3) with narration dominant
        const filterComplex = hasVoiceover
          ? '[0:a]volume=1.0[narr];[1:a]volume=0.25[music];[narr][music]amix=inputs=2:duration=first:dropout_transition=3[outa]'
          : '[1:a]volume=0.5[outa]'

        await execAsync(
          `ffmpeg -i "${currentVideo}" -i "${musicPath}" -filter_complex "${filterComplex}" -map 0:v:0 -map "[outa]" -c:v copy -c:a aac -b:a 192k -shortest "${withMusic}" -y`,
          { timeout: 300000 }
        )

        await fs.unlink(currentVideo).catch(() => {})
        currentVideo = withMusic
      }
    }

    // Step 4: Burn subtitles if available
    if (hasSubtitles) {
      const subtitlePath = await getArtifactPath(components.subtitleArtifactId!)
      if (subtitlePath) {
        const withSubs = path.join(tempDir, `step4_${executionId}.mp4`)
        // Escape path for ffmpeg subtitles filter
        const escapedSubPath = subtitlePath.replace(/\\/g, '/').replace(/:/g, '\\:')

        await execAsync(
          `ffmpeg -i "${currentVideo}" -vf "subtitles='${escapedSubPath}':force_style='FontSize=20,PrimaryColour=&H00FFFFFF,OutlineColour=&H00000000,Outline=2'" -c:a copy "${withSubs}" -y`,
          { timeout: 300000 }
        ).catch(async () => {
          // If subtitle burn fails, try with simpler options
          await execAsync(
            `ffmpeg -i "${currentVideo}" -vf "subtitles='${escapedSubPath}'" -c:a copy "${withSubs}" -y`,
            { timeout: 300000 }
          )
        })

        await fs.unlink(currentVideo).catch(() => {})
        currentVideo = withSubs
      }
    }

    // Step 5: Copy final output
    await fs.copyFile(currentVideo, outputFile)
    const outputBuffer = await fs.readFile(outputFile)

    const totalDuration = sceneArtifacts.reduce(
      (sum, scene) => sum + (scene.durationSeconds || 0), 0
    )

    const artifact = await saveArtifact({
      input: {
        appSlug: 'dashboard-long-form',
        type: 'video',
        subType: 'long_form_video_multimedia',
        title: outputTitle,
        description: `Assembled multimedia long-form video from ${sceneArtifacts.length} scenes`,
        provider: 'ffmpeg',
        model: 'multimedia-assembly',
        traceId: `trace_longform_${executionId}`,
        mimeType: 'video/mp4',
        metadata: {
          longFormVideo: true,
          executionId,
          sceneCount: sceneArtifacts.length,
          totalDurationSeconds: totalDuration,
          aspectRatio,
          assemblyMode: 'multimedia',
          voiceoverIncluded: hasVoiceover,
          subtitlesIncluded: hasSubtitles,
          musicBedIncluded: hasMusicBed,
          assembledFromSceneJobs: sceneArtifacts.map(s => s.jobId),
          componentArtifactIds: {
            sceneArtifacts: sceneArtifacts.map(s => s.artifactId),
            voiceoverArtifactIds: components.voiceoverArtifactIds,
            subtitleArtifactId: components.subtitleArtifactId,
            musicBedArtifactId: components.musicBedArtifactId,
          },
        },
      },
      data: outputBuffer,
      explicitMimeType: 'video/mp4',
    })

    // Cleanup
    await fs.unlink(currentVideo).catch(() => {})
    await fs.unlink(concatFile).catch(() => {})
    await fs.unlink(outputFile).catch(() => {})

    return {
      success: true,
      artifactId: artifact.id,
      artifactUrl: artifact.storageUrl,
      storagePath: artifact.storagePath,
      mimeType: artifact.mimeType,
      fileSizeBytes: artifact.fileSizeBytes,
      assemblyMode: 'multimedia',
      voiceoverIncluded: hasVoiceover,
      subtitlesIncluded: hasSubtitles,
      musicBedIncluded: hasMusicBed,
      componentArtifactIds: {
        sceneArtifacts: sceneArtifacts.map(s => s.artifactId),
        voiceoverArtifactIds: components.voiceoverArtifactIds,
        subtitleArtifactId: components.subtitleArtifactId,
        musicBedArtifactId: components.musicBedArtifactId,
      },
    }
  } catch (error) {
    await fs.unlink(concatFile).catch(() => {})
    await fs.unlink(outputFile).catch(() => {})

    return {
      success: false,
      error: `Multimedia assembly failed: ${error instanceof Error ? error.message : 'Unknown error'}`,
      assemblyMode: 'multimedia',
      voiceoverIncluded: false,
      subtitlesIncluded: false,
      musicBedIncluded: false,
    }
  }
}

// ── Create Assembly Plan ──────────────────────────────────────────────────────

export async function createAssemblyPlan(
  executionId: string,
  expectedSceneCount: number
): Promise<AssemblyPlan> {
  const sceneArtifacts = await resolveSceneArtifacts(executionId)
  const validation = validateSceneArtifactsForAssembly(sceneArtifacts, expectedSceneCount)
  const ffmpeg = await checkFfmpegAvailable()

  const totalDuration = sceneArtifacts.reduce(
    (sum, scene) => sum + (scene.durationSeconds || 0),
    0
  )

  const canAssemble = validation.valid && ffmpeg.available
  const blockedReason = !validation.valid
    ? `Scene validation failed: ${validation.errors.join(', ')}`
    : !ffmpeg.available
    ? `ffmpeg not available: ${ffmpeg.error}`
    : undefined

  return {
    executionId,
    sceneArtifacts,
    totalDurationSeconds: totalDuration,
    aspectRatio: '16:9', // TODO: Extract from plan metadata
    outputPath: `artifacts/dashboard-long-form/video/longform_${executionId}.mp4`,
    ffmpegAvailable: ffmpeg.available,
    canAssemble,
    blockedReason,
  }
}
