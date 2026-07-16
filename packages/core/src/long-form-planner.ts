import { randomUUID, createHash } from 'node:crypto'
import {
  LongFormVideoRequest,
  LongFormVideoPlan,
  LongFormScene,
  LongFormRenderStep,
  LongFormVideoArtifactPlan,
  LongFormOverlay,
  StructuredScene,
} from './long-form-video.js'

// ── Long-Form Video Planner ───────────────────────────────────────────────────

/**
 * Creates a deterministic long-form video plan from a request.
 *
 * Supports two planning modes:
 * - explicit: preserves submitted scenes exactly
 * - automatic: generates structured storyboard from brief
 *
 * Does NOT execute video generation, TTS, music or assembly.
 * Does NOT start any provider calls.
 */
export function createLongFormVideoPlan(request: LongFormVideoRequest): LongFormVideoPlan {
  validatePlanRequest(request)

  const planningMode = request.planningMode ?? 'automatic'

  if (planningMode === 'explicit' && request.scenes && request.scenes.length > 0) {
    return createExplicitPlan(request)
  }

  return createAutomaticPlan(request)
}

// ── Plan Version Hash ─────────────────────────────────────────────────────────

function computePlanHash(plan: Omit<LongFormVideoPlan, 'versionHash'>): string {
  const hashInput = JSON.stringify({
    prompt: plan.prompt,
    totalDurationSeconds: plan.totalDurationSeconds,
    scenes: plan.storyboard.scenes.map((s) => ({
      sceneNumber: s.sceneNumber,
      title: s.title,
      visualPrompt: s.visualPrompt,
      voiceoverText: s.voiceoverText,
      subtitleText: s.subtitleText,
      durationSeconds: s.durationSeconds,
    })),
    callToAction: plan.callToAction,
    legalQualifier: plan.legalQualifier,
    routingMode: plan.routingMode,
  })
  return createHash('sha256').update(hashInput).digest('hex').slice(0, 16)
}

// ── Validation ────────────────────────────────────────────────────────────────

function validatePlanRequest(request: LongFormVideoRequest): void {
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
}

function validateExplicitScenes(scenes: StructuredScene[], targetDuration: number): void {
  if (scenes.length === 0) {
    throw new Error('Explicit planning mode requires at least one scene')
  }

  // Check unique sequential scene numbers
  const numbers = scenes.map((s) => s.sceneNumber)
  const expected = scenes.map((_, i) => i + 1)
  if (JSON.stringify(numbers) !== JSON.stringify(expected)) {
    throw new Error('Scene numbers must be unique and sequential starting from 1')
  }

  // Check total duration matches
  const totalDuration = scenes.reduce((sum, s) => sum + s.durationSeconds, 0)
  if (totalDuration !== targetDuration) {
    throw new Error(`Scene durations total ${totalDuration} but target is ${targetDuration}`)
  }

  // Check unique objectives
  const objectives = scenes.map((s) => s.objective.toLowerCase().trim())
  const uniqueObjectives = new Set(objectives)
  if (uniqueObjectives.size !== objectives.length) {
    throw new Error('Each scene must have a unique objective')
  }

  // Check no empty visual prompts
  for (const scene of scenes) {
    if (!scene.visualPrompt.trim()) {
      throw new Error(`Scene ${scene.sceneNumber} has an empty visual prompt`)
    }
  }

  // Check no scene prompt contains another scene's full brief
  for (let i = 0; i < scenes.length; i++) {
    for (let j = 0; j < scenes.length; j++) {
      if (i === j) continue
      const sceneI = scenes[i]
      const sceneJ = scenes[j]
      if (!sceneI || !sceneJ) continue
      const otherBrief = sceneJ.visualPrompt.trim()
      if (otherBrief.length > 50 && sceneI.visualPrompt.includes(otherBrief)) {
        throw new Error(`Scene ${sceneI.sceneNumber} visual prompt contains Scene ${sceneJ.sceneNumber}'s full brief`)
      }
    }
  }

  // Check overlays reference valid scenes and fit durations
  for (const scene of scenes) {
    if (!scene.overlays) continue
    for (const overlay of scene.overlays) {
      if (overlay.sceneNumber !== scene.sceneNumber) {
        throw new Error(`Overlay ${overlay.id} references scene ${overlay.sceneNumber} but is defined in scene ${scene.sceneNumber}`)
      }
      if (overlay.endSeconds > scene.durationSeconds) {
        throw new Error(`Overlay ${overlay.id} end time ${overlay.endSeconds}s exceeds scene ${scene.sceneNumber} duration ${scene.durationSeconds}s`)
      }
    }
  }

  // Validate voiceover word count fits duration (120-180 WPM reasonable range)
  for (const scene of scenes) {
    if (!scene.voiceoverText?.trim()) continue
    const wordCount = scene.voiceoverText.trim().split(/\s+/).length
    const maxWPM = 200
    const minDuration = (wordCount / maxWPM) * 60
    if (scene.durationSeconds < minDuration * 0.7) {
      throw new Error(`Scene ${scene.sceneNumber} voiceover has ${wordCount} words but duration ${scene.durationSeconds}s is too short (minimum ~${Math.ceil(minDuration)}s)`)
    }
  }
}

