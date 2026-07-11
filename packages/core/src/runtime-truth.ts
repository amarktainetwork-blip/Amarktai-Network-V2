import { CAPABILITY_CATALOG, CAPABILITY_KEYS, type CapabilityKey } from './capabilities.js'
import { MODEL_CATALOGUE, type ModelRecord } from './model-catalog.js'
import { PROVIDER_KEYS, type ProviderKey } from './providers.js'
import { routeBrain, type BrainRouterProviderState, type RoutingMode } from './brain-router.js'
import { getMusicCapabilityStatus } from './music-generation.js'

export const RUNTIME_EXECUTION_PROVIDERS = ['genx', 'groq', 'together', 'deepinfra'] as const
export type RuntimeExecutionProvider = (typeof RUNTIME_EXECUTION_PROVIDERS)[number]

export const CODING_ONLY_PROVIDERS = ['mimo'] as const

export const CAPABILITY_RUNTIME_CLASSIFICATIONS = [
  'LIVE_PROVEN',
  'EXECUTABLE_NOT_LIVE_PROVEN',
  'IMPLEMENTED_NOT_CONFIGURED',
  'PARTIAL',
  'CATALOGUE_ONLY',
  'POLICY_RESTRICTED',
  'BLOCKED',
  'MISSING',
] as const

export type CapabilityRuntimeClassification = (typeof CAPABILITY_RUNTIME_CLASSIFICATIONS)[number]

export interface ProviderRuntimeStateInput {
  enabled?: boolean
  runtimeEnabled?: boolean
  configured?: boolean
  source?: string
  healthStatus?: string
  healthMessage?: string
  lastCheckedAt?: string | Date | null
  defaultModel?: string
  fallbackModel?: string
  credentialUsagePolicy?: string
}

export interface CapabilityRuntimeStateInput {
  configured?: boolean
  infrastructureReady?: boolean
  policyAllowed?: boolean
  liveProven?: boolean
  lastProofAt?: string | Date | null
  routeImplemented?: boolean
  queuePathImplemented?: boolean
  artifactPathImplemented?: boolean
}

export interface RuntimeTruthInput {
  providers?: Partial<Record<ProviderKey, ProviderRuntimeStateInput>>
  capabilities?: Partial<Record<CapabilityKey, CapabilityRuntimeStateInput>>
  routingMode?: RoutingMode
  generatedAt?: string
}

export interface ProviderRuntimeTruth {
  provider: ProviderKey
  known: true
  runtimeExecutionProvider: boolean
  codingOnly: boolean
  enabled: boolean
  runtimeEnabled: boolean
  credentialConfigured: boolean
  configured: boolean
  source: string
  healthStatus: string
  healthMessage: string
  lastCheckedAt: string | null
  defaultModel: string
  fallbackModel: string
  credentialUsagePolicy: string
  supportedCapabilities: CapabilityKey[]
  discoveredModelCount: number
  eligibleModelCount: number
  liveProvenCapabilities: CapabilityKey[]
  blockers: string[]
  policyRestrictions: string[]
}

export interface CapabilityRuntimeTruth {
  capability: CapabilityKey
  classification: CapabilityRuntimeClassification
  catalogueKnown: boolean
  discoveredModels: string[]
  discoveredModelCount: number
  clientImplemented: boolean
  executorRegistered: boolean
  routeImplemented: boolean
  queuePathImplemented: boolean
  artifactPathImplemented: boolean
  implementationReady: boolean
  configured: boolean
  infrastructureReady: boolean
  policyAllowed: boolean
  executableNow: boolean
  liveProven: boolean
  lastProofAt: string | null
  eligibleProviders: ProviderKey[]
  eligibleModels: Array<{
    provider: ProviderKey
    modelId: string
    displayName: string
    preferred: boolean
    fallback: boolean
    liveProven: boolean
  }>
  blockedReasons: string[]
  remainingWork: string[]
  plannerReady?: boolean
  durableParentReady?: boolean
  durablePlanReady?: boolean
  sceneLinkageReady?: boolean
  sceneSubmissionReady?: boolean
  sceneExecutionReady?: boolean
  retryResumeReady?: boolean
  progressTrackingReady?: boolean
  batchStructureReady?: boolean
  assemblyHandoffReady?: boolean
  videoOnlyAssemblyReady?: boolean
  voiceoverReady?: boolean
  subtitlesReady?: boolean
  musicBedReady?: boolean
  fullMultimediaReady?: boolean
}

