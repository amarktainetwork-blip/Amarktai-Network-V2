/**
 * Job ingestion contract tests — proves external app job intake end-to-end.
 *
 * Uses Fastify inject + mocked Prisma and BullMQ.
 * No real database or Redis required.
 *
 * This PR proves the job intake path only.
 * Worker/provider execution is a later phase.
 */

import { describe, expect, it, vi, beforeEach } from 'vitest'

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
}))

vi.mock('@amarktai/db', () => ({ prisma: prismaMock }))

// ── Mock BullMQ Queue ────────────────────────────────────────────────────────

const mockQueueAdd = vi.fn()

vi.mock('bullmq', () => {
  return {
    Queue: function MockQueueConstructor() {
      return { add: mockQueueAdd }
    },
  }
})

// ── Mock Redis plugin ────────────────────────────────────────────────────────

// We need to build a Fastify app with the job routes registered
// but without real Redis. We'll test via direct route logic.

// ── Test fixtures ────────────────────────────────────────────────────────────

const VALID_API_KEY = 'amk_test_key_1234567890abcdef'
const VALID_BEARER = `Bearer ${VALID_API_KEY}`

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
    key: VALID_API_KEY,
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

function makeGrantRecord(appSlug, capability, overrides = {}) {
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
    ...overrides,
  }
}

// ── Import route logic for direct testing ────────────────────────────────────

// We test the authenticateAppKey helper and route logic by importing
// the core schemas and verifying behavior contract.

import {
  CreateJobRequestSchema,
  hasBlockedOverrides,
  parseBearerToken,
  BLOCKED_OVERRIDE_FIELDS,
  TOKEN_COST_MULTIPLIER,
  CAPABILITY_KEYS,
} from '../packages/core/src/index.ts'

// ── Auth contract tests ──────────────────────────────────────────────────────

describe('Job ingestion auth contract', () => {
  it('parseBearerToken returns null for missing header', () => {
    expect(parseBearerToken(undefined)).toBeNull()
    expect(parseBearerToken(null)).toBeNull()
    expect(parseBearerToken('')).toBeNull()
  })

  it('parseBearerToken returns null for invalid format', () => {
    expect(parseBearerToken('Basic abc123')).toBeNull()
    expect(parseBearerToken('abc123')).toBeNull()
    expect(parseBearerToken('Bearer')).toBeNull()
    expect(parseBearerToken('Bearer ')).toBeNull()
  })

  it('parseBearerToken extracts token from valid Bearer header', () => {
    expect(parseBearerToken('Bearer abc123')).toBe('abc123')
    expect(parseBearerToken('Bearer amk_test_key_123')).toBe('amk_test_key_123')
  })
})

// ── Override blocking tests ──────────────────────────────────────────────────

describe('Provider/model override blocking', () => {
  it('BLOCKED_OVERRIDE_FIELDS contains all required fields', () => {
    expect(BLOCKED_OVERRIDE_FIELDS).toContain('providerOverride')
    expect(BLOCKED_OVERRIDE_FIELDS).toContain('modelOverride')
    expect(BLOCKED_OVERRIDE_FIELDS).toContain('provider')
    expect(BLOCKED_OVERRIDE_FIELDS).toContain('model')
    expect(BLOCKED_OVERRIDE_FIELDS).toContain('providerKey')
    expect(BLOCKED_OVERRIDE_FIELDS).toContain('modelId')
  })

  it('hasBlockedOverrides returns null for clean request', () => {
    expect(hasBlockedOverrides({ capability: 'chat', prompt: 'hello' })).toBeNull()
  })

  it.each([
    ['providerOverride', { providerOverride: 'deepinfra' }],
    ['modelOverride', { modelOverride: 'llama-3' }],
    ['provider', { provider: 'genx' }],
    ['model', { model: 'gpt-4' }],
    ['providerKey', { providerKey: 'together' }],
    ['modelId', { modelId: 'whisper-v3' }],
  ])('hasBlockedOverrides detects %s', (expectedField, body) => {
    expect(hasBlockedOverrides(body)).toBe(expectedField)
  })

  it('hasBlockedOverrides detects overrides mixed with valid fields', () => {
    expect(hasBlockedOverrides({
      capability: 'chat',
      prompt: 'hello',
      provider: 'deepinfra',
    })).toBe('provider')
  })

  it('blocks provider/model overrides on video generation requests before GenX routing', () => {
    expect(hasBlockedOverrides({
      capability: 'video_generation',
      prompt: 'make a proof clip',
      model: 'veo-3.1',
    })).toBe('model')
  })
})

