export interface BudgetPlan {
  profile: string
  targetDurationSeconds: number
  qualityTier: string
  estimatedCostCents: number
  targetCostCents: number
  hardCapCents: number
  selectedStrategy: string
  plannedSteps: PlannedStep[]
  fallbackPlan: string
  downgradeOptions: string[]
  costBreakdown: CostBreakdown
  blockedReason: string | null
  requiresApproval: boolean
}

export interface PlannedStep {
  stepKey: string
  role: string
  capability: string
  provider: string
  model: string
  estimatedCostCents: number
  qualityTier: string
  notes: string
}

export interface CostBreakdown {
  scriptPlanning: number
  promptGeneration: number
  styleFrames: number
  mainVideoClips: number
  heroShots: number
  tts: number
  music: number
  captions: number
  ffmpegAssembly: number
  total: number
}

const BUDGET_PROFILES = {
  draft: {
    name: 'Draft',
    description: 'Previews, tests, timing, approval drafts',
    targetCostCents: 20,
    hardCapCents: 50,
    allowPremium: false,
    allowHero: false,
    maxResolution: '480p',
    defaultDurationSeconds: 30,
  },
  standard: {
    name: 'Standard',
    description: 'Normal customer outputs',
    targetCostCents: 100,
    hardCapCents: 120,
    allowPremium: false,
    allowHero: false,
    maxResolution: '720p',
    defaultDurationSeconds: 120,
  },
  premium: {
    name: 'Premium',
    description: 'High-quality paid outputs',
    targetCostCents: 400,
    hardCapCents: 500,
    allowPremium: true,
    allowHero: true,
    maxResolution: '1080p',
    defaultDurationSeconds: 120,
  },
  custom: {
    name: 'Custom',
    description: 'App-specific budget profile',
    targetCostCents: 200,
    hardCapCents: 300,
    allowPremium: true,
    allowHero: false,
    maxResolution: '1080p',
    defaultDurationSeconds: 120,
  },
}

// Cost estimates per second of video by tier (cents)
const VIDEO_COST_PER_SECOND: Record<string, number> = {
  draft: 0.1,
  standard: 0.5,
  premium: 2.5,
  hero: 5.0,
}

// Cost estimates per image by tier (cents)
const IMAGE_COST: Record<string, number> = {
  draft: 0,
  standard: 0.3,
  premium: 2.5,
}

// Cost estimates per 1M tokens (cents)
const TEXT_COST_PER_1M_TOKENS: Record<string, number> = {
  draft: 0.05,
  standard: 0.1,
  premium: 0.6,
}

export function planVideoBudget(input: {
  targetDurationSeconds?: number
  qualityTier?: string
  outputFormat?: string
  needsNarration?: boolean
  needsMusic?: boolean
  needsCaptions?: boolean
  heroShotCount?: number
  budgetCapCents?: number
}): BudgetPlan {
  const {
    targetDurationSeconds = 120,
    qualityTier = 'standard',
    needsNarration = false,
    needsMusic = false,
    needsCaptions = false,
    heroShotCount = 0,
    budgetCapCents,
  } = input

  const profile = BUDGET_PROFILES[qualityTier as keyof typeof BUDGET_PROFILES] || BUDGET_PROFILES.standard
  const hardCap = budgetCapCents || profile.hardCapCents

  // Calculate cost breakdown
  const scriptPlanning = Math.ceil(targetDurationSeconds * 0.01 * (TEXT_COST_PER_1M_TOKENS.standard ?? 0.1) * 100)
  const promptGeneration = Math.ceil(targetDurationSeconds * 0.005 * (TEXT_COST_PER_1M_TOKENS.standard ?? 0.1) * 100)
  const styleFrames = Math.ceil(3 * (IMAGE_COST.standard ?? 0.3))
  const mainVideoSeconds = targetDurationSeconds - (heroShotCount * 5)
  const mainVideoClips = Math.ceil(mainVideoSeconds * (VIDEO_COST_PER_SECOND.standard ?? 0.5))
  const heroShots = heroShotCount > 0 && profile.allowHero
    ? Math.ceil(heroShotCount * 5 * (VIDEO_COST_PER_SECOND.premium ?? 2.5))
    : 0
  const tts = needsNarration ? Math.ceil(targetDurationSeconds * 0.05) : 0
  const music = needsMusic ? 5 : 0
  const captions = needsCaptions ? 2 : 0
  const ffmpegAssembly = 0 // local, free

  const total = scriptPlanning + promptGeneration + styleFrames + mainVideoClips + heroShots + tts + music + captions + ffmpegAssembly

  const costBreakdown: CostBreakdown = {
    scriptPlanning,
    promptGeneration,
    styleFrames,
    mainVideoClips,
    heroShots,
    tts,
    music,
    captions,
    ffmpegAssembly,
    total,
  }

  // Check if over budget
  let blockedReason: string | null = null
  let requiresApproval = false

  if (total > hardCap) {
    // Try downgrading
    if (qualityTier === 'premium') {
      // Downgrade main clips to standard
      const downgradedMain = Math.ceil(mainVideoSeconds * (VIDEO_COST_PER_SECOND.standard ?? 0.5))
      const downgradedTotal = scriptPlanning + promptGeneration + styleFrames + downgradedMain + heroShots + tts + music + captions

      if (downgradedTotal <= hardCap) {
        return {
          profile: qualityTier,
          targetDurationSeconds,
          qualityTier,
          estimatedCostCents: downgradedTotal,
          targetCostCents: profile.targetCostCents,
          hardCapCents: hardCap,
          selectedStrategy: 'downgraded_main_clips_to_standard',
          plannedSteps: buildSteps('standard', heroShotCount, needsNarration, needsMusic, needsCaptions, targetDurationSeconds),
          fallbackPlan: 'Use standard video for main clips, premium only for hero shots',
          downgradeOptions: ['Reduce hero shots', 'Use draft for previews', 'Shorten duration'],
          costBreakdown: { ...costBreakdown, mainVideoClips: downgradedMain, total: downgradedTotal },
          blockedReason: null,
          requiresApproval: false,
        }
      }
    }

    blockedReason = `Estimated cost ${total}¢ exceeds hard cap ${hardCap}¢`
    requiresApproval = true
  }

  return {
    profile: qualityTier,
    targetDurationSeconds,
    qualityTier,
    estimatedCostCents: total,
    targetCostCents: profile.targetCostCents,
    hardCapCents: hardCap,
    selectedStrategy: total <= profile.targetCostCents ? 'within_target' : 'over_target_under_cap',
    plannedSteps: buildSteps(qualityTier, heroShotCount, needsNarration, needsMusic, needsCaptions, targetDurationSeconds),
    fallbackPlan: profile.allowPremium ? 'Can downgrade main clips to standard' : 'Already at standard tier',
    downgradeOptions: ['Reduce hero shots', 'Use draft for previews', 'Shorten duration', 'Remove music'],
    costBreakdown,
    blockedReason,
    requiresApproval,
  }
}

