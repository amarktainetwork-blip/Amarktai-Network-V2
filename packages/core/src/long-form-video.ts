import { z } from 'zod'
import { VALID_ROUTING_MODES, ROUTING_MODE_ALIASES } from './jobs.js'

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

// ── Planning Mode ─────────────────────────────────────────────────────────────

export const PlanningMode = z.enum(['automatic', 'explicit'])
export type PlanningMode = z.infer<typeof PlanningMode>

// ── Voice Profile ─────────────────────────────────────────────────────────────

export const VoiceProfileSchema = z.object({
  voice: z.string().optional(),
  language: z.string().optional(),
  accent: z.string().optional(),
  tone: z.string().optional(),
  speed: z.number().min(0.5).max(2).optional(),
  outputFormat: z.enum(['wav', 'mp3', 'ogg']).optional(),
})
export type VoiceProfile = z.infer<typeof VoiceProfileSchema>

// ── Overlay Schema ────────────────────────────────────────────────────────────

export const LongFormOverlaySchema = z.object({
  id: z.string(),
  sceneNumber: z.number().int().min(1),
  startSeconds: z.number().min(0),
  endSeconds: z.number().min(0),
  type: z.enum(['brand', 'text', 'cta', 'legal', 'subtitle', 'price', 'url', 'benefit']),
  text: z.string().min(1).max(500),
  position: z.enum(['top_left', 'top_right', 'top_center', 'bottom_left', 'bottom_right', 'bottom_center', 'center']).default('bottom_center'),
  emphasis: z.enum(['normal', 'bold', 'highlight']).default('normal'),
  legal: z.boolean().default(false),
  styleRole: z.string().optional(),
})
export type LongFormOverlay = z.infer<typeof LongFormOverlaySchema>

// ── Structured Scene Schema ───────────────────────────────────────────────────

export const StructuredSceneSchema = z.object({
  sceneNumber: z.number().int().min(1),
  durationSeconds: z.number().min(1).max(120),
  title: z.string().min(1).max(200),
  objective: z.string().min(1).max(500),
  visualPrompt: z.string().min(10).max(5000),
  negativePrompt: z.string().max(2000).optional(),
  cameraDirection: z.string().max(500).optional(),
  continuityNotes: z.string().max(1000).optional(),
  voiceoverText: z.string().max(5000).optional(),
  subtitleText: z.string().max(1000).optional(),
  overlays: z.array(LongFormOverlaySchema).optional(),
})
export type StructuredScene = z.infer<typeof StructuredSceneSchema>

// ── Request Schema ────────────────────────────────────────────────────────────

const CanonicalRoutingMode = z.enum(VALID_ROUTING_MODES)
const RoutingModeWithAliases = z.string().transform((val) => {
  const lower = val.trim().toLowerCase()
  if ((VALID_ROUTING_MODES as readonly string[]).includes(lower)) return lower
  if (lower in ROUTING_MODE_ALIASES) return ROUTING_MODE_ALIASES[lower]
  return 'balanced'
}).pipe(CanonicalRoutingMode)

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
  routingMode: RoutingModeWithAliases.default('balanced'),
  brandContext: z.string().optional(),
  safetyLevel: LongFormVideoSafetyLevel.default('standard'),
  // Structured creative contract fields
  planningMode: PlanningMode.default('automatic'),
  campaignTitle: z.string().max(200).optional(),
  brandName: z.string().max(200).optional(),
  brandWebsite: z.string().max(500).optional(),
  objective: z.string().max(1000).optional(),
  callToAction: z.string().max(500).optional(),
  legalQualifier: z.string().max(1000).optional(),
  voiceoverScript: z.string().max(10000).optional(),
  voiceProfile: VoiceProfileSchema.optional(),
  musicBrief: z.string().max(2000).optional(),
  overlays: z.array(LongFormOverlaySchema).optional(),
  scenes: z.array(StructuredSceneSchema).optional(),
})

export type LongFormVideoRequest = z.infer<typeof LongFormVideoRequestSchema>

// ── Scene Schema ──────────────────────────────────────────────────────────────

export const LongFormSceneSchema = z.object({
  sceneNumber: z.number().int().min(1),
  title: z.string(),
  description: z.string(),
  objective: z.string().optional(),
  visualPrompt: z.string(),
  negativePrompt: z.string().optional(),
  cameraDirection: z.string().optional(),
  continuityNotes: z.string().optional(),
  durationSeconds: z.number().min(1),
  transitionIn: z.string().optional(),
  transitionOut: z.string().optional(),
  voiceoverText: z.string().optional(),
  subtitleText: z.string().optional(),
  musicCue: z.string().optional(),
  overlays: z.array(LongFormOverlaySchema).optional(),
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
  versionHash: z.string(),
  prompt: z.string(),
  totalDurationSeconds: z.number(),
  aspectRatio: LongFormVideoAspectRatio,
  style: LongFormVideoStyle,
  tone: LongFormVideoTone,
  planningMode: PlanningMode,
  routingMode: CanonicalRoutingMode,
  // Structured creative contract
  campaignTitle: z.string().optional(),
  brandName: z.string().optional(),
  brandWebsite: z.string().optional(),
  objective: z.string().optional(),
  audience: z.string().optional(),
  callToAction: z.string().optional(),
  legalQualifier: z.string().optional(),
  musicBrief: z.string().optional(),
  voiceProfile: VoiceProfileSchema.optional(),
  globalOverlays: z.array(LongFormOverlaySchema).optional(),
  storyboard: LongFormStoryboardSchema,
  renderSteps: z.array(LongFormRenderStepSchema),
  artifactPlan: LongFormVideoArtifactPlanSchema,
  missingDependencies: z.array(z.string()),
  executableNow: z.boolean(),
  perSceneVideoGenerationPossible: z.boolean(),
  finalAssemblyReady: z.boolean(),
  reasonIfBlocked: z.string().optional(),
  providerCallsStarted: z.boolean(),
})

export type LongFormVideoPlan = z.infer<typeof LongFormVideoPlanSchema>

// ── Validation Helpers ────────────────────────────────────────────────────────

export function validateLongFormVideoRequest(input: unknown): LongFormVideoRequest {
  return LongFormVideoRequestSchema.parse(input)
}

export function validateLongFormVideoPlan(input: unknown): LongFormVideoPlan {
  return LongFormVideoPlanSchema.parse(input)
}
