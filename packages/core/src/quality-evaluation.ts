import { z } from 'zod'
import { CAPABILITY_KEYS } from './capabilities.js'

export const QUALITY_DIMENSIONS = [
  'technical_validity',
  'prompt_adherence',
  'brand_consistency',
  'visual_quality',
  'composition',
  'temporal_continuity',
  'audio_quality',
  'speech_naturalness',
  'subtitle_accuracy',
  'factual_accuracy',
  'citation_quality',
  'accessibility',
  'safety',
  'provenance',
] as const

export type QualityDimension = (typeof QUALITY_DIMENSIONS)[number]

export const QUALITY_OUTPUT_TYPES = [
  'text',
  'json',
  'image',
  'audio',
  'video',
  'document',
  'mixed',
] as const

export type QualityOutputType = (typeof QUALITY_OUTPUT_TYPES)[number]

export const QUALITY_PROFILES = ['draft', 'standard', 'premium', 'publication'] as const
export type QualityProfile = (typeof QUALITY_PROFILES)[number]

export const HUMAN_REVIEW_STATUSES = ['not_required', 'pending', 'approved', 'rejected'] as const
export type HumanReviewStatus = (typeof HUMAN_REVIEW_STATUSES)[number]

export const QUALITY_DECISIONS = ['accepted', 'needs_review', 'rejected'] as const
export type QualityDecisionStatus = (typeof QUALITY_DECISIONS)[number]

export const QualityDimensionScoreSchema = z.object({
  dimension: z.enum(QUALITY_DIMENSIONS),
  score: z.number().min(0).max(100),
  weight: z.number().positive().max(100).default(1),
  required: z.boolean().default(false),
  blocking: z.boolean().default(false),
  evidence: z.array(z.string().min(1)).default([]),
  notes: z.array(z.string().min(1)).default([]),
})

export type QualityDimensionScore = z.infer<typeof QualityDimensionScoreSchema>

export const QualityCandidateEvidenceSchema = z.object({
  candidateId: z.string().min(1).max(200),
  capability: z.enum(CAPABILITY_KEYS),
  outputType: z.enum(QUALITY_OUTPUT_TYPES),
  technicalValid: z.boolean(),
  dimensions: z.array(QualityDimensionScoreSchema).min(1),
  criticalFailures: z.array(z.string().min(1)).default([]),
  warnings: z.array(z.string().min(1)).default([]),
  costCredits: z.number().min(0).nullable().default(null),
  latencyMs: z.number().int().min(0).nullable().default(null),
  provenanceComplete: z.boolean().default(false),
  rightsVerified: z.boolean().default(false),
  safetyPassed: z.boolean().default(false),
  humanReview: z.enum(HUMAN_REVIEW_STATUSES).default('not_required'),
}).superRefine((value, context) => {
  const seen = new Set<QualityDimension>()
  value.dimensions.forEach((item, index) => {
    if (seen.has(item.dimension)) {
      context.addIssue({
        code: 'custom',
        path: ['dimensions', index, 'dimension'],
        message: `Duplicate quality dimension: ${item.dimension}`,
      })
    }
    seen.add(item.dimension)
  })
})

export type QualityCandidateEvidence = z.infer<typeof QualityCandidateEvidenceSchema>

export const QualityPolicySchema = z.object({
  policyId: z.string().min(1).max(200),
  profile: z.enum(QUALITY_PROFILES),
  minOverallScore: z.number().min(0).max(100),
  minRequiredDimensionScore: z.number().min(0).max(100),
  requiredDimensions: z.array(z.enum(QUALITY_DIMENSIONS)).default([]),
  requireTechnicalValidity: z.boolean().default(true),
  requireSafety: z.boolean().default(true),
  requireProvenance: z.boolean().default(true),
  requireRightsVerification: z.boolean().default(false),
  requireHumanApproval: z.boolean().default(false),
  maxWarnings: z.number().int().min(0).max(100).default(5),
})

export type QualityPolicy = z.infer<typeof QualityPolicySchema>

