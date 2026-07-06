/**
 * Secure provider key storage and runtime resolver contract tests.
 */

import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import {
  decryptProviderKey,
  encryptProviderKey,
  isEncryptedProviderKey,
  maskProviderKey,
  PROVIDER_KEYS,
} from '../packages/core/src/index.ts'

const prismaMock = vi.hoisted(() => ({
  aiProvider: {
    findUnique: vi.fn(),
    upsert: vi.fn(),
  },
}))

vi.mock('../packages/db/src/client.js', () => ({ prisma: prismaMock }))

const {
  ProviderConfigError,
  clearProviderCredential,
  getProviderCredentialStatus,
  resolveProviderApiKey,
  saveProviderCredential,
} = await import('../packages/db/src/provider-credentials.ts')

const ORIGINAL_ENV = process.env
const SECRET = 'phase-6c-test-secret-with-enough-entropy'

function makeRow(overrides = {}) {
  return {
    providerKey: 'groq',
    displayName: 'Groq',
    enabled: true,
    apiKey: '',
    maskedPreview: '',
    baseUrl: '',
    defaultModel: '',
    fallbackModel: '',
    healthStatus: 'unconfigured',
    healthMessage: '',
    lastCheckedAt: null,
    notes: '',
    sortOrder: 2,
    ...overrides,
  }
}

describe('Provider key encryption and masking', () => {
  beforeEach(() => {
    process.env = { ...ORIGINAL_ENV, PROVIDER_KEY_ENCRYPTION_SECRET: SECRET }
  })

  afterEach(() => {
    process.env = ORIGINAL_ENV
  })

  it('encrypt/decrypt round trip works', () => {
    const encrypted = encryptProviderKey('gsk_live_secret_1234')
    expect(decryptProviderKey(encrypted)).toBe('gsk_live_secret_1234')
  })

  it('same plaintext encrypts to different ciphertext because IV is random', () => {
    const first = encryptProviderKey('gsk_live_secret_1234')
    const second = encryptProviderKey('gsk_live_secret_1234')
    expect(first).not.toBe(second)
  })

  it('wrong secret fails decrypt', () => {
    const encrypted = encryptProviderKey('gsk_live_secret_1234', SECRET)
    expect(() => decryptProviderKey(encrypted, 'wrong-secret')).toThrow()
  })

  it('mask never equals raw key and handles known prefixes', () => {
    const masked = maskProviderKey('gsk_live_secret_abcd')
    expect(masked).toBe('gsk_********abcd')
    expect(masked).not.toBe('gsk_live_secret_abcd')
  })

  it('mask handles short keys safely', () => {
    const masked = maskProviderKey('abc')
    expect(masked).toBe('********')
    expect(masked).not.toBe('abc')
  })

  it('encrypted ciphertext does not contain raw key', () => {
    const encrypted = encryptProviderKey('sk-secret-wxyz')
    expect(isEncryptedProviderKey(encrypted)).toBe(true)
    expect(encrypted).not.toContain('sk-secret-wxyz')
  })
})

