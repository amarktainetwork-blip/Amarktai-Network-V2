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
    MIMO_BACKEND_RUNTIME_DISABLED_MESSAGE: 'MiMo is disabled for backend runtime. Current credential is for interactive coding tools only. Supply a backend/application-allowed MiMo credential before enabling runtime.',
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
  groqChat: vi.fn(),
  deepinfraChat: vi.fn(),
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
    credentialUsagePolicy: 'backend_runtime_allowed',
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
    providerMocks.deepinfraChat.mockResolvedValue({
      content: 'AMARKTAI_PROVIDER_TEST_OK',
      model: 'meta-llama/Meta-Llama-3.1-8B-Instruct',
      usage: { promptTokens: 1, completionTokens: 1, totalTokens: 2 },
      finishReason: 'stop',
    })
  })

  afterEach(() => {
    vi.useRealTimers()
    vi.unstubAllGlobals()
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

  it('GenX test uses Router models endpoint and does not submit generation', async () => {
    const fetchMock = vi.fn().mockResolvedValue({
      ok: true,
      status: 200,
      text: async () => JSON.stringify({ models: [{ id: 'seedance-v1-fast' }] }),
    })
    vi.stubGlobal('fetch', fetchMock)
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
    expect(fetchMock).toHaveBeenCalledTimes(1)
    const [url, init] = fetchMock.mock.calls[0]
    expect(url.toString()).toBe('https://query.genx.sh/api/v1/models?category=video')
    expect(init).toEqual(expect.objectContaining({
      method: 'GET',
      headers: expect.objectContaining({
        Authorization: 'Bearer genx-secret-key',
      }),
    }))
    expect(dbMocks.updateProviderHealthStatus).toHaveBeenCalledWith(expect.objectContaining({
      providerKey: 'genx',
      healthStatus: 'live',
      healthMessage: expect.stringContaining('Video completion proof still required'),
    }))
    expect(dbMocks.updateProviderHealthStatus.mock.calls[0][0].healthMessage).not.toContain('/api/v1/generate')
    expect(res.body).not.toContain('genx-secret-key')
  })

  it('GenX test times out cleanly with failed status', async () => {
    vi.useFakeTimers()
    const fetchMock = vi.fn((_url, init) => new Promise((_resolve, reject) => {
      init.signal.addEventListener('abort', () => {
        const err = new Error('aborted')
        err.name = 'AbortError'
        reject(err)
      })
    }))
    vi.stubGlobal('fetch', fetchMock)
    dbMocks.resolveProviderApiKey.mockResolvedValueOnce({
      providerKey: 'genx',
      apiKey: 'genx-secret-key',
      source: 'database',
    })
    dbMocks.getProviderCredentialStatus.mockResolvedValueOnce(makeStatus({
      providerKey: 'genx',
      displayName: 'GenX',
      baseUrl: 'https://query.genx.sh',
    }))
    const app = await makeApp()

    const responsePromise = app.inject({
      method: 'POST',
      url: '/api/admin/providers/genx/test',
      headers: { authorization: 'Bearer admin-token' },
    })
    await vi.advanceTimersByTimeAsync(15_000)
    const res = await responsePromise

    expect(res.statusCode).toBe(200)
    expect(dbMocks.updateProviderHealthStatus).toHaveBeenCalledWith(expect.objectContaining({
      providerKey: 'genx',
      healthStatus: 'failed',
      healthMessage: 'GenX provider test timed out after 15s',
    }))
    expect(res.body).not.toContain('genx-secret-key')
  })

  it('DeepInfra test performs a live chat request and marks provider live', async () => {
    dbMocks.resolveProviderApiKey.mockResolvedValueOnce({
      providerKey: 'deepinfra',
      apiKey: 'deepinfra-secret-key',
      source: 'database',
    })
    dbMocks.getProviderCredentialStatus.mockResolvedValueOnce(makeStatus({
      providerKey: 'deepinfra',
      displayName: 'DeepInfra',
      defaultModel: 'meta-llama/Meta-Llama-3.1-8B-Instruct',
    }))
    const app = await makeApp()

    const res = await app.inject({
      method: 'POST',
      url: '/api/admin/providers/deepinfra/test',
      headers: { authorization: 'Bearer admin-token' },
    })

    expect(res.statusCode).toBe(200)
    expect(providerMocks.deepinfraChat).toHaveBeenCalledWith(expect.objectContaining({
      apiKey: 'deepinfra-secret-key',
      providerDefaultModel: 'meta-llama/Meta-Llama-3.1-8B-Instruct',
      maxTokens: 16,
    }))
    expect(dbMocks.updateProviderHealthStatus).toHaveBeenCalledWith(expect.objectContaining({
      providerKey: 'deepinfra',
      healthStatus: 'live',
      healthMessage: expect.stringContaining('capability proof still requires completed jobs'),
    }))
    expect(res.body).not.toContain('deepinfra-secret-key')
  })

  it('DeepInfra invalid key marks failed with redacted error', async () => {
    providerMocks.deepinfraChat.mockRejectedValueOnce(new Error('DeepInfra chat error 401: deepinfra-secret-key v1:ciphertext'))
    dbMocks.resolveProviderApiKey.mockResolvedValueOnce({
      providerKey: 'deepinfra',
      apiKey: 'deepinfra-secret-key',
      source: 'database',
    })
    dbMocks.getProviderCredentialStatus.mockResolvedValueOnce(makeStatus({
      providerKey: 'deepinfra',
      displayName: 'DeepInfra',
    }))
    const app = await makeApp()

    const res = await app.inject({
      method: 'POST',
      url: '/api/admin/providers/deepinfra/test',
      headers: { authorization: 'Bearer admin-token' },
    })

    expect(res.statusCode).toBe(200)
    const update = dbMocks.updateProviderHealthStatus.mock.calls[0][0]
    expect(update.providerKey).toBe('deepinfra')
    expect(update.healthStatus).toBe('failed')
    expect(update.healthMessage).not.toContain('deepinfra-secret-key')
    expect(update.healthMessage).not.toContain('v1:ciphertext')
    expect(res.body).not.toContain('deepinfra-secret-key')
  })

  it('MiMo coding-tools-only policy is runtime restricted and does not call MiMo', async () => {
    dbMocks.getProviderCredentialStatus.mockResolvedValueOnce(makeStatus({
      providerKey: 'mimo',
      displayName: 'MiMo',
      credentialUsagePolicy: 'coding_tools_only',
    }))
    const app = await makeApp()

    const res = await app.inject({
      method: 'POST',
      url: '/api/admin/providers/mimo/test',
      headers: { authorization: 'Bearer admin-token' },
    })

    expect(res.statusCode).toBe(200)
    expect(dbMocks.resolveProviderApiKey).not.toHaveBeenCalled()
    expect(dbMocks.updateProviderHealthStatus).toHaveBeenCalledWith(expect.objectContaining({
      providerKey: 'mimo',
      healthStatus: 'runtime_restricted',
      healthMessage: expect.stringContaining('interactive coding tools'),
    }))
  })

  it('MiMo unknown policy is still runtime restricted and is not marked live', async () => {
    dbMocks.getProviderCredentialStatus.mockResolvedValueOnce(makeStatus({
      providerKey: 'mimo',
      displayName: 'MiMo',
      credentialUsagePolicy: 'unknown_requires_review',
    }))
    const app = await makeApp()

    const res = await app.inject({
      method: 'POST',
      url: '/api/admin/providers/mimo/test',
      headers: { authorization: 'Bearer admin-token' },
    })

    expect(res.statusCode).toBe(200)
    expect(dbMocks.updateProviderHealthStatus).toHaveBeenCalledWith(expect.objectContaining({
      providerKey: 'mimo',
      healthStatus: 'runtime_restricted',
      healthMessage: expect.stringContaining('MiMo is disabled for backend runtime'),
    }))
  })

  it('MiMo backend_runtime_allowed policy is still disabled for backend runtime', async () => {
    dbMocks.getProviderCredentialStatus.mockResolvedValueOnce(makeStatus({
      providerKey: 'mimo',
      displayName: 'MiMo',
      credentialUsagePolicy: 'backend_runtime_allowed',
      defaultModel: 'mimo-v2.5',
    }))
    const app = await makeApp()

    const res = await app.inject({
      method: 'POST',
      url: '/api/admin/providers/mimo/test',
      headers: { authorization: 'Bearer admin-token' },
    })

    expect(res.statusCode).toBe(200)
    expect(dbMocks.resolveProviderApiKey).not.toHaveBeenCalled()
    expect(dbMocks.updateProviderHealthStatus).toHaveBeenCalledWith(expect.objectContaining({
      providerKey: 'mimo',
      healthStatus: 'runtime_restricted',
      healthMessage: expect.stringContaining('MiMo is disabled for backend runtime'),
    }))
    expect(res.body).not.toContain('mimo-secret-key')
  })

  it('DeepInfra 402 insufficient balance is normalized safely', async () => {
    providerMocks.deepinfraChat.mockRejectedValueOnce(new Error('DeepInfra chat error 402: insufficient balance for deepinfra-secret-key'))
    dbMocks.resolveProviderApiKey.mockResolvedValueOnce({
      providerKey: 'deepinfra',
      apiKey: 'deepinfra-secret-key',
      source: 'database',
    })
    dbMocks.getProviderCredentialStatus.mockResolvedValueOnce(makeStatus({
      providerKey: 'deepinfra',
      displayName: 'DeepInfra',
    }))
    const app = await makeApp()

    const res = await app.inject({
      method: 'POST',
      url: '/api/admin/providers/deepinfra/test',
      headers: { authorization: 'Bearer admin-token' },
    })

    expect(res.statusCode).toBe(200)
    expect(dbMocks.updateProviderHealthStatus).toHaveBeenCalledWith(expect.objectContaining({
      providerKey: 'deepinfra',
      healthStatus: 'failed',
      healthMessage: 'DeepInfra account has insufficient balance for inference. Add balance/top-up before this provider can be marked live.',
    }))
    expect(res.body).not.toContain('deepinfra-secret-key')
  })
})
