import { prisma } from '@amarktai/db'
import type { AppCapabilityGrantContext } from '@amarktai/core'

function parseJsonArray(value: string): string[] {
  try {
    const parsed = JSON.parse(value)
    return Array.isArray(parsed) ? parsed.filter((item): item is string => typeof item === 'string') : []
  } catch {
    return []
  }
}

function parseJsonObject(value: string): Record<string, unknown> {
  try {
    const parsed = JSON.parse(value)
    return typeof parsed === 'object' && parsed !== null && !Array.isArray(parsed)
      ? parsed as Record<string, unknown>
      : {}
  } catch {
    return {}
  }
}

function safeJson(value: string): Record<string, unknown> {
  try {
    const parsed = JSON.parse(value)
    return typeof parsed === 'object' && parsed !== null && !Array.isArray(parsed)
      ? parsed as Record<string, unknown>
      : {}
  } catch {
    return {}
  }
}

export async function ensureSocialAdQualityGrantSnapshot(parentJobId: string): Promise<AppCapabilityGrantContext> {
  const parent = await prisma.job.findUnique({ where: { id: parentJobId } })
  if (!parent) throw new Error('Social-ad parent job was not found')
  const metadata = safeJson(parent.metadataJson)
  const existing = metadata.qualityGrantSnapshot
  if (existing && typeof existing === 'object' && !Array.isArray(existing)) {
    const grant = existing as AppCapabilityGrantContext
    if (grant.appSlug === parent.appSlug && grant.capability === 'video_understanding' && grant.enabled && grant.artifactRead) {
      return Object.freeze({ ...grant })
    }
    throw new Error('Persisted social-ad quality grant is invalid')
  }

  const stored = await prisma.appCapabilityGrant.findUnique({
    where: {
      app_capability_grant_unique: {
        appSlug: parent.appSlug,
        capability: 'video_understanding',
      },
    },
  })
  if (!stored || !stored.enabled || !stored.artifactRead) {
    throw new Error('Social-ad execution requires an enabled video_understanding grant with artifactRead')
  }

  const grant: AppCapabilityGrantContext = Object.freeze({
    appSlug: stored.appSlug,
    capability: 'video_understanding',
    enabled: stored.enabled,
    qualityFloor: stored.qualityFloor,
    budgetPolicy: stored.budgetPolicy,
    maxCostPerRequest: stored.maxCostPerRequest,
    maxCostPerWorkflow: stored.maxCostPerWorkflow,
    latencyPreference: stored.latencyPreference,
    allowFallback: stored.allowFallback,
    maxFallbackAttempts: stored.maxFallbackAttempts,
    liveProofRequired: stored.liveProofRequired,
    approvalRequired: stored.approvalRequired,
    artifactRead: stored.artifactRead,
    artifactWrite: stored.artifactWrite,
    memoryRead: stored.memoryRead,
    memoryWrite: stored.memoryWrite,
    ragNamespaces: parseJsonArray(stored.ragNamespaces),
    policyProfile: stored.policyProfile,
    adultPermission: stored.adultPermission,
    dataRetentionPolicy: stored.dataRetentionPolicy,
    passthroughModelAllowed: stored.passthroughModelAllowed,
    providerResidencyConstraints: parseJsonArray(stored.providerResidencyConstraints),
    routingMode: stored.routingMode as AppCapabilityGrantContext['routingMode'],
    qualityTarget: stored.qualityTarget as AppCapabilityGrantContext['qualityTarget'],
    spendStrategy: stored.spendStrategy as AppCapabilityGrantContext['spendStrategy'],
    fixedRoute: stored.fixedProvider && stored.fixedModel ? `${stored.fixedProvider}/${stored.fixedModel}` : null,
    preferredPool: parseJsonArray(stored.preferredPool),
    selectableAllowlist: parseJsonArray(stored.selectableAllowlist),
    restrictedPool: parseJsonArray(stored.restrictedPool),
    workflowStepOverrides: parseJsonObject(stored.workflowStepOverrides),
  })
  const capturedAt = new Date().toISOString()
  await prisma.job.update({
    where: { id: parent.id },
    data: {
      metadataJson: JSON.stringify({
        ...metadata,
        qualityGrantSnapshot: grant,
        qualityGrantSnapshotSource: 'app_capability_grant',
        qualityGrantSnapshotAt: capturedAt,
      }),
    },
  })
  return grant
}
