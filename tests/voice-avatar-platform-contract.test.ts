import { describe, expect, it } from 'vitest'
import {
  HumanConsentEvidenceSchema,
  RIGHTS_SENSITIVE_MEDIA_CAPABILITIES,
  ReusableAvatarProfileSchema,
  ReusableVoiceProfileSchema,
  VoiceAvatarExecutionRequestSchema,
  evaluateAvatarProfileRights,
  evaluateVoiceProfileRights,
  hasVoiceAvatarBlockedOverrides,
  type HumanConsentEvidence,
  type ReusableAvatarProfile,
  type ReusableVoiceProfile,
} from '../packages/core/src/voice-avatar-platform.ts'

const IDS = {
  identity: '11111111-1111-4111-8111-111111111111',
  consent: '22222222-2222-4222-8222-222222222222',
  recordingConsent: '33333333-3333-4333-8333-333333333333',
  audio: '44444444-4444-4444-8444-444444444444',
  audioTwo: '55555555-5555-4555-8555-555555555555',
  voice: '66666666-6666-4666-8666-666666666666',
  avatar: '77777777-7777-4777-8777-777777777777',
  portrait: '88888888-8888-4888-8888-888888888888',
  creation: '99999999-9999-4999-8999-999999999999',
  video: 'aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaaa',
}

function consent(overrides: Partial<HumanConsentEvidence> = {}): HumanConsentEvidence {
  return HumanConsentEvidenceSchema.parse({
    version: 1,
    subjectReference: 'subject:verified-adult-1',
    rightsHolderReference: 'rights-holder:1',
    subjectAgeConfirmedAdult: true,
    identityVerificationArtifactId: IDS.identity,
    consentArtifactId: IDS.consent,
    sourceRecordingConsentArtifactId: IDS.recordingConsent,
    permittedUses: ['narration', 'marketing', 'avatar_performance'],
    commercialUseAllowed: true,
    syntheticDisclosureRequired: true,
    revocable: true,
    declaredAt: '2026-07-20T10:00:00.000Z',
    verifiedAt: '2026-07-20T11:00:00.000Z',
    expiresAt: '2027-07-20T11:00:00.000Z',
    verifierReference: 'admin:fixture',
    jurisdictions: ['ZA'],
    notes: '',
    ...overrides,
  })
}

function voiceProfile(overrides: Partial<ReusableVoiceProfile> = {}): ReusableVoiceProfile {
  return ReusableVoiceProfileSchema.parse({
    version: 1,
    voiceProfileId: IDS.voice,
    appSlug: 'marketing-fixture',
    status: 'verified',
    displayName: 'Consented narrator',
    description: 'Verified reusable narration voice.',
    source: { sourceType: 'user_recording', sourceAudioArtifactIds: [IDS.audio, IDS.audioTwo] },
    language: 'en',
    locale: 'en-ZA',
    styleTags: ['warm', 'professional'],
    permittedUses: ['narration', 'marketing', 'avatar_performance'],
    rightsStatus: 'verified',
    consentEvidence: consent(),
    createdAt: '2026-07-20T12:00:00.000Z',
    updatedAt: '2026-07-20T12:00:00.000Z',
    ...overrides,
  })
}

function avatarProfile(overrides: Partial<ReusableAvatarProfile> = {}): ReusableAvatarProfile {
  return ReusableAvatarProfileSchema.parse({
    version: 1,
    avatarProfileId: IDS.avatar,
    appSlug: 'marketing-fixture',
    status: 'verified',
    displayName: 'Synthetic presenter',
    description: 'Synthetic brand presenter.',
    source: {
      subjectType: 'synthetic',
      portraitArtifactId: IDS.portrait,
      creationEvidenceArtifactId: IDS.creation,
    },
    permittedUses: ['marketing', 'avatar_performance'],
    rightsStatus: 'verified',
    defaultVoiceProfileId: IDS.voice,
    styleTags: ['studio'],
    createdAt: '2026-07-20T12:00:00.000Z',
    updatedAt: '2026-07-20T12:00:00.000Z',
    ...overrides,
  })
}

