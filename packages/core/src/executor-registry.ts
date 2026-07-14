import { CAPABILITY_BY_KEY, type CapabilityKey } from './capabilities.js'
import type { ProviderKey } from './providers.js'

export type ExecutorId =
  | 'groq.chat'
  | 'groq.text-transform'
  | 'deepinfra.chat'
  | 'deepinfra.text-transform'
  | 'together.image-generation'
  | 'genx.video-generation'
  | 'genx.music-generation'

export interface ExecutorRegistration {
  id: ExecutorId
  provider: ProviderKey
  capability: CapabilityKey
  handlerName: string
  acceptedRequestContract: string
  outputContract: string
  modelCompatibility: 'catalogue_capability_match'
  sourceArtifactRequired: boolean
  artifactOutput: string | null
  executionMode: 'sync' | 'queued'
}

const GROQ_TEXT_CAPABILITIES: readonly CapabilityKey[] = [
  'reasoning',
  'code',
  'summarization',
  'translation',
  'question_answering',
  'classification',
  'zero_shot_classification',
  'extraction',
  'token_classification',
  'fill_mask',
  'feature_extraction',
  'sentence_similarity',
  'table_qa',
  'structured_output',
]

function registration(
  id: ExecutorId,
  provider: ProviderKey,
  capability: CapabilityKey,
  handlerName: string,
  executionMode: 'sync' | 'queued' = 'queued',
): ExecutorRegistration {
  const definition = CAPABILITY_BY_KEY[capability]
  return {
    id,
    provider,
    capability,
    handlerName,
    acceptedRequestContract: definition.inputContractReference,
    outputContract: definition.outputContractReference,
    modelCompatibility: 'catalogue_capability_match',
    sourceArtifactRequired: definition.requiresSourceArtifact,
    artifactOutput: definition.artifactType,
    executionMode,
  }
}

/**
 * Canonical executable support. Every entry is bound to a callable handler by
 * the worker; capability/provider allowlists are not execution evidence.
 */
export const EXECUTOR_REGISTRATIONS: readonly ExecutorRegistration[] = [
  registration('groq.chat', 'groq', 'chat', 'executeGroqChat'),
  ...GROQ_TEXT_CAPABILITIES.map((capability) =>
    registration('groq.text-transform', 'groq', capability, 'executeGroqTextCapability'),
  ),
  registration('deepinfra.chat', 'deepinfra', 'chat', 'executeDeepInfraTextCapability'),
  ...GROQ_TEXT_CAPABILITIES.map((capability) =>
    registration('deepinfra.text-transform', 'deepinfra', capability, 'executeDeepInfraTextCapability'),
  ),
  registration('together.image-generation', 'together', 'image_generation', 'executeTogetherImage'),
  registration('genx.video-generation', 'genx', 'video_generation', 'executeGenxVideo'),
  registration('genx.music-generation', 'genx', 'music_generation', 'executeGenxMusic'),
] as const

export function getExecutorRegistrations(
  capability?: CapabilityKey,
  provider?: ProviderKey,
): ExecutorRegistration[] {
  return EXECUTOR_REGISTRATIONS.filter((entry) =>
    (!capability || entry.capability === capability)
    && (!provider || entry.provider === provider),
  )
}

export function getExecutorRegistration(
  capability: CapabilityKey,
  provider: ProviderKey,
): ExecutorRegistration | undefined {
  return EXECUTOR_REGISTRATIONS.find((entry) =>
    entry.capability === capability && entry.provider === provider,
  )
}

export function hasExecutorRegistration(capability: CapabilityKey, provider: ProviderKey): boolean {
  return getExecutorRegistration(capability, provider) !== undefined
}
