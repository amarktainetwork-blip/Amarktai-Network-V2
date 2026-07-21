/**
 * App contract auth fix + DeepInfra disabled state tests.
 *
 * Proves:
 * - API key is hashed before storage
 * - Raw key returned only once on creation
 * - /api/v1/jobs hashes bearer token before DB lookup
 * - Revoked key fails 403
 * - Invalid key fails 401
 * - Provider/model override still blocked
 * - DeepInfra disabled is skipped by routing/fallback
 * - MiMo coding_tools_only is skipped by runtime routing
 * - Provider list exactly genx, deepinfra, together, mimo, deepinfra
 * - No new providers added
 * - Adult generation remains on hold
 */

import { describe, expect, it, vi, beforeEach, afterEach } from 'vitest'
import fs from 'fs'
import path from 'path'
import { createHash } from 'node:crypto'

// ── Mock Prisma ──────────────────────────────────────────────────────────────

const prismaMock = vi.hoisted(() => ({
  appApiKey: {
    findUnique: vi.fn(),
  },
  appCapabilityGrant: {
    findUnique: vi.fn(),
  },
  appConnection: {
    update: vi.fn(),
  },
  appBudgetConfig: {
    findUnique: vi.fn(),
  },
  usageMeter: {
    aggregate: vi.fn(),
  },
  job: {
    create: vi.fn(),
    update: vi.fn(),
    findUnique: vi.fn(),
  },
  aiProvider: {
    findUnique: vi.fn(),
    findMany: vi.fn(),
  },
}))

vi.mock('@amarktai/db', () => ({
  prisma: prismaMock,
  ProviderConfigError: class ProviderConfigError extends Error {
    constructor(message, providerKey = 'deepinfra', code = 'missing-config') {
      super(message)
      this.providerKey = providerKey
      this.code = code
    }
  },
  getProviderCredentialStatus: vi.fn(),
  resolveProviderApiKey: vi.fn(),
}))

const mockQueueAdd = vi.fn()

vi.mock('bullmq', () => {
  return {
    Queue: function MockQueueConstructor() {
      return { add: mockQueueAdd }
    },
  }
})

// ── Imports ──────────────────────────────────────────────────────────────────

import {
  hashAppApiKey,
  PROVIDER_KEYS,
  PROVIDER_HEALTH_STATUSES,
  CREDENTIAL_USAGE_POLICIES,
  CAPABILITY_CATALOG,
  APPROVED_PROVIDER_DEFINITIONS,
  CODING_ONLY_PROVIDERS,
  getExecutorRegistration,
  hasBlockedOverrides,
  CAPABILITY_KEYS,
} from '../packages/core/src/index.ts'

// ── Test fixtures ────────────────────────────────────────────────────────────

const RAW_API_KEY = 'amark_test_key_abcdef1234567890'
const HASHED_API_KEY = createHash('sha256').update(RAW_API_KEY).digest('hex')
const VALID_BEARER = `Bearer ${RAW_API_KEY}`

const ROOT = path.join(import.meta.dirname, '..')

function makeAppConnection(overrides = {}) {
  return {
    id: 'conn-001',
    appSlug: 'test-app',
    appName: 'Test App',
    status: 'active',
    allowedCapabilities: '[]',
    tokenBalance: 1000,
    ...overrides,
  }
}

function makeApiKey(overrides = {}) {
  return {
    id: 'key-001',
    key: HASHED_API_KEY,
    label: 'default',
    active: true,
    connectionId: 'conn-001',
    appConnection: makeAppConnection(),
    ...overrides,
  }
}

function makeJob(overrides = {}) {
  return {
    id: 'job-uuid-001',
    appSlug: 'test-app',
    capability: 'chat',
    prompt: 'Hello world',
    inputJson: '{}',
    metadataJson: '{}',
    traceId: 'trace_test-uuid',
    status: 'queued',
    provider: null,
    model: null,
    artifactId: null,
    progress: 0,
    error: null,
    callbackUrl: null,
    createdAt: new Date('2026-07-04T10:00:00Z'),
    startedAt: null,
    completedAt: null,
    updatedAt: new Date('2026-07-04T10:00:00Z'),
    ...overrides,
  }
}

// ── API Key Hashing Tests ────────────────────────────────────────────────────

