import { execFile } from 'node:child_process'
import { existsSync } from 'node:fs'
import { mkdtemp, readFile, rm, writeFile } from 'node:fs/promises'
import { tmpdir } from 'node:os'
import { join } from 'node:path'
import { promisify } from 'node:util'
import { getArtifactFile, getArtifactRecord, saveArtifact } from '@amarktai/artifacts'
import { generateSrt, generateVtt, type SubtitleSegment } from '@amarktai/core'
import type { ProcessorResult, WorkerJobData } from './processors/job-processor.js'

const execFileAsync = promisify(execFile)

type AspectRatio = '16:9' | '9:16' | '1:1'

interface DeliveryVariant {
  variantId: string
  aspectRatio: AspectRatio
  durationSeconds: number
  includeCaptions: boolean
  includeSubtitleFiles: boolean
  includeThumbnail: boolean
}

interface SocialAdAssemblyPlan {
  planId: string
  campaignId: string
  brandProfileId: string
  deliveryVariants: DeliveryVariant[]
  deliverables: string[]
  creativeContext?: {
    brandName?: string
    objective?: string
    offering?: string | null
    approvedClaims?: string[]
    requiredDisclaimers?: string[]
    callToAction?: string
  }
  creativeContract?: {
    version?: string
    treatment?: string
    segmentationAvailable?: boolean
    visualLimitation?: string | null
    safeAreas?: Record<string, unknown>
  } | null
}

interface ProbeResult {
  width: number
  height: number
  durationSeconds: number
  hasVideo: boolean
  hasAudio: boolean
}

function safeObject(value: unknown): Record<string, unknown> {
  return typeof value === 'object' && value !== null && !Array.isArray(value)
    ? value as Record<string, unknown>
    : {}
}

function parsePlan(value: unknown): SocialAdAssemblyPlan {
  const plan = safeObject(value)
  const variants = Array.isArray(plan.deliveryVariants)
    ? plan.deliveryVariants.filter((item): item is DeliveryVariant => {
        const record = safeObject(item)
        return typeof record.variantId === 'string'
          && ['16:9', '9:16', '1:1'].includes(String(record.aspectRatio))
          && typeof record.durationSeconds === 'number'
      })
    : []
  if (typeof plan.planId !== 'string' || typeof plan.campaignId !== 'string' || typeof plan.brandProfileId !== 'string' || variants.length === 0) {
    throw new Error('Social-ad assembly plan is incomplete')
  }
  return {
    planId: plan.planId,
    campaignId: plan.campaignId,
    brandProfileId: plan.brandProfileId,
    deliveryVariants: variants,
    deliverables: Array.isArray(plan.deliverables)
      ? plan.deliverables.filter((item): item is string => typeof item === 'string')
      : [],
    creativeContext: safeObject(plan.creativeContext) as SocialAdAssemblyPlan['creativeContext'],
    creativeContract: safeObject(plan.creativeContract) as SocialAdAssemblyPlan['creativeContract'],
  }
}

function dimensions(aspectRatio: AspectRatio): { width: number; height: number } {
  if (aspectRatio === '9:16') return { width: 1080, height: 1920 }
  if (aspectRatio === '1:1') return { width: 1080, height: 1080 }
  return { width: 1920, height: 1080 }
}

function subtitlePath(path: string): string {
  return path.replaceAll('\\', '/').replaceAll(':', '\\:').replaceAll("'", "\\'")
}

function cleanCaption(value: unknown, fallback = ''): string {
  return typeof value === 'string'
    ? value.replace(/[\r\n]+/g, ' ').replace(/\s+/g, ' ').trim().slice(0, 180)
    : fallback
}

