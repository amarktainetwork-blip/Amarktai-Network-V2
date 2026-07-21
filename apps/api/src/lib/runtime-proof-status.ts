import type { FastifyInstance } from 'fastify'
import {
  CAPABILITY_KEYS,
  CAPABILITY_CATALOG,
  PROVIDER_KEYS,
  type CapabilityKey,
  type ProviderKey,
  type RuntimeTruth,
  getRuntimeTruth,
} from '@amarktai/core'
import { buildAdminRuntimeTruth } from './admin-runtime-truth.js'

export type RuntimeProofStatus = 'proven' | 'unproven'
export type RuntimeProofLevel =
  | 'live_external_app_job'
  | 'live_external_app_job_with_artifact_download'
  | 'not_proven'

export interface RuntimeProofCapability {
  capability: CapabilityKey
  status: RuntimeProofStatus
  provider: ProviderKey | null
  model?: string
  artifactRequired: boolean
  proofLevel: RuntimeProofLevel
  readyForDashboardExecution: boolean
  description: string
}

export interface RuntimeProofStatusPayload {
  providers: readonly ProviderKey[]
  provenCapabilities: RuntimeProofCapability[]
  unprovenCapabilities: RuntimeProofCapability[]
  evidenceAvailable: boolean
  summary: {
    provenCount: number
    providerCount: number
    lastUpdatedFrom: 'canonical-truth'
    source: 'backend-runtime-proof-status'
  }
}

export function projectProofStatusFromTruth(truth: RuntimeTruth & { evidenceAvailable?: boolean }): RuntimeProofStatusPayload {
  const provenCapabilities: RuntimeProofCapability[] = []
  const unprovenCapabilities: RuntimeProofCapability[] = []
  const evidenceAvailable = truth.evidenceAvailable !== false

  for (const capability of CAPABILITY_KEYS) {
    const capabilityTruth = truth.capabilities.find((c) => c.capability === capability)
    const isProven = capabilityTruth?.liveProven === true
    const capabilityDef = CAPABILITY_CATALOG.find((c) => c.key === capability)
    const releaseReadiness = truth.releaseReadiness?.find((item) => item.capability === capability)

    if (isProven) {
      const eligibleModel = capabilityTruth?.eligibleModels?.find((m) => m.liveProven) ?? capabilityTruth?.eligibleModels?.[0]
      provenCapabilities.push({
        capability,
        status: 'proven',
        provider: eligibleModel?.provider ?? null,
        model: eligibleModel?.modelId,
        artifactRequired: capabilityDef?.artifactRequired === true,
        proofLevel: capabilityDef?.artifactRequired === true
          ? 'live_external_app_job_with_artifact_download'
          : 'live_external_app_job',
        readyForDashboardExecution: releaseReadiness?.readyForDashboardExecution === true,
        description: `Completed ${capability} job with valid runtime proof.`,
      })
    } else {
      unprovenCapabilities.push({
        capability,
        status: 'unproven',
        provider: null,
        artifactRequired: capabilityDef?.artifactRequired === true,
        proofLevel: 'not_proven',
        readyForDashboardExecution: releaseReadiness?.readyForDashboardExecution === true,
        description: releaseReadiness?.readyForDashboardExecution
          ? 'Callable release candidate is ready for dashboard execution; deployed live proof is not yet recorded.'
          : evidenceAvailable
          ? 'No completed live external app runtime proof is recorded for this capability.'
          : 'Runtime evidence unavailable — cannot determine proof status.',
      })
    }
  }

  return {
    providers: PROVIDER_KEYS,
    provenCapabilities,
    unprovenCapabilities,
    evidenceAvailable,
    summary: {
      provenCount: provenCapabilities.length,
      providerCount: PROVIDER_KEYS.length,
      lastUpdatedFrom: 'canonical-truth',
      source: 'backend-runtime-proof-status',
    },
  }
}

export async function getRuntimeProofStatus(app?: FastifyInstance): Promise<RuntimeProofStatusPayload> {
  if (!app) {
    return projectProofStatusFromTruth({ ...getRuntimeTruth(), evidenceAvailable: false })
  }
  const truth = await buildAdminRuntimeTruth(app)
  return projectProofStatusFromTruth(truth)
}