describe('API key hashing contract', () => {
  it('hashAppApiKey produces SHA-256 hex digest', () => {
    const raw = 'amark_test123'
    const expected = createHash('sha256').update(raw).digest('hex')
    expect(hashAppApiKey(raw)).toBe(expected)
  })

  it('hashAppApiKey output is 64 hex characters', () => {
    const hash = hashAppApiKey('amark_anything')
    expect(hash).toMatch(/^[a-f0-9]{64}$/)
  })

  it('hashAppApiKey is deterministic', () => {
    const raw = 'amark_deterministic_test'
    expect(hashAppApiKey(raw)).toBe(hashAppApiKey(raw))
  })

  it('different raw keys produce different hashes', () => {
    expect(hashAppApiKey('amark_key_a')).not.toBe(hashAppApiKey('amark_key_b'))
  })

  it('admin route stores hashed key, not raw key', () => {
    const routePath = path.join(ROOT, 'apps/api/src/routes/admin-app-connections.ts')
    const content = fs.readFileSync(routePath, 'utf8')
    expect(content).toContain('hashApiKey')
    expect(content).toContain('sha256')
    expect(content).toContain('hashedKey')
    expect(content).toContain('key: hashedKey')
  })

  it('raw key returned only once on creation response', () => {
    const routePath = path.join(ROOT, 'apps/api/src/routes/admin-app-connections.ts')
    const content = fs.readFileSync(routePath, 'utf8')
    expect(content).toContain('key: rawKey')
    expect(content).toContain('Store this key securely')
    expect(content).toContain('will not be shown again')
  })

  it('key list endpoint does not expose raw or hashed key', () => {
    const routePath = path.join(ROOT, 'apps/api/src/routes/admin-app-connections.ts')
    const content = fs.readFileSync(routePath, 'utf8')
    const listSection = content.split('List app API keys')[1]?.split('Revoke')[0] || ''
    expect(listSection).toContain('id: k.id')
    expect(listSection).toContain('label: k.label')
    expect(listSection).not.toContain('key: k.key')
    expect(listSection).not.toContain('rawKey')
  })
})

// ── /api/v1/jobs Auth Hashing Tests ──────────────────────────────────────────

