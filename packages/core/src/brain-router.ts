import { PROVIDER_KEYS, type ProviderKey } from './providers.js'
import { type CapabilityKey } from './capabilities.js'
import { MODEL_CATALOGUE, type ModelRecord } from './model-catalog.js'

export const ROUTING_MODES = ['balanced', 'premium', 'fast', 'budget', 'experimental'] as const
export type RoutingMode = (typeof ROUTING_MODES)[number]

export interface BrainRouterProviderState {
  disabled?: boolean
  runtimeRestricted?: boolean
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
  executableCandidates: ModelRecord[]
  catalogueOnlyCandidates: ModelRecord[]
  blockedCandidates: RejectedCandidate[]
  missingExecutorCandidates: RejectedCandidate[]
  providerClientMissingCandidates: RejectedCandidate[]
  modelDiscoverySource: string[]
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

function isMimoRuntime(provider: ProviderKey): boolean {
  return provider === 'mimo'
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
  const catalogueOnlyCandidates: ModelRecord[] = []
  const blockedCandidates: RejectedCandidate[] = []
  const missingExecutorCandidates: RejectedCandidate[] = []
  const providerClientMissingCandidates: RejectedCandidate[] = []

  for (const model of MODEL_CATALOGUE) {
    const provider = model.provider

    if (!isProviderApproved(provider)) {
      rejected.push({ provider, modelId: model.modelId, displayName: model.displayName, reason: 'Provider not in approved list' })
      continue
    }

    const state = providerStates?.[provider]
    if (state?.disabled) {
      rejected.push({ provider, modelId: model.modelId, displayName: model.displayName, reason: `Provider '${provider}' is disabled` })
      continue
    }

    if (state?.runtimeRestricted) {
      rejected.push({ provider, modelId: model.modelId, displayName: model.displayName, reason: `Provider '${provider}' is runtime_restricted` })
      continue
    }

    if (isMimoRuntime(provider)) {
      rejected.push({ provider, modelId: model.modelId, displayName: model.displayName, reason: 'MiMo is coding_tools_only — never selected for runtime' })
      continue
    }

    if (!model.capabilities.includes(capability)) {
      rejected.push({ provider, modelId: model.modelId, displayName: model.displayName, reason: `Model does not support capability '${capability}'` })
      continue
    }

    if (model.discoveredModel || model.source === 'live_discovered' || model.source === 'static_repo') {
      discoveredCandidates.push(model)
    }

    if (model.qualityTier === 'experimental' && !allowExperimental && routingMode !== 'experimental') {
      rejected.push({ provider, modelId: model.modelId, displayName: model.displayName, reason: 'Experimental model blocked — allowExperimental false and routingMode is not experimental' })
      continue
    }

    if (model.status === 'blocked') {
      rejected.push({ provider, modelId: model.modelId, displayName: model.displayName, reason: 'Model status is blocked' })
      blockedCandidates.push({ provider, modelId: model.modelId, displayName: model.displayName, reason: 'Model status is blocked' })
      continue
    }

    if (model.providerClientExists === false) {
      providerClientMissingCandidates.push({ provider, modelId: model.modelId, displayName: model.displayName, reason: 'Provider client missing' })
      catalogueOnlyCandidates.push(model)
    }

    if (model.workerExecutorExists === false) {
      missingExecutorCandidates.push({ provider, modelId: model.modelId, displayName: model.displayName, reason: 'Worker executor missing' })
      catalogueOnlyCandidates.push(model)
    }

    if (!model.executable || model.status !== 'available') {
      catalogueOnlyCandidates.push(model)
      rejected.push({ provider, modelId: model.modelId, displayName: model.displayName, reason: `Model is ${model.status} — not executable` })
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
  const modelDiscoverySource = [...new Set(MODEL_CATALOGUE.map((model) => model.source ?? (model.executable ? 'static_verified' : model.status === 'blocked' ? 'blocked_policy' : 'manual_planned')))]
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
    discoveredCandidates,
    executableCandidates: eligible,
    catalogueOnlyCandidates: [...new Map(catalogueOnlyCandidates.map((model) => [`${model.provider}:${model.modelId}`, model])).values()],
    blockedCandidates,
    missingExecutorCandidates,
    providerClientMissingCandidates,
    modelDiscoverySource,
    rejectedCandidates: rejected,
    fallbackChain,
    blockReason,
    truth,
    appFacingProviderOverride: false,
    appFacingModelOverride: false,
  }
}
