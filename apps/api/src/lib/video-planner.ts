import { selectRuntimeModel, type RuntimeCandidate } from './runtime-selector.js'

export interface BudgetPlan {
  profile: string
  targetDurationSeconds: number
  qualityTier: string
  estimatedCostCents: number | null
  usdEstimateConfidence: 'known' | 'unknown'
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
  selectedCandidate: RuntimeCandidate | null
  pricingSource: string
  usdEstimateConfidence: 'known' | 'unknown'
  estimatedCostCents: number | null
  qualityTier: string
  notes: string
  blockedReason: string | null
}

export interface CostBreakdown {
  scriptPlanning: number | null
  promptGeneration: number | null
  styleFrames: number | null
  mainVideoClips: number | null
  heroShots: number | null
  tts: number | null
  music: number | null
  captions: number | null
  ffmpegAssembly: number
  total: number | null
}

interface PlannerInput {
  targetDurationSeconds?: number
  qualityTier?: string
  outputFormat?: string
  needsNarration?: boolean
  needsMusic?: boolean
  needsCaptions?: boolean
  heroShotCount?: number
  budgetCapCents?: number
  allowPremiumUnknownPricing?: boolean
  selectedCandidates?: Partial<Record<string, RuntimeCandidate | null>>
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

type CandidateRole = 'script' | 'prompts' | 'style_frames' | 'main_clips' | 'hero_shots' | 'tts' | 'music' | 'captions'

async function candidateFor(input: PlannerInput, role: CandidateRole, capability: string, qualityTier: string): Promise<RuntimeCandidate | null> {
  if (Object.prototype.hasOwnProperty.call(input.selectedCandidates ?? {}, role)) {
    return input.selectedCandidates?.[role] ?? null
  }

  const result = await selectRuntimeModel(capability, {
    qualityTier,
    allowUnknownCostPremium: input.allowPremiumUnknownPricing === true,
  })
  return result.selected
}

function knownCost(candidate: RuntimeCandidate | null): number | null {
  if (!candidate) return null
  const confidenceKnown = candidate.pricingConfidence === 'known' || candidate.pricingConfidence === 'admin_manual'
  const sourceKnown = candidate.pricingSource === 'provider_api' || candidate.pricingSource === 'admin_manual'
  if (!sourceKnown || !confidenceKnown || candidate.estimatedCost === null) return null
  return Math.ceil(candidate.estimatedCost)
}

function makeStep(input: {
  stepKey: CandidateRole | 'assembly'
  role: string
  capability: string
  candidate: RuntimeCandidate | null
  estimatedCostCents: number | null
  qualityTier: string
  notes: string
  localFree?: boolean
}): PlannedStep {
  if (input.localFree) {
    return {
      stepKey: input.stepKey,
      role: input.role,
      capability: input.capability,
      provider: 'local',
      model: 'ffmpeg',
      selectedCandidate: null,
      pricingSource: 'local_free_tool',
      usdEstimateConfidence: 'known',
      estimatedCostCents: 0,
      qualityTier: input.qualityTier,
      notes: input.notes,
      blockedReason: null,
    }
  }

  const pricingKnown = input.estimatedCostCents !== null
  return {
    stepKey: input.stepKey,
    role: input.role,
    capability: input.capability,
    provider: input.candidate?.provider ?? '',
    model: input.candidate?.model ?? '',
    selectedCandidate: input.candidate,
    pricingSource: input.candidate?.pricingSource ?? 'unknown',
    usdEstimateConfidence: pricingKnown ? 'known' : 'unknown',
    estimatedCostCents: input.estimatedCostCents,
    qualityTier: input.qualityTier,
    notes: input.notes,
    blockedReason: pricingKnown ? null : 'pricing_unknown',
  }
}

export async function planVideoBudget(rawInput: PlannerInput = {}): Promise<BudgetPlan> {
  const qualityTier = rawInput.qualityTier ?? 'standard'
  const profile = BUDGET_PROFILES[qualityTier as keyof typeof BUDGET_PROFILES] || BUDGET_PROFILES.standard
  const targetDurationSeconds = rawInput.targetDurationSeconds ?? profile.defaultDurationSeconds
  const needsNarration = rawInput.needsNarration === true
  const needsMusic = rawInput.needsMusic === true
  const needsCaptions = rawInput.needsCaptions === true
  const heroShotCount = rawInput.heroShotCount ?? 0
  const hardCapCents = rawInput.budgetCapCents ?? profile.hardCapCents

  const script = await candidateFor(rawInput, 'script', 'structured_output', 'standard')
  const prompts = await candidateFor(rawInput, 'prompts', 'structured_output', 'draft')
  const styleFrames = await candidateFor(rawInput, 'style_frames', 'image_generation', 'standard')
  const mainClips = await candidateFor(rawInput, 'main_clips', 'video_generation', qualityTier)
  const heroShots = heroShotCount > 0 && profile.allowHero
    ? await candidateFor(rawInput, 'hero_shots', 'video_generation', 'premium')
    : null
  const narration = needsNarration ? await candidateFor(rawInput, 'tts', 'tts', 'standard') : null
  const music = needsMusic ? await candidateFor(rawInput, 'music', 'music_generation', 'standard') : null
  const captions = needsCaptions ? await candidateFor(rawInput, 'captions', 'structured_output', 'draft') : null

  const steps: PlannedStep[] = [
    makeStep({ stepKey: 'script', role: 'planner', capability: 'structured_output', candidate: script, estimatedCostCents: knownCost(script), qualityTier: 'standard', notes: 'Script and shot plan selected from runtime catalog.' }),
    makeStep({ stepKey: 'prompts', role: 'prompt_writer', capability: 'structured_output', candidate: prompts, estimatedCostCents: knownCost(prompts), qualityTier: 'draft', notes: 'Prompt generation selected from runtime catalog.' }),
    makeStep({ stepKey: 'style_frames', role: 'style_frame', capability: 'image_generation', candidate: styleFrames, estimatedCostCents: knownCost(styleFrames), qualityTier: 'standard', notes: 'Reference style frames require priced catalog image candidate.' }),
    makeStep({ stepKey: 'main_clips', role: 'main_clip', capability: 'video_generation', candidate: mainClips, estimatedCostCents: knownCost(mainClips), qualityTier, notes: `${targetDurationSeconds}s main video requires priced catalog video candidate.` }),
  ]

  if (heroShotCount > 0) {
    steps.push(makeStep({ stepKey: 'hero_shots', role: 'hero_clip', capability: 'video_generation', candidate: heroShots, estimatedCostCents: knownCost(heroShots), qualityTier: 'premium', notes: `${heroShotCount} premium hero shot(s) require admin-approved priced candidate.` }))
  }
  if (needsNarration) {
    steps.push(makeStep({ stepKey: 'tts', role: 'narration', capability: 'tts', candidate: narration, estimatedCostCents: knownCost(narration), qualityTier: 'standard', notes: 'Narration requires priced catalog TTS candidate.' }))
  }
  if (needsMusic) {
    steps.push(makeStep({ stepKey: 'music', role: 'music', capability: 'music_generation', candidate: music, estimatedCostCents: knownCost(music), qualityTier: 'standard', notes: 'Music generation is pending priced eligible catalog support.' }))
  }
  if (needsCaptions) {
    steps.push(makeStep({ stepKey: 'captions', role: 'captions', capability: 'structured_output', candidate: captions, estimatedCostCents: knownCost(captions), qualityTier: 'draft', notes: 'Captions selected from runtime catalog.' }))
  }

  steps.push(makeStep({ stepKey: 'assembly', role: 'assembly', capability: 'system_ops', candidate: null, estimatedCostCents: 0, qualityTier: 'standard', notes: 'Local FFmpeg assembly.', localFree: true }))

  const breakdown: CostBreakdown = {
    scriptPlanning: steps.find((step) => step.stepKey === 'script')?.estimatedCostCents ?? null,
    promptGeneration: steps.find((step) => step.stepKey === 'prompts')?.estimatedCostCents ?? null,
    styleFrames: steps.find((step) => step.stepKey === 'style_frames')?.estimatedCostCents ?? null,
    mainVideoClips: steps.find((step) => step.stepKey === 'main_clips')?.estimatedCostCents ?? null,
    heroShots: steps.find((step) => step.stepKey === 'hero_shots')?.estimatedCostCents ?? (heroShotCount > 0 ? null : 0),
    tts: steps.find((step) => step.stepKey === 'tts')?.estimatedCostCents ?? (needsNarration ? null : 0),
    music: steps.find((step) => step.stepKey === 'music')?.estimatedCostCents ?? (needsMusic ? null : 0),
    captions: steps.find((step) => step.stepKey === 'captions')?.estimatedCostCents ?? (needsCaptions ? null : 0),
    ffmpegAssembly: 0,
    total: null,
  }

  const paidSteps = steps.filter((step) => step.stepKey !== 'assembly')
  const unknownSteps = paidSteps.filter((step) => step.estimatedCostCents === null)
  const knownTotal = steps.reduce((sum, step) => sum + (step.estimatedCostCents ?? 0), 0)
  const estimatedCostCents = unknownSteps.length ? null : knownTotal
  breakdown.total = estimatedCostCents

  let blockedReason: string | null = null
  let requiresApproval = false

  if (unknownSteps.length > 0) {
    blockedReason = `Pricing is unknown for required step(s): ${unknownSteps.map((step) => step.stepKey).join(', ')}. Standard automatic selection is blocked until provider API or admin manual USD pricing exists.`
    requiresApproval = qualityTier === 'premium' || qualityTier === 'hero'
  } else if (estimatedCostCents !== null && estimatedCostCents > hardCapCents) {
    blockedReason = `Catalog-backed estimate ${estimatedCostCents} cents exceeds hard cap ${hardCapCents} cents.`
    requiresApproval = true
  }

  if ((qualityTier === 'premium' || qualityTier === 'hero') && unknownSteps.length > 0) {
    blockedReason = `Premium video includes unknown-cost step(s): ${unknownSteps.map((step) => step.stepKey).join(', ')}. Admin approval or manual pricing is required before selection.`
    requiresApproval = true
  }

  return {
    profile: qualityTier,
    targetDurationSeconds,
    qualityTier,
    estimatedCostCents,
    usdEstimateConfidence: estimatedCostCents === null ? 'unknown' : 'known',
    targetCostCents: profile.targetCostCents,
    hardCapCents,
    selectedStrategy: blockedReason ? 'blocked_pending_pricing' : estimatedCostCents !== null && estimatedCostCents <= profile.targetCostCents ? 'within_target_catalog_priced' : 'over_target_catalog_priced',
    plannedSteps: steps,
    fallbackPlan: 'Use only catalog-priced provider candidates; local FFmpeg remains zero-cost assembly.',
    downgradeOptions: ['Add admin manual USD pricing', 'Use a priced lower-cost catalog model', 'Shorten duration', 'Remove optional media steps'],
    costBreakdown: breakdown,
    blockedReason,
    requiresApproval,
  }
}

export function getBudgetProfiles() {
  return BUDGET_PROFILES
}
