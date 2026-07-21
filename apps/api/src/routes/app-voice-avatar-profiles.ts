import { randomUUID } from 'node:crypto'
import type { FastifyInstance, FastifyReply, FastifyRequest } from 'fastify'
import {
  ReusableAvatarProfileSchema,
  ReusableVoiceProfileSchema,
  type ReusableAvatarProfile,
  type ReusableVoiceProfile,
} from '@amarktai/core/voice-avatar-platform'
import {
  AvatarProfileCreateRequestSchema,
  AvatarProfileUpdateRequestSchema,
  VoiceAvatarProfileDecisionRequestSchema,
  VoiceProfileCreateRequestSchema,
  VoiceProfileUpdateRequestSchema,
} from '@amarktai/core/voice-avatar-resources'
import { resolveAppCapabilityGrantSnapshot } from '../lib/app-grant-loader.js'
import {
  VoiceAvatarProfileDependencyError,
  assertAvatarProfileDependencies,
  assertVoiceProfileDependencies,
} from '../lib/voice-avatar-profile-validation.js'
import {
  archiveAvatarProfile,
  archiveVoiceProfile,
  createAvatarProfile,
  createVoiceProfile,
  decideAvatarProfile,
  decideVoiceProfile,
  getAvatarProfile,
  getVoiceProfile,
  listAvatarProfiles,
  listVoiceProfiles,
  updateAvatarProfile,
  updateVoiceProfile,
} from '../lib/voice-avatar-profile-store.js'
import { authenticateAppKey } from './jobs.js'

const VOICE_PROFILE_ACCESS = new Set(['tts', 'voice_clone', 'voice_conversion', 'avatar_generation', 'lip_sync'])
const AVATAR_PROFILE_ACCESS = new Set(['avatar_generation', 'lip_sync'])

type AppAuthentication = Awaited<ReturnType<typeof authenticateAppKey>>
type AdminIdentity = { verifierReference: string }

async function requireApp(request: FastifyRequest, reply: FastifyReply): Promise<AppAuthentication | null> {
  const auth = await authenticateAppKey(request.headers.authorization)
  if (!auth.ok) {
    reply.status(auth.statusCode).send({ error: true, code: 'AUTHENTICATION_FAILED', message: auth.error })
    return null
  }
  return auth
}

function hasAnyCapability(allowedCapabilities: readonly string[], capabilities: ReadonlySet<string>): boolean {
  return allowedCapabilities.some((capability) => capabilities.has(capability))
}

function requireProfileReadAccess(auth: AppAuthentication, reply: FastifyReply, capabilities: ReadonlySet<string>): boolean {
  if (hasAnyCapability(auth.allowedCapabilities ?? [], capabilities)) return true
  reply.status(403).send({ error: true, code: 'PROFILE_CAPABILITY_REQUIRED', message: 'The app has no granted voice or avatar profile capability.' })
  return false
}

async function requireProfileWriteGrant(input: {
  auth: AppAuthentication
  capability: 'tts' | 'voice_clone' | 'avatar_generation'
  reply: FastifyReply
}): Promise<boolean> {
  const appSlug = input.auth.app!.slug
  const resolution = await resolveAppCapabilityGrantSnapshot(appSlug, input.capability, input.auth.allowedCapabilities ?? [])
  if (!resolution?.grant.enabled) {
    input.reply.status(403).send({
      error: true,
      code: 'PROFILE_GRANT_REQUIRED',
      message: `The '${input.capability}' grant is required for this profile source.`,
      missingCapabilities: [input.capability],
    })
    return false
  }
  if (!resolution.grant.artifactWrite) {
    input.reply.status(403).send({
      error: true,
      code: 'PROFILE_ARTIFACT_WRITE_REQUIRED',
      message: `The '${input.capability}' grant must allow artifact writes.`,
    })
    return false
  }
  return true
}

function voiceWriteCapability(profile: Pick<ReusableVoiceProfile, 'source'>): 'tts' | 'voice_clone' {
  return profile.source.sourceType === 'provider_catalogue' ? 'tts' : 'voice_clone'
}

async function requireAdmin(app: FastifyInstance, request: FastifyRequest, reply: FastifyReply): Promise<AdminIdentity | null> {
  const auth = request.headers.authorization
  if (!auth?.startsWith('Bearer ')) {
    reply.status(401).send({ error: true, code: 'AUTHENTICATION_FAILED', message: 'Authorization required' })
    return null
  }
  try {
    const payload = await app.jwtVerify(auth.slice(7))
    if (payload?.role !== 'admin' || typeof payload.sub !== 'string' || !payload.sub.trim()) {
      reply.status(403).send({ error: true, code: 'ADMIN_REQUIRED', message: 'Admin access required' })
      return null
    }
    return { verifierReference: `admin:${payload.sub.trim().toLowerCase()}` }
  } catch {
    reply.status(401).send({ error: true, code: 'AUTHENTICATION_FAILED', message: 'Invalid authorization' })
    return null
  }
}