function buildSteps(
  qualityTier: string,
  heroShotCount: number,
  needsNarration: boolean,
  needsMusic: boolean,
  needsCaptions: boolean,
  duration: number,
): PlannedStep[] {
  const steps: PlannedStep[] = [
    { stepKey: 'script', role: 'planner', capability: 'structured_output', provider: 'groq', model: 'llama-3.3-70b-versatile', estimatedCostCents: 1, qualityTier: 'standard', notes: 'Script and shot plan' },
    { stepKey: 'prompts', role: 'prompt_writer', capability: 'structured_output', provider: 'groq', model: 'llama-3.1-8b-instant', estimatedCostCents: 1, qualityTier: 'draft', notes: 'Generate video prompts per shot' },
    { stepKey: 'style_frames', role: 'style_frame', capability: 'image_generation', provider: 'together', model: 'black-forest-labs/FLUX.1-schnell', estimatedCostCents: 3, qualityTier: 'standard', notes: '3 reference style frames' },
    { stepKey: 'main_clips', role: 'main_clip', capability: 'video_generation', provider: 'together', model: 'wan-ai/Wan2.1-T2V-14B', estimatedCostCents: Math.ceil(duration * 0.5), qualityTier, notes: `${duration}s main video at standard tier` },
  ]

  if (heroShotCount > 0) {
    steps.push({
      stepKey: 'hero_shots',
      role: 'hero_clip',
      capability: 'video_generation',
      provider: 'genx',
      model: 'grok-imagine-video',
      estimatedCostCents: Math.ceil(heroShotCount * 5 * 2.5),
      qualityTier: 'premium',
      notes: `${heroShotCount} hero shots at premium tier`,
    })
  }

  if (needsNarration) {
    steps.push({ stepKey: 'tts', role: 'narration', capability: 'text_to_speech', provider: 'groq', model: 'playai-tts', estimatedCostCents: Math.ceil(duration * 0.05), qualityTier: 'standard', notes: 'TTS narration' })
  }

  if (needsMusic) {
    steps.push({ stepKey: 'music', role: 'music', capability: 'music_generation', provider: 'deepinfra', model: 'music-gen', estimatedCostCents: 5, qualityTier: 'standard', notes: 'Background music' })
  }

  if (needsCaptions) {
    steps.push({ stepKey: 'captions', role: 'captions', capability: 'structured_output', provider: 'groq', model: 'llama-3.1-8b-instant', estimatedCostCents: 2, qualityTier: 'draft', notes: 'Caption generation' })
  }

  steps.push({ stepKey: 'assembly', role: 'assembly', capability: 'system_ops', provider: 'local', model: 'ffmpeg', estimatedCostCents: 0, qualityTier: 'standard', notes: 'Local FFmpeg assembly' })

  return steps
}

export function getBudgetProfiles() {
  return BUDGET_PROFILES
}
