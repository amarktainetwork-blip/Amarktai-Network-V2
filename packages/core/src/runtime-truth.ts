import { CAPABILITY_BY_KEY, CAPABILITY_KEYS, type CapabilityKey } from './capabilities.js'
import { EXECUTOR_REGISTRATIONS, getExecutorRegistrations } from './executor-registry.js'
import { MODEL_CATALOGUE, type ModelRecord } from './model-catalog.js'
import {
  APPROVED_PROVIDER_DEFINITIONS,
  CODING_ONLY_PROVIDERS,
  RUNTIME_EXECUTION_PROVIDERS,
  type ProviderKey,
  type RuntimeExecutionProvider,
} from './providers.js'
import { DURABLE_WORKFLOW_REGISTRATIONS } from './long-form-execution.js'
import { getDashboardAppSlug, getReleaseCandidateCapabilityKeys } from './dashboard-apps.js'

export { CODING_ONLY_PROVIDERS, RUNTIME_EXECUTION_PROVIDERS }
export type { RuntimeExecutionProvider }

export const CAPABILITY_RUNTIME_CLASSIFICATIONS = [
  'CATALOGUE_ONLY',
  'CLIENT_PRESENT',
  'ADAPTER_PRESENT',
  'EXECUTOR_PRESENT',
  'LOCALLY_PROVEN',
  'EXECUTABLE_NOT_LIVE_PROVEN',
  'LIVE_PROVEN',
  'POLICY_RESTRICTED',
  'BLOCKED',
  'NOT_IMPLEMENTED',
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
  locallyProven?: boolean
  liveProven?: boolean
  lastProofAt?: string | Date | null
  routeImplemented?: boolean
  queuePathImplemented?: boolean
  artifactPathImplemented?: boolean
}

export interface RuntimeTruthInput {
  providers?: Partial<Record<ProviderKey, ProviderRuntimeStateInput>>
  capabilities?: Partial<Record<CapabilityKey, CapabilityRuntimeStateInput>>
  longFormComponents?: Partial<LongFormComponentRuntimeState>
  appGrants?: Partial<Record<string, Partial<Record<CapabilityKey, boolean>>>>
  localStaticEvidence?: Partial<Record<CapabilityKey, boolean>>
  generatedAt?: string
}

export interface ReleaseReadinessProjection {
  capability: CapabilityKey
  appSlug: string
  releaseCandidate: boolean
  catalogued: boolean
  clientPresent: boolean
  executorPresent: boolean
  workflowPresent: boolean
  schemaPresent: boolean
  appGrantPresent: boolean
  infrastructureRequired: string[]
  locallyProven: boolean
  liveProven: boolean
  readyForDashboardExecution: boolean
  blockedReasons: string[]
}

export interface LongFormComponentRuntimeState {
  plannerReady: boolean
  durableParentReady: boolean
  durablePlanReady: boolean
  sceneLinkageReady: boolean
  sceneSubmissionReady: boolean
  sceneExecutionReady: boolean
  retryResumeReady: boolean
  progressTrackingReady: boolean
  batchStructureReady: boolean
  assemblyHandoffReady: boolean
  videoOnlyAssemblyReady: boolean
  voiceoverReady: boolean
  subtitlesReady: boolean
  musicBedReady: boolean
  fullMultimediaReady: boolean
}

export interface ProviderRuntimeTruth {
  provider: ProviderKey
  displayName: string
  runtimeRole: string
  credentialEnvironmentKey: string
  discoveryPolicy: string
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
  registeredExecutorCapabilities: CapabilityKey[]
  discoveredModelCount: number
  eligibleModelCount: number
  liveProvenCapabilities: CapabilityKey[]
  blockers: string[]
  policyRestrictions: string[]
}