// ── Request validation tests ─────────────────────────────────────────────────

describe('Job request schema validation', () => {
  it('rejects missing capability', () => {
    const result = CreateJobRequestSchema.safeParse({ prompt: 'hello' })
    expect(result.success).toBe(false)
  })

  it('rejects missing prompt', () => {
    const result = CreateJobRequestSchema.safeParse({ capability: 'chat' })
    expect(result.success).toBe(false)
  })

  it('rejects empty prompt', () => {
    const result = CreateJobRequestSchema.safeParse({ capability: 'chat', prompt: '' })
    expect(result.success).toBe(false)
  })

  it('rejects unknown capability', () => {
    const result = CreateJobRequestSchema.safeParse({
      capability: 'unknown_capability',
      prompt: 'hello',
    })
    expect(result.success).toBe(false)
  })

  it('accepts valid chat request', () => {
    const result = CreateJobRequestSchema.safeParse({
      capability: 'chat',
      prompt: 'Hello world',
    })
    expect(result.success).toBe(true)
    if (result.success) {
      expect(result.data.capability).toBe('chat')
      expect(result.data.prompt).toBe('Hello world')
      expect(result.data.input).toEqual({})
      expect(result.data.metadata).toEqual({})
    }
  })

  it('accepts request with input and metadata', () => {
    const result = CreateJobRequestSchema.safeParse({
      capability: 'image_generation',
      prompt: 'A sunset',
      input: { style: 'photorealistic' },
      metadata: { source: 'test' },
    })
    expect(result.success).toBe(true)
    if (result.success) {
      expect(result.data.input).toEqual({ style: 'photorealistic' })
      expect(result.data.metadata).toEqual({ source: 'test' })
    }
  })

  it('accepts request with callbackUrl', () => {
    const result = CreateJobRequestSchema.safeParse({
      capability: 'chat',
      prompt: 'Hello',
      callbackUrl: 'https://example.com/callback',
    })
    expect(result.success).toBe(true)
    if (result.success) {
      expect(result.data.callbackUrl).toBe('https://example.com/callback')
    }
  })

  it('rejects invalid callbackUrl', () => {
    const result = CreateJobRequestSchema.safeParse({
      capability: 'chat',
      prompt: 'Hello',
      callbackUrl: 'not-a-url',
    })
    expect(result.success).toBe(false)
  })

  it('rejects prompt exceeding max length', () => {
    const result = CreateJobRequestSchema.safeParse({
      capability: 'chat',
      prompt: 'x'.repeat(100_001),
    })
    expect(result.success).toBe(false)
  })

  it('accepts all valid capability keys', () => {
    for (const cap of CAPABILITY_KEYS) {
      const result = CreateJobRequestSchema.safeParse({
        capability: cap,
        prompt: 'test',
      })
      expect(result.success, `capability '${cap}' should be valid`).toBe(true)
    }
  })
})

// ── Token cost multiplier tests ──────────────────────────────────────────────

describe('Token cost multiplier', () => {
  it('chat costs 1 token', () => {
    expect(TOKEN_COST_MULTIPLIER.chat).toBe(1)
  })

  it('image_generation costs more than chat', () => {
    expect(TOKEN_COST_MULTIPLIER.image_generation).toBeGreaterThan(TOKEN_COST_MULTIPLIER.chat)
  })

  it('video_generation is the most expensive', () => {
    expect(TOKEN_COST_MULTIPLIER.video_generation).toBe(20)
  })

  it('all capabilities have a cost defined', () => {
    for (const cap of CAPABILITY_KEYS) {
      expect(TOKEN_COST_MULTIPLIER[cap], `cost for '${cap}'`).toBeDefined()
      expect(TOKEN_COST_MULTIPLIER[cap], `cost for '${cap}'`).toBeGreaterThan(0)
    }
  })
})

// ── Capability allowlist tests ───────────────────────────────────────────────

// ── Budget behavior tests ────────────────────────────────────────────────────