// ── Explicit Planning Mode ────────────────────────────────────────────────────

function createExplicitPlan(request: LongFormVideoRequest): LongFormVideoPlan {
  const scenes = request.scenes!
  validateExplicitScenes(scenes, request.targetDurationSeconds)

  const planScenes: LongFormScene[] = scenes.map((scene) => ({
    sceneNumber: scene.sceneNumber,
    title: scene.title,
    description: scene.objective,
    objective: scene.objective,
    visualPrompt: scene.visualPrompt.trim(),
    negativePrompt: scene.negativePrompt?.trim(),
    cameraDirection: scene.cameraDirection?.trim(),
    continuityNotes: scene.continuityNotes?.trim(),
    durationSeconds: scene.durationSeconds,
    transitionIn: scene.sceneNumber === 1 ? 'fade_in' : 'cut',
    transitionOut: scene.sceneNumber === scenes.length ? 'fade_out' : 'cut',
    voiceoverText: scene.voiceoverText?.trim(),
    subtitleText: scene.subtitleText?.trim(),
    overlays: scene.overlays,
    status: 'planned' as const,
  }))

  const planId = randomUUID()
  const basePlan = {
    id: planId,
    prompt: request.prompt,
    totalDurationSeconds: request.targetDurationSeconds,
    aspectRatio: request.aspectRatio,
    style: request.style,
    tone: request.tone,
    planningMode: 'explicit' as const,
    routingMode: request.routingMode,
    campaignTitle: request.campaignTitle,
    brandName: request.brandName,
    brandWebsite: request.brandWebsite,
    objective: request.objective,
    audience: request.audience,
    callToAction: request.callToAction,
    legalQualifier: request.legalQualifier,
    musicBrief: request.musicBrief,
    voiceProfile: request.voiceProfile,
    globalOverlays: request.overlays,
    storyboard: {
      scenes: planScenes,
      totalDurationSeconds: request.targetDurationSeconds,
      narrativeFlow: `${request.style} ${request.tone} narrative for ${request.brandName ?? 'brand'}`,
    },
    renderSteps: createRenderSteps(request),
    artifactPlan: createArtifactPlan(request, planScenes),
    missingDependencies: identifyMissingDependencies(request),
    executableNow: false,
    perSceneVideoGenerationPossible: true,
    finalAssemblyReady: false,
    reasonIfBlocked: 'Plan requires approval before execution.',
    providerCallsStarted: false,
  }

  return {
    ...basePlan,
    versionHash: computePlanHash(basePlan),
  }
}

