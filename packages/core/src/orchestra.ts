/**
 * Orchestra — DB-backed routing engine.
 *
 * Pure evaluator: receives structured facts, produces routing decisions.
 * Does not import Prisma or query databases.
 */

import { PROVIDER_KEYS, type ProviderKey } from './providers.js'
import { type CapabilityKey } from './capabilities.js'

// ── Routing Modes ──────────────────────────────────────────────

export const ORCHESTRA_ROUTING_MODES = ['balanced', 'quality', 'economy', 'fast'] as const
export type OrchestraRoutingMode = (typeof ORCHESTRA_ROUTING_MODES)[number]

// ── Shared Constants ───────────────────────────────────────────

export const CAPABILITY_FIELD_MAP: Record<string, string> = {
  chat: 'supportsChat',
  streaming_chat: 'supportsChat',
  reasoning: 'supportsReasoning',
  code: 'supportsCode',
  summarization: 'supportsText',
  translation: 'supportsText',
  question_answering: 'supportsText',
  classification: 'supportsText',
  zero_shot_classification: 'supportsText',
  extraction: 'supportsText',
  token_classification: 'supportsText',
  fill_mask: 'supportsText',
  feature_extraction: 'supportsText',
  sentence_similarity: 'supportsText',
  table_qa: 'supportsText',
  structured_output: 'supportsStructuredOutput',
  tool_use: 'supportsToolUse',
  image_generation: 'supportsImageGeneration',
  image_edit: 'supportsImageEditing',
  image_to_image: 'supportsImageEditing',
  image_upscale: 'supportsImageEditing',
  image_classification: 'supportsVision',
  object_detection: 'supportsVision',
  image_segmentation: 'supportsVision',
  depth_estimation: 'supportsVision',
  keypoint_detection: 'supportsVision',
  visual_question_answering: 'supportsVision',
  document_qa: 'supportsText',
  ocr: 'supportsVision',
  zero_shot_object_detection: 'supportsVision',
  mask_generation: 'supportsVision',
  visual_document_retrieval: 'supportsVision',
  video_generation: 'supportsVideoGeneration',
  image_to_video: 'supportsVideoGeneration',
  video_to_video: 'supportsVideoGeneration',
  long_form_video: 'supportsVideoGeneration',
  video_understanding: 'supportsVision',
  video_classification: 'supportsVision',
  storyboard_generation: 'supportsVision',
  subtitle_generation: 'supportsTts',
  lip_sync: 'supportsVideoGeneration',
  avatar_generation: 'supportsVideoGeneration',
  text_to_3d: 'supportsVision',
  image_to_3d: 'supportsVision',
  tts: 'supportsTts',
  stt: 'supportsStt',
  voice_clone: 'supportsTts',
  voice_conversion: 'supportsTts',
  text_to_audio: 'supportsTts',
  audio_to_audio: 'supportsTts',
  audio_classification: 'supportsStt',
  voice_activity_detection: 'supportsStt',
  music_generation: 'supportsMusicGeneration',
  song_generation: 'supportsMusicGeneration',
  embeddings: 'supportsEmbeddings',
  reranking: 'supportsReranking',
  rag_ingest: 'supportsText',
  rag_search: 'supportsText',
  research: 'supportsResearch',
  brand_scrape: 'supportsText',
  document_ingest: 'supportsText',
  campaign_generation: 'supportsText',
  social_content_generation: 'supportsText',
  adult_text: 'supportsChat',
  adult_image: 'supportsImageGeneration',
  adult_voice: 'supportsTts',
  adult_avatar: 'supportsVideoGeneration',
  adult_video: 'supportsVideoGeneration',
}

