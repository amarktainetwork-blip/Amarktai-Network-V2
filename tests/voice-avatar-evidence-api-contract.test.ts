import { readFileSync } from 'node:fs'
import { describe, expect, it } from 'vitest'

const server = readFileSync(new URL('../apps/api/src/server.ts', import.meta.url), 'utf8')
const route = readFileSync(new URL('../apps/api/src/routes/app-voice-avatar-evidence.ts', import.meta.url), 'utf8')
const musicRoute = readFileSync(new URL('../apps/api/src/routes/admin-music.ts', import.meta.url), 'utf8')
const contract = readFileSync(new URL('../packages/core/src/voice-avatar-evidence.ts', import.meta.url), 'utf8')

describe('secure voice and avatar evidence upload API', () => {
  it('registers independent route-scoped multipart parsers without a root collision', () => {
    expect(server).not.toContain("import multipart from '@fastify/multipart'")
    expect(server).not.toContain('await app.register(multipart')
    expect(route).toContain("import multipart from '@fastify/multipart'")
    expect(route).toContain('await app.register(multipart')
    expect(musicRoute).toContain("import multipart from '@fastify/multipart'")
    expect(musicRoute).toContain('await app.register(multipart')
    expect(server).toContain("import { appVoiceAvatarEvidenceRoutes } from './routes/app-voice-avatar-evidence.js'")
    expect(server).toContain('await app.register(appVoiceAvatarEvidenceRoutes)')
    expect(route).toContain("app.post('/api/v1/profile-artifacts/:purpose'")
    expect(route).not.toContain('/api/v1/upload')
    expect(route).not.toContain('/api/v1/files')
  })

  it('authenticates the app and resolves a purpose-owned immutable grant before reading bytes', () => {
    expect(route).toContain('authenticateAppKey(request.headers.authorization)')
    expect(route).toContain('VoiceAvatarEvidencePurposeSchema.safeParse')
    expect(route).toContain('resolveAppCapabilityGrantSnapshot')
    expect(route).toContain('config.capability')
    expect(route).toContain("code: 'PROFILE_EVIDENCE_GRANT_REQUIRED'")
    expect(route).toContain("code: 'PROFILE_EVIDENCE_ARTIFACT_WRITE_REQUIRED'")
    expect(route.indexOf('resolveAppCapabilityGrantSnapshot')).toBeLessThan(route.indexOf('request.file({'))
  })

  it('accepts one multipart file and no app-controlled metadata fields', () => {
    expect(route).toContain('files: 1')
    expect(route).toContain('fields: 0')
    expect(route).toContain('parts: 1')
    expect(route).toContain('fileSize: config.maxBytes')
    expect(route).toContain("part.fieldname !== 'file'")
    expect(route).toContain('const buffer = await part.toBuffer()')
    expect(route).not.toContain('data.fields')
    expect(route).not.toContain('request.body')
    expect(route).not.toContain('provider: request')
    expect(route).not.toContain('model: request')
  })

  it('requires server-side signature detection and declared MIME agreement', () => {
    expect(route).toContain('validateVoiceAvatarEvidenceUpload')
    expect(contract).toContain('detectVoiceAvatarEvidenceMime(input.buffer)')
    expect(contract).toContain('declaredMimeType !== detectedMimeType')
    expect(contract).toContain('config.allowedMimeTypes.includes(detectedMimeType)')
    expect(contract).toContain('getArtifactTypeFromMime(detectedMimeType)')
    expect(contract).toContain('config.artifactTypes.includes(artifactType)')
    expect(contract).not.toContain('image/svg+xml')
  })

  it('stores only app-owned completed evidence with Network provenance', () => {
    expect(route).toContain('await saveArtifact({')
    expect(route).toContain('appSlug: auth.app!.slug')
    expect(route).toContain("provider: 'amarktai-network'")
    expect(route).toContain("model: 'secure-profile-upload-v1'")
    expect(route).toContain('type: validated.artifactType')
    expect(route).toContain('subType: validated.config.subType')
    expect(route).toContain('explicitMimeType: validated.detectedMimeType')
    expect(route).toContain('grantCapability: validated.config.capability')
  })

  it('sanitizes filenames and handles file-size errors explicitly', () => {
    expect(route).toContain("basename((value || 'evidence').replaceAll('\\\\', '/'))")
    expect(route).toContain('error instanceof app.multipartErrors.RequestFileTooLargeError')
    expect(route).toContain("code: 'VOICE_AVATAR_EVIDENCE_TOO_LARGE'")
    expect(route).toContain('reply.status(413)')
  })
})
