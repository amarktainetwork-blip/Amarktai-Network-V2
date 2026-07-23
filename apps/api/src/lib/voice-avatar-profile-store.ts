import { prisma } from '@amarktai/db'
import {
  ReusableAvatarProfileSchema,
  ReusableVoiceProfileSchema,
  type ProfileRightsDecision,
  type ReusableAvatarProfile,
  type ReusableVoiceProfile,
} from '@amarktai/core/voice-avatar-platform'
import {
  avatarProfileArtifactId,
  voiceProfileArtifactId,
  type VoiceAvatarProfileDecision,
} from '@amarktai/core/voice-avatar-resources'

export { avatarProfileArtifactId, voiceProfileArtifactId }

export const VOICE_PROFILE_ARTIFACT_SUBTYPE = 'voice_profile'
export const AVATAR_PROFILE_ARTIFACT_SUBTYPE = 'avatar_profile'
const PROFILE_ARTIFACT_TYPE = 'document'

function parseMetadata(metadata: string): unknown {
  try { return JSON.parse(metadata) } catch { throw new Error('Stored profile metadata is not valid JSON') }
}

export function parseStoredVoiceProfile(metadata: string): ReusableVoiceProfile {
  return ReusableVoiceProfileSchema.parse(parseMetadata(metadata))
}

export function parseStoredAvatarProfile(metadata: string): ReusableAvatarProfile {
  return ReusableAvatarProfileSchema.parse(parseMetadata(metadata))
}

