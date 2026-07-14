/**
 * Orchestra — DB-backed routing engine.
 *
 * Pure evaluator: receives structured facts, produces routing decisions.
 * Does not import Prisma or query databases.
 */

import { PROVIDER_KEYS, getProviderDefinition, type ProviderKey } from './providers.js'
import { CAPABILITY_FIELD_MAP, type CapabilityKey } from './capabilities.js'
import { getExecutorRegistration, type ExecutorId } from './executor-registry.js'

// ── Routing Modes ──────────────────────────────────────────────

export const ORCHESTRA_ROUTING_MODES = ['balanced', 'quality', 'economy', 'fast'] as const
export type OrchestraRoutingMode = (typeof ORCHESTRA_ROUTING_MODES)[number]

// ── Shared Constants ───────────────────────────────────────────

export const HEALTHY_PROVIDER_STATUSES = new Set(['configured', 'live'])
export const BLOCKED_PROVIDER_STATUSES = new Set(['disabled', 'runtime_restricted'])

export const CODING_TOOL_CAPABILITIES = new Set<CapabilityKey>([
  'code', 'structured_output',
])

// ── Request Contract ───────────────────────────────────────────

export interface AppCapabilityGrantContext {
  appSlug: string
  capability: CapabilityKey
  enabled: boolean
  qualityFloor: string
  budgetPolicy: string
  maxCostPerRequest: number
  maxCostPerWorkflow: number
  latencyPreference: string
  allowFallback: boolean
  maxFallbackAttempts: number
  liveProofRequired: boolean
  approvalRequired: boolean
  artifactRead: boolean
  artifactWrite: boolean
  memoryRead: boolean
  memoryWrite: boolean
  ragNamespaces: string[]
  policyProfile: string
  adultPermission: boolean
  dataRetentionPolicy: string
  passthroughModelAllowed: boolean
  providerResidencyConstraints: string[]
}

export interface OrchestraRequest {
  capability: CapabilityKey
  routingMode?: OrchestraRoutingMode
  appSlug?: string
  qualityTier?: string
  maxCostCents?: number
  latencyPreference?: 'low' | 'medium' | 'high'
  budgetLimit?: number
  executionId?: string
  appGrant?: AppCapabilityGrantContext
  infrastructureReady?: boolean
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
  executorId: ExecutorId | null
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
  executorId: ExecutorId
  score: number
  blockers: string[]
}

export interface OrchestraDecision {
  executionId: string
  capability: CapabilityKey
  routingMode: OrchestraRoutingMode
  selectedProvider: ProviderKey | null
  selectedModel: string | null
  selectedExecutorId: ExecutorId | null
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

export function checkCandidateEligibility(
  candidate: OrchestraCandidate,
  capability: CapabilityKey,
  appGrant?: AppCapabilityGrantContext,
): string[] {
  const blockers: string[] = []

  // App grant checks
  if (appGrant) {
    if (!appGrant.enabled) {
      blockers.push('app_capability_disabled')
      return blockers
    }

    if (appGrant.approvalRequired) {
      blockers.push('app_approval_required')
    }

    if (appGrant.liveProofRequired && !candidate.liveProven) {
      blockers.push('app_live_proof_required')
    }

    if (!appGrant.adultPermission && capability.startsWith('adult_')) {
      blockers.push('app_adult_permission_required')
    }

    if (appGrant.providerResidencyConstraints.length > 0 &&
        !appGrant.providerResidencyConstraints.includes(candidate.provider)) {
      blockers.push('app_provider_residency_constraint')
    }
  }

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

  if (!candidate.executorId) {
    blockers.push('executor_registration_missing')
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
  const appGrant = request.appGrant

  const eligible: OrchestraCandidate[] = []
  const blockersRejected: Array<{ provider: string; model: string; blockers: string[] }> = []

  for (const candidate of candidates) {
    const blockers = checkCandidateEligibility(candidate, capability, appGrant)
    if (blockers.length > 0) {
      blockersRejected.push({
        provider: candidate.provider,
        model: candidate.model,
        blockers,
      })
      continue
    }

    // Budget check if app grant specifies cost limits
    if (appGrant && appGrant.maxCostPerRequest > 0 && candidate.estimatedCost !== null) {
      if (candidate.estimatedCost > appGrant.maxCostPerRequest) {
        blockersRejected.push({
          provider: candidate.provider,
          model: candidate.model,
          blockers: ['exceeds_app_cost_limit'],
        })
        continue
      }
    }

    const { score, breakdown } = scoreCandidate(candidate, weights)
    candidate.score = score
    candidate.scoreBreakdown = breakdown
    eligible.push(candidate)
  }

  eligible.sort(compareCandidates)

  // Respect app grant fallback limits
  const maxFallbacks = appGrant?.allowFallback === false ? 0 : (appGrant?.maxFallbackAttempts ?? 3)
  const selected = eligible[0] ?? null
  const fallbackRoutes: OrchestraFallbackRoute[] = eligible.slice(1, 1 + maxFallbacks).map((c) => ({
    provider: c.provider,
    model: c.model,
    executorId: c.executorId!,
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
    selectedExecutorId: selected?.executorId ?? null,
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
  evidence: { infrastructureReady?: boolean; liveProvenRoutes?: ReadonlySet<string> } = {},
): OrchestraCandidate[] {
  const supportField = CAPABILITY_FIELD_MAP[capability]
  if (!supportField) return []

  const providerMap = new Map<string, DbProviderRecord>()
  for (const p of providers) {
    providerMap.set(p.providerKey, p)
  }

  const candidates: OrchestraCandidate[] = []

  for (const model of models) {
    const record = model as Record<string, unknown>
    if (record[supportField] !== true) continue

    const provider = providerMap.get(model.provider)
    const providerHealth = provider?.healthStatus ?? 'unconfigured'
    const providerEnabled = provider?.enabled ?? false
    const providerConfigured = HEALTHY_PROVIDER_STATUSES.has(providerHealth)
    const providerAccountAllowed = !BLOCKED_PROVIDER_STATUSES.has(providerHealth)
    if (!(PROVIDER_KEYS as readonly string[]).includes(model.provider)) continue
    const providerDefinition = getProviderDefinition(model.provider as ProviderKey)
    const providerPolicyAllowed = providerDefinition.backendExecutionAllowed && !providerDefinition.codingOnly
    const executorRegistration = getExecutorRegistration(capability, model.provider as ProviderKey)
    const adapterSupported = executorRegistration !== undefined
    const executorSupported = executorRegistration !== undefined
    const requestShapeKnown = executorRegistration !== undefined
    const responseShapeKnown = executorRegistration !== undefined
    const infrastructureReady = evidence.infrastructureReady === true
    const modelLifecycleAllowed = model.status !== 'blocked' && model.status !== 'retired'
    const liveProven = evidence.liveProvenRoutes?.has(`${model.provider}/${model.modelId}/${capability}`) === true

    candidates.push({
      provider: model.provider as ProviderKey,
      model: model.modelId,
      displayName: model.displayName ?? model.modelId,
      capability,
      executorId: executorRegistration?.id ?? null,
      providerConfigured,
      providerEnabled,
      providerHealth,
      providerAccountAllowed,
      providerPolicyAllowed,
      modelLifecycleAllowed,
      adapterSupported,
      executorSupported,
      requestShapeKnown,
      responseShapeKnown,
      infrastructureReady,
      executionReady: adapterSupported && executorSupported && modelLifecycleAllowed && providerConfigured && infrastructureReady,
      liveProven,
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
