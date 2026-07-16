/**
 * Budget Policy — Public-to-Internal Mapping
 *
 * Maps public app budget policies (premium, budget, mix) to internal routing modes.
 * This is the single source of truth for budget policy interpretation.
 */

import type { OrchestraRoutingMode } from './orchestra.js'

// ── Public Budget Policies ─────────────────────────────────────

export const PUBLIC_BUDGET_POLICIES = ['premium', 'budget', 'mix'] as const
export type PublicBudgetPolicy = (typeof PUBLIC_BUDGET_POLICIES)[number]

// ── Quality Floors ─────────────────────────────────────────────

export const QUALITY_FLOORS = ['budget', 'balanced', 'premium'] as const
export type QualityFloor = (typeof QUALITY_FLOORS)[number]

// ── Budget Policy → Routing Mode Mapping ───────────────────────

/**
 * Maps public budget policy to internal Orchestra routing mode.
 * This mapping exists ONCE only — no reimplementation in routes, executors, or dashboard.
 */
export function mapBudgetPolicyToRoutingMode(
  policy: PublicBudgetPolicy,
  _qualityFloor: QualityFloor = 'balanced',
): OrchestraRoutingMode {
  switch (policy) {
    case 'premium':
      return 'quality'
    case 'budget':
      return 'economy'
    case 'mix':
      // Mix uses balanced as default; workflow steps may override individually
      return 'balanced'
    default:
      return 'balanced'
  }
}

/**
 * For mix policy, determines the routing mode for a specific workflow step.
 * Background/utility steps use economy; quality-critical steps use quality.
 */
export function getMixPolicyStepMode(
  stepRole: string,
  qualityFloor: QualityFloor,
): OrchestraRoutingMode {
  // Quality-critical steps escalate
  const qualityCriticalRoles = new Set([
    'final_copy', 'hero_image', 'hero_clip', 'narration', 'music',
    'main_clip', 'style_frame', 'assembly',
  ])

  if (qualityCriticalRoles.has(stepRole)) {
    return qualityFloor === 'premium' ? 'quality' : 'balanced'
  }

  // Background/utility steps use economy
  return 'economy'
}

// ── Budget Validation ──────────────────────────────────────────

export interface BudgetCheckResult {
  allowed: boolean
  reason: string | null
  remainingBudgetCents: number | null
}

/**
 * Checks if a request is within budget constraints.
 */
export function checkBudgetConstraints(
  estimatedCostCents: number | null,
  maxCostPerRequest?: number,
  maxCostPerWorkflow?: number,
  currentWorkflowCostCents = 0,
): BudgetCheckResult {
  // Zero or absent means there is no app-specific ceiling configured.
  if ((maxCostPerRequest ?? 0) > 0 && estimatedCostCents !== null && estimatedCostCents > maxCostPerRequest!) {
    return {
      allowed: false,
      reason: `Estimated cost ${estimatedCostCents} cents exceeds per-request limit ${maxCostPerRequest} cents`,
      remainingBudgetCents: null,
    }
  }

  if ((maxCostPerWorkflow ?? 0) > 0) {
    const projectedTotal = currentWorkflowCostCents + (estimatedCostCents ?? 0)
    if (projectedTotal > maxCostPerWorkflow!) {
      return {
        allowed: false,
        reason: `Projected workflow cost ${projectedTotal} cents exceeds workflow limit ${maxCostPerWorkflow} cents`,
        remainingBudgetCents: maxCostPerWorkflow! - currentWorkflowCostCents,
      }
    }
  }

  return {
    allowed: true,
    reason: null,
    remainingBudgetCents: (maxCostPerWorkflow ?? 0) > 0 ? maxCostPerWorkflow! - currentWorkflowCostCents : null,
  }
}

// ── Quality Floor Validation ───────────────────────────────────

const QUALITY_FLOOR_SCORE: Record<QualityFloor, number> = {
  budget: 40,
  balanced: 70,
  premium: 90,
}

/**
 * Checks if a candidate's quality tier meets the app's quality floor.
 */
export function meetsQualityFloor(
  candidateQualityTier: string,
  qualityFloor: QualityFloor,
): boolean {
  const candidateScore = QUALITY_FLOOR_SCORE[candidateQualityTier as QualityFloor] ?? 50
  const floorScore = QUALITY_FLOOR_SCORE[qualityFloor]
  return candidateScore >= floorScore
}