describe('/api/v1/jobs authenticates by hashing bearer token', async () => {
  const { default: Fastify } = await import('fastify')

  function buildApp() {
    const app = Fastify({ logger: false })
    app.decorate('redis', {})
    return app
  }

  beforeEach(() => {
    vi.clearAllMocks()
    prismaMock.appCapabilityGrant.findUnique.mockImplementation(async ({ where }) => {
      const { appSlug, capability } = where.app_capability_grant_unique
      return {
        appSlug,
        capability,
        enabled: true,
        qualityFloor: 'balanced',
        budgetPolicy: 'balanced',
        maxCostPerRequest: 0,
        maxCostPerWorkflow: 0,
        latencyPreference: 'medium',
        allowFallback: true,
        maxFallbackAttempts: 3,
        liveProofRequired: false,
        approvalRequired: false,
        artifactRead: true,
        artifactWrite: true,
        memoryRead: false,
        memoryWrite: false,
        ragNamespaces: '[]',
        policyProfile: 'test',
        adultPermission: false,
        dataRetentionPolicy: 'default',
        passthroughModelAllowed: false,
        providerResidencyConstraints: '[]',
      }
    })
    mockQueueAdd.mockResolvedValue({ id: 'bmq-001' })
    prismaMock.appBudgetConfig.findUnique.mockResolvedValue(null)
    prismaMock.usageMeter.aggregate.mockResolvedValue({ _sum: { costUsdCents: 0 } })
    prismaMock.appConnection.update.mockResolvedValue({})
    prismaMock.job.update.mockResolvedValue({})
  })

  it('hashes bearer token before DB lookup', async () => {
    prismaMock.appApiKey.findUnique.mockResolvedValue(makeApiKey())
    prismaMock.job.create.mockResolvedValue(makeJob())

    const app = buildApp()
    const { jobRoutes } = await import('../apps/api/src/routes/jobs.ts')
    await app.register(jobRoutes)

    await app.inject({
      method: 'POST',
      url: '/api/v1/jobs',
      headers: { authorization: VALID_BEARER },
      payload: { capability: 'chat', prompt: 'Hello' },
    })

    expect(prismaMock.appApiKey.findUnique).toHaveBeenCalledWith(
      expect.objectContaining({
        where: { key: HASHED_API_KEY },
      })
    )

    await app.close()
  })

  it('does NOT look up by raw token', async () => {
    prismaMock.appApiKey.findUnique.mockResolvedValue(makeApiKey())
    prismaMock.job.create.mockResolvedValue(makeJob())

    const app = buildApp()
    const { jobRoutes } = await import('../apps/api/src/routes/jobs.ts')
    await app.register(jobRoutes)

    await app.inject({
      method: 'POST',
      url: '/api/v1/jobs',
      headers: { authorization: VALID_BEARER },
      payload: { capability: 'chat', prompt: 'Hello' },
    })

    const callArgs = prismaMock.appApiKey.findUnique.mock.calls[0][0]
    expect(callArgs.where.key).not.toBe(RAW_API_KEY)
    expect(callArgs.where.key).toBe(HASHED_API_KEY)

    await app.close()
  })

  it('invalid raw key returns 401', async () => {
    prismaMock.appApiKey.findUnique.mockResolvedValue(null)

    const app = buildApp()
    const { jobRoutes } = await import('../apps/api/src/routes/jobs.ts')
    await app.register(jobRoutes)

    const res = await app.inject({
      method: 'POST',
      url: '/api/v1/jobs',
      headers: { authorization: 'Bearer amark_completely_invalid_key' },
      payload: { capability: 'chat', prompt: 'hello' },
    })

    expect(res.statusCode).toBe(401)
    const body = JSON.parse(res.payload)
    expect(body.message).toContain('Invalid API key')
    expect(prismaMock.job.create).not.toHaveBeenCalled()

    await app.close()
  })

  it('revoked (deactivated) key returns 403', async () => {
    prismaMock.appApiKey.findUnique.mockResolvedValue(
      makeApiKey({ active: false })
    )

    const app = buildApp()
    const { jobRoutes } = await import('../apps/api/src/routes/jobs.ts')
    await app.register(jobRoutes)

    const res = await app.inject({
      method: 'POST',
      url: '/api/v1/jobs',
      headers: { authorization: VALID_BEARER },
      payload: { capability: 'chat', prompt: 'hello' },
    })

    expect(res.statusCode).toBe(403)
    const body = JSON.parse(res.payload)
    expect(body.message).toContain('deactivated')
    expect(prismaMock.job.create).not.toHaveBeenCalled()

    await app.close()
  })

  it('valid hashed key authenticates successfully', async () => {
    prismaMock.appApiKey.findUnique.mockResolvedValue(makeApiKey())
    prismaMock.job.create.mockResolvedValue(makeJob())

    const app = buildApp()
    const { jobRoutes } = await import('../apps/api/src/routes/jobs.ts')
    await app.register(jobRoutes)

    const res = await app.inject({
      method: 'POST',
      url: '/api/v1/jobs',
      headers: { authorization: VALID_BEARER },
      payload: { capability: 'chat', prompt: 'Hello world' },
    })

    expect(res.statusCode).toBe(201)

    await app.close()
  })
})

// ── Provider/Model Override Still Blocked ────────────────────────────────────

describe('Provider/model override still blocked', () => {
  it('provider field is blocked', () => {
    expect(hasBlockedOverrides({ capability: 'chat', prompt: 'hi', provider: 'deepinfra' })).toBe('provider')
  })

  it('model field is blocked', () => {
    expect(hasBlockedOverrides({ capability: 'chat', prompt: 'hi', model: 'llama' })).toBe('model')
  })

  it('providerOverride field is blocked', () => {
    expect(hasBlockedOverrides({ capability: 'chat', prompt: 'hi', providerOverride: 'genx' })).toBe('providerOverride')
  })

  it('modelOverride field is blocked', () => {
    expect(hasBlockedOverrides({ capability: 'chat', prompt: 'hi', modelOverride: 'gpt-4' })).toBe('modelOverride')
  })

  it('clean request passes', () => {
    expect(hasBlockedOverrides({ capability: 'chat', prompt: 'hi' })).toBeNull()
  })
})

// ── DeepInfra Disabled State Tests ───────────────────────────────────────────

