import { describe, expect, it, vi } from 'vitest'
import { AmarktAIClient, type HumanConsentEvidencePayload } from './index.js'

function ok(body: unknown = { ok: true }) {
  return new Response(JSON.stringify(body), { status: 200, headers: { 'content-type': 'application/json' } })
}

const consent: HumanConsentEvidencePayload = {
  version: 1,
  subjectReference: 'subject:adult-1',
  rightsHolderReference: 'rights-holder:1',
  subjectAgeConfirmedAdult: true,
  identityVerificationArtifactId: '11111111-1111-4111-8111-111111111111',
  consentArtifactId: '22222222-2222-4222-8222-222222222222',
  sourceRecordingConsentArtifactId: '33333333-3333-4333-8333-333333333333',
  permittedUses: ['narration'],
  commercialUseAllowed: false,
  syntheticDisclosureRequired: true,
  revocable: true,
  declaredAt: '2026-07-21T10:00:00.000Z',
  verifiedAt: '2026-07-21T11:00:00.000Z',
  verifierReference: 'admin:fixture',
  jurisdictions: ['ZA'],
}

describe('AmarktAIClient governed voice and avatar profiles', () => {
  it('uses app-isolated profile CRUD routes with provider-neutral draft bodies', async () => {
    const transport = vi.fn(async () => ok())
    const client = new AmarktAIClient({ apiKey: 'app-key', baseUrl: 'https://example.test', fetch: transport as typeof fetch })

    await client.voiceProfiles()
    await client.voiceProfile('voice / one')
    await client.createVoiceProfile({
      displayName: 'Consented narrator',
      source: { sourceType: 'user_recording', sourceAudioArtifactIds: ['44444444-4444-4444-8444-444444444444'] },
      language: 'en',
      permittedUses: ['narration'],
      consentEvidence: consent,
    })
    await client.updateVoiceProfile('voice / one', { description: 'Updated draft.' })
    await client.archiveVoiceProfile('voice / one')
    await client.avatarProfiles()
    await client.avatarProfile('avatar / one')
    await client.createAvatarProfile({
      displayName: 'Synthetic presenter',
      source: {
        subjectType: 'synthetic',
        portraitArtifactId: '55555555-5555-4555-8555-555555555555',
        creationEvidenceArtifactId: '66666666-6666-4666-8666-666666666666',
      },
      permittedUses: ['avatar_performance'],
    })
    await client.updateAvatarProfile('avatar / one', { description: 'Updated avatar draft.' })
    await client.archiveAvatarProfile('avatar / one')

    expect(transport.mock.calls.map((call) => call[0])).toEqual([
      'https://example.test/api/v1/voice-profiles',
      'https://example.test/api/v1/voice-profiles/voice%20%2F%20one',
      'https://example.test/api/v1/voice-profiles',
      'https://example.test/api/v1/voice-profiles/voice%20%2F%20one',
      'https://example.test/api/v1/voice-profiles/voice%20%2F%20one',
      'https://example.test/api/v1/avatar-profiles',
      'https://example.test/api/v1/avatar-profiles/avatar%20%2F%20one',
      'https://example.test/api/v1/avatar-profiles',
      'https://example.test/api/v1/avatar-profiles/avatar%20%2F%20one',
      'https://example.test/api/v1/avatar-profiles/avatar%20%2F%20one',
    ])
    const voiceCreate = JSON.parse(String(transport.mock.calls[2]![1]?.body)) as Record<string, unknown>
    const avatarCreate = JSON.parse(String(transport.mock.calls[7]![1]?.body)) as Record<string, unknown>
    for (const body of [voiceCreate, avatarCreate]) {
      for (const field of ['appSlug', 'status', 'rightsStatus', 'rightsDecision', 'providerBinding', 'provider', 'model', 'route', 'executorId', 'apiKey']) {
        expect(body).not.toHaveProperty(field)
      }
    }
  })

  it('uploads one Blob with native multipart boundaries and no client metadata fields', async () => {
    const transport = vi.fn(async () => ok({ artifactId: 'artifact-1' }))
    const client = new AmarktAIClient({ apiKey: 'app-key', baseUrl: 'https://example.test', fetch: transport as typeof fetch })
    const file = new Blob([Buffer.from('RIFF0000WAVEfixture')], { type: 'audio/wav' })

    await client.uploadProfileArtifact('voice_source_audio', file, 'sample.wav')

    expect(transport).toHaveBeenCalledTimes(1)
    expect(transport.mock.calls[0]![0]).toBe('https://example.test/api/v1/profile-artifacts/voice_source_audio')
    const init = transport.mock.calls[0]![1] as RequestInit
    expect(init.method).toBe('POST')
    expect(init.body).toBeInstanceOf(FormData)
    const headers = init.headers as Record<string, string>
    expect(headers.Authorization).toBe('Bearer app-key')
    expect(headers.Accept).toBe('application/json')
    expect(Object.keys(headers).map((key) => key.toLowerCase())).not.toContain('content-type')
    const uploaded = (init.body as FormData).get('file')
    expect(uploaded).toBeInstanceOf(Blob)
    expect(uploaded && typeof uploaded !== 'string' && 'name' in uploaded ? uploaded.name : '').toBe('sample.wav')
  })
})