describe('Provider key resolver', () => {
  beforeEach(() => {
    vi.resetAllMocks()
    process.env = { ...ORIGINAL_ENV, PROVIDER_KEY_ENCRYPTION_SECRET: SECRET }
  })

  afterEach(() => {
    process.env = ORIGINAL_ENV
  })

  it('validates provider IDs are final five only', async () => {
    expect(PROVIDER_KEYS).toEqual(['genx', 'groq', 'together', 'mimo', 'deepinfra'])
    await expect(resolveProviderApiKey('openai')).rejects.toMatchObject({ code: 'invalid-provider' })
  })

  it('DB encrypted key resolves before env fallback', async () => {
    process.env.GROQ_API_KEY = 'env-groq-key'
    prismaMock.aiProvider.findUnique.mockResolvedValue(makeRow({
      apiKey: encryptProviderKey('db-groq-key'),
      maskedPreview: 'gsk_********1234',
    }))

    const resolved = await resolveProviderApiKey('groq')

    expect(resolved).toEqual({ providerKey: 'groq', apiKey: 'db-groq-key', source: 'database' })
  })

  it('env fallback works when DB key is missing', async () => {
    process.env.TOGETHER_API_KEY = 'env-together-key'
    prismaMock.aiProvider.findUnique.mockResolvedValue(null)

    const resolved = await resolveProviderApiKey('together')

    expect(resolved).toEqual({ providerKey: 'together', apiKey: 'env-together-key', source: 'env' })
  })

  it('status marks env fallback as configured without exposing the env key', async () => {
    process.env.TOGETHER_API_KEY = 'env-together-key'
    prismaMock.aiProvider.findUnique.mockResolvedValue(null)

    const status = await getProviderCredentialStatus('together')

    expect(status.configured).toBe(true)
    expect(status.source).toBe('env')
    expect(status.maskedPreview).toBe('')
    expect(JSON.stringify(status)).not.toContain('env-together-key')
  })

  it('missing DB and env returns safe missing-config error', async () => {
    delete process.env.GROQ_API_KEY
    prismaMock.aiProvider.findUnique.mockResolvedValue(null)

    await expect(resolveProviderApiKey('groq')).rejects.toMatchObject({
      code: 'missing-config',
      message: "Provider 'groq' is missing configuration",
    })
  })

  it('disabled provider blocks DB key use', async () => {
    prismaMock.aiProvider.findUnique.mockResolvedValue(makeRow({
      enabled: false,
      apiKey: encryptProviderKey('db-groq-key'),
    }))

    await expect(resolveProviderApiKey('groq')).rejects.toMatchObject({ code: 'disabled' })
  })

  it('status never returns raw key or ciphertext', async () => {
    const encrypted = encryptProviderKey('db-groq-key')
    prismaMock.aiProvider.findUnique.mockResolvedValue(makeRow({
      apiKey: encrypted,
      maskedPreview: 'gsk_********1234',
    }))

    const status = await getProviderCredentialStatus('groq')
    const serialized = JSON.stringify(status)

    expect(status.maskedPreview).toBe('gsk_********1234')
    expect(serialized).not.toContain('db-groq-key')
    expect(serialized).not.toContain(encrypted)
    expect(status.source).toBe('database')
  })

  it('save key encrypts before DB storage and returns safe status', async () => {
    prismaMock.aiProvider.findUnique
      .mockResolvedValueOnce(null)
      .mockResolvedValueOnce(makeRow({
        apiKey: 'v1:stored',
        maskedPreview: 'gsk_********abcd',
        healthStatus: 'configured',
      }))
    prismaMock.aiProvider.upsert.mockResolvedValue({})

    const status = await saveProviderCredential({
      providerKey: 'groq',
      apiKey: 'gsk_test_secret_abcd',
      enabled: true,
    })

    const createData = prismaMock.aiProvider.upsert.mock.calls[0][0].create
    expect(createData.apiKey).not.toBe('gsk_test_secret_abcd')
    expect(createData.apiKey).toMatch(/^v1:/)
    expect(createData.maskedPreview).toBe('gsk_********abcd')
    expect(createData.healthStatus).toBe('configured')
    expect(createData.healthStatus).not.toBe('healthy')
    expect(JSON.stringify(status)).not.toContain('gsk_test_secret_abcd')
  })

  it('metadata update without apiKey does not erase existing key', async () => {
    prismaMock.aiProvider.findUnique
      .mockResolvedValueOnce(makeRow({ apiKey: 'v1:existing', maskedPreview: 'gsk_********1111' }))
      .mockResolvedValueOnce(makeRow({ apiKey: 'v1:existing', maskedPreview: 'gsk_********1111' }))
    prismaMock.aiProvider.upsert.mockResolvedValue({})

    await saveProviderCredential({ providerKey: 'groq', notes: 'updated' })

    const updateData = prismaMock.aiProvider.upsert.mock.calls[0][0].update
    expect(updateData.notes).toBe('updated')
    expect(updateData.apiKey).toBeUndefined()
    expect(updateData.maskedPreview).toBeUndefined()
  })

  it('clear key removes apiKey and maskedPreview', async () => {
    prismaMock.aiProvider.findUnique
      .mockResolvedValueOnce(makeRow({ apiKey: 'v1:existing', maskedPreview: 'gsk_********1111' }))
      .mockResolvedValueOnce(makeRow({ enabled: false, apiKey: '', maskedPreview: '' }))
    prismaMock.aiProvider.upsert.mockResolvedValue({})

    const status = await clearProviderCredential('groq')
    const updateData = prismaMock.aiProvider.upsert.mock.calls[0][0].update

    expect(updateData.apiKey).toBe('')
    expect(updateData.maskedPreview).toBe('')
    expect(updateData.healthStatus).toBe('unconfigured')
    expect(status.maskedPreview).toBe('')
  })

  it('resolver error does not expose raw keys', async () => {
    prismaMock.aiProvider.findUnique.mockResolvedValue(makeRow({
      apiKey: encryptProviderKey('db-groq-key', SECRET),
    }))
    process.env.PROVIDER_KEY_ENCRYPTION_SECRET = 'wrong-secret'

    try {
      await resolveProviderApiKey('groq')
      throw new Error('expected failure')
    } catch (err) {
      expect(err).toBeInstanceOf(ProviderConfigError)
      expect(JSON.stringify(err)).not.toContain('db-groq-key')
      expect(err.message).not.toContain('db-groq-key')
    }
  })
})