export const EXECUTOR_CAPABILITY_MAP: Record<string, string[]> = {
  chat: ['groq', 'deepinfra'],
  streaming_chat: ['groq', 'deepinfra'],
  reasoning: ['groq', 'deepinfra'],
  code: ['groq', 'deepinfra'],
  summarization: ['groq', 'deepinfra'],
  translation: ['groq', 'deepinfra'],
  question_answering: ['groq', 'deepinfra'],
  classification: ['groq', 'deepinfra'],
  zero_shot_classification: ['groq', 'deepinfra'],
  extraction: ['groq', 'deepinfra'],
  token_classification: ['groq', 'deepinfra'],
  fill_mask: ['groq', 'deepinfra'],
  feature_extraction: ['groq', 'deepinfra'],
  sentence_similarity: ['groq', 'deepinfra'],
  table_qa: ['groq', 'deepinfra'],
  structured_output: ['groq', 'deepinfra'],
  tool_use: ['groq', 'deepinfra'],
  image_generation: ['together'],
  image_edit: ['together'],
  image_to_image: ['together'],
  image_upscale: ['together'],
  video_generation: ['genx'],
  image_to_video: ['genx'],
  video_to_video: ['genx'],
  long_form_video: ['genx'],
  tts: ['groq', 'together'],
  stt: ['groq', 'together'],
  voice_clone: ['together'],
  voice_conversion: ['together'],
  text_to_audio: ['groq', 'together'],
  audio_to_audio: ['groq', 'together'],
  music_generation: ['genx'],
  song_generation: ['genx'],
  embeddings: ['together', 'deepinfra'],
  reranking: ['together', 'deepinfra'],
}

export const HEALTHY_PROVIDER_STATUSES = new Set(['configured', 'live'])
export const BLOCKED_PROVIDER_STATUSES = new Set(['disabled', 'runtime_restricted'])

export const CODING_TOOL_CAPABILITIES = new Set<CapabilityKey>([
  'code', 'structured_output',
])

// ── Request Contract ───────────────────────────────────────────

export interface OrchestraRequest {
  capability: CapabilityKey
  routingMode?: OrchestraRoutingMode
  appSlug?: string
  qualityTier?: string
  maxCostCents?: number
  latencyPreference?: 'low' | 'medium' | 'high'
  budgetLimit?: number
  executionId?: string
}

// ── Request Validation ─────────────────────────────────────────
// Apps must NOT provide provider or model fields.
// The Orchestra decides provider and model.

export const ORCHESTRA_BLOCKED_REQUEST_FIELDS = [
  'provider',
  'providerId',
  'providerSlug',
  'model',
  'modelId',
  'modelName',
  'adapter',
  'endpoint',
  'fallbackProvider',
  'fallbackModel',
  'routingScore',
  'forceProvider',
  'forceModel',
] as const

export function validateOrchestraRequest(input: Record<string, unknown>): string | null {
  for (const field of ORCHESTRA_BLOCKED_REQUEST_FIELDS) {
    if (field in input) return field
  }
  return null
}

// ── Candidate Contract ─────────────────────────────────────────

export interface OrchestraCandidate {
  provider: ProviderKey
  model: string
  displayName: string
  capability: CapabilityKey
  providerConfigured: boolean
  providerEnabled: boolean
  providerHealth: string
  providerAccountAllowed: boolean
  providerPolicyAllowed: boolean
  modelLifecycleAllowed: boolean
  adapterSupported: boolean
  executorSupported: boolean
  requestShapeKnown: boolean
  responseShapeKnown: boolean
  infrastructureReady: boolean
  executionReady: boolean
  liveProven: boolean
  estimatedCost: number | null
  costTier: string
  qualityTier: string
  latencyTier: string
  pricingConfidence: string
  score: number
  scoreBreakdown: Record<string, number>
  blockers: string[]
}

// ── Decision Contract ──────────────────────────────────────────

export interface OrchestraFallbackRoute {
  provider: ProviderKey
  model: string
  score: number
  blockers: string[]
}

export interface OrchestraDecision {
  executionId: string
  capability: CapabilityKey
  routingMode: OrchestraRoutingMode
  selectedProvider: ProviderKey | null
  selectedModel: string | null
  score: number
  scoreBreakdown: Record<string, number>
  fallbackRoutes: OrchestraFallbackRoute[]
  snapshotTimestamp: string
  truthVersion: string
  reasons: string[]
  blockersRejected: Array<{ provider: string; model: string; blockers: string[] }>
  executionAllowed: boolean
  blockReason: string | null
}

