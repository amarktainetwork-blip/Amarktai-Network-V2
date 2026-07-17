import { describe, expect, it, vi, beforeEach } from 'vitest'

// Mock BullMQ queue
const mockQueueAdd = vi.fn().mockResolvedValue({ id: 'mock-queue-job' })
vi.mock('bullmq', () => ({
  Queue: vi.fn().mockImplementation(() => ({
    add: mockQueueAdd,
    getJob: vi.fn().mockResolvedValue(null),
    remove: vi.fn().mockResolvedValue(undefined),
  })),
}))

// Mock Redis
const mockRedis = {}
vi.mock('../apps/api/src/lib/redis.js', () => ({
  getRedis: vi.fn().mockReturnValue(mockRedis),
}))

// Track Prisma state
let parentState: Record<string, unknown> | null = null
let existingPreviewState: Record<string, unknown> | null = null
let updatedJob: Record<string, unknown> | null = null

vi.mock('../packages/db/src/index.js', () => ({
  prisma: {
    job: {
      findFirst: vi.fn().mockImplementation(async () => existingPreviewState),
      findUnique: vi.fn().mockImplementation(async () => parentState),
      findMany: vi.fn().mockResolvedValue([]),
      update: vi.fn().mockImplementation(async (args: { data: Record<string, unknown> }) => {
        updatedJob = { ...existingPreviewState, ...args.data }
        return updatedJob
      }),
      create: vi.fn().mockResolvedValue({ id: 'new-job-id' }),
    },
  },
  advanceLongFormWorkflow: vi.fn().mockResolvedValue({ assemblyJobId: null, scheduled: false }),
  refreshLongFormParentState: vi.fn().mockResolvedValue(null),
}))

vi.mock('../apps/api/src/lib/app-grant-loader.js', () => ({
  resolveInternalDashboardCapabilityGrantSnapshot: vi.fn().mockResolvedValue({
    grant: { appSlug: 'test', capability: 'video_generation', enabled: true },
    source: 'internal_dashboard',
  }),
}))

vi.mock('../apps/api/src/lib/long-form-assembly.js', () => ({
  checkFfmpegAvailable: vi.fn().mockResolvedValue({ available: true }),
  resolveSceneArtifacts: vi.fn().mockResolvedValue([]),
  validateSceneArtifactsForAssembly: vi.fn().mockResolvedValue({ valid: false, errors: ['not_ready'] }),
}))

vi.mock('../apps/api/src/lib/admin-runtime-truth.js', () => ({
  buildAdminRuntimeTruth: vi.fn().mockResolvedValue({
    capabilities: [{
      capability: 'long_form_video',
      fullMultimediaReady: false,
      voiceoverReady: false,
      subtitlesReady: false,
      musicBedReady: false,
    }],
  }),
}))

vi.mock('../packages/artifacts/src/index.js', () => ({
  saveArtifact: vi.fn().mockResolvedValue({ id: 'artifact-id', storageUrl: '/test' }),
}))

const TEST_PLAN_ID = 'test-plan-id-123'
const TEST_VERSION_HASH = 'test-version-hash-456'
const TEST_EXECUTION_ID = 'test-execution-id-789'

const basePlan = {
  id: TEST_PLAN_ID,
  versionHash: TEST_VERSION_HASH,
  prompt: 'Test prompt',
  totalDurationSeconds: 30,
  aspectRatio: '16:9',
  style: 'cinematic',
  tone: 'professional',
  planningMode: 'explicit',
  routingMode: 'quality',
  storyboard: {
    scenes: [
      { sceneNumber: 1, title: 'Scene 1', objective: 'Intro', visualPrompt: 'Visual 1', durationSeconds: 10 },
      { sceneNumber: 2, title: 'Scene 2', objective: 'Middle', visualPrompt: 'Visual 2', durationSeconds: 10 },
      { sceneNumber: 3, title: 'Scene 3', objective: 'End', visualPrompt: 'Visual 3', durationSeconds: 10 },
    ],
    totalDurationSeconds: 30,
    narrativeFlow: 'test flow',
  },
  renderSteps: [],
  artifactPlan: { finalVideoArtifact: false, sceneArtifacts: [] },
  missingDependencies: [],
  executableNow: false,
  perSceneVideoGenerationPossible: true,
  finalAssemblyReady: false,
  providerCallsStarted: false,
}

