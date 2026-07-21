import { createHash } from 'node:crypto'
import { prisma } from '@amarktai/db'
import {
  BrandProfileSchema,
  type BrandProfile,
} from '@amarktai/core/marketing-platform'

export const BRAND_PROFILE_ARTIFACT_TYPE = 'document'
export const BRAND_PROFILE_ARTIFACT_SUBTYPE = 'brand_profile'

export function brandProfileArtifactId(appSlug: string, brandProfileId: string): string {
  const digest = createHash('sha256')
    .update(`${appSlug}:${brandProfileId}`)
    .digest('hex')
    .slice(0, 40)
  return `brand-${digest}`
}

export function serializeBrandProfile(profileInput: BrandProfile): string {
  const profile = BrandProfileSchema.parse(profileInput)
  return JSON.stringify(profile)
}

export function parseStoredBrandProfile(metadata: string): BrandProfile {
  let parsed: unknown
  try {
    parsed = JSON.parse(metadata)
  } catch {
    throw new Error('Stored Brand Profile metadata is not valid JSON')
  }
  return BrandProfileSchema.parse(parsed)
}

function artifactData(profile: BrandProfile) {
  const metadata = serializeBrandProfile(profile)
  return {
    appSlug: profile.appSlug,
    type: BRAND_PROFILE_ARTIFACT_TYPE,
    subType: BRAND_PROFILE_ARTIFACT_SUBTYPE,
    title: profile.displayName,
    description: profile.summary,
    provider: 'amarktai-network',
    model: 'brand-profile-v1',
    traceId: '',
    storageDriver: 'database',
    storagePath: '',
    storageUrl: '',
    mimeType: 'application/json',
    fileSizeBytes: Buffer.byteLength(metadata, 'utf8'),
    previewable: false,
    downloadable: false,
    status: 'completed',
    errorMessage: '',
    costUsdCents: 0,
    metadata,
  }
}

export async function listBrandProfiles(appSlug: string): Promise<{
  profiles: BrandProfile[]
  invalidRecords: Array<{ artifactId: string; reason: string }>
}> {
  const records = await prisma.artifact.findMany({
    where: {
      appSlug,
      type: BRAND_PROFILE_ARTIFACT_TYPE,
      subType: BRAND_PROFILE_ARTIFACT_SUBTYPE,
    },
    orderBy: { updatedAt: 'desc' },
  })

  const profiles: BrandProfile[] = []
  const invalidRecords: Array<{ artifactId: string; reason: string }> = []
  for (const record of records) {
    try {
      profiles.push(parseStoredBrandProfile(record.metadata))
    } catch (error) {
      invalidRecords.push({
        artifactId: record.id,
        reason: error instanceof Error ? error.message : 'Invalid Brand Profile record',
      })
    }
  }
  return { profiles, invalidRecords }
}

export async function getBrandProfile(appSlug: string, brandProfileId: string): Promise<BrandProfile | null> {
  const id = brandProfileArtifactId(appSlug, brandProfileId)
  const record = await prisma.artifact.findFirst({
    where: {
      id,
      appSlug,
      type: BRAND_PROFILE_ARTIFACT_TYPE,
      subType: BRAND_PROFILE_ARTIFACT_SUBTYPE,
    },
  })
  return record ? parseStoredBrandProfile(record.metadata) : null
}

export async function createBrandProfile(profileInput: BrandProfile): Promise<BrandProfile> {
  const profile = BrandProfileSchema.parse(profileInput)
  const id = brandProfileArtifactId(profile.appSlug, profile.brandProfileId)
  const existing = await prisma.artifact.findUnique({ where: { id } })
  if (existing) throw new Error('BRAND_PROFILE_ALREADY_EXISTS')

  await prisma.artifact.create({
    data: {
      id,
      ...artifactData(profile),
    },
  })
  return profile
}

export async function updateBrandProfile(profileInput: BrandProfile): Promise<BrandProfile> {
  const profile = BrandProfileSchema.parse(profileInput)
  const id = brandProfileArtifactId(profile.appSlug, profile.brandProfileId)
  const updated = await prisma.artifact.updateMany({
    where: {
      id,
      appSlug: profile.appSlug,
      type: BRAND_PROFILE_ARTIFACT_TYPE,
      subType: BRAND_PROFILE_ARTIFACT_SUBTYPE,
    },
    data: artifactData(profile),
  })
  if (!updated.count) throw new Error('BRAND_PROFILE_NOT_FOUND')
  return profile
}

export async function archiveBrandProfile(
  appSlug: string,
  brandProfileId: string,
  archivedAt = new Date(),
): Promise<BrandProfile> {
  const current = await getBrandProfile(appSlug, brandProfileId)
  if (!current) throw new Error('BRAND_PROFILE_NOT_FOUND')
  const archived = BrandProfileSchema.parse({
    ...current,
    status: 'archived',
    updatedAt: archivedAt.toISOString(),
  })
  return updateBrandProfile(archived)
}
