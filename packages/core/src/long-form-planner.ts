import { randomUUID } from 'node:crypto'
import {
  LongFormVideoRequest,
  LongFormVideoPlan,
  LongFormScene,
  LongFormRenderStep,
  LongFormVideoArtifactPlan,
} from './long-form-video.js'

// ── Long-Form Video Planner ───────────────────────────────────────────────────

/**
 * Creates a deterministic long-form video plan from a request.
 * 
 * This is Phase 1: orchestration foundation only.
 * - Splits duration across scenes
 * - Creates scene prompts
 * - Identifies render steps and dependencies
 * - Marks what is executable vs blocked
 * 
 * Does NOT execute video generation or assembly.
 */
export function createLongFormVideoPlan(request: LongFormVideoRequest): LongFormVideoPlan {
  // Validate request
  if (request.targetDurationSeconds < 30) {
    throw new Error('Target duration must be at least 30 seconds')
  }
  if (request.targetDurationSeconds > 600) {
    throw new Error('Target duration must be at most 600 seconds (10 minutes)')
  }
  if (request.sceneCount < 2) {
    throw new Error('Scene count must be at least 2')
  }
  if (request.sceneCount > 20) {
    throw new Error('Scene count must be at most 20')
  }

  // Calculate duration per scene
  const durationPerScene = request.targetDurationSeconds / request.sceneCount

  // Create scenes
  const scenes: LongFormScene[] = []
  for (let i = 0; i < request.sceneCount; i++) {
    const sceneNumber = i + 1
    const scene = createScene(
      sceneNumber,
      request,
      durationPerScene,
      i === 0, // isFirstScene
      i === request.sceneCount - 1 // isLastScene
    )
    scenes.push(scene)
  }

  // Create render steps
  const renderSteps = createRenderSteps(request)

  // Create artifact plan
  const artifactPlan = createArtifactPlan(request, scenes)

  // Identify missing dependencies
  const missingDependencies = identifyMissingDependencies(request)

  // Determine executability
  const executableNow = false // Not live-proven yet
  const perSceneVideoGenerationPossible = true // Can use existing video_generation
  const finalAssemblyReady = false // Video-only concat works; full multimedia assembly not live-proven

  // Build reason if blocked
  const reasonIfBlocked = buildBlockReason(missingDependencies)

  return {
    id: randomUUID(),
    prompt: request.prompt,
    totalDurationSeconds: request.targetDurationSeconds,
    aspectRatio: request.aspectRatio,
    style: request.style,
    tone: request.tone,
    storyboard: {
      scenes,
      totalDurationSeconds: request.targetDurationSeconds,
      narrativeFlow: generateNarrativeFlow(request)
    },
    renderSteps,
    artifactPlan,
    missingDependencies,
    executableNow,
    perSceneVideoGenerationPossible,
    finalAssemblyReady,
    reasonIfBlocked
  }
}

// ── Scene Creation ────────────────────────────────────────────────────────────

function createScene(
  sceneNumber: number,
  request: LongFormVideoRequest,
  durationSeconds: number,
  isFirstScene: boolean,
  isLastScene: boolean
): LongFormScene {
  const sceneTitle = generateSceneTitle(sceneNumber, request.sceneCount)
  const sceneDescription = generateSceneDescription(sceneNumber, request.prompt, request.style)
  const visualPrompt = generateVisualPrompt(sceneNumber, request.prompt, request.style, request.tone)
  const cameraDirection = generateCameraDirection(sceneNumber, isFirstScene, isLastScene)
  const transitionIn = isFirstScene ? 'fade_in' : 'cut'
  const transitionOut = isLastScene ? 'fade_out' : 'cut'

  const scene: LongFormScene = {
    sceneNumber,
    title: sceneTitle,
    description: sceneDescription,
    visualPrompt,
    cameraDirection,
    durationSeconds,
    transitionIn,
    transitionOut,
    status: 'planned'
  }

  // Add voiceover if enabled
  if (request.voiceoverEnabled) {
    scene.voiceoverText = generateVoiceoverText(sceneNumber, request.prompt, request.tone)
  }

  // Add subtitles if enabled
  if (request.subtitlesEnabled) {
    scene.subtitleText = generateSubtitleText(sceneNumber, request.prompt)
  }

  // Add music cue if enabled
  if (request.musicBedEnabled) {
    scene.musicCue = generateMusicCue(sceneNumber, request.tone)
  }

  return scene
}

function generateSceneTitle(sceneNumber: number, totalScenes: number): string {
  const titles = [
    'Introduction',
    'Opening',
    'Setup',
    'Development',
    'Rising Action',
    'Climax',
    'Falling Action',
    'Resolution',
    'Conclusion',
    'Closing'
  ]
  
  if (sceneNumber === 1) return 'Introduction'
  if (sceneNumber === totalScenes) return 'Conclusion'
  
  const middleIndex = Math.floor((sceneNumber - 1) / (totalScenes - 2) * (titles.length - 2)) + 2
  return titles[Math.min(middleIndex, titles.length - 1)] || `Scene ${sceneNumber}`
}

function generateSceneDescription(sceneNumber: number, prompt: string, style: string): string {
  return `Scene ${sceneNumber} of ${style} style video: ${prompt.substring(0, 100)}...`
}

function generateVisualPrompt(sceneNumber: number, prompt: string, style: string, tone: string): string {
  return `${style} style, ${tone} tone, ${prompt} - Scene ${sceneNumber} visual`
}

