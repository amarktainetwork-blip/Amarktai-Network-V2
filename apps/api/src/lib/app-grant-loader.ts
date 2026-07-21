/**
 * App Grant Loader — loads app capability grants from database.
 *
 * This is the single API-layer component that loads app grants.
 * It queries the AppCapabilityGrant table and returns typed grant contexts.
 */

import { prisma } from '@amarktai/db'
import { getInternalDashboardApps, type AppCapabilityGrantContext, type CapabilityKey } from '@amarktai/core'

type GrantRecord = Awaited<ReturnType<typeof prisma.appCapabilityGrant.findFirst>>

function toGrantContext(grant: NonNullable<GrantRecord>): AppCapabilityGrantContext {
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
    routingMode: grant.routingMode as AppCapabilityGrantContext['routingMode'],
    qualityTarget: grant.qualityTarget as AppCapabilityGrantContext['qualityTarget'],
    spendStrategy: grant.spendStrategy as AppCapabilityGrantContext['spendStrategy'],
    fixedRoute: grant.fixedProvider && grant.fixedModel ? `${grant.fixedProvider}/${grant.fixedModel}` : null,
    preferredPool: parseJsonArray(grant.preferredPool),
    selectableAllowlist: parseJsonArray(grant.selectableAllowlist),
    restrictedPool: parseJsonArray(grant.restrictedPool),
    workflowStepOverrides: parseJsonObject(grant.workflowStepOverrides),
  }
}

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

  return toGrantContext(grant)
}

/**
 * Resolves the immutable runtime authority used for a new job. The legacy
 * allowedCapabilities list is accepted only as an explicit migration input;
 * after this point every runtime consumer uses the returned grant snapshot.
 */
export async function resolveAppCapabilityGrantSnapshot(
  appSlug: string,
  capability: CapabilityKey,
  legacyAllowedCapabilities: readonly string[] = [],
): Promise<{ grant: AppCapabilityGrantContext; source: 'app_capability_grant' | 'legacy_migration' } | null> {
  const stored = await loadAppCapabilityGrant(appSlug, capability)
  if (stored) return { grant: Object.freeze({ ...stored }), source: 'app_capability_grant' }
  if (!legacyAllowedCapabilities.includes(capability)) return null

  const migrated: AppCapabilityGrantContext = {
    appSlug,
    capability,
    enabled: true,
    qualityFloor: 'balanced',
    budgetPolicy: 'balanced',
    maxCostPerRequest: 0,
    maxCostPerWorkflow: 0,
    latencyPreference: 'medium',
    allowFallback: true,
    maxFallbackAttempts: 3,
    liveProofRequired: false,
    approvalRequired: false,
    artifactRead: true,
    artifactWrite: true,
    memoryRead: false,
    memoryWrite: false,
    ragNamespaces: [],
    policyProfile: 'legacy_migration',
    adultPermission: false,
    dataRetentionPolicy: 'default',
    passthroughModelAllowed: false,
    providerResidencyConstraints: [],
    routingMode: 'automatic', qualityTarget: 'standard', spendStrategy: 'best_value', fixedRoute: null,
    preferredPool: [], selectableAllowlist: [], restrictedPool: [], workflowStepOverrides: {},
  }
  return { grant: Object.freeze(migrated), source: 'legacy_migration' }
}

/**
 * Builds the server-controlled authority for an authenticated Network operator
 * dashboard request. External-app commercial policy is deliberately removed,
 * while safety and artifact/memory permissions remain sourced from the stored
 * grant. Callers cannot select this profile from request data.
 */
export async function resolveInternalDashboardCapabilityGrantSnapshot(
  appSlug: string,
  capability: CapabilityKey,
): Promise<{ grant: AppCapabilityGrantContext; source: 'internal_dashboard' } | null> {
  const definition = getInternalDashboardApps().find((app) => app.appSlug === appSlug)
  if (!definition?.capabilities.includes(capability)) return null

  const stored = await loadAppCapabilityGrant(appSlug, capability)
  const grant: AppCapabilityGrantContext = {
    appSlug,
    capability,
    enabled: true,
    qualityFloor: 'balanced',
    budgetPolicy: 'balanced',
    maxCostPerRequest: 0,
    maxCostPerWorkflow: 0,
    latencyPreference: 'medium',
    allowFallback: true,
    maxFallbackAttempts: 3,
    liveProofRequired: false,
    approvalRequired: false,
    artifactRead: stored?.artifactRead ?? true,
    artifactWrite: stored?.artifactWrite ?? true,
    memoryRead: stored?.memoryRead ?? false,
    memoryWrite: stored?.memoryWrite ?? false,
    ragNamespaces: stored?.ragNamespaces ?? [],
    policyProfile: 'internal_dashboard',
    adultPermission: stored?.adultPermission ?? false,
    dataRetentionPolicy: stored?.dataRetentionPolicy ?? 'default',
    passthroughModelAllowed: false,
    providerResidencyConstraints: [],
    routingMode: stored?.routingMode ?? 'automatic',
    qualityTarget: stored?.qualityTarget ?? 'standard',
    spendStrategy: stored?.spendStrategy ?? 'best_value',
    fixedRoute: stored?.fixedRoute ?? null,
    preferredPool: stored?.preferredPool ?? [],
    selectableAllowlist: stored?.selectableAllowlist ?? [],
    restrictedPool: stored?.restrictedPool ?? [],
    workflowStepOverrides: stored?.workflowStepOverrides ?? {},
  }
  return { grant: Object.freeze(grant), source: 'internal_dashboard' }
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
    grantMap.set(grant.capability, toGrantContext(grant))
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
      routingMode: data.routingMode ?? 'automatic',
      qualityTarget: data.qualityTarget ?? 'standard',
      spendStrategy: data.spendStrategy ?? 'best_value',
      fixedProvider: data.fixedRoute?.split('/')[0] ?? '',
      fixedModel: data.fixedRoute?.split('/').slice(1).join('/') ?? '',
      preferredPool: JSON.stringify(data.preferredPool ?? []),
      selectableAllowlist: JSON.stringify(data.selectableAllowlist ?? []),
      restrictedPool: JSON.stringify(data.restrictedPool ?? []),
      workflowStepOverrides: JSON.stringify(data.workflowStepOverrides ?? {}),
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
      routingMode: data.routingMode,
      qualityTarget: data.qualityTarget,
      spendStrategy: data.spendStrategy,
      fixedProvider: data.fixedRoute === undefined ? undefined : data.fixedRoute?.split('/')[0] ?? '',
      fixedModel: data.fixedRoute === undefined ? undefined : data.fixedRoute?.split('/').slice(1).join('/') ?? '',
      preferredPool: data.preferredPool ? JSON.stringify(data.preferredPool) : undefined,
      selectableAllowlist: data.selectableAllowlist ? JSON.stringify(data.selectableAllowlist) : undefined,
      restrictedPool: data.restrictedPool ? JSON.stringify(data.restrictedPool) : undefined,
      workflowStepOverrides: data.workflowStepOverrides ? JSON.stringify(data.workflowStepOverrides) : undefined,
    },
  })

  return toGrantContext(grant)
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

function parseJsonObject(value: string): Record<string, unknown> {
  try {
    const parsed = JSON.parse(value)
    return typeof parsed === 'object' && parsed !== null && !Array.isArray(parsed) ? parsed : {}
  } catch {
    return {}
  }
}
