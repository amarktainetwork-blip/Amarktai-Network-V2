/**
 * App Grant Loader — loads app capability grants from database.
 *
 * This is the single API-layer component that loads app grants.
 * It queries the AppCapabilityGrant table and returns typed grant contexts.
 */

import { prisma } from '@amarktai/db'
import type { AppCapabilityGrantContext, CapabilityKey } from '@amarktai/core'

/**
 * Loads the app capability grant for a specific app and capability.
 * Returns null if no grant exists (app has no explicit grant for this capability).
 */
export async function loadAppCapabilityGrant(
  appSlug: string,
  capability: CapabilityKey,
): Promise<AppCapabilityGrantContext | null> {
  const grant = await prisma.appCapabilityGrant.findUnique({
    where: {
      app_capability_grant_unique: {
        appSlug,
        capability,
      },
    },
  })

  if (!grant) return null

  return {
    appSlug: grant.appSlug,
    capability: grant.capability as CapabilityKey,
    enabled: grant.enabled,
    qualityFloor: grant.qualityFloor,
    budgetPolicy: grant.budgetPolicy,
    maxCostPerRequest: grant.maxCostPerRequest,
    maxCostPerWorkflow: grant.maxCostPerWorkflow,
    latencyPreference: grant.latencyPreference,
    allowFallback: grant.allowFallback,
    maxFallbackAttempts: grant.maxFallbackAttempts,
    liveProofRequired: grant.liveProofRequired,
    approvalRequired: grant.approvalRequired,
    artifactRead: grant.artifactRead,
    artifactWrite: grant.artifactWrite,
    memoryRead: grant.memoryRead,
    memoryWrite: grant.memoryWrite,
    ragNamespaces: parseJsonArray(grant.ragNamespaces),
    policyProfile: grant.policyProfile,
    adultPermission: grant.adultPermission,
    dataRetentionPolicy: grant.dataRetentionPolicy,
    passthroughModelAllowed: grant.passthroughModelAllowed,
    providerResidencyConstraints: parseJsonArray(grant.providerResidencyConstraints),
  }
}

/**
 * Loads all capability grants for an app.
 * Returns a map of capability → grant context.
 */
export async function loadAllAppCapabilityGrants(
  appSlug: string,
): Promise<Map<string, AppCapabilityGrantContext>> {
  const grants = await prisma.appCapabilityGrant.findMany({
    where: { appSlug },
  })

  const grantMap = new Map<string, AppCapabilityGrantContext>()

  for (const grant of grants) {
    grantMap.set(grant.capability, {
      appSlug: grant.appSlug,
      capability: grant.capability as CapabilityKey,
      enabled: grant.enabled,
      qualityFloor: grant.qualityFloor,
      budgetPolicy: grant.budgetPolicy,
      maxCostPerRequest: grant.maxCostPerRequest,
      maxCostPerWorkflow: grant.maxCostPerWorkflow,
      latencyPreference: grant.latencyPreference,
      allowFallback: grant.allowFallback,
      maxFallbackAttempts: grant.maxFallbackAttempts,
      liveProofRequired: grant.liveProofRequired,
      approvalRequired: grant.approvalRequired,
      artifactRead: grant.artifactRead,
      artifactWrite: grant.artifactWrite,
      memoryRead: grant.memoryRead,
      memoryWrite: grant.memoryWrite,
      ragNamespaces: parseJsonArray(grant.ragNamespaces),
      policyProfile: grant.policyProfile,
      adultPermission: grant.adultPermission,
      dataRetentionPolicy: grant.dataRetentionPolicy,
      passthroughModelAllowed: grant.passthroughModelAllowed,
      providerResidencyConstraints: parseJsonArray(grant.providerResidencyConstraints),
    })
  }

  return grantMap
}

/**
 * Creates or updates an app capability grant.
 */
