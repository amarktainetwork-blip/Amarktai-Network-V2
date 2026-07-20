/**
 * Orchestra — DB-backed routing engine.
 *
 * Pure evaluator: receives structured facts, produces routing decisions.
 * Does not import Prisma or query databases.
 */

import { PROVIDER_KEYS, getProviderDefinition, getProviderDefaultBaseUrl, type ProviderKey } from './providers.js'
import { CAPABILITY_FIELD_MAP, type CapabilityKey } from './capabilities.js'
import {
  getExecutorRegistrations,
  isExecutorModelCompatible,
  GENERAL_TEXT_CAPABILITY_SET,
  type ExecutorId,
  type ExecutorModelMetadata,
} from './executor-registry.js'
import { getModelRecord, type ModelRecord, type ModelCostTier, type ModelLatencyTier, type QualityTier } from './model-catalog.js'

// ── Routing Modes ──────────────────────────────────────────────

export const ORCHESTRA_ROUTING_MODES = ['balanced', 'quality', 'economy', 'fast'] as const
export type OrchestraRoutingMode = (typeof ORCHESTRA_ROUTING_MODES)[number]
export const APP_ROUTE_POLICY_MODES = ['automatic', 'fixed_route', 'preferred_pool', 'app_selectable_allowlist', 'automatic_restricted_pool'] as const
export type AppRoutePolicyMode = (typeof APP_ROUTE_POLICY_MODES)[number]
export const APP_QUALITY_TARGETS = ['standard', 'premium'] as const
export type AppQualityTarget = (typeof APP_QUALITY_TARGETS)[number]
export const APP_SPEND_STRATEGIES = ['lowest_cost', 'best_value', 'best_available', 'fixed_ceiling'] as const
export type AppSpendStrategy = (typeof APP_SPEND_STRATEGIES)[number]
export const EXECUTION_PROFILES = ['internal_dashboard', 'external_app'] as const
export type ExecutionProfile = (typeof EXECUTION_PROFILES)[number]

// ── Shared Constants ───────────────────────────────────────────

export const HEALTHY_PROVIDER_STATUSES = new Set(['live', 'healthy'])
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
  routingMode?: AppRoutePolicyMode
  qualityTarget?: AppQualityTarget
  spendStrategy?: AppSpendStrategy
  fixedRoute?: string | null
  preferredPool?: string[]
  selectableAllowlist?: string[]
  restrictedPool?: string[]
  workflowStepOverrides?: Record<string, unknown>
}

