import { describe, expect, it, vi } from 'vitest'
import { AmarktAIVoiceAudioClient } from './voice-audio.js'

const ID = 'a0eebc99-9c0b-4ef8-bb6d-6bb9bd380a11'

function response(status: number, body: unknown) {
  return new Response(JSON.stringify(body), { status, headers: { 'Content-Type': 'application/json' } })
}

describe('AmarktAIVoiceAudioClient', () => {
  it('returns durable 422 blocker records instead of discarding their execution IDs', async () => {
    const transport = vi.fn(async () => response(422, {
      status: 'failed',
      voiceCloneId: ID,
      voiceProfileId: ID,
      evidence: { evidenceSource: 'executor_unavailable', liveProviderProof: false, blocker: 'VOICE_CLONE_PROVIDER_ROUTE_UNAVAILABLE' },
      errorCode: 'VOICE_CLONE_PROVIDER_ROUTE_UNAVAILABLE',
    }))
    const client = new AmarktAIVoiceAudioClient({ apiKey: 'app_test', baseUrl: 'https://example.invalid', fetch: transport as typeof fetch })
    const result = await client.cloneVoice({
      sourceAudioArtifactId: ID,
      voiceProfileId: ID,
      language: 'en',
      intendedUse: 'narration',
      consentEvidenceReference: ID,
      rightsDeclarationReference: 'verified-rights',
    })
    expect(result.voiceCloneId).toBe(ID)
    expect(result.evidence).toMatchObject({ evidenceSource: 'executor_unavailable', liveProviderProof: false })
    expect(transport).toHaveBeenCalledWith('https://example.invalid/api/v1/voice-clone', expect.objectContaining({ method: 'POST' }))
  })

  it('returns accepted internal audio execution records', async () => {
    const transport = vi.fn(async () => response(202, {
      status: 'accepted', audioToAudioId: ID, sourceAudioArtifactId: ID, operation: 'normalize',
      evidence: { evidenceSource: 'internal_ffmpeg', liveProviderProof: false, operation: 'normalize' },
    }))
    const client = new AmarktAIVoiceAudioClient({ apiKey: 'app_test', fetch: transport as typeof fetch })
    const result = await client.transformAudio({ sourceAudioArtifactId: ID, operation: 'normalize' })
    expect(result.audioToAudioId).toBe(ID)
    expect(result.evidence.evidenceSource).toBe('internal_ffmpeg')
  })

  it('throws typed errors for authentication and policy failures', async () => {
    const transport = vi.fn(async () => response(403, { code: 'CAPABILITY_GRANT_DENIED', error: 'Grant denied' }))
    const client = new AmarktAIVoiceAudioClient({ apiKey: 'app_test', fetch: transport as typeof fetch })
    await expect(client.convertVoice({
      sourceAudioArtifactId: ID,
      targetVoiceProfileId: ID,
      intendedUse: 'narration',
    })).rejects.toMatchObject({ status: 403, code: 'CAPABILITY_GRANT_DENIED', message: 'Grant denied' })
  })

  it('encodes execution identifiers on status routes', async () => {
    const transport = vi.fn(async () => response(200, {
      status: 'completed', audioToAudioId: ID, sourceAudioArtifactId: ID, operation: 'trim',
      outputArtifactId: ID, evidence: { evidenceSource: 'internal_ffmpeg', liveProviderProof: false, operation: 'trim' },
    }))
    const client = new AmarktAIVoiceAudioClient({ apiKey: 'app_test', baseUrl: 'https://example.invalid/', fetch: transport as typeof fetch })
    await client.audioTransform('job/with spaces')
    expect(transport).toHaveBeenCalledWith('https://example.invalid/api/v1/audio-to-audio/job%2Fwith%20spaces', expect.any(Object))
  })
})
