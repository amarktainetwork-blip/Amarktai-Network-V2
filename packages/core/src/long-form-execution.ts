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
  requiredCapabilities: ['video_generation', 'tts', 'music_generation', 'song_generation'],
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

export function buildSceneVideoPrompt(
  scene: LongFormScene,
  plan: LongFormVideoPlan,
): string {
  return [
    scene.prompt,
    `Style: ${plan.style}`,
    `Tone: ${plan.tone}`,
    scene.cameraDirection ? `Camera: ${scene.cameraDirection}` : null,
    `Aspect ratio: ${plan.aspectRatio}`,
    `Duration: ${scene.durationSeconds} seconds`,
    'Maintain visual continuity with adjacent scenes.',
    'Do not include text, watermarks, or logos unless explicitly requested.',
  ].filter(Boolean).join('. ')
}

// ── Create Scene Execution Payloads ────────────────────────────────────────────

export function createSceneExecutionPayloads(
  plan: LongFormVideoPlan,
): SceneExecutionPayload[] {
  return plan.scenes.map((scene) => ({
    sceneNumber: scene.sceneNumber,
    capability: 'video_generation' as const,
    prompt: buildSceneVideoPrompt(scene, plan),
    input: {
      duration: scene.durationSeconds,
      aspectRatio: plan.aspectRatio,
      style: plan.style,
      cameraDirection: scene.cameraDirection,
    },
    metadata: {
      longFormVideo: true as const,
      longFormExecutionId: plan.id,
      planId: plan.id,
      sceneNumber: scene.sceneNumber,
      sceneTitle: scene.title,
      sceneDurationSeconds: scene.durationSeconds,
      routingMode: plan.routingMode,
      finalAssemblyPending: true as const,
    },
    routingMode: plan.routingMode,
  }))
}

// ── State Management ───────────────────────────────────────────────────────────

export function createLongFormExecutionState(
  plan: LongFormVideoPlan,
): LongFormExecutionState {
  const now = new Date().toISOString()
  return {
    executionId: plan.id,
    planId: plan.id,
    routingMode: plan.routingMode,
    totalScenes: plan.scenes.length,
    scenes: plan.scenes.map((scene) => ({
      sceneNumber: scene.sceneNumber,
      sceneTitle: scene.title,
      status: 'queued',
    })),
    progress: 0,
    finalAssemblyReady: false,
    finalAssemblyCompleted: false,
    missingDependencies: ['scene_artifacts'],
    createdAt: now,
    updatedAt: now,
  }
}

export function updateSceneExecutionState(
  state: LongFormExecutionState,
  sceneNumber: number,
  update: Partial<SceneExecutionState>,
): LongFormExecutionState {
  const scenes = state.scenes.map((scene) =>
    scene.sceneNumber === sceneNumber ? { ...scene, ...update } : scene,
  )
  const completed = scenes.filter((scene) => scene.status === 'completed').length
  const failed = scenes.filter((scene) => scene.status === 'failed').length
  const finalAssemblyReady = completed === state.totalScenes && failed === 0
  const missingDependencies = finalAssemblyReady ? [] : ['scene_artifacts']
  return {
    ...state,
    scenes,
    progress: Math.round((completed / state.totalScenes) * 90),
    finalAssemblyReady,
    missingDependencies,
    updatedAt: new Date().toISOString(),
  }
}

export function calculateLongFormProgress(state: LongFormExecutionState): number {
  if (state.finalAssemblyCompleted) return 100
  const completed = state.scenes.filter((scene) => scene.status === 'completed').length
  return Math.round((completed / state.totalScenes) * 90)
}

export function getExecutionSummary(state: LongFormExecutionState): {
  total: number
  queued: number
  processing: number
  completed: number
  failed: number
  progress: number
} {
  return {
    total: state.totalScenes,
    queued: state.scenes.filter((scene) => scene.status === 'queued').length,
    processing: state.scenes.filter((scene) => scene.status === 'processing').length,
    completed: state.scenes.filter((scene) => scene.status === 'completed').length,
    failed: state.scenes.filter((scene) => scene.status === 'failed').length,
    progress: state.progress,
  }
}