const QUALITY_PROFILE_DEFAULTS: Record<QualityProfile, QualityPolicy> = {
  draft: {
    policyId: 'quality:draft:v1',
    profile: 'draft',
    minOverallScore: 65,
    minRequiredDimensionScore: 60,
    requiredDimensions: ['technical_validity', 'prompt_adherence', 'safety'],
    requireTechnicalValidity: true,
    requireSafety: true,
    requireProvenance: false,
    requireRightsVerification: false,
    requireHumanApproval: false,
    maxWarnings: 10,
  },
  standard: {
    policyId: 'quality:standard:v1',
    profile: 'standard',
    minOverallScore: 80,
    minRequiredDimensionScore: 75,
    requiredDimensions: ['technical_validity', 'prompt_adherence', 'safety', 'provenance'],
    requireTechnicalValidity: true,
    requireSafety: true,
    requireProvenance: true,
    requireRightsVerification: false,
    requireHumanApproval: false,
    maxWarnings: 5,
  },
  premium: {
    policyId: 'quality:premium:v1',
    profile: 'premium',
    minOverallScore: 88,
    minRequiredDimensionScore: 85,
    requiredDimensions: [
      'technical_validity',
      'prompt_adherence',
      'brand_consistency',
      'visual_quality',
      'safety',
      'provenance',
    ],
    requireTechnicalValidity: true,
    requireSafety: true,
    requireProvenance: true,
    requireRightsVerification: true,
    requireHumanApproval: true,
    maxWarnings: 2,
  },
  publication: {
    policyId: 'quality:publication:v1',
    profile: 'publication',
    minOverallScore: 90,
    minRequiredDimensionScore: 88,
    requiredDimensions: [
      'technical_validity',
      'prompt_adherence',
      'brand_consistency',
      'factual_accuracy',
      'accessibility',
      'safety',
      'provenance',
    ],
    requireTechnicalValidity: true,
    requireSafety: true,
    requireProvenance: true,
    requireRightsVerification: true,
    requireHumanApproval: true,
    maxWarnings: 0,
  },
}

export function createQualityPolicy(
  profile: QualityProfile,
  overrides: Partial<Omit<QualityPolicy, 'profile'>> = {},
): QualityPolicy {
  return QualityPolicySchema.parse({
    ...QUALITY_PROFILE_DEFAULTS[profile],
    ...overrides,
    profile,
  })
}

export interface QualityEvaluationDecision {
  candidateId: string
  status: QualityDecisionStatus
  eligibleForFinalSelection: boolean
  overallScore: number
  dimensionScores: Partial<Record<QualityDimension, number>>
  failures: string[]
  reviewReasons: string[]
  warnings: string[]
}

function roundScore(value: number): number {
  return Math.round(value * 100) / 100
}

function weightedOverallScore(dimensions: readonly QualityDimensionScore[]): number {
  const totalWeight = dimensions.reduce((sum, dimension) => sum + dimension.weight, 0)
  if (totalWeight <= 0) return 0
  const weightedScore = dimensions.reduce(
    (sum, dimension) => sum + dimension.score * dimension.weight,
    0,
  )
  return roundScore(weightedScore / totalWeight)
}

