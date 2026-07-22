import { INTERNAL_EXECUTOR_REGISTRATIONS, type CapabilityKey, type RuntimeTruth } from '@amarktai/core'
import { prisma } from '@amarktai/db'

type InternalProofJob = {
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

type InternalProofArtifact = {
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
}

function parseObject(value: unknown): Record<string, unknown> {
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

function outputArtifactId(output: string | null | undefined): string {
  const parsed = parseObject(output)
  return typeof parsed.artifactId === 'string' ? parsed.artifactId : ''
}

export function validateInternalExecutorProof(
  job: InternalProofJob,
  artifact: InternalProofArtifact | undefined,
): { capability: CapabilityKey; completedAt: string } | null {
  const registration = INTERNAL_EXECUTOR_REGISTRATIONS.find((entry) => entry.capability === job.capability)
  if (!registration || !artifact) return null
  if (job.status && job.status !== 'completed') return null
  if (!job.completedAt || !job.traceId || !job.artifactId) return null
  if (job.provider !== 'internal' || artifact.provider !== 'internal') return null
  if (typeof job.model !== 'string' || !job.model.startsWith(`${registration.engine}-`)) return null
  if (artifact.model !== job.model) return null
  if (artifact.id !== job.artifactId || artifact.status !== 'completed') return null
  if (outputArtifactId(job.output) && outputArtifactId(job.output) !== artifact.id) return null
  if (artifact.appSlug !== job.appSlug || artifact.traceId !== job.traceId) return null
  if (artifact.subType !== registration.capability && !artifact.subType.startsWith(`${registration.capability}_`)) return null
  if (registration.artifactOutput === 'audio' && (artifact.type !== 'audio' || !artifact.mimeType.startsWith('audio/'))) return null
  if (!artifact.storagePath || !artifact.storageUrl || artifact.fileSizeBytes <= 0) return null

  const artifactMetadata = parseObject(artifact.metadata)
  if (artifactMetadata.evidenceSource !== registration.evidenceSource) return null
  if (artifactMetadata.liveProviderProof !== false) return null
  if (typeof artifactMetadata.outputChecksum !== 'string' || !artifactMetadata.outputChecksum.trim()) return null
  if (typeof artifactMetadata.sourceArtifactId !== 'string' || !artifactMetadata.sourceArtifactId.trim()) return null

  const completedAt = job.completedAt instanceof Date ? job.completedAt.toISOString() : job.completedAt
  return { capability: registration.capability, completedAt }
}

export async function applyPersistedInternalExecutorProof<T extends RuntimeTruth>(truth: T): Promise<T> {
  const capabilities = INTERNAL_EXECUTOR_REGISTRATIONS.map((registration) => registration.capability)
  if (!capabilities.length) return truth

  try {
    const jobs = await prisma.job.findMany({
      where: {
        status: 'completed',
        provider: 'internal',
        capability: { in: capabilities },
        artifactId: { not: null },
      },
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
      take: 100,
    }) as InternalProofJob[]
    const artifactIds = jobs.map((job) => job.artifactId).filter((id): id is string => Boolean(id))
    const artifacts = artifactIds.length
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
          },
        }) as InternalProofArtifact[]
      : []
    const artifactById = new Map(artifacts.map((artifact) => [artifact.id, artifact]))
    const proofs = new Map<CapabilityKey, string>()
    for (const job of jobs) {
      if (proofs.has(job.capability as CapabilityKey)) continue
      const proof = validateInternalExecutorProof(job, artifactById.get(job.artifactId ?? ''))
      if (proof) proofs.set(proof.capability, proof.completedAt)
    }
    if (!proofs.size) return truth

    return {
      ...truth,
      capabilities: truth.capabilities.map((capability) => {
        const completedAt = proofs.get(capability.capability)
        return completedAt ? { ...capability, locallyProven: true, lastProofAt: completedAt } : capability
      }),
      releaseReadiness: truth.releaseReadiness.map((entry) =>
        proofs.has(entry.capability) ? { ...entry, locallyProven: true } : entry,
      ),
    }
  } catch {
    return truth
  }
}