// ── Eligibility Rules ──────────────────────────────────────────

const APPROVED_PROVIDER_SET = new Set<string>(PROVIDER_KEYS)

function isProviderApproved(provider: string): boolean {
  return APPROVED_PROVIDER_SET.has(provider)
}

function isCodingCapability(capability: CapabilityKey): boolean {
  return CODING_TOOL_CAPABILITIES.has(capability)
}

export function checkCandidateEligibility(
  candidate: OrchestraCandidate,
  capability: CapabilityKey,
): string[] {
  const blockers: string[] = []

  if (!isProviderApproved(candidate.provider)) {
    blockers.push('provider_not_approved')
    return blockers
  }

  if (!candidate.providerConfigured) {
    blockers.push('provider_not_configured')
  }

  if (!candidate.providerEnabled) {
    blockers.push('provider_disabled')
  }

  if (candidate.providerHealth === 'failed') {
    blockers.push('provider_health_failed')
  }

  if (candidate.providerHealth === 'disabled') {
    blockers.push('provider_health_disabled')
  }

  if (candidate.providerHealth === 'runtime_restricted') {
    blockers.push('provider_runtime_restricted')
  }

  if (!candidate.providerAccountAllowed) {
    blockers.push('provider_account_blocked')
  }

  if (!candidate.providerPolicyAllowed) {
    blockers.push('provider_policy_restricted')
  }

  if (candidate.provider === 'mimo' && !CODING_TOOL_CAPABILITIES.has(capability)) {
    blockers.push('mimo_coding_tool_only')
  }

  if (!candidate.modelLifecycleAllowed) {
    blockers.push('model_lifecycle_blocked')
  }

  if (!candidate.adapterSupported) {
    blockers.push('adapter_not_supported')
  }

  if (!candidate.executorSupported) {
    blockers.push('executor_not_supported')
  }

  if (!candidate.requestShapeKnown) {
    blockers.push('request_shape_unknown')
  }

  if (!candidate.responseShapeKnown) {
    blockers.push('response_shape_unknown')
  }

  if (!candidate.infrastructureReady) {
    blockers.push('infrastructure_not_ready')
  }

  return blockers
}

// ── Scoring Weights ────────────────────────────────────────────

export interface ScoringWeights {
  capabilityFit: number
  implementationCompleteness: number
  providerHealth: number
  liveProofConfidence: number
  qualityMatch: number
  costEfficiency: number
  latencyScore: number
}

const DEFAULT_WEIGHTS: ScoringWeights = {
  capabilityFit: 20,
  implementationCompleteness: 15,
  providerHealth: 15,
  liveProofConfidence: 10,
  qualityMatch: 15,
  costEfficiency: 15,
  latencyScore: 10,
}

const QUALITY_WEIGHTS: ScoringWeights = {
  capabilityFit: 15,
  implementationCompleteness: 15,
  providerHealth: 10,
  liveProofConfidence: 20,
  qualityMatch: 25,
  costEfficiency: 5,
  latencyScore: 10,
}

const ECONOMY_WEIGHTS: ScoringWeights = {
  capabilityFit: 15,
  implementationCompleteness: 15,
  providerHealth: 10,
  liveProofConfidence: 10,
  qualityMatch: 10,
  costEfficiency: 30,
  latencyScore: 10,
}

const FAST_WEIGHTS: ScoringWeights = {
  capabilityFit: 15,
  implementationCompleteness: 15,
  providerHealth: 10,
  liveProofConfidence: 10,
  qualityMatch: 10,
  costEfficiency: 10,
  latencyScore: 30,
}

function getWeights(mode: OrchestraRoutingMode): ScoringWeights {
  switch (mode) {
    case 'quality': return QUALITY_WEIGHTS
    case 'economy': return ECONOMY_WEIGHTS
    case 'fast': return FAST_WEIGHTS
    default: return DEFAULT_WEIGHTS
  }
}

