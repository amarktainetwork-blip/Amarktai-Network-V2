import Fastify from 'fastify'
import { afterEach, describe, expect, it, vi } from 'vitest'
import { PROVIDER_KEYS } from '@amarktai/core'

vi.mock('../apps/api/src/lib/admin-runtime-truth.js', () => ({
  buildAdminRuntimeTruth: vi.fn().mockResolvedValue({
    generatedAt: new Date().toISOString(),
    providerPolicy: {
      runtimeExecutionProviders: ['genx', 'together', 'deepinfra'],
      codingOnlyProviders: ['mimo'],
      qwenRuntimeEligible: false,
    },
    providers: [],
    capabilities: [
      { capability: 'chat', liveProven: true, executableNow: true, classification: 'LIVE_PROVEN', eligibleModels: [{ provider: 'deepinfra', modelId: 'llama-3.1-8b-instant', liveProven: true }] },
      { capability: 'reasoning', liveProven: true, executableNow: true, classification: 'LIVE_PROVEN', eligibleModels: [{ provider: 'deepinfra', modelId: 'llama-3.1-8b-instant', liveProven: true }] },
      { capability: 'code', liveProven: true, executableNow: true, classification: 'LIVE_PROVEN', eligibleModels: [{ provider: 'deepinfra', modelId: 'llama-3.1-8b-instant', liveProven: true }] },
      { capability: 'summarization', liveProven: true, executableNow: true, classification: 'LIVE_PROVEN', eligibleModels: [{ provider: 'deepinfra', modelId: 'llama-3.1-8b-instant', liveProven: true }] },
      { capability: 'translation', liveProven: true, executableNow: true, classification: 'LIVE_PROVEN', eligibleModels: [{ provider: 'deepinfra', modelId: 'llama-3.1-8b-instant', liveProven: true }] },
      { capability: 'classification', liveProven: true, executableNow: true, classification: 'LIVE_PROVEN', eligibleModels: [{ provider: 'deepinfra', modelId: 'llama-3.1-8b-instant', liveProven: true }] },
      { capability: 'extraction', liveProven: true, executableNow: true, classification: 'LIVE_PROVEN', eligibleModels: [{ provider: 'deepinfra', modelId: 'llama-3.1-8b-instant', liveProven: true }] },
      { capability: 'structured_output', liveProven: true, executableNow: true, classification: 'LIVE_PROVEN', eligibleModels: [{ provider: 'deepinfra', modelId: 'llama-3.1-8b-instant', liveProven: true }] },
      { capability: 'image_generation', liveProven: true, executableNow: true, classification: 'LIVE_PROVEN', eligibleModels: [{ provider: 'together', modelId: 'black-forest-labs/FLUX.1-schnell', liveProven: true }] },
      { capability: 'video_generation', liveProven: true, executableNow: true, classification: 'LIVE_PROVEN', eligibleModels: [{ provider: 'genx', modelId: 'grok-imagine-video', liveProven: true }] },
      { capability: 'music_generation', liveProven: false, executableNow: false, classification: 'PARTIAL', eligibleModels: [] },
      { capability: 'long_form_video', liveProven: false, executableNow: false, classification: 'PARTIAL', eligibleModels: [] },
    ],
    releaseReadiness: [],
    releaseCandidateCapabilities: [],
    countsByClassification: { LIVE_PROVEN: 10, PARTIAL: 2, EXECUTABLE_NOT_LIVE_PROVEN: 0, IMPLEMENTED_NOT_CONFIGURED: 0, CATALOGUE_ONLY: 0, POLICY_RESTRICTED: 0, BLOCKED: 0, MISSING: 0 },
    evidenceAvailable: true,
  }),
  selectCapabilityProofStates: vi.fn(),
}))

const { adminRuntimeProofRoutes } = await import('../apps/api/src/routes/admin-runtime-proofs.ts')
const { getRuntimeProofStatus, projectProofStatusFromTruth } = await import('../apps/api/src/lib/runtime-proof-status.ts')

