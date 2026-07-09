import { randomUUID } from 'node:crypto'
import type {
  LongFormVideoPlan,
  LongFormScene,
  LongFormVideoRequest,
} from './long-form-video.js'

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
  planId: string
  routingMode: string
  totalScenes: number
  scenes: SceneExecutionState[]
  progress: number
  finalAssemblyReady: false
  missingDependencies: string[]
  createdAt: string
  updatedAt: string
}

// ── Build Scene Video Prompt ───────────────────────────────────────────────────

export function buildSceneVideoPrompt(
  scene: LongFormScene,
  plan: LongFormVideoPlan
): string {
  const parts: string[] = []

  // Style and tone prefix
  parts.push(`${plan.style} style, ${plan.tone} tone`)

  // Scene title and description
  parts.push(scene.title)
  parts.push(scene.description)

  // Visual prompt
  parts.push(scene.visualPrompt)

  // Camera direction
  if (scene.cameraDirection) {
    parts.push(`camera: ${scene.cameraDirection}`)
  }

  // Transition hints
  if (scene.transitionIn && scene.transitionIn !== 'cut') {
    parts.push(`begins with ${scene.transitionIn.replace('_', ' ')}`)
  }
  if (scene.transitionOut && scene.transitionOut !== 'cut') {
    parts.push(`ends with ${scene.transitionOut.replace('_', ' ')}`)
  }

  // Quality enhancement
  parts.push('high quality, cinematic, professional')

  return parts.join(', ')
}

// ── Create Scene Execution Payloads ────────────────────────────────────────────

export function createSceneExecutionPayloads(
  plan: LongFormVideoPlan,
  routingMode: string = 'balanced'
): SceneExecutionPayload[] {
  const executionId = randomUUID()

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
    missingDependencies: [
      'ffmpeg/stitching',
      'final_assembly_pipeline',
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
  updatedScenes[sceneIndex] = {
    ...updatedScenes[sceneIndex],
    ...update,
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
    failed: 1, // Count failed as "done" for progress
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
