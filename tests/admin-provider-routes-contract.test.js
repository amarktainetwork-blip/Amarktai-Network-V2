/**
 * Admin provider credential route contract tests.
 */

import Fastify from 'fastify'
import { beforeEach, describe, expect, it, vi } from 'vitest'

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
  }
})

vi.mock('@amarktai/db', () => dbMocks)

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
})