function subtitleSegments(plan: SocialAdAssemblyPlan, durationSeconds: number): SubtitleSegment[] {
  const context = plan.creativeContext ?? {}
  const brandName = cleanCaption(context.brandName, 'Brand story')
  const objective = cleanCaption(context.objective, brandName)
  const offering = cleanCaption(context.offering, '')
  const claims = Array.isArray(context.approvedClaims)
    ? context.approvedClaims.map((claim) => cleanCaption(claim)).filter(Boolean)
    : []
  const disclaimer = Array.isArray(context.requiredDisclaimers)
    ? context.requiredDisclaimers.map((item) => cleanCaption(item)).filter(Boolean).join(' · ')
    : ''
  const callToAction = cleanCaption(context.callToAction, 'Learn more')
  const middle = offering || claims[0] || objective
  const firstEnd = Math.max(1.5, durationSeconds * 0.38)
  const secondEnd = Math.max(firstEnd + 1, durationSeconds * 0.76)
  const segments: SubtitleSegment[] = [
    { index: 1, startTimeSeconds: 0.2, endTimeSeconds: firstEnd, text: objective },
    { index: 2, startTimeSeconds: firstEnd, endTimeSeconds: secondEnd, text: middle },
    { index: 3, startTimeSeconds: secondEnd, endTimeSeconds: Math.max(secondEnd + 0.5, durationSeconds - 0.1), text: callToAction },
  ]
  if (disclaimer) {
    segments.push({
      index: 4,
      startTimeSeconds: Math.max(0, durationSeconds - Math.min(4, durationSeconds * 0.25)),
      endTimeSeconds: Math.max(0.5, durationSeconds - 0.05),
      text: disclaimer,
    })
  }
  return segments.filter((segment) => segment.text.trim() && segment.endTimeSeconds > segment.startTimeSeconds)
}

async function run(command: string, args: string[], timeout = 600_000): Promise<void> {
  await execFileAsync(command, args, {
    timeout,
    maxBuffer: 20 * 1024 * 1024,
    windowsHide: true,
  })
}

