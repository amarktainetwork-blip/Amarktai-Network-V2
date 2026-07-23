import { execFile } from 'node:child_process'
import { createHash } from 'node:crypto'
import { mkdtemp, readFile, rm, writeFile } from 'node:fs/promises'
import { tmpdir } from 'node:os'
import { join } from 'node:path'
import { promisify } from 'node:util'
import { prisma } from '@amarktai/db'
import { getArtifactFile, getArtifactRecord, saveArtifact } from '@amarktai/artifacts'
import { canReadSourceArtifactForApp } from '@amarktai/core'
import { inspectImageArtifact } from '@amarktai/core/specialist-vision'
import {
  IMAGE_UPSCALE_MAX_DIMENSION,
  IMAGE_UPSCALE_MAX_PIXELS,
  IMAGE_UPSCALE_MAX_SOURCE_BYTES,
  ImageUpscaleOutputSchema,
  ImageUpscaleRequestSchema,
} from '@amarktai/core/image-upscale-contracts'
import type { ProcessorResult, WorkerJobData } from '../processors/job-processor.js'

const execFileAsync = promisify(execFile)
const ENGINE_MODEL = 'ffmpeg-lanczos'

async function cancelled(jobId: string): Promise<boolean> {
  const job = await prisma.job.findUnique({ where: { id: jobId }, select: { status: true } })
  return job?.status === 'cancelled'
}

function checksum(buffer: Buffer): string {
  return createHash('sha256').update(buffer).digest('hex')
}

async function runFfmpeg(args: string[]): Promise<void> {
  const ffmpeg = process.env.FFMPEG_PATH?.trim() || 'ffmpeg'
  await execFileAsync(ffmpeg, args, { timeout: 120_000, windowsHide: true })
}