export interface RuntimeTruth {
  generatedAt: string
  providerPolicy: {
    runtimeExecutionProviders: readonly RuntimeExecutionProvider[]
    codingOnlyProviders: readonly ProviderKey[]
    qwenRuntimeEligible: false
  }
  providers: ProviderRuntimeTruth[]
  capabilities: CapabilityRuntimeTruth[]
  countsByClassification: Record<CapabilityRuntimeClassification, number>
}

const TEXT_ROUTER_CAPABILITIES = new Set<CapabilityKey>([
  'chat',
  'reasoning',
  'code',
  'summarization',
  'translation',
  'classification',
  'extraction',
  'structured_output',
])

const MEDIA_WORKER_CAPABILITIES = new Set<CapabilityKey>([
  'image_generation',
  'video_generation',
  'music_generation',
])

const PARTIAL_SOURCE_CAPABILITIES = new Set<CapabilityKey>([
  'long_form_video',
  'tts',
  'stt',
  'embeddings',
  'research',
  'rag_ingest',
  'rag_search',
])

const ADULT_CAPABILITIES = new Set<CapabilityKey>([
  'adult_text',
  'adult_image',
  'adult_voice',
  'adult_avatar',
  'adult_video',
])

const ARTIFACT_CAPABILITIES = new Set<CapabilityKey>(
  CAPABILITY_CATALOG.filter((capability) => capability.artifactRequired).map((capability) => capability.key),
)

const ROUTE_IMPLEMENTED_CAPABILITIES = new Set<CapabilityKey>([
  ...TEXT_ROUTER_CAPABILITIES,
  ...MEDIA_WORKER_CAPABILITIES,
  'long_form_video',
])

const QUEUE_CAPABILITIES = new Set<CapabilityKey>([
  ...MEDIA_WORKER_CAPABILITIES,
  'long_form_video',
])

const ARTIFACT_PATH_CAPABILITIES = new Set<CapabilityKey>([
  'image_generation',
  'video_generation',
  'music_generation',
  'long_form_video',
])

function toIso(value: string | Date | null | undefined): string | null {
  if (!value) return null
  return value instanceof Date ? value.toISOString() : value
}

function isRuntimeProvider(provider: ProviderKey): provider is RuntimeExecutionProvider {
  return (RUNTIME_EXECUTION_PROVIDERS as readonly string[]).includes(provider)
}

function isModelSourceCompatible(model: ModelRecord): boolean {
  return model.status !== 'blocked'
    && model.policyRestrictedByApp !== true
    && model.endpointShapeKnown !== false
    && model.requestShapeKnown !== false
    && model.responseShapeKnown !== false
    && model.providerClientExists !== false
    && model.workerExecutorExists !== false
    && (!model.supportsArtifacts || model.artifactPersistenceExists !== false)
}

function modelIds(models: readonly ModelRecord[]): string[] {
  return [...new Set(models.map((model) => `${model.provider}/${model.modelId}`))]
}

function uniqueProviders(models: readonly ModelRecord[]): ProviderKey[] {
  return [...new Set(models.map((model) => model.provider))]
}

function defaultCapabilityRuntime(capability: CapabilityKey): CapabilityRuntimeStateInput {
  return {
    configured: undefined,
    infrastructureReady: false,
    policyAllowed: !ADULT_CAPABILITIES.has(capability),
    liveProven: false,
    lastProofAt: null,
    routeImplemented: undefined,
    queuePathImplemented: undefined,
    artifactPathImplemented: undefined,
  }
}

function providerStateForRouter(providers: ProviderRuntimeTruth[]): Partial<Record<ProviderKey, BrainRouterProviderState>> {
  return Object.fromEntries(providers.map((provider) => [
    provider.provider,
    {
      disabled: !provider.enabled,
      runtimeRestricted: !provider.runtimeExecutionProvider || !provider.runtimeEnabled || provider.codingOnly,
      configured: provider.configured,
      infrastructureReady: true,
      policyAllowed: provider.runtimeExecutionProvider && !provider.codingOnly,
    },
  ])) as Partial<Record<ProviderKey, BrainRouterProviderState>>
}

