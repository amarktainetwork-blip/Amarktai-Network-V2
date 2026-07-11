import { z } from 'zod'

// ── Long-Form Video Schema ────────────────────────────────────────────────────

export const LongFormVideoSafetyLevel = z.enum(['standard', 'strict', 'relaxed'])
export type LongFormVideoSafetyLevel = z.infer<typeof LongFormVideoSafetyLevel>

export const LongFormVideoAspectRatio = z.enum(['16:9', '9:16', '1:1', '4:3', '21:9'])
export type LongFormVideoAspectRatio = z.infer<typeof LongFormVideoAspectRatio>

export const LongFormVideoStyle = z.enum([
  'cinematic',
  'documentary',
  'educational',
  'promotional',
  'narrative',
  'abstract',
  'minimalist'
])
export type LongFormVideoStyle = z.infer<typeof LongFormVideoStyle>

export const LongFormVideoTone = z.enum([
  'professional',
  'casual',
  'dramatic',
  'upbeat',
  'inspirational',
  'informative'
])
export type LongFormVideoTone = z.infer<typeof LongFormVideoTone>

export const LongFormSceneStatus = z.enum([
  'planned',
  'ready',
  'generating',
  'generated',
  'failed',
  'skipped'
])
export type LongFormSceneStatus = z.infer<typeof LongFormSceneStatus>

export const LongFormRenderStepType = z.enum([
  'scene_generation',
  'voiceover_generation',
  'subtitle_generation',
  'music_bed_generation',
  'scene_stitching',
  'final_assembly'
])
export type LongFormRenderStepType = z.infer<typeof LongFormRenderStepType>

export const LongFormRenderStatus = z.enum([
  'pending',
  'ready',
  'blocked',
  'in_progress',
  'completed',
  'failed'
])
export type LongFormRenderStatus = z.infer<typeof LongFormRenderStatus>

// ── Request Schema ────────────────────────────────────────────────────────────

export const LongFormVideoRequestSchema = z.object({
  prompt: z.string().min(10).max(5000),
  targetDurationSeconds: z.number().min(30).max(600),
  aspectRatio: LongFormVideoAspectRatio.default('16:9'),
  style: LongFormVideoStyle.default('cinematic'),
  tone: LongFormVideoTone.default('professional'),
  audience: z.string().optional(),
  count: z.number().int().min(1).max(10).default(1),
  sceneCount: z.number().min(2).max(20).default(5),
  voiceoverEnabled: z.boolean().default(false),
  subtitlesEnabled: z.boolean().default(false),
  musicBedEnabled: z.boolean().default(false),
  routingMode: z.enum(['balanced', 'premium', 'fast', 'budget']).default('balanced'),
  brandContext: z.string().optional(),
  safetyLevel: LongFormVideoSafetyLevel.default('standard')
})

export type LongFormVideoRequest = z.infer<typeof LongFormVideoRequestSchema>

// ── Scene Schema ──────────────────────────────────────────────────────────────

export const LongFormSceneSchema = z.object({
  sceneNumber: z.number().int().min(1),
  title: z.string(),
  description: z.string(),
  visualPrompt: z.string(),
  cameraDirection: z.string().optional(),
  durationSeconds: z.number().min(1),
  transitionIn: z.string().optional(),
  transitionOut: z.string().optional(),
  voiceoverText: z.string().optional(),
  subtitleText: z.string().optional(),
  musicCue: z.string().optional(),
  status: LongFormSceneStatus.default('planned')
})

export type LongFormScene = z.infer<typeof LongFormSceneSchema>

// ── Render Step Schema ────────────────────────────────────────────────────────

export const LongFormRenderStepSchema = z.object({
  stepNumber: z.number().int().min(1),
  type: LongFormRenderStepType,
  description: z.string(),
  dependencies: z.array(z.string()),
  status: LongFormRenderStatus.default('pending'),
  blockedReason: z.string().optional()
})

export type LongFormRenderStep = z.infer<typeof LongFormRenderStepSchema>

// ── Storyboard Schema ─────────────────────────────────────────────────────────

export const LongFormStoryboardSchema = z.object({
  scenes: z.array(LongFormSceneSchema),
  totalDurationSeconds: z.number(),
  narrativeFlow: z.string().optional()
})

export type LongFormStoryboard = z.infer<typeof LongFormStoryboardSchema>

// ── Artifact Plan Schema ──────────────────────────────────────────────────────

export const LongFormVideoArtifactPlanSchema = z.object({
  finalVideoArtifact: z.boolean(),
  sceneArtifacts: z.array(z.string()),
  voiceoverArtifacts: z.array(z.string()).optional(),
  subtitleArtifacts: z.array(z.string()).optional(),
  musicBedArtifacts: z.array(z.string()).optional()
})

export type LongFormVideoArtifactPlan = z.infer<typeof LongFormVideoArtifactPlanSchema>

// ── Plan Schema ───────────────────────────────────────────────────────────────

export const LongFormVideoPlanSchema = z.object({
  id: z.string(),
  prompt: z.string(),
  totalDurationSeconds: z.number(),
  aspectRatio: LongFormVideoAspectRatio,
  style: LongFormVideoStyle,
  tone: LongFormVideoTone,
  storyboard: LongFormStoryboardSchema,
  renderSteps: z.array(LongFormRenderStepSchema),
  artifactPlan: LongFormVideoArtifactPlanSchema,
  missingDependencies: z.array(z.string()),
  executableNow: z.boolean(),
  perSceneVideoGenerationPossible: z.boolean(),
  finalAssemblyReady: z.boolean(),
  reasonIfBlocked: z.string().optional()
})

export type LongFormVideoPlan = z.infer<typeof LongFormVideoPlanSchema>

// ── Validation Helpers ────────────────────────────────────────────────────────

export function validateLongFormVideoRequest(input: unknown): LongFormVideoRequest {
  return LongFormVideoRequestSchema.parse(input)
}

export function validateLongFormVideoPlan(input: unknown): LongFormVideoPlan {
  return LongFormVideoPlanSchema.parse(input)
}

// ── Capability Status ─────────────────────────────────────────────────────────

export const LONG_FORM_VIDEO_STATUS = {
  orchestrationFoundationReady: true,
  schemaReady: true,
  plannerReady: true,
  durableParentReady: true,
  durablePlanReady: true,
  sceneLinkageReady: true,
  sceneSubmissionReady: true,
  sceneExecutionReady: true,
  retryResumeReady: true,
  progressTrackingReady: true,
  batchStructureReady: true,
  assemblyHandoffReady: true,
  videoOnlyAssemblyReady: true,
  sceneSplitterReady: true,
  perSceneVideoGenerationPossible: true, // Can use existing video_generation
  voiceoverReady: true,
  subtitlesReady: true,
  musicBedReady: true,
  fullMultimediaReady: false,
  liveProven: false,
  sceneStitchingReady: true,
  finalAssemblyReady: true,
  executableNow: true // Final long-form video is executable with all multimedia components
} as const

export type LongFormVideoStatus = typeof LONG_FORM_VIDEO_STATUS