export async function handleImageUpscaleJob(payload: WorkerJobData): Promise<ProcessorResult> {
  try {
    if (!payload.jobId || !payload.appSlug || !payload.traceId) {
      return { success: false, status: 'failed', error: 'image_upscale requires jobId, appSlug and traceId', provider: 'internal', model: ENGINE_MODEL }
    }

    const parsed = ImageUpscaleRequestSchema.safeParse(payload.input ?? {})
    if (!parsed.success) {
      return {
        success: false,
        status: 'failed',
        error: `Invalid image_upscale request: ${parsed.error.issues.map((issue) => `${issue.path.join('.') || 'input'} ${issue.message}`).join('; ')}`,
        provider: 'internal',
        model: ENGINE_MODEL,
      }
    }
    const request = parsed.data

    if (!payload.appGrantSnapshot?.enabled || !payload.appGrantSnapshot.artifactRead || !payload.appGrantSnapshot.artifactWrite) {
      return { success: false, status: 'failed', error: 'Immutable AppCapabilityGrant denies image_upscale artifact read/write', provider: 'internal', model: ENGINE_MODEL }
    }
    if (await cancelled(payload.jobId)) {
      return { success: false, status: 'failed', error: 'Job was cancelled before image upscale execution', provider: 'internal', model: ENGINE_MODEL }
    }

    const sourceRecord = await getArtifactRecord(request.sourceImageArtifactId)
    if (!sourceRecord || !canReadSourceArtifactForApp(payload.appSlug, sourceRecord.appSlug)) {
      return { success: false, status: 'failed', error: 'Authorised source image artifact was not found', provider: 'internal', model: ENGINE_MODEL }
    }
    if (sourceRecord.status !== 'completed' || (sourceRecord.type !== 'image' && !sourceRecord.mimeType.startsWith('image/'))) {
      return { success: false, status: 'failed', error: 'Source artifact must be a completed image', provider: 'internal', model: ENGINE_MODEL }
    }

    const sourceFile = await getArtifactFile(request.sourceImageArtifactId)
    if (!sourceFile) {
      return { success: false, status: 'failed', error: 'Source image artifact file is not readable', provider: 'internal', model: ENGINE_MODEL }
    }
    const sourceInspection = inspectImageArtifact(sourceFile.buffer, IMAGE_UPSCALE_MAX_SOURCE_BYTES)
    const sourceWidth = sourceInspection.width ?? 0
    const sourceHeight = sourceInspection.height ?? 0
    const targetWidth = sourceWidth * request.scaleFactor
    const targetHeight = sourceHeight * request.scaleFactor
    if (!sourceWidth || !sourceHeight || targetWidth > IMAGE_UPSCALE_MAX_DIMENSION || targetHeight > IMAGE_UPSCALE_MAX_DIMENSION || targetWidth * targetHeight > IMAGE_UPSCALE_MAX_PIXELS) {
      return {
        success: false,
        status: 'failed',
        error: `Upscaled dimensions ${targetWidth}x${targetHeight} exceed the governed image ceiling`,
        provider: 'internal',
        model: ENGINE_MODEL,
      }
    }

    const dir = await mkdtemp(join(tmpdir(), 'amarktai-image-upscale-'))
    try {
      const sourceExtension = sourceInspection.detectedMimeType === 'image/jpeg' ? 'jpg' : 'png'
      const outputExtension = request.outputFormat === 'jpeg' ? 'jpg' : 'png'
      const inputPath = join(dir, `input.${sourceExtension}`)
      const outputPath = join(dir, `output.${outputExtension}`)
      await writeFile(inputPath, sourceFile.buffer)

      const outputArgs = request.outputFormat === 'jpeg'
        ? ['-q:v', '2']
        : ['-compression_level', '6']
      await runFfmpeg([
        '-hide_banner', '-loglevel', 'error', '-y', '-i', inputPath,
        '-vf', `scale=${targetWidth}:${targetHeight}:flags=lanczos`,
        '-frames:v', '1', ...outputArgs, outputPath,
      ])

      const outputBuffer = await readFile(outputPath)
      if (!outputBuffer.length) throw new Error('FFmpeg produced an empty image')
      const outputInspection = inspectImageArtifact(outputBuffer, 50 * 1024 * 1024)
      if (outputInspection.width !== targetWidth || outputInspection.height !== targetHeight) {
        throw new Error(`Image upscale validation failed: expected ${targetWidth}x${targetHeight}, got ${outputInspection.width}x${outputInspection.height}`)
      }
      const expectedMime = request.outputFormat === 'jpeg' ? 'image/jpeg' : 'image/png'
      if (outputInspection.detectedMimeType !== expectedMime) {
        throw new Error(`Image upscale validation failed: expected ${expectedMime}, got ${outputInspection.detectedMimeType}`)
      }
      if (await cancelled(payload.jobId)) {
        return { success: false, status: 'failed', error: 'Job was cancelled before image artifact persistence', provider: 'internal', model: ENGINE_MODEL }
      }

      const outputChecksum = checksum(outputBuffer)
      const outputArtifact = await saveArtifact({
        input: {
          appSlug: payload.appSlug,
          type: 'image',
          subType: 'image_upscale_lanczos',
          title: `Upscaled image ${request.scaleFactor}x`,
          description: `Governed internal FFmpeg Lanczos upscale from ${sourceWidth}x${sourceHeight} to ${targetWidth}x${targetHeight}`,
          provider: 'internal',
          model: ENGINE_MODEL,
          traceId: payload.traceId,
          mimeType: expectedMime,
          metadata: {
            sourceArtifactId: request.sourceImageArtifactId,
            sourceArtifactAppSlug: sourceRecord.appSlug,
            sourceChecksum: sourceInspection.checksum,
            sourceWidth,
            sourceHeight,
            width: targetWidth,
            height: targetHeight,
            scaleFactor: request.scaleFactor,
            outputChecksum,
            outputValidation: { valid: true, width: targetWidth, height: targetHeight, mimeType: expectedMime, filter: 'lanczos' },
            evidenceSource: 'internal_ffmpeg',
            liveProviderProof: false,
          },
        },
        data: outputBuffer,
        explicitMimeType: expectedMime,
      })

      if (await cancelled(payload.jobId)) {
        await prisma.artifact.update({ where: { id: outputArtifact.id }, data: { status: 'expired', errorMessage: 'Cancelled during persistence' } }).catch(() => {})
        return { success: false, status: 'failed', error: 'Job was cancelled after image artifact persistence', provider: 'internal', model: ENGINE_MODEL, artifactId: outputArtifact.id }
      }

      const output = ImageUpscaleOutputSchema.parse({
        artifactId: outputArtifact.id,
        artifactUrl: outputArtifact.storageUrl,
        mimeType: expectedMime,
        fileSizeBytes: outputArtifact.fileSizeBytes,
        sourceArtifactId: request.sourceImageArtifactId,
        sourceChecksum: sourceInspection.checksum,
        outputChecksum,
        sourceWidth,
        sourceHeight,
        width: targetWidth,
        height: targetHeight,
        scaleFactor: request.scaleFactor,
        evidence: { evidenceSource: 'internal_ffmpeg', liveProviderProof: false, engine: 'ffmpeg', filter: 'lanczos' },
      })

      return {
        success: true,
        status: 'completed',
        provider: 'internal',
        model: ENGINE_MODEL,
        artifactId: outputArtifact.id,
        output: JSON.stringify(output),
        metadata: {
          evidenceSource: 'internal_ffmpeg',
          liveProviderProof: false,
          sourceArtifactId: request.sourceImageArtifactId,
          sourceArtifactAppSlug: sourceRecord.appSlug,
          outputArtifactId: outputArtifact.id,
          outputChecksum,
          outputValidation: { valid: true, width: targetWidth, height: targetHeight, mimeType: expectedMime, filter: 'lanczos' },
        },
      }
    } finally {
      await rm(dir, { recursive: true, force: true }).catch(() => {})
    }
  } catch (error) {
    return { success: false, status: 'failed', error: error instanceof Error ? error.message : 'Unknown image upscale error', provider: 'internal', model: ENGINE_MODEL }
  }
}
