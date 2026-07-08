import {
  CAPABILITY_KEYS,
  PROVIDER_KEYS,
  type CapabilityKey,
  type ProviderKey,
} from '@amarktai/core'

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
  summary: {
    provenCount: number
    providerCount: number
    lastUpdatedFrom: 'runtime-proof-code'
    source: 'backend-runtime-proof-status'
  }
}

const PROVEN_CAPABILITIES: readonly RuntimeProofCapability[] = [
  {
    capability: 'chat',
    status: 'proven',
    provider: 'groq',
    artifactRequired: false,
    proofLevel: 'live_external_app_job',
    readyForDashboardExecution: true,
    description: 'External app job completed through Groq chat runtime.',
  },
  {
    capability: 'image_generation',
    status: 'proven',
    provider: 'together',
    model: 'black-forest-labs/FLUX.1-schnell',
    artifactRequired: true,
    proofLevel: 'live_external_app_job_with_artifact_download',
    readyForDashboardExecution: true,
    description: 'External app job completed through Together image runtime and artifact download returned 200.',
  },
  {
    capability: 'video_generation',
    status: 'proven',
    provider: 'genx',
    model: 'grok-imagine-video',
    artifactRequired: true,
    proofLevel: 'live_external_app_job_with_artifact_download',
    readyForDashboardExecution: true,
    description: 'External app job completed through GenX video runtime and artifact download returned 200.',
  },
]

export function getRuntimeProofStatus(): RuntimeProofStatusPayload {
  const provenKeys = new Set(PROVEN_CAPABILITIES.map((item) => item.capability))
  const unprovenCapabilities = CAPABILITY_KEYS
    .filter((capability) => !provenKeys.has(capability))
    .map((capability): RuntimeProofCapability => ({
      capability,
      status: 'unproven',
      provider: null,
      artifactRequired: false,
      proofLevel: 'not_proven',
      readyForDashboardExecution: false,
      description: 'No completed live external app runtime proof is recorded for this capability.',
    }))

  return {
    providers: PROVIDER_KEYS,
    provenCapabilities: [...PROVEN_CAPABILITIES],
    unprovenCapabilities,
    summary: {
      provenCount: PROVEN_CAPABILITIES.length,
      providerCount: PROVIDER_KEYS.length,
      lastUpdatedFrom: 'runtime-proof-code',
      source: 'backend-runtime-proof-status',
    },
  }
}
