/**
 * Long-form video final assembly module.
 * 
 * Handles scene stitching and final artifact creation for long-form videos.
 * Uses ffmpeg for video concatenation when available.
 */

import { exec } from 'child_process'
import { promisify } from 'util'
import fs from 'fs/promises'
import path from 'path'
import { prisma } from '@amarktai/db'
import { saveArtifact, getArtifactFile } from '@amarktai/artifacts'
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
  assemblyMode: 'video_only'
  voiceoverIncluded: false
  subtitlesIncluded: false
  musicBedIncluded: false
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
  // Find all jobs with this executionId
  const jobs = await prisma.job.findMany({
    where: {
      capability: 'video_generation',
      metadataJson: { contains: executionId },
    },
    orderBy: { createdAt: 'asc' },
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
    const stat = await fs.stat(outputFile)

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
