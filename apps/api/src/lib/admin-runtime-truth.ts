import type { FastifyInstance } from 'fastify'
import { listProviderCredentialStatuses, prisma } from '@amarktai/db'
import {
  getRuntimeTruth,
  CAPABILITY_CATALOG,
  RUNTIME_EXECUTION_PROVIDERS,
  calculateLongFormProgress,
  createLongFormVideoPlan,
  createSceneExecutionPayloads,
  generateSubtitles,
  getExecutorRegistrations,
  getReleaseCandidateCapabilityKeys,
  hasExecutorRegistration,
  normalizeDbModelRecords,
  type CapabilityKey,
  type LongFormComponentRuntimeState,
  type RuntimeTruth,
  type RuntimeTruthInput,
} from '@amarktai/core'

const ARTIFACT_CAPABILITY_SET = new Set<CapabilityKey>(
  CAPABILITY_CATALOG.filter((c) => c.artifactRequired).map((c) => c.key),
)

const RUNTIME_PROVIDER_SET = new Set<string>(RUNTIME_EXECUTION_PROVIDERS)

function isArtifactCapability(capability: CapabilityKey): boolean {
  return ARTIFACT_CAPABILITY_SET.has(capability)
}

type ProofJob = {
  id: string
  appSlug: string
  capability: string
  status?: string | null
  completedAt: Date | string | null
  artifactId?: string | null
  provider?: string | null
  model?: string | null
  output?: string | null
  traceId?: string | null
  metadataJson?: string | null
}

type ProofArtifact = {
  id: string
  appSlug: string
  type: string
  subType: string
  status: string
  provider: string
  model: string
  traceId: string
  mimeType: string
  fileSizeBytes: number
  storagePath: string
  storageUrl: string
  metadata?: string | null
  description?: string | null
  errorMessage?: string | null
}

const CAPABILITY_ARTIFACT_SHAPES = Object.fromEntries(
  CAPABILITY_CATALOG.filter((capability) => capability.artifactRequired).map((capability) => {
    const artifactType = capability.artifactType ?? capability.outputType
    const audio = artifactType === 'audio'
    const types = audio ? ['audio', 'music'] : [artifactType]
    const mimePrefixes = audio
      ? ['audio/']
      : artifactType === 'image'
        ? ['image/']
        : artifactType === 'video'
          ? ['video/']
          : artifactType === 'document'
            ? ['application/', 'text/']
            : ['application/']
    return [capability.key, { types, mimePrefixes }]
  }),
) as Partial<Record<CapabilityKey, { types: readonly string[]; mimePrefixes: readonly string[] }>>

const PLACEHOLDER_PATTERN = /\b(mock|simulate|simulation|fake|fabricated|fixture|placeholder|backend pending|backend integration pending|not implemented|foundation only|proof pending)\b/i

function safeParseJsonObject(value: unknown): Record<string, unknown> {
  if (typeof value !== 'string' || !value.trim()) return {}
  try {
    const parsed = JSON.parse(value)
    return typeof parsed === 'object' && parsed !== null && !Array.isArray(parsed)
      ? parsed as Record<string, unknown>
      : {}
  } catch {
    return {}
  }
}

function textContainsPlaceholder(...values: unknown[]): boolean {
  return values
    .filter((value) => typeof value === 'string' && value.trim())
    .some((value) => PLACEHOLDER_PATTERN.test(value as string))
}

function metadataContainsPlaceholder(metadata: Record<string, unknown>): boolean {
  return Object.entries(metadata).some(([key, value]) => {
    if (PLACEHOLDER_PATTERN.test(key)) return true
    if (typeof value === 'string') return PLACEHOLDER_PATTERN.test(value)
    if (typeof value === 'boolean' && value === true) {
      return /mock|fake|fixture|placeholder/i.test(key)
    }
    return false
  })
}

function outputArtifactId(output: string | null | undefined): string {
  const parsed = safeParseJsonObject(output)
  return typeof parsed.artifactId === 'string' ? parsed.artifactId : ''
}

function hasRuntimeProviderAndModel(job: ProofJob): boolean {
  const provider = job.provider ?? ''
  const model = job.model ?? ''
  return RUNTIME_PROVIDER_SET.has(provider)
    && model.trim().length > 0
    && hasExecutorRegistration(job.capability as CapabilityKey, provider as never)
}

function isTrustedTextProof(job: ProofJob): boolean {
  const output = job.output ?? ''
  if (!hasRuntimeProviderAndModel(job)) return false
  if (!job.traceId || !job.completedAt) return false
  if (!output.trim()) return false
  if (textContainsPlaceholder(output, job.metadataJson)) return false
  if (metadataContainsPlaceholder(safeParseJsonObject(job.metadataJson))) return false
  return true
}

