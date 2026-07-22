import { describe, expect, it } from 'vitest'
import {
  validateSourceAudio,
  computeAudioChecksum,
  isSupportedAudioMime,
} from '../packages/core/src/source-audio-validation.js'
import {
  createVoiceCloneDomainService,
  createFixtureVoiceCloneProviderAdapter,
} from '../packages/core/src/voice-clone-contracts.js'
import {
  createVoiceConversionDomainService,
  createFixtureVoiceConversionProviderAdapter,
} from '../packages/core/src/voice-conversion-contracts.js'
import {
  createAudioToAudioDomainService,
  createFixtureAudioToAudioProviderAdapter,
  AUDIO_TO_AUDIO_OPERATIONS,
} from '../packages/core/src/audio-to-audio-contracts.js'

const ID = 'a0eebc99-9c0b-4ef8-bb6d-6bb9bd380a11'
const CONSENT_ID = 'a0eebc99-9c0b-4ef8-bb6d-6bb9bd380a12'
const RECORDING_CONSENT_ID = 'a0eebc99-9c0b-4ef8-bb6d-6bb9bd380a13'

function wav(durationSeconds = 2, sampleRate = 44100, channels = 1): Buffer {
  const bytesPerSample = 2
  const dataSize = Math.floor(durationSeconds * sampleRate * channels * bytesPerSample)
  const buffer = Buffer.alloc(44 + dataSize)
  buffer.write('RIFF', 0)
  buffer.writeUInt32LE(36 + dataSize, 4)
  buffer.write('WAVE', 8)
  buffer.write('fmt ', 12)
  buffer.writeUInt32LE(16, 16)
  buffer.writeUInt16LE(1, 20)
  buffer.writeUInt16LE(channels, 22)
  buffer.writeUInt32LE(sampleRate, 24)
  buffer.writeUInt32LE(sampleRate * channels * bytesPerSample, 28)
  buffer.writeUInt16LE(channels * bytesPerSample, 32)
  buffer.writeUInt16LE(16, 34)
  buffer.write('data', 36)
  buffer.writeUInt32LE(dataSize, 40)
  return buffer
}

function verifiedVoiceProfile(overrides: Record<string, unknown> = {}) {
  return {
    version: 1 as const,
    voiceProfileId: ID,
    appSlug: 'test-app',
    status: 'verified' as const,
    displayName: 'Verified test voice',
    description: '',
    source: { sourceType: 'user_recording' as const, sourceAudioArtifactIds: [ID] },
    language: 'en',
    locale: 'en-ZA',
    styleTags: [],
    permittedUses: ['narration' as const],
    rightsStatus: 'verified' as const,
    rightsDecision: {
      decision: 'verified' as const,
      verifierReference: 'admin:test',
      decidedAt: '2026-01-01T00:00:00.000Z',
      notes: '',
    },
    consentEvidence: {
      version: 1 as const,
      subjectReference: 'subject:test',
      rightsHolderReference: 'rights:test',
      subjectAgeConfirmedAdult: true as const,
      identityVerificationArtifactId: ID,
      consentArtifactId: CONSENT_ID,
      sourceRecordingConsentArtifactId: RECORDING_CONSENT_ID,
      permittedUses: ['narration' as const],
      commercialUseAllowed: true,
      syntheticDisclosureRequired: true,
      revocable: true as const,
      declaredAt: '2026-01-01T00:00:00.000Z',
      verifiedAt: '2026-01-01T01:00:00.000Z',
      verifierReference: 'admin:test',
      jurisdictions: ['ZA'],
      notes: '',
    },
    createdAt: '2026-01-01T00:00:00.000Z',
    updatedAt: '2026-01-01T00:00:00.000Z',
    ...overrides,
  }
}

const cloneRequest = {
  sourceAudioArtifactId: ID,
  voiceProfileId: ID,
  language: 'en',
  intendedUse: 'narration' as const,
  consentEvidenceReference: CONSENT_ID,
  rightsDeclarationReference: 'admin:test',
  qualityProfile: 'standard' as const,
  metadata: {},
}

const conversionRequest = {
  sourceAudioArtifactId: ID,
  targetVoiceProfileId: ID,
  intendedUse: 'narration' as const,
  preserveTiming: true,
  outputFormat: 'wav' as const,
  metadata: {},
}

describe('source audio validation', () => {
  it('validates real WAV structure and metadata', () => {
    const bytes = wav(3, 48000, 2)
    const result = validateSourceAudio({ artifactId: ID, appSlug: 'test-app', buffer: bytes, declaredMimeType: 'audio/wav' })
    expect(result.valid).toBe(true)
    expect(result.metadata?.durationSeconds).toBeCloseTo(3, 0)
    expect(result.metadata?.sampleRateHz).toBe(48000)
    expect(result.metadata?.channelCount).toBe(2)
    expect(computeAudioChecksum(bytes)).toMatch(/^[a-f0-9]{64}$/)
  })

  it('rejects empty, undersized, and mismatched audio', () => {
    expect(validateSourceAudio({ artifactId: ID, appSlug: 'test-app', buffer: Buffer.alloc(0), declaredMimeType: 'audio/wav' }).errorCode).toBe('ARTIFACT_NOT_FOUND')
    expect(validateSourceAudio({ artifactId: ID, appSlug: 'test-app', buffer: Buffer.alloc(100), declaredMimeType: 'audio/wav' }).errorCode).toBe('AUDIO_FILE_TOO_SMALL')
    expect(validateSourceAudio({ artifactId: ID, appSlug: 'test-app', buffer: wav(), declaredMimeType: 'audio/mpeg' }).errorCode).toBe('MIME_MISMATCH')
  })

  it('keeps the supported audio MIME allowlist explicit', () => {
    expect(isSupportedAudioMime('audio/wav')).toBe(true)
    expect(isSupportedAudioMime('audio/mpeg')).toBe(true)
    expect(isSupportedAudioMime('video/mp4')).toBe(false)
  })
})