describe('governed voice and avatar platform contracts', () => {
  it('covers only the four non-adult rights-sensitive media capabilities', () => {
    expect([...RIGHTS_SENSITIVE_MEDIA_CAPABILITIES]).toEqual([
      'voice_clone', 'voice_conversion', 'lip_sync', 'avatar_generation',
    ])
    expect(RIGHTS_SENSITIVE_MEDIA_CAPABILITIES.some((capability) => capability.includes('adult') || capability.includes('3d'))).toBe(false)
  })

  it('accepts an adult-confirmed evidence-backed human voice profile', () => {
    const profile = voiceProfile()
    expect(profile.source.sourceType).toBe('user_recording')
    expect(profile.consentEvidence?.subjectAgeConfirmedAdult).toBe(true)
    expect(evaluateVoiceProfileRights({ profile, intendedUse: 'marketing', now: new Date('2026-08-01T00:00:00.000Z') })).toEqual({ allowed: true, reasons: [] })
  })

  it('rejects human-derived voices without consent and verified rights', () => {
    expect(ReusableVoiceProfileSchema.safeParse({
      ...voiceProfile(),
      status: 'verified',
      rightsStatus: 'pending',
      consentEvidence: undefined,
    }).success).toBe(false)
  })

  it('allows provider catalogue and synthetic voice sources without human consent', () => {
    const catalogue = voiceProfile({
      source: { sourceType: 'provider_catalogue', catalogueVoiceId: 'network-voice-tara' },
      consentEvidence: undefined,
      permittedUses: ['narration'],
    })
    expect(catalogue.source.sourceType).toBe('provider_catalogue')
    const synthetic = voiceProfile({
      source: { sourceType: 'synthetic_design', designPrompt: 'Warm neutral synthetic narrator.' },
      consentEvidence: undefined,
      permittedUses: ['narration'],
    })
    expect(synthetic.source.sourceType).toBe('synthetic_design')
  })

  it('fails closed on expired, revoked or unpermitted voice use', () => {
    const expired = evaluateVoiceProfileRights({
      profile: voiceProfile(),
      intendedUse: 'marketing',
      now: new Date('2028-01-01T00:00:00.000Z'),
    })
    expect(expired.allowed).toBe(false)
    expect(expired.reasons).toContain('Voice consent evidence has expired')

    const revoked = voiceProfile({
      status: 'revoked',
      rightsStatus: 'revoked',
      revokedAt: '2026-09-01T00:00:00.000Z',
      revocationReason: 'Subject revoked consent.',
    })
    const decision = evaluateVoiceProfileRights({ profile: revoked, intendedUse: 'customer_support' })
    expect(decision.allowed).toBe(false)
    expect(decision.reasons).toContain('Voice profile has been revoked')
    expect(decision.reasons).toContain("Use 'customer_support' is not permitted")
  })

  it('requires consent for human likeness avatars and supports synthetic avatars', () => {
    expect(avatarProfile().source.subjectType).toBe('synthetic')
    const human = avatarProfile({
      source: { subjectType: 'human_likeness', portraitArtifactId: IDS.portrait, consentEvidence: consent() },
    })
    expect(evaluateAvatarProfileRights({ profile: human, intendedUse: 'avatar_performance', now: new Date('2026-08-01T00:00:00.000Z') })).toEqual({ allowed: true, reasons: [] })
    expect(ReusableAvatarProfileSchema.safeParse({
      ...human,
      source: { subjectType: 'human_likeness', portraitArtifactId: IDS.portrait },
    }).success).toBe(false)
  })

  it('rejects every app-selected execution authority field', () => {
    for (const field of ['appSlug', 'provider', 'model', 'route', 'executorId', 'endpoint', 'apiKey', 'providerVoiceId', 'providerAvatarId']) {
      const request = {
        capability: 'voice_conversion',
        sourceAudioArtifactId: IDS.audio,
        targetVoiceProfileId: IDS.voice,
        intendedUse: 'narration',
        preserveTiming: true,
        outputFormat: 'wav',
        [field]: 'blocked',
      }
      expect(VoiceAvatarExecutionRequestSchema.safeParse(request).success, field).toBe(false)
      expect(hasVoiceAvatarBlockedOverrides(request)).toBe(field)
    }
  })

  it('validates clone, conversion, lip-sync and avatar outcome contracts', () => {
    expect(VoiceAvatarExecutionRequestSchema.safeParse({
      capability: 'voice_clone',
      displayName: 'New consented voice',
      sourceAudioArtifactIds: [IDS.audio],
      language: 'en',
      intendedUses: ['narration'],
      consentEvidence: consent(),
      previewText: 'This is a preview.',
    }).success).toBe(true)

    expect(VoiceAvatarExecutionRequestSchema.safeParse({
      capability: 'voice_conversion',
      sourceAudioArtifactId: IDS.audio,
      targetVoiceProfileId: IDS.voice,
      intendedUse: 'narration',
    }).success).toBe(true)

    expect(VoiceAvatarExecutionRequestSchema.safeParse({
      capability: 'lip_sync',
      avatarProfileId: IDS.avatar,
      sourceImageArtifactId: IDS.portrait,
      audioArtifactId: IDS.audio,
      intendedUse: 'avatar_performance',
      maxDurationSeconds: 30,
    }).success).toBe(false)

    expect(VoiceAvatarExecutionRequestSchema.safeParse({
      capability: 'lip_sync',
      sourceVideoArtifactId: IDS.video,
      audioArtifactId: IDS.audio,
      intendedUse: 'avatar_performance',
      maxDurationSeconds: 30,
    }).success).toBe(true)

    expect(VoiceAvatarExecutionRequestSchema.safeParse({
      capability: 'avatar_generation',
      avatarProfileId: IDS.avatar,
      script: 'Present the approved campaign message.',
      intendedUse: 'marketing',
      maxDurationSeconds: 30,
    }).success).toBe(false)

    expect(VoiceAvatarExecutionRequestSchema.safeParse({
      capability: 'avatar_generation',
      avatarProfileId: IDS.avatar,
      voiceProfileId: IDS.voice,
      script: 'Present the approved campaign message.',
      intendedUse: 'marketing',
      maxDurationSeconds: 30,
    }).success).toBe(true)
  })
})