export interface CapabilityRuntimeTruth {
  capability: CapabilityKey
  label: string
  description: string
  family: string
  category: string
  outputType: string
  artifactRequired: boolean
  artifactType: string | null
  orchestrated: boolean
  governed: boolean
  adult: boolean
  requiresSourceArtifact: boolean
  requiresQueueExecution: boolean
  inputContractReference: string
  outputContractReference: string
  policyRequirement: string
  schemaKey: string
  studioMode: string
  dashboardType: string
  classification: CapabilityRuntimeClassification
  catalogueKnown: boolean
  discoveredModels: string[]
  discoveredModelCount: number
  clientImplemented: boolean
  adapterPresent: boolean
  executorRegistered: boolean
  executorRegistrationIds: string[]
  requestShapeKnown: boolean
  responseShapeKnown: boolean
  routeImplemented: boolean
  queuePathImplemented: boolean
  artifactPathImplemented: boolean
  implementationReady: boolean
  configured: boolean
  infrastructureReady: boolean
  policyAllowed: boolean
  executableNow: boolean
  locallyProven: boolean
  liveProven: boolean
  lastProofAt: string | null
  eligibleProviders: ProviderKey[]
  eligibleModels: Array<{
    provider: ProviderKey
    modelId: string
    displayName: string
    executorId: string
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
  releaseReadiness: ReleaseReadinessProjection[]
  releaseCandidateCapabilities: CapabilityKey[]
}

function toIso(value: string | Date | null | undefined): string | null {
  if (!value) return null
  return value instanceof Date ? value.toISOString() : value
}

function modelIds(models: readonly ModelRecord[]): string[] {
  return [...new Set(models.map((model) => `${model.provider}/${model.modelId}`))]
}

function catalogueModelsForCapability(capability: CapabilityKey): ModelRecord[] {
  return MODEL_CATALOGUE.filter((model) =>
    model.status !== 'blocked' && model.capabilities.includes(capability),
  )
}

function classifyCapability(truth: Omit<CapabilityRuntimeTruth, 'classification'>): CapabilityRuntimeClassification {
  if (!truth.policyAllowed) return 'POLICY_RESTRICTED'
  if (truth.liveProven) return 'LIVE_PROVEN'
  if (truth.executableNow && truth.locallyProven) return 'LOCALLY_PROVEN'
  if (truth.executableNow) return 'EXECUTABLE_NOT_LIVE_PROVEN'
  if (truth.executorRegistered && truth.configured && !truth.infrastructureReady) return 'BLOCKED'
  if (truth.executorRegistered) return 'EXECUTOR_PRESENT'
  if (truth.adapterPresent) return 'ADAPTER_PRESENT'
  if (truth.clientImplemented) return 'CLIENT_PRESENT'
  if (truth.discoveredModelCount > 0) return 'CATALOGUE_ONLY'
  return 'NOT_IMPLEMENTED'
}

export function getProviderRuntimeTruth(input: RuntimeTruthInput = {}): ProviderRuntimeTruth[] {
  return APPROVED_PROVIDER_DEFINITIONS.map((definition) => {
    const provider = definition.key
    const state = input.providers?.[provider]
    const providerModels = MODEL_CATALOGUE.filter((model) => model.provider === provider)
    const runtimeExecutionProvider = definition.backendExecutionAllowed
    const codingOnly = definition.codingOnly
    const enabled = runtimeExecutionProvider && state?.enabled === true
    const runtimeEnabled = enabled && state?.runtimeEnabled !== false
    const credentialConfigured = state?.configured === true
    const configured = runtimeEnabled && credentialConfigured
    const registrations = EXECUTOR_REGISTRATIONS.filter((entry) => entry.provider === provider)
    const registeredExecutorCapabilities = [...new Set(registrations.map((entry) => entry.capability))]
    const supportedCapabilities = [...new Set(providerModels.flatMap((model) => model.capabilities))]
    const eligibleModelCount = providerModels.filter((model) =>
      model.status !== 'blocked'
      && model.capabilities.some((capability) => registrations.some((entry) => entry.capability === capability)),
    ).length
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
      displayName: definition.displayName,
      runtimeRole: definition.runtimeRole,
      credentialEnvironmentKey: definition.credentialEnvKey,
      discoveryPolicy: definition.discoveryPolicy,
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
      registeredExecutorCapabilities,
      discoveredModelCount: providerModels.filter((model) => model.discoveredModel || model.docsKnown || model.liveDiscovered).length,
      eligibleModelCount,
      liveProvenCapabilities: CAPABILITY_KEYS.filter((capability) =>
        input.capabilities?.[capability]?.liveProven === true
        && registrations.some((entry) => entry.capability === capability),
      ),
      blockers,
      policyRestrictions,
    }
  })
}