describe('voice clone evidence', () => {
  it('validates the canonical request and blocks provider overrides', () => {
    const service = createVoiceCloneDomainService()
    expect(service.validateRequest(cloneRequest).success).toBe(true)
    expect(service.validateRequest({ ...cloneRequest, provider: 'forbidden' }).success).toBe(false)
  })

  it('classifies a missing executor without fixture evidence', async () => {
    const result = await createVoiceCloneDomainService().executeClone({
      appSlug: 'test-app', request: cloneRequest, voiceProfile: verifiedVoiceProfile() as any,
      sourceAudioBuffer: wav(), sourceMimeType: 'audio/wav',
    })
    expect(result.status).toBe('failed')
    expect(result.errorCode).toBe('VOICE_CLONE_PROVIDER_ROUTE_UNAVAILABLE')
    expect(result.evidence).toMatchObject({ evidenceSource: 'executor_unavailable', liveProviderProof: false })
  })

  it('uses local_fixture only for the explicit fixture adapter', async () => {
    const result = await createVoiceCloneDomainService(createFixtureVoiceCloneProviderAdapter()).executeClone({
      appSlug: 'test-app', request: cloneRequest, voiceProfile: verifiedVoiceProfile() as any,
      sourceAudioBuffer: wav(), sourceMimeType: 'audio/wav',
    })
    expect(result.status).toBe('accepted')
    expect(result.evidence).toMatchObject({ evidenceSource: 'local_fixture', liveProviderProof: false })
  })
})

describe('voice conversion evidence', () => {
  it('validates request fields and rejects app execution authority', () => {
    const service = createVoiceConversionDomainService()
    expect(service.validateRequest(conversionRequest).success).toBe(true)
    expect(service.validateRequest({ ...conversionRequest, providerVoiceId: 'forbidden' }).success).toBe(false)
  })

  it('classifies a missing executor without fixture evidence', async () => {
    const result = await createVoiceConversionDomainService().executeConversion({
      appSlug: 'test-app', request: conversionRequest, targetVoiceProfile: verifiedVoiceProfile() as any,
      sourceAudioBuffer: wav(), sourceMimeType: 'audio/wav',
    })
    expect(result.status).toBe('failed')
    expect(result.errorCode).toBe('VOICE_CONVERSION_PROVIDER_ROUTE_UNAVAILABLE')
    expect(result.evidence).toMatchObject({ evidenceSource: 'executor_unavailable', liveProviderProof: false })
  })

  it('uses local_fixture only for the explicit fixture adapter', async () => {
    const result = await createVoiceConversionDomainService(createFixtureVoiceConversionProviderAdapter()).executeConversion({
      appSlug: 'test-app', request: conversionRequest, targetVoiceProfile: verifiedVoiceProfile() as any,
      sourceAudioBuffer: wav(), sourceMimeType: 'audio/wav',
    })
    expect(result.status).toBe('accepted')
    expect(result.evidence).toMatchObject({ evidenceSource: 'local_fixture', liveProviderProof: false })
  })
})

describe('audio-to-audio evidence', () => {
  it('retains the complete operation catalogue', () => {
    for (const operation of ['voice_conversion', 'denoise', 'normalize', 'trim', 'resample', 'channel_convert', 'loudness_normalize']) {
      expect(AUDIO_TO_AUDIO_OPERATIONS).toContain(operation)
    }
  })

  it('classifies safe internal operations as internal_ffmpeg', async () => {
    const result = await createAudioToAudioDomainService().executeOperation({
      appSlug: 'test-app',
      request: { sourceAudioArtifactId: ID, operation: 'trim', outputFormat: 'wav', parameters: { startTime: 1000, endTime: 1500 }, metadata: {}, intendedUse: 'narration' },
      sourceAudioBuffer: wav(), sourceMimeType: 'audio/wav',
    })
    expect(result.status).toBe('accepted')
    expect(result.evidence).toMatchObject({ evidenceSource: 'internal_ffmpeg', liveProviderProof: false, operation: 'trim' })
  })

  it('classifies unsupported production operations as executor_unavailable', async () => {
    const result = await createAudioToAudioDomainService().executeOperation({
      appSlug: 'test-app',
      request: { sourceAudioArtifactId: ID, operation: 'denoise', outputFormat: 'wav', parameters: {}, metadata: {}, intendedUse: 'narration' },
      sourceAudioBuffer: wav(), sourceMimeType: 'audio/wav',
    })
    expect(result.status).toBe('failed')
    expect(result.evidence).toMatchObject({ evidenceSource: 'executor_unavailable', liveProviderProof: false })
  })

  it('uses local_fixture only for the explicit fixture adapter', async () => {
    const result = await createAudioToAudioDomainService(createFixtureAudioToAudioProviderAdapter()).executeOperation({
      appSlug: 'test-app',
      request: { sourceAudioArtifactId: ID, operation: 'denoise', outputFormat: 'wav', parameters: {}, metadata: {}, intendedUse: 'narration' },
      sourceAudioBuffer: wav(), sourceMimeType: 'audio/wav',
    })
    expect(result.status).toBe('accepted')
    expect(result.evidence).toMatchObject({ evidenceSource: 'local_fixture', liveProviderProof: false })
  })
})
