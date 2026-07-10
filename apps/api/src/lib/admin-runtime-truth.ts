import type { FastifyInstance } from 'fastify'
import { listProviderCredentialStatuses, prisma } from '@amarktai/db'
import { getRuntimeTruth, type CapabilityKey, type RuntimeTruth, type RuntimeTruthInput } from '@amarktai/core'

export async function buildAdminRuntimeTruth(app: FastifyInstance): Promise<RuntimeTruth> {
  const [providerStatuses, completedJobs] = await Promise.all([
    listProviderCredentialStatuses().catch(() => []),
    prisma.job.findMany({
      where: { status: 'completed' },
      orderBy: { completedAt: 'desc' },
      select: {
        capability: true,
        completedAt: true,
        artifactId: true,
      },
      take: 500,
    }).catch(() => []),
  ])

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

  const capabilities: RuntimeTruthInput['capabilities'] = {}
  const firstProofByCapability = new Map<CapabilityKey, Date>()
  for (const job of completedJobs) {
    const capability = job.capability as CapabilityKey
    if (job.completedAt && !firstProofByCapability.has(capability)) {
      firstProofByCapability.set(capability, job.completedAt)
    }
  }

  for (const [capability, completedAt] of firstProofByCapability.entries()) {
    capabilities[capability] = {
      liveProven: true,
      lastProofAt: completedAt,
    }
  }

  const queueInfrastructureReady = Boolean(app.redis)
  for (const capability of ['chat', 'reasoning', 'code', 'summarization', 'translation', 'classification', 'extraction', 'structured_output', 'image_generation', 'video_generation', 'music_generation'] as CapabilityKey[]) {
    capabilities[capability] = {
      ...capabilities[capability],
      infrastructureReady: queueInfrastructureReady,
    }
  }

  return getRuntimeTruth({ providers, capabilities })
}