function classifyCapability(truth: Omit<CapabilityRuntimeTruth, 'classification'>): CapabilityRuntimeClassification {
  if (!truth.catalogueKnown && truth.blockedReasons.includes('capability_not_registered')) return 'MISSING'
  if (!truth.policyAllowed) return 'POLICY_RESTRICTED'
  if (truth.liveProven) return 'LIVE_PROVEN'
  if (truth.executableNow) return 'EXECUTABLE_NOT_LIVE_PROVEN'
  if (truth.implementationReady && !truth.configured) return 'IMPLEMENTED_NOT_CONFIGURED'
  if (truth.implementationReady && truth.configured && !truth.infrastructureReady) return 'BLOCKED'
  if (truth.clientImplemented || truth.executorRegistered || truth.routeImplemented) return 'PARTIAL'
  if (truth.catalogueKnown) return 'CATALOGUE_ONLY'
  return 'MISSING'
}

export function getProviderRuntimeTruth(input: RuntimeTruthInput = {}): ProviderRuntimeTruth[] {
  return PROVIDER_KEYS.map((provider) => {
    const state = input.providers?.[provider]
    const providerModels = MODEL_CATALOGUE.filter((model) => model.provider === provider)
    const runtimeExecutionProvider = isRuntimeProvider(provider)
    const codingOnly = provider === 'mimo'
    const enabled = codingOnly ? false : state?.enabled === true
    const runtimeEnabled = runtimeExecutionProvider && !codingOnly && state?.runtimeEnabled !== false && enabled
    const credentialConfigured = state?.configured === true
    const configured = runtimeEnabled && credentialConfigured
    const supportedCapabilities = [...new Set(providerModels.flatMap((model) => model.capabilities))]
    const eligibleModelCount = providerModels.filter((model) => runtimeExecutionProvider && !codingOnly && isModelSourceCompatible(model)).length
    const blockers: string[] = []
    const policyRestrictions: string[] = []

    if (!runtimeExecutionProvider) policyRestrictions.push('not_runtime_execution_provider')
    if (codingOnly) policyRestrictions.push('coding_tools_only_not_backend_runtime')
    if (!enabled && !codingOnly) blockers.push('provider_not_enabled')
    if (!credentialConfigured) blockers.push('credentials_missing')
    if (state?.healthStatus === 'failed') blockers.push('provider_health_failed')
    if (state?.healthStatus === 'runtime_restricted') policyRestrictions.push('runtime_restricted')

    return {
      provider,
      known: true,
      runtimeExecutionProvider,
      codingOnly,
      enabled,
      runtimeEnabled,
      credentialConfigured,
      configured,
      source: state?.source ?? 'missing',
      healthStatus: state?.healthStatus ?? (credentialConfigured ? 'configured' : 'unconfigured'),
      healthMessage: state?.healthMessage ?? '',
      lastCheckedAt: toIso(state?.lastCheckedAt),
      defaultModel: state?.defaultModel ?? '',
      fallbackModel: state?.fallbackModel ?? '',
      credentialUsagePolicy: codingOnly ? 'coding_tools_only' : state?.credentialUsagePolicy ?? 'backend_runtime_allowed',
      supportedCapabilities,
      discoveredModelCount: providerModels.filter((model) => model.discoveredModel || model.docsKnown || model.liveDiscovered).length,
      eligibleModelCount,
      liveProvenCapabilities: [],
      blockers,
      policyRestrictions,
    }
  })
}

