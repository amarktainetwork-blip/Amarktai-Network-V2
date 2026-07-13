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
 * - Provider list exactly genx, groq, together, mimo, deepinfra
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
    constructor(message, providerKey = 'groq', code = 'missing-config') {
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
  routeBrain,
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
    expect(hasBlockedOverrides({ capability: 'chat', prompt: 'hi', provider: 'groq' })).toBe('provider')
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
  const originalEnv = process.env

  beforeEach(() => {
    process.env = { ...originalEnv }
    process.env.GROQ_API_KEY = 'test-key'
    process.env.DEEPINFRA_API_KEY = 'test-key'
  })

  afterEach(() => {
    process.env = originalEnv
  })

  it('disabled DeepInfra is not selected by router', () => {
    const decision = routeBrain({
      capability: 'chat',
      routingMode: 'balanced',
      providerStates: {
        deepinfra: { disabled: true },
      },
    })

    const deepinfraCandidate = decision.rejectedCandidates.find((c) => c.provider === 'deepinfra')
    expect(deepinfraCandidate.reason).toContain('disabled')
    expect(decision.selectedProvider).not.toBe('deepinfra')
    expect(decision.selectedProvider).toBe('groq')
  })

  it('disabled DeepInfra candidate has correct reason', () => {
    const decision = routeBrain({
      capability: 'chat',
      routingMode: 'balanced',
      providerStates: {
        deepinfra: { disabled: true },
      },
    })

    const deepinfraCandidate = decision.rejectedCandidates.find((c) => c.provider === 'deepinfra')
    expect(deepinfraCandidate.reason).toContain('disabled')
  })

  it('disabled DeepInfra is excluded from eligible candidates', () => {
    delete process.env.GROQ_API_KEY
    delete process.env.TOGETHER_API_KEY

    const decision = routeBrain({
      capability: 'chat',
      routingMode: 'balanced',
      providerStates: {
        groq: { disabled: true },
        deepinfra: { disabled: true },
      },
    })

    expect(decision.selectedProvider).toBeNull()
    expect(decision.executionAllowed).toBe(false)
  })

  it('enabled DeepInfra participates normally', () => {
    delete process.env.GROQ_API_KEY
    delete process.env.TOGETHER_API_KEY

    const decision = routeBrain({
      capability: 'chat',
      routingMode: 'balanced',
      providerStates: {
        groq: { disabled: true },
        deepinfra: { disabled: false },
      },
    })

    expect(decision.selectedProvider).toBe('deepinfra')
  })

  it('disabled state does not affect other providers', () => {
    const decision = routeBrain({
      capability: 'chat',
      routingMode: 'balanced',
      providerStates: {
        deepinfra: { disabled: true },
      },
    })

    expect(decision.executableCandidates.some((c) => c.provider === 'groq')).toBe(true)
  })

  it('worker executor checks disabled state before DeepInfra fallback', () => {
    const executorPath = path.join(ROOT, 'apps/worker/src/providers/provider-executor.ts')
    const content = fs.readFileSync(executorPath, 'utf8')
    expect(content).toContain('isProviderDisabledInDb')
    expect(content).toContain("deepinfra")
  })
})

// ── MiMo coding_tools_only Tests ─────────────────────────────────────────────

describe('MiMo coding_tools_only', () => {
  const originalEnv = process.env

  beforeEach(() => {
    process.env = { ...originalEnv }
    process.env.MIMO_API_KEY = 'mimo-test-key'
  })

  afterEach(() => {
    process.env = originalEnv
  })

  it('MiMo has empty category support (coding_tools_only)', () => {
    const decision = routeBrain({ capability: 'code', routingMode: 'balanced' })
    const mimo = decision.policyRestrictedCandidates.find((c) => c.provider === 'mimo')
    expect(mimo.reason).toContain('coding_tools_only')
  })

  it('MiMo is never selected for runtime jobs', () => {
    const decision = routeBrain({ capability: 'chat', routingMode: 'balanced' })
    expect(decision.selectedProvider).not.toBe('mimo')
  })

  it('MiMo runtime_restricted state is respected by router', () => {
    const decision = routeBrain({
      capability: 'chat',
      routingMode: 'balanced',
      providerStates: {
        mimo: { runtimeRestricted: true },
      },
    })

    const mimoCandidate = decision.policyRestrictedCandidates.find((c) => c.provider === 'mimo')
    expect(mimoCandidate.reason).toContain('coding_tools_only')
    expect(decision.selectedProvider).not.toBe('mimo')
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

// ── Provider List Exactly 5 ──────────────────────────────────────────────────

describe('Provider list integrity', () => {
  it('PROVIDER_KEYS is exactly genx, groq, together, mimo, deepinfra', () => {
    expect(PROVIDER_KEYS).toEqual(['genx', 'groq', 'together', 'mimo', 'deepinfra'])
  })

  it('PROVIDER_KEYS has exactly 5 entries', () => {
    expect(PROVIDER_KEYS).toHaveLength(5)
  })

  it('no new providers added', () => {
    const allowed = ['genx', 'groq', 'together', 'mimo', 'deepinfra']
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

  it('dashboard shows adult generation as On Hold', () => {
    const ccPath = path.join(ROOT, 'app/dashboard/command-center/page.js')
    const content = fs.readFileSync(ccPath, 'utf8')
    expect(content).toContain('On Hold')
    expect(content).toContain('adult_generation')
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
      payload: { capability: 'chat', prompt: 'hello', provider: 'groq' },
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

  it('router function signature has no provider/model input', () => {
    const routingPath = path.join(ROOT, 'packages/core/src/brain-router.ts')
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
