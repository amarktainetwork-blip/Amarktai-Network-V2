import { readFileSync } from 'node:fs'
import { describe, expect, it } from 'vitest'
import {
  ReusableAvatarProfileSchema,
  ReusableVoiceProfileSchema,
} from '../packages/core/src/voice-avatar-platform.ts'
import {
  avatarProfileArtifactReferences,
  voiceProfileArtifactReferences,
} from '../packages/core/src/voice-avatar-resources.ts'
import {
  AVATAR_PROFILE_ARTIFACT_SUBTYPE,
  VOICE_PROFILE_ARTIFACT_SUBTYPE,
  avatarProfileArtifactId,
  parseStoredAvatarProfile,
  parseStoredVoiceProfile,
  voiceProfileArtifactId,
} from '../apps/api/src/lib/voice-avatar-profile-store.ts'

const store = readFileSync(new URL('../apps/api/src/lib/voice-avatar-profile-store.ts', import.meta.url), 'utf8')
const now = '2026-07-21T12:00:00.000Z'
const ids = {
  voice: '11111111-1111-4111-8111-111111111111',
  avatar: '22222222-2222-4222-8222-222222222222',
  audio: '33333333-3333-4333-8333-333333333333',
  identity: '44444444-4444-4444-8444-444444444444',
  consent: '55555555-5555-4555-8555-555555555555',
  recordingConsent: '88888888-8888-4888-8888-888888888888',
  portrait: '66666666-6666-4666-8666-666666666666',
  creation: '77777777-7777-4777-8777-777777777777',
}

function consent() {
  return {
    version: 1 as const,
    subjectReference: 'subject:1',
    rightsHolderReference: 'rights:1',
    subjectAgeConfirmedAdult: true as const,
    identityVerificationArtifactId: ids.identity,
    consentArtifactId: ids.consent,
    sourceRecordingConsentArtifactId: ids.recordingConsent,
    permittedUses: ['narration', 'avatar_performance'] as const,
    commercialUseAllowed: true,
    syntheticDisclosureRequired: true,
    revocable: true as const,
    declaredAt: '2026-07-21T10:00:00.000Z',
    verifiedAt: '2026-07-21T11:00:00.000Z',
    verifierReference: 'admin:1',
    jurisdictions: ['ZA'],
    notes: '',
  }
}

function voiceProfile() {
  return ReusableVoiceProfileSchema.parse({
    version: 1,
    voiceProfileId: ids.voice,
    appSlug: 'marketing-app',
    status: 'draft',
    displayName: 'Draft voice',
    description: 'Consented source recordings awaiting verification.',
    source: { sourceType: 'user_recording', sourceAudioArtifactIds: [ids.audio] },
    language: 'en',
    styleTags: [],
    permittedUses: ['narration'],
    rightsStatus: 'pending',
    consentEvidence: consent(),
    createdAt: now,
    updatedAt: now,
  })
}

function avatarProfile() {
  return ReusableAvatarProfileSchema.parse({
    version: 1,
    avatarProfileId: ids.avatar,
    appSlug: 'marketing-app',
    status: 'draft',
    displayName: 'Draft avatar',
    description: 'Synthetic portrait awaiting verification.',
    source: { subjectType: 'synthetic', portraitArtifactId: ids.portrait, creationEvidenceArtifactId: ids.creation },
    permittedUses: ['avatar_performance'],
    rightsStatus: 'pending',
    styleTags: [],
    createdAt: now,
    updatedAt: now,
  })
}

describe('voice and avatar profile artifact identity', () => {
  it('is deterministic, opaque and app isolated', () => {
    const voice = voiceProfileArtifactId('marketing-app', ids.voice)
    expect(voice).toMatch(/^voice-profile-[0-9a-f]{40}$/)
    expect(voice).toBe(voiceProfileArtifactId('marketing-app', ids.voice))
    expect(voice).not.toContain('marketing-app')
    expect(voice).not.toBe(voiceProfileArtifactId('horse-app', ids.voice))

    const avatar = avatarProfileArtifactId('marketing-app', ids.avatar)
    expect(avatar).toMatch(/^avatar-profile-[0-9a-f]{40}$/)
    expect(avatar).not.toBe(avatarProfileArtifactId('horse-app', ids.avatar))
  })

  it('uses distinct durable document subtypes', () => {
    expect(VOICE_PROFILE_ARTIFACT_SUBTYPE).toBe('voice_profile')
    expect(AVATAR_PROFILE_ARTIFACT_SUBTYPE).toBe('avatar_profile')
  })
})

describe('voice and avatar stored payloads', () => {
  it('round-trips validated draft profiles without granting rights', () => {
    const voice = voiceProfile()
    const avatar = avatarProfile()
    expect(parseStoredVoiceProfile(JSON.stringify(voice))).toEqual(voice)
    expect(parseStoredAvatarProfile(JSON.stringify(avatar))).toEqual(avatar)
    expect(voice.rightsStatus).toBe('pending')
    expect(avatar.rightsStatus).toBe('pending')
  })

  it('rejects corrupt stored JSON rather than fabricating resources', () => {
    expect(() => parseStoredVoiceProfile('{broken')).toThrow('Stored profile metadata is not valid JSON')
    expect(() => parseStoredAvatarProfile('{broken')).toThrow('Stored profile metadata is not valid JSON')
  })

  it('enumerates every app-owned artifact dependency with expected types', () => {
    expect(voiceProfileArtifactReferences(voiceProfile())).toEqual(expect.arrayContaining([
      { artifactId: ids.audio, role: 'source_audio', expectedTypes: ['audio'] },
      { artifactId: ids.identity, role: 'identity_verification', expectedTypes: ['document', 'image', 'video'] },
      { artifactId: ids.consent, role: 'consent', expectedTypes: ['document', 'audio', 'video'] },
      { artifactId: ids.recordingConsent, role: 'source_recording_consent', expectedTypes: ['document', 'audio', 'video'] },
    ]))
    expect(avatarProfileArtifactReferences(avatarProfile())).toEqual(expect.arrayContaining([
      { artifactId: ids.portrait, role: 'portrait', expectedTypes: ['image'] },
      { artifactId: ids.creation, role: 'creation_evidence', expectedTypes: ['document', 'image'] },
    ]))
  })
})

describe('admin rights decision persistence', () => {
  it('writes verifier, decision time and notes into the stored profile', () => {
    expect(store).toContain('rightsDecision: durableDecision')
    expect(store).toContain('verifierReference: input.verifierReference')
    expect(store).toContain('decidedAt: at.toISOString()')
    expect(store).toContain("if (status === 'revoked' && decision !== 'revoked') throw new Error('PROFILE_REVOKED')")
    expect(store).toContain("if (status === 'archived' && decision !== 'revoked') throw new Error('PROFILE_ARCHIVED')")
  })
})