export async function upsertAppCapabilityGrant(
  appSlug: string,
  capability: CapabilityKey,
  data: Partial<Omit<AppCapabilityGrantContext, 'appSlug' | 'capability'>>,
): Promise<AppCapabilityGrantContext> {
  const grant = await prisma.appCapabilityGrant.upsert({
    where: {
      app_capability_grant_unique: {
        appSlug,
        capability,
      },
    },
    create: {
      appSlug,
      capability,
      enabled: data.enabled ?? true,
      qualityFloor: data.qualityFloor ?? 'balanced',
      budgetPolicy: data.budgetPolicy ?? 'balanced',
      maxCostPerRequest: data.maxCostPerRequest ?? 0,
      maxCostPerWorkflow: data.maxCostPerWorkflow ?? 0,
      latencyPreference: data.latencyPreference ?? 'medium',
      allowFallback: data.allowFallback ?? true,
      maxFallbackAttempts: data.maxFallbackAttempts ?? 3,
      liveProofRequired: data.liveProofRequired ?? false,
      approvalRequired: data.approvalRequired ?? false,
      artifactRead: data.artifactRead ?? true,
      artifactWrite: data.artifactWrite ?? true,
      memoryRead: data.memoryRead ?? false,
      memoryWrite: data.memoryWrite ?? false,
      ragNamespaces: JSON.stringify(data.ragNamespaces ?? []),
      policyProfile: data.policyProfile ?? 'standard',
      adultPermission: data.adultPermission ?? false,
      dataRetentionPolicy: data.dataRetentionPolicy ?? 'default',
      passthroughModelAllowed: data.passthroughModelAllowed ?? false,
      providerResidencyConstraints: JSON.stringify(data.providerResidencyConstraints ?? []),
    },
    update: {
      enabled: data.enabled,
      qualityFloor: data.qualityFloor,
      budgetPolicy: data.budgetPolicy,
      maxCostPerRequest: data.maxCostPerRequest,
      maxCostPerWorkflow: data.maxCostPerWorkflow,
      latencyPreference: data.latencyPreference,
      allowFallback: data.allowFallback,
      maxFallbackAttempts: data.maxFallbackAttempts,
      liveProofRequired: data.liveProofRequired,
      approvalRequired: data.approvalRequired,
      artifactRead: data.artifactRead,
      artifactWrite: data.artifactWrite,
      memoryRead: data.memoryRead,
      memoryWrite: data.memoryWrite,
      ragNamespaces: data.ragNamespaces ? JSON.stringify(data.ragNamespaces) : undefined,
      policyProfile: data.policyProfile,
      adultPermission: data.adultPermission,
      dataRetentionPolicy: data.dataRetentionPolicy,
      passthroughModelAllowed: data.passthroughModelAllowed,
      providerResidencyConstraints: data.providerResidencyConstraints ? JSON.stringify(data.providerResidencyConstraints) : undefined,
    },
  })

  return {
    appSlug: grant.appSlug,
    capability: grant.capability as CapabilityKey,
    enabled: grant.enabled,
    qualityFloor: grant.qualityFloor,
    budgetPolicy: grant.budgetPolicy,
    maxCostPerRequest: grant.maxCostPerRequest,
    maxCostPerWorkflow: grant.maxCostPerWorkflow,
    latencyPreference: grant.latencyPreference,
    allowFallback: grant.allowFallback,
    maxFallbackAttempts: grant.maxFallbackAttempts,
    liveProofRequired: grant.liveProofRequired,
    approvalRequired: grant.approvalRequired,
    artifactRead: grant.artifactRead,
    artifactWrite: grant.artifactWrite,
    memoryRead: grant.memoryRead,
    memoryWrite: grant.memoryWrite,
    ragNamespaces: parseJsonArray(grant.ragNamespaces),
    policyProfile: grant.policyProfile,
    adultPermission: grant.adultPermission,
    dataRetentionPolicy: grant.dataRetentionPolicy,
    passthroughModelAllowed: grant.passthroughModelAllowed,
    providerResidencyConstraints: parseJsonArray(grant.providerResidencyConstraints),
  }
}

/**
 * Deletes an app capability grant.
 */
export async function deleteAppCapabilityGrant(
  appSlug: string,
  capability: CapabilityKey,
): Promise<boolean> {
  try {
    await prisma.appCapabilityGrant.delete({
      where: {
        app_capability_grant_unique: {
          appSlug,
          capability,
        },
      },
    })
    return true
  } catch {
    return false
  }
}

function parseJsonArray(value: string): string[] {
  try {
    const parsed = JSON.parse(value)
    return Array.isArray(parsed) ? parsed : []
  } catch {
    return []
  }
}
