import type { FastifyInstance } from 'fastify'
import { listProviderCredentialStatuses, prisma } from '@amarktai/db'
import {
  getRuntimeTruth,
  CAPABILITY_CATALOG,
  RUNTIME_EXECUTION_PROVIDERS,
  type CapabilityKey,
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

const CAPABILITY_ARTIFACT_SHAPES: Partial<Record<CapabilityKey, {
  types: readonly string[]
  mimePrefixes: readonly string[]
}>> = {
  image_generation: { types: ['image'], mimePrefixes: ['image/'] },
  image_edit: { types: ['image'], mimePrefixes: ['image/'] },
  image_to_video: { types: ['video'], mimePrefixes: ['video/'] },
  long_form_video: { types: ['video'], mimePrefixes: ['video/'] },
  video_generation: { types: ['video'], mimePrefixes: ['video/'] },
  music_generation: { types: ['music', 'audio'], mimePrefixes: ['audio/'] },
  tts: { types: ['audio', 'music'], mimePrefixes: ['audio/'] },
  avatar_generation: { types: ['video', 'image'], mimePrefixes: ['video/', 'image/'] },
  adult_image: { types: ['image'], mimePrefixes: ['image/'] },
  adult_voice: { types: ['audio', 'music'], mimePrefixes: ['audio/'] },
  adult_avatar: { types: ['video', 'image'], mimePrefixes: ['video/', 'image/'] },
  adult_video: { types: ['video'], mimePrefixes: ['video/'] },
}

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
  return RUNTIME_PROVIDER_SET.has(provider) && model.trim().length > 0
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
): RuntimeTruthInput['capabilities'] {
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

  return capabilities
}

export async function buildAdminRuntimeTruth(app: FastifyInstance): Promise<RuntimeTruth> {
  const [providerStatuses, completedJobs] = await Promise.all([
    listProviderCredentialStatuses().catch(() => []),
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
    }).catch(() => []),
  ])

  // Batch-fetch artifact records for jobs that reference them
  const artifactIds = completedJobs
    .map((job) => job.artifactId)
    .filter((id): id is string => id != null && id.length > 0)
  const artifactRecords = artifactIds.length > 0
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
      }).catch(() => [])
    : []

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

  const capabilities = selectCapabilityProofStates(completedJobs, artifactRecords) ?? {}

  const queueInfrastructureReady = Boolean(app.redis)
  for (const capability of ['chat', 'reasoning', 'code', 'summarization', 'translation', 'classification', 'extraction', 'structured_output', 'image_generation', 'video_generation', 'music_generation'] as CapabilityKey[]) {
    capabilities[capability] = {
      ...capabilities[capability],
      infrastructureReady: queueInfrastructureReady,
    }
  }

  return getRuntimeTruth({ providers, capabilities })
}