function sendInvalid(reply: FastifyReply, code: string, message: string, issues?: unknown) {
  return reply.status(400).send({ error: true, code, message, ...(issues ? { issues } : {}) })
}

function sendProfileError(reply: FastifyReply, error: unknown) {
  if (error instanceof VoiceAvatarProfileDependencyError) {
    return reply.status(409).send({ error: true, code: error.code, message: error.message, details: error.details })
  }
  const message = error instanceof Error ? error.message : 'Voice or avatar profile operation failed'
  if (message.endsWith('_NOT_FOUND')) return reply.status(404).send({ error: true, code: message, message: 'Profile not found' })
  if (message.endsWith('_ALREADY_EXISTS')) return reply.status(409).send({ error: true, code: message, message: 'Profile already exists' })
  if (['VOICE_PROFILE_REVOKED', 'AVATAR_PROFILE_REVOKED', 'PROFILE_REVOKED', 'PROFILE_ARCHIVED', 'PROFILE_CONSENT_EXPIRED'].includes(message)) {
    return reply.status(409).send({ error: true, code: message, message })
  }
  return reply.status(500).send({ error: true, code: 'PROFILE_OPERATION_FAILED', message })
}

function mergeVoiceProfile(current: ReusableVoiceProfile, patch: ReturnType<typeof VoiceProfileUpdateRequestSchema.parse>, at: string): ReusableVoiceProfile {
  return ReusableVoiceProfileSchema.parse({
    ...current,
    ...patch,
    locale: patch.locale === null ? undefined : (patch.locale ?? current.locale),
    consentEvidence: patch.consentEvidence === null ? undefined : (patch.consentEvidence ?? current.consentEvidence),
    previewArtifactId: patch.previewArtifactId === null ? undefined : (patch.previewArtifactId ?? current.previewArtifactId),
    status: 'draft',
    rightsStatus: 'pending',
    rightsDecision: undefined,
    providerBinding: undefined,
    updatedAt: at,
    revokedAt: undefined,
    revocationReason: undefined,
  })
}

function mergeAvatarProfile(current: ReusableAvatarProfile, patch: ReturnType<typeof AvatarProfileUpdateRequestSchema.parse>, at: string): ReusableAvatarProfile {
  return ReusableAvatarProfileSchema.parse({
    ...current,
    ...patch,
    defaultVoiceProfileId: patch.defaultVoiceProfileId === null ? undefined : (patch.defaultVoiceProfileId ?? current.defaultVoiceProfileId),
    previewArtifactId: patch.previewArtifactId === null ? undefined : (patch.previewArtifactId ?? current.previewArtifactId),
    status: 'draft',
    rightsStatus: 'pending',
    rightsDecision: undefined,
    providerBinding: undefined,
    updatedAt: at,
    revokedAt: undefined,
    revocationReason: undefined,
  })
}