export function evaluateQualityCandidate(
  candidateInput: QualityCandidateEvidence,
  policyInput: QualityPolicy,
): QualityEvaluationDecision {
  const candidate = QualityCandidateEvidenceSchema.parse(candidateInput)
  const policy = QualityPolicySchema.parse(policyInput)
  const dimensionScores: Partial<Record<QualityDimension, number>> = {}
  const dimensionByName = new Map<QualityDimension, QualityDimensionScore>()

  for (const dimension of candidate.dimensions) {
    dimensionScores[dimension.dimension] = dimension.score
    dimensionByName.set(dimension.dimension, dimension)
  }

  const failures = [...candidate.criticalFailures]
  const reviewReasons: string[] = []
  const overallScore = weightedOverallScore(candidate.dimensions)

  if (policy.requireTechnicalValidity && !candidate.technicalValid) {
    failures.push('technical_validation_failed')
  }
  if (policy.requireSafety && !candidate.safetyPassed) failures.push('safety_check_failed')
  if (policy.requireProvenance && !candidate.provenanceComplete) failures.push('provenance_incomplete')
  if (policy.requireRightsVerification && !candidate.rightsVerified) failures.push('rights_not_verified')
  if (candidate.humanReview === 'rejected') failures.push('human_review_rejected')

  const requiredDimensions = new Set<QualityDimension>(policy.requiredDimensions)
  for (const dimension of candidate.dimensions) {
    if (dimension.required) requiredDimensions.add(dimension.dimension)
    if (dimension.blocking && dimension.score < policy.minRequiredDimensionScore) {
      failures.push(`blocking_dimension_below_floor:${dimension.dimension}`)
    }
  }

  for (const requiredDimension of requiredDimensions) {
    const dimension = dimensionByName.get(requiredDimension)
    if (!dimension) {
      failures.push(`required_dimension_missing:${requiredDimension}`)
      continue
    }
    if (dimension.score < policy.minRequiredDimensionScore) {
      failures.push(`required_dimension_below_floor:${requiredDimension}`)
    }
  }

  if (overallScore < policy.minOverallScore) {
    failures.push(`overall_score_below_floor:${overallScore}<${policy.minOverallScore}`)
  }
  if (candidate.warnings.length > policy.maxWarnings) {
    failures.push(`warning_limit_exceeded:${candidate.warnings.length}>${policy.maxWarnings}`)
  }
  if (policy.requireHumanApproval && candidate.humanReview !== 'approved') {
    reviewReasons.push('human_approval_required')
  }

  const uniqueFailures = [...new Set(failures)]
  const uniqueReviewReasons = [...new Set(reviewReasons)]
  const status: QualityDecisionStatus = uniqueFailures.length > 0
    ? 'rejected'
    : uniqueReviewReasons.length > 0
      ? 'needs_review'
      : 'accepted'

  return {
    candidateId: candidate.candidateId,
    status,
    eligibleForFinalSelection: status === 'accepted',
    overallScore,
    dimensionScores,
    failures: uniqueFailures,
    reviewReasons: uniqueReviewReasons,
    warnings: [...candidate.warnings],
  }
}

export interface RankedQualityCandidate {
  candidate: QualityCandidateEvidence
  decision: QualityEvaluationDecision
}

function decisionRank(status: QualityDecisionStatus): number {
  if (status === 'accepted') return 0
  if (status === 'needs_review') return 1
  return 2
}

export function rankQualityCandidates(
  candidateInputs: readonly QualityCandidateEvidence[],
  policy: QualityPolicy,
): RankedQualityCandidate[] {
  return candidateInputs
    .map((candidateInput) => {
      const candidate = QualityCandidateEvidenceSchema.parse(candidateInput)
      return { candidate, decision: evaluateQualityCandidate(candidate, policy) }
    })
    .sort((left, right) => {
      const statusDifference = decisionRank(left.decision.status) - decisionRank(right.decision.status)
      if (statusDifference !== 0) return statusDifference
      const scoreDifference = right.decision.overallScore - left.decision.overallScore
      if (scoreDifference !== 0) return scoreDifference
      const leftCost = left.candidate.costCredits ?? Number.POSITIVE_INFINITY
      const rightCost = right.candidate.costCredits ?? Number.POSITIVE_INFINITY
      if (leftCost !== rightCost) return leftCost - rightCost
      const leftLatency = left.candidate.latencyMs ?? Number.POSITIVE_INFINITY
      const rightLatency = right.candidate.latencyMs ?? Number.POSITIVE_INFINITY
      if (leftLatency !== rightLatency) return leftLatency - rightLatency
      return left.candidate.candidateId.localeCompare(right.candidate.candidateId)
    })
}

export function selectQualityWinner(
  candidates: readonly QualityCandidateEvidence[],
  policy: QualityPolicy,
): RankedQualityCandidate {
  const ranked = rankQualityCandidates(candidates, policy)
  const winner = ranked.find((entry) => entry.decision.eligibleForFinalSelection)
  if (winner) return winner

  const summary = ranked
    .slice(0, 5)
    .map((entry) => {
      const reasons = [...entry.decision.failures, ...entry.decision.reviewReasons].join(',') || 'unknown'
      return `${entry.candidate.candidateId}:${entry.decision.status}:${reasons}`
    })
    .join('; ')
  throw new Error(`No candidate passed quality policy ${policy.policyId}. ${summary}`)
}
