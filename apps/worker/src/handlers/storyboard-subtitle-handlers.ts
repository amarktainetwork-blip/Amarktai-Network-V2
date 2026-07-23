import { createHash } from 'node:crypto'
import { prisma } from '@amarktai/db'
import { saveArtifact } from '@amarktai/artifacts'
import {
  createLongFormVideoPlan,
  generateSrt,
  generateSubtitles,
  generateVtt,
  type SubtitleSegment,
} from '@amarktai/core'
import {
  STORYBOARD_INTERNAL_MODEL,
  SUBTITLE_INTERNAL_MODEL,
  StoryboardGenerationOutputSchema,
  StoryboardGenerationRequestSchema,
  SubtitleGenerationOutputSchema,
  SubtitleGenerationRequestSchema,
} from '@amarktai/core/storyboard-subtitle-contracts'
import type { ProcessorResult, WorkerJobData } from '../processors/job-processor.js'

function checksum(data: Buffer): string {
  return createHash('sha256').update(data).digest('hex')
}

function parseMetadata(value: string | null | undefined): Record<string, unknown> {
  if (!value?.trim()) return {}
  try {
    const parsed = JSON.parse(value)
    return typeof parsed === 'object' && parsed !== null && !Array.isArray(parsed)
      ? parsed as Record<string, unknown>
      : {}
  } catch {
    return {}
  }
}

async function isCancelled(jobId: string): Promise<boolean> {
  const job = await prisma.job.findUnique({ where: { id: jobId }, select: { status: true } })
  return job?.status === 'cancelled'
}

async function persistJobEvidence(jobId: string, evidence: Record<string, unknown>): Promise<void> {
  const job = await prisma.job.findUnique({ where: { id: jobId }, select: { metadataJson: true } })
  await prisma.job.update({
    where: { id: jobId },
    data: {
      metadataJson: JSON.stringify({
        ...parseMetadata(job?.metadataJson),
        internalExecutionEngine: evidence.engine,
        outputValidation: evidence.outputValidation,
        internalExecutionEvidence: evidence,
      }),
    },
  })
}

