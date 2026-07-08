import Fastify from 'fastify'
import { afterEach, describe, expect, it } from 'vitest'

const { adminRuntimeProofRoutes } = await import('../apps/api/src/routes/admin-runtime-proofs.ts')
const { getRuntimeProofStatus } = await import('../apps/api/src/lib/runtime-proof-status.ts')

const APPROVED_PROVIDERS = ['genx', 'groq', 'together', 'mimo', 'deepinfra']
const PROVEN_CAPABILITIES = ['chat', 'image_generation', 'video_generation']
const DISALLOWED_PROVIDERS = [
  'openai',
  'anthropic',
  'gemini',
  'qwen',
  'huggingface',
  'heygen',
  'minimax',
  'replicate',
]
const testApps = []

async function makeApp(role = 'admin') {
  const app = Fastify({ logger: false })
  app.decorate('jwtVerify', async (token) => {
    if (token === 'bad-token') return null
    return { sub: 'admin@example.com', role, iat: 1, exp: 9999999999 }
  })
  await app.register(adminRuntimeProofRoutes)
  await app.ready()
  testApps.push(app)
  return app
}

function byCapability(items, capability) {
  return items.find((item) => item.capability === capability)
}

describe('Admin runtime proof status route', () => {
  afterEach(async () => {
    await Promise.all(testApps.splice(0).map((app) => app.close()))
  })

  it('requires Authorization header', async () => {
    const app = await makeApp()

    const res = await app.inject({ method: 'GET', url: '/api/admin/runtime-proofs' })

    expect(res.statusCode).toBe(401)
    expect(JSON.parse(res.body)).toEqual({
      error: true,
      message: 'Missing or invalid Authorization header',
    })
  })

  it('rejects non-admin JWTs', async () => {
    const app = await makeApp('app')

    const res = await app.inject({
      method: 'GET',
      url: '/api/admin/runtime-proofs',
      headers: { authorization: 'Bearer app-token' },
    })

    expect(res.statusCode).toBe(403)
    expect(JSON.parse(res.body)).toEqual({
      error: true,
      message: 'Admin access required',
    })
  })

  it('returns the canonical backend runtime proof payload for admins', async () => {
    const app = await makeApp()

    const res = await app.inject({
      method: 'GET',
      url: '/api/admin/runtime-proofs',
      headers: { authorization: 'Bearer admin-token' },
    })

    expect(res.statusCode).toBe(200)
    const body = JSON.parse(res.body)

    expect(body.providers).toEqual(APPROVED_PROVIDERS)
    expect(body.provenCapabilities.map((item) => item.capability)).toEqual(PROVEN_CAPABILITIES)
    expect(body.summary).toEqual({
      provenCount: 3,
      providerCount: 5,
      lastUpdatedFrom: 'runtime-proof-code',
      source: 'backend-runtime-proof-status',
    })
  })

  it('marks only the three live-proven backend capability paths ready', () => {
    const payload = getRuntimeProofStatus()
    const chat = byCapability(payload.provenCapabilities, 'chat')
    const image = byCapability(payload.provenCapabilities, 'image_generation')
    const video = byCapability(payload.provenCapabilities, 'video_generation')

    expect(chat).toMatchObject({
      status: 'proven',
      provider: 'groq',
      artifactRequired: false,
      proofLevel: 'live_external_app_job',
      readyForDashboardExecution: true,
    })
    expect(image).toMatchObject({
      status: 'proven',
      provider: 'together',
      model: 'black-forest-labs/FLUX.1-schnell',
      artifactRequired: true,
      proofLevel: 'live_external_app_job_with_artifact_download',
      readyForDashboardExecution: true,
    })
    expect(video).toMatchObject({
      status: 'proven',
      provider: 'genx',
      model: 'grok-imagine-video',
      artifactRequired: true,
      proofLevel: 'live_external_app_job_with_artifact_download',
      readyForDashboardExecution: true,
    })
  })

  it('keeps Mimo and DeepInfra approved but not proven', () => {
    const payload = getRuntimeProofStatus()
    const serializedProven = JSON.stringify(payload.provenCapabilities)

    expect(payload.providers).toContain('mimo')
    expect(payload.providers).toContain('deepinfra')
    expect(serializedProven).not.toContain('"mimo"')
    expect(serializedProven).not.toContain('"deepinfra"')
  })

  it('does not include disallowed providers or secret-like fields', async () => {
    const app = await makeApp()
    const res = await app.inject({
      method: 'GET',
      url: '/api/admin/runtime-proofs',
      headers: { authorization: 'Bearer admin-token' },
    })
    const serialized = res.body.toLowerCase()

    for (const provider of DISALLOWED_PROVIDERS) {
      expect(serialized).not.toContain(provider)
    }
    expect(serialized).not.toContain('apiKey')
    expect(serialized).not.toContain('apikey')
    expect(serialized).not.toContain('secret')
    expect(serialized).not.toContain('ciphertext')
    expect(serialized).not.toContain('token')
    expect(serialized).not.toContain('proof-key')
    expect(serialized).not.toContain('v1:')
  })

  it('keeps unsupported and unproven capabilities out of dashboard-ready status', () => {
    const payload = getRuntimeProofStatus()

    expect(payload.unprovenCapabilities.length).toBeGreaterThan(0)
    expect(payload.unprovenCapabilities.map((item) => item.capability)).not.toEqual(
      expect.arrayContaining(PROVEN_CAPABILITIES),
    )
    for (const capability of payload.unprovenCapabilities) {
      expect(capability.status).toBe('unproven')
      expect(capability.provider).toBeNull()
      expect(capability.proofLevel).toBe('not_proven')
      expect(capability.readyForDashboardExecution).toBe(false)
    }
  })
})