const COST_TIER_SCORE: Record<string, number> = {
  free: 100,
  very_low: 90,
  low: 80,
  medium: 60,
  high: 40,
  premium: 20,
}

const LATENCY_TIER_SCORE: Record<string, number> = {
  ultra_low: 100,
  low: 80,
  medium: 60,
  high: 40,
}

const QUALITY_TIER_SCORE: Record<string, number> = {
  budget: 40,
  balanced: 70,
  premium: 90,
  experimental: 60,
}

const HEALTH_SCORE: Record<string, number> = {
  live: 100,
  configured: 70,
  unconfigured: 30,
  failed: 0,
  disabled: 0,
  runtime_restricted: 0,
}

function scoreCandidate(
  candidate: OrchestraCandidate,
  weights: ScoringWeights,
): { score: number; breakdown: Record<string, number> } {
  const breakdown: Record<string, number> = {}

  breakdown.capabilityFit = weights.capabilityFit

  const implScore = [
    candidate.adapterSupported,
    candidate.executorSupported,
    candidate.requestShapeKnown,
    candidate.responseShapeKnown,
    candidate.infrastructureReady,
  ].filter(Boolean).length / 5
  breakdown.implementationCompleteness = Math.round(weights.implementationCompleteness * implScore)

  breakdown.providerHealth = Math.round(weights.providerHealth * (HEALTH_SCORE[candidate.providerHealth] ?? 0) / 100)

  breakdown.liveProofConfidence = candidate.liveProven ? weights.liveProofConfidence : 0

  const qualityScore = QUALITY_TIER_SCORE[candidate.qualityTier] ?? 50
  breakdown.qualityMatch = Math.round(weights.qualityMatch * qualityScore / 100)

  const costScore = COST_TIER_SCORE[candidate.costTier] ?? 50
  breakdown.costEfficiency = Math.round(weights.costEfficiency * costScore / 100)

  const latencyScore = LATENCY_TIER_SCORE[candidate.latencyTier] ?? 50
  breakdown.latencyScore = Math.round(weights.latencyScore * latencyScore / 100)

  const total = Object.values(breakdown).reduce((sum, v) => sum + v, 0)

  return { score: total, breakdown }
}

// ── Deterministic Tie-Breaking ─────────────────────────────────

function compareCandidates(a: OrchestraCandidate, b: OrchestraCandidate): number {
  if (a.score !== b.score) return b.score - a.score
  if (a.liveProven !== b.liveProven) return a.liveProven ? -1 : 1
  if (a.executionReady !== b.executionReady) return a.executionReady ? -1 : 1
  const aCost = a.estimatedCost ?? Infinity
  const bCost = b.estimatedCost ?? Infinity
  if (aCost !== bCost) return aCost - bCost
  return a.provider.localeCompare(b.provider) || a.model.localeCompare(b.model)
}

// ── Main Evaluation ────────────────────────────────────────────