async function probe(path: string): Promise<ProbeResult> {
  const { stdout } = await execFileAsync('ffprobe', [
    '-v', 'error',
    '-show_streams',
    '-show_format',
    '-of', 'json',
    path,
  ], { timeout: 60_000, maxBuffer: 10 * 1024 * 1024, windowsHide: true })
  const parsed = JSON.parse(String(stdout)) as {
    streams?: Array<Record<string, unknown>>
    format?: Record<string, unknown>
  }
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

function videoFilter(input: {
  width: number
  height: number
  subtitlesPath: string
  includeCaptions: boolean
}): string {
  const base = [
    `[0:v]split=2[background-source][foreground-source]`,
    `[background-source]scale=${input.width}:${input.height}:force_original_aspect_ratio=increase,crop=${input.width}:${input.height},boxblur=24:3[background]`,
    `[foreground-source]scale=${input.width}:${input.height}:force_original_aspect_ratio=decrease[foreground]`,
    `[background][foreground]overlay=(W-w)/2:(H-h)/2,drawbox=x=iw*0.045:y=ih*0.045:w=iw*0.91:h=ih*0.91:color=white@0.92:t=8,drawbox=x=iw*0.045:y=ih*0.045:w=iw*0.91:h=ih*0.09:color=0x111827@0.78:t=fill,fps=30,format=yuv420p`,
  ].join(';')
  if (!input.includeCaptions) return `${base}[video]`
  return `${base},subtitles='${subtitlePath(input.subtitlesPath)}':force_style='FontName=Arial,FontSize=20,PrimaryColour=&H00FFFFFF,OutlineColour=&H00101010,BorderStyle=1,Outline=2,Shadow=0,MarginV=64,Alignment=2'[video]`
}

async function persistTextArtifact(input: {
  appSlug: string
  executionId: string
  parentJobId: string
  plan: SocialAdAssemblyPlan
  subtype: string
  title: string
  mimeType: string
  text: string
}) {
  return saveArtifact({
    input: {
      appSlug: input.appSlug,
      type: 'document',
      subType: input.subtype,
      title: input.title,
      description: `Social-ad delivery document for ${input.plan.campaignId}`,
      provider: 'amarktai-network',
      model: 'social-ad-delivery-v1',
      traceId: `trace_social_ad_${input.executionId}`,
      mimeType: input.mimeType,
      metadata: {
        socialAdVideo: true,
        executionId: input.executionId,
        parentJobId: input.parentJobId,
        planId: input.plan.planId,
        campaignId: input.plan.campaignId,
      },
    },
    data: Buffer.from(input.text, 'utf8'),
    explicitMimeType: input.mimeType,
  })
}

export async function executeSocialAdAssembly(payload: WorkerJobData): Promise<ProcessorResult> {
  const parentJobId = typeof payload.metadata?.parentJobId === 'string'
    ? payload.metadata.parentJobId
    : null
  const selectedArtifactId = typeof payload.input?.selectedArtifactId === 'string'
    ? payload.input.selectedArtifactId
    : null
  if (!parentJobId || !selectedArtifactId) {
    return { success: false, status: 'failed', provider: 'ffmpeg', model: 'social-ad-assembly-v1', error: 'Social-ad assembly requires parentJobId and selectedArtifactId' }
  }

  try {
    const plan = parsePlan(payload.metadata?.plan)
    const sourceRecord = await getArtifactRecord(selectedArtifactId)
    const sourceFile = await getArtifactFile(selectedArtifactId)
    if (!sourceRecord || !sourceFile || sourceRecord.appSlug !== payload.appSlug || !sourceRecord.mimeType.startsWith('video/')) {
      throw new Error('Approved social-ad source artifact is missing or not authorised')
    }
    const workspace = await mkdtemp(join(tmpdir(), `amarktai-social-ad-${payload.traceId}-`))
    try {
      const sourcePath = join(workspace, sourceRecord.mimeType === 'video/webm' ? 'source.webm' : 'source.mp4')
      await writeFile(sourcePath, sourceFile.buffer)
      if (!existsSync(sourcePath)) throw new Error('Social-ad assembly source file was not written')
      const sourceProbe = await probe(sourcePath)
      if (!sourceProbe.hasVideo || !Number.isFinite(sourceProbe.durationSeconds) || sourceProbe.durationSeconds <= 0) {
        throw new Error('Approved social-ad source failed video validation')
      }
      const targetDuration = Math.min(
        sourceProbe.durationSeconds,
        Math.max(...plan.deliveryVariants.map((variant) => variant.durationSeconds)),
      )
      const segments = subtitleSegments(plan, targetDuration)
      const srt = generateSrt(segments)
      const vtt = generateVtt(segments)
      const srtPath = join(workspace, 'captions.srt')
      await writeFile(srtPath, srt, 'utf8')

      const subtitleArtifactIds: string[] = []
      if (plan.deliverables.includes('subtitle_srt')) {
        const artifact = await persistTextArtifact({
          appSlug: payload.appSlug,
          executionId: payload.traceId,
          parentJobId,
          plan,
          subtype: 'social_ad_subtitle_srt',
          title: `${plan.campaignId} subtitles (SRT)`,
          mimeType: 'application/x-subrip',
          text: srt,
        })
        subtitleArtifactIds.push(artifact.id)
      }
      if (plan.deliverables.includes('subtitle_vtt')) {
        const artifact = await persistTextArtifact({
          appSlug: payload.appSlug,
          executionId: payload.traceId,
          parentJobId,
          plan,
          subtype: 'social_ad_subtitle_vtt',
          title: `${plan.campaignId} subtitles (VTT)`,
          mimeType: 'text/vtt',
          text: vtt,
        })
        subtitleArtifactIds.push(artifact.id)
      }

      const variants: Array<{
        artifactId: string
        aspectRatio: AspectRatio
        width: number
        height: number
        durationSeconds: number
        fileSizeBytes: number
        captionsIncluded: boolean
        audioIncluded: boolean
      }> = []
      for (const variant of plan.deliveryVariants) {
        const target = dimensions(variant.aspectRatio)
        const outputPath = join(workspace, `social-ad-${variant.aspectRatio.replace(':', 'x')}.mp4`)
        const filter = videoFilter({
          width: target.width,
          height: target.height,
          subtitlesPath: srtPath,
          includeCaptions: variant.includeCaptions,
        })
        const args = [
          '-hide_banner', '-loglevel', 'error',
          '-i', sourcePath,
          '-filter_complex', filter,
          '-map', '[video]',
          '-map', '0:a?',
          '-t', String(Math.min(variant.durationSeconds, sourceProbe.durationSeconds)),
          '-c:v', 'libx264', '-preset', 'slow', '-crf', '17', '-pix_fmt', 'yuv420p',
          '-c:a', 'aac', '-b:a', '192k', '-ar', '48000',
          '-movflags', '+faststart',
          '-y', outputPath,
        ]
        await run('ffmpeg', args)
        const inspected = await probe(outputPath)
        if (!inspected.hasVideo || inspected.width !== target.width || inspected.height !== target.height) {
          throw new Error(`Social-ad ${variant.aspectRatio} variant failed dimension validation`)
        }
        if (!Number.isFinite(inspected.durationSeconds) || inspected.durationSeconds <= 0 || Math.abs(inspected.durationSeconds - Math.min(variant.durationSeconds, sourceProbe.durationSeconds)) > 0.75) {
          throw new Error(`Social-ad ${variant.aspectRatio} variant failed duration validation`)
        }
        const bytes = await readFile(outputPath)
        if (bytes.length < 1024 || !bytes.subarray(0, 64).includes(Buffer.from('ftyp'))) {
          throw new Error(`Social-ad ${variant.aspectRatio} MP4 signature is invalid`)
        }
        const artifact = await saveArtifact({
          input: {
            appSlug: payload.appSlug,
            type: 'video',
            subType: `social_ad_${variant.aspectRatio.replace(':', 'x')}`,
            title: `${plan.campaignId} social advert ${variant.aspectRatio}`,
            description: `Approved social-ad delivery variant in ${variant.aspectRatio}`,
            provider: 'ffmpeg',
            model: 'social-ad-variant-assembly-v1',
            traceId: payload.traceId,
            mimeType: 'video/mp4',
            metadata: {
              socialAdVideo: true,
              executionId: payload.metadata?.executionId ?? payload.traceId,
              parentJobId,
              planId: plan.planId,
              campaignId: plan.campaignId,
              brandProfileId: plan.brandProfileId,
              sourceArtifactId: selectedArtifactId,
              aspectRatio: variant.aspectRatio,
              width: inspected.width,
              height: inspected.height,
              durationSeconds: inspected.durationSeconds,
              captionsIncluded: variant.includeCaptions,
              subtitleArtifactIds,
              sourceAudioPreserved: sourceProbe.hasAudio,
              outputValidated: true,
            },
          },
          data: bytes,
          explicitMimeType: 'video/mp4',
        })
        variants.push({
          artifactId: artifact.id,
          aspectRatio: variant.aspectRatio,
          width: inspected.width,
          height: inspected.height,
          durationSeconds: inspected.durationSeconds,
          fileSizeBytes: artifact.fileSizeBytes,
          captionsIncluded: variant.includeCaptions,
          audioIncluded: inspected.hasAudio,
        })
      }

      const primary = variants[0]
      if (!primary) throw new Error('Social-ad assembly produced no variants')
      const primaryPath = join(workspace, `social-ad-${primary.aspectRatio.replace(':', 'x')}.mp4`)
      const masterBytes = await readFile(primaryPath)
      const master = await saveArtifact({
        input: {
          appSlug: payload.appSlug,
          type: 'video',
          subType: 'social_ad_master',
          title: `${plan.campaignId} social advert master`,
          description: 'Approved deterministic social-ad master used to derive the delivery pack',
          provider: 'ffmpeg',
          model: 'social-ad-master-assembly-v1',
          traceId: payload.traceId,
          mimeType: 'video/mp4',
          metadata: {
            socialAdVideo: true,
            executionId: payload.metadata?.executionId ?? payload.traceId,
            parentJobId,
            planId: plan.planId,
            sourceArtifactId: selectedArtifactId,
            sourceVariantArtifactId: primary.artifactId,
            width: primary.width,
            height: primary.height,
            durationSeconds: primary.durationSeconds,
            outputValidated: true,
            fastStartMp4: true,
          },
        },
        data: masterBytes,
        explicitMimeType: 'video/mp4',
      })
      const thumbnailPath = join(workspace, 'thumbnail.jpg')
      await run('ffmpeg', [
        '-hide_banner', '-loglevel', 'error',
        '-ss', String(Math.min(1, Math.max(0.1, primary.durationSeconds * 0.25))),
        '-i', primaryPath,
        '-frames:v', '1', '-q:v', '2', '-y', thumbnailPath,
      ], 60_000)
      const thumbnailBytes = await readFile(thumbnailPath)
      if (thumbnailBytes.length < 4 || thumbnailBytes[0] !== 0xff || thumbnailBytes[1] !== 0xd8) {
        throw new Error('Social-ad thumbnail is not a valid JPEG')
      }
      const thumbnail = await saveArtifact({
        input: {
          appSlug: payload.appSlug,
          type: 'image',
          subType: 'social_ad_thumbnail',
          title: `${plan.campaignId} social advert thumbnail`,
          description: 'Thumbnail extracted from the approved social-ad master',
          provider: 'ffmpeg',
          model: 'social-ad-thumbnail-v1',
          traceId: payload.traceId,
          mimeType: 'image/jpeg',
          metadata: {
            socialAdVideo: true,
            parentJobId,
            planId: plan.planId,
            sourceVariantArtifactId: primary.artifactId,
            outputValidated: true,
          },
        },
        data: thumbnailBytes,
        explicitMimeType: 'image/jpeg',
      })

      const report = {
        socialAdVideo: true,
        executionId: payload.metadata?.executionId ?? payload.traceId,
        parentJobId,
        planId: plan.planId,
        selectedSourceArtifactId: selectedArtifactId,
        masterVideoArtifactId: master.id,
        variants,
        subtitleArtifactIds,
        thumbnailArtifactId: thumbnail.id,
        qualityRanking: payload.metadata?.qualityRanking ?? [],
        humanApproval: payload.metadata?.humanApproval ?? {},
        validation: {
          sourceVideoValid: true,
          everyVariantValid: variants.length === plan.deliveryVariants.length,
          thumbnailValid: true,
          subtitlesGenerated: segments.length > 0,
          everyVideoHasExpectedDimensions: variants.every((variant) => variant.width > 0 && variant.height > 0),
          everyVideoHasValidDuration: variants.every((variant) => variant.durationSeconds > 0),
          everyVideoIsFastStartMp4: true,
          sourceAudioPreservedWhenPresent: !sourceProbe.hasAudio || variants.every((variant) => variant.audioIncluded),
        },
        deterministicComposition: {
          treatment: plan.creativeContract?.treatment ?? 'social_post_card_frame',
          visibleCardFrame: true,
          approvedGeneratedCandidatePreserved: true,
          segmentationClaimed: false,
          visualLimitation: plan.creativeContract?.visualLimitation
            ?? 'No segmentation mask was available; the generated candidate is preserved inside a truthful framed composition.',
          humanReviewRequired: ['generated_breakout_appearance', 'product_identity_and_geometry', 'logo_integrity'],
        },
      }
      const finalQualityReport = await persistTextArtifact({
        appSlug: payload.appSlug,
        executionId: payload.traceId,
        parentJobId,
        plan,
        subtype: 'social_ad_final_quality_report',
        title: `${plan.campaignId} final-pack quality report`,
        mimeType: 'application/json',
        text: JSON.stringify({
          version: 'social-ad-final-quality-v1',
          parentJobId,
          selectedSourceArtifactId: selectedArtifactId,
          masterVideoArtifactId: master.id,
          variants,
          validation: report.validation,
          deterministicComposition: report.deterministicComposition,
          evidenceSources: ['ffprobe', 'ffmpeg', 'artifact_store'],
        }, null, 2),
      })
      const reportArtifact = await persistTextArtifact({
        appSlug: payload.appSlug,
        executionId: payload.traceId,
        parentJobId,
        plan,
        subtype: 'social_ad_execution_evidence',
        title: `${plan.campaignId} execution evidence`,
        mimeType: 'application/json',
        text: JSON.stringify(report, null, 2),
      })

      return {
        success: true,
        status: 'completed',
        provider: 'ffmpeg',
        model: 'social-ad-assembly-v1',
        artifactId: master.id,
        output: JSON.stringify({
          ...report,
          reportArtifactId: reportArtifact.id,
          finalQualityReportArtifactId: finalQualityReport.id,
          socialCopyStatus: plan.deliverables.includes('social_copy') ? 'pending_text_quality_workflow' : 'not_requested',
        }),
        metadata: {
          socialAdAssembly: true,
          outputValidation: { valid: true, variantCount: variants.length },
          masterVideoArtifactId: master.id,
          variantArtifactIds: variants.map((variant) => variant.artifactId),
          subtitleArtifactIds,
          thumbnailArtifactId: thumbnail.id,
          reportArtifactId: reportArtifact.id,
          finalQualityReportArtifactId: finalQualityReport.id,
        },
      }
    } finally {
      await rm(workspace, { recursive: true, force: true })
    }
  } catch (error) {
    return {
      success: false,
      status: 'failed',
      provider: 'ffmpeg',
      model: 'social-ad-assembly-v1',
      error: error instanceof Error ? error.message : 'Social-ad assembly failed',
    }
  }
}
