/**
 * Admin provider credential route contract tests.
 */

import Fastify from 'fastify'
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'

const dbMocks = vi.hoisted(() => {
  class ProviderConfigError extends Error {
    constructor(message, providerKey, code) {
      super(message)
      this.providerKey = providerKey
      this.code = code
    }
  }

  return {
    ProviderConfigError,
    listProviderCredentialStatuses: vi.fn(),
    saveProviderCredential: vi.fn(),
    clearProviderCredential: vi.fn(),
    resolveProviderApiKey: vi.fn(),
    getProviderCredentialStatus: vi.fn(),
    updateProviderHealthStatus: vi.fn(),
  }
})

const providerMocks = vi.hoisted(() => ({
  DEFAULT_GENX_VIDEO_MODEL: 'seedance-v1-fast',
  genxSubmitVideo: vi.fn(),
  groqChat: vi.fn(),
  togetherGenerateImage: vi.fn(),
}))

vi.mock('@amarktai/db', () => dbMocks)
vi.mock('@amarktai/providers', () => providerMocks)

const { adminProviderRoutes } = await import('../apps/api/src/routes/admin-providers.ts')

function makeStatus(overrides = {}) {
  return {
    providerKey: 'groq',
    displayName: 'Groq',
    enabled: true,
    configured: true,
    source: 'database',
    maskedPreview: 'gsk_********abcd',
    baseUrl: '',
    defaultModel: 'llama-3.3-70b-versatile',
    fallbackModel: '',
    healthStatus: 'configured',
    healthMessage: 'Credential stored; live health not checked.',
    lastCheckedAt: null,
    sortOrder: 2,
    notes: '',
    ...overrides,
  }
}

async function makeApp(role = 'admin') {
  const app = Fastify({ logger: false })
  app.decorate('jwtVerify', async (token) => {
    if (token === 'bad-token') return null
    return { sub: 'admin@example.com', role, iat: 1, exp: 9999999999 }
  })
  app.decorate('jwtSign', async () => 'token')
  await app.register(adminProviderRoutes)
  return app
}