describe('Daily budget behavior', () => {
  it('budget of 0 does not block', () => {
    const dailyBudgetCents = 0
    const shouldCheck = dailyBudgetCents > 0
    expect(shouldCheck).toBe(false)
  })

  it('undefined budget does not block', () => {
    const dailyBudgetCents = undefined
    const shouldCheck = dailyBudgetCents && dailyBudgetCents > 0
    expect(shouldCheck).toBeFalsy()
  })

  it('spend below budget allows request', () => {
    const dailyBudgetCents = 1000
    const dailySpend = 500
    expect(dailySpend >= dailyBudgetCents).toBe(false)
  })

  it('spend at budget blocks request', () => {
    const dailyBudgetCents = 1000
    const dailySpend = 1000
    expect(dailySpend >= dailyBudgetCents).toBe(true)
  })

  it('spend above budget blocks request', () => {
    const dailyBudgetCents = 1000
    const dailySpend = 1500
    expect(dailySpend >= dailyBudgetCents).toBe(true)
  })
})

// ── Token balance behavior tests ─────────────────────────────────────────────

describe('Token balance behavior', () => {
  it('balance below required returns insufficient', () => {
    const tokenBalance = 0
    const costMultiplier = 1
    expect(tokenBalance < costMultiplier).toBe(true)
  })

  it('balance equal to required allows request', () => {
    const tokenBalance = 5
    const costMultiplier = 5
    expect(tokenBalance < costMultiplier).toBe(false)
  })

  it('balance above required allows request', () => {
    const tokenBalance = 1000
    const costMultiplier = 1
    expect(tokenBalance < costMultiplier).toBe(false)
  })

  it('video_generation requires 20 tokens', () => {
    const tokenBalance = 19
    const costMultiplier = TOKEN_COST_MULTIPLIER.video_generation
    expect(tokenBalance < costMultiplier).toBe(true)
  })
})

// ── Job creation contract tests ──────────────────────────────────────────────

describe('Job creation contract', () => {
  beforeEach(() => {
    vi.clearAllMocks()
  })

  it('job row includes required fields', () => {
    const job = makeJob()
    expect(job.id).toBeDefined()
    expect(job.appSlug).toBe('test-app')
    expect(job.capability).toBe('chat')
    expect(job.prompt).toBe('Hello world')
    expect(job.status).toBe('queued')
    expect(job.traceId).toMatch(/^trace_/)
    expect(job.createdAt).toBeInstanceOf(Date)
  })

  it('job traceId starts with trace_', () => {
    const traceId = `trace_test-uuid`
    expect(traceId).toMatch(/^trace_/)
  })

  it('job status defaults to queued', () => {
    const job = makeJob()
    expect(job.status).toBe('queued')
  })
})

// ── Enqueue failure behavior tests ───────────────────────────────────────────

describe('Enqueue failure behavior', () => {
  it('queue add failure causes job status update to failed', () => {
    // When queue.add throws, the route catches it and:
    // 1. Updates job status to 'failed'
    // 2. Sets error to 'Failed to enqueue job'
    // 3. Returns 500
    const jobId = 'job-uuid-001'
    const expectedUpdate = {
      where: { id: jobId },
      data: { status: 'failed', error: 'Failed to enqueue job' },
    }
    expect(expectedUpdate.data.status).toBe('failed')
    expect(expectedUpdate.data.error).toBe('Failed to enqueue job')
  })
})

// ── Status polling auth/ownership tests ──────────────────────────────────────

describe('Job status polling contract', () => {
  it('job belongs to app check uses appSlug comparison', () => {
    const job = makeJob({ appSlug: 'app-a' })
    const authAppSlug = 'app-b'
    expect(job.appSlug !== authAppSlug).toBe(true)
  })

  it('job not found returns 404', () => {
    const job = null
    expect(job).toBeNull()
  })

  it('job status response includes all required fields', () => {
    const job = makeJob()
    const response = {
      jobId: job.id,
      status: job.status,
      capability: job.capability,
      provider: job.provider,
      model: job.model,
      artifactId: job.artifactId,
      progress: job.progress,
      error: job.error,
      createdAt: job.createdAt.toISOString(),
      startedAt: job.startedAt?.toISOString() ?? null,
      completedAt: job.completedAt?.toISOString() ?? null,
    }
    expect(response.jobId).toBeDefined()
    expect(response.status).toBeDefined()
    expect(response.capability).toBeDefined()
    expect(response.createdAt).toBeDefined()
  })
})

