import { randomUUID } from 'node:crypto'
import type { CapabilityKey } from './capabilities.js'
import type {
  LongFormVideoPlan,
  LongFormScene,
} from './long-form-video.js'

/** Canonical durable workflow evidence; this is not a provider executor. */
export const DURABLE_WORKFLOW_REGISTRATIONS = [{
  id: 'long-form-video.durable-orchestration',
  capability: 'long_form_video',
  handlerName: 'createLongFormExecutionState',
  persistence: 'prisma_job_parent_child_state',
  assembly: 'bullmq_exactly_once_handoff',
  requiredCapabilities: ['video_generation', 'tts', 'music_generation'],
}] as const satisfies ReadonlyArray<{
  id: string
  capability: 'long_form_video'
  handlerName: string
  persistence: string
  assembly: string
  requiredCapabilities: readonly CapabilityKey[]
}>

// ── Scene Execution Payload ────────────────────────────────────────────────────

export interface SceneExecutionPayload {
  sceneNumber: number
  capability: 'video_generation'
  prompt: string
  input: {
    duration: number
    aspectRatio: string
    style: string
    cameraDirection?: string
  }
  metadata: {
    longFormVideo: true
    longFormExecutionId: string
    planId: string
    sceneNumber: number
    sceneTitle: string
    sceneDurationSeconds: number
    routingMode: string
    finalAssemblyPending: true
  }
  routingMode: string
}

// ── Execution State ────────────────────────────────────────────────────────────

export interface SceneExecutionState {
  sceneNumber: number
  sceneTitle: string
  status: 'queued' | 'processing' | 'completed' | 'failed'
  jobId?: string
  artifactId?: string
  provider?: string
  model?: string
  error?: string
  startedAt?: string
  completedAt?: string
}

export interface LongFormExecutionState {
  executionId: string
  parentJobId?: string
  planId: string
  routingMode: string
  totalScenes: number
  scenes: SceneExecutionState[]
  progress: number
  finalAssemblyReady: boolean
  finalAssemblyCompleted: boolean
  finalArtifactId?: string
  finalArtifactUrl?: string
  finalAssemblyCompletedAt?: string
  finalAssemblyMode?: 'video_only'
  assemblyHandoff?: LongFormAssemblyHandoff
  missingDependencies: string[]
  createdAt: string
  updatedAt: string
}

export interface LongFormAssemblyHandoff {
  parentJobId: string
  executionId: string
  orderedSceneArtifactIds: string[]
  expectedSceneCount: number
  expectedDurationSeconds: number
  aspectRatio: string
  outputTitle: string
  requestedVoiceover: boolean
  requestedSubtitles: boolean
  requestedMusic: boolean
  assemblyStatus: 'waiting_for_scenes' | 'ready_for_video_only' | 'blocked' | 'completed'
  missingDependencies: string[]
}

// ── Build Scene Video Prompt ───────────────────────────────────────────────────

/**
 * Builds the video-provider prompt for a single scene.
 *
 * Contains ONLY:
 * - shared visual continuity context
 * - that scene's visual prompt
 * - that scene's negative prompt
 * - that scene's camera direction
 * - limited quality/style instructions
 *
 * Does NOT contain:
 * - voiceover or narration text
 * - subtitle text
 * - music brief
 * - pricing, CTA or legal copy
 * - other scenes' prompts
 * - the full campaign brief
 */
export function buildSceneVideoPrompt(
  scene: LongFormScene,
  plan: LongFormVideoPlan
): string {
  const parts: string[] = []

  // Shared continuity context
  parts.push(`${plan.style} style, ${plan.tone} tone`)

  // Scene visual prompt (the core instruction)
  parts.push(scene.visualPrompt.trim())

  // Camera direction
  if (scene.cameraDirection) {
    parts.push(`camera: ${scene.cameraDirection}`)
  }

  // Negative prompt
  if (scene.negativePrompt) {
    parts.push(`avoid: ${scene.negativePrompt}`)
  }

  // Quality instruction
  parts.push('high quality, cinematic, professional')

  return parts.join('. ')
}

// ── Create Scene Execution Payloads ────────────────────────────────────────────