function artifactData(profile: ReusableVoiceProfile | ReusableAvatarProfile, subType: string) {
  const metadata = JSON.stringify(profile)
  return {
    appSlug: profile.appSlug,
    type: PROFILE_ARTIFACT_TYPE,
    subType,
    title: profile.displayName,
    description: profile.description,
    provider: 'amarktai-network',
    model: subType === VOICE_PROFILE_ARTIFACT_SUBTYPE ? 'voice-profile-v1' : 'avatar-profile-v1',
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

async function listProfiles<T>(input: {
  appSlug: string
  subType: string
  parse: (metadata: string) => T
}): Promise<{ profiles: T[]; invalidRecords: Array<{ artifactId: string; reason: string }> }> {
  const records = await prisma.artifact.findMany({
    where: { appSlug: input.appSlug, type: PROFILE_ARTIFACT_TYPE, subType: input.subType },
    orderBy: { updatedAt: 'desc' },
  })
  const profiles: T[] = []
  const invalidRecords: Array<{ artifactId: string; reason: string }> = []
  for (const record of records) {
    try { profiles.push(input.parse(record.metadata)) }
    catch (error) { invalidRecords.push({ artifactId: record.id, reason: error instanceof Error ? error.message : 'Invalid profile record' }) }
  }
  return { profiles, invalidRecords }
}

export function listVoiceProfiles(appSlug: string) {
  return listProfiles({ appSlug, subType: VOICE_PROFILE_ARTIFACT_SUBTYPE, parse: parseStoredVoiceProfile })
}

export function listAvatarProfiles(appSlug: string) {
  return listProfiles({ appSlug, subType: AVATAR_PROFILE_ARTIFACT_SUBTYPE, parse: parseStoredAvatarProfile })
}

export async function getVoiceProfile(appSlug: string, voiceProfileId: string): Promise<ReusableVoiceProfile | null> {
  const record = await prisma.artifact.findFirst({
    where: { id: voiceProfileArtifactId(appSlug, voiceProfileId), appSlug, type: PROFILE_ARTIFACT_TYPE, subType: VOICE_PROFILE_ARTIFACT_SUBTYPE },
  })
  return record ? parseStoredVoiceProfile(record.metadata) : null
}

export async function getAvatarProfile(appSlug: string, avatarProfileId: string): Promise<ReusableAvatarProfile | null> {
  const record = await prisma.artifact.findFirst({
    where: { id: avatarProfileArtifactId(appSlug, avatarProfileId), appSlug, type: PROFILE_ARTIFACT_TYPE, subType: AVATAR_PROFILE_ARTIFACT_SUBTYPE },
  })
  return record ? parseStoredAvatarProfile(record.metadata) : null
}

export async function createVoiceProfile(profileInput: ReusableVoiceProfile): Promise<ReusableVoiceProfile> {
  const profile = ReusableVoiceProfileSchema.parse(profileInput)
  const id = voiceProfileArtifactId(profile.appSlug, profile.voiceProfileId)
  if (await prisma.artifact.findUnique({ where: { id } })) throw new Error('VOICE_PROFILE_ALREADY_EXISTS')
  await prisma.artifact.create({ data: { id, ...artifactData(profile, VOICE_PROFILE_ARTIFACT_SUBTYPE) } })
  return profile
}

export async function createAvatarProfile(profileInput: ReusableAvatarProfile): Promise<ReusableAvatarProfile> {
  const profile = ReusableAvatarProfileSchema.parse(profileInput)
  const id = avatarProfileArtifactId(profile.appSlug, profile.avatarProfileId)
  if (await prisma.artifact.findUnique({ where: { id } })) throw new Error('AVATAR_PROFILE_ALREADY_EXISTS')
  await prisma.artifact.create({ data: { id, ...artifactData(profile, AVATAR_PROFILE_ARTIFACT_SUBTYPE) } })
  return profile
}

export async function updateVoiceProfile(profileInput: ReusableVoiceProfile): Promise<ReusableVoiceProfile> {
  const profile = ReusableVoiceProfileSchema.parse(profileInput)
  const updated = await prisma.artifact.updateMany({
    where: { id: voiceProfileArtifactId(profile.appSlug, profile.voiceProfileId), appSlug: profile.appSlug, type: PROFILE_ARTIFACT_TYPE, subType: VOICE_PROFILE_ARTIFACT_SUBTYPE },
    data: artifactData(profile, VOICE_PROFILE_ARTIFACT_SUBTYPE),
  })
  if (!updated.count) throw new Error('VOICE_PROFILE_NOT_FOUND')
  return profile
}

export async function updateAvatarProfile(profileInput: ReusableAvatarProfile): Promise<ReusableAvatarProfile> {
  const profile = ReusableAvatarProfileSchema.parse(profileInput)
  const updated = await prisma.artifact.updateMany({
    where: { id: avatarProfileArtifactId(profile.appSlug, profile.avatarProfileId), appSlug: profile.appSlug, type: PROFILE_ARTIFACT_TYPE, subType: AVATAR_PROFILE_ARTIFACT_SUBTYPE },
    data: artifactData(profile, AVATAR_PROFILE_ARTIFACT_SUBTYPE),
  })
  if (!updated.count) throw new Error('AVATAR_PROFILE_NOT_FOUND')
  return profile
}

export async function archiveVoiceProfile(appSlug: string, voiceProfileId: string, at = new Date()): Promise<ReusableVoiceProfile> {
  const current = await getVoiceProfile(appSlug, voiceProfileId)
  if (!current) throw new Error('VOICE_PROFILE_NOT_FOUND')
  if (current.status === 'revoked') throw new Error('VOICE_PROFILE_REVOKED')
  return updateVoiceProfile({ ...current, status: 'archived', updatedAt: at.toISOString() })
}

export async function archiveAvatarProfile(appSlug: string, avatarProfileId: string, at = new Date()): Promise<ReusableAvatarProfile> {
  const current = await getAvatarProfile(appSlug, avatarProfileId)
  if (!current) throw new Error('AVATAR_PROFILE_NOT_FOUND')
  if (current.status === 'revoked') throw new Error('AVATAR_PROFILE_REVOKED')
  return updateAvatarProfile({ ...current, status: 'archived', updatedAt: at.toISOString() })
}

function ensureConsentCurrent(profile: ReusableVoiceProfile | ReusableAvatarProfile, at: Date): void {
  const consent = 'voiceProfileId' in profile
    ? profile.consentEvidence
    : profile.source.subjectType === 'human_likeness'
      ? profile.source.consentEvidence
      : undefined
  if (consent?.expiresAt && new Date(consent.expiresAt).getTime() <= at.getTime()) throw new Error('PROFILE_CONSENT_EXPIRED')
}

function ensureDecisionAllowed(status: ReusableVoiceProfile['status'] | ReusableAvatarProfile['status'], decision: VoiceAvatarProfileDecision['decision']): void {
  if (status === 'revoked' && decision !== 'revoked') throw new Error('PROFILE_REVOKED')
  if (status === 'archived' && decision !== 'revoked') throw new Error('PROFILE_ARCHIVED')
}

function rightsDecision(input: { decision: VoiceAvatarProfileDecision; at: Date }): ProfileRightsDecision {
  return {
    decision: input.decision.decision,
    verifierReference: input.decision.verifierReference,
    decidedAt: input.at.toISOString(),
    notes: input.decision.notes,
  }
}

export async function decideVoiceProfile(input: {
  appSlug: string
  voiceProfileId: string
  decision: VoiceAvatarProfileDecision
  at?: Date
}): Promise<ReusableVoiceProfile> {
  const current = await getVoiceProfile(input.appSlug, input.voiceProfileId)
  if (!current) throw new Error('VOICE_PROFILE_NOT_FOUND')
  const at = input.at ?? new Date()
  ensureDecisionAllowed(current.status, input.decision.decision)
  const durableDecision = rightsDecision({ decision: input.decision, at })
  if (input.decision.decision === 'verified') {
    ensureConsentCurrent(current, at)
    return updateVoiceProfile({
      ...current,
      status: 'verified',
      rightsStatus: 'verified',
      rightsDecision: durableDecision,
      updatedAt: at.toISOString(),
      revokedAt: undefined,
      revocationReason: undefined,
    })
  }
  if (input.decision.decision === 'rejected') {
    return updateVoiceProfile({
      ...current,
      status: 'draft',
      rightsStatus: 'rejected',
      rightsDecision: durableDecision,
      updatedAt: at.toISOString(),
      revokedAt: undefined,
      revocationReason: undefined,
    })
  }
  return updateVoiceProfile({
    ...current,
    status: 'revoked',
    rightsStatus: 'revoked',
    rightsDecision: durableDecision,
    updatedAt: at.toISOString(),
    revokedAt: at.toISOString(),
    revocationReason: input.decision.notes || `Revoked by ${input.decision.verifierReference}`,
  })
}

export async function decideAvatarProfile(input: {
  appSlug: string
  avatarProfileId: string
  decision: VoiceAvatarProfileDecision
  at?: Date
}): Promise<ReusableAvatarProfile> {
  const current = await getAvatarProfile(input.appSlug, input.avatarProfileId)
  if (!current) throw new Error('AVATAR_PROFILE_NOT_FOUND')
  const at = input.at ?? new Date()
  ensureDecisionAllowed(current.status, input.decision.decision)
  const durableDecision = rightsDecision({ decision: input.decision, at })
  if (input.decision.decision === 'verified') {
    ensureConsentCurrent(current, at)
    return updateAvatarProfile({
      ...current,
      status: 'verified',
      rightsStatus: 'verified',
      rightsDecision: durableDecision,
      updatedAt: at.toISOString(),
      revokedAt: undefined,
      revocationReason: undefined,
    })
  }
  if (input.decision.decision === 'rejected') {
    return updateAvatarProfile({
      ...current,
      status: 'draft',
      rightsStatus: 'rejected',
      rightsDecision: durableDecision,
      updatedAt: at.toISOString(),
      revokedAt: undefined,
      revocationReason: undefined,
    })
  }
  return updateAvatarProfile({
    ...current,
    status: 'revoked',
    rightsStatus: 'revoked',
    rightsDecision: durableDecision,
    updatedAt: at.toISOString(),
    revokedAt: at.toISOString(),
    revocationReason: input.decision.notes || `Revoked by ${input.decision.verifierReference}`,
  })
}
