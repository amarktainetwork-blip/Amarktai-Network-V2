import { readFileSync } from 'node:fs'
import { describe, expect, it } from 'vitest'

const mainFixture = readFileSync(new URL('../scripts/proof-release-fixture.mjs', import.meta.url), 'utf8')
const profileFixture = readFileSync(new URL('../scripts/lib/proof-voice-avatar-profile-release-fixture.mjs', import.meta.url), 'utf8')

describe('authoritative governed voice and avatar profile release fixture', () => {
  it('runs inside the existing real-service fixture before provider capability proof', () => {
    expect(mainFixture).toContain("import { proveVoiceAvatarProfileReleaseFixture } from './lib/proof-voice-avatar-profile-release-fixture.mjs'")
    expect(mainFixture).toContain('await proveVoiceAvatarProfileReleaseFixture({ apiRequest, invariant, adminToken: catalogueToken })')
    expect(mainFixture).toContain("console.log('VOICE_AVATAR_PROFILE_RELEASE_FIXTURE=PASS')")
    expect(mainFixture.indexOf('await proveVoiceAvatarProfileReleaseFixture')).toBeLessThan(mainFixture.indexOf("'scripts/proof-production-release-candidate.mjs'"))
  })

  it('creates two real apps and explicit immutable capability grants', () => {
    expect(profileFixture).toContain("fullCapabilities = ['tts', 'voice_clone', 'avatar_generation']")
    expect(profileFixture).toContain("'Voice Avatar Profile Fixture', ['tts', 'voice_clone']")
    expect(profileFixture).toContain("'Voice Avatar Isolation Fixture', fullCapabilities")
    expect(profileFixture).toContain("configureGrant(apiRequest, invariant, adminToken, primarySlug, 'voice_clone')")
    expect(profileFixture).toContain("configureGrant(apiRequest, invariant, adminToken, primarySlug, 'avatar_generation')")
    expect(profileFixture).toContain('artifactWrite: true')
    expect(profileFixture).toContain('passthroughModelAllowed: false')
  })

  it('executes governed TTS with a verified reusable profile and fails closed for unusable profiles', () => {
    expect(profileFixture).toContain("voice.voiceId === 'fixture-genx-narrator-v1'")
    expect(profileFixture).toContain("sourceType: 'provider_catalogue'")
    expect(profileFixture).toContain("draftDenied.status === 'failed'")
    expect(profileFixture).toContain("governedTts.status === 'completed' && governedTts.artifactId")
    expect(profileFixture).toContain("crossAppDenied.status === 'failed'")
    expect(profileFixture).toContain("archivedDenied.status === 'failed'")
    expect(profileFixture).toContain("revokedDenied.status === 'failed'")
    expect(profileFixture).toContain("console.log('GOVERNED_TTS_PROFILE_EXECUTION=PASS')")
  })

  it('proves multipart grant denial, byte-signature MIME denial and completed app-owned evidence', () => {
    expect(profileFixture).toContain("missingAvatarGrant.append('file'")
    expect(profileFixture).toContain("deniedUpload.body.code === 'PROFILE_EVIDENCE_GRANT_REQUIRED'")
    expect(profileFixture).toContain("mismatchedUpload.body.code === 'VOICE_AVATAR_EVIDENCE_MIME_MISMATCH'")
    expect(profileFixture).toContain("uploadEvidence(apiRequest, invariant, primaryKey, 'voice_source_audio'")
    expect(profileFixture).toContain("uploadEvidence(apiRequest, invariant, primaryKey, 'voice_identity_verification'")
    expect(profileFixture).toContain("uploadEvidence(apiRequest, invariant, primaryKey, 'voice_consent'")
    expect(profileFixture).toContain("uploadEvidence(apiRequest, invariant, primaryKey, 'voice_recording_consent'")
    expect(profileFixture).toContain("result.body.status === 'completed'")
    expect(profileFixture).toContain("console.log('PROFILE_EVIDENCE_GRANT_DENIAL=PASS')")
    expect(profileFixture).toContain("console.log('PROFILE_EVIDENCE_MIME_DENIAL=PASS')")
  })

  it('proves draft-only app writes, server-derived verification and edit reset', () => {
    expect(profileFixture).toContain("apiRequest('/api/v1/voice-profiles'")
    expect(profileFixture).toContain("voiceCreated.body.status === 'draft'")
    expect(profileFixture).toContain("voiceCreated.body.rightsStatus === 'pending'")
    expect(profileFixture).toContain("body: JSON.stringify({ decision: 'verified', verifierReference: 'spoofed'")
    expect(profileFixture).toContain("spoofedVerifier.body.code === 'INVALID_PROFILE_DECISION'")
    expect(profileFixture).toContain("startsWith('admin:fixture-admin@invalid.example')")
    expect(profileFixture).toContain("editedVoice.body.status === 'draft'")
    expect(profileFixture).toContain("editedVoice.body.rightsStatus === 'pending'")
    expect(profileFixture).toContain("console.log('VOICE_PROFILE_DRAFT_VERIFY_RESET=PASS')")
    expect(profileFixture).toContain("console.log('PROFILE_SERVER_DERIVED_VERIFIER=PASS')")
  })

  it('proves verified default-voice dependency, archive and irreversible revocation', () => {
    expect(profileFixture).toContain("apiRequest('/api/v1/avatar-profiles'")
    expect(profileFixture).toContain('defaultVoiceProfileId: voiceProfileId')
    expect(profileFixture).toContain("verifiedAvatar.status === 'verified'")
    expect(profileFixture).toContain("verifyArchivedAvatar.body.code === 'PROFILE_ARCHIVED'")
    expect(profileFixture).toContain("revokedVoice.rightsDecision?.decision === 'revoked'")
    expect(profileFixture).toContain("verifyRevokedVoice.body.code === 'PROFILE_REVOKED'")
    expect(profileFixture).toContain("editRevokedVoice.body.code === 'VOICE_PROFILE_REVOKED'")
    expect(profileFixture).toContain("console.log('AVATAR_PROFILE_VERIFY_ARCHIVE=PASS')")
    expect(profileFixture).toContain("console.log('PROFILE_REVOCATION_GUARD=PASS')")
  })

  it('proves profile and source-artifact isolation without claiming generation execution', () => {
    expect(profileFixture).toContain("crossVoice.body.code === 'VOICE_PROFILE_NOT_FOUND'")
    expect(profileFixture).toContain("crossAvatar.body.code === 'AVATAR_PROFILE_NOT_FOUND'")
    expect(profileFixture).toContain('!crossSource.response.ok')
    expect(profileFixture).toContain("console.log('PROFILE_APP_ISOLATION=PASS')")
    expect(profileFixture).not.toContain('/voice-clone/executions')
    expect(profileFixture).not.toContain('/avatar-generation/executions')
    expect(profileFixture).not.toContain("capability: 'voice_clone', prompt")
    expect(profileFixture).not.toContain("capability: 'avatar_generation', prompt")
  })
})