export async function handleStoryboardGenerationJob(payload: WorkerJobData): Promise<ProcessorResult> {
  const model = STORYBOARD_INTERNAL_MODEL
  try {
    if (!payload.jobId || !payload.appSlug || !payload.traceId) {
      return { success: false, status: 'failed', provider: 'internal', model, error: 'storyboard_generation requires jobId, appSlug and traceId' }
    }
    const parsed = StoryboardGenerationRequestSchema.safeParse(payload.input ?? {})
    if (!parsed.success) {
      return {
        success: false,
        status: 'failed',
        provider: 'internal',
        model,
        error: `Invalid storyboard_generation request: ${parsed.error.issues.map((issue) => `${issue.path.join('.') || 'input'} ${issue.message}`).join('; ')}`,
      }
    }
    if (!payload.appGrantSnapshot?.enabled || !payload.appGrantSnapshot.artifactWrite) {
      return { success: false, status: 'failed', provider: 'internal', model, error: 'Immutable AppCapabilityGrant denies storyboard artifact creation' }
    }
    if (await isCancelled(payload.jobId)) {
      return { success: false, status: 'failed', provider: 'internal', model, error: 'Job was cancelled before storyboard planning' }
    }

    const request = parsed.data
    const planningPrompt = [
      request.brief ?? 'Create a production-ready storyboard from the supplied script.',
      request.script ? `Script context:\n${request.script}` : '',
    ].filter(Boolean).join('\n\n').slice(0, 5_000)
    const plan = createLongFormVideoPlan({
      prompt: planningPrompt,
      targetDurationSeconds: request.targetDurationSeconds,
      sceneCount: request.sceneCount,
      aspectRatio: request.aspectRatio,
      style: request.style,
      tone: request.tone,
      audience: request.audience,
      count: 1,
      voiceoverEnabled: request.includeVoiceoverDraft,
      subtitlesEnabled: request.includeSubtitleDraft,
      musicBedEnabled: false,
      routingMode: 'balanced',
      planningMode: 'automatic',
      brandName: request.brandName,
      brandWebsite: request.brandWebsite,
      objective: request.objective,
      callToAction: request.callToAction,
      legalQualifier: request.legalQualifier,
      voiceoverScript: request.script,
    })

    const artifactDocument = {
      schemaVersion: 1,
      capability: 'storyboard_generation',
      providerCallsStarted: false,
      request: {
        targetDurationSeconds: request.targetDurationSeconds,
        sceneCount: request.sceneCount,
        aspectRatio: request.aspectRatio,
        style: request.style,
        tone: request.tone,
        audience: request.audience ?? null,
        brandName: request.brandName ?? null,
      },
      plan,
    }
    const data = Buffer.from(`${JSON.stringify(artifactDocument, null, 2)}\n`, 'utf8')
    const outputChecksum = checksum(data)
    const outputValidation = {
      valid: true,
      schemaVersion: 1,
      sceneCount: plan.storyboard.scenes.length,
      totalDurationSeconds: plan.storyboard.totalDurationSeconds,
      providerCallsStarted: false,
    }
    const artifact = await saveArtifact({
      input: {
        appSlug: payload.appSlug,
        type: 'document',
        subType: 'storyboard_generation_plan',
        title: request.brandName ? `${request.brandName} storyboard` : 'Generated storyboard',
        description: `Deterministic ${plan.storyboard.scenes.length}-scene production storyboard`,
        provider: 'internal',
        model,
        traceId: payload.traceId,
        mimeType: 'application/json',
        metadata: {
          evidenceSource: 'internal_planner',
          liveProviderProof: false,
          outputChecksum,
          outputValidation,
          versionHash: plan.versionHash,
          sceneCount: plan.storyboard.scenes.length,
          totalDurationSeconds: plan.storyboard.totalDurationSeconds,
          providerCallsStarted: false,
        },
      },
      data,
      explicitMimeType: 'application/json',
    })

    if (await isCancelled(payload.jobId)) {
      await prisma.artifact.update({ where: { id: artifact.id }, data: { status: 'expired', errorMessage: 'Cancelled during storyboard persistence' } }).catch(() => {})
      return { success: false, status: 'failed', provider: 'internal', model, artifactId: artifact.id, error: 'Job was cancelled after storyboard persistence' }
    }

    const evidence = {
      evidenceSource: 'internal_planner',
      liveProviderProof: false,
      engine: 'planner',
      model,
      providerCallsStarted: false,
      outputArtifactId: artifact.id,
      outputChecksum,
      outputValidation,
    }
    await persistJobEvidence(payload.jobId, evidence)
    const output = StoryboardGenerationOutputSchema.parse({
      artifactId: artifact.id,
      artifactUrl: artifact.storageUrl,
      mimeType: 'application/json',
      fileSizeBytes: artifact.fileSizeBytes,
      versionHash: plan.versionHash,
      totalDurationSeconds: plan.storyboard.totalDurationSeconds,
      sceneCount: plan.storyboard.scenes.length,
      storyboard: plan.storyboard,
      outputChecksum,
      evidence: {
        evidenceSource: 'internal_planner',
        liveProviderProof: false,
        engine: 'planner',
        model,
        providerCallsStarted: false,
      },
    })
    return {
      success: true,
      status: 'completed',
      provider: 'internal',
      model,
      artifactId: artifact.id,
      output: JSON.stringify(output),
      metadata: evidence,
    }
  } catch (error) {
    return { success: false, status: 'failed', provider: 'internal', model, error: error instanceof Error ? error.message : 'Unknown storyboard generation error' }
  }
}

function normalizeSubtitleSegments(input: ReturnType<typeof SubtitleGenerationRequestSchema.parse>): {
  segments: SubtitleSegment[]
  content: string
  timingSource: 'explicit_scenes' | 'explicit_segments'
} {
  if (input.scenes) {
    const generated = generateSubtitles({
      scenes: input.scenes.map((scene) => ({
        sceneNumber: scene.sceneNumber,
        subtitleText: scene.subtitleText,
        durationSeconds: scene.durationSeconds,
      })),
      format: input.format,
    })
    return { segments: generated.segments, content: generated.content, timingSource: 'explicit_scenes' }
  }
  const segments = input.segments!.map((segment, index) => ({
    index: index + 1,
    startTimeSeconds: segment.startTimeSeconds,
    endTimeSeconds: segment.endTimeSeconds,
    text: segment.text,
  }))
  return {
    segments,
    content: input.format === 'vtt' ? generateVtt(segments) : generateSrt(segments),
    timingSource: 'explicit_segments',
  }
}