// ── Automatic Planning Mode ───────────────────────────────────────────────────

function createAutomaticPlan(request: LongFormVideoRequest): LongFormVideoPlan {
  const scenes = distributeAutomaticScenes(request)

  const planId = randomUUID()
  const basePlan = {
    id: planId,
    prompt: request.prompt,
    totalDurationSeconds: request.targetDurationSeconds,
    aspectRatio: request.aspectRatio,
    style: request.style,
    tone: request.tone,
    planningMode: 'automatic' as const,
    routingMode: request.routingMode,
    campaignTitle: request.campaignTitle,
    brandName: request.brandName,
    brandWebsite: request.brandWebsite,
    objective: request.objective,
    audience: request.audience,
    callToAction: request.callToAction,
    legalQualifier: request.legalQualifier,
    musicBrief: request.musicBrief,
    voiceProfile: request.voiceProfile,
    globalOverlays: request.overlays,
    storyboard: {
      scenes,
      totalDurationSeconds: request.targetDurationSeconds,
      narrativeFlow: buildNarrativeFlow(request),
    },
    renderSteps: createRenderSteps(request),
    artifactPlan: createArtifactPlan(request, scenes),
    missingDependencies: identifyMissingDependencies(request),
    executableNow: false,
    perSceneVideoGenerationPossible: true,
    finalAssemblyReady: false,
    reasonIfBlocked: 'Plan requires approval before execution.',
    providerCallsStarted: false,
  }

  return {
    ...basePlan,
    versionHash: computePlanHash(basePlan),
  }
}

function distributeAutomaticScenes(request: LongFormVideoRequest): LongFormScene[] {
  const count = request.sceneCount
  const totalDuration = request.targetDurationSeconds
  const baseDuration = Math.floor(totalDuration / count)
  const remainder = totalDuration - (baseDuration * count)

  const scenes: LongFormScene[] = []
  for (let i = 0; i < count; i++) {
    const sceneNumber = i + 1
    const durationSeconds = baseDuration + (i < remainder ? 1 : 0)
    const isFirst = i === 0
    const isLast = i === count - 1

    scenes.push({
      sceneNumber,
      title: generateSceneTitle(sceneNumber, count, request),
      description: generateSceneDescription(sceneNumber, count, request),
      objective: generateSceneObjective(sceneNumber, count, request),
      visualPrompt: generateVisualPrompt(sceneNumber, count, request),
      negativePrompt: generateNegativePrompt(request),
      cameraDirection: generateCameraDirection(sceneNumber, isFirst, isLast),
      continuityNotes: generateContinuityNotes(sceneNumber, count),
      durationSeconds,
      transitionIn: isFirst ? 'fade_in' : 'cut',
      transitionOut: isLast ? 'fade_out' : 'cut',
      voiceoverText: request.voiceoverEnabled ? generateVoiceoverSegment(sceneNumber, count, request) : undefined,
      subtitleText: request.subtitlesEnabled ? generateSubtitleSegment(sceneNumber, count, request) : undefined,
      overlays: generateSceneOverlays(sceneNumber, request),
      status: 'planned' as const,
    })
  }

  return scenes
}

function generateSceneTitle(sceneNumber: number, totalScenes: number, request: LongFormVideoRequest): string {
  const brand = request.brandName ?? 'Brand'
  if (sceneNumber === 1) return `Opening — ${brand}`
  if (sceneNumber === totalScenes) return `Closing — ${brand}`
  const midTitles = ['Development', 'Core Message', 'Deep Dive', 'Evidence', 'Testimonial', 'Features']
  return midTitles[(sceneNumber - 2) % midTitles.length] ?? `Scene ${sceneNumber}`
}

function generateSceneDescription(sceneNumber: number, totalScenes: number, request: LongFormVideoRequest): string {
  const brand = request.brandName ?? 'the brand'
  if (sceneNumber === 1) return `Introduce ${brand} and establish the audience's connection with the message.`
  if (sceneNumber === totalScenes) return `Deliver the call to action and leave a memorable impression.`
  return `Develop the core message for ${brand}, building engagement and credibility.`
}