export function createSceneExecutionPayloads(
  plan: LongFormVideoPlan,
  routingMode: string = 'balanced',
  executionId: string
): SceneExecutionPayload[] {
  return plan.storyboard.scenes.map((scene) => {
    const prompt = buildSceneVideoPrompt(scene, plan)

    return {
      sceneNumber: scene.sceneNumber,
      capability: 'video_generation',
      prompt,
      input: {
        duration: scene.durationSeconds,
        aspectRatio: plan.aspectRatio,
        style: plan.style,
        cameraDirection: scene.cameraDirection,
      },
      metadata: {
        longFormVideo: true,
        longFormExecutionId: executionId,
        planId: plan.id,
        sceneNumber: scene.sceneNumber,
        sceneTitle: scene.title,
        sceneDurationSeconds: scene.durationSeconds,
        routingMode,
        finalAssemblyPending: true,
      },
      routingMode,
    }
  })
}

// ── Create Execution State ─────────────────────────────────────────────────────

export function createLongFormExecutionState(
  plan: LongFormVideoPlan,
  routingMode: string = 'balanced'
): LongFormExecutionState {
  const executionId = randomUUID()
  const now = new Date().toISOString()

  return {
    executionId,
    planId: plan.id,
    routingMode,
    totalScenes: plan.storyboard.scenes.length,
    scenes: plan.storyboard.scenes.map((scene) => ({
      sceneNumber: scene.sceneNumber,
      sceneTitle: scene.title,
      status: 'queued',
    })),
    progress: 0,
    finalAssemblyReady: false,
    finalAssemblyCompleted: false,
    missingDependencies: [
      'scene_jobs_pending',
      ...(plan.missingDependencies || []),
    ],
    createdAt: now,
    updatedAt: now,
  }
}

// ── Update Scene Execution State ───────────────────────────────────────────────

export function updateSceneExecutionState(
  state: LongFormExecutionState,
  sceneNumber: number,
  update: Partial<SceneExecutionState>
): LongFormExecutionState {
  const sceneIndex = state.scenes.findIndex((s) => s.sceneNumber === sceneNumber)
  if (sceneIndex === -1) {
    throw new Error(`Scene ${sceneNumber} not found in execution state`)
  }

  const updatedScenes = [...state.scenes]
  const existingScene = updatedScenes[sceneIndex]
  if (!existingScene) {
    throw new Error(`Scene ${sceneNumber} not found in execution state`)
  }

  updatedScenes[sceneIndex] = {
    ...existingScene,
    ...update,
    sceneNumber: update.sceneNumber ?? existingScene.sceneNumber,
    sceneTitle: update.sceneTitle ?? existingScene.sceneTitle,
    status: update.status ?? existingScene.status,
  }

  const progress = calculateLongFormProgress(updatedScenes)

  return {
    ...state,
    scenes: updatedScenes,
    progress,
    updatedAt: new Date().toISOString(),
  }
}

// ── Calculate Progress ─────────────────────────────────────────────────────────

export function calculateLongFormProgress(
  scenes: SceneExecutionState[]
): number {
  if (scenes.length === 0) return 0

  const weights = {
    queued: 0,
    processing: 0.5,
    completed: 1,
    failed: 0,
  }

  const totalWeight = scenes.reduce((sum, scene) => {
    return sum + (weights[scene.status] || 0)
  }, 0)

  return Math.round((totalWeight / scenes.length) * 100)
}

// ── Get Execution Summary ──────────────────────────────────────────────────────

export function getExecutionSummary(state: LongFormExecutionState): {
  totalScenes: number
  completedScenes: number
  failedScenes: number
  processingScenes: number
  queuedScenes: number
  progress: number
  canAssemble: boolean
  missingForAssembly: string[]
} {
  const completedScenes = state.scenes.filter((s) => s.status === 'completed').length
  const failedScenes = state.scenes.filter((s) => s.status === 'failed').length
  const processingScenes = state.scenes.filter((s) => s.status === 'processing').length
  const queuedScenes = state.scenes.filter((s) => s.status === 'queued').length

  const canAssemble = completedScenes === state.totalScenes && state.totalScenes > 0

  return {
    totalScenes: state.totalScenes,
    completedScenes,
    failedScenes,
    processingScenes,
    queuedScenes,
    progress: state.progress,
    canAssemble,
    missingForAssembly: state.missingDependencies,
  }
}
