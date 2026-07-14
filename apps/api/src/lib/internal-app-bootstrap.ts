import { getInternalDashboardApps } from '@amarktai/core'
import { prisma } from '@amarktai/db'

interface BootstrapLogger {
  info: (...args: unknown[]) => void
}

export interface InternalAppBootstrapResult {
  insertedApps: string[]
  insertedGrants: string[]
}

/**
 * Inserts only missing defaults. Existing app records and administrator-edited
 * grants are never updated or re-enabled.
 */
export async function bootstrapInternalDashboardApps(log: BootstrapLogger): Promise<InternalAppBootstrapResult> {
  const definitions = getInternalDashboardApps()
  const insertedApps: string[] = []
  const insertedGrants: string[] = []

  for (const definition of definitions) {
    const existingApp = await prisma.appConnection.findUnique({ where: { appSlug: definition.appSlug } })
    if (!existingApp) {
      await prisma.appConnection.create({
        data: {
          appSlug: definition.appSlug,
          appName: definition.appName,
          status: 'active',
          allowedCapabilities: JSON.stringify(definition.capabilities),
          tokenBalance: 0,
        },
      })
      insertedApps.push(definition.appSlug)
    }

    for (const capability of definition.capabilities) {
      const key = { appSlug: definition.appSlug, capability }
      const existingGrant = await prisma.appCapabilityGrant.findUnique({
        where: { app_capability_grant_unique: key },
      })
      if (existingGrant) continue
      await prisma.appCapabilityGrant.create({
        data: {
          ...key,
          enabled: true,
          adultPermission: false,
          policyProfile: 'internal_dashboard_default',
          artifactRead: true,
          artifactWrite: true,
          passthroughModelAllowed: false,
        },
      })
      insertedGrants.push(`${definition.appSlug}/${capability}`)
    }
  }

  if (insertedApps.length || insertedGrants.length) {
    await prisma.platformBootstrapRun.create({
      data: {
        bootstrapKey: 'production-release-candidate-internal-apps-v1',
        insertedJson: JSON.stringify({ insertedApps, insertedGrants }),
      },
    })
  }

  log.info({ insertedApps, insertedGrants }, '[boot] Internal dashboard app defaults reconciled')
  return { insertedApps, insertedGrants }
}