function generateSceneObjective(sceneNumber: number, totalScenes: number, request: LongFormVideoRequest): string {
  if (sceneNumber === 1) return `Hook the viewer and introduce ${request.brandName ?? 'the brand'}`
  if (sceneNumber === totalScenes) return `Deliver CTA and drive conversion`
  return `Build engagement and communicate key benefit ${sceneNumber - 1}`
}

function generateVisualPrompt(sceneNumber: number, totalScenes: number, request: LongFormVideoRequest): string {
  const style = request.style
  const tone = request.tone
  const brand = request.brandName ?? 'professional brand'
  const audience = request.audience ?? 'target audience'

  if (sceneNumber === 1) {
    return `Premium ${style} ${tone} advertisement opening. Show ${audience} in a relatable, authentic environment. Establish emotional connection and introduce ${brand} naturally. Clean professional lighting, realistic faces and hands, cinematic camera movement, text-free video frame.`
  }
  if (sceneNumber === totalScenes) {
    return `Premium ${style} ${tone} advertisement closing. Show the credible outcome and positive transformation. Clean composition with generous negative space for end card overlay. Professional cinematography, text-free generated footage.`
  }
  return `Premium ${style} ${tone} advertisement scene ${sceneNumber}. Develop the ${brand} message with authentic detail and professional production quality. Show real engagement and progress. Dynamic camera work, realistic environments, text-free video frame.`
}

function generateNegativePrompt(_request: LongFormVideoRequest): string {
  return 'No generated words, no logos, no distorted hands, no duplicate people, no exaggerated expressions, no science-fiction elements, no watermark, no text in frame'
}

function generateCameraDirection(sceneNumber: number, isFirst: boolean, isLast: boolean): string {
  if (isFirst) return 'Wide establishing shot moving to medium close-up'
  if (isLast) return 'Composed medium shot finishing on stable end-card background'
  const directions = [
    'Tracking medium shot with smooth movement',
    'Over-the-shoulder to close-up transition',
    'Dynamic medium shot with parallax',
    'Slow push-in to character focus',
  ]
  return directions[(sceneNumber - 2) % directions.length] ?? 'Professional medium shot'
}

function generateContinuityNotes(sceneNumber: number, totalScenes: number): string {
  if (sceneNumber === 1) return 'Establish lead character and environment. Maintain consistent wardrobe and identity throughout.'
  if (sceneNumber === totalScenes) return 'Same lead character with consistent appearance. Clean negative space for end card.'
  return `Same lead character from scene 1. Consistent wardrobe, environment continuity.`
}

function generateVoiceoverSegment(sceneNumber: number, totalScenes: number, request: LongFormVideoRequest): string {
  // Split the voiceover script across scenes, or generate from brief
  if (request.voiceoverScript) {
    return splitScriptAcrossScenes(request.voiceoverScript, sceneNumber, totalScenes)
  }

  const brand = request.brandName ?? 'our programme'
  const cta = request.callToAction ?? 'Visit our website to learn more'

  if (sceneNumber === 1) {
    return `Ready for a new challenge? ${brand} is built for people like you.`
  }
  if (sceneNumber === totalScenes) {
    return `${cta}`
  }
  return `With ${brand}, you get the training and support you need to succeed.`
}

function splitScriptAcrossScenes(script: string, sceneNumber: number, totalScenes: number): string {
  const sentences = script.split(/(?<=[.!?])\s+/).filter(Boolean)
  const perScene = Math.ceil(sentences.length / totalScenes)
  const start = (sceneNumber - 1) * perScene
  const end = Math.min(start + perScene, sentences.length)
  return sentences.slice(start, end).join(' ').trim()
}

