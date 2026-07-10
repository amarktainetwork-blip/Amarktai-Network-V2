import { PROVIDER_KEYS, type ProviderKey } from './providers.js'
import { type CapabilityKey } from './capabilities.js'
import { MODEL_CATALOGUE, type ModelRecord } from './model-catalog.js'

export const ROUTING_MODES = ['balanced', 'premium', 'fast', 'budget', 'experimental'] as const
export type RoutingMode = (typeof ROUTING_MODES)[number]

export interface BrainRouterProviderState {
  disabled?: boolean
  runtimeRestricted?: boolean
  configured?: boolean
  infrastructureReady?: boolean
  policyAllowed?: boolean
}

export interface BrainRouterRequest {
  capability: CapabilityKey
  routingMode: RoutingMode
  providerStates?: Partial<Record<ProviderKey, BrainRouterProviderState>>
  appSlug?: string
  allowExperimental?: boolean
}

export interface RejectedCandidate {
  provider: ProviderKey
  modelId: string
  displayName: string
  reason: string
}

export interface FallbackEntry {
  provider: ProviderKey
  modelId: string
  displayName: string
}

export interface BrainRouterDecision {
  selectedProvider: ProviderKey | null
  selectedModel: string | null
  routingMode: RoutingMode
  executionAllowed: boolean
  candidateModels: ModelRecord[]
  discoveredCandidates: ModelRecord[]
  docsFallbackCandidates: ModelRecord[]
  liveDiscoveredCandidates: ModelRecord[]
  executableCandidates: ModelRecord[]
  catalogueOnlyCandidates: ModelRecord[]
  blockedCandidates: RejectedCandidate[]
  policyRestrictedCandidates: RejectedCandidate[]
  missingEndpointShapeCandidates: RejectedCandidate[]
  missingRequestShapeCandidates: RejectedCandidate[]
  missingResponseShapeCandidates: RejectedCandidate[]
  missingArtifactPathCandidates: RejectedCandidate[]
  missingExecutorCandidates: RejectedCandidate[]
  providerClientMissingCandidates: RejectedCandidate[]
  modelDiscoverySource: string[]
  transportProfileCandidates: string[]
  upstreamProviderBreakdown: Record<string, number>
  rejectedCandidates: RejectedCandidate[]
  fallbackChain: FallbackEntry[]
  blockReason: string | null
  truth: string
  appFacingProviderOverride: false
  appFacingModelOverride: false
}

const APPROVED_PROVIDER_SET = new Set<ProviderKey>(PROVIDER_KEYS as unknown as ProviderKey[])

const COST_ORDER: Record<string, number> = {
  free: 0,
  very_low: 1,
  low: 2,
  medium: 3,
  high: 4,
  premium: 5,
}

const LATENCY_ORDER: Record<string, number> = {
  ultra_low: 0,
  low: 1,
  medium: 2,
  high: 3,
}

const QUALITY_ORDER: Record<string, number> = {
  budget: 0,
  balanced: 1,
  premium: 2,
  experimental: 3,
}

function isProviderApproved(provider: string): provider is ProviderKey {
  return APPROVED_PROVIDER_SET.has(provider as ProviderKey)
}

function uniqueModels(models: ModelRecord[]): ModelRecord[] {
  return [...new Map(models.map((model) => [`${model.provider}:${model.modelId}`, model])).values()]
}

function addRejection(target: RejectedCandidate[], model: ModelRecord, reason: string): void {
  target.push({ provider: model.provider, modelId: model.modelId, displayName: model.displayName, reason })
}