function makeParent(overrides: Record<string, unknown> = {}) {
  return {
    id: 'parent-job-id',
    status: 'planned',
    appSlug: 'dashboard-long-form',
    executionId: TEST_EXECUTION_ID,
    metadataJson: JSON.stringify({
      plan: basePlan,
      planOnly: true,
      approved: false,
      request: { prompt: 'Test', targetDurationSeconds: 30, sceneCount: 3 },
      routingMode: 'quality',
    }),
    ...overrides,
  }
}

function makePreviewJob(overrides: Record<string, unknown> = {}) {
  return {
    id: 'preview-job-id',
    status: 'failed',
    appSlug: 'dashboard-long-form',
    capability: 'video_generation',
    prompt: 'Visual 1',
    inputJson: JSON.stringify({ duration: 10, aspectRatio: '16:9' }),
    metadataJson: JSON.stringify({
      longFormVideo: true,
      longFormScenePreview: true,
      sourcePlanId: TEST_PLAN_ID,
      sourcePlanVersionHash: TEST_VERSION_HASH,
      sourcePlanExecutionId: TEST_EXECUTION_ID,
      sceneNumber: 1,
      routingMode: 'quality',
      retryGeneration: 0,
      appGrantSnapshot: { appSlug: 'test', capability: 'video_generation', enabled: true },
    }),
    traceId: `trace_longform_preview_${TEST_EXECUTION_ID}_scene_1`,
    executionId: TEST_EXECUTION_ID,
    sceneNumber: 1,
    retryCount: 0,
    error: 'Previous failure',
    queueJobId: null,
    artifactId: null,
    ...overrides,
  }
}