function generateSubtitleSegment(sceneNumber: number, totalScenes: number, request: LongFormVideoRequest): string {
  // Subtitles match voiceover text exactly
  return generateVoiceoverSegment(sceneNumber, totalScenes, request)
}

function generateSceneOverlays(sceneNumber: number, request: LongFormVideoRequest): LongFormOverlay[] {
  const overlays: LongFormOverlay[] = []

  // Add CTA overlay on last scene
  if (request.callToAction && sceneNumber === request.sceneCount) {
    overlays.push({
      id: `overlay_cta_${sceneNumber}`,
      sceneNumber,
      startSeconds: 0,
      endSeconds: 5,
      type: 'cta',
      text: request.callToAction,
      position: 'bottom_center',
      emphasis: 'bold',
      legal: false,
    })
  }

  // Add legal qualifier overlay on last scene
  if (request.legalQualifier && sceneNumber === request.sceneCount) {
    overlays.push({
      id: `overlay_legal_${sceneNumber}`,
      sceneNumber,
      startSeconds: 0,
      endSeconds: 5,
      type: 'legal',
      text: request.legalQualifier,
      position: 'bottom_right',
      emphasis: 'normal',
      legal: true,
    })
  }

  // Add website overlay on last scene
  if (request.brandWebsite && sceneNumber === request.sceneCount) {
    overlays.push({
      id: `overlay_url_${sceneNumber}`,
      sceneNumber,
      startSeconds: 0,
      endSeconds: 5,
      type: 'url',
      text: request.brandWebsite,
      position: 'bottom_center',
      emphasis: 'bold',
      legal: false,
    })
  }

  return overlays
}

function buildNarrativeFlow(request: LongFormVideoRequest): string {
  const brand = request.brandName ?? 'the brand'
  return `${request.style} ${request.tone} narrative for ${brand}: ${request.objective ?? request.prompt.slice(0, 100)}`
}

// ── Render Steps Creation ─────────────────────────────────────────────────────

