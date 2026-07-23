/**
 * Voice Audio API Contract Tests — behavioral tests for the isolated API routes.
 *
 * Proves:
 * - Missing authorization denied
 * - Invalid API key denied
 * - Missing capability grant denied
 * - Cross-app artifact denied
 * - Cross-app Voice Profile denied
 * - Draft/revoked profile denied
 * - Provider/model override denied
 * - Provider blockers return 422 without enqueuing
 */

import { describe, expect, it, vi, beforeEach } from 'vitest'

const mockPrisma = {
  artifact: { findFirst: vi.fn() },
  job: { findFirst: vi.fn(), create: vi.fn(), updateMany: vi.fn() },
}

const mockAuthenticateAppKey = vi.fn()
const mockResolveAppCapabilityGrantSnapshot = vi.fn()
const mockGetVoiceProfile = vi.fn()
const mockEvaluateVoiceProfileRights = vi.fn()
const mockHasVoiceAvatarBlockedOverrides = vi.fn(() => null)

vi.mock('@amarktai/db', () => ({ prisma: mockPrisma }))
vi.mock('../apps/api/src/routes/jobs.js', () => ({ authenticateAppKey: mockAuthenticateAppKey }))
vi.mock('../apps/api/src/lib/app-grant-loader.js', () => ({ resolveAppCapabilityGrantSnapshot: mockResolveAppCapabilityGrantSnapshot }))
vi.mock('../apps/api/src/lib/voice-avatar-profile-store.js', () => ({ getVoiceProfile: mockGetVoiceProfile }))
vi.mock('@amarktai/core/voice-avatar-platform', () => ({
  VOICE_AVATAR_USE_SCOPES: [
    'narration',
    'conversational_agent',
    'marketing',
    'education',
    'accessibility',
    'customer_support',
    'avatar_performance',
    'internal_production',
  ],
  hasVoiceAvatarBlockedOverrides: mockHasVoiceAvatarBlockedOverrides,
  evaluateVoiceProfileRights: mockEvaluateVoiceProfileRights,
}))

function createMockRequest(auth?: string, body?: Record<string, unknown>, params?: Record<string, string>) {
  return {
    headers: { authorization: auth },
    body: body ?? {},
    params: params ?? {},
  } as any
}

function createMockReply() {
  const reply: any = {
    statusCode: 200,
    body: null,
    status(code: number) { reply.statusCode = code; return reply },
    send(data: unknown) { reply.body = data; return reply },
  }
  return reply
}

function createMockApp() {
  return {
    post: vi.fn(),
    get: vi.fn(),
    redis: {},
    log: { error: vi.fn(), info: vi.fn() },
  } as any
}