export function routeBrain(request: BrainRouterRequest): BrainRouterDecision {
  const {
    capability,
    routingMode,
    providerStates,
    allowExperimental = false,
  } = request

  const rejected: RejectedCandidate[] = []
  const eligible: ModelRecord[] = []
  const discoveredCandidates: ModelRecord[] = []
  const docsFallbackCandidates: ModelRecord[] = []
  const liveDiscoveredCandidates: ModelRecord[] = []
  const catalogueOnlyCandidates: ModelRecord[] = []
  const blockedCandidates: RejectedCandidate[] = []
  const policyRestrictedCandidates: RejectedCandidate[] = []
  const missingEndpointShapeCandidates: RejectedCandidate[] = []
  const missingRequestShapeCandidates: RejectedCandidate[] = []
  const missingResponseShapeCandidates: RejectedCandidate[] = []
  const missingArtifactPathCandidates: RejectedCandidate[] = []
  const missingExecutorCandidates: RejectedCandidate[] = []
  const providerClientMissingCandidates: RejectedCandidate[] = []

  for (const model of MODEL_CATALOGUE) {
    const provider = model.provider

    if (!isProviderApproved(provider)) {
      addRejection(rejected, model, 'Provider not in approved list')
      continue
    }

    if (provider === 'mimo' || model.policyRestrictedByApp) {
      const reason = model.policyBlockedReason ? `${model.policyBlockedReason} coding_tools_only` : 'coding_tools_only'
      addRejection(rejected, model, reason)
      addRejection(policyRestrictedCandidates, model, reason)
      if (model.capabilities.includes(capability)) catalogueOnlyCandidates.push(model)
      continue
    }

    if (!model.capabilities.includes(capability)) {
      addRejection(rejected, model, `Model does not support capability '${capability}'`)
      continue
    }

    if (model.discoveredModel || model.source === 'live_endpoint' || model.source === 'live_discovered' || model.source === 'docs_fallback' || model.source === 'static_repo') {
      discoveredCandidates.push(model)
    }
    if (model.docsKnown || model.source === 'docs_fallback' || model.discoverySource === 'docs_fallback') {
      docsFallbackCandidates.push(model)
    }
    if (model.liveDiscovered || model.source === 'live_endpoint' || model.source === 'live_discovered') {
      liveDiscoveredCandidates.push(model)
    }

    const state = providerStates?.[provider]
    if (state?.disabled) {
      addRejection(rejected, model, `Provider '${provider}' is disabled`)
      continue
    }

    if (state?.runtimeRestricted) {
      addRejection(rejected, model, `Provider '${provider}' is runtime_restricted`)
      continue
    }

    if (capability === 'music_generation') {
      if (state?.configured !== true) {
        const reason = `Provider '${provider}' is not configured for music_generation`
        addRejection(rejected, model, reason)
        catalogueOnlyCandidates.push(model)
        continue
      }
      if (state.infrastructureReady === false) {
        const reason = `Provider '${provider}' music_generation infrastructure is not ready`
        addRejection(rejected, model, reason)
        catalogueOnlyCandidates.push(model)
        continue
      }
      if (state.policyAllowed === false) {
        const reason = `Provider '${provider}' policy blocks music_generation`
        addRejection(rejected, model, reason)
        catalogueOnlyCandidates.push(model)
        continue
      }
    }

    if (model.qualityTier === 'experimental' && !allowExperimental && routingMode !== 'experimental') {
      addRejection(rejected, model, 'Experimental model blocked - allowExperimental false and routingMode is not experimental')
      continue
    }

    if (model.status === 'blocked') {
      addRejection(rejected, model, 'Model status is blocked')
      addRejection(blockedCandidates, model, 'Model status is blocked')
      continue
    }

    if (model.endpointShapeKnown === false) {
      addRejection(missingEndpointShapeCandidates, model, 'Endpoint shape missing')
      catalogueOnlyCandidates.push(model)
    }

    if (model.requestShapeKnown === false) {
      addRejection(missingRequestShapeCandidates, model, 'Request shape missing')
      catalogueOnlyCandidates.push(model)
    }

    if (model.responseShapeKnown === false) {
      addRejection(missingResponseShapeCandidates, model, 'Response shape missing')
      catalogueOnlyCandidates.push(model)
    }

    if (model.supportsArtifacts && model.artifactPersistenceExists === false) {
      addRejection(missingArtifactPathCandidates, model, 'Artifact persistence missing')
      catalogueOnlyCandidates.push(model)
    }

    if (model.providerClientExists === false) {
      addRejection(providerClientMissingCandidates, model, 'Provider client missing')
      catalogueOnlyCandidates.push(model)
    }

    if (model.workerExecutorExists === false) {
      addRejection(missingExecutorCandidates, model, 'Worker executor missing')
      catalogueOnlyCandidates.push(model)
    }

    if (!model.executable || model.status !== 'available' || model.executableNow === false) {
      catalogueOnlyCandidates.push(model)
      addRejection(rejected, model, `Model is ${model.status} - not executable`)
      continue
    }

    eligible.push(model)
  }

  let selected: ModelRecord | null = null

  if (eligible.length > 0) {
    switch (routingMode) {
      case 'budget':
        eligible.sort((a, b) => (COST_ORDER[a.costTier] ?? 99) - (COST_ORDER[b.costTier] ?? 99))
        break
      case 'fast':
        eligible.sort((a, b) => (LATENCY_ORDER[a.latencyTier] ?? 99) - (LATENCY_ORDER[b.latencyTier] ?? 99))
        break
      case 'premium':
        eligible.sort((a, b) => (QUALITY_ORDER[b.qualityTier] ?? 0) - (QUALITY_ORDER[a.qualityTier] ?? 0))
        break
      case 'experimental':
        eligible.sort((a, b) => (QUALITY_ORDER[b.qualityTier] ?? 0) - (QUALITY_ORDER[a.qualityTier] ?? 0))
        break
      case 'balanced':
      default:
        eligible.sort((a, b) => {
          const aScore = Math.abs((QUALITY_ORDER[a.qualityTier] ?? 1) - 1) + (COST_ORDER[a.costTier] ?? 3)
          const bScore = Math.abs((QUALITY_ORDER[b.qualityTier] ?? 1) - 1) + (COST_ORDER[b.costTier] ?? 3)
          return aScore - bScore
        })
        break
    }
    selected = eligible[0] ?? null
  }

  const fallbackChain: FallbackEntry[] = eligible
    .filter((m) => m !== selected)
    .map((m) => ({ provider: m.provider, modelId: m.modelId, displayName: m.displayName }))

  const executionAllowed = selected !== null
  const modelDiscoverySource = [...new Set(MODEL_CATALOGUE.map((model) => model.discoverySource ?? model.source ?? (model.executable ? 'static_verified' : model.status === 'blocked' ? 'blocked_policy' : 'manual_planned')))]
  const transportProfileCandidates = [...new Set(discoveredCandidates.map((model) => model.transportProfile).filter((value): value is string => typeof value === 'string' && value.length > 0))]
  const upstreamProviderBreakdown = discoveredCandidates.reduce<Record<string, number>>((acc, model) => {
    const upstream = model.upstreamProvider ?? model.provider
    acc[upstream] = (acc[upstream] ?? 0) + 1
    return acc
  }, {})
  let blockReason: string | null = null
  let truth = ''

  if (selected) {
    truth = `Brain Router v1 selected ${selected.provider}/${selected.modelId} for '${capability}' in '${routingMode}' mode. ${selected.notes}`
  } else {
    blockReason = `No executable model found for capability '${capability}' in '${routingMode}' mode`
    if (rejected.length > 0) {
      const uniqueReasons = [...new Set(rejected.map((r) => r.reason))]
      blockReason += `. Rejection reasons: ${uniqueReasons.join('; ')}`
    }
    truth = `Brain Router v1 blocked: ${blockReason}`
  }

  return {
    selectedProvider: selected?.provider ?? null,
    selectedModel: selected?.modelId ?? null,
    routingMode,
    executionAllowed,
    candidateModels: eligible,
    discoveredCandidates: uniqueModels(discoveredCandidates),
    docsFallbackCandidates: uniqueModels(docsFallbackCandidates),
    liveDiscoveredCandidates: uniqueModels(liveDiscoveredCandidates),
    executableCandidates: eligible,
    catalogueOnlyCandidates: uniqueModels(catalogueOnlyCandidates),
    blockedCandidates,
    policyRestrictedCandidates,
    missingEndpointShapeCandidates,
    missingRequestShapeCandidates,
    missingResponseShapeCandidates,
    missingArtifactPathCandidates,
    missingExecutorCandidates,
    providerClientMissingCandidates,
    modelDiscoverySource,
    transportProfileCandidates,
    upstreamProviderBreakdown,
    rejectedCandidates: rejected,
    fallbackChain,
    blockReason,
    truth,
    appFacingProviderOverride: false,
    appFacingModelOverride: false,
  }
}
