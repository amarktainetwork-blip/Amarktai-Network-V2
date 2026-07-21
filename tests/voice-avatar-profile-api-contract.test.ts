import { readFileSync } from 'node:fs'
import { describe, expect, it } from 'vitest'

const server = readFileSync(new URL('../apps/api/src/server.ts', import.meta.url), 'utf8')
const route = readFileSync(new URL('../apps/api/src/routes/app-voice-avatar-profiles.ts', import.meta.url), 'utf8')
const validation = readFileSync(new URL('../apps/api/src/lib/voice-avatar-profile-validation.ts', import.meta.url), 'utf8')
const store = readFileSync(new URL('../apps/api/src/lib/voice-avatar-profile-store.ts', import.meta.url), 'utf8')

describe('governed voice and avatar profile API contract', () => {
  it('registers app and admin profile routes without generation claims', () => {
    expect(server).toContain("import { appVoiceAvatarProfileRoutes } from './routes/app-voice-avatar-profiles.js'")
    expect(server).toContain('await app.register(appVoiceAvatarProfileRoutes)')
    for (const path of [
      '/api/v1/voice-profiles',
      '/api/v1/voice-profiles/:id',
      '/api/v1/avatar-profiles',
      '/api/v1/avatar-profiles/:id',
      '/api/admin/voice-profiles/:appSlug/:id/decision',
      '/api/admin/avatar-profiles/:appSlug/:id/decision',
    ]) expect(route).toContain(path)
    expect(route).not.toContain('/api/v1/voice-clone/executions')
    expect(route).not.toContain('/api/v1/avatar-generation/executions')
    expect(route).not.toContain("capability: 'voice_clone', prompt")
  })

  it('authenticates apps and gates profile writes with immutable capability grants', () => {
    expect(route).toContain('authenticateAppKey(request.headers.authorization)')
    expect(route).toContain('resolveAppCapabilityGrantSnapshot(appSlug, input.capability')
    expect(route).toContain("profile.source.sourceType === 'provider_catalogue' ? 'tts' : 'voice_clone'")
    expect(route).toContain("capability: 'avatar_generation'")
    expect(route).toContain("code: 'PROFILE_ARTIFACT_WRITE_REQUIRED'")
  })

  it('creates only server-owned drafts and resets every app edit to pending', () => {
    expect(route).toContain('voiceProfileId: randomUUID()')
    expect(route).toContain('avatarProfileId: randomUUID()')
    expect(route).toContain("status: 'draft'")
    expect(route).toContain("rightsStatus: 'pending'")
    expect(route).toContain('rightsDecision: undefined')
    expect(route).toContain('providerBinding: undefined')
    expect(route).toContain("current.status === 'revoked' || current.status === 'archived'")
  })

  it('derives verifier identity from the admin JWT and revalidates before verification', () => {
    expect(route).toContain("payload?.role !== 'admin'")
    expect(route).toContain('verifierReference: `admin:${payload.sub.trim().toLowerCase()}`')
    expect(route).toContain('VoiceAvatarProfileDecisionRequestSchema.safeParse(request.body)')
    expect(route).toContain('assertVoiceProfileDependencies({ profile, requireVerifiedParent: true })')
    expect(route).toContain('assertAvatarProfileDependencies({ profile, requireVerifiedVoice: true })')
    expect(store).toContain('rightsDecision: durableDecision')
    expect(store).toContain("if (status === 'revoked' && decision !== 'revoked') throw new Error('PROFILE_REVOKED')")
  })

  it('validates app ownership, completion, bytes, type and MIME for every dependency', () => {
    expect(validation).toContain("where: { appSlug, id: { in: ids } }")
    expect(validation).toContain("artifact.status !== 'completed' || artifact.fileSizeBytes <= 0")
    expect(validation).toContain('reference.expectedTypes.includes(artifact.type)')
    expect(validation).toContain('isValidMimeForType(artifact.type as ArtifactType, artifact.mimeType)')
    expect(validation).toContain("code: 'PROFILE_ARTIFACT_NOT_FOUND'")
    expect(validation).toContain("code: 'PROFILE_ARTIFACT_TYPE_MISMATCH'")
    expect(validation).toContain("code: 'PROFILE_ARTIFACT_MIME_MISMATCH'")
  })

  it('allows only enabled catalogue voices on approved runtime providers with catalogue rights', () => {
    expect(validation).toContain('prisma.voiceLibrary.findUnique({ where: { voiceId } })')
    expect(validation).toContain('RUNTIME_EXECUTION_PROVIDERS')
    expect(validation).toContain("voice.consentStatus !== 'provider_catalogue' || voice.sourceType !== 'catalogue'")
    expect(validation).toContain("code: 'VOICE_CATALOGUE_PROVIDER_RESTRICTED'")
    expect(validation).toContain("code: 'VOICE_CATALOGUE_RIGHTS_UNVERIFIED'")
  })

  it('keeps remix and avatar profile dependencies inside the authenticated app', () => {
    expect(validation).toContain('getVoiceProfile(input.profile.appSlug, input.profile.source.parentVoiceProfileId)')
    expect(validation).toContain('getVoiceProfile(input.profile.appSlug, input.profile.defaultVoiceProfileId)')
    expect(validation).toContain("code: 'VOICE_PROFILE_SELF_REFERENCE'")
    expect(validation).toContain("code: 'PARENT_VOICE_PROFILE_NOT_VERIFIED'")
    expect(validation).toContain("code: 'DEFAULT_VOICE_PROFILE_NOT_VERIFIED'")
  })
})