export async function appVoiceAvatarProfileRoutes(app: FastifyInstance): Promise<void> {
  app.get('/api/v1/voice-profiles', async (request, reply) => {
    const auth = await requireApp(request, reply)
    if (!auth || !requireProfileReadAccess(auth, reply, VOICE_PROFILE_ACCESS)) return
    return reply.send(await listVoiceProfiles(auth.app!.slug))
  })

  app.post('/api/v1/voice-profiles', async (request, reply) => {
    const auth = await requireApp(request, reply)
    if (!auth) return
    const parsed = VoiceProfileCreateRequestSchema.safeParse(request.body)
    if (!parsed.success) return sendInvalid(reply, 'INVALID_VOICE_PROFILE', 'Voice profile validation failed.', parsed.error.issues)
    const now = new Date().toISOString()
    const profileResult = ReusableVoiceProfileSchema.safeParse({
      version: 1,
      voiceProfileId: randomUUID(),
      appSlug: auth.app!.slug,
      status: 'draft',
      rightsStatus: 'pending',
      ...parsed.data,
      createdAt: now,
      updatedAt: now,
    })
    if (!profileResult.success) return sendInvalid(reply, 'INVALID_VOICE_PROFILE', 'Voice profile validation failed.', profileResult.error.issues)
    if (!(await requireProfileWriteGrant({ auth, capability: voiceWriteCapability(profileResult.data), reply }))) return
    try {
      await assertVoiceProfileDependencies({ profile: profileResult.data, requireVerifiedParent: true })
      return reply.status(201).send(await createVoiceProfile(profileResult.data))
    } catch (error) {
      return sendProfileError(reply, error)
    }
  })

  app.get('/api/v1/voice-profiles/:id', async (request, reply) => {
    const auth = await requireApp(request, reply)
    if (!auth || !requireProfileReadAccess(auth, reply, VOICE_PROFILE_ACCESS)) return
    const { id } = request.params as { id: string }
    const profile = await getVoiceProfile(auth.app!.slug, id)
    if (!profile) return reply.status(404).send({ error: true, code: 'VOICE_PROFILE_NOT_FOUND', message: 'Profile not found' })
    return reply.send(profile)
  })

  app.put('/api/v1/voice-profiles/:id', async (request, reply) => {
    const auth = await requireApp(request, reply)
    if (!auth) return
    const { id } = request.params as { id: string }
    const current = await getVoiceProfile(auth.app!.slug, id)
    if (!current) return reply.status(404).send({ error: true, code: 'VOICE_PROFILE_NOT_FOUND', message: 'Profile not found' })
    if (current.status === 'revoked' || current.status === 'archived') {
      return reply.status(409).send({ error: true, code: `VOICE_PROFILE_${current.status.toUpperCase()}`, message: `A ${current.status} voice profile cannot be edited.` })
    }
    const parsed = VoiceProfileUpdateRequestSchema.safeParse(request.body)
    if (!parsed.success) return sendInvalid(reply, 'INVALID_VOICE_PROFILE_UPDATE', 'Voice profile update validation failed.', parsed.error.issues)
    let profile: ReusableVoiceProfile
    try { profile = mergeVoiceProfile(current, parsed.data, new Date().toISOString()) }
    catch (error) { return sendInvalid(reply, 'INVALID_VOICE_PROFILE_UPDATE', error instanceof Error ? error.message : 'Voice profile update validation failed.') }
    if (!(await requireProfileWriteGrant({ auth, capability: voiceWriteCapability(profile), reply }))) return
    try {
      await assertVoiceProfileDependencies({ profile, requireVerifiedParent: true })
      return reply.send(await updateVoiceProfile(profile))
    } catch (error) {
      return sendProfileError(reply, error)
    }
  })

  app.delete('/api/v1/voice-profiles/:id', async (request, reply) => {
    const auth = await requireApp(request, reply)
    if (!auth) return
    const { id } = request.params as { id: string }
    const current = await getVoiceProfile(auth.app!.slug, id)
    if (!current) return reply.status(404).send({ error: true, code: 'VOICE_PROFILE_NOT_FOUND', message: 'Profile not found' })
    if (!(await requireProfileWriteGrant({ auth, capability: voiceWriteCapability(current), reply }))) return
    try { return reply.send(await archiveVoiceProfile(auth.app!.slug, id)) }
    catch (error) { return sendProfileError(reply, error) }
  })

  app.get('/api/v1/avatar-profiles', async (request, reply) => {
    const auth = await requireApp(request, reply)
    if (!auth || !requireProfileReadAccess(auth, reply, AVATAR_PROFILE_ACCESS)) return
    return reply.send(await listAvatarProfiles(auth.app!.slug))
  })

  app.post('/api/v1/avatar-profiles', async (request, reply) => {
    const auth = await requireApp(request, reply)
    if (!auth) return
    const parsed = AvatarProfileCreateRequestSchema.safeParse(request.body)
    if (!parsed.success) return sendInvalid(reply, 'INVALID_AVATAR_PROFILE', 'Avatar profile validation failed.', parsed.error.issues)
    if (!(await requireProfileWriteGrant({ auth, capability: 'avatar_generation', reply }))) return
    const now = new Date().toISOString()
    const profileResult = ReusableAvatarProfileSchema.safeParse({
      version: 1,
      avatarProfileId: randomUUID(),
      appSlug: auth.app!.slug,
      status: 'draft',
      rightsStatus: 'pending',
      ...parsed.data,
      createdAt: now,
      updatedAt: now,
    })
    if (!profileResult.success) return sendInvalid(reply, 'INVALID_AVATAR_PROFILE', 'Avatar profile validation failed.', profileResult.error.issues)
    try {
      await assertAvatarProfileDependencies({ profile: profileResult.data, requireVerifiedVoice: false })
      return reply.status(201).send(await createAvatarProfile(profileResult.data))
    } catch (error) {
      return sendProfileError(reply, error)
    }
  })

  app.get('/api/v1/avatar-profiles/:id', async (request, reply) => {
    const auth = await requireApp(request, reply)
    if (!auth || !requireProfileReadAccess(auth, reply, AVATAR_PROFILE_ACCESS)) return
    const { id } = request.params as { id: string }
    const profile = await getAvatarProfile(auth.app!.slug, id)
    if (!profile) return reply.status(404).send({ error: true, code: 'AVATAR_PROFILE_NOT_FOUND', message: 'Profile not found' })
    return reply.send(profile)
  })

  app.put('/api/v1/avatar-profiles/:id', async (request, reply) => {
    const auth = await requireApp(request, reply)
    if (!auth) return
    const { id } = request.params as { id: string }
    const current = await getAvatarProfile(auth.app!.slug, id)
    if (!current) return reply.status(404).send({ error: true, code: 'AVATAR_PROFILE_NOT_FOUND', message: 'Profile not found' })
    if (current.status === 'revoked' || current.status === 'archived') {
      return reply.status(409).send({ error: true, code: `AVATAR_PROFILE_${current.status.toUpperCase()}`, message: `A ${current.status} avatar profile cannot be edited.` })
    }
    const parsed = AvatarProfileUpdateRequestSchema.safeParse(request.body)
    if (!parsed.success) return sendInvalid(reply, 'INVALID_AVATAR_PROFILE_UPDATE', 'Avatar profile update validation failed.', parsed.error.issues)
    let profile: ReusableAvatarProfile
    try { profile = mergeAvatarProfile(current, parsed.data, new Date().toISOString()) }
    catch (error) { return sendInvalid(reply, 'INVALID_AVATAR_PROFILE_UPDATE', error instanceof Error ? error.message : 'Avatar profile update validation failed.') }
    if (!(await requireProfileWriteGrant({ auth, capability: 'avatar_generation', reply }))) return
    try {
      await assertAvatarProfileDependencies({ profile, requireVerifiedVoice: false })
      return reply.send(await updateAvatarProfile(profile))
    } catch (error) {
      return sendProfileError(reply, error)
    }
  })

  app.delete('/api/v1/avatar-profiles/:id', async (request, reply) => {
    const auth = await requireApp(request, reply)
    if (!auth) return
    const { id } = request.params as { id: string }
    if (!(await requireProfileWriteGrant({ auth, capability: 'avatar_generation', reply }))) return
    try { return reply.send(await archiveAvatarProfile(auth.app!.slug, id)) }
    catch (error) { return sendProfileError(reply, error) }
  })

  app.post('/api/admin/voice-profiles/:appSlug/:id/decision', async (request, reply) => {
    const admin = await requireAdmin(app, request, reply)
    if (!admin) return
    const parsed = VoiceAvatarProfileDecisionRequestSchema.safeParse(request.body)
    if (!parsed.success) return sendInvalid(reply, 'INVALID_PROFILE_DECISION', 'Profile decision validation failed.', parsed.error.issues)
    const { appSlug, id } = request.params as { appSlug: string; id: string }
    const profile = await getVoiceProfile(appSlug, id)
    if (!profile) return reply.status(404).send({ error: true, code: 'VOICE_PROFILE_NOT_FOUND', message: 'Profile not found' })
    try {
      if (parsed.data.decision === 'verified') await assertVoiceProfileDependencies({ profile, requireVerifiedParent: true })
      return reply.send(await decideVoiceProfile({
        appSlug,
        voiceProfileId: id,
        decision: { ...parsed.data, verifierReference: admin.verifierReference },
      }))
    } catch (error) {
      return sendProfileError(reply, error)
    }
  })

  app.post('/api/admin/avatar-profiles/:appSlug/:id/decision', async (request, reply) => {
    const admin = await requireAdmin(app, request, reply)
    if (!admin) return
    const parsed = VoiceAvatarProfileDecisionRequestSchema.safeParse(request.body)
    if (!parsed.success) return sendInvalid(reply, 'INVALID_PROFILE_DECISION', 'Profile decision validation failed.', parsed.error.issues)
    const { appSlug, id } = request.params as { appSlug: string; id: string }
    const profile = await getAvatarProfile(appSlug, id)
    if (!profile) return reply.status(404).send({ error: true, code: 'AVATAR_PROFILE_NOT_FOUND', message: 'Profile not found' })
    try {
      if (parsed.data.decision === 'verified') await assertAvatarProfileDependencies({ profile, requireVerifiedVoice: true })
      return reply.send(await decideAvatarProfile({
        appSlug,
        avatarProfileId: id,
        decision: { ...parsed.data, verifierReference: admin.verifierReference },
      }))
    } catch (error) {
      return sendProfileError(reply, error)
    }
  })
}
