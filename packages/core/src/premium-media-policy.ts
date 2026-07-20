import type { CapabilityKey } from './capabilities.js'

export const PREMIUM_MEDIA_ROLES = ['hero_image', 'video_scene', 'reference_video', 'voiceover', 'music_clip', 'full_song'] as const
export type PremiumMediaRole = (typeof PREMIUM_MEDIA_ROLES)[number]

export interface PremiumGenxModelCandidate {
  provider: string
  modelId: string
  displayName?: string
  category?: string | null
  capabilities: readonly CapabilityKey[]
  qualityTier?: string | null
  costTier?: string | null
  liveProven?: boolean
  accountAccessible?: boolean
  executable?: boolean
  pricingKnown?: boolean
  estimatedCredits?: number | null
}

export interface PremiumGenxSelectionRequest {
  role: PremiumMediaRole
  capability: CapabilityKey
  maxEstimatedCredits?: number
  candidateLimit?: number
  allowFastVariants?: boolean
}

export interface RankedPremiumGenxModel extends PremiumGenxModelCandidate {
  premiumScore: number
  reasons: string[]
}

export interface PremiumSpendLine {
  role: PremiumMediaRole
  modelId: string
  quantity: number
  estimatedCreditsPerUnit: number | null
}

export interface PremiumSpendDecision {
  allowed: boolean
  estimatedCredits: number | null
  availableAfterReserve: number
  maxCredits: number
  reserveCredits: number
  blockers: string[]
  lines: Array<PremiumSpendLine & { estimatedLineCredits: number | null }>
}

const PREMIUM_ROLE_PATTERNS: Record<PremiumMediaRole, readonly RegExp[]> = {
  hero_image: [/gpt[-_ ]?image[-_ ]?2/i, /nano[-_ ]?banana[-_ ]?pro/i, /recraft[-_ ]?v?4\.1[-_ ]?pro/i, /genx[-_ ]?lm[-_ ]?pro.*img/i],
  video_scene: [/seedance[-_ ]?2\.0/i, /veo[-_ ]?3\.1(?!.*fast)/i, /kling[-_ ]?v?3[-_ ]?pro/i, /pixverse[-_ ]?v?6/i],
  reference_video: [/seedance[-_ ]?2\.0[-_ ]?reference/i, /seedance[-_ ]?2\.0[-_ ]?i2v/i, /kling[-_ ]?v?3[-_ ]?pro[-_ ]?i2v/i, /pixverse[-_ ]?v?6[-_ ]?i2v/i],
  voiceover: [/genx[-_ ]?lm[-_ ]?voice/i, /grok[-_ ]?tts/i, /aura[-_ ]?2/i, /eleven/i],
  music_clip: [/lyria[-_ ]?3[-_ ]?clip/i, /lyria[-_ ]?3[-_ ]?pro/i],
  full_song: [/lyria[-_ ]?3[-_ ]?pro/i],
}

const FAST_VARIANT_PATTERN = /(?:^|[-_ ])(?:fast|turbo|flash|clip)(?:$|[-_ ])/i
const PREMIUM_NAME_PATTERN = /(?:^|[-_ ])(?:pro|premium|reference|ultimate|max)(?:$|[-_ ])/i

export function isPreferredPremiumGenxModel(modelId: string, role: PremiumMediaRole): boolean {
  return PREMIUM_ROLE_PATTERNS[role].some((pattern) => pattern.test(modelId))
}