const APPROVED_PROVIDERS = [...PROVIDER_KEYS]
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
    expect(body.evidenceAvailable).toBe(true)
    expect(body.summary.source).toBe('backend-runtime-proof-status')
    expect(body.summary.lastUpdatedFrom).toBe('canonical-truth')
  })

  it('projects proven capabilities from canonical truth', () => {
    const payload = projectProofStatusFromTruth({
      generatedAt: new Date().toISOString(),
      providerPolicy: { runtimeExecutionProviders: ['genx', 'together', 'deepinfra'], codingOnlyProviders: ['mimo'], qwenRuntimeEligible: false },
      providers: [],
      capabilities: [
        { capability: 'chat', liveProven: true, classification: 'LIVE_PROVEN', eligibleModels: [{ provider: 'deepinfra', modelId: 'llama-3.1-8b-instant', liveProven: true }] },
        { capability: 'image_generation', liveProven: true, classification: 'LIVE_PROVEN', eligibleModels: [{ provider: 'together', modelId: 'black-forest-labs/FLUX.1-schnell', liveProven: true }] },
      ],
      releaseReadiness: [
        { capability: 'chat', readyForDashboardExecution: true },
        { capability: 'image_generation', readyForDashboardExecution: true },
      ],
      releaseCandidateCapabilities: ['chat', 'image_generation'],
      countsByClassification: {},
      evidenceAvailable: true,
    })

    expect(payload.provenCapabilities).toHaveLength(2)
    expect(payload.evidenceAvailable).toBe(true)

    const chat = byCapability(payload.provenCapabilities, 'chat')
    expect(chat).toMatchObject({
      status: 'proven',
      provider: 'deepinfra',
      artifactRequired: false,
      proofLevel: 'live_external_app_job',
      readyForDashboardExecution: true,
    })

    const image = byCapability(payload.provenCapabilities, 'image_generation')
    expect(image).toMatchObject({
      status: 'proven',
      provider: 'together',
      model: 'black-forest-labs/FLUX.1-schnell',
      artifactRequired: true,
      proofLevel: 'live_external_app_job_with_artifact_download',
      readyForDashboardExecution: true,
    })
  })

  it('keeps Mimo approved but not proven', async () => {
    const app = await makeApp()
    const res = await app.inject({
      method: 'GET',
      url: '/api/admin/runtime-proofs',
      headers: { authorization: 'Bearer admin-token' },
    })
    const body = JSON.parse(res.body)
    const serializedProven = JSON.stringify(body.provenCapabilities)

    expect(body.providers).toContain('mimo')
    expect(body.providers).toContain('deepinfra')
    expect(serializedProven).not.toContain('"mimo"')
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
    expect(serialized).not.toContain('apikey')
    expect(serialized).not.toContain('secret')
    expect(serialized).not.toContain('ciphertext')
    expect(serialized).not.toContain('proof-key')
    expect(serialized).not.toContain('v1:')
  })

  it('keeps unsupported and unproven capabilities out of dashboard-ready status', async () => {
    const app = await makeApp()
    const res = await app.inject({
      method: 'GET',
      url: '/api/admin/runtime-proofs',
      headers: { authorization: 'Bearer admin-token' },
    })
    const body = JSON.parse(res.body)

    expect(body.unprovenCapabilities.length).toBeGreaterThan(0)
    for (const capability of body.unprovenCapabilities) {
      expect(capability.status).toBe('unproven')
      expect(capability.provider).toBeNull()
      expect(capability.proofLevel).toBe('not_proven')
      expect(capability.readyForDashboardExecution).toBe(false)
    }
  })

  it('distinguishes zero evidence from evidence unavailable', () => {
    const zeroEvidence = projectProofStatusFromTruth({
      generatedAt: new Date().toISOString(),
      providerPolicy: { runtimeExecutionProviders: ['genx', 'together', 'deepinfra'], codingOnlyProviders: ['mimo'], qwenRuntimeEligible: false },
      providers: [],
      capabilities: [],
      releaseReadiness: [],
      releaseCandidateCapabilities: [],
      countsByClassification: {},
      evidenceAvailable: true,
    })
    expect(zeroEvidence.evidenceAvailable).toBe(true)
    expect(zeroEvidence.provenCapabilities).toHaveLength(0)

    const unavailableEvidence = projectProofStatusFromTruth({
      generatedAt: new Date().toISOString(),
      providerPolicy: { runtimeExecutionProviders: ['genx', 'together', 'deepinfra'], codingOnlyProviders: ['mimo'], qwenRuntimeEligible: false },
      providers: [],
      capabilities: [],
      releaseReadiness: [],
      releaseCandidateCapabilities: [],
      countsByClassification: {},
      evidenceAvailable: false,
    })
    expect(unavailableEvidence.evidenceAvailable).toBe(false)
    expect(unavailableEvidence.unprovenCapabilities[0].description).toContain('unavailable')
  })
})