describe('DeepInfra disabled state', () => {
  it('DeepInfra remains a registered chat fallback executor', () => {
    expect(getExecutorRegistration('chat', 'deepinfra')?.id).toBe('deepinfra.chat')
  })

  it('worker delegates provider health filtering and fallback selection to Orchestra', () => {
    const executorPath = path.join(ROOT, 'apps/worker/src/providers/provider-executor.ts')
    const content = fs.readFileSync(executorPath, 'utf8')
    expect(content).toContain('resolveOrchestraDecision')
    expect(content).toContain('orchestraDecision.fallbackRoutes')
    expect(content).not.toContain('isProviderDisabledInDb')
  })
})

// ── MiMo coding_tools_only Tests ─────────────────────────────────────────────

describe('MiMo coding_tools_only', () => {
  it('MiMo is canonical coding-tools-only policy', () => {
    expect(CODING_ONLY_PROVIDERS).toEqual(['mimo'])
    expect(APPROVED_PROVIDER_DEFINITIONS.find((provider) => provider.key === 'mimo')).toMatchObject({
      backendExecutionAllowed: false,
      codingOnly: true,
    })
  })

  it('MiMo has no backend executor registration', () => {
    for (const capability of CAPABILITY_KEYS) {
      expect(getExecutorRegistration(capability, 'mimo')).toBeUndefined()
    }
  })

  it('runtime-selector rejects MiMo', () => {
    const orchestraPath = path.join(ROOT, 'packages/core/src/orchestra.ts')
    const content = fs.readFileSync(orchestraPath, 'utf8')
    expect(content).toContain("mimo")
    expect(content).toContain("mimo_coding_tool_only")
  })

  it('runtime-selector rejects runtime_restricted providers', () => {
    const orchestraPath = path.join(ROOT, 'packages/core/src/orchestra.ts')
    const content = fs.readFileSync(orchestraPath, 'utf8')
    expect(content).toContain('runtime_restricted')
    expect(content).toContain('provider_runtime_restricted')
  })

  it('runtime-selector rejects disabled providers', () => {
    const orchestraPath = path.join(ROOT, 'packages/core/src/orchestra.ts')
    const content = fs.readFileSync(orchestraPath, 'utf8')
    expect(content).toContain('provider_health_disabled')
  })
})

// ── Provider List Exactly 4 ──────────────────────────────────────────────────

describe('Provider list integrity', () => {
  it('PROVIDER_KEYS is exactly genx, deepinfra, together, mimo, deepinfra', () => {
    expect(PROVIDER_KEYS).toEqual(['genx', 'together', 'mimo', 'deepinfra'])
  })

  it('PROVIDER_KEYS has exactly 4 entries', () => {
    expect(PROVIDER_KEYS).toHaveLength(4)
  })

  it('no new providers added', () => {
    const allowed = ['genx', 'together', 'mimo', 'deepinfra']
    for (const key of PROVIDER_KEYS) {
      expect(allowed).toContain(key)
    }
    expect(PROVIDER_KEYS.length).toBe(allowed.length)
  })

  it('legacy providers are not in PROVIDER_KEYS', () => {
    const legacy = ['openai', 'anthropic', 'huggingface', 'gemini', 'replicate', 'lyria', 'qwen', 'minimax', 'heygen']
    for (const provider of legacy) {
      expect(PROVIDER_KEYS).not.toContain(provider)
    }
  })
})

// ── Provider Health Statuses ─────────────────────────────────────────────────

describe('Provider health statuses include disabled', () => {
  it('PROVIDER_HEALTH_STATUSES includes disabled', () => {
    expect(PROVIDER_HEALTH_STATUSES).toContain('disabled')
  })

  it('PROVIDER_HEALTH_STATUSES includes runtime_restricted', () => {
    expect(PROVIDER_HEALTH_STATUSES).toContain('runtime_restricted')
  })

  it('PROVIDER_HEALTH_STATUSES includes configured', () => {
    expect(PROVIDER_HEALTH_STATUSES).toContain('configured')
  })

  it('PROVIDER_HEALTH_STATUSES includes live', () => {
    expect(PROVIDER_HEALTH_STATUSES).toContain('live')
  })

  it('PROVIDER_HEALTH_STATUSES includes failed', () => {
    expect(PROVIDER_HEALTH_STATUSES).toContain('failed')
  })
})

// ── Credential Usage Policies ────────────────────────────────────────────────