function isValidArtifactProof(job: ProofJob, artifact: ProofArtifact | undefined): boolean {
  const capability = job.capability as CapabilityKey
  if (!artifact) return false
  if (!hasRuntimeProviderAndModel(job)) return false
  if (!job.artifactId || artifact.id !== job.artifactId) return false
  const outputId = outputArtifactId(job.output)
  if (outputId && outputId !== artifact.id) return false
  if (!job.traceId || !artifact.traceId || artifact.traceId !== job.traceId) return false
  if (!job.appSlug || artifact.appSlug !== job.appSlug) return false
  if (artifact.status !== 'completed') return false
  if (artifact.subType !== capability) return false
  if (artifact.provider !== job.provider) return false
  if (!artifact.model || artifact.model !== job.model) return false
  if (!artifact.storagePath || !artifact.storageUrl) return false
  if (!artifact.fileSizeBytes || artifact.fileSizeBytes <= 0) return false

  const shape = CAPABILITY_ARTIFACT_SHAPES[capability]
  if (!shape) return false
  if (!shape.types.includes(artifact.type)) return false
  if (!shape.mimePrefixes.some((prefix) => artifact.mimeType.startsWith(prefix))) return false

  if (textContainsPlaceholder(job.output, job.metadataJson, artifact.metadata, artifact.description, artifact.errorMessage)) return false
  if (metadataContainsPlaceholder(safeParseJsonObject(job.metadataJson))) return false
  if (metadataContainsPlaceholder(safeParseJsonObject(artifact.metadata))) return false

  return true
}

export function selectCapabilityProofStates(
  jobs: readonly ProofJob[],
  artifacts: readonly ProofArtifact[],
): { capabilities: RuntimeTruthInput['capabilities']; evidenceAvailable: boolean } {
  const artifactById = new Map(artifacts.map((artifact) => [artifact.id, artifact]))
  const capabilities: RuntimeTruthInput['capabilities'] = {}
  const sortedJobs = [...jobs].sort((a, b) => {
    const aTime = a.completedAt ? new Date(a.completedAt).getTime() : 0
    const bTime = b.completedAt ? new Date(b.completedAt).getTime() : 0
    return bTime - aTime
  })

  for (const job of sortedJobs) {
    if (job.status && job.status !== 'completed') continue
    if (!job.completedAt) continue
    const capability = job.capability as CapabilityKey
    if (capabilities[capability]?.liveProven) continue

    const proven = isArtifactCapability(capability)
      ? isValidArtifactProof(job, artifactById.get(job.artifactId ?? ''))
      : isTrustedTextProof(job)

    if (!proven) continue
    capabilities[capability] = {
      liveProven: true,
      lastProofAt: job.completedAt,
    }
  }

  return { capabilities, evidenceAvailable: true }
}

/**
 * Component truth is bound to the callable implementation references used by
 * the API. Infrastructure and live proof remain separate gates.
 */
export function buildLongFormComponentRuntimeState(
  queueInfrastructureReady: boolean,
  _capabilityProofs: NonNullable<RuntimeTruthInput['capabilities']> = {},
  jobPersistenceReady = false,
): LongFormComponentRuntimeState {
  const plannerReady = typeof createLongFormVideoPlan === 'function'
  const scenePayloadBuilderReady = typeof createSceneExecutionPayloads === 'function'
  const parentStateReady = jobPersistenceReady
  const videoExecutorReady = getExecutorRegistrations('video_generation').length > 0
  const voiceExecutorReady = getExecutorRegistrations('tts').length > 0
  const musicExecutorReady = getExecutorRegistrations('music_generation').length > 0
  const assemblyHandoffReady = jobPersistenceReady
  const videoOnlyAssemblyReady = assemblyHandoffReady && queueInfrastructureReady
  const voiceoverReady = voiceExecutorReady && queueInfrastructureReady
  const subtitlesReady = typeof generateSubtitles === 'function' && jobPersistenceReady
  const musicBedReady = musicExecutorReady
    && queueInfrastructureReady
  const fullMultimediaReady = videoOnlyAssemblyReady
    && voiceoverReady
    && subtitlesReady
    && musicBedReady

  return {
    plannerReady,
    durableParentReady: parentStateReady && jobPersistenceReady,
    durablePlanReady: plannerReady && jobPersistenceReady,
    sceneLinkageReady: scenePayloadBuilderReady && jobPersistenceReady,
    sceneSubmissionReady: scenePayloadBuilderReady && queueInfrastructureReady,
    sceneExecutionReady: videoExecutorReady && queueInfrastructureReady,
    retryResumeReady: parentStateReady && jobPersistenceReady && queueInfrastructureReady,
    progressTrackingReady: parentStateReady && typeof calculateLongFormProgress === 'function',
    batchStructureReady: scenePayloadBuilderReady,
    assemblyHandoffReady,
    videoOnlyAssemblyReady,
    voiceoverReady,
    subtitlesReady,
    musicBedReady,
    fullMultimediaReady,
  }
}