function generateCameraDirection(sceneNumber: number, isFirstScene: boolean, isLastScene: boolean): string {
  if (isFirstScene) return 'wide_shot_establishing'
  if (isLastScene) return 'wide_shot_closing'
  
  const directions = ['medium_shot', 'close_up', 'wide_shot', 'tracking_shot', 'static_shot']
  return directions[sceneNumber % directions.length] ?? 'static_shot'
}

function generateVoiceoverText(sceneNumber: number, prompt: string, tone: string): string {
  return `${tone} narration for scene ${sceneNumber}: ${prompt}`
}

function generateSubtitleText(sceneNumber: number, prompt: string): string {
  return `Scene ${sceneNumber}: ${prompt.substring(0, 50)}`
}

function generateMusicCue(_sceneNumber: number, tone: string): string {
  const cues = {
    professional: 'corporate_ambient',
    casual: 'light_acoustic',
    dramatic: 'orchestral_build',
    upbeat: 'energetic_pop',
    inspirational: 'uplifting_strings',
    informative: 'neutral_background'
  }
  return cues[tone as keyof typeof cues] || 'neutral_background'
}

function generateNarrativeFlow(request: LongFormVideoRequest): string {
  return `${request.style} style ${request.tone} narrative: ${request.prompt}`
}

// ── Render Steps Creation ─────────────────────────────────────────────────────

function createRenderSteps(request: LongFormVideoRequest): LongFormRenderStep[] {
  const steps: LongFormRenderStep[] = []
  let stepNumber = 1

  // Step 1: Scene generation (per scene)
  for (let i = 0; i < request.sceneCount; i++) {
    steps.push({
      stepNumber: stepNumber++,
      type: 'scene_generation',
      description: `Generate video for scene ${i + 1}`,
      dependencies: [],
      status: 'ready' // Can use existing video_generation
    })
  }

  // Step 2: Voiceover generation (if enabled)
  if (request.voiceoverEnabled) {
    steps.push({
      stepNumber: stepNumber++,
      type: 'voiceover_generation',
      description: 'Generate voiceover audio per scene via Groq TTS',
      dependencies: [],
      status: 'ready'
    })
  }

  // Step 3: Subtitle generation (if enabled)
  if (request.subtitlesEnabled) {
    steps.push({
      stepNumber: stepNumber++,
      type: 'subtitle_generation',
      description: 'Generate SRT/VTT subtitle files from scene text',
      dependencies: [],
      status: 'ready'
    })
  }

  // Step 4: Music bed generation (if enabled)
  if (request.musicBedEnabled) {
    steps.push({
      stepNumber: stepNumber++,
      type: 'music_bed_generation',
      description: 'Generate instrumental music bed via GenX Lyria',
      dependencies: [],
      status: 'ready'
    })
  }

  // Step 5: Scene stitching
  steps.push({
    stepNumber: stepNumber++,
    type: 'scene_stitching',
    description: 'Stitch individual scene videos together',
    dependencies: ['scene_generation'],
    status: 'blocked',
    blockedReason: 'ffmpeg/stitching not wired yet'
  })

  // Step 6: Final assembly
  const finalDeps = ['scene_stitching']
  if (request.voiceoverEnabled) finalDeps.push('voiceover_generation')
  if (request.subtitlesEnabled) finalDeps.push('subtitle_generation')
  if (request.musicBedEnabled) finalDeps.push('music_bed_generation')

  steps.push({
    stepNumber: stepNumber++,
    type: 'final_assembly',
    description: 'Assemble final long-form video with all elements',
    dependencies: finalDeps,
    status: 'blocked',
    blockedReason: 'Final assembly pipeline not ready'
  })

  return steps
}

// ── Artifact Plan Creation ────────────────────────────────────────────────────

function createArtifactPlan(
  request: LongFormVideoRequest,
  scenes: LongFormScene[]
): LongFormVideoArtifactPlan {
  const sceneArtifacts = scenes.map((_, i) => `scene_${i + 1}_video`)

  const plan: LongFormVideoArtifactPlan = {
    finalVideoArtifact: false, // Not ready yet
    sceneArtifacts
  }

  if (request.voiceoverEnabled) {
    plan.voiceoverArtifacts = scenes.map((_, i) => `scene_${i + 1}_voiceover`)
  }

  if (request.subtitlesEnabled) {
    plan.subtitleArtifacts = scenes.map((_, i) => `scene_${i + 1}_subtitles`)
  }

  if (request.musicBedEnabled) {
    plan.musicBedArtifacts = ['music_bed_audio']
  }

  return plan
}

// ── Missing Dependencies Identification ───────────────────────────────────────

function identifyMissingDependencies(_request: LongFormVideoRequest): string[] {
  const missing: string[] = []

  // Scene stitching is always missing
  missing.push('ffmpeg/stitching')

  // Voiceover is wired via Groq TTS child jobs
  // No longer a missing dependency

  // Subtitles are wired via local SRT/VTT generation endpoint
  // No longer a missing dependency

  // Music bed is wired via GenX music generation endpoint
  // No longer a missing dependency

  // Final assembly is always missing
  missing.push('final_assembly_pipeline')

  return missing
}

function buildBlockReason(missingDependencies: string[]): string {
  if (missingDependencies.length === 0) return ''
  return `Long-form video missing: ${missingDependencies.join(', ')}.`
}
