import { durableIdempotencyTrace, type CapabilityKey } from '@amarktai/core'
import { prisma } from '@amarktai/db'

export interface PersistBlockedCapabilityJobInput {
  appSlug: string
  capability: CapabilityKey
  prompt: string
  requestInput: Record<string, unknown>
  metadata: Record<string, unknown>
  idempotencyKey: string
  blocker: string
  message: string
}

/**
 * Persist a truthful terminal Job for a governed request that passed auth,
 * grants, source ownership, and rights checks but has no executable route.
 * Known blockers are never queued and never labelled as fixture evidence.
 */
export async function persistBlockedCapabilityJob(input: PersistBlockedCapabilityJobInput) {
  const traceId = durableIdempotencyTrace(input.appSlug, input.capability, input.idempotencyKey)
  const existing = await prisma.job.findFirst({
    where: { appSlug: input.appSlug, capability: input.capability, traceId },
    orderBy: { createdAt: 'desc' },
  })
  if (existing) return { job: existing, deduplicated: true }

  const completedAt = new Date()
  const executionEvidence = {
    evidenceSource: 'executor_unavailable',
    liveProviderProof: false,
    blocker: input.blocker,
    blockedAt: completedAt.toISOString(),
  }
  const job = await prisma.job.create({
    data: {
      appSlug: input.appSlug,
      capability: input.capability,
      prompt: input.prompt.substring(0, 10000),
      inputJson: JSON.stringify(input.requestInput),
      metadataJson: JSON.stringify({
        ...input.metadata,
        idempotencyKey: input.idempotencyKey,
        executionProfile: 'external_app',
        executionEvidence,
        providerEvidence: {
          provider: null,
          model: null,
          evidenceSource: 'executor_unavailable',
          liveProviderProof: false,
          blocker: input.blocker,
          completedAt: completedAt.toISOString(),
        },
      }),
      traceId,
      status: 'failed',
      provider: null,
      model: null,
      progress: 0,
      error: `${input.blocker}: ${input.message}`,
      completedAt,
    },
  })
  return { job, deduplicated: false }
}