export async function buildAdminRuntimeTruth(app: FastifyInstance): Promise<RuntimeTruth & { evidenceAvailable: boolean }> {
  let providerStatuses: Awaited<ReturnType<typeof listProviderCredentialStatuses>> = []
  let completedJobs: ProofJob[] = []
  let appGrantRows: Array<{ appSlug: string; capability: string; enabled: boolean }> = []
  let registryModels: Awaited<ReturnType<typeof prisma.modelRegistryEntry.findMany>> = []
  let evidenceAvailable = true
  let jobPersistenceReady = false

  try {
    jobPersistenceReady = typeof prisma.job.create === 'function' && typeof prisma.job.update === 'function'
    ;[providerStatuses, completedJobs, appGrantRows, registryModels] = await Promise.all([
      listProviderCredentialStatuses(),
      prisma.job.findMany({
        where: { status: 'completed' },
        orderBy: { completedAt: 'desc' },
        select: {
          id: true,
          appSlug: true,
          capability: true,
          status: true,
          completedAt: true,
          artifactId: true,
          provider: true,
          model: true,
          output: true,
          traceId: true,
          metadataJson: true,
        },
        take: 500,
      }),
      prisma.appCapabilityGrant.findMany({
        where: { capability: { in: getReleaseCandidateCapabilityKeys() } },
        select: { appSlug: true, capability: true, enabled: true },
      }),
      prisma.modelRegistryEntry.findMany({ where: { enabled: true } }),
    ])
  } catch {
    evidenceAvailable = false
  }

  // Batch-fetch artifact records for jobs that reference them
  let artifactRecords: ProofArtifact[] = []
  if (evidenceAvailable) {
    const artifactIds = completedJobs
      .map((job) => job.artifactId)
      .filter((id): id is string => id != null && id.length > 0)
    try {
      artifactRecords = artifactIds.length > 0
        ? await prisma.artifact.findMany({
            where: { id: { in: artifactIds } },
            select: {
              id: true,
              appSlug: true,
              type: true,
              subType: true,
              status: true,
              provider: true,
              model: true,
              traceId: true,
              mimeType: true,
              fileSizeBytes: true,
              storagePath: true,
              storageUrl: true,
              metadata: true,
              description: true,
              errorMessage: true,
            },
          })
        : []
    } catch {
      evidenceAvailable = false
    }
  }

  const providers: RuntimeTruthInput['providers'] = {}
  for (const status of providerStatuses) {
    providers[status.providerKey] = {
      enabled: status.enabled,
      runtimeEnabled: status.runtimeEnabled,
      configured: status.configured,
      source: status.source,
      healthStatus: status.healthStatus,
      healthMessage: status.healthMessage,
      lastCheckedAt: status.lastCheckedAt,
      defaultModel: status.defaultModel,
      fallbackModel: status.fallbackModel,
      credentialUsagePolicy: status.credentialUsagePolicy,
    }
  }

  const proofResult = evidenceAvailable
    ? selectCapabilityProofStates(completedJobs, artifactRecords)
    : { capabilities: {} as RuntimeTruthInput['capabilities'], evidenceAvailable: false }
  const capabilities = proofResult.capabilities ?? {}

  const queueInfrastructureReady = Boolean(app.redis)
  for (const capability of CAPABILITY_CATALOG.filter((definition) => definition.requiresQueueExecution).map((definition) => definition.key)) {
    capabilities[capability] = {
      ...capabilities[capability],
      infrastructureReady: queueInfrastructureReady,
    }
  }

  const longFormComponents = buildLongFormComponentRuntimeState(queueInfrastructureReady, capabilities, jobPersistenceReady)
  const appGrants: NonNullable<RuntimeTruthInput['appGrants']> = {}
  for (const grant of appGrantRows) {
    if (!grant.enabled) continue
    const existing = appGrants[grant.appSlug] ?? {}
    existing[grant.capability as CapabilityKey] = true
    appGrants[grant.appSlug] = existing
  }
  const truth = getRuntimeTruth({
    providers,
    capabilities,
    longFormComponents,
    appGrants,
    models: normalizeDbModelRecords(registryModels),
  })
  return { ...truth, evidenceAvailable: proofResult.evidenceAvailable && evidenceAvailable }
}