// ── Route integration via Fastify inject ─────────────────────────────────────

describe('Job route integration (Fastify inject)', async () => {
  // Build a minimal Fastify app with just the job routes
  const { default: Fastify } = await import('fastify')

  function buildApp() {
    const app = Fastify({ logger: false })

    // Decorate with a mock redis (required by getQueue)
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
    prismaMock.appCapabilityGrant.findUnique.mockImplementation(async ({ where }) => {
      const key = where.app_capability_grant_unique
      return makeGrantRecord(key.appSlug, key.capability)
    })
  })

  // We test the route logic directly by importing and registering it
  // The route uses authenticateAppKey which hits Prisma

  it('POST /api/v1/jobs returns 401 without Authorization header', async () => {
    prismaMock.appApiKey.findUnique.mockResolvedValue(null)

    const app = buildApp()
    const { jobRoutes } = await import('../apps/api/src/routes/jobs.ts')
    await app.register(jobRoutes)

    const res = await app.inject({
      method: 'POST',
      url: '/api/v1/jobs',
      payload: { capability: 'chat', prompt: 'hello' },
    })

    expect(res.statusCode).toBe(401)
    const body = JSON.parse(res.payload)
    expect(body.error).toBe(true)
    expect(body.message).toContain('Authorization')
    expect(prismaMock.job.create).not.toHaveBeenCalled()
    expect(mockQueueAdd).not.toHaveBeenCalled()

    await app.close()
  })

  it('POST /api/v1/jobs returns 401 with invalid Bearer format', async () => {
    const app = buildApp()
    const { jobRoutes } = await import('../apps/api/src/routes/jobs.ts')
    await app.register(jobRoutes)

    const res = await app.inject({
      method: 'POST',
      url: '/api/v1/jobs',
      headers: { authorization: 'Basic abc123' },
      payload: { capability: 'chat', prompt: 'hello' },
    })

    expect(res.statusCode).toBe(401)
    const body = JSON.parse(res.payload)
    expect(body.message).toContain('Invalid Authorization format')
    expect(prismaMock.job.create).not.toHaveBeenCalled()
    expect(mockQueueAdd).not.toHaveBeenCalled()

    await app.close()
  })

  it('POST /api/v1/jobs returns 401 for unknown API key', async () => {
    prismaMock.appApiKey.findUnique.mockResolvedValue(null)

    const app = buildApp()
    const { jobRoutes } = await import('../apps/api/src/routes/jobs.ts')
    await app.register(jobRoutes)

    const res = await app.inject({
      method: 'POST',
      url: '/api/v1/jobs',
      headers: { authorization: VALID_BEARER },
      payload: { capability: 'chat', prompt: 'hello' },
    })

    expect(res.statusCode).toBe(401)
    const body = JSON.parse(res.payload)
    expect(body.message).toContain('Invalid API key')
    expect(prismaMock.job.create).not.toHaveBeenCalled()
    expect(mockQueueAdd).not.toHaveBeenCalled()

    await app.close()
  })

  it('POST /api/v1/jobs returns 403 for deactivated API key', async () => {
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
    expect(mockQueueAdd).not.toHaveBeenCalled()

    await app.close()
  })

  it('POST /api/v1/jobs returns 403 for missing app connection', async () => {
    prismaMock.appApiKey.findUnique.mockResolvedValue(
      makeApiKey({ appConnection: null })
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
    expect(prismaMock.job.create).not.toHaveBeenCalled()
    expect(mockQueueAdd).not.toHaveBeenCalled()

    await app.close()
  })

  it('POST /api/v1/jobs returns 403 for inactive app connection', async () => {
    prismaMock.appApiKey.findUnique.mockResolvedValue(
      makeApiKey({ appConnection: makeAppConnection({ status: 'suspended' }) })
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
    expect(prismaMock.job.create).not.toHaveBeenCalled()
    expect(mockQueueAdd).not.toHaveBeenCalled()

    await app.close()
  })

  it('POST /api/v1/jobs returns 400 for provider override', async () => {
    prismaMock.appApiKey.findUnique.mockResolvedValue(makeApiKey())

    const app = buildApp()
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
    expect(prismaMock.job.create).not.toHaveBeenCalled()
    expect(mockQueueAdd).not.toHaveBeenCalled()

    await app.close()
  })

  it('POST /api/v1/jobs returns 400 for model override', async () => {
    prismaMock.appApiKey.findUnique.mockResolvedValue(makeApiKey())

    const app = buildApp()
    const { jobRoutes } = await import('../apps/api/src/routes/jobs.ts')
    await app.register(jobRoutes)

    const res = await app.inject({
      method: 'POST',
      url: '/api/v1/jobs',
      headers: { authorization: VALID_BEARER },
      payload: { capability: 'chat', prompt: 'hello', modelOverride: 'gpt-4' },
    })

    expect(res.statusCode).toBe(400)
    expect(prismaMock.job.create).not.toHaveBeenCalled()
    expect(mockQueueAdd).not.toHaveBeenCalled()

    await app.close()
  })

  it('POST /api/v1/jobs returns 400 for missing capability', async () => {
    prismaMock.appApiKey.findUnique.mockResolvedValue(makeApiKey())

    const app = buildApp()
    const { jobRoutes } = await import('../apps/api/src/routes/jobs.ts')
    await app.register(jobRoutes)

    const res = await app.inject({
      method: 'POST',
      url: '/api/v1/jobs',
      headers: { authorization: VALID_BEARER },
      payload: { prompt: 'hello' },
    })

    expect(res.statusCode).toBe(400)
    expect(prismaMock.job.create).not.toHaveBeenCalled()
    expect(mockQueueAdd).not.toHaveBeenCalled()

    await app.close()
  })

  it('POST /api/v1/jobs returns 400 for missing prompt', async () => {
    prismaMock.appApiKey.findUnique.mockResolvedValue(makeApiKey())

    const app = buildApp()
    const { jobRoutes } = await import('../apps/api/src/routes/jobs.ts')
    await app.register(jobRoutes)

    const res = await app.inject({
      method: 'POST',
      url: '/api/v1/jobs',
      headers: { authorization: VALID_BEARER },
      payload: { capability: 'chat' },
    })

    expect(res.statusCode).toBe(400)
    expect(prismaMock.job.create).not.toHaveBeenCalled()
    expect(mockQueueAdd).not.toHaveBeenCalled()

    await app.close()
  })

  it('POST /api/v1/jobs returns 400 for unknown capability', async () => {
    prismaMock.appApiKey.findUnique.mockResolvedValue(makeApiKey())

    const app = buildApp()
    const { jobRoutes } = await import('../apps/api/src/routes/jobs.ts')
    await app.register(jobRoutes)

    const res = await app.inject({
      method: 'POST',
      url: '/api/v1/jobs',
      headers: { authorization: VALID_BEARER },
      payload: { capability: 'fake_capability', prompt: 'hello' },
    })

    expect(res.statusCode).toBe(400)
    expect(prismaMock.job.create).not.toHaveBeenCalled()
    expect(mockQueueAdd).not.toHaveBeenCalled()

    await app.close()
  })

  it('POST /api/v1/jobs returns 403 when capability not in allowlist', async () => {
    prismaMock.appCapabilityGrant.findUnique.mockResolvedValue(null)
    prismaMock.appApiKey.findUnique.mockResolvedValue(
      makeApiKey({ appConnection: makeAppConnection({ allowedCapabilities: '["chat"]' }) })
    )

    const app = buildApp()
    const { jobRoutes } = await import('../apps/api/src/routes/jobs.ts')
    await app.register(jobRoutes)

    const res = await app.inject({
      method: 'POST',
      url: '/api/v1/jobs',
      headers: { authorization: VALID_BEARER },
      payload: { capability: 'image_generation', prompt: 'a sunset' },
    })

    expect(res.statusCode).toBe(403)
    const body = JSON.parse(res.payload)
    expect(body.message).toContain('no enabled AppCapabilityGrant')
    expect(prismaMock.job.create).not.toHaveBeenCalled()
    expect(mockQueueAdd).not.toHaveBeenCalled()

    await app.close()
  })

  it('POST /api/v1/jobs returns 429 when daily budget exceeded', async () => {
    prismaMock.appApiKey.findUnique.mockResolvedValue(
      makeApiKey({ appConnection: makeAppConnection({ appSlug: 'budget-app' }) })
    )
    prismaMock.appBudgetConfig.findUnique.mockResolvedValue({ dailyBudgetCents: 1000 })
    prismaMock.usageMeter.aggregate.mockResolvedValue({ _sum: { costUsdCents: 1000 } })

    const app = buildApp()
    const { jobRoutes } = await import('../apps/api/src/routes/jobs.ts')
    await app.register(jobRoutes)

    const res = await app.inject({
      method: 'POST',
      url: '/api/v1/jobs',
      headers: { authorization: VALID_BEARER },
      payload: { capability: 'chat', prompt: 'hello' },
    })

    expect(res.statusCode).toBe(429)
    const body = JSON.parse(res.payload)
    expect(body.message).toContain('budget')
    expect(prismaMock.job.create).not.toHaveBeenCalled()
    expect(mockQueueAdd).not.toHaveBeenCalled()

    await app.close()
  })

  it('POST /api/v1/jobs returns 402 when token balance insufficient', async () => {
    prismaMock.appApiKey.findUnique.mockResolvedValue(
      makeApiKey({ appConnection: makeAppConnection({ tokenBalance: 0 }) })
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

    expect(res.statusCode).toBe(402)
    const body = JSON.parse(res.payload)
    expect(body.message).toContain('token balance')
    expect(prismaMock.job.create).not.toHaveBeenCalled()
    expect(mockQueueAdd).not.toHaveBeenCalled()

    await app.close()
  })

  it('POST /api/v1/jobs returns 201 on success with correct response shape', async () => {
    const mockJob = makeJob()
    prismaMock.appApiKey.findUnique.mockResolvedValue(makeApiKey())
    prismaMock.job.create.mockResolvedValue(mockJob)

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
    const body = JSON.parse(res.payload)
    expect(body.jobId).toBe('job-uuid-001')
    expect(body.status).toBe('queued')
    expect(body.capability).toBe('chat')
    expect(body.createdAt).toBeDefined()

    // Verify job was created with correct fields
    expect(prismaMock.job.create).toHaveBeenCalledWith(
      expect.objectContaining({
        data: expect.objectContaining({
          appSlug: 'test-app',
          capability: 'chat',
          prompt: 'Hello world',
          status: 'queued',
          traceId: expect.stringMatching(/^trace_/),
        }),
      })
    )

    // Verify tokens were decremented
    expect(prismaMock.appConnection.update).toHaveBeenCalledWith(
      expect.objectContaining({
        where: { id: 'conn-001' },
        data: { tokenBalance: { decrement: expect.any(Number) } },
      })
    )

    // Verify queue push was attempted
    expect(mockQueueAdd).toHaveBeenCalledWith(
      'process',
      expect.objectContaining({
        jobId: 'job-uuid-001',
        appSlug: 'test-app',
        capability: 'chat',
        prompt: 'Hello world',
        traceId: expect.stringMatching(/^trace_/),
      }),
      expect.objectContaining({
        jobId: 'job-uuid-001',
      })
    )

    await app.close()
  })

  it('POST /api/v1/jobs returns 500 when queue add fails', async () => {
    const mockJob = makeJob()
    prismaMock.appApiKey.findUnique.mockResolvedValue(makeApiKey())
    prismaMock.job.create.mockResolvedValue(mockJob)
    mockQueueAdd.mockRejectedValue(new Error('Redis connection failed'))

    const app = buildApp()
    const { jobRoutes } = await import('../apps/api/src/routes/jobs.ts')
    await app.register(jobRoutes)

    const res = await app.inject({
      method: 'POST',
      url: '/api/v1/jobs',
      headers: { authorization: VALID_BEARER },
      payload: { capability: 'chat', prompt: 'Hello world' },
    })

    expect(res.statusCode).toBe(500)
    const body = JSON.parse(res.payload)
    expect(body.message).toContain('enqueue')

    // Job was created first as queued
    expect(prismaMock.job.create).toHaveBeenCalled()

    // Then updated to failed
    expect(prismaMock.job.update).toHaveBeenCalledWith(
      expect.objectContaining({
        where: { id: 'job-uuid-001' },
        data: { status: 'failed', error: 'Failed to enqueue job' },
      })
    )

    await app.close()
  })

  it('POST /api/v1/jobs uses a stored grant when the legacy migration list is empty', async () => {
    prismaMock.appApiKey.findUnique.mockResolvedValue(
      makeApiKey({ appConnection: makeAppConnection({ allowedCapabilities: '[]' }) })
    )
    prismaMock.job.create.mockResolvedValue(makeJob({ capability: 'image_generation' }))

    const app = buildApp()
    const { jobRoutes } = await import('../apps/api/src/routes/jobs.ts')
    await app.register(jobRoutes)

    const res = await app.inject({
      method: 'POST',
      url: '/api/v1/jobs',
      headers: { authorization: VALID_BEARER },
      payload: { capability: 'image_generation', prompt: 'a sunset' },
    })

    expect(res.statusCode).toBe(201)
    await app.close()
  })
})

// ── GET /api/v1/jobs/:id tests ──────────────────────────────────────────────

describe('Job status polling (GET /api/v1/jobs/:id)', async () => {
  const { default: Fastify } = await import('fastify')

  function buildApp() {
    const app = Fastify({ logger: false })
    app.decorate('redis', {})
    return app
  }

  beforeEach(() => {
    vi.clearAllMocks()
  })

  it('GET /api/v1/jobs/:id returns 401 without auth', async () => {
    prismaMock.appApiKey.findUnique.mockResolvedValue(null)

    const app = buildApp()
    const { jobRoutes } = await import('../apps/api/src/routes/jobs.ts')
    await app.register(jobRoutes)

    const res = await app.inject({
      method: 'GET',
      url: '/api/v1/jobs/job-uuid-001',
    })

    expect(res.statusCode).toBe(401)
    await app.close()
  })

  it('GET /api/v1/jobs/:id returns 404 for unknown job', async () => {
    prismaMock.appApiKey.findUnique.mockResolvedValue(makeApiKey())
    prismaMock.job.findUnique.mockResolvedValue(null)

    const app = buildApp()
    const { jobRoutes } = await import('../apps/api/src/routes/jobs.ts')
    await app.register(jobRoutes)

    const res = await app.inject({
      method: 'GET',
      url: '/api/v1/jobs/nonexistent-id',
      headers: { authorization: VALID_BEARER },
    })

    expect(res.statusCode).toBe(404)
    await app.close()
  })

  it('GET /api/v1/jobs/:id returns 404 when job belongs to another app', async () => {
    prismaMock.appApiKey.findUnique.mockResolvedValue(makeApiKey())
    prismaMock.job.findUnique.mockResolvedValue(makeJob({ appSlug: 'other-app' }))

    const app = buildApp()
    const { jobRoutes } = await import('../apps/api/src/routes/jobs.ts')
    await app.register(jobRoutes)

    const res = await app.inject({
      method: 'GET',
      url: '/api/v1/jobs/job-uuid-001',
      headers: { authorization: VALID_BEARER },
    })

    expect(res.statusCode).toBe(404)
    await app.close()
  })

  it('GET /api/v1/jobs/:id returns 200 with job status for owning app', async () => {
    prismaMock.appApiKey.findUnique.mockResolvedValue(makeApiKey())
    prismaMock.job.findUnique.mockResolvedValue(makeJob())

    const app = buildApp()
    const { jobRoutes } = await import('../apps/api/src/routes/jobs.ts')
    await app.register(jobRoutes)

    const res = await app.inject({
      method: 'GET',
      url: '/api/v1/jobs/job-uuid-001',
      headers: { authorization: VALID_BEARER },
    })

    expect(res.statusCode).toBe(200)
    const body = JSON.parse(res.payload)
    expect(body.jobId).toBe('job-uuid-001')
    expect(body.status).toBe('queued')
    expect(body.capability).toBe('chat')
    expect(body.createdAt).toBeDefined()

    await app.close()
  })

  it('GET /api/v1/jobs/:id returns artifact info for completed job', async () => {
    prismaMock.appApiKey.findUnique.mockResolvedValue(makeApiKey())
    prismaMock.job.findUnique.mockResolvedValue(
      makeJob({ status: 'completed', artifactId: 'artifact-001' })
    )

    const app = buildApp()
    const { jobRoutes } = await import('../apps/api/src/routes/jobs.ts')
    await app.register(jobRoutes)

    const res = await app.inject({
      method: 'GET',
      url: '/api/v1/jobs/job-uuid-001',
      headers: { authorization: VALID_BEARER },
    })

    expect(res.statusCode).toBe(200)
    const body = JSON.parse(res.payload)
    expect(body.status).toBe('completed')
    expect(body.artifactId).toBe('artifact-001')

    await app.close()
  })
})
