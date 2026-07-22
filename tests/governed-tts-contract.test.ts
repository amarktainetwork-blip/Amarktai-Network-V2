import { readFileSync } from 'node:fs'
import Fastify from 'fastify'
import { afterEach, describe, expect, it } from 'vitest'
import {
  GovernedTtsRequestSchema,
  hasGovernedTtsBlockedField,
  validateGovernedTtsRequest,
} from '../packages/core/src/governed-tts.ts'
import {
  avatarProfileArtifactId,
  voiceProfileArtifactId,
} from '../packages/core/src/voice-avatar-resources.ts'
import { governedTtsIngressPlugin } from '../apps/api/src/plugins/governed-tts-ingress.ts'

const serverSource = readFileSync(new URL('../apps/api/src/server.ts', import.meta.url), 'utf8')
const pluginSource = readFileSync(new URL('../apps/api/src/plugins/governed-tts-ingress.ts', import.meta.url), 'utf8')
const voiceStudioSource = readFileSync(new URL('../app/dashboard/voice/page.js', import.meta.url), 'utf8')
const apps: Array<ReturnType<typeof Fastify>> = []

afterEach(async () => {
  await Promise.all(apps.splice(0).map((app) => app.close()))
})

async function ingressApp() {
  const app = Fastify({ logger: false })
  apps.push(app)
  await app.register(governedTtsIngressPlugin)
  app.post('/api/v1/jobs', async (request) => request.body)
  app.post('/api/admin/studio/jobs', async (request) => request.body)
  await app.ready()
  return app
}

describe('governed TTS canonical request', () => {
  it('accepts only outcome fields and applies prompt/default values', () => {
    const result = validateGovernedTtsRequest('Read the approved message.', {
      voiceProfileId: '11111111-1111-4111-8111-111111111111',
      intendedUse: 'marketing',
      language: 'en',
      locale: 'en-ZA',
      accent: 'south-african',
      style: 'warm',
      outputFormat: 'wav',
    })
    expect(result.success).toBe(true)
    expect(result.data).toMatchObject({
      text: 'Read the approved message.',
      voiceProfileId: '11111111-1111-4111-8111-111111111111',
      intendedUse: 'marketing',
      speed: 1,
      outputFormat: 'wav',
    })
    expect(GovernedTtsRequestSchema.safeParse(result.data).success).toBe(true)
  })

  it('rejects raw provider voice and every execution-authority field', () => {
    for (const field of ['voice', 'providerVoiceId', 'provider', 'model', 'route', 'executorId', 'endpoint', 'apiKey']) {
      const result = validateGovernedTtsRequest('Speak.', { [field]: 'blocked' })
      expect(result.success, field).toBe(false)
      expect(result.error, field).toContain(`input.${field} is not allowed`)
      expect(hasGovernedTtsBlockedField({ [field]: 'blocked' }), field).toBe(field)
    }
  })

  it('rejects unknown public fields rather than silently stripping them', () => {
    const result = validateGovernedTtsRequest('Speak.', { tone: 'friendly' })
    expect(result.success).toBe(false)
    expect(result.issues).toEqual(expect.arrayContaining([
      expect.objectContaining({ path: '', message: expect.stringContaining('Unrecognized key') }),
    ]))
  })

  it('keeps the Studio job prompt outside the strict governed TTS input', () => {
    expect(voiceStudioSource).toContain("mode === 'tts' ? input : { ...input, prompt }")
    expect(voiceStudioSource).not.toContain('submitJob(mode, { ...input, prompt })')
  })

  it('uses deterministic opaque profile artifact identities across API and worker packages', () => {
    const voiceId = '22222222-2222-4222-8222-222222222222'
    const avatarId = '33333333-3333-4333-8333-333333333333'
    expect(voiceProfileArtifactId('marketing-app', voiceId)).toMatch(/^voice-profile-[0-9a-f]{40}$/)
    expect(voiceProfileArtifactId('marketing-app', voiceId)).not.toBe(voiceProfileArtifactId('horse-app', voiceId))
    expect(avatarProfileArtifactId('marketing-app', avatarId)).toMatch(/^avatar-profile-[0-9a-f]{40}$/)
    expect(avatarProfileArtifactId('marketing-app', avatarId)).not.toBe(avatarProfileArtifactId('horse-app', avatarId))
  })
})

describe('governed TTS ingress plugin', () => {
  it('is registered globally before job routes and targets both ingestion surfaces', () => {
    expect(serverSource).toContain("import { governedTtsIngressPlugin } from './plugins/governed-tts-ingress.js'")
    expect(serverSource).toContain('await app.register(governedTtsIngressPlugin)')
    expect(serverSource.indexOf('await app.register(governedTtsIngressPlugin)')).toBeLessThan(serverSource.indexOf('await app.register(adminStudioRoutes)'))
    expect(serverSource.indexOf('await app.register(governedTtsIngressPlugin)')).toBeLessThan(serverSource.indexOf('await app.register(jobRoutes)'))
    expect(pluginSource).toContain("'/api/v1/jobs'")
    expect(pluginSource).toContain("'/api/admin/studio/jobs'")
  })

  it('rejects raw provider voice before the external app route receives the body', async () => {
    const app = await ingressApp()
    const response = await app.inject({
      method: 'POST',
      url: '/api/v1/jobs',
      payload: { capability: 'tts', prompt: 'Speak.', input: { voice: 'tara' } },
    })
    expect(response.statusCode).toBe(400)
    expect(response.json()).toMatchObject({
      error: true,
      code: 'INVALID_GOVERNED_TTS_REQUEST',
    })
  })

  it('stores the governed request in server-owned metadata and passes only legacy-safe fields downstream', async () => {
    const app = await ingressApp()
    const response = await app.inject({
      method: 'POST',
      url: '/api/admin/studio/jobs',
      payload: {
        capability: 'tts',
        prompt: 'Speak the approved campaign line.',
        input: {
          voiceProfileId: '44444444-4444-4444-8444-444444444444',
          intendedUse: 'marketing',
          language: 'en',
          locale: 'en-ZA',
          accent: 'south-african',
          style: 'warm',
          speed: 1.1,
          outputFormat: 'wav',
        },
        metadata: {
          governedTtsRequest: { voice: 'spoofed' },
          governedTtsContractVersion: 999,
        },
      },
    })
    expect(response.statusCode).toBe(200)
    const body = response.json() as Record<string, any>
    expect(body.input).toEqual({
      text: 'Speak the approved campaign line.',
      speed: 1.1,
      outputFormat: 'wav',
      language: 'en',
      style: 'warm',
    })
    expect(body.input).not.toHaveProperty('voice')
    expect(body.input).not.toHaveProperty('voiceProfileId')
    expect(body.metadata.governedTtsContractVersion).toBe(1)
    expect(body.metadata.governedTtsRequest).toMatchObject({
      voiceProfileId: '44444444-4444-4444-8444-444444444444',
      intendedUse: 'marketing',
      locale: 'en-ZA',
      accent: 'south-african',
    })
    expect(body.metadata.governedTtsValidatedAt).toEqual(expect.any(String))
  })

  it('does not mutate non-TTS requests', async () => {
    const app = await ingressApp()
    const original = { capability: 'chat', prompt: 'Hello', input: { messages: [{ role: 'user', content: 'Hello' }] } }
    const response = await app.inject({ method: 'POST', url: '/api/v1/jobs', payload: original })
    expect(response.statusCode).toBe(200)
    expect(response.json()).toEqual(original)
  })
})
