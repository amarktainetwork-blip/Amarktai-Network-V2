import {
  ARTIFACT_TYPES,
  RUNTIME_EXECUTION_PROVIDERS,
  isValidMimeForType,
  type ArtifactType,
} from '@amarktai/core'
import {
  evaluateVoiceProfileRights,
  type ReusableAvatarProfile,
  type ReusableVoiceProfile,
} from '@amarktai/core/voice-avatar-platform'
import {
  avatarProfileArtifactReferences,
  voiceProfileArtifactReferences,
} from '@amarktai/core/voice-avatar-resources'
import { prisma } from '@amarktai/db'
import { getVoiceProfile } from './voice-avatar-profile-store.js'

export class VoiceAvatarProfileDependencyError extends Error {
  constructor(
    public readonly code: string,
    message: string,
    public readonly details: Record<string, unknown> = {},
  ) {
    super(message)
    this.name = 'VoiceAvatarProfileDependencyError'
  }
}

type ArtifactReference = {
  artifactId: string
  role: string
  expectedTypes: readonly string[]
}

function dependencyError(code: string, message: string, details: Record<string, unknown> = {}): never {
  throw new VoiceAvatarProfileDependencyError(code, message, details)
}

export async function assertProfileArtifactReferences(appSlug: string, references: readonly ArtifactReference[]): Promise<void> {
  const ids = [...new Set(references.map((reference) => reference.artifactId))]
  if (!ids.length) return
  const artifacts = await prisma.artifact.findMany({
    where: { appSlug, id: { in: ids } },
    select: { id: true, appSlug: true, type: true, status: true, mimeType: true, fileSizeBytes: true },
  })
  const byId = new Map(artifacts.map((artifact) => [artifact.id, artifact]))

  for (const reference of references) {
    const artifact = byId.get(reference.artifactId)
    if (!artifact) {
      dependencyError('PROFILE_ARTIFACT_NOT_FOUND', `Required ${reference.role} artifact was not found for this app.`, {
        artifactId: reference.artifactId,
        role: reference.role,
      })
    }
    if (artifact.status !== 'completed' || artifact.fileSizeBytes <= 0) {
      dependencyError('PROFILE_ARTIFACT_NOT_READY', `Required ${reference.role} artifact is not complete.`, {
        artifactId: artifact.id,
        role: reference.role,
        status: artifact.status,
      })
    }
    if (!reference.expectedTypes.includes(artifact.type)) {
      dependencyError('PROFILE_ARTIFACT_TYPE_MISMATCH', `Required ${reference.role} artifact has an incompatible type.`, {
        artifactId: artifact.id,
        role: reference.role,
        actualType: artifact.type,
        expectedTypes: [...reference.expectedTypes],
      })
    }
    if ((ARTIFACT_TYPES as readonly string[]).includes(artifact.type)
      && !isValidMimeForType(artifact.type as ArtifactType, artifact.mimeType)) {
      dependencyError('PROFILE_ARTIFACT_MIME_MISMATCH', `Required ${reference.role} artifact has an incompatible MIME type.`, {
        artifactId: artifact.id,
        role: reference.role,
        actualType: artifact.type,
        mimeType: artifact.mimeType,
      })
    }
  }
}

async function assertCatalogueVoice(voiceId: string): Promise<void> {
  const voice = await prisma.voiceLibrary.findUnique({ where: { voiceId } })
  if (!voice || !voice.enabled) {
    dependencyError('VOICE_CATALOGUE_ENTRY_NOT_FOUND', 'The requested provider catalogue voice is not enabled.', { voiceId })
  }
  if (!(RUNTIME_EXECUTION_PROVIDERS as readonly string[]).includes(voice.provider)) {
    dependencyError('VOICE_CATALOGUE_PROVIDER_RESTRICTED', 'The catalogue voice is not hosted by an approved runtime provider.', {
      voiceId,
      provider: voice.provider,
    })
  }
  if (voice.consentStatus !== 'provider_catalogue' || voice.sourceType !== 'catalogue') {
    dependencyError('VOICE_CATALOGUE_RIGHTS_UNVERIFIED', 'The catalogue voice lacks provider catalogue rights evidence.', {
      voiceId,
      consentStatus: voice.consentStatus,
      sourceType: voice.sourceType,
    })
  }
}

export async function assertVoiceProfileDependencies(input: {
  profile: ReusableVoiceProfile
  requireVerifiedParent?: boolean
}): Promise<void> {
  await assertProfileArtifactReferences(input.profile.appSlug, voiceProfileArtifactReferences(input.profile))

  if (input.profile.source.sourceType === 'provider_catalogue') {
    await assertCatalogueVoice(input.profile.source.catalogueVoiceId)
  }

  if (input.profile.source.sourceType === 'voice_remix') {
    if (input.profile.source.parentVoiceProfileId === input.profile.voiceProfileId) {
      dependencyError('VOICE_PROFILE_SELF_REFERENCE', 'A voice profile cannot remix itself.')
    }
    const parent = await getVoiceProfile(input.profile.appSlug, input.profile.source.parentVoiceProfileId)
    if (!parent) dependencyError('PARENT_VOICE_PROFILE_NOT_FOUND', 'The parent voice profile was not found for this app.')
    for (const intendedUse of input.profile.permittedUses) {
      if (!parent.permittedUses.includes(intendedUse)) {
        dependencyError('PARENT_VOICE_USE_NOT_PERMITTED', `Parent voice profile does not permit '${intendedUse}'.`, { intendedUse })
      }
      if (input.requireVerifiedParent) {
        const rights = evaluateVoiceProfileRights({ profile: parent, intendedUse })
        if (!rights.allowed) {
          dependencyError('PARENT_VOICE_PROFILE_NOT_VERIFIED', 'The parent voice profile is not currently usable.', {
            intendedUse,
            reasons: rights.reasons,
          })
        }
      }
    }
  }
}

export async function assertAvatarProfileDependencies(input: {
  profile: ReusableAvatarProfile
  requireVerifiedVoice?: boolean
}): Promise<void> {
  await assertProfileArtifactReferences(input.profile.appSlug, avatarProfileArtifactReferences(input.profile))
  if (!input.profile.defaultVoiceProfileId) return

  const voice = await getVoiceProfile(input.profile.appSlug, input.profile.defaultVoiceProfileId)
  if (!voice) dependencyError('DEFAULT_VOICE_PROFILE_NOT_FOUND', 'The default voice profile was not found for this app.')
  if (!input.requireVerifiedVoice) return

  const requiredUses = new Set(['avatar_performance', ...(input.profile.permittedUses.includes('marketing') ? ['marketing'] : [])])
  for (const intendedUse of requiredUses) {
    const rights = evaluateVoiceProfileRights({ profile: voice, intendedUse: intendedUse as 'avatar_performance' | 'marketing' })
    if (!rights.allowed) {
      dependencyError('DEFAULT_VOICE_PROFILE_NOT_VERIFIED', 'The default voice profile is not currently usable for this avatar.', {
        intendedUse,
        reasons: rights.reasons,
      })
    }
  }
}
