import { z } from 'zod'
import {
  LongFormVideoAspectRatio,
  LongFormVideoStyle,
  LongFormVideoTone,
  LongFormStoryboardSchema,
} from './long-form-video.js'

export const STORYBOARD_INTERNAL_MODEL = 'planner-storyboard-v1'
export const SUBTITLE_INTERNAL_MODEL = 'formatter-subtitle-v1'

export const StoryboardGenerationRequestSchema = z.object({
  brief: z.string().trim().min(10).max(5_000).optional(),
  script: z.string().trim().min(10).max(10_000).optional(),
  targetDurationSeconds: z.number().int().min(30).max(600).default(30),
  sceneCount: z.number().int().min(2).max(20).default(6),
  aspectRatio: LongFormVideoAspectRatio.default('16:9'),
  style: LongFormVideoStyle.default('cinematic'),
  tone: LongFormVideoTone.default('professional'),
  audience: z.string().trim().max(1_000).optional(),
  brandName: z.string().trim().max(200).optional(),
  brandWebsite: z.string().trim().url().max(500).optional(),
  objective: z.string().trim().max(1_000).optional(),
  callToAction: z.string().trim().max(500).optional(),
  legalQualifier: z.string().trim().max(1_000).optional(),
  includeVoiceoverDraft: z.boolean().default(true),
  includeSubtitleDraft: z.boolean().default(true),
  idempotencyKey: z.string().trim().min(1).max(200),
}).strict().superRefine((value, context) => {
  if (!value.brief && !value.script) {
    context.addIssue({ code: 'custom', path: ['brief'], message: 'brief or script is required' })
  }
})

export type StoryboardGenerationRequest = z.infer<typeof StoryboardGenerationRequestSchema>

export const StoryboardGenerationOutputSchema = z.object({
  artifactId: z.string().uuid(),
  artifactUrl: z.string().min(1),
  mimeType: z.literal('application/json'),
  fileSizeBytes: z.number().int().positive(),
  versionHash: z.string().min(1),
  totalDurationSeconds: z.number().positive(),
  sceneCount: z.number().int().min(2).max(20),
  storyboard: LongFormStoryboardSchema,
  outputChecksum: z.string().min(1),
  evidence: z.object({
    evidenceSource: z.literal('internal_planner'),
    liveProviderProof: z.literal(false),
    engine: z.literal('planner'),
    model: z.literal(STORYBOARD_INTERNAL_MODEL),
    providerCallsStarted: z.literal(false),
  }).strict(),
}).strict()

export type StoryboardGenerationOutput = z.infer<typeof StoryboardGenerationOutputSchema>

export const SubtitleSceneInputSchema = z.object({
  sceneNumber: z.number().int().min(1),
  subtitleText: z.string().trim().min(1).max(5_000),
  durationSeconds: z.number().positive().max(600),
}).strict()

export const SubtitleTimedSegmentSchema = z.object({
  text: z.string().trim().min(1).max(5_000),
  startTimeSeconds: z.number().min(0),
  endTimeSeconds: z.number().positive(),
}).strict().refine((value) => value.endTimeSeconds > value.startTimeSeconds, {
  message: 'endTimeSeconds must be greater than startTimeSeconds',
  path: ['endTimeSeconds'],
})

export const SubtitleGenerationRequestSchema = z.object({
  format: z.enum(['srt', 'vtt']).default('srt'),
  scenes: z.array(SubtitleSceneInputSchema).min(1).max(500).optional(),
  segments: z.array(SubtitleTimedSegmentSchema).min(1).max(5_000).optional(),
  language: z.string().trim().min(2).max(20).optional(),
  title: z.string().trim().min(1).max(200).optional(),
  idempotencyKey: z.string().trim().min(1).max(200),
}).strict().superRefine((value, context) => {
  const sources = Number(Boolean(value.scenes)) + Number(Boolean(value.segments))
  if (sources !== 1) {
    context.addIssue({ code: 'custom', message: 'exactly one of scenes or segments is required' })
  }
  if (value.scenes) {
    const numbers = value.scenes.map((scene) => scene.sceneNumber)
    const expected = value.scenes.map((_, index) => index + 1)
    if (JSON.stringify(numbers) !== JSON.stringify(expected)) {
      context.addIssue({ code: 'custom', path: ['scenes'], message: 'sceneNumber values must be sequential starting at 1' })
    }
  }
  if (value.segments) {
    for (let index = 1; index < value.segments.length; index += 1) {
      const previous = value.segments[index - 1]!
      const current = value.segments[index]!
      if (current.startTimeSeconds < previous.endTimeSeconds) {
        context.addIssue({ code: 'custom', path: ['segments', index, 'startTimeSeconds'], message: 'segments must be ordered and non-overlapping' })
      }
    }
  }
})

export type SubtitleGenerationRequest = z.infer<typeof SubtitleGenerationRequestSchema>

export const SubtitleGenerationOutputSchema = z.object({
  artifactId: z.string().uuid(),
  artifactUrl: z.string().min(1),
  mimeType: z.enum(['application/x-subrip', 'text/vtt']),
  fileSizeBytes: z.number().int().positive(),
  format: z.enum(['srt', 'vtt']),
  segmentCount: z.number().int().positive(),
  durationSeconds: z.number().positive(),
  outputChecksum: z.string().min(1),
  evidence: z.object({
    evidenceSource: z.literal('internal_formatter'),
    liveProviderProof: z.literal(false),
    engine: z.literal('formatter'),
    model: z.literal(SUBTITLE_INTERNAL_MODEL),
    timingSource: z.enum(['explicit_scenes', 'explicit_segments']),
  }).strict(),
}).strict()

export type SubtitleGenerationOutput = z.infer<typeof SubtitleGenerationOutputSchema>