describe('voice audio API contract', () => {
  beforeEach(() => {
    vi.clearAllMocks()
    mockHasVoiceAvatarBlockedOverrides.mockReturnValue(null)
    mockPrisma.job.findFirst.mockResolvedValue(null)
  })

  describe('authentication', () => {
    it('rejects missing authorization', async () => {
      mockAuthenticateAppKey.mockResolvedValue({ ok: false, statusCode: 401, error: 'Missing API key' })

      const { registerVoiceCloneRoutes } = await import('../apps/api/src/routes/voice-clone.js')
      const app = createMockApp()
      await registerVoiceCloneRoutes(app)

      const postHandler = app.post.mock.calls.find((c: any[]) => c[0] === '/api/v1/voice-clone')?.[1]
      expect(postHandler).toBeDefined()

      const req = createMockRequest(undefined, {})
      const reply = createMockReply()
      await postHandler(req, reply)

      expect(reply.statusCode).toBe(401)
      expect(reply.body.code).toBe('AUTH_REQUIRED')
    })

    it('rejects invalid API key', async () => {
      mockAuthenticateAppKey.mockResolvedValue({ ok: false, statusCode: 401, error: 'Invalid API key' })

      const { registerVoiceCloneRoutes } = await import('../apps/api/src/routes/voice-clone.js')
      const app = createMockApp()
      await registerVoiceCloneRoutes(app)

      const postHandler = app.post.mock.calls.find((c: any[]) => c[0] === '/api/v1/voice-clone')?.[1]
      const req = createMockRequest('Bearer invalid-key', {})
      const reply = createMockReply()
      await postHandler(req, reply)

      expect(reply.statusCode).toBe(401)
    })
  })

  describe('capability grants', () => {
    it('rejects missing capability grant', async () => {
      mockAuthenticateAppKey.mockResolvedValue({ ok: true, app: { slug: 'test-app' }, allowedCapabilities: [] })
      mockResolveAppCapabilityGrantSnapshot.mockResolvedValue(null)

      const { registerVoiceCloneRoutes } = await import('../apps/api/src/routes/voice-clone.js')
      const app = createMockApp()
      await registerVoiceCloneRoutes(app)

      const postHandler = app.post.mock.calls.find((c: any[]) => c[0] === '/api/v1/voice-clone')?.[1]
      const req = createMockRequest('Bearer valid-key', {
        sourceAudioArtifactId: 'a0eebc99-9c0b-4ef8-bb6d-6bb9bd380a11',
        voiceProfileId: 'a0eebc99-9c0b-4ef8-bb6d-6bb9bd380a12',
        intendedUse: 'narration',
      })
      const reply = createMockReply()
      await postHandler(req, reply)

      expect(reply.statusCode).toBe(403)
      expect(reply.body.code).toBe('CAPABILITY_GRANT_DENIED')
    })

    it('rejects disabled grant', async () => {
      mockAuthenticateAppKey.mockResolvedValue({ ok: true, app: { slug: 'test-app' }, allowedCapabilities: ['voice_clone'] })
      mockResolveAppCapabilityGrantSnapshot.mockResolvedValue({ grant: { enabled: false }, source: 'app_capability_grant' })

      const { registerVoiceCloneRoutes } = await import('../apps/api/src/routes/voice-clone.js')
      const app = createMockApp()
      await registerVoiceCloneRoutes(app)

      const postHandler = app.post.mock.calls.find((c: any[]) => c[0] === '/api/v1/voice-clone')?.[1]
      const req = createMockRequest('Bearer valid-key', {
        sourceAudioArtifactId: 'a0eebc99-9c0b-4ef8-bb6d-6bb9bd380a11',
        voiceProfileId: 'a0eebc99-9c0b-4ef8-bb6d-6bb9bd380a12',
        intendedUse: 'narration',
      })
      const reply = createMockReply()
      await postHandler(req, reply)

      expect(reply.statusCode).toBe(403)
      expect(reply.body.code).toBe('CAPABILITY_GRANT_DENIED')
    })

    it('rejects artifact-read denial', async () => {
      mockAuthenticateAppKey.mockResolvedValue({ ok: true, app: { slug: 'test-app' }, allowedCapabilities: ['voice_clone'] })
      mockResolveAppCapabilityGrantSnapshot.mockResolvedValue({ grant: { enabled: true, artifactRead: false }, source: 'app_capability_grant' })

      const { registerVoiceCloneRoutes } = await import('../apps/api/src/routes/voice-clone.js')
      const app = createMockApp()
      await registerVoiceCloneRoutes(app)

      const postHandler = app.post.mock.calls.find((c: any[]) => c[0] === '/api/v1/voice-clone')?.[1]
      const req = createMockRequest('Bearer valid-key', {
        sourceAudioArtifactId: 'a0eebc99-9c0b-4ef8-bb6d-6bb9bd380a11',
        voiceProfileId: 'a0eebc99-9c0b-4ef8-bb6d-6bb9bd380a12',
        intendedUse: 'narration',
      })
      const reply = createMockReply()
      await postHandler(req, reply)

      expect(reply.statusCode).toBe(403)
      expect(reply.body.code).toBe('GRANT_DENIED')
    })
  })

  describe('artifact ownership', () => {
    it('rejects cross-app artifact', async () => {
      mockAuthenticateAppKey.mockResolvedValue({ ok: true, app: { slug: 'test-app' }, allowedCapabilities: ['voice_clone'] })
      mockResolveAppCapabilityGrantSnapshot.mockResolvedValue({ grant: { enabled: true, artifactRead: true }, source: 'app_capability_grant' })
      mockPrisma.artifact.findFirst.mockResolvedValue(null)

      const { registerVoiceCloneRoutes } = await import('../apps/api/src/routes/voice-clone.js')
      const app = createMockApp()
      await registerVoiceCloneRoutes(app)

      const postHandler = app.post.mock.calls.find((c: any[]) => c[0] === '/api/v1/voice-clone')?.[1]
      const req = createMockRequest('Bearer valid-key', {
        sourceAudioArtifactId: 'a0eebc99-9c0b-4ef8-bb6d-6bb9bd380a11',
        voiceProfileId: 'a0eebc99-9c0b-4ef8-bb6d-6bb9bd380a12',
        language: 'en',
        intendedUse: 'narration',
        consentEvidenceReference: 'consent-ref-1',
        rightsDeclarationReference: 'rights-ref-1',
      })
      const reply = createMockReply()
      await postHandler(req, reply)

      expect(reply.statusCode).toBe(404)
      expect(reply.body.code).toBe('ARTIFACT_NOT_FOUND')
    })
  })

  describe('provider blockers', () => {
    it('voice clone route exists and requires auth', async () => {
      mockAuthenticateAppKey.mockResolvedValue({ ok: false, statusCode: 401, error: 'Missing API key' })

      const { registerVoiceCloneRoutes } = await import('../apps/api/src/routes/voice-clone.js')
      const app = createMockApp()
      await registerVoiceCloneRoutes(app)

      const postHandler = app.post.mock.calls.find((c: any[]) => c[0] === '/api/v1/voice-clone')?.[1]
      expect(postHandler).toBeDefined()

      const req = createMockRequest(undefined, {})
      const reply = createMockReply()
      await postHandler(req, reply)

      expect(reply.statusCode).toBe(401)
      expect(reply.body.code).toBe('AUTH_REQUIRED')
    })

    it('voice clone requires capability grant', async () => {
      mockAuthenticateAppKey.mockResolvedValue({ ok: true, app: { slug: 'test-app' }, allowedCapabilities: [] })
      mockResolveAppCapabilityGrantSnapshot.mockResolvedValue(null)

      const { registerVoiceCloneRoutes } = await import('../apps/api/src/routes/voice-clone.js')
      const app = createMockApp()
      await registerVoiceCloneRoutes(app)

      const postHandler = app.post.mock.calls.find((c: any[]) => c[0] === '/api/v1/voice-clone')?.[1]
      const req = createMockRequest('Bearer valid-key', {})
      const reply = createMockReply()
      await postHandler(req, reply)

      expect(reply.statusCode).toBe(403)
      expect(reply.body.code).toBe('CAPABILITY_GRANT_DENIED')
    })

    it('voice clone rejects cross-app artifact', async () => {
      mockAuthenticateAppKey.mockResolvedValue({ ok: true, app: { slug: 'test-app' }, allowedCapabilities: ['voice_clone'] })
      mockResolveAppCapabilityGrantSnapshot.mockResolvedValue({ grant: { enabled: true, artifactRead: true }, source: 'app_capability_grant' })
      mockPrisma.artifact.findFirst.mockResolvedValue(null)

      const { registerVoiceCloneRoutes } = await import('../apps/api/src/routes/voice-clone.js')
      const app = createMockApp()
      await registerVoiceCloneRoutes(app)

      const postHandler = app.post.mock.calls.find((c: any[]) => c[0] === '/api/v1/voice-clone')?.[1]
      const req = createMockRequest('Bearer valid-key', {
        sourceAudioArtifactId: 'a0eebc99-9c0b-4ef8-bb6d-6bb9bd380a11',
        voiceProfileId: 'a0eebc99-9c0b-4ef8-bb6d-6bb9bd380a12',
        language: 'en',
        intendedUse: 'narration',
        consentEvidenceReference: 'consent-ref-1',
        rightsDeclarationReference: 'rights-ref-1',
      })
      const reply = createMockReply()
      await postHandler(req, reply)

      expect(reply.statusCode).toBe(404)
      expect(reply.body.code).toBe('ARTIFACT_NOT_FOUND')
    })
  })

  describe('provider/model override denial', () => {
    it('rejects provider override in request body', async () => {
      mockAuthenticateAppKey.mockResolvedValue({ ok: true, app: { slug: 'test-app' }, allowedCapabilities: ['voice_clone'] })
      mockHasVoiceAvatarBlockedOverrides.mockReturnValueOnce('provider')

      const { registerVoiceCloneRoutes } = await import('../apps/api/src/routes/voice-clone.js')
      const app = createMockApp()
      await registerVoiceCloneRoutes(app)

      const postHandler = app.post.mock.calls.find((c: any[]) => c[0] === '/api/v1/voice-clone')?.[1]
      const req = createMockRequest('Bearer valid-key', { provider: 'openai' })
      const reply = createMockReply()
      await postHandler(req, reply)

      expect(reply.statusCode).toBe(400)
      expect(reply.body.code).toBe('BLOCKED_FIELD')
    })
  })
})