export interface OrchestraRequest {
  capability: CapabilityKey
  executionProfile?: ExecutionProfile
  routingMode?: OrchestraRoutingMode
  appSlug?: string
  qualityTier?: string
  maxCostCents?: number
  latencyPreference?: 'low' | 'medium' | 'high'
  budgetLimit?: number
  executionId?: string
  appGrant?: AppCapabilityGrantContext
  infrastructureReady?: boolean
  requestedRoute?: { provider: ProviderKey; model: string }
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
  'executionProfile',
  'orchestraExecutorConstraint',
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
  routeType?: 'native_specialist' | 'text_transform_fallback'
  providerConfigured: boolean
  providerEnabled: boolean
  providerHealth: string
  providerHealthReady: boolean
  providerAccountAllowed: boolean
  providerPolicyAllowed: boolean
  modelLifecycleAllowed: boolean
  modelAccountAccessible?: boolean
  serverlessAvailable?: boolean | null
  dedicatedEndpointConfigured?: boolean
  adapterSupported: boolean
  executorSupported: boolean
  requestShapeKnown: boolean
  responseShapeKnown: boolean
  endpointReady: boolean
  databaseReady: boolean
  queueReady: boolean
  modelCompatible: boolean
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
  executionProfile: ExecutionProfile
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
  executionProfile: ExecutionProfile = 'external_app',
  requestedRoute?: { provider: ProviderKey; model: string },
): string[] {
  const blockers: string[] = []

  // App grant checks
  if (appGrant && executionProfile === 'external_app') {
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

    if (appGrant.providerResidencyConstraints.length > 0 &&
        !appGrant.providerResidencyConstraints.includes(candidate.provider)) {
      blockers.push('app_provider_residency_constraint')
    }

    const route = `${candidate.provider}/${candidate.model}`
    const policyMode = appGrant.routingMode ?? 'automatic'
    if (policyMode === 'fixed_route' && appGrant.fixedRoute !== route) blockers.push('app_fixed_route_mismatch')
    if (policyMode === 'preferred_pool' && (appGrant.preferredPool?.length ?? 0) > 0 && !appGrant.preferredPool!.includes(route)) blockers.push('app_preferred_pool_mismatch')
    if (policyMode === 'automatic_restricted_pool' && !appGrant.restrictedPool?.includes(route)) blockers.push('app_restricted_pool_mismatch')
    if (policyMode === 'app_selectable_allowlist') {
      if (!requestedRoute) blockers.push('app_route_selection_required')
      else if (!appGrant.selectableAllowlist?.includes(`${requestedRoute.provider}/${requestedRoute.model}`)) blockers.push('app_requested_route_not_approved')
      else if (candidate.provider !== requestedRoute.provider || candidate.model !== requestedRoute.model) blockers.push('app_requested_route_mismatch')
    } else if (requestedRoute) {
      blockers.push('app_route_selection_not_allowed')
    }
  }

  // Adult permission is a safety boundary for every execution profile.
  if (appGrant && !appGrant.adultPermission && capability.startsWith('adult_')) {
    blockers.push('app_adult_permission_required')
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

  if (!candidate.providerHealthReady) {
    blockers.push('provider_health_not_ready')
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

  if (candidate.modelAccountAccessible === false) {
    blockers.push(candidate.serverlessAvailable === false && !candidate.dedicatedEndpointConfigured
      ? 'dedicated_endpoint_required'
      : 'model_account_inaccessible')
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

  if (!candidate.modelCompatible) {
    blockers.push('executor_model_incompatible')
  }

  if (!candidate.endpointReady) {
    blockers.push('provider_endpoint_not_ready')
  }

  if (!candidate.databaseReady) {
    blockers.push('database_not_ready')
  }

  if (!candidate.queueReady) {
    blockers.push('queue_not_ready')
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

const ROUTE_PRIORITY: Record<string, number> = {
  native_specialist: 0,
  text_transform_fallback: 1,
}

function compareCandidates(a: OrchestraCandidate, b: OrchestraCandidate): number {
  const aPriority = ROUTE_PRIORITY[a.routeType ?? ''] ?? 2
  const bPriority = ROUTE_PRIORITY[b.routeType ?? ''] ?? 2
  if (aPriority !== bPriority) return aPriority - bPriority
  if (a.liveProven !== b.liveProven) return a.liveProven ? -1 : 1
  if (a.modelAccountAccessible !== b.modelAccountAccessible) return a.modelAccountAccessible === true ? -1 : 1
  if (a.score !== b.score) return b.score - a.score
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
  const routingMode = request.routingMode ?? routingModeForAppPolicy(request.appGrant)
  const executionProfile = request.executionProfile ?? 'external_app'
  const executionId = request.executionId ?? `exec_${Date.now()}`
  const weights = getWeights(routingMode)
  const appGrant = request.appGrant

  const eligible: OrchestraCandidate[] = []
  const blockersRejected: Array<{ provider: string; model: string; blockers: string[] }> = []

  for (const candidate of candidates) {
    const blockers = checkCandidateEligibility(candidate, capability, appGrant, executionProfile, request.requestedRoute)
    if (blockers.length > 0) {
      blockersRejected.push({
        provider: candidate.provider,
        model: candidate.model,
        blockers,
      })
      continue
    }

    // Budget check if app grant specifies cost limits
    if (executionProfile === 'external_app' && appGrant && appGrant.maxCostPerRequest > 0 && candidate.estimatedCost !== null) {
      if (candidate.estimatedCost > appGrant.maxCostPerRequest) {
        blockersRejected.push({
          provider: candidate.provider,
          model: candidate.model,
          blockers: ['exceeds_app_cost_limit'],
        })
        continue
      }
    }

    if (executionProfile === 'external_app' && appGrant?.qualityTarget === 'premium' && !['premium', 'high'].includes(candidate.qualityTier)) {
      blockersRejected.push({ provider: candidate.provider, model: candidate.model, blockers: ['below_app_quality_target'] })
      continue
    }

    const { score, breakdown } = scoreCandidate(candidate, weights)
    const preferredIndex = appGrant?.preferredPool?.indexOf(`${candidate.provider}/${candidate.model}`) ?? -1
    const preferenceBonus = preferredIndex >= 0 ? Math.max(1, 100 - preferredIndex) : 0
    candidate.score = score + preferenceBonus
    if (preferenceBonus) breakdown.appPoolPreference = preferenceBonus
    candidate.scoreBreakdown = breakdown
    eligible.push(candidate)
  }

  eligible.sort(compareCandidates)

  // Respect app grant fallback limits
  const maxFallbacks = executionProfile === 'external_app' && appGrant?.allowFallback === false
    ? 0
    : executionProfile === 'external_app' ? (appGrant?.maxFallbackAttempts ?? 3) : 3
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
    executionProfile,
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

function routingModeForAppPolicy(grant: AppCapabilityGrantContext | undefined): OrchestraRoutingMode {
  if (grant?.spendStrategy === 'lowest_cost') return 'economy'
  if (grant?.spendStrategy === 'best_available') return 'quality'
  return 'balanced'
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
  qualityTier?: string | null
  latencyTier?: string | null
  estimatedUnitCost?: number | null
  pricingConfidence?: string | null
  capabilitiesJson?: string | null
  rawMetadata?: string | null
  category?: string | null
  taskType?: string | null
  providerRawCategory?: string | null
  providerRawType?: string | null
  [key: string]: unknown
}

export interface DbProviderRecord {
  providerKey: string
  enabled: boolean
  healthStatus: string | null
  apiKey?: string | null
  baseUrl?: string | null
  defaultModel?: string | null
  credentialUsagePolicy?: string | null
}

export interface RuntimeInfrastructureEvidence {
  databaseReady?: boolean
  queueReady?: boolean
  endpointReadyByProvider?: Partial<Record<ProviderKey, boolean>>
  liveProvenRoutes?: ReadonlySet<string>
}

export function normalizeDbCandidates(
  models: DbModelRecord[],
  providers: DbProviderRecord[],
  capability: CapabilityKey,
  evidence: RuntimeInfrastructureEvidence = {},
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
    const exactCapabilities = parseCapabilityList(model.capabilitiesJson)
    const exactCapabilityClaim = exactCapabilities.includes(capability)

    // Pre-filter: check if the model could possibly be eligible before expensive compatibility evaluation.
    // For exact-match registrations, the model must claim the capability.
    // For semantic_text_fallback registrations, a text model without the specialist claim may still qualify,
    // but it must have at least one general text capability.
    const allRegistrations = getExecutorRegistrations(capability, model.provider as ProviderKey)
    if (allRegistrations.length === 0) continue

    const hasSemanticFallback = allRegistrations.some((r) => r.capabilityMatchMode === 'semantic_text_fallback')
    if (!exactCapabilityClaim && !hasSemanticFallback) continue
    if (!exactCapabilityClaim && hasSemanticFallback) {
      const hasTextCapability = exactCapabilities.some((cap) => GENERAL_TEXT_CAPABILITY_SET.has(cap))
        || (record[supportField] === true)
      if (!hasTextCapability) continue
    }

    const provider = providerMap.get(model.provider)
    const providerHealth = provider?.healthStatus ?? 'unconfigured'
    const providerEnabled = provider?.enabled ?? false
    const providerConfigured = typeof provider?.apiKey === 'string' && provider.apiKey.trim().length > 0
    const providerHealthReady = HEALTHY_PROVIDER_STATUSES.has(providerHealth)
    const providerAccountAllowed = !BLOCKED_PROVIDER_STATUSES.has(providerHealth)
    if (!(PROVIDER_KEYS as readonly string[]).includes(model.provider)) continue
    const providerDefinition = getProviderDefinition(model.provider as ProviderKey)
    const providerPolicyAllowed = providerDefinition.backendExecutionAllowed && !providerDefinition.codingOnly
    const adapterSupported = allRegistrations.length > 0
    const executorSupported = allRegistrations.length > 0
    const compatibilityMetadata = executorModelMetadataFromDbRecord(model, exactCapabilities)
    const requestShapeKnown = compatibilityMetadata.requestShapeKnown === true
    const responseShapeKnown = compatibilityMetadata.responseShapeKnown === true
    // Find the best compatible registration: prefer native specialist over text-transform fallback
    const compatibleRegistrations = allRegistrations.filter((registration) =>
      isExecutorModelCompatible(registration, model.modelId, compatibilityMetadata),
    )
    const nativeRegistration = compatibleRegistrations.find((r) => r.capabilityMatchMode === 'exact')
    const fallbackRegistration = compatibleRegistrations.find((r) => r.capabilityMatchMode === 'semantic_text_fallback')
    const bestRegistration = nativeRegistration ?? fallbackRegistration ?? compatibleRegistrations[0] ?? null
    const modelCompatible = bestRegistration !== null
    // Skip models that have no compatible registration and no exact capability claim.
    // These models were only considered because of a semantic fallback registration
    // that didn't work out — no point adding them as blocked candidates.
    if (!modelCompatible && !exactCapabilityClaim) continue
    const executorRegistration = bestRegistration
    const configuredBaseUrl = typeof provider?.baseUrl === 'string' ? provider.baseUrl.trim() : ''
    const defaultBaseUrl = getProviderDefaultBaseUrl(model.provider as ProviderKey)
    const rawMetadata = parseJsonRecord(model.rawMetadata)
    const accessibility = rawMetadata.accessibility && typeof rawMetadata.accessibility === 'object' && !Array.isArray(rawMetadata.accessibility)
      ? rawMetadata.accessibility as Record<string, unknown> : {}
    const serverlessAvailable = typeof accessibility.serverlessAvailable === 'boolean' ? accessibility.serverlessAvailable : null
    const dedicatedEndpointConfigured = model.provider === 'together'
      && configuredBaseUrl.length > 0
      && configuredBaseUrl.replace(/\/$/, '') !== defaultBaseUrl.replace(/\/$/, '')
    const accountAccess = String(record.accountAccess ?? 'unknown').toLowerCase()
    const modelAccountAccessible = model.provider === 'together'
      ? record.accountAccess === undefined || accountAccess === 'accessible'
      || (accessibility.dedicatedEndpointRequired === true && dedicatedEndpointConfigured)
      : accountAccess !== 'inaccessible'
    const endpointReady = evidence.endpointReadyByProvider?.[model.provider as ProviderKey]
      ?? isHttpEndpoint(configuredBaseUrl || defaultBaseUrl)
    const databaseReady = evidence.databaseReady === true
    const queueReady = executorRegistration?.executionMode === 'stream' || executorRegistration?.executionMode === 'sync'
      ? true
      : evidence.queueReady === true
    // Infrastructure is service and credential truth. Executor/contract/model
    // compatibility are independent gates and must not masquerade as an
    // infrastructure outage.
    const infrastructureReady = databaseReady
      && queueReady
      && providerConfigured
      && providerEnabled
      && providerHealthReady
      && providerAccountAllowed
      && providerPolicyAllowed
      && endpointReady
    const modelLifecycleAllowed = model.status !== 'blocked' && model.status !== 'retired'
    const liveProven = evidence.liveProvenRoutes?.has(`${model.provider}/${model.modelId}/${capability}`) === true

    candidates.push({
      provider: model.provider as ProviderKey,
      model: model.modelId,
      displayName: model.displayName ?? model.modelId,
      capability,
      executorId: executorRegistration?.id ?? null,
      routeType: nativeRegistration ? 'native_specialist' : fallbackRegistration ? 'text_transform_fallback' : undefined,
      providerConfigured,
      providerEnabled,
      providerHealth,
      providerHealthReady,
      providerAccountAllowed,
      providerPolicyAllowed,
      modelLifecycleAllowed,
      modelAccountAccessible,
      serverlessAvailable,
      dedicatedEndpointConfigured,
      adapterSupported,
      executorSupported,
      requestShapeKnown,
      responseShapeKnown,
      endpointReady,
      databaseReady,
      queueReady,
      modelCompatible,
      infrastructureReady,
      executionReady: adapterSupported
        && executorSupported
        && modelLifecycleAllowed
        && modelAccountAccessible
        && requestShapeKnown
        && responseShapeKnown
        && modelCompatible
        && infrastructureReady,
      liveProven,
      estimatedCost: model.estimatedUnitCost ?? null,
      costTier: model.costTier ?? 'medium',
      qualityTier: model.qualityTier ?? stringValue(parseJsonRecord(model.rawMetadata).qualityTier) ?? 'balanced',
      latencyTier: model.latencyTier ?? 'medium',
      pricingConfidence: model.pricingConfidence ?? 'unknown',
      score: 0,
      scoreBreakdown: {},
      blockers: [],
    })
  }

  return candidates
}

/**
 * Projects persisted ModelRegistryEntry rows into the model shape consumed by
 * runtime truth. Orchestra and dashboard truth therefore use the same stored
 * discovery facts and the same compatibility metadata parser.
 */
export function normalizeDbModelRecords(models: DbModelRecord[]): ModelRecord[] {
  return models.flatMap((model) => {
    if (!(PROVIDER_KEYS as readonly string[]).includes(model.provider)) return []
    const capabilities = parseCapabilityList(model.capabilitiesJson)
    const metadata = executorModelMetadataFromDbRecord(model, capabilities)
    const record = model as Record<string, unknown>
    const availability = String(record.currentAvailability ?? 'defined')
    const accountAccess = String(record.accountAccess ?? 'unknown')
    const deprecated = record.deprecated === true
    const enabled = record.enabled !== false
    const status: ModelRecord['status'] = deprecated
      || (model.provider === 'together' ? accountAccess !== 'accessible' : accountAccess === 'inaccessible')
      || ['blocked', 'unavailable', 'retired', 'account_inaccessible', 'model_not_available', 'dedicated_endpoint_required', 'account_access_unknown'].includes(availability)
      ? 'blocked'
      : enabled ? 'available' : 'disabled'
    const source = record.isLiveDiscovered === true
      ? 'live_endpoint'
      : String(record.source ?? '').includes('static') ? 'static_verified' : 'manual_seed'
    const quality = String(model.qualityTier ?? 'balanced')
    const qualityTier: QualityTier = quality === 'premium' || quality === 'budget' || quality === 'experimental' ? quality : 'balanced'
    const latency = String(model.latencyTier ?? 'medium')
    const latencyTier: ModelLatencyTier = ['ultra_low', 'low', 'medium', 'high'].includes(latency) ? latency as ModelLatencyTier : 'medium'
    const cost = String(model.costTier ?? 'medium')
    const costTier: ModelCostTier = ['free', 'very_low', 'low', 'medium', 'high', 'premium'].includes(cost) ? cost as ModelCostTier : 'medium'
    const outputModalities = metadata.modalitiesOut ?? []
    return [{
      provider: model.provider as ProviderKey,
      modelId: model.modelId,
      displayName: model.displayName ?? model.modelId,
      discoverySource: source,
      source,
      docsKnown: record.isLiveDiscovered !== true,
      liveDiscovered: record.isLiveDiscovered === true,
      discoveredModel: true,
      category: metadata.category ?? model.category ?? 'contract-unknown',
      providerCategory: model.providerRawCategory ?? metadata.taskType ?? '',
      modalitiesIn: [...(metadata.modalitiesIn ?? [])],
      modalitiesOut: [...outputModalities],
      transportProfile: metadata.transportProfile ?? '',
      endpointFamily: metadata.endpointFamily ?? '',
      capabilities,
      status,
      qualityTier,
      latencyTier,
      costTier,
      supportsArtifacts: outputModalities.some((value) => ['image', 'video', 'audio', 'document'].includes(value)),
      supportsStreaming: metadata.streamingSupported === true,
      supportsBatch: false,
      executable: false,
      notes: String(record.notes ?? ''),
      endpointShapeKnown: metadata.endpointShapeKnown,
      requestShapeKnown: metadata.requestShapeKnown,
      responseShapeKnown: metadata.responseShapeKnown,
      providerClientExists: metadata.providerClientExists,
      workerExecutorExists: metadata.workerExecutorExists,
      executableNow: false,
      blockedReason: deprecated ? 'deprecated' : availability === 'account_inaccessible' ? 'account_inaccessible' : '',
      rawMetadata: parseJsonRecord(model.rawMetadata),
    }]
  })
}

export function executorModelMetadataFromDbRecord(
  model: DbModelRecord,
  parsedCapabilities: CapabilityKey[] = parseCapabilityList(model.capabilitiesJson),
): ExecutorModelMetadata {
  const raw = parseJsonRecord(model.rawMetadata)
  const compatibility = isRecord(raw.compatibility) ? raw.compatibility : raw
  const canonical = (PROVIDER_KEYS as readonly string[]).includes(model.provider)
    ? getModelRecord(model.provider as ProviderKey, model.modelId)
    : undefined
  return {
    category: stringValue(compatibility.category) ?? canonical?.category ?? model.providerRawCategory ?? model.category ?? model.providerRawType,
    taskType: stringValue(compatibility.taskType) ?? stringValue(compatibility.providerTaskType) ?? model.taskType ?? model.providerRawCategory ?? model.providerRawType ?? model.category,
    capabilities: stringArray(compatibility.capabilities).length > 0
      ? stringArray(compatibility.capabilities)
      : parsedCapabilities.length > 0 ? parsedCapabilities : canonical?.capabilities,
    modalitiesIn: stringArray(compatibility.modalitiesIn).length ? stringArray(compatibility.modalitiesIn) : canonical?.modalitiesIn,
    modalitiesOut: stringArray(compatibility.modalitiesOut).length ? stringArray(compatibility.modalitiesOut) : canonical?.modalitiesOut,
    transportProfile: stringValue(compatibility.transportProfile) ?? stringValue(model.transportProfile) ?? canonical?.transportProfile,
    endpointFamily: stringValue(compatibility.endpointFamily) ?? stringValue(model.endpointFamily) ?? canonical?.endpointFamily,
    endpointShapeKnown: compatibility.endpointShapeKnown === true || canonical?.endpointShapeKnown === true,
    requestShapeKnown: compatibility.requestShapeKnown === true || canonical?.requestShapeKnown === true,
    responseShapeKnown: compatibility.responseShapeKnown === true || canonical?.responseShapeKnown === true,
    providerClientExists: compatibility.providerClientExists === true || canonical?.providerClientExists === true,
    workerExecutorExists: compatibility.workerExecutorExists === true || canonical?.workerExecutorExists === true,
    streamingSupported: compatibility.streamingSupported === true || canonical?.supportsStreaming === true,
    structuredOutputModes: stringArray(compatibility.structuredOutputModes) as Array<'none' | 'json_object' | 'json_schema'>,
    supportedParameters: stringArray(compatibility.supportedParameters),
    requestContract: stringValue(compatibility.requestContract) ?? stringValue(raw.requestContract),
  }
}

function isHttpEndpoint(value: string): boolean {
  try {
    const url = new URL(value)
    return url.protocol === 'https:' || url.protocol === 'http:'
  } catch {
    return false
  }
}

function parseCapabilityList(value: string | null | undefined): CapabilityKey[] {
  if (!value?.trim()) return []
  try {
    const parsed = JSON.parse(value)
    return Array.isArray(parsed)
      ? parsed.filter((item): item is CapabilityKey => typeof item === 'string' && item in CAPABILITY_FIELD_MAP)
      : []
  } catch {
    return []
  }
}

function parseJsonRecord(value: string | null | undefined): Record<string, unknown> {
  if (!value?.trim()) return {}
  try {
    const parsed = JSON.parse(value)
    return isRecord(parsed) ? parsed : {}
  } catch {
    return {}
  }
}

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === 'object' && value !== null && !Array.isArray(value)
}

function stringArray(value: unknown): string[] {
  return Array.isArray(value) ? value.filter((item): item is string => typeof item === 'string') : []
}

function stringValue(value: unknown): string | null {
  return typeof value === 'string' && value.trim() ? value.trim() : null
}