function createRenderSteps(request: LongFormVideoRequest): LongFormRenderStep[] {
  const steps: LongFormRenderStep[] = []
  let stepNumber = 1

  for (let i = 0; i < request.sceneCount; i++) {
    steps.push({
      stepNumber: stepNumber++,
      type: 'scene_generation',
      description: `Generate video for scene ${i + 1}`,
      dependencies: [],
      status: 'ready'
    })
  }

  if (request.voiceoverEnabled) {
    steps.push({
      stepNumber: stepNumber++,
      type: 'voiceover_generation',
      description: 'Generate voiceover audio per scene',
      dependencies: [],
      status: 'ready'
    })
  }

  if (request.subtitlesEnabled) {
    steps.push({
      stepNumber: stepNumber++,
      type: 'subtitle_generation',
      description: 'Generate SRT/VTT subtitle files from scene text',
      dependencies: [],
      status: 'ready'
    })
  }

  if (request.musicBedEnabled) {
    steps.push({
      stepNumber: stepNumber++,
      type: 'music_bed_generation',
      description: 'Generate instrumental music bed',
      dependencies: [],
      status: 'ready'
    })
  }

  steps.push({
    stepNumber: stepNumber++,
    type: 'scene_stitching',
    description: 'Stitch individual scene videos together',
    dependencies: ['scene_generation'],
    status: 'blocked',
    blockedReason: 'Requires approval and scene generation'
  })

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
    blockedReason: 'Requires approval and all component generation'
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
    finalVideoArtifact: false,
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

// ── Missing Dependencies ──────────────────────────────────────────────────────

function identifyMissingDependencies(_request: LongFormVideoRequest): string[] {
  const missing: string[] = []
  missing.push('plan_approval')
  missing.push('ffmpeg/stitching')
  missing.push('final_assembly_pipeline')
  return missing
}

// ── Plan Validation ───────────────────────────────────────────────────────────

export function validatePlanCompleteness(plan: LongFormVideoPlan): { valid: boolean; errors: string[] } {
  const errors: string[] = []

  // Check scene count
  if (plan.storyboard.scenes.length < 2) {
    errors.push('Plan must have at least 2 scenes')
  }

  // Check duration total
  const sceneDurationTotal = plan.storyboard.scenes.reduce((sum, s) => sum + s.durationSeconds, 0)
  if (sceneDurationTotal !== plan.totalDurationSeconds) {
    errors.push(`Scene durations total ${sceneDurationTotal} but plan total is ${plan.totalDurationSeconds}`)
  }

  // Check unique scene objectives
  const objectives = plan.storyboard.scenes.map((s) => (s.objective ?? s.description).toLowerCase().trim())
  const uniqueObjectives = new Set(objectives)
  if (uniqueObjectives.size !== objectives.length) {
    errors.push('Duplicate scene objectives detected')
  }

  // Check for duplicate visual prompts
  const prompts = plan.storyboard.scenes.map((s) => s.visualPrompt.toLowerCase().trim().slice(0, 100))
  const uniquePrompts = new Set(prompts)
  if (uniquePrompts.size !== prompts.length) {
    errors.push('Duplicate or near-duplicate scene visual prompts detected')
  }

  // Check no scene prompt contains full parent prompt
  for (const scene of plan.storyboard.scenes) {
    if (scene.visualPrompt.includes(plan.prompt) && plan.prompt.length > 50) {
      errors.push(`Scene ${scene.sceneNumber} visual prompt contains the full parent prompt`)
    }
  }

  // Check CTA preserved (brand/website from CTA must appear somewhere)
  if (plan.callToAction) {
    const ctaLower = plan.callToAction.toLowerCase()
    const brandLower = (plan.brandName ?? '').toLowerCase()
    const urlLower = (plan.brandWebsite ?? '').toLowerCase()
    const hasCTA = plan.storyboard.scenes.some((s) => {
      const vo = (s.voiceoverText ?? '').toLowerCase()
      const overlays = (s.overlays ?? []).map((o) => o.text.toLowerCase())
      return vo.includes(ctaLower) || overlays.some((o) => o.includes(ctaLower))
        || (brandLower && (vo.includes(brandLower) || overlays.some((o) => o.includes(brandLower))))
        || (urlLower && (vo.includes(urlLower) || overlays.some((o) => o.includes(urlLower))))
    })
    if (!hasCTA) {
      errors.push('Call to action not preserved in any scene')
    }
  }

  // Check legal qualifier preserved (check each sentence or major phrase)
  if (plan.legalQualifier) {
    const legalLower = plan.legalQualifier.toLowerCase()
    const legalSentences = legalLower.split(/[.!?]+/).map((s) => s.trim()).filter(Boolean)
    const allOverlays = plan.storyboard.scenes.flatMap((s) => s.overlays ?? [])
    const allOverlayText = allOverlays.map((o) => o.text.toLowerCase()).join(' ')
    const allVoiceover = plan.storyboard.scenes.map((s) => (s.voiceoverText ?? '').toLowerCase()).join(' ')
    const allText = allOverlayText + ' ' + allVoiceover
    const hasLegal = legalSentences.length > 0
      ? legalSentences.every((sentence) => sentence.length > 5 && allText.includes(sentence))
      : allText.includes(legalLower)
    if (!hasLegal) {
      errors.push('Legal qualifier not preserved in overlays')
    }
  }

  // Check URL preservation
  if (plan.brandWebsite) {
    const urlLower = plan.brandWebsite.toLowerCase()
    const hasUrl = plan.storyboard.scenes.some((s) =>
      s.overlays?.some((o) => o.text.toLowerCase().includes(urlLower)) ||
      s.voiceoverText?.toLowerCase().includes(urlLower)
    )
    if (!hasUrl) {
      errors.push('Brand website URL not preserved')
    }
  }

  return { valid: errors.length === 0, errors }
}
