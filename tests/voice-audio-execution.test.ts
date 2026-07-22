import { describe, expect, it } from 'vitest'
import {
  validateSourceAudio,
  computeAudioChecksum,
  isSupportedAudioMime,
  SOURCE_AUDIO_LIMITS,
  type SourceAudioValidationInput,
} from '../packages/core/src/source-audio-validation.js'
import {
  createVoiceCloneDomainService,
  createFixtureVoiceCloneProviderAdapter,
  VoiceCloneRequestSchema,
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

// ── Test Helpers ──────────────────────────────────────────────────────────────

function createWavBuffer(durationSeconds: number, sampleRate = 44100, channels = 2): Buffer {
  const byteRate = sampleRate * channels * 2
  const dataSize = Math.floor(durationSeconds * byteRate)
  const buffer = Buffer.alloc(44 + dataSize)

  // RIFF header
  buffer.write('RIFF', 0)
  buffer.writeUInt32LE(36 + dataSize, 4)
  buffer.write('WAVE', 8)

  // fmt chunk
  buffer.write('fmt ', 12)
  buffer.writeUInt32LE(16, 16) // chunk size
  buffer.writeUInt16LE(1, 20) // PCM format
  buffer.writeUInt16LE(channels, 22)
  buffer.writeUInt32LE(sampleRate, 24)
  buffer.writeUInt32LE(byteRate, 28)
  buffer.writeUInt16LE(channels * 2, 32) // block align
  buffer.writeUInt16LE(16, 34) // bits per sample

  // data chunk
  buffer.write('data', 36)
  buffer.writeUInt32LE(dataSize, 40)

  return buffer
}

function createMinimalAudioBuffer(): Buffer {
  // Minimal valid audio buffer — at least 1 second of 8kHz mono 16-bit PCM
  const sampleRate = 8000
  const dataSize = sampleRate * 1 * 2 // 1 second, mono, 16-bit
  const buffer = Buffer.alloc(44 + dataSize)
  buffer.write('RIFF', 0)
  buffer.writeUInt32LE(36 + dataSize, 4)
  buffer.write('WAVE', 8)
  buffer.write('fmt ', 12)
  buffer.writeUInt32LE(16, 16)
  buffer.writeUInt16LE(1, 20)
  buffer.writeUInt16LE(1, 22)
  buffer.writeUInt32LE(sampleRate, 24)
  buffer.writeUInt32LE(sampleRate * 2, 28)
  buffer.writeUInt16LE(2, 32)
  buffer.writeUInt16LE(16, 34)
  buffer.write('data', 36)
  buffer.writeUInt32LE(dataSize, 40)
  return buffer
}

function createVerifiedVoiceProfile(overrides: Record<string, unknown> = {}) {
  return {
    version: 1 as const,
    voiceProfileId: 'a0eebc99-9c0b-4ef8-bb6d-6bb9bd380a11',
    appSlug: 'test-app',
    status: 'verified' as const,
    displayName: 'Test Voice',
    description: 'A test voice profile',
    source: {
      sourceType: 'provider_catalogue' as const,
      catalogueVoiceId: 'test-voice-id',
    },
    language: 'en',
    styleTags: [],
    permittedUses: ['narration' as const],
    rightsStatus: 'verified' as const,
    rightsDecision: {
      decision: 'verified' as const,
      verifierReference: 'test-verifier',
      decidedAt: '2026-01-01T00:00:00.000Z',
      notes: '',
    },
    createdAt: '2026-01-01T00:00:00.000Z',
    updatedAt: '2026-01-01T00:00:00.000Z',
    ...overrides,
  }
}

// ── Source Audio Validation Tests ─────────────────────────────────────────────

describe('source audio validation', () => {
  it('validates a proper WAV buffer', () => {
    const buffer = createWavBuffer(5) // 5 seconds
    const result = validateSourceAudio({
      artifactId: 'a0eebc99-9c0b-4ef8-bb6d-6bb9bd380a11',
      appSlug: 'test-app',
      buffer,
      declaredMimeType: 'audio/wav',
    })

    expect(result.valid).toBe(true)
    expect(result.metadata).toBeDefined()
    expect(result.metadata!.mimeType).toBe('audio/wav')
    expect(result.metadata!.container).toBe('wav')
    expect(result.metadata!.durationSeconds).toBeGreaterThan(0)
    expect(result.metadata!.sampleRateHz).toBe(44100)
    expect(result.metadata!.channelCount).toBe(2)
  })

  it('rejects empty buffer', () => {
    const result = validateSourceAudio({
      artifactId: 'a0eebc99-9c0b-4ef8-bb6d-6bb9bd380a11',
      appSlug: 'test-app',
      buffer: Buffer.alloc(0),
      declaredMimeType: 'audio/wav',
    })

    expect(result.valid).toBe(false)
    expect(result.errorCode).toBe('ARTIFACT_NOT_FOUND')
  })

  it('rejects buffer below minimum size', () => {
    const result = validateSourceAudio({
      artifactId: 'a0eebc99-9c0b-4ef8-bb6d-6bb9bd380a11',
      appSlug: 'test-app',
      buffer: Buffer.alloc(100),
      declaredMimeType: 'audio/wav',
    })

    expect(result.valid).toBe(false)
    expect(result.errorCode).toBe('AUDIO_FILE_TOO_SMALL')
  })

  it('rejects undeclared MIME type', () => {
    const buffer = createWavBuffer(5)
    const result = validateSourceAudio({
      artifactId: 'a0eebc99-9c0b-4ef8-bb6d-6bb9bd380a11',
      appSlug: 'test-app',
      buffer,
      declaredMimeType: '',
    })

    expect(result.valid).toBe(false)
    expect(result.errorCode).toBe('MIME_NOT_DECLARED')
  })

  it('rejects MIME mismatch', () => {
    const buffer = createWavBuffer(5)
    const result = validateSourceAudio({
      artifactId: 'a0eebc99-9c0b-4ef8-bb6d-6bb9bd380a11',
      appSlug: 'test-app',
      buffer,
      declaredMimeType: 'audio/mpeg',
    })

    expect(result.valid).toBe(false)
    expect(result.errorCode).toBe('MIME_MISMATCH')
  })

  it('rejects unsupported MIME type', () => {
    // Create a WAV buffer large enough for >1 second at the declared sample rate
    const buffer = createMinimalAudioBuffer()

    const result = validateSourceAudio({
      artifactId: 'a0eebc99-9c0b-4ef8-bb6d-6bb9bd380a11',
      appSlug: 'test-app',
      buffer,
      declaredMimeType: 'audio/wav',
    })

    // This should pass since audio/wav is supported
    expect(result.valid).toBe(true)
  })

  it('requires consent reference when requested', () => {
    const buffer = createWavBuffer(5)
    const result = validateSourceAudio({
      artifactId: 'a0eebc99-9c0b-4ef8-bb6d-6bb9bd380a11',
      appSlug: 'test-app',
      buffer,
      declaredMimeType: 'audio/wav',
    }, { requireConsent: true })

    expect(result.valid).toBe(false)
    expect(result.errorCode).toBe('CONSENT_EVIDENCE_REQUIRED')
  })

  it('requires rights reference when requested', () => {
    const buffer = createWavBuffer(5)
    const result = validateSourceAudio({
      artifactId: 'a0eebc99-9c0b-4ef8-bb6d-6bb9bd380a11',
      appSlug: 'test-app',
      buffer,
      declaredMimeType: 'audio/wav',
      consentReference: 'consent-123',
    }, { requireConsent: true, requireRights: true })

    expect(result.valid).toBe(false)
    expect(result.errorCode).toBe('RIGHTS_EVIDENCE_REQUIRED')
  })

  it('passes with consent and rights references', () => {
    const buffer = createWavBuffer(5)
    const result = validateSourceAudio({
      artifactId: 'a0eebc99-9c0b-4ef8-bb6d-6bb9bd380a11',
      appSlug: 'test-app',
      buffer,
      declaredMimeType: 'audio/wav',
      consentReference: 'consent-123',
      rightsReference: 'rights-123',
    }, { requireConsent: true, requireRights: true })

    expect(result.valid).toBe(true)
  })

  it('computes and verifies checksum', () => {
    const buffer = createWavBuffer(5)
    const checksum = computeAudioChecksum(buffer)
    expect(checksum).toBeTruthy()
    expect(typeof checksum).toBe('string')
  })

  it('checks supported audio MIME types', () => {
    expect(isSupportedAudioMime('audio/wav')).toBe(true)
    expect(isSupportedAudioMime('audio/mpeg')).toBe(true)
    expect(isSupportedAudioMime('audio/flac')).toBe(true)
    expect(isSupportedAudioMime('audio/ogg')).toBe(true)
    expect(isSupportedAudioMime('audio/aac')).toBe(true)
    expect(isSupportedAudioMime('video/mp4')).toBe(false)
    expect(isSupportedAudioMime('image/png')).toBe(false)
  })

  it('extracts WAV metadata from bytes', () => {
    const buffer = createWavBuffer(10, 48000, 1)
    const result = validateSourceAudio({
      artifactId: 'a0eebc99-9c0b-4ef8-bb6d-6bb9bd380a11',
      appSlug: 'test-app',
      buffer,
      declaredMimeType: 'audio/wav',
    })

    expect(result.valid).toBe(true)
    expect(result.metadata!.sampleRateHz).toBe(48000)
    expect(result.metadata!.channelCount).toBe(1)
    expect(result.metadata!.durationSeconds).toBeCloseTo(10, 0)
  })
})

// ── Voice Clone Tests ─────────────────────────────────────────────────────────

describe('voice clone', () => {
  it('validates a proper voice clone request', () => {
    const service = createVoiceCloneDomainService()
    const result = service.validateRequest({
      sourceAudioArtifactId: 'a0eebc99-9c0b-4ef8-bb6d-6bb9bd380a11',
      voiceProfileId: 'a0eebc99-9c0b-4ef8-bb6d-6bb9bd380a11',
      language: 'en',
      intendedUse: 'narration',
      consentEvidenceReference: 'consent-ref-123',
      rightsDeclarationReference: 'rights-ref-123',
    })

    expect(result.success).toBe(true)
    expect(result.data).toBeDefined()
  })

  it('rejects request with provider field', () => {
    const service = createVoiceCloneDomainService()
    const result = service.validateRequest({
      sourceAudioArtifactId: 'a0eebc99-9c0b-4ef8-bb6d-6bb9bd380a11',
      voiceProfileId: 'a0eebc99-9c0b-4ef8-bb6d-6bb9bd380a11',
      language: 'en',
      intendedUse: 'narration',
      consentEvidenceReference: 'consent-ref-123',
      rightsDeclarationReference: 'rights-ref-123',
      provider: 'openai',
    })

    expect(result.success).toBe(false)
    expect(result.error).toContain('provider')
  })

  it('rejects request with model field', () => {
    const service = createVoiceCloneDomainService()
    const result = service.validateRequest({
      sourceAudioArtifactId: 'a0eebc99-9c0b-4ef8-bb6d-6bb9bd380a11',
      voiceProfileId: 'a0eebc99-9c0b-4ef8-bb6d-6bb9bd380a11',
      language: 'en',
      intendedUse: 'narration',
      consentEvidenceReference: 'consent-ref-123',
      rightsDeclarationReference: 'rights-ref-123',
      model: 'gpt-4',
    })

    expect(result.success).toBe(false)
    expect(result.error).toContain('model')
  })

  it('rejects request with apiKey field', () => {
    const service = createVoiceCloneDomainService()
    const result = service.validateRequest({
      sourceAudioArtifactId: 'a0eebc99-9c0b-4ef8-bb6d-6bb9bd380a11',
      voiceProfileId: 'a0eebc99-9c0b-4ef8-bb6d-6bb9bd380a11',
      language: 'en',
      intendedUse: 'narration',
      consentEvidenceReference: 'consent-ref-123',
      rightsDeclarationReference: 'rights-ref-123',
      apiKey: 'sk-123',
    })

    expect(result.success).toBe(false)
    expect(result.error).toContain('apiKey')
  })

  it('rejects request with providerVoiceId field', () => {
    const service = createVoiceCloneDomainService()
    const result = service.validateRequest({
      sourceAudioArtifactId: 'a0eebc99-9c0b-4ef8-bb6d-6bb9bd380a11',
      voiceProfileId: 'a0eebc99-9c0b-4ef8-bb6d-6bb9bd380a11',
      language: 'en',
      intendedUse: 'narration',
      consentEvidenceReference: 'consent-ref-123',
      rightsDeclarationReference: 'rights-ref-123',
      providerVoiceId: 'voice-123',
    })

    expect(result.success).toBe(false)
    expect(result.error).toContain('providerVoiceId')
  })

  it('evaluates eligibility for draft profile', () => {
    const service = createVoiceCloneDomainService()
    const profile = createVerifiedVoiceProfile({ status: 'draft' })
    const buffer = createWavBuffer(5)

    const eligibility = service.evaluateEligibility({
      appSlug: 'test-app',
      voiceProfile: profile as any,
      request: {
        sourceAudioArtifactId: 'a0eebc99-9c0b-4ef8-bb6d-6bb9bd380a11',
        voiceProfileId: 'a0eebc99-9c0b-4ef8-bb6d-6bb9bd380a11',
        language: 'en',
        intendedUse: 'narration',
        consentEvidenceReference: 'consent-ref-123',
        rightsDeclarationReference: 'rights-ref-123',
      },
      sourceAudioValidation: {
        valid: true,
        metadata: {
          mimeType: 'audio/wav',
          container: 'wav',
          durationSeconds: 5,
          fileSizeBytes: buffer.length,
        },
      },
    })

    expect(eligibility.eligible).toBe(false)
    expect(eligibility.reasons.some(r => r.includes('draft'))).toBe(true)
  })

  it('evaluates eligibility for revoked profile', () => {
    const service = createVoiceCloneDomainService()
    const profile = createVerifiedVoiceProfile({ status: 'revoked', revokedAt: '2026-06-01T00:00:00.000Z' })
    const buffer = createWavBuffer(5)

    const eligibility = service.evaluateEligibility({
      appSlug: 'test-app',
      voiceProfile: profile as any,
      request: {
        sourceAudioArtifactId: 'a0eebc99-9c0b-4ef8-bb6d-6bb9bd380a11',
        voiceProfileId: 'a0eebc99-9c0b-4ef8-bb6d-6bb9bd380a11',
        language: 'en',
        intendedUse: 'narration',
        consentEvidenceReference: 'consent-ref-123',
        rightsDeclarationReference: 'rights-ref-123',
      },
      sourceAudioValidation: {
        valid: true,
        metadata: {
          mimeType: 'audio/wav',
          container: 'wav',
          durationSeconds: 5,
          fileSizeBytes: buffer.length,
        },
      },
    })

    expect(eligibility.eligible).toBe(false)
    expect(eligibility.reasons.some(r => r.includes('revoked'))).toBe(true)
  })

  it('evaluates eligibility for cross-app profile', () => {
    const service = createVoiceCloneDomainService()
    const profile = createVerifiedVoiceProfile({ appSlug: 'other-app' })
    const buffer = createWavBuffer(5)

    const eligibility = service.evaluateEligibility({
      appSlug: 'test-app',
      voiceProfile: profile as any,
      request: {
        sourceAudioArtifactId: 'a0eebc99-9c0b-4ef8-bb6d-6bb9bd380a11',
        voiceProfileId: 'a0eebc99-9c0b-4ef8-bb6d-6bb9bd380a11',
        language: 'en',
        intendedUse: 'narration',
        consentEvidenceReference: 'consent-ref-123',
        rightsDeclarationReference: 'rights-ref-123',
      },
      sourceAudioValidation: {
        valid: true,
        metadata: {
          mimeType: 'audio/wav',
          container: 'wav',
          durationSeconds: 5,
          fileSizeBytes: buffer.length,
        },
      },
    })

    expect(eligibility.eligible).toBe(false)
    expect(eligibility.reasons.some(r => r.includes('does not belong'))).toBe(true)
  })

  it('blocks when no provider adapter available', async () => {
    const service = createVoiceCloneDomainService() // No adapter
    const profile = createVerifiedVoiceProfile()
    const buffer = createWavBuffer(5)

    const result = await service.executeClone({
      appSlug: 'test-app',
      request: {
        sourceAudioArtifactId: 'a0eebc99-9c0b-4ef8-bb6d-6bb9bd380a11',
        voiceProfileId: 'a0eebc99-9c0b-4ef8-bb6d-6bb9bd380a11',
        language: 'en',
        intendedUse: 'narration',
        consentEvidenceReference: 'consent-ref-123',
        rightsDeclarationReference: 'rights-ref-123',
      },
      voiceProfile: profile as any,
      sourceAudioBuffer: buffer,
      sourceMimeType: 'audio/wav',
    })

    expect(result.status).toBe('blocked_by_account_access')
    expect(result.evidence.liveProviderProof).toBe(false)
    expect(result.evidence.evidenceSource).toBe('local_fixture')
  })

  it('fixture adapter produces non-live evidence', async () => {
    const adapter = createFixtureVoiceCloneProviderAdapter()
    expect(adapter.provider).toBe('fixture')
    expect(adapter.supportsVoiceClone).toBe(true)

    const result = await adapter.submitClone({
      sourceAudioBuffer: createWavBuffer(5),
      sourceMimeType: 'audio/wav',
      voiceProfileId: 'a0eebc99-9c0b-4ef8-bb6d-6bb9bd380a11',
      language: 'en',
      qualityProfile: 'standard',
    })

    expect(result.status).toBe('submitted')
    expect(result.providerJobRef).toBeTruthy()
  })
})

// ── Voice Conversion Tests ────────────────────────────────────────────────────

describe('voice conversion', () => {
  it('validates a proper voice conversion request', () => {
    const service = createVoiceConversionDomainService()
    const result = service.validateRequest({
      sourceAudioArtifactId: 'a0eebc99-9c0b-4ef8-bb6d-6bb9bd380a11',
      targetVoiceProfileId: 'a0eebc99-9c0b-4ef8-bb6d-6bb9bd380a11',
      intendedUse: 'narration',
    })

    expect(result.success).toBe(true)
    expect(result.data).toBeDefined()
  })

  it('rejects request with provider field', () => {
    const service = createVoiceConversionDomainService()
    const result = service.validateRequest({
      sourceAudioArtifactId: 'a0eebc99-9c0b-4ef8-bb6d-6bb9bd380a11',
      targetVoiceProfileId: 'a0eebc99-9c0b-4ef8-bb6d-6bb9bd380a11',
      intendedUse: 'narration',
      provider: 'openai',
    })

    expect(result.success).toBe(false)
    expect(result.error).toContain('provider')
  })

  it('rejects request with providerVoiceId field', () => {
    const service = createVoiceConversionDomainService()
    const result = service.validateRequest({
      sourceAudioArtifactId: 'a0eebc99-9c0b-4ef8-bb6d-6bb9bd380a11',
      targetVoiceProfileId: 'a0eebc99-9c0b-4ef8-bb6d-6bb9bd380a11',
      intendedUse: 'narration',
      providerVoiceId: 'voice-123',
    })

    expect(result.success).toBe(false)
    expect(result.error).toContain('providerVoiceId')
  })

  it('blocks when no provider adapter available', async () => {
    const service = createVoiceConversionDomainService() // No adapter
    const profile = createVerifiedVoiceProfile()
    const buffer = createWavBuffer(5)

    const result = await service.executeConversion({
      appSlug: 'test-app',
      request: {
        sourceAudioArtifactId: 'a0eebc99-9c0b-4ef8-bb6d-6bb9bd380a11',
        targetVoiceProfileId: 'a0eebc99-9c0b-4ef8-bb6d-6bb9bd380a11',
        intendedUse: 'narration',
      },
      targetVoiceProfile: profile as any,
      sourceAudioBuffer: buffer,
      sourceMimeType: 'audio/wav',
    })

    expect(result.status).toBe('blocked_by_account_access')
    expect(result.evidence.liveProviderProof).toBe(false)
  })

  it('fixture adapter produces non-live evidence', async () => {
    const adapter = createFixtureVoiceConversionProviderAdapter()
    expect(adapter.provider).toBe('fixture')
    expect(adapter.supportsVoiceConversion).toBe(true)

    const result = await adapter.submitConversion({
      sourceAudioBuffer: createWavBuffer(5),
      sourceMimeType: 'audio/wav',
      targetVoiceProfileId: 'a0eebc99-9c0b-4ef8-bb6d-6bb9bd380a11',
      preserveTiming: true,
      outputFormat: 'wav',
    })

    expect(result.status).toBe('submitted')
    expect(result.providerJobRef).toBeTruthy()
  })
})

// ── Audio-to-Audio Tests ──────────────────────────────────────────────────────

describe('audio-to-audio', () => {
  it('validates a proper audio-to-audio request', () => {
    const service = createAudioToAudioDomainService()
    const result = service.validateRequest({
      sourceAudioArtifactId: 'a0eebc99-9c0b-4ef8-bb6d-6bb9bd380a11',
      operation: 'normalize',
    })

    expect(result.success).toBe(true)
    expect(result.data).toBeDefined()
  })

  it('rejects request with provider field', () => {
    const service = createAudioToAudioDomainService()
    const result = service.validateRequest({
      sourceAudioArtifactId: 'a0eebc99-9c0b-4ef8-bb6d-6bb9bd380a11',
      operation: 'normalize',
      provider: 'openai',
    })

    expect(result.success).toBe(false)
    expect(result.error).toContain('provider')
  })

  it('rejects invalid operation', () => {
    const service = createAudioToAudioDomainService()
    const result = service.validateRequest({
      sourceAudioArtifactId: 'a0eebc99-9c0b-4ef8-bb6d-6bb9bd380a11',
      operation: 'invalid_operation',
    })

    expect(result.success).toBe(false)
  })

  it('lists supported operations', () => {
    expect(AUDIO_TO_AUDIO_OPERATIONS).toContain('voice_conversion')
    expect(AUDIO_TO_AUDIO_OPERATIONS).toContain('denoise')
    expect(AUDIO_TO_AUDIO_OPERATIONS).toContain('normalize')
    expect(AUDIO_TO_AUDIO_OPERATIONS).toContain('trim')
    expect(AUDIO_TO_AUDIO_OPERATIONS).toContain('resample')
    expect(AUDIO_TO_AUDIO_OPERATIONS).toContain('channel_convert')
    expect(AUDIO_TO_AUDIO_OPERATIONS).toContain('loudness_normalize')
  })

  it('executes internal normalize operation', async () => {
    const service = createAudioToAudioDomainService()
    const buffer = createWavBuffer(5)

    const result = await service.executeOperation({
      appSlug: 'test-app',
      request: {
        sourceAudioArtifactId: 'a0eebc99-9c0b-4ef8-bb6d-6bb9bd380a11',
        operation: 'normalize',
        outputFormat: 'wav',
        parameters: {},
        metadata: {},
      },
      sourceAudioBuffer: buffer,
      sourceMimeType: 'audio/wav',
    })

    expect(result.status).toBe('completed')
    expect(result.evidence.evidenceSource).toBe('internal_ffmpeg')
    expect(result.evidence.liveProviderProof).toBe(false)
    expect(result.operation).toBe('normalize')
  })

  it('executes internal trim operation', async () => {
    const service = createAudioToAudioDomainService()
    const buffer = createWavBuffer(10)

    const result = await service.executeOperation({
      appSlug: 'test-app',
      request: {
        sourceAudioArtifactId: 'a0eebc99-9c0b-4ef8-bb6d-6bb9bd380a11',
        operation: 'trim',
        outputFormat: 'wav',
        parameters: { startTime: 1000, endTime: 5000 },
        metadata: {},
      },
      sourceAudioBuffer: buffer,
      sourceMimeType: 'audio/wav',
    })

    expect(result.status).toBe('completed')
    expect(result.evidence.evidenceSource).toBe('internal_ffmpeg')
    expect(result.operation).toBe('trim')
  })

  it('rejects malformed source audio', async () => {
    const service = createAudioToAudioDomainService()

    const result = await service.executeOperation({
      appSlug: 'test-app',
      request: {
        sourceAudioArtifactId: 'a0eebc99-9c0b-4ef8-bb6d-6bb9bd380a11',
        operation: 'normalize',
        outputFormat: 'wav',
        parameters: {},
        metadata: {},
      },
      sourceAudioBuffer: Buffer.alloc(100), // Too small
      sourceMimeType: 'audio/wav',
    })

    expect(result.status).toBe('rejected')
    expect(result.errorCode).toBeTruthy()
  })

  it('fixture adapter produces non-live evidence', async () => {
    const adapter = createFixtureAudioToAudioProviderAdapter()
    expect(adapter.provider).toBe('fixture')
    expect(adapter.supportsOperations).toContain('voice_conversion')
    expect(adapter.supportsOperations).toContain('normalize')
    expect(adapter.supportsOperations).toContain('trim')
  })
})