export function getCapabilityRuntimeTruth(input: RuntimeTruthInput = {}): CapabilityRuntimeTruth[] {
  const providers = getProviderRuntimeTruth(input)
  const providerMap = new Map(providers.map((provider) => [provider.provider, provider]))
  const routerStates = providerStateForRouter(providers)

  return CAPABILITY_KEYS.map((capability) => {
    const runtime = { ...defaultCapabilityRuntime(capability), ...input.capabilities?.[capability] }
    const capabilityDef = CAPABILITY_CATALOG.find((entry) => entry.key === capability)
    const candidates = MODEL_CATALOGUE.filter((model) => model.capabilities.includes(capability))
    const sourceCompatible = candidates.filter((model) => isRuntimeProvider(model.provider) && isModelSourceCompatible(model))
    const eligibleByImplementation = sourceCompatible.filter((model) => {
      if (TEXT_ROUTER_CAPABILITIES.has(capability)) return model.provider === 'groq' || model.provider === 'deepinfra'
      if (capability === 'image_generation') return model.provider === 'together'
      if (capability === 'video_generation') return model.provider === 'genx'
      if (capability === 'music_generation') return model.provider === 'genx'
      return false
    })

    const catalogueKnown = candidates.length > 0
    const clientImplemented = TEXT_ROUTER_CAPABILITIES.has(capability)
      || MEDIA_WORKER_CAPABILITIES.has(capability)
      || eligibleByImplementation.some((model) => model.providerClientExists === true || model.executable === true)
    const executorRegistered = TEXT_ROUTER_CAPABILITIES.has(capability)
      || MEDIA_WORKER_CAPABILITIES.has(capability)
    const routeImplemented = runtime.routeImplemented ?? ROUTE_IMPLEMENTED_CAPABILITIES.has(capability)
    const queueRequired = QUEUE_CAPABILITIES.has(capability)
    const queuePathImplemented = runtime.queuePathImplemented ?? (!queueRequired || MEDIA_WORKER_CAPABILITIES.has(capability) || capability === 'long_form_video')
    const artifactRequired = capabilityDef?.artifactRequired === true || ARTIFACT_CAPABILITIES.has(capability)
    const artifactPathImplemented = runtime.artifactPathImplemented ?? (!artifactRequired || ARTIFACT_PATH_CAPABILITIES.has(capability))
    const eligibleProviders = uniqueProviders(eligibleByImplementation)
    const configured = runtime.configured ?? eligibleProviders.some((provider) => providerMap.get(provider)?.configured === true)
    const policyAllowed = runtime.policyAllowed ?? !ADULT_CAPABILITIES.has(capability)
    const infrastructureReady = runtime.infrastructureReady === true
    const implementationReady = clientImplemented
      && executorRegistered
      && routeImplemented
      && queuePathImplemented
      && artifactPathImplemented
      && eligibleByImplementation.length > 0
    const executableNow = implementationReady && configured && infrastructureReady && policyAllowed && eligibleProviders.length > 0
    const liveProven = runtime.liveProven === true
    const lastProofAt = toIso(runtime.lastProofAt)
    const routerDecision = routeBrain({
      capability,
      routingMode: input.routingMode ?? 'balanced',
      providerStates: routerStates,
    })
    const preferredProvider = routerDecision.selectedProvider
    const preferredModel = routerDecision.selectedModel

    const eligibleModels = eligibleByImplementation.map((model, index) => ({
      provider: model.provider,
      modelId: model.modelId,
      displayName: model.displayName,
      preferred: model.provider === preferredProvider && model.modelId === preferredModel,
      fallback: index > 0,
      liveProven: liveProven && model.provider === preferredProvider && model.modelId === preferredModel,
    }))

    const blockedReasons: string[] = []
    if (!capabilityDef) blockedReasons.push('capability_not_registered')
    if (!catalogueKnown) blockedReasons.push('no_compatible_discovered_model')
    if (!clientImplemented) blockedReasons.push('provider_client_missing')
    if (!executorRegistered) blockedReasons.push('executor_missing')
    if (!routeImplemented) blockedReasons.push('route_missing')
    if (queueRequired && !queuePathImplemented) blockedReasons.push('queue_path_missing')
    if (artifactRequired && !artifactPathImplemented) blockedReasons.push('artifact_support_missing')
    if (eligibleByImplementation.length === 0 && catalogueKnown) blockedReasons.push('no_executable_provider_model_path')
    if (!configured) blockedReasons.push('credentials_missing')
    if (!infrastructureReady) blockedReasons.push('infrastructure_missing')
    if (!policyAllowed) blockedReasons.push('provider_policy_restriction')
    if (executableNow && !liveProven) blockedReasons.push('live_proof_missing')
    if (PARTIAL_SOURCE_CAPABILITIES.has(capability) && !implementationReady) blockedReasons.push('partial_implementation')

    // Orchestrated capabilities: add component-level missing reasons
    if (capability === 'long_form_video') {
      blockedReasons.push('voiceover_missing', 'subtitles_missing', 'music_bed_missing', 'full_multimedia_not_ready')
    }

    const truthBase: Omit<CapabilityRuntimeTruth, 'classification'> = {
      capability,
      catalogueKnown,
      discoveredModels: modelIds(candidates),
      discoveredModelCount: candidates.length,
      clientImplemented,
      executorRegistered,
      routeImplemented,
      queuePathImplemented,
      artifactPathImplemented,
      implementationReady,
      configured,
      infrastructureReady,
      policyAllowed,
      executableNow,
      liveProven,
      lastProofAt,
      eligibleProviders,
      eligibleModels,
      blockedReasons: [...new Set(blockedReasons)],
      remainingWork: [...new Set(blockedReasons.filter((reason) => reason !== 'live_proof_missing'))],
    }

    const withClassification: CapabilityRuntimeTruth = {
      ...truthBase,
      classification: classifyCapability(truthBase),
    }

    if (capability === 'music_generation') {
      const music = getMusicCapabilityStatus({
        configured: withClassification.configured,
        infrastructureReady: withClassification.infrastructureReady,
        policyAllowed: withClassification.policyAllowed,
        liveProven: withClassification.liveProven,
        lastProofAt: withClassification.lastProofAt,
      })
      return {
        ...withClassification,
        catalogueKnown: music.catalogueKnown,
        clientImplemented: music.clientImplemented,
        executorRegistered: music.executorRegistered,
        routeImplemented: music.routeImplemented,
        queuePathImplemented: music.queuePathImplemented,
        artifactPathImplemented: music.artifactPathImplemented,
        implementationReady: music.implementationReady,
        executableNow: music.executableNow,
        blockedReasons: music.blockedReasons.length > 0 ? music.blockedReasons : withClassification.blockedReasons,
        remainingWork: music.blockedReasons,
        classification: classifyCapability({
          ...withClassification,
          catalogueKnown: music.catalogueKnown,
          clientImplemented: music.clientImplemented,
          executorRegistered: music.executorRegistered,
          routeImplemented: music.routeImplemented,
          queuePathImplemented: music.queuePathImplemented,
          artifactPathImplemented: music.artifactPathImplemented,
          implementationReady: music.implementationReady,
          executableNow: music.executableNow,
          blockedReasons: music.blockedReasons,
          remainingWork: music.blockedReasons,
        }),
      }
    }

    if (capability === 'long_form_video') {
      const longFormTruth: CapabilityRuntimeTruth = {
        ...withClassification,
        plannerReady: true,
        durableParentReady: true,
        durablePlanReady: true,
        sceneLinkageReady: true,
        sceneSubmissionReady: true,
        sceneExecutionReady: true,
        retryResumeReady: true,
        progressTrackingReady: true,
        batchStructureReady: true,
        assemblyHandoffReady: true,
        videoOnlyAssemblyReady: true,
        voiceoverReady: false,
        subtitlesReady: false,
        musicBedReady: false,
        fullMultimediaReady: false,
        liveProven: false,
        executableNow: false,
        blockedReasons: [...new Set([
          ...withClassification.blockedReasons,
          'voiceover_missing',
          'subtitles_missing',
          'music_bed_missing',
          'full_multimedia_not_ready',
        ])],
      }
      return {
        ...longFormTruth,
        classification: classifyCapability(longFormTruth),
        remainingWork: longFormTruth.blockedReasons.filter((reason) => reason !== 'live_proof_missing'),
      }
    }

    return withClassification
  })
}

export function getRuntimeTruth(input: RuntimeTruthInput = {}): RuntimeTruth {
  const providers = getProviderRuntimeTruth(input)
  const capabilities = getCapabilityRuntimeTruth(input)
  const countsByClassification = Object.fromEntries(
    CAPABILITY_RUNTIME_CLASSIFICATIONS.map((classification) => [
      classification,
      capabilities.filter((capability) => capability.classification === classification).length,
    ]),
  ) as Record<CapabilityRuntimeClassification, number>

  return {
    generatedAt: input.generatedAt ?? new Date(0).toISOString(),
    providerPolicy: {
      runtimeExecutionProviders: RUNTIME_EXECUTION_PROVIDERS,
      codingOnlyProviders: CODING_ONLY_PROVIDERS,
      qwenRuntimeEligible: false,
    },
    providers,
    capabilities,
    countsByClassification,
  }
}