export function rankPremiumGenxModels(
  candidates: readonly PremiumGenxModelCandidate[],
  request: PremiumGenxSelectionRequest,
): RankedPremiumGenxModel[] {
  const limit = Math.max(1, Math.min(12, Math.floor(request.candidateLimit ?? 4)))
  const maxCredits = request.maxEstimatedCredits

  return candidates
    .filter((candidate) => candidate.provider === 'genx')
    .filter((candidate) => candidate.capabilities.includes(request.capability))
    .filter((candidate) => candidate.accountAccessible === true)
    .filter((candidate) => candidate.executable === true)
    .filter((candidate) => candidate.pricingKnown === true)
    .filter((candidate) => request.allowFastVariants === true || !FAST_VARIANT_PATTERN.test(candidate.modelId))
    .filter((candidate) => maxCredits === undefined || candidate.estimatedCredits === null || candidate.estimatedCredits === undefined || candidate.estimatedCredits <= maxCredits)
    .map((candidate): RankedPremiumGenxModel => {
      const reasons: string[] = ['genx_only', 'account_accessible', 'executable', 'pricing_known']
      let premiumScore = 0
      if (isPreferredPremiumGenxModel(candidate.modelId, request.role)) { premiumScore += 100; reasons.push('role_preferred_family') }
      if (candidate.qualityTier === 'premium') { premiumScore += 35; reasons.push('premium_quality_tier') }
      if (candidate.costTier === 'premium') { premiumScore += 10; reasons.push('premium_cost_tier') }
      if (PREMIUM_NAME_PATTERN.test(candidate.modelId)) { premiumScore += 20; reasons.push('premium_model_identity') }
      if (candidate.liveProven) { premiumScore += 30; reasons.push('live_proven') }
      if (candidate.estimatedCredits !== null && candidate.estimatedCredits !== undefined) {
        premiumScore += Math.max(0, 10 - Math.min(10, candidate.estimatedCredits / 100))
        reasons.push('cost_estimated')
      }
      return { ...candidate, premiumScore, reasons }
    })
    .filter((candidate) => candidate.premiumScore >= 100)
    .sort((left, right) => right.premiumScore - left.premiumScore || left.modelId.localeCompare(right.modelId))
    .slice(0, limit)
}

export function createPremiumSpendDecision(input: {
  availableCredits: number
  maxCredits: number
  reserveCredits?: number
  lines: readonly PremiumSpendLine[]
}): PremiumSpendDecision {
  const reserveCredits = Math.max(0, input.reserveCredits ?? 0)
  const maxCredits = Number.isFinite(input.maxCredits) ? input.maxCredits : 0
  const availableAfterReserve = Math.max(0, input.availableCredits - reserveCredits)
  const blockers: string[] = []
  if (!(maxCredits > 0)) blockers.push('positive_max_credit_ceiling_required')
  if (!(input.availableCredits >= 0)) blockers.push('invalid_available_credit_balance')
  if (input.lines.length === 0) blockers.push('spend_plan_empty')

  const lines = input.lines.map((line) => {
    const quantity = Number.isInteger(line.quantity) && line.quantity > 0 ? line.quantity : 0
    const estimate = line.estimatedCreditsPerUnit
    if (quantity === 0) blockers.push(`invalid_quantity:${line.role}`)
    if (estimate === null || !Number.isFinite(estimate) || estimate < 0) blockers.push(`pricing_unknown:${line.modelId}`)
    return {
      ...line,
      quantity,
      estimatedLineCredits: estimate === null || !Number.isFinite(estimate) || estimate < 0 ? null : estimate * quantity,
    }
  })

  const known = lines.every((line) => line.estimatedLineCredits !== null)
  const estimatedCredits = known
    ? Math.ceil(lines.reduce((total, line) => total + (line.estimatedLineCredits ?? 0), 0) * 1000) / 1000
    : null

  if (estimatedCredits !== null && estimatedCredits > maxCredits) blockers.push('estimated_spend_exceeds_ceiling')
  if (estimatedCredits !== null && estimatedCredits > availableAfterReserve) blockers.push('insufficient_credits_after_reserve')

  return {
    allowed: blockers.length === 0,
    estimatedCredits,
    availableAfterReserve,
    maxCredits,
    reserveCredits,
    blockers: [...new Set(blockers)],
    lines,
  }
}

export function assertPremiumSpendConfirmed(decision: PremiumSpendDecision, confirmation: string): void {
  if (!decision.allowed) throw new Error(`Premium spend preflight blocked: ${decision.blockers.join(', ')}`)
  if (confirmation !== 'CONFIRM_PREMIUM_GENX_SPEND') {
    throw new Error('Premium GenX spend requires confirmation token CONFIRM_PREMIUM_GENX_SPEND')
  }
}
