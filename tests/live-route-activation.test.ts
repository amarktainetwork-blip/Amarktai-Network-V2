import { beforeEach, describe, expect, it, vi } from 'vitest'
import { readFileSync } from 'node:fs'
import {
  evaluateOrchestra,
  getRuntimeTruth,
  normalizeDbCandidates,
  normalizeDbModelRecords,
  type ProviderDiscoveryResult,
  type ProviderKey,
} from '../packages/core/src/index.ts'

const state = vi.hoisted(() => ({ rows: new Map<string, Record<string, unknown>>(), id: 1 }))

const prisma = vi.hoisted(() => ({
  modelRegistryEntry: {
    findUnique: vi.fn(async ({ where }: any) => state.rows.get(`${where.provider_modelId.provider}/${where.provider_modelId.modelId}`) ?? null),
    create: vi.fn(async ({ data }: any) => {
      const row = { id: state.id++, enabled: true, ...data }
      state.rows.set(`${data.provider}/${data.modelId}`, row)
      return row
    }),
    update: vi.fn(async ({ where, data }: any) => {
      const entry = [...state.rows.entries()].find(([, row]) => row.id === where.id)
      if (!entry) throw new Error('missing row')
      const row = { ...entry[1], ...data }
      state.rows.set(entry[0], row)
      return row
    }),
    findMany: vi.fn(async ({ where }: any = {}) => [...state.rows.values()].filter((row) => !where?.provider || row.provider === where.provider)),
  },
  aiProvider: {
    findUnique: vi.fn(async () => null),
    update: vi.fn(async () => ({})),
  },
}))

vi.mock('@amarktai/db', () => ({ prisma }))

const { upsertCanonicalProviderDiscovery } = await import('../apps/api/src/lib/model-registry.ts')

function discovery(provider: ProviderKey, input: {
  modelId: string
  task: string
  capabilities: string[]
  category?: string
  modalitiesIn?: string[]
  modalitiesOut?: string[]
  transport?: string
  endpoint?: string
  streaming?: boolean
}): ProviderDiscoveryResult {
  const timestamp = '2026-07-18T12:00:00.000Z'
  return {
    provider,
    mode: 'live_model_list',
    source: 'live_endpoint',
    models: [{
      provider,
      executionProvider: provider,
      upstreamProvider: input.modelId.split('/')[0]!,
      modelId: input.modelId,
      displayName: input.modelId,
      discoverySource: 'live_endpoint',
      source: 'live_endpoint',
      docsKnown: false,
      liveDiscovered: true,
      category: input.category ?? input.task,
      providerCategory: input.task,
      rawProviderType: input.task,
      modalitiesIn: input.modalitiesIn ?? ['text'],
      modalitiesOut: input.modalitiesOut ?? ['text'],
      modalities: [...(input.modalitiesIn ?? ['text']), ...(input.modalitiesOut ?? ['text'])],
      inferredCapabilities: input.capabilities,
      contextWindow: 8192,
      maxOutputTokens: 2048,
      inputPrice: null,
      outputPrice: null,
      artifactOutput: false,
      artifactOutputKnown: true,
      artifactPersistenceExists: true,
      authRequired: true,
      providerCapabilityKnown: true,
      policyRestrictedByApp: false,
      policyBlockedReason: '',
      transportProfile: input.transport ?? 'openai_chat_sse',
      endpointFamily: input.endpoint ?? `${provider}_openai_v1/openai_chat`,
      streamingSupported: input.streaming ?? false,
      toolCallingSupported: false,
      functionCallingSupported: false,
      batchSupported: false,
      webhookSupported: false,
      endpointSource: 'authenticated_provider_api',
      endpointShapeKnown: true,
      requestShapeKnown: true,
      responseShapeKnown: true,
      providerClientExists: true,
      workerExecutorExists: true,
      executableNow: false,
      executableBlockers: [],
      catalogueOnlyReason: '',
      blockedReason: '',
      lastDiscoveredAt: timestamp,
      rawMetadata: { structuredOutputModes: ['none'] },
    } as any],
    totalDiscovered: 1,
    liveDiscoveryAttempted: true,
    liveDiscoverySucceeded: true,
    liveDiscoverySkipped: false,
    endpointSource: 'authenticated_provider_api',
    error: null,
    providerUniverseKnown: true,
    authenticatedUniverseKnown: true,
    discoveredAt: timestamp,
    notes: ['authenticated discovery'],
  } as ProviderDiscoveryResult
}