export async function handleSubtitleGenerationJob(payload: WorkerJobData): Promise<ProcessorResult> {
  const model = SUBTITLE_INTERNAL_MODEL
  try {
    if (!payload.jobId || !payload.appSlug || !payload.traceId) {
      return { success: false, status: 'failed', provider: 'internal', model, error: 'subtitle_generation requires jobId, appSlug and traceId' }
    }
    const parsed = SubtitleGenerationRequestSchema.safeParse(payload.input ?? {})
    if (!parsed.success) {
      return {
        success: false,
        status: 'failed',
        provider: 'internal',
        model,
        error: `Invalid subtitle_generation request: ${parsed.error.issues.map((issue) => `${issue.path.join('.') || 'input'} ${issue.message}`).join('; ')}`,
      }
    }
    if (!payload.appGrantSnapshot?.enabled || !payload.appGrantSnapshot.artifactWrite) {
      return { success: false, status: 'failed', provider: 'internal', model, error: 'Immutable AppCapabilityGrant denies subtitle artifact creation' }
    }
    if (await isCancelled(payload.jobId)) {
      return { success: false, status: 'failed', provider: 'internal', model, error: 'Job was cancelled before subtitle formatting' }
    }

    const request = parsed.data
    const normalized = normalizeSubtitleSegments(request)
    const data = Buffer.from(normalized.content, 'utf8')
    const outputChecksum = checksum(data)
    const durationSeconds = Math.max(...normalized.segments.map((segment) => segment.endTimeSeconds))
    const mimeType = request.format === 'vtt' ? 'text/vtt' : 'application/x-subrip'
    const outputValidation = {
      valid: true,
      format: request.format,
      segmentCount: normalized.segments.length,
      durationSeconds,
      timingSource: normalized.timingSource,
      nonOverlapping: true,
    }
    const artifact = await saveArtifact({
      input: {
        appSlug: payload.appSlug,
        type: 'transcript',
        subType: `subtitle_generation_${request.format}`,
        title: request.title ?? `Generated ${request.format.toUpperCase()} subtitles`,
        description: `${normalized.segments.length} validated timed subtitle segments`,
        provider: 'internal',
        model,
        traceId: payload.traceId,
        mimeType,
        metadata: {
          evidenceSource: 'internal_formatter',
          liveProviderProof: false,
          outputChecksum,
          outputValidation,
          language: request.language ?? null,
          timingSource: normalized.timingSource,
        },
      },
      data,
      explicitMimeType: mimeType,
    })

    if (await isCancelled(payload.jobId)) {
      await prisma.artifact.update({ where: { id: artifact.id }, data: { status: 'expired', errorMessage: 'Cancelled during subtitle persistence' } }).catch(() => {})
      return { success: false, status: 'failed', provider: 'internal', model, artifactId: artifact.id, error: 'Job was cancelled after subtitle persistence' }
    }

    const evidence = {
      evidenceSource: 'internal_formatter',
      liveProviderProof: false,
      engine: 'formatter',
      model,
      timingSource: normalized.timingSource,
      outputArtifactId: artifact.id,
      outputChecksum,
      outputValidation,
    }
    await persistJobEvidence(payload.jobId, evidence)
    const output = SubtitleGenerationOutputSchema.parse({
      artifactId: artifact.id,
      artifactUrl: artifact.storageUrl,
      mimeType,
      fileSizeBytes: artifact.fileSizeBytes,
      format: request.format,
      segmentCount: normalized.segments.length,
      durationSeconds,
      outputChecksum,
      evidence: {
        evidenceSource: 'internal_formatter',
        liveProviderProof: false,
        engine: 'formatter',
        model,
        timingSource: normalized.timingSource,
      },
    })
    return {
      success: true,
      status: 'completed',
      provider: 'internal',
      model,
      artifactId: artifact.id,
      output: JSON.stringify(output),
      metadata: evidence,
    }
  } catch (error) {
    return { success: false, status: 'failed', provider: 'internal', model, error: error instanceof Error ? error.message : 'Unknown subtitle generation error' }
  }
}