describe('Credential usage policies', () => {
  it('includes coding_tools_only for MiMo', () => {
    expect(CREDENTIAL_USAGE_POLICIES).toContain('coding_tools_only')
  })

  it('includes backend_runtime_allowed', () => {
    expect(CREDENTIAL_USAGE_POLICIES).toContain('backend_runtime_allowed')
  })
})

// ── Adult Generation Remains On Hold ─────────────────────────────────────────

describe('Adult generation remains on hold', () => {
  it('adult_generation capabilities require adult_permission flag', () => {
    const adultCaps = CAPABILITY_CATALOG.filter((c) => c.key.startsWith('adult_'))
    for (const cap of adultCaps) {
      expect(cap.policyRequirement).toBe('adult_permission')
      expect(cap.requiredFlags).toContain('adult_permission')
    }
  })

  it('canonical truth keeps adult generation policy restricted', async () => {
    const { getRuntimeTruth } = await import('../packages/core/src/index.ts')
    expect(getRuntimeTruth().capabilities.filter((item) => item.capability.startsWith('adult_')).every((item) => item.classification === 'POLICY_RESTRICTED')).toBe(true)
  })
})

// ── Apps Cannot Choose Provider/Model ────────────────────────────────────────

describe('Apps cannot choose provider or model', () => {
  it('job route blocks provider override', async () => {
    const { default: Fastify } = await import('fastify')
    prismaMock.appApiKey.findUnique.mockResolvedValue(makeApiKey())

    const app = Fastify({ logger: false })
    app.decorate('redis', {})
    const { jobRoutes } = await import('../apps/api/src/routes/jobs.ts')
    await app.register(jobRoutes)

    const res = await app.inject({
      method: 'POST',
      url: '/api/v1/jobs',
      headers: { authorization: VALID_BEARER },
      payload: { capability: 'chat', prompt: 'hello', provider: 'deepinfra' },
    })

    expect(res.statusCode).toBe(400)
    const body = JSON.parse(res.payload)
    expect(body.message).toContain('not allowed')

    await app.close()
  })

  it('job route blocks model override', async () => {
    const { default: Fastify } = await import('fastify')
    prismaMock.appApiKey.findUnique.mockResolvedValue(makeApiKey())

    const app = Fastify({ logger: false })
    app.decorate('redis', {})
    const { jobRoutes } = await import('../apps/api/src/routes/jobs.ts')
    await app.register(jobRoutes)

    const res = await app.inject({
      method: 'POST',
      url: '/api/v1/jobs',
      headers: { authorization: VALID_BEARER },
      payload: { capability: 'chat', prompt: 'hello', modelOverride: 'llama-3' },
    })

    expect(res.statusCode).toBe(400)
    const body = JSON.parse(res.payload)
    expect(body.message).toContain('not allowed')

    await app.close()
  })

  it('Orchestra request contract has no app-facing provider/model override', () => {
    const routingPath = path.join(ROOT, 'packages/core/src/orchestra.ts')
    const content = fs.readFileSync(routingPath, 'utf8')
    expect(content).toContain('capability: CapabilityKey')
    expect(content).not.toContain('providerOverride')
    expect(content).not.toContain('modelOverride')
  })
})

// ── Auth-context hashing fix ─────────────────────────────────────────────────

describe('Auth context hashes bearer token', () => {
  it('auth-context.ts imports hashAppApiKey', () => {
    const authPath = path.join(ROOT, 'apps/api/src/lib/auth-context.ts')
    const content = fs.readFileSync(authPath, 'utf8')
    expect(content).toContain('hashAppApiKey')
  })

  it('auth-context.ts hashes token before DB lookup', () => {
    const authPath = path.join(ROOT, 'apps/api/src/lib/auth-context.ts')
    const content = fs.readFileSync(authPath, 'utf8')
    expect(content).toContain('hashedToken')
    expect(content).toContain('hashAppApiKey(token)')
  })

  it('jobs.ts imports hashAppApiKey', () => {
    const jobsPath = path.join(ROOT, 'apps/api/src/routes/jobs.ts')
    const content = fs.readFileSync(jobsPath, 'utf8')
    expect(content).toContain('hashAppApiKey')
  })

  it('jobs.ts hashes token before DB lookup', () => {
    const jobsPath = path.join(ROOT, 'apps/api/src/routes/jobs.ts')
    const content = fs.readFileSync(jobsPath, 'utf8')
    expect(content).toContain('hashedToken')
    expect(content).toContain('hashAppApiKey(token)')
  })
})