function readyProvider(providerKey: ProviderKey) {
  return { providerKey, enabled: true, healthStatus: 'live', apiKey: 'v1:encrypted-at-rest', baseUrl: '' }
}

describe('canonical live route activation', () => {
  beforeEach(() => {
    state.rows.clear()
    state.id = 1
    vi.clearAllMocks()
  })

  it.each([
    ['together', 'meta-llama/Llama-3-Instruct'],
    ['deepinfra', 'meta-llama/Meta-Llama-3-Instruct'],
  ] as const)('persists authenticated %s discovery in the canonical registry', async (provider, modelId) => {
    await upsertCanonicalProviderDiscovery(discovery(provider, {
      modelId, task: 'text-generation', capabilities: ['chat', 'streaming_chat'], streaming: true,
    }))
    const row = state.rows.get(`${provider}/${modelId}`)!
    expect(row).toMatchObject({ isLiveDiscovered: true, source: 'live_endpoint', discoveredAt: new Date('2026-07-18T12:00:00.000Z') })
    expect(JSON.parse(String(row.rawMetadata)).compatibility).toMatchObject({ requestShapeKnown: true, responseShapeKnown: true })
  })

  it('prevents authenticated discovery and runtime summary from disagreeing', async () => {
    await upsertCanonicalProviderDiscovery(discovery('together', {
      modelId: 'provider/new-chat', task: 'text-generation', capabilities: ['chat'], streaming: true,
    }))
    const models = normalizeDbModelRecords([...state.rows.values()] as any)
    const truth = getRuntimeTruth({ models })
    expect(truth.metrics.discoveredModelCount).toBe(1)
    expect(truth.metrics.liveDiscoveredModelCount).toBe(1)
    expect(truth.providers.find((item) => item.provider === 'together')?.discoveredModelCount).toBe(1)
  })

  it('inherits verified OpenAI request and response contracts for general text routes', async () => {
    await upsertCanonicalProviderDiscovery(discovery('together', {
      modelId: 'provider/new-chat', task: 'text-generation', capabilities: ['chat', 'streaming_chat'], streaming: true,
    }))
    const row = state.rows.get('together/provider/new-chat')!
    const candidates = normalizeDbCandidates([row as any], [readyProvider('together')], 'chat', { databaseReady: true, queueReady: true })
    expect(candidates[0]).toMatchObject({ requestShapeKnown: true, responseShapeKnown: true, modelCompatible: true, infrastructureReady: true, executionReady: true })
    expect(evaluateOrchestra({ capability: 'chat', executionProfile: 'internal_dashboard' }, candidates).executionAllowed).toBe(true)
  })

  it('activates compatible streaming models through the distinct stream executor', async () => {
    await upsertCanonicalProviderDiscovery(discovery('deepinfra', {
      modelId: 'provider/streaming-chat', task: 'text-generation', capabilities: ['streaming_chat'], streaming: true,
    }))
    const candidate = normalizeDbCandidates([...state.rows.values()] as any, [readyProvider('deepinfra')], 'streaming_chat', { databaseReady: true, queueReady: true })[0]!
    expect(candidate).toMatchObject({ executorId: 'deepinfra.streaming-chat', modelCompatible: true, executionReady: true })
  })

  it('does not confuse stored credential readiness with host environment keys', async () => {
    delete process.env.TOGETHER_API_KEY
    await upsertCanonicalProviderDiscovery(discovery('together', {
      modelId: 'provider/chat', task: 'text-generation', capabilities: ['chat'],
    }))
    const candidate = normalizeDbCandidates([...state.rows.values()] as any, [readyProvider('together')], 'chat', { databaseReady: true, queueReady: true })[0]!
    expect(candidate.providerConfigured).toBe(true)
    expect(candidate.infrastructureReady).toBe(true)
  })

  it('blocks invalid modality routes without misreporting infrastructure', async () => {
    const row = {
      provider: 'together', modelId: 'provider/text-only', displayName: 'Text only', capabilitiesJson: '["image_generation"]',
      rawMetadata: JSON.stringify({ compatibility: { taskType: 'text-generation', category: 'text', capabilities: ['image_generation'], modalitiesIn: ['text'], modalitiesOut: ['text'], transportProfile: 'openai_chat_sse', endpointFamily: 'together_openai_v1/openai_chat', endpointShapeKnown: true, requestShapeKnown: true, responseShapeKnown: true, providerClientExists: true, workerExecutorExists: true } }),
      status: 'available', enabled: true,
    }
    const candidate = normalizeDbCandidates([row], [readyProvider('together')], 'image_generation', { databaseReady: true, queueReady: true })[0]!
    expect(candidate.infrastructureReady).toBe(true)
    expect(candidate.modelCompatible).toBe(false)
    expect(evaluateOrchestra({ capability: 'image_generation', executionProfile: 'internal_dashboard' }, [candidate]).blockersRejected[0]?.blockers).toContain('executor_model_incompatible')
  })

  it('activates only verified DeepInfra specialist task transports', async () => {
    await upsertCanonicalProviderDiscovery(discovery('deepinfra', {
      modelId: 'provider/zero-shot', task: 'zero-shot-classification', capabilities: ['zero_shot_classification'],
      modalitiesOut: ['json'], transport: 'native_inference_json', endpoint: 'deepinfra_native_v1/native_inference',
    }))
    const candidate = normalizeDbCandidates([...state.rows.values()] as any, [readyProvider('deepinfra')], 'zero_shot_classification', { databaseReady: true, queueReady: true })[0]!
    expect(candidate).toMatchObject({ executorId: 'deepinfra.task-inference', modelCompatible: true })
    expect(normalizeDbCandidates([...state.rows.values()] as any, [readyProvider('deepinfra')], 'object_detection', { databaseReady: true, queueReady: true })).toHaveLength(0)
  })

  it('routes Together image models only through the compatible image executor', async () => {
    await upsertCanonicalProviderDiscovery(discovery('together', {
      modelId: 'provider/image-model', task: 'text-to-image', category: 'image', capabilities: ['image_generation'],
      modalitiesOut: ['image'], transport: 'native_inference_json', endpoint: 'image_generation',
    }))
    const rows = [...state.rows.values()] as any
    expect(normalizeDbCandidates(rows, [readyProvider('together')], 'image_generation', { databaseReady: true, queueReady: true })[0]).toMatchObject({ executorId: 'together.image-generation', modelCompatible: true })
    expect(normalizeDbCandidates(rows, [readyProvider('together')], 'chat', { databaseReady: true, queueReady: true })).toHaveLength(0)
  })

  it('keeps live proof chaining on persisted authorised artifacts', () => {
    const proof = readFileSync('scripts/proof-direct-provider-capabilities.mjs', 'utf8')
    expect(proof).toContain('sourceImageArtifactId: imageArtifactId')
    expect(proof).toContain('sourceVideoArtifactId: videoArtifactId')
    expect(proof).toContain('upstream_dependency_failed:image_generation_artifact_unavailable')
    expect(proof).toContain('stt did not preserve same-run TTS provenance')
  })

  it('permanently guards build metadata, browser preflight, and artifact snapshots', () => {
    const deploy = readFileSync('deploy/deploy.sh', 'utf8')
    expect(deploy.indexOf('export GIT_SHA="$DEPLOY_SHA"')).toBeLessThan(deploy.indexOf('bash "$REPO_DIR/deploy/preflight.sh"'))
    expect(deploy.indexOf('playwright_preflight')).toBeLessThan(deploy.indexOf('BACKUP_FILE='))
    expect(deploy).toContain('npx playwright install chromium')
    expect(deploy).toContain('type=volume,src=$ARTIFACT_VOLUME_NAME,dst=/source,readonly')
    expect(deploy).toContain('resume_paused_application')
    expect(deploy).toContain('rm -f -- "$ARTIFACT_BACKUP_INCOMPLETE"')
    expect(deploy).not.toContain('docker compose exec -T api tar -C /var/www/amarktai/storage')
  })
})