export function getCapabilityRuntimeTruth(input: RuntimeTruthInput = {}): CapabilityRuntimeTruth[] {
  const providers = getProviderRuntimeTruth(input)
  const providerMap = new Map(providers.map((provider) => [provider.provider, provider]))

  return CAPABILITY_KEYS.map((capability) => {
    const definition = CAPABILITY_BY_KEY[capability]
    const runtime = input.capabilities?.[capability] ?? {}
    const catalogueModels = catalogueModelsForCapability(capability)
    const registrations = getExecutorRegistrations(capability)
    const executableModels = catalogueModels.flatMap((model) => {
      const registration = registrations.find((entry) => entry.provider === model.provider)
      return registration ? [{ model, registration }] : []
    })
    const eligibleProviders = [...new Set(executableModels.map(({ model }) => model.provider))]
    const configured = runtime.configured ?? eligibleProviders.some((provider) => providerMap.get(provider)?.configured === true)
    const infrastructureReady = runtime.infrastructureReady === true
    const policyAllowed = runtime.policyAllowed ?? !definition.adult
    const clientImplemented = registrations.length > 0
    const adapterPresent = registrations.length > 0
    const executorRegistered = registrations.length > 0
    const requestShapeKnown = registrations.length > 0
    const responseShapeKnown = registrations.length > 0
    const routeImplemented = runtime.routeImplemented ?? registrations.length > 0
    const queuePathImplemented = runtime.queuePathImplemented ?? (registrations.length > 0 && definition.requiresQueueExecution)
    const artifactPathImplemented = runtime.artifactPathImplemented
      ?? (registrations.length > 0 && (!definition.artifactRequired || registrations.every((entry) => entry.artifactOutput !== null)))
    const implementationReady = clientImplemented
      && adapterPresent
      && executorRegistered
      && requestShapeKnown
      && responseShapeKnown
      && routeImplemented
      && (!definition.requiresQueueExecution || queuePathImplemented)
      && (!definition.artifactRequired || artifactPathImplemented)
      && executableModels.length > 0
    const executableNow = implementationReady && configured && infrastructureReady && policyAllowed
    const locallyProven = runtime.locallyProven === true
    const liveProven = runtime.liveProven === true && executableNow
    const lastProofAt = toIso(runtime.lastProofAt)

    const eligibleModels = executableModels.map(({ model, registration }, index) => ({
      provider: model.provider,
      modelId: model.modelId,
      displayName: model.displayName,
      executorId: registration.id,
      preferred: index === 0,
      fallback: index > 0,
      liveProven: liveProven && index === 0,
    }))

    const blockedReasons: string[] = []
    if (catalogueModels.length === 0) blockedReasons.push('no_catalogued_model_claim')
    if (!clientImplemented) blockedReasons.push('provider_client_missing')
    if (!adapterPresent) blockedReasons.push('adapter_missing')
    if (!executorRegistered) blockedReasons.push('executor_missing')
    if (!requestShapeKnown) blockedReasons.push('request_shape_unknown')
    if (!responseShapeKnown) blockedReasons.push('response_shape_unknown')
    if (!routeImplemented) blockedReasons.push('route_missing')
    if (definition.requiresQueueExecution && !queuePathImplemented) blockedReasons.push('queue_path_missing')
    if (definition.artifactRequired && !artifactPathImplemented) blockedReasons.push('artifact_support_missing')
    if (registrations.length > 0 && executableModels.length === 0) blockedReasons.push('no_executor_compatible_catalogued_model')
    if (!configured) blockedReasons.push('credentials_missing')
    if (!infrastructureReady) blockedReasons.push('infrastructure_missing')
    if (!policyAllowed) blockedReasons.push('policy_restricted')
    if (executableNow && !liveProven) blockedReasons.push('live_proof_missing')

    const truthBase: Omit<CapabilityRuntimeTruth, 'classification'> = {
      capability,
      label: definition.label,
      description: definition.description,
      family: definition.family,
      category: definition.category,
      outputType: definition.outputType,
      artifactRequired: definition.artifactRequired,
      artifactType: definition.artifactType,
      orchestrated: definition.orchestrated,
      governed: definition.governed,
      adult: definition.adult,
      requiresSourceArtifact: definition.requiresSourceArtifact,
      requiresQueueExecution: definition.requiresQueueExecution,
      inputContractReference: definition.inputContractReference,
      outputContractReference: definition.outputContractReference,
      policyRequirement: definition.policyRequirement,
      schemaKey: definition.schemaKey,
      studioMode: definition.studioMode,
      dashboardType: definition.dashboardType,
      catalogueKnown: true,
      discoveredModels: modelIds(catalogueModels),
      discoveredModelCount: catalogueModels.length,
      clientImplemented,
      adapterPresent,
      executorRegistered,
      executorRegistrationIds: [...new Set(registrations.map((entry) => entry.id))],
      requestShapeKnown,
      responseShapeKnown,
      routeImplemented,
      queuePathImplemented,
      artifactPathImplemented,
      implementationReady,
      configured,
      infrastructureReady,
      policyAllowed,
      executableNow,
      locallyProven,
      liveProven,
      lastProofAt,
      eligibleProviders,
      eligibleModels,
      blockedReasons: [...new Set(blockedReasons)],
      remainingWork: [...new Set(blockedReasons.filter((reason) => reason !== 'live_proof_missing'))],
    }

    if (capability === 'long_form_video') {
      const components = input.longFormComponents ?? {}
      Object.assign(truthBase, {
        plannerReady: components.plannerReady === true,
        durableParentReady: components.durableParentReady === true,
        durablePlanReady: components.durablePlanReady === true,
        sceneLinkageReady: components.sceneLinkageReady === true,
        sceneSubmissionReady: components.sceneSubmissionReady === true,
        sceneExecutionReady: components.sceneExecutionReady === true,
        retryResumeReady: components.retryResumeReady === true,
        progressTrackingReady: components.progressTrackingReady === true,
        batchStructureReady: components.batchStructureReady === true,
        assemblyHandoffReady: components.assemblyHandoffReady === true,
        videoOnlyAssemblyReady: components.videoOnlyAssemblyReady === true,
        voiceoverReady: components.voiceoverReady === true,
        subtitlesReady: components.subtitlesReady === true,
        musicBedReady: components.musicBedReady === true,
        fullMultimediaReady: components.fullMultimediaReady === true,
      })
    }

    return { ...truthBase, classification: classifyCapability(truthBase) }
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
  const releaseCandidateCapabilities = getReleaseCandidateCapabilityKeys()
  const releaseCandidateSet = new Set(releaseCandidateCapabilities)
  const capabilityMap = new Map(capabilities.map((capability) => [capability.capability, capability]))
  const longFormDependencies = ['video_generation', 'tts', 'music_generation']
    .map((capability) => capabilityMap.get(capability as CapabilityKey))
    .filter((capability): capability is CapabilityRuntimeTruth => Boolean(capability))

  const releaseReadiness: ReleaseReadinessProjection[] = capabilities.map((capability) => {
    const releaseCandidate = releaseCandidateSet.has(capability.capability)
    const workflowPresent = DURABLE_WORKFLOW_REGISTRATIONS.some((entry) => entry.capability === capability.capability)
    const schemaPresent = Boolean(capability.inputContractReference && capability.outputContractReference && capability.schemaKey)
    const clientPresent = capability.clientImplemented || workflowPresent
    const executorPresent = capability.executorRegistered
    const appSlug = getDashboardAppSlug(capability.capability)
    const workflow = DURABLE_WORKFLOW_REGISTRATIONS.find((entry) => entry.capability === capability.capability)
    const requiredGrantCapabilities: readonly CapabilityKey[] = workflow
      ? [capability.capability, ...workflow.requiredCapabilities]
      : [capability.capability]
    const appGrantPresent = requiredGrantCapabilities.every((required) => input.appGrants?.[appSlug]?.[required] === true)
    const infrastructureRequired = [
      'mariadb',
      ...(capability.requiresQueueExecution || workflowPresent ? ['redis', 'worker'] : []),
      ...(capability.artifactRequired ? ['artifact_storage'] : []),
      ...(workflowPresent ? ['ffmpeg'] : []),
    ]
    const workflowReady = workflowPresent
      && input.longFormComponents?.fullMultimediaReady === true
      && longFormDependencies.every((dependency) => dependency.configured && dependency.infrastructureReady)
    const implementationReady = workflowPresent ? workflowReady : capability.implementationReady
    const configured = workflowPresent
      ? longFormDependencies.every((dependency) => dependency.configured)
      : capability.configured
    const infrastructureReady = workflowPresent
      ? input.longFormComponents?.fullMultimediaReady === true
      : capability.infrastructureReady
    const locallyProven = input.localStaticEvidence?.[capability.capability] === true
    const blockedReasons: string[] = []
    if (!releaseCandidate) blockedReasons.push('no_callable_executor_or_durable_workflow')
    if (!clientPresent) blockedReasons.push('client_missing')
    if (!executorPresent && !workflowPresent) blockedReasons.push('executor_or_workflow_missing')
    if (!schemaPresent) blockedReasons.push('schema_missing')
    if (!appGrantPresent) blockedReasons.push('app_grant_missing')
    if (!configured) blockedReasons.push('provider_configuration_missing')
    if (!infrastructureReady) blockedReasons.push('infrastructure_missing')
    if (!capability.policyAllowed) blockedReasons.push('policy_restricted')
    if (releaseCandidate && implementationReady && !capability.liveProven) blockedReasons.push('live_proof_missing')

    return {
      capability: capability.capability,
      appSlug,
      releaseCandidate,
      catalogued: capability.catalogueKnown,
      clientPresent,
      executorPresent,
      workflowPresent,
      schemaPresent,
      appGrantPresent,
      infrastructureRequired: [...new Set(infrastructureRequired)],
      locallyProven,
      liveProven: capability.liveProven,
      readyForDashboardExecution: releaseCandidate
        && implementationReady
        && schemaPresent
        && appGrantPresent
        && configured
        && infrastructureReady
        && capability.policyAllowed,
      blockedReasons: [...new Set(blockedReasons)],
    }
  })

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
    releaseReadiness,
    releaseCandidateCapabilities,
  }
}
