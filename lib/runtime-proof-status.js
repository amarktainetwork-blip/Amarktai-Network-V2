import { FINAL_PROVIDER_IDS } from './provider-settings-contract.js'

export const RUNTIME_PROOF_SOURCE = 'backend-runtime-proof-status'

export const EMPTY_RUNTIME_PROOF_STATUS = {
  providers: FINAL_PROVIDER_IDS,
  provenCapabilities: [],
  unprovenCapabilities: [],
  summary: {
    provenCount: 0,
    providerCount: FINAL_PROVIDER_IDS.length,
    lastUpdatedFrom: 'runtime-proof-code',
    source: RUNTIME_PROOF_SOURCE,
  },
}

function normalizeCapabilityProof(item = {}) {
  return {
    capability: item.capability ?? '',
    status: item.status === 'proven' ? 'proven' : 'unproven',
    provider: item.provider ?? null,
    model: item.model ?? '',
    artifactRequired: item.artifactRequired === true,
    proofLevel: item.proofLevel ?? 'not_proven',
    readyForDashboardExecution: item.readyForDashboardExecution === true,
    description: item.description ?? '',
  }
}

export function normalizeRuntimeProofStatus(payload = {}) {
  const providers = Array.isArray(payload.providers)
    ? payload.providers.filter((provider) => FINAL_PROVIDER_IDS.includes(provider))
    : FINAL_PROVIDER_IDS
  const provenCapabilities = Array.isArray(payload.provenCapabilities)
    ? payload.provenCapabilities.map(normalizeCapabilityProof)
    : []
  const unprovenCapabilities = Array.isArray(payload.unprovenCapabilities)
    ? payload.unprovenCapabilities.map(normalizeCapabilityProof)
    : []
  const summary = payload.summary ?? {}

  return {
    providers,
    provenCapabilities,
    unprovenCapabilities,
    summary: {
      provenCount: Number.isFinite(summary.provenCount) ? summary.provenCount : provenCapabilities.length,
      providerCount: Number.isFinite(summary.providerCount) ? summary.providerCount : providers.length,
      lastUpdatedFrom: summary.lastUpdatedFrom ?? 'runtime-proof-code',
      source: summary.source ?? RUNTIME_PROOF_SOURCE,
    },
  }
}

export function getRuntimeCapabilityProof(runtimeProofStatus, capability) {
  const normalized = normalizeRuntimeProofStatus(runtimeProofStatus)
  return normalized.provenCapabilities.find((item) => item.capability === capability)
    ?? normalized.unprovenCapabilities.find((item) => item.capability === capability)
    ?? {
      capability,
      status: 'unproven',
      provider: null,
      model: '',
      artifactRequired: false,
      proofLevel: 'not_proven',
      readyForDashboardExecution: false,
      description: 'No completed live external app runtime proof is recorded for this capability.',
    }
}

export function isRuntimeCapabilityReady(runtimeProofStatus, capability) {
  return getRuntimeCapabilityProof(runtimeProofStatus, capability).readyForDashboardExecution === true
}

export function getRuntimeProofProviderState(runtimeProofStatus, providerKey) {
  const normalized = normalizeRuntimeProofStatus(runtimeProofStatus)
  const isApproved = normalized.providers.includes(providerKey)
  const proven = normalized.provenCapabilities.filter((item) => item.provider === providerKey)

  return {
    providerKey,
    approved: isApproved,
    provenCapabilities: proven,
    status: proven.length > 0 ? 'proven' : 'unproven',
  }
}

export function runtimeProofStatusLabel(proof) {
  if (proof?.readyForDashboardExecution === true) return 'Backend ready'
  return 'Not proven'
}

export function runtimeProofStatusClasses(proof) {
  if (proof?.readyForDashboardExecution === true) return 'border-emerald-500/30 text-emerald-300'
  return 'border-amber-500/30 text-amber-300'
}