describe('Admin provider credential routes', () => {
  beforeEach(() => {
    vi.clearAllMocks()
    dbMocks.resolveProviderApiKey.mockResolvedValue({
      providerKey: 'groq',
      apiKey: 'gsk_live_secret_abcd',
      source: 'database',
    })
    dbMocks.getProviderCredentialStatus.mockResolvedValue(makeStatus())
    dbMocks.updateProviderHealthStatus.mockImplementation(async (input) => makeStatus({
      providerKey: input.providerKey,
      healthStatus: input.healthStatus,
      healthMessage: input.healthMessage,
      lastCheckedAt: input.lastCheckedAt ?? new Date('2026-07-07T00:00:00Z'),
    }))
    providerMocks.groqChat.mockResolvedValue({
      content: 'AMARKTAI_PROVIDER_TEST_OK',
      model: 'llama-3.3-70b-versatile',
      usage: { promptTokens: 1, completionTokens: 1, totalTokens: 2 },
      finishReason: 'stop',
    })
    providerMocks.togetherGenerateImage.mockResolvedValue({
      images: [{ base64: 'aW1hZ2U=', buffer: Buffer.from('image'), width: 256, height: 256, mimeType: 'image/png' }],
      model: 'black-forest-labs/FLUX.1-schnell',
      usage: { promptTokens: 1, completionTokens: 0, totalTokens: 1 },
    })
    providerMocks.genxSubmitVideo.mockResolvedValue({
      jobId: 'genx-test-job-001',
      status: 'pending',
      model: 'seedance-v1-fast',
    })
  })

  afterEach(() => {
    delete process.env.JWT_SECRET
  })

  it('rejects unauthenticated list requests', async () => {
    const app = await makeApp()
    const res = await app.inject({ method: 'GET', url: '/api/admin/providers' })

    expect(res.statusCode).toBe(401)
    expect(dbMocks.listProviderCredentialStatuses).not.toHaveBeenCalled()
  })

  it('rejects non-admin requests', async () => {
    const app = await makeApp('app')
    const res = await app.inject({
      method: 'GET',
      url: '/api/admin/providers',
      headers: { authorization: 'Bearer app-token' },
    })

    expect(res.statusCode).toBe(403)
  })

  it('lists providers without raw keys or ciphertext', async () => {
    dbMocks.listProviderCredentialStatuses.mockResolvedValue([
      makeStatus(),
    ])
    const app = await makeApp()

    const res = await app.inject({
      method: 'GET',
      url: '/api/admin/providers',
      headers: { authorization: 'Bearer admin-token' },
    })

    expect(res.statusCode).toBe(200)
    const body = JSON.parse(res.body)
    const serialized = JSON.stringify(body)
    expect(body.providers[0].maskedPreview).toBe('gsk_********abcd')
    expect(serialized).not.toContain('gsk_live_secret_abcd')
    expect(serialized).not.toContain('v1:')
    expect(serialized).not.toContain('apiKey')
  })

  it('save key returns safe provider status only', async () => {
    dbMocks.saveProviderCredential.mockResolvedValue(makeStatus())
    const app = await makeApp()

    const res = await app.inject({
      method: 'PUT',
      url: '/api/admin/providers/groq',
      headers: { authorization: 'Bearer admin-token' },
      payload: {
        apiKey: 'gsk_live_secret_abcd',
        enabled: true,
      },
    })

    expect(res.statusCode).toBe(200)
    expect(dbMocks.saveProviderCredential).toHaveBeenCalledWith(expect.objectContaining({
      providerKey: 'groq',
      apiKey: 'gsk_live_secret_abcd',
      enabled: true,
    }))
    const serialized = res.body
    expect(serialized).not.toContain('gsk_live_secret_abcd')
    expect(serialized).not.toContain('v1:')
    expect(serialized).not.toContain('apiKey')
    expect(JSON.parse(res.body).provider.healthStatus).toBe('configured')
    expect(JSON.parse(res.body).provider.healthStatus).not.toBe('live')
  })

  it('invalid providerKey is rejected', async () => {
    dbMocks.saveProviderCredential.mockRejectedValue(
      new dbMocks.ProviderConfigError('Invalid provider key', 'openai', 'invalid-provider'),
    )
    const app = await makeApp()

    const res = await app.inject({
      method: 'PUT',
      url: '/api/admin/providers/openai',
      headers: { authorization: 'Bearer admin-token' },
      payload: { apiKey: 'sk-nope' },
    })

    expect(res.statusCode).toBe(400)
  })

  it('clear key returns safe provider status only', async () => {
    dbMocks.clearProviderCredential.mockResolvedValue(makeStatus({
      configured: false,
      source: 'missing',
      maskedPreview: '',
      healthStatus: 'unconfigured',
    }))
    const app = await makeApp()

    const res = await app.inject({
      method: 'DELETE',
      url: '/api/admin/providers/groq/key',
      headers: { authorization: 'Bearer admin-token' },
    })

    expect(res.statusCode).toBe(200)
    expect(dbMocks.clearProviderCredential).toHaveBeenCalledWith('groq')
    expect(res.body).not.toContain('apiKey')
    expect(res.body).not.toContain('v1:')
  })

  it('rejects unauthenticated provider test requests', async () => {
    const app = await makeApp()
    const res = await app.inject({ method: 'POST', url: '/api/admin/providers/groq/test' })

    expect(res.statusCode).toBe(401)
    expect(dbMocks.resolveProviderApiKey).not.toHaveBeenCalled()
  })

  it('rejects unknown provider keys for test requests', async () => {
    const app = await makeApp()
    const res = await app.inject({
      method: 'POST',
      url: '/api/admin/providers/openai/test',
      headers: { authorization: 'Bearer admin-token' },
    })

    expect(res.statusCode).toBe(400)
    expect(providerMocks.groqChat).not.toHaveBeenCalled()
    expect(providerMocks.togetherGenerateImage).not.toHaveBeenCalled()
  })

  it('successful Groq test marks provider live without returning raw keys', async () => {
    const app = await makeApp()
    const res = await app.inject({
      method: 'POST',
      url: '/api/admin/providers/groq/test',
      headers: { authorization: 'Bearer admin-token' },
    })

    expect(res.statusCode).toBe(200)
    expect(providerMocks.groqChat).toHaveBeenCalledWith(expect.objectContaining({
      apiKey: 'gsk_live_secret_abcd',
      maxTokens: 16,
    }))
    expect(dbMocks.updateProviderHealthStatus).toHaveBeenCalledWith(expect.objectContaining({
      providerKey: 'groq',
      healthStatus: 'live',
    }))
    expect(res.body).not.toContain('gsk_live_secret_abcd')
    expect(res.body).not.toContain('v1:')
    expect(res.body).not.toContain('apiKey')
  })

  it('Together test uses provider defaultModel and marks live on real response', async () => {
    dbMocks.resolveProviderApiKey.mockResolvedValueOnce({
      providerKey: 'together',
      apiKey: 'together-secret-key',
      source: 'database',
    })
    dbMocks.getProviderCredentialStatus.mockResolvedValueOnce(makeStatus({
      providerKey: 'together',
      displayName: 'Together AI',
      defaultModel: 'black-forest-labs/FLUX.1-schnell',
    }))
    const app = await makeApp()

    const res = await app.inject({
      method: 'POST',
      url: '/api/admin/providers/together/test',
      headers: { authorization: 'Bearer admin-token' },
    })

    expect(res.statusCode).toBe(200)
    expect(providerMocks.togetherGenerateImage).toHaveBeenCalledWith(expect.objectContaining({
      apiKey: 'together-secret-key',
      providerDefaultModel: 'black-forest-labs/FLUX.1-schnell',
    }))
    expect(dbMocks.updateProviderHealthStatus).toHaveBeenCalledWith(expect.objectContaining({
      providerKey: 'together',
      healthStatus: 'live',
    }))
    expect(res.body).not.toContain('together-secret-key')
  })

  it('test failure marks provider failed and stores safe message', async () => {
    process.env.JWT_SECRET = 'jwt-secret-value'
    providerMocks.groqChat.mockRejectedValueOnce(
      new Error('Groq chat error 401: gsk_live_secret_abcd jwt-secret-value v1:ciphertext'),
    )
    const app = await makeApp()

    const res = await app.inject({
      method: 'POST',
      url: '/api/admin/providers/groq/test',
      headers: { authorization: 'Bearer admin-token' },
    })

    expect(res.statusCode).toBe(200)
    const update = dbMocks.updateProviderHealthStatus.mock.calls[0][0]
    expect(update.healthStatus).toBe('failed')
    expect(update.healthMessage).toContain('[redacted]')
    expect(update.healthMessage).not.toContain('gsk_live_secret_abcd')
    expect(update.healthMessage).not.toContain('jwt-secret-value')
    expect(update.healthMessage).not.toContain('v1:ciphertext')
    expect(res.body).not.toContain('gsk_live_secret_abcd')
    delete process.env.JWT_SECRET
  })

  it('Together missing defaultModel returns failed with safe model message', async () => {
    delete process.env.TOGETHER_IMAGE_MODEL
    dbMocks.resolveProviderApiKey.mockResolvedValueOnce({
      providerKey: 'together',
      apiKey: 'together-secret-key',
      source: 'database',
    })
    dbMocks.getProviderCredentialStatus.mockResolvedValueOnce(makeStatus({
      providerKey: 'together',
      defaultModel: '',
    }))
    const app = await makeApp()

    const res = await app.inject({
      method: 'POST',
      url: '/api/admin/providers/together/test',
      headers: { authorization: 'Bearer admin-token' },
    })

    expect(res.statusCode).toBe(200)
    expect(providerMocks.togetherGenerateImage).not.toHaveBeenCalled()
    expect(dbMocks.updateProviderHealthStatus).toHaveBeenCalledWith(expect.objectContaining({
      providerKey: 'together',
      healthStatus: 'failed',
      healthMessage: expect.stringContaining('defaultModel'),
    }))
  })

  it('GenX test uses duration 4, seedance default, and honest submit-only message', async () => {
    dbMocks.resolveProviderApiKey.mockResolvedValueOnce({
      providerKey: 'genx',
      apiKey: 'genx-secret-key',
      source: 'database',
    })
    dbMocks.getProviderCredentialStatus.mockResolvedValueOnce(makeStatus({
      providerKey: 'genx',
      displayName: 'GenX',
      baseUrl: 'https://query.genx.sh',
      defaultModel: '',
    }))
    const app = await makeApp()

    const res = await app.inject({
      method: 'POST',
      url: '/api/admin/providers/genx/test',
      headers: { authorization: 'Bearer admin-token' },
    })

    expect(res.statusCode).toBe(200)
    expect(providerMocks.genxSubmitVideo).toHaveBeenCalledWith(expect.objectContaining({
      apiKey: 'genx-secret-key',
      baseUrl: 'https://query.genx.sh',
      model: 'seedance-v1-fast',
      duration: 4,
    }))
    expect(dbMocks.updateProviderHealthStatus).toHaveBeenCalledWith(expect.objectContaining({
      providerKey: 'genx',
      healthStatus: 'live',
      healthMessage: expect.stringContaining('completion proof pending'),
    }))
    expect(dbMocks.updateProviderHealthStatus.mock.calls[0][0].healthMessage).not.toContain('complete')
    expect(res.body).not.toContain('genx-secret-key')
  })

  it('gated provider test does not fake live', async () => {
    dbMocks.resolveProviderApiKey.mockResolvedValueOnce({
      providerKey: 'deepinfra',
      apiKey: 'deepinfra-secret-key',
      source: 'database',
    })
    const app = await makeApp()

    const res = await app.inject({
      method: 'POST',
      url: '/api/admin/providers/deepinfra/test',
      headers: { authorization: 'Bearer admin-token' },
    })

    expect(res.statusCode).toBe(200)
    expect(dbMocks.updateProviderHealthStatus).toHaveBeenCalledWith(expect.objectContaining({
      providerKey: 'deepinfra',
      healthStatus: 'gated',
      healthMessage: expect.stringContaining('not implemented'),
    }))
    expect(providerMocks.groqChat).not.toHaveBeenCalled()
    expect(providerMocks.togetherGenerateImage).not.toHaveBeenCalled()
    expect(res.body).not.toContain('deepinfra-secret-key')
  })
})
