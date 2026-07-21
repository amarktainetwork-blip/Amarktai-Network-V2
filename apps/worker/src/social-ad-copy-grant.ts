import type { AppCapabilityGrantContext } from '@amarktai/core'
import { prisma } from '@amarktai/db'

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

export async function ensureSocialAdCopyGrantSnapshot(parentJobId: string): Promise<AppCapabilityGrantContext> {
  const parent = await prisma.job.findUnique({ where: { id: parentJobId } })
  if (!parent) throw new Error('Social-ad parent job was not found')
  const metadata = safeJson(parent.metadataJson)
  const existing = metadata.copyGrantSnapshot
  if (existing && typeof existing === 'object' && !Array.isArray(existing)) {
    const grant = existing as AppCapabilityGrantContext
    if (grant.appSlug === parent.appSlug && grant.capability === 'structured_output' && grant.enabled) {
      return Object.freeze({ ...grant })
    }
    throw new Error('Persisted social-ad copy grant is invalid')
  }

  const stored = await prisma.appCapabilityGrant.findUnique({
    where: {
      app_capability_grant_unique: {
        appSlug: parent.appSlug,
        capability: 'structured_output',
      },
    },
  })
  if (!stored?.enabled) {
    throw new Error('Social-ad execution requires an enabled structured_output grant for social copy')
  }
  const grant: AppCapabilityGrantContext = Object.freeze({
    appSlug: stored.appSlug,
    capability: 'structured_output',
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
        copyGrantSnapshot: grant,
        copyGrantSnapshotSource: 'app_capability_grant',
        copyGrantSnapshotAt: capturedAt,
      }),
    },
  })
  return grant
}