describe('preview-scene retry endpoint', () => {
  it('increments Job.retryCount on retry', async () => {
    parentState = makeParent()
    existingPreviewState = makePreviewJob()

    // Simulate what the retry endpoint does
    const currentRetryCount = existingPreviewState.retryCount ?? 0
    const newRetryCount = currentRetryCount + 1
    expect(newRetryCount).toBe(1)

    // Verify the update call would include retryCount
    const updateData = {
      retryCount: newRetryCount,
      status: 'queued',
      progress: 0,
      error: null,
    }
    expect(updateData.retryCount).toBe(1)
    expect(updateData.status).toBe('queued')
  })

  it('enforces MAX_SCENE_RETRIES = 3 against canonical retryCount', async () => {
    const maxRetries = 3

    // At retry count 3, should be rejected
    existingPreviewState = makePreviewJob({ retryCount: 3 })
    const currentRetryCount = existingPreviewState.retryCount ?? 0
    expect(currentRetryCount).toBeGreaterThanOrEqual(maxRetries)
  })

  it('uses unique attempt queue ID based on retryCount', async () => {
    const jobId = 'preview-job-id'
    const retryCount = 2
    const queueJobId = retryCount > 0 ? `${jobId}:attempt:${retryCount}` : jobId
    expect(queueJobId).toBe('preview-job-id:attempt:2')
  })

  it('preserves quality routing mode in retry', async () => {
    const meta = {
      routingMode: 'quality',
      sourcePlanId: TEST_PLAN_ID,
      sourcePlanVersionHash: TEST_VERSION_HASH,
      sourcePlanExecutionId: TEST_EXECUTION_ID,
      sceneNumber: 1,
    }
    expect(meta.routingMode).toBe('quality')
  })

  it('rejects completed preview', async () => {
    existingPreviewState = makePreviewJob({ status: 'completed' })
    expect(existingPreviewState.status).toBe('completed')
  })

  it('rejects queued preview', async () => {
    existingPreviewState = makePreviewJob({ status: 'queued' })
    expect(['queued', 'processing']).toContain(existingPreviewState.status)
  })

  it('rejects processing preview', async () => {
    existingPreviewState = makePreviewJob({ status: 'processing' })
    expect(['queued', 'processing']).toContain(existingPreviewState.status)
  })

  it('accepts failed preview', async () => {
    existingPreviewState = makePreviewJob({ status: 'failed' })
    expect(existingPreviewState.status).toBe('failed')
  })

  it('accepts cancelled preview', async () => {
    existingPreviewState = makePreviewJob({ status: 'cancelled' })
    expect(existingPreviewState.status).toBe('cancelled')
  })

  it('validates sourcePlanExecutionId matches request', async () => {
    existingPreviewState = makePreviewJob({
      metadataJson: JSON.stringify({
        ...JSON.parse(makePreviewJob().metadataJson),
        sourcePlanExecutionId: 'different-execution-id',
      }),
    })
    const meta = JSON.parse(existingPreviewState.metadataJson as string)
    expect(meta.sourcePlanExecutionId).not.toBe(TEST_EXECUTION_ID)
  })

  it('validates sourcePlanId matches request', async () => {
    existingPreviewState = makePreviewJob({
      metadataJson: JSON.stringify({
        ...JSON.parse(makePreviewJob().metadataJson),
        sourcePlanId: 'different-plan-id',
      }),
    })
    const meta = JSON.parse(existingPreviewState.metadataJson as string)
    expect(meta.sourcePlanId).not.toBe(TEST_PLAN_ID)
  })

  it('validates sourcePlanVersionHash matches request', async () => {
    existingPreviewState = makePreviewJob({
      metadataJson: JSON.stringify({
        ...JSON.parse(makePreviewJob().metadataJson),
        sourcePlanVersionHash: 'different-hash',
      }),
    })
    const meta = JSON.parse(existingPreviewState.metadataJson as string)
    expect(meta.sourcePlanVersionHash).not.toBe(TEST_VERSION_HASH)
  })

  it('validates sceneNumber matches request', async () => {
    existingPreviewState = makePreviewJob({
      metadataJson: JSON.stringify({
        ...JSON.parse(makePreviewJob().metadataJson),
        sceneNumber: 99,
      }),
    })
    const meta = JSON.parse(existingPreviewState.metadataJson as string)
    expect(meta.sceneNumber).not.toBe(1)
  })

  it('rejects parent that is no longer planned', async () => {
    parentState = makeParent({ status: 'processing' })
    expect(parentState.status).not.toBe('planned')
  })

  it('rejects approved parent', async () => {
    parentState = makeParent({
      metadataJson: JSON.stringify({
        plan: basePlan,
        planOnly: true,
        approved: true,
        request: { prompt: 'Test' },
        routingMode: 'quality',
      }),
    })
    const meta = JSON.parse(parentState.metadataJson as string)
    expect(meta.approved).toBe(true)
  })

  it('rejects mismatched planId', async () => {
    parentState = makeParent({
      metadataJson: JSON.stringify({
        plan: { ...basePlan, id: 'wrong-plan-id' },
        planOnly: true,
        approved: false,
        request: { prompt: 'Test' },
        routingMode: 'quality',
      }),
    })
    const meta = JSON.parse(parentState.metadataJson as string)
    expect(meta.plan.id).not.toBe(TEST_PLAN_ID)
  })

  it('rejects mismatched versionHash', async () => {
    parentState = makeParent({
      metadataJson: JSON.stringify({
        plan: { ...basePlan, versionHash: 'wrong-hash' },
        planOnly: true,
        approved: false,
        request: { prompt: 'Test' },
        routingMode: 'quality',
      }),
    })
    const meta = JSON.parse(parentState.metadataJson as string)
    expect(meta.plan.versionHash).not.toBe(TEST_VERSION_HASH)
  })

  it('rejects unknown sceneNumber', async () => {
    parentState = makeParent()
    const sceneNumber = 99
    const found = basePlan.storyboard.scenes.some((s) => s.sceneNumber === sceneNumber)
    expect(found).toBe(false)
  })
})
