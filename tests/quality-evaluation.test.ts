import { describe, expect, it } from 'vitest'
import {
  QualityCandidateEvidenceSchema,
  createQualityPolicy,
  evaluateQualityCandidate,
  rankQualityCandidates,
  selectQualityWinner,
  type QualityCandidateEvidence,
} from '../packages/core/src/quality-evaluation.js'

function candidate(overrides: Record<string, unknown> = {}): QualityCandidateEvidence {
  return QualityCandidateEvidenceSchema.parse({
    candidateId: 'candidate-a',
    capability: 'video_generation',
    outputType: 'video',
    technicalValid: true,
    dimensions: [
      { dimension: 'technical_validity', score: 96 },
      { dimension: 'prompt_adherence', score: 94 },
      { dimension: 'brand_consistency', score: 92 },
      { dimension: 'visual_quality', score: 93 },
      { dimension: 'safety', score: 100 },
      { dimension: 'provenance', score: 100 },
    ],
    criticalFailures: [],
    warnings: [],
    costCredits: 12,
    latencyMs: 4_000,
    provenanceComplete: true,
    rightsVerified: true,
    safetyPassed: true,
    humanReview: 'approved',
    ...overrides,
  })
}

describe('quality evaluation policy', () => {
  it('accepts a premium candidate only after every hard gate and approval passes', () => {
    const decision = evaluateQualityCandidate(candidate(), createQualityPolicy('premium'))

    expect(decision.status).toBe('accepted')
    expect(decision.eligibleForFinalSelection).toBe(true)
    expect(decision.overallScore).toBeGreaterThanOrEqual(88)
    expect(decision.failures).toEqual([])
    expect(decision.reviewReasons).toEqual([])
  })

  it('rejects a high-scoring output when technical validation fails', () => {
    const decision = evaluateQualityCandidate(
      candidate({ technicalValid: false }),
      createQualityPolicy('premium'),
    )

    expect(decision.status).toBe('rejected')
    expect(decision.eligibleForFinalSelection).toBe(false)
    expect(decision.failures).toContain('technical_validation_failed')
  })

  it('rejects an output when a policy-required dimension is missing', () => {
    const incomplete = candidate({
      dimensions: [
        { dimension: 'technical_validity', score: 95 },
        { dimension: 'prompt_adherence', score: 95 },
        { dimension: 'safety', score: 100 },
      ],
      humanReview: 'not_required',
      rightsVerified: false,
    })
    const decision = evaluateQualityCandidate(incomplete, createQualityPolicy('standard'))

    expect(decision.status).toBe('rejected')
    expect(decision.failures).toContain('required_dimension_missing:provenance')
  })

  it('holds an otherwise valid premium output for human approval', () => {
    const decision = evaluateQualityCandidate(
      candidate({ humanReview: 'pending' }),
      createQualityPolicy('premium'),
    )

    expect(decision.status).toBe('needs_review')
    expect(decision.eligibleForFinalSelection).toBe(false)
    expect(decision.failures).toEqual([])
    expect(decision.reviewReasons).toContain('human_approval_required')
  })

  it('rejects candidates with too many unresolved warnings', () => {
    const decision = evaluateQualityCandidate(
      candidate({ warnings: ['continuity-risk', 'subtitle-risk', 'logo-risk'] }),
      createQualityPolicy('premium'),
    )

    expect(decision.status).toBe('rejected')
    expect(decision.failures).toContain('warning_limit_exceeded:3>2')
  })
})

describe('quality candidate ranking', () => {
  it('ranks accepted candidates by quality before cost and latency', () => {
    const policy = createQualityPolicy('standard')
    const lowerScore = candidate({
      candidateId: 'lower-score',
      humanReview: 'not_required',
      rightsVerified: false,
      costCredits: 1,
      latencyMs: 100,
      dimensions: [
        { dimension: 'technical_validity', score: 88 },
        { dimension: 'prompt_adherence', score: 88 },
        { dimension: 'safety', score: 100 },
        { dimension: 'provenance', score: 100 },
      ],
    })
    const higherScore = candidate({
      candidateId: 'higher-score',
      humanReview: 'not_required',
      rightsVerified: false,
      costCredits: 20,
      latencyMs: 10_000,
      dimensions: [
        { dimension: 'technical_validity', score: 98 },
        { dimension: 'prompt_adherence', score: 97 },
        { dimension: 'safety', score: 100 },
        { dimension: 'provenance', score: 100 },
      ],
    })

    const ranked = rankQualityCandidates([lowerScore, higherScore], policy)

    expect(ranked[0]?.candidate.candidateId).toBe('higher-score')
    expect(selectQualityWinner([lowerScore, higherScore], policy).candidate.candidateId).toBe('higher-score')
  })

  it('uses lower cost and latency only as deterministic tie-breakers', () => {
    const policy = createQualityPolicy('standard')
    const shared = {
      humanReview: 'not_required',
      rightsVerified: false,
      dimensions: [
        { dimension: 'technical_validity', score: 95 },
        { dimension: 'prompt_adherence', score: 95 },
        { dimension: 'safety', score: 100 },
        { dimension: 'provenance', score: 100 },
      ],
    }
    const expensive = candidate({
      ...shared,
      candidateId: 'expensive',
      costCredits: 20,
      latencyMs: 500,
    })
    const cheaper = candidate({
      ...shared,
      candidateId: 'cheaper',
      costCredits: 10,
      latencyMs: 5_000,
    })

    expect(rankQualityCandidates([expensive, cheaper], policy)[0]?.candidate.candidateId).toBe('cheaper')
  })

  it('never selects a rejected candidate even when it has the highest numeric score', () => {
    const policy = createQualityPolicy('premium')
    const rejected = candidate({ candidateId: 'rejected', technicalValid: false })
    const accepted = candidate({
      candidateId: 'accepted',
      dimensions: [
        { dimension: 'technical_validity', score: 90 },
        { dimension: 'prompt_adherence', score: 90 },
        { dimension: 'brand_consistency', score: 90 },
        { dimension: 'visual_quality', score: 90 },
        { dimension: 'safety', score: 100 },
        { dimension: 'provenance', score: 100 },
      ],
    })

    expect(selectQualityWinner([rejected, accepted], policy).candidate.candidateId).toBe('accepted')
  })
})

describe('quality evidence validation', () => {
  it('rejects duplicate quality dimensions', () => {
    expect(() => candidate({
      dimensions: [
        { dimension: 'technical_validity', score: 95 },
        { dimension: 'technical_validity', score: 96 },
      ],
    })).toThrow(/Duplicate quality dimension/)
  })
})
