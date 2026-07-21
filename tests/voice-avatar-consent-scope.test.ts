import { describe, expect, it } from 'vitest'
import {
  ReusableAvatarProfileSchema,
  ReusableVoiceProfileSchema,
} from '../packages/core/src/voice-avatar-platform.ts'
import { VoiceAvatarProfileDecisionRequestSchema } from '../packages/core/src/voice-avatar-resources.ts'

const ids = {
  voice: '11111111-1111-4111-8111-111111111111',
  avatar: '22222222-2222-4222-8222-222222222222',
  audio: '33333333-3333-4333-8333-333333333333',
  identity: '44444444-4444-4444-8444-444444444444',
  consent: '55555555-5555-4555-8555-555555555555',
  recordingConsent: '66666666-6666-4666-8666-666666666666',
  portrait: '77777777-7777-4777-8777-777777777777',
}

function consent(overrides: Record<string, unknown> = {}) {
  return {
    version: 1,
    subjectReference: 'subject:adult-1',
    rightsHolderReference: 'rights-holder:1',
    subjectAgeConfirmedAdult: true,
    identityVerificationArtifactId: ids.identity,
    consentArtifactId: ids.consent,
    sourceRecordingConsentArtifactId: ids.recordingConsent,
    permittedUses: ['narration', 'avatar_performance'],
    commercialUseAllowed: false,
    syntheticDisclosureRequired: true,
    revocable: true,
    declaredAt: '2026-07-21T10:00:00.000Z',
    verifiedAt: '2026-07-21T11:00:00.000Z',
    verifierReference: 'admin:fixture',
    jurisdictions: ['ZA'],
    notes: '',
    ...overrides,
  }
}

function draftVoice(overrides: Record<string, unknown> = {}) {
  return {
    version: 1,
    voiceProfileId: ids.voice,
    appSlug: 'marketing-app',
    status: 'draft',
    displayName: 'Consented draft voice',
    description: '',
    source: { sourceType: 'user_recording', sourceAudioArtifactIds: [ids.audio] },
    language: 'en',
    styleTags: [],
    permittedUses: ['narration'],
    rightsStatus: 'pending',
    consentEvidence: consent(),
    createdAt: '2026-07-21T12:00:00.000Z',
    updatedAt: '2026-07-21T12:00:00.000Z',
    ...overrides,
  }
}

function draftHumanAvatar(overrides: Record<string, unknown> = {}) {
  return {
    version: 1,
    avatarProfileId: ids.avatar,
    appSlug: 'marketing-app',
    status: 'draft',
    displayName: 'Consented human avatar',
    description: '',
    source: { subjectType: 'human_likeness', portraitArtifactId: ids.portrait, consentEvidence: consent() },
    permittedUses: ['avatar_performance'],
    rightsStatus: 'pending',
    styleTags: [],
    createdAt: '2026-07-21T12:00:00.000Z',
    updatedAt: '2026-07-21T12:00:00.000Z',
    ...overrides,
  }
}

describe('voice and avatar consent scope', () => {
  it('requires explicit recording consent for human-derived voice cloning', () => {
    expect(ReusableVoiceProfileSchema.safeParse(draftVoice({
      consentEvidence: consent({ sourceRecordingConsentArtifactId: undefined }),
    })).success).toBe(false)
  })

  it('rejects voice uses outside the signed consent', () => {
    expect(ReusableVoiceProfileSchema.safeParse(draftVoice({ permittedUses: ['education'] })).success).toBe(false)
  })

  it('requires commercial-use consent for marketing voices and avatars', () => {
    expect(ReusableVoiceProfileSchema.safeParse(draftVoice({
      permittedUses: ['marketing'],
      consentEvidence: consent({ permittedUses: ['marketing'], commercialUseAllowed: false }),
    })).success).toBe(false)
    expect(ReusableAvatarProfileSchema.safeParse(draftHumanAvatar({
      permittedUses: ['marketing'],
      source: {
        subjectType: 'human_likeness',
        portraitArtifactId: ids.portrait,
        consentEvidence: consent({ permittedUses: ['marketing'], commercialUseAllowed: false }),
      },
    })).success).toBe(false)
  })

  it('rejects avatar uses outside the signed likeness consent', () => {
    expect(ReusableAvatarProfileSchema.safeParse(draftHumanAvatar({ permittedUses: ['education'] })).success).toBe(false)
  })

  it('does not accept a client-supplied verifier identity', () => {
    expect(VoiceAvatarProfileDecisionRequestSchema.safeParse({ decision: 'verified', notes: 'Approved.' }).success).toBe(true)
    expect(VoiceAvatarProfileDecisionRequestSchema.safeParse({
      decision: 'verified',
      verifierReference: 'spoofed-admin',
      notes: 'Approved.',
    }).success).toBe(false)
  })
})
