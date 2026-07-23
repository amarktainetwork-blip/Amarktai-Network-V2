import { z } from 'zod'

export const VOICE_ACTIVITY_DETECTION_EVIDENCE_SOURCES = ['internal_ffmpeg'] as const

export const VoiceActivityDetectionRequestSchema = z.object({
  sourceAudioArtifactId: z.string().uuid(),
  thresholdDb: z.number().finite().min(-80).max(-5).default(-35),
  minimumSpeechMs: z.number().int().min(50).max(10_000).default(250),
  minimumSilenceMs: z.number().int().min(50).max(10_000).default(300),
  idempotencyKey: z.string().trim().min(1).max(200),
}).strict()

export const VoiceActivitySegmentSchema = z.object({
  startSeconds: z.number().finite().nonnegative(),
  endSeconds: z.number().finite().positive(),
  durationSeconds: z.number().finite().positive(),
}).strict().superRefine((segment, context) => {
  if (segment.endSeconds <= segment.startSeconds) {
    context.addIssue({ code: 'custom', path: ['endSeconds'], message: 'endSeconds must exceed startSeconds' })
  }
})

export const VoiceActivityDetectionOutputSchema = z.object({
  sourceAudioArtifactId: z.string().uuid(),
  durationSeconds: z.number().finite().positive(),
  speechDurationSeconds: z.number().finite().nonnegative(),
  speechRatio: z.number().finite().min(0).max(1),
  segments: z.array(VoiceActivitySegmentSchema).max(10_000),
  thresholdDb: z.number().finite().min(-80).max(-5),
  minimumSpeechMs: z.number().int().min(50).max(10_000),
  minimumSilenceMs: z.number().int().min(50).max(10_000),
  evidence: z.object({
    evidenceSource: z.literal('internal_ffmpeg'),
    liveProviderProof: z.literal(false),
    engine: z.literal('ffmpeg'),
    filter: z.literal('silencedetect'),
    sourceChecksum: z.string().regex(/^[a-f0-9]{64}$/),
    outputValidation: z.object({
      durationProbed: z.literal(true),
      finiteOrderedSegments: z.literal(true),
      segmentCount: z.number().int().nonnegative(),
    }).strict(),
  }).strict(),
}).strict()

export type VoiceActivityDetectionRequest = z.infer<typeof VoiceActivityDetectionRequestSchema>
export type VoiceActivitySegment = z.infer<typeof VoiceActivitySegmentSchema>
export type VoiceActivityDetectionOutput = z.infer<typeof VoiceActivityDetectionOutputSchema>