export function evaluateOrchestra(
  request: OrchestraRequest,
  candidates: OrchestraCandidate[],
): OrchestraDecision {
  const capability = request.capability
  const routingMode = request.routingMode ?? 'balanced'
  const executionId = request.executionId ?? `exec_${Date.now()}`
  const weights = getWeights(routingMode)

  const eligible: OrchestraCandidate[] = []
  const blockersRejected: Array<{ provider: string; model: string; blockers: string[] }> = []

  for (const candidate of candidates) {
    const blockers = checkCandidateEligibility(candidate, capability)
    if (blockers.length > 0) {
      blockersRejected.push({
        provider: candidate.provider,
        model: candidate.model,
        blockers,
      })
      continue
    }

    const { score, breakdown } = scoreCandidate(candidate, weights)
    candidate.score = score
    candidate.scoreBreakdown = breakdown
    eligible.push(candidate)
  }

  eligible.sort(compareCandidates)

  const selected = eligible[0] ?? null
  const fallbackRoutes: OrchestraFallbackRoute[] = eligible.slice(1, 4).map((c) => ({
    provider: c.provider,
    model: c.model,
    score: c.score,
    blockers: [],
  }))

  const reasons: string[] = []
  if (selected) {
    reasons.push(`Selected ${selected.provider}/${selected.model} with score ${selected.score}`)
    if (selected.liveProven) reasons.push('Live-proven candidate preferred')
  }

  let blockReason: string | null = null
  if (!selected) {
    blockReason = `No eligible candidate for '${capability}' in '${routingMode}' mode`
    if (blockersRejected.length > 0) {
      const uniqueBlockers = [...new Set(blockersRejected.flatMap((r) => r.blockers))]
      blockReason += `. Blockers: ${uniqueBlockers.join('; ')}`
    }
  }

  return {
    executionId,
    capability,
    routingMode,
    selectedProvider: selected?.provider ?? null,
    selectedModel: selected?.model ?? null,
    score: selected?.score ?? 0,
    scoreBreakdown: selected?.scoreBreakdown ?? {},
    fallbackRoutes,
    snapshotTimestamp: new Date().toISOString(),
    truthVersion: 'orchestra-v1',
    reasons,
    blockersRejected,
    executionAllowed: selected !== null,
    blockReason,
  }
}

// ── Shared DB-Record Normalizer ────────────────────────────────
// Pure function: converts DB model/provider records into OrchestraCandidate[].
// Both API loader and worker use this to avoid duplicate normalization logic.

export interface DbModelRecord {
  provider: string
  modelId: string
  displayName?: string | null
  status?: string
  costTier?: string | null
  latencyTier?: string | null
  estimatedUnitCost?: number | null
  pricingConfidence?: string | null
  [key: string]: unknown
}

export interface DbProviderRecord {
  providerKey: string
  enabled: boolean
  healthStatus: string | null
}

export function normalizeDbCandidates(
  models: DbModelRecord[],
  providers: DbProviderRecord[],
  capability: CapabilityKey,
): OrchestraCandidate[] {
  const supportField = CAPABILITY_FIELD_MAP[capability]
  if (!supportField) return []

  const providerMap = new Map<string, DbProviderRecord>()
  for (const p of providers) {
    providerMap.set(p.providerKey, p)
  }

  const executorProviders = new Set(EXECUTOR_CAPABILITY_MAP[capability] ?? [])

  const candidates: OrchestraCandidate[] = []

  for (const model of models) {
    const record = model as Record<string, unknown>
    if (record[supportField] !== true) continue

    const provider = providerMap.get(model.provider)
    const providerHealth = provider?.healthStatus ?? 'unconfigured'
    const providerEnabled = provider?.enabled ?? false
    const providerConfigured = HEALTHY_PROVIDER_STATUSES.has(providerHealth)
    const providerAccountAllowed = !BLOCKED_PROVIDER_STATUSES.has(providerHealth)
    const providerPolicyAllowed = model.provider !== 'mimo' || isCodingCapability(capability)
    const adapterSupported = executorProviders.has(model.provider)
    const executorSupported = adapterSupported
    const modelLifecycleAllowed = model.status !== 'blocked' && model.status !== 'retired'

    candidates.push({
      provider: model.provider as ProviderKey,
      model: model.modelId,
      displayName: model.displayName ?? model.modelId,
      capability,
      providerConfigured,
      providerEnabled,
      providerHealth,
      providerAccountAllowed,
      providerPolicyAllowed,
      modelLifecycleAllowed,
      adapterSupported,
      executorSupported,
      requestShapeKnown: true,
      responseShapeKnown: true,
      infrastructureReady: true,
      executionReady: adapterSupported && executorSupported && modelLifecycleAllowed && providerConfigured,
      liveProven: false,
      estimatedCost: model.estimatedUnitCost ?? null,
      costTier: model.costTier ?? 'medium',
      qualityTier: model.costTier ?? 'balanced',
      latencyTier: model.latencyTier ?? 'medium',
      pricingConfidence: model.pricingConfidence ?? 'unknown',
      score: 0,
      scoreBreakdown: {},
      blockers: [],
    })
  }

  return candidates
}
