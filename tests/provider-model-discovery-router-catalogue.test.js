import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest'
import { execFileSync } from 'child_process'
import fs from 'fs'
import os from 'os'
import path from 'path'
import {
  PROVIDER_KEYS,
  DISCOVERED_PROVIDER_MODELS,
  MODEL_CATALOGUE,
  buildCapabilityReadiness,
  getExecutorRegistrations,
  getRuntimeTruth,
  getMusicCapabilityStatus,
} from '../packages/core/src/index.ts'
import {
  discoverGenXProviderModels,
  discoverGroqProviderModels,
  discoverDeepInfraProviderModels,
  discoverMimoProviderModels,
  discoverTogetherProviderModels,
} from '../packages/providers/src/index.ts'

const ROOT = process.cwd()
const DISCOVERY_TEST_ENV = { ...process.env, AMARKTAI_DISCOVERY_TEST: '1' }
const EXPECTED_GENX_DOCS_FALLBACK_MODELS = [
  'gpt-image-2',
  'gpt-5',
  'gpt-5-mini',
  'gpt-5-nano',
  'gpt-5.3-codex',
  'gpt-5.4',
  'gpt-5.4-mini',
  'gpt-5.4-pro',
  'gpt-5.5',
  'gpt-5.6-luna',
  'gpt-5.6-sol',
  'gpt-5.6-terra',
  'claude-haiku-4-5',
  'claude-opus-4-6',
  'claude-opus-4-7',
  'claude-opus-4-8',
  'claude-sonnet-4-6',
  'claude-sonnet-5',
  'gemini-3-flash',
  'gemini-3.1-flash-lite',
  'gemini-3.1-pro',
  'lyria-3-clip-preview',
  'lyria-3-pro-preview',
  'nano-banana-2',
  'nano-banana-pro',
  'veo-3.1',
  'veo-3.1-fast',
  'grok-4.2',
  'grok-4.2-multi-agent',
  'grok-4.2-reasoning',
  'grok-4.3',
  'grok-4.5',
  'grok-imagine',
  'grok-imagine-video',
  'grok-tts',
  'recraft-v4.1',
  'recraft-v4.1-pro',
  'recraft-v4.1-pro-vector',
  'recraft-v4.1-utility',
  'recraft-v4.1-utility-pro',
  'recraft-v4.1-utility-pro-vector',
  'recraft-v4.1-utility-vector',
  'recraft-v4.1-vector',
  'kling-avatar-v2-pro',
  'kling-v2.5-turbo',
  'kling-v2.5-turbo-i2v',
  'kling-v2.6-pro',
  'kling-v2.6-pro-i2v',
  'kling-v3-pro',
  'kling-v3-pro-i2v',
  'seedance-2',
  'seedance-2-i2v',
  'seedance-2-r2v',
  'seedance-v1-fast',
  'seedance-v1-fast-i2v',
  'pixverse-v5.5',
  'pixverse-v5.5-i2v',
  'pixverse-v6',
  'pixverse-v6-i2v',
  'aura-2',
  'genxlm-pro-v1-img',
  'genxlm-pro-v1-img-fast',
  'genxlm-pro-v1-tl',
  'genxlm-pro-v1-tr',
  'genxlm-voice-v1',
]

function createDiscoveryOutputRoot() {
  const outputRoot = fs.mkdtempSync(path.join(os.tmpdir(), 'amarktai-discovery-'))
  fs.mkdirSync(path.join(outputRoot, 'packages/core/src/generated'), { recursive: true })
  return outputRoot
}

function runDiscovery(args = [], env = DISCOVERY_TEST_ENV, outputRoot = createDiscoveryOutputRoot()) {
  const output = execFileSync(process.execPath, ['scripts/discover-provider-models.mjs', ...args], {
    cwd: ROOT,
    env: { ...env, AMARKTAI_DISCOVERY_OUTPUT_ROOT: outputRoot },
    encoding: 'utf-8',
  })
  return {
    outputRoot,
    output,
    report: JSON.parse(fs.readFileSync(path.join(outputRoot, 'BUILD_MODEL_DISCOVERY_REPORT.json'), 'utf-8')),
    catalogue: JSON.parse(fs.readFileSync(path.join(outputRoot, 'MODEL_CATALOGUE_DISCOVERED.json'), 'utf-8')),
  }
}

function fileHash(filePath) {
  return fs.readFileSync(filePath, 'utf8')
}

describe('provider model discovery and router catalogue rebuild', () => {
  const originalFetch = global.fetch

  beforeEach(() => {
    vi.restoreAllMocks()
  })

  afterEach(() => {
    global.fetch = originalFetch
  })

  it('approved providers remain exactly the final five', () => {
    expect([...PROVIDER_KEYS]).toEqual(['genx', 'groq', 'together', 'mimo', 'deepinfra'])
  })

  it('does not add banned providers', () => {
    const banned = ['openai', 'anthropic', 'huggingface', 'gemini', 'replicate', 'heygen', 'minimax', 'qwen', 'litellm']
    for (const provider of banned) {
      expect(PROVIDER_KEYS).not.toContain(provider)
      expect(MODEL_CATALOGUE.map((model) => model.provider)).not.toContain(provider)
    }
  })

  it('core discovery types and generated layer exist', () => {
    expect(fs.existsSync(path.join(ROOT, 'packages/core/src/provider-model-discovery.ts'))).toBe(true)
    expect(fs.existsSync(path.join(ROOT, 'packages/core/src/generated/provider-model-catalogue.generated.json'))).toBe(true)
    expect(Array.isArray(DISCOVERED_PROVIDER_MODELS)).toBe(true)
    expect(DISCOVERED_PROVIDER_MODELS.length).toBeGreaterThan(0)
  })

  it('provider discovery adapter modules exist for every approved provider', () => {
    for (const provider of PROVIDER_KEYS) {
      expect(fs.existsSync(path.join(ROOT, `packages/providers/src/model-discovery/${provider}.ts`))).toBe(true)
    }
  })

  it('package scripts expose safe and live discovery modes', () => {
    const packageJson = JSON.parse(fs.readFileSync(path.join(ROOT, 'package.json'), 'utf-8'))
    expect(packageJson.scripts['discover:models']).toBe('tsx scripts/discover-provider-models.mjs')
    expect(packageJson.scripts['discover:models:live']).toBe('tsx scripts/discover-provider-models.mjs --live')
    expect(packageJson.scripts['discover:models:live:strict']).toBe('tsx scripts/discover-provider-models.mjs --live --strict')
  })

  it('default discovery mode makes no live calls and writes reports', () => {
    const { output, report } = runDiscovery()
    expect(output).toContain('Mode: safe_static')
    expect(report.liveDiscoveryAttempted).toBe(false)
    expect(report.mode).toBe('safe_static')
    expect(report.approvedProviders).toEqual(['genx', 'groq', 'together', 'mimo', 'deepinfra'])
    expect(report.runtimeExecutableProviders).toEqual(['genx', 'together', 'deepinfra'])
    expect(report.totalEffectiveCatalogueModels).toBeGreaterThanOrEqual(93)
    expect(report.deepinfraPublicDiscoveryAttempted).toBe(false)
    expect(report.deepinfraPublicDiscoverySucceeded).toBe(false)
    expect(report.totalPublicEndpointModels).toBe(0)
    expect(report.modelsExecutableNow).toBe(0)
    expect(report.modelsKnownButBlocked).toBe(report.totalEffectiveCatalogueModels - report.modelsExecutableNow)
    expect(report.countsByProvider.genx).toBe(65)
    expect(report.togetherDocsFallbackComplete).toBe(false)
    expect(report.togetherProviderUniverseKnown).toBe(false)
    expect(report.togetherProviderUniversePartiallyKnown).toBe(true)
    expect(report.genxMusicCapabilityKnown).toBe(true)
    expect(report.genxMusicExecutionReady).toBe(false)
    expect(report.mimoPolicyRestricted).toBe(true)
  }, 30000)

  it('GenX docs fallback contains the expected user-supplied model IDs once', () => {
    const catalogue = JSON.parse(fs.readFileSync(path.join(ROOT, 'MODEL_CATALOGUE_DISCOVERED.json'), 'utf-8'))
    const genxModels = catalogue.filter((model) => model.provider === 'genx')
    expect(genxModels.length).toBeGreaterThanOrEqual(61)
    const docsModels = genxModels.filter((model) => !model.liveDiscovered)
    expect(docsModels).toHaveLength(65)
    expect([...new Set(docsModels.map((model) => model.modelId))].sort()).toEqual([...EXPECTED_GENX_DOCS_FALLBACK_MODELS].sort())
    for (const modelId of EXPECTED_GENX_DOCS_FALLBACK_MODELS) {
      expect(docsModels.filter((model) => model.modelId === modelId)).toHaveLength(1)
    }
    for (const model of docsModels) {
      expect(model).toMatchObject({
        provider: 'genx',
        executionProvider: 'genx',
        docsKnown: true,
        liveDiscovered: false,
        providerCapabilityKnown: true,
        endpointSource: 'GenX docs/static fallback /api/v1/models',
        authRequired: true,
      })
      expect(['docs_fallback', 'last_known_good']).toContain(model.discoverySource)
    }
    const liveModels = genxModels.filter((model) => model.liveDiscovered)
    for (const model of liveModels) {
      expect(model).toMatchObject({
        provider: 'genx',
        executionProvider: 'genx',
        liveDiscovered: true,
        discoverySource: 'live_endpoint',
      })
    }
  })

  it('live discovery mode is explicit and safe when keys are missing', () => {
    const reportSource = fs.readFileSync(path.join(ROOT, 'scripts/discover-provider-models.mjs'), 'utf-8')
    expect(reportSource).toContain("process.argv.includes('--live')")
    expect(reportSource).toContain("process.argv.includes('--strict')")
    expect(reportSource).toContain('/openai/v1/models')
    expect(reportSource).toContain('/api/v1/models')
    expect(reportSource).toContain('https://api.together.ai/models')
    expect(reportSource).toContain('https://api.deepinfra.com/models/list')
    expect(reportSource).not.toMatch(/fetchModelList\([^)]*generate/)
    expect(reportSource).not.toContain('MIMO_API_KEY')
  })

  it('strict live discovery fails when required runtime keys are missing but does not require MiMo', () => {
    const env = { ...process.env }
    delete env.GENX_API_KEY
    delete env.GROQ_API_KEY
    delete env.TOGETHER_API_KEY
    delete env.DEEPINFRA_API_KEY
    delete env.MIMO_API_KEY
    const outputRoot = createDiscoveryOutputRoot()
    expect(() => execFileSync(process.execPath, ['scripts/discover-provider-models.mjs', '--live', '--strict'], { cwd: ROOT, env: { ...env, AMARKTAI_DISCOVERY_TEST: '1', AMARKTAI_DISCOVERY_OUTPUT_ROOT: outputRoot }, encoding: 'utf-8' })).toThrow()
    const source = fs.readFileSync(path.join(ROOT, 'scripts/discover-provider-models.mjs'), 'utf-8')
    expect(source).toContain('const RUNTIME_PROVIDERS = [...RUNTIME_EXECUTION_PROVIDERS]')
  }, 30000)

  it('default live mode soft-skips missing runtime keys', () => {
    const env = { ...process.env }
    delete env.GENX_API_KEY
    delete env.GROQ_API_KEY
    delete env.TOGETHER_API_KEY
    delete env.DEEPINFRA_API_KEY
    const { output, report } = runDiscovery(['--live'], { ...env, AMARKTAI_DISCOVERY_TEST: '1' })
    expect(output).toContain('Live discovery is partial')
    expect(report.liveDiscoveryPartial).toBe(true)
    expect(report.providersSkipped).toEqual(expect.arrayContaining(['genx', 'groq', 'together']))
  }, 30000)

  it('discovery tests write only temporary output files, not committed catalogues', () => {
    const files = [
      path.join(ROOT, 'BUILD_MODEL_DISCOVERY_REPORT.json'),
      path.join(ROOT, 'MODEL_CATALOGUE_DISCOVERED.json'),
      path.join(ROOT, 'packages/core/src/generated/provider-model-catalogue.generated.json'),
    ]
    const before = Object.fromEntries(files.map((file) => [file, fileHash(file)]))
    runDiscovery()
    const after = Object.fromEntries(files.map((file) => [file, fileHash(file)]))
    expect(after).toEqual(before)
  }, 30000)

  it('skipped discovery preserves previous last-known-good provider inventory', () => {
    const outputRoot = createDiscoveryOutputRoot()
    const previousDeepInfraModel = {
      provider: 'deepinfra',
      executionProvider: 'deepinfra',
      upstreamProvider: 'deepinfra',
      modelId: 'deepinfra/previous-only-model',
      displayName: 'Previous Only Model',
      rawProviderType: 'text',
      category: 'text',
      providerCategory: 'text',
      source: 'live_endpoint',
      discoverySource: 'live_endpoint',
      docsKnown: false,
      liveDiscovered: true,
      liveDiscoverySkipped: false,
      lastDiscoveredAt: '2026-01-01T00:00:00.000Z',
      endpointSource: 'previous live discovery',
      endpointFamily: 'previous live discovery',
      inferredCapabilities: ['chat'],
      capabilities: ['chat'],
      modalities: ['text'],
      modalitiesIn: ['text'],
      modalitiesOut: ['text'],
      artifactOutput: false,
      artifactOutputKnown: false,
      artifactPersistenceExists: true,
      authRequired: false,
      providerCapabilityKnown: true,
      policyRestrictedByApp: false,
      policyBlockedReason: '',
      endpointShapeKnown: true,
      requestShapeKnown: true,
      responseShapeKnown: true,
      providerClientExists: false,
      workerExecutorExists: false,
      transportProfile: 'openai_chat_sse',
      executable: false,
      executableNow: false,
      executableBlockers: ['provider_client_missing', 'worker_executor_missing'],
      catalogueOnlyReason: 'provider_client_missing, worker_executor_missing',
      blockedReason: 'provider_client_missing, worker_executor_missing',
    }
    const generatedPath = path.join(outputRoot, 'packages/core/src/generated/provider-model-catalogue.generated.json')
    fs.writeFileSync(generatedPath, `${JSON.stringify([previousDeepInfraModel], null, 2)}\n`)

    const { report, catalogue } = runDiscovery([], DISCOVERY_TEST_ENV, outputRoot)
    const preserved = catalogue.find((model) => model.provider === 'deepinfra' && model.modelId === 'deepinfra/previous-only-model')

    expect(preserved).toMatchObject({
      source: 'last_known_good',
      discoverySource: 'last_known_good',
      lastDiscoverySkipReason: 'safe_static_test_mode',
    })
    expect(report.countsByProvider.deepinfra).toBeGreaterThan(10)
    expect(report.totalEffectiveCatalogueModels).toBe(catalogue.length)
  }, 30000)

  it('Together live discovery maps every returned model type without assuming execution', async () => {
    const calls = []
    global.fetch = vi.fn(async (url, init) => {
      calls.push({ url: String(url), headers: init?.headers })
      return {
        ok: true,
        json: async () => ([
          { id: 'meta-llama/chat', type: 'chat', display_name: 'Chat', organization: 'together', context_length: 8192, pricing: { input: 1 } },
          { id: 'together/language', type: 'language', display_name: 'Language' },
          { id: 'together/code', type: 'code', display_name: 'Code' },
          { id: 'black-forest-labs/FLUX.1-schnell', type: 'image', display_name: 'Flux Schnell' },
          { id: 'together/embed', type: 'embedding', display_name: 'Embedding' },
          { id: 'together/moderation', type: 'moderation', display_name: 'Moderation' },
          { id: 'together/reranker', type: 'rerank', display_name: 'Rerank' },
          { id: 'together/video', type: 'video', display_name: 'Video' },
          { id: 'together/audio-speech', type: 'audio', display_name: 'Speech' },
        ]),
      }
    })

    const result = await discoverTogetherProviderModels({ live: true, apiKey: 'test-key', now: '2026-01-01T00:00:00.000Z' })
    expect(calls).toHaveLength(1)
    expect(calls[0].url).toBe('https://api.together.ai/models')
    expect(calls[0].headers.Authorization).toBe('Bearer test-key')
    expect(result.models).toHaveLength(9)
    expect(result.models.find((model) => model.modelId === 'meta-llama/chat').inferredCapabilities).toEqual(expect.arrayContaining(['chat', 'reasoning', 'summarization', 'classification', 'extraction']))
    expect(result.models.find((model) => model.modelId === 'together/code').inferredCapabilities).toEqual(['code'])
    expect(result.models.find((model) => model.modelId === 'black-forest-labs/FLUX.1-schnell').executableNow).toBe(false)
    expect(result.models.find((model) => model.modelId === 'together/video').executableNow).toBe(false)
    expect(result.models.find((model) => model.modelId === 'together/audio-speech').inferredCapabilities).toEqual(['tts'])
    expect(result.models.flatMap((model) => model.inferredCapabilities)).not.toContain('music_generation')
    expect(JSON.stringify(result.models)).not.toContain('test-key')
  })

  it('Together static report represents video/audio docs support without full-universe claims', () => {
    const report = JSON.parse(fs.readFileSync(path.join(ROOT, 'BUILD_MODEL_DISCOVERY_REPORT.json'), 'utf-8'))
    const catalogue = JSON.parse(fs.readFileSync(path.join(ROOT, 'MODEL_CATALOGUE_DISCOVERED.json'), 'utf-8'))
    expect(report.togetherDocsFallbackComplete).toBe(false)
    expect(report.togetherProviderUniverseKnown).toBe(false)
    expect(report.togetherProviderUniversePartiallyKnown).toBe(true)
    expect(report.togetherCapabilitiesCovered).toEqual(expect.arrayContaining(['image_generation', 'embeddings', 'reranking', 'classification', 'stt', 'tts', 'video_generation']))
    expect(catalogue).toContainEqual(expect.objectContaining({ provider: 'together', modelId: 'together-video-async', executableNow: false }))
    expect(catalogue).toContainEqual(expect.objectContaining({ provider: 'together', modelId: 'together-tts-streaming', executableNow: false }))
  })

  it('DeepInfra safe discovery uses the public model list without requiring a key', async () => {
    const calls = []
    global.fetch = vi.fn(async (url, init) => {
      calls.push({ url: String(url), headers: init?.headers })
      return {
        ok: true,
        json: async () => ([
          { model_name: 'deepinfra/text', reported_type: 'text-generation', tags: ['llama'], max_tokens: 8192 },
          { model_name: 'deepinfra/embed', reported_type: 'embeddings', tags: ['embedding'] },
          { model_name: 'deepinfra/rerank', reported_type: 'rerank', tags: ['rerank'] },
          { model_name: 'deepinfra/image', reported_type: 'text-to-image', tags: ['image-generation'] },
          { model_name: 'deepinfra/voice', reported_type: 'text-to-speech', tags: ['tts'] },
          { model_name: 'deepinfra/video', reported_type: 'text-to-video', tags: ['video-generation'] },
          { model_name: 'deepinfra/music', reported_type: 'text-to-music', tags: ['musicgen'] },
        ]),
      }
    })

    const result = await discoverDeepInfraProviderModels({ now: '2026-01-01T00:00:00.000Z' })
    expect(calls).toHaveLength(1)
    expect(calls[0].url).toBe('https://api.deepinfra.com/models/list')
    expect(calls[0].headers.Authorization).toBeUndefined()
    expect(result.publicDiscoveryAttempted).toBe(true)
    expect(result.publicDiscoverySucceeded).toBe(true)
    expect(result.apiKeyPresent).toBe(false)
    expect(result.models.length).toBeGreaterThanOrEqual(7)
    expect(result.models.find((model) => model.modelId === 'deepinfra/text').inferredCapabilities).toContain('chat')
    expect(result.models.find((model) => model.modelId === 'deepinfra/embed').inferredCapabilities).toContain('embeddings')
    expect(result.models.find((model) => model.modelId === 'deepinfra/rerank').inferredCapabilities).toContain('reranking')
    expect(result.models.find((model) => model.modelId === 'deepinfra/image').inferredCapabilities).toContain('image_generation')
    expect(result.models.find((model) => model.modelId === 'deepinfra/voice').inferredCapabilities).toContain('tts')
    expect(result.models.find((model) => model.modelId === 'deepinfra/video').inferredCapabilities).toContain('video_generation')
    expect(result.models.find((model) => model.modelId === 'deepinfra/music').inferredCapabilities).toContain('music_generation')
    expect(result.models.filter((model) => model.modelId.startsWith('deepinfra/')).every((model) => !model.executableNow)).toBe(true)
  })

  it('DeepInfra live mode succeeds through public discovery and fails honestly when the public endpoint fails', async () => {
    global.fetch = vi.fn(async () => ({
      ok: true,
      json: async () => ([{ model_name: 'deepinfra/text', reported_type: 'text-generation', tags: ['llama'] }]),
    }))
    const live = await discoverDeepInfraProviderModels({ live: true, now: '2026-01-01T00:00:00.000Z' })
    expect(live.liveDiscoveryAttempted).toBe(true)
    expect(live.liveDiscoverySucceeded).toBe(true)
    expect(live.apiKeyPresent).toBe(false)

    global.fetch = vi.fn(async () => ({ ok: false, status: 503, json: async () => ({}) }))
    const failed = await discoverDeepInfraProviderModels({ live: true, now: '2026-01-01T00:00:00.000Z' })
    expect(failed.liveDiscoveryAttempted).toBe(true)
    expect(failed.liveDiscoverySucceeded).toBe(false)
    expect(failed.publicDiscoverySucceeded).toBe(false)
    expect(failed.error).toContain('503')
  })

  it('Groq live discovery uses the models endpoint only when live/key are present', async () => {
    const calls = []
    global.fetch = vi.fn(async (url) => {
      calls.push(String(url))
      return {
        ok: true,
        json: async () => ({ data: [{ id: 'llama-test-model', object: 'model' }] }),
      }
    })

    const safe = await discoverGroqProviderModels()
    expect(safe.liveDiscoverySkipped).toBe(true)
    expect(calls).toEqual([])

    const live = await discoverGroqProviderModels({ live: true, apiKey: 'test-key', now: '2026-01-01T00:00:00.000Z' })
    expect(live.liveDiscoveryAttempted).toBe(true)
    expect(calls).toEqual(['https://api.groq.com/openai/v1/models'])
    expect(live.models[0].modelId).toBe('llama-test-model')
  })

  it('GenX discovery reflects existing Lyria music client, worker, and artifact wiring', async () => {
    global.fetch = vi.fn(async () => ({
      ok: true,
      json: async () => ({
        models: [
          { id: 'lyria-3', category: 'music', name: 'Lyria 3' },
          { id: 'seedance-v1-fast', category: 'video', name: 'Seedance V1 Fast' },
        ],
      }),
    }))

    const result = await discoverGenXProviderModels({
      live: true,
      apiKey: 'test-key',
      baseUrl: 'https://query.genx.sh',
      now: '2026-01-01T00:00:00.000Z',
    })
    const lyria = result.models.find((model) => model.modelId === 'lyria-3')
    expect(lyria).toBeDefined()
    expect(lyria.inferredCapabilities).toContain('music_generation')
    expect(lyria.endpointShapeKnown).toBe(true)
    expect(lyria.requestShapeKnown).toBe(true)
    expect(lyria.responseShapeKnown).toBe(true)
    expect(lyria.providerClientExists).toBe(true)
    expect(lyria.workerExecutorExists).toBe(true)
    expect(lyria.artifactPersistenceExists).toBe(true)
    expect(lyria.executableNow).toBe(false)
  })

  it('MiMo remains coding_tools_only and never executable', async () => {
    const result = await discoverMimoProviderModels({ live: true, apiKey: 'ignored' })
    expect(result.models).toHaveLength(1)
    expect(result.models[0].blockedReason).toContain('coding_tools_only')
    expect(result.models[0].policyRestrictedByApp).toBe(true)
    expect(result.models[0].policyBlockedReason).toBe('coding_agent_only_not_backend_runtime')
    expect(result.models[0].executableNow).toBe(false)
  })

  it('docs fallback catalogue distinguishes GenX upstream providers from runtime providers', () => {
    const report = JSON.parse(fs.readFileSync(path.join(ROOT, 'BUILD_MODEL_DISCOVERY_REPORT.json'), 'utf-8'))
    const catalogue = JSON.parse(fs.readFileSync(path.join(ROOT, 'MODEL_CATALOGUE_DISCOVERED.json'), 'utf-8'))
    expect(report.runtimeExecutableProviders).toEqual(['genx', 'groq', 'together', 'deepinfra'])
    expect(catalogue.map((model) => model.provider)).not.toContain('openai')
    expect(catalogue.map((model) => model.provider)).not.toContain('google')
    expect(catalogue.map((model) => model.provider)).not.toContain('xai')
    expect(catalogue).toContainEqual(expect.objectContaining({
      provider: 'genx',
      executionProvider: 'genx',
      upstreamProvider: 'google',
      modelId: 'veo-3.1',
    }))
    expect(catalogue).toContainEqual(expect.objectContaining({
      provider: 'genx',
      executionProvider: 'genx',
      upstreamProvider: 'xai',
      modelId: 'grok-imagine-video',
    }))
    const directProviders = [...new Set(catalogue.map((model) => model.provider))]
    expect(directProviders.sort()).toEqual(['deepinfra', 'genx', 'groq', 'mimo', 'together'])
    expect(catalogue.filter((model) => model.provider === 'groq').some((model) => /grok/i.test(model.modelId))).toBe(false)
  })

  it('GenX docs fallback includes Lyria wiring without claiming runtime execution', () => {
    const report = JSON.parse(fs.readFileSync(path.join(ROOT, 'BUILD_MODEL_DISCOVERY_REPORT.json'), 'utf-8'))
    const catalogue = JSON.parse(fs.readFileSync(path.join(ROOT, 'MODEL_CATALOGUE_DISCOVERED.json'), 'utf-8'))
    const clip = catalogue.find((model) => model.provider === 'genx' && model.modelId === 'lyria-3-clip-preview')
    const pro = catalogue.find((model) => model.provider === 'genx' && model.modelId === 'lyria-3-pro-preview')
    expect(clip).toMatchObject({
      upstreamProvider: 'google',
      providerCapabilityKnown: true,
      docsKnown: true,
      requestShapeKnown: true,
      responseShapeKnown: true,
      providerClientExists: true,
      workerExecutorExists: true,
      artifactPersistenceExists: true,
      executableNow: false,
      transportProfile: 'async_job_poll',
    })
    expect(pro).toMatchObject({ upstreamProvider: 'google', executableNow: false })
    expect(report.genxMusicDiscovery.lyriaClipDiscovered).toBe(true)
    expect(report.genxMusicDiscovery.lyriaProDiscovered).toBe(true)
    expect(report.genxMusicDiscovery.genxMusicBlockers).toContain('execution_readiness_not_derived_from_discovery')
    expect(JSON.stringify(report)).not.toContain('provider_lacks_music')
  })

  it('discovered model does not automatically become executable', () => {
    const catalogueOnly = DISCOVERED_PROVIDER_MODELS.filter((model) => !model.executableNow)
    expect(catalogueOnly.length).toBeGreaterThan(0)
    for (const model of catalogueOnly) {
      expect(model.blockedReason).toBeTruthy()
    }
  })

  it('runtime truth separates catalogue models from registered and configured execution', () => {
    const baseline = getRuntimeTruth()
    const image = baseline.capabilities.find(item => item.capability === 'image_generation')
    const music = baseline.capabilities.find(item => item.capability === 'music_generation')
    expect(image.discoveredModelCount).toBeGreaterThan(0)
    expect(image.executorRegistered).toBe(true)
    expect(image.executableNow).toBe(false)
    expect(music.discoveredModelCount).toBeGreaterThan(0)
    expect(music.executorRegistered).toBe(true)
    expect(music.executableNow).toBe(false)

    const configuredMusic = getRuntimeTruth({
      providers: { genx: { enabled: true, configured: true } },
      capabilities: { music_generation: { infrastructureReady: true } },
    }).capabilities.find(item => item.capability === 'music_generation')
    expect(configuredMusic.executableNow).toBe(true)
    expect(getExecutorRegistrations('music_generation').map(entry => entry.provider)).toEqual(['genx'])
  })

  it('capability readiness keeps model discovery separate from execution readiness', () => {
    const readiness = buildCapabilityReadiness(DISCOVERED_PROVIDER_MODELS)
    const music = readiness.find((item) => item.capability === 'music_generation')
    expect(music.modelDiscovered).toBe(true)
    expect(music.executableNow).toBe(false)
  })

  it('musicGenerationReady remains false until canonical runtime gates are supplied', () => {
    const status = getMusicCapabilityStatus()
    expect(status.discoveredMusicModels).toBeGreaterThan(0)
    expect(status.genxMusicCapabilityKnown).toBe(true)
    expect(status.lyriaClipDiscovered).toBe(true)
    expect(status.lyriaProDiscovered).toBe(true)
    expect(status.musicGenerationReady).toBe(false)
    expect(status.executableNow).toBe(false)
    expect(status.providerClientExists).toBe(true)
    expect(status.workerExecutorExists).toBe(true)
  })

  it('admin API exposes discovery and the Capability Lab consumes canonical release readiness', () => {
    const apiSource = fs.readFileSync(path.join(ROOT, 'apps/api/src/routes/admin-model-discovery.ts'), 'utf-8')
    expect(apiSource).toContain('/api/admin/models/discovery/status')
    expect(apiSource).toContain('/api/admin/models/discovery/run')
    expect(apiSource).toContain('/api/admin/models/catalogue')
    expect(apiSource).toContain('/api/admin/models/capabilities')
    expect(apiSource).toContain('/api/admin/providers/:provider/models')

    const dashboard = fs.readFileSync(path.join(ROOT, 'app/dashboard/capability-lab/page.js'), 'utf-8')
    expect(dashboard).toContain('/api/admin/truth')
    expect(dashboard).toContain('releaseReadiness')
    expect(dashboard).toContain('readyForDashboardExecution')
    expect(dashboard).toContain('Orchestra owns routing')
  })

  it('app-facing flows still expose no provider/model selectors', () => {
    const jobsRoute = fs.readFileSync(path.join(ROOT, 'apps/api/src/routes/jobs.ts'), 'utf-8')
    expect(jobsRoute).toContain('Block provider/model overrides')
    const studio = fs.readFileSync(path.join(ROOT, 'app/dashboard/studio/page.jsx'), 'utf-8')
    expect(studio).not.toContain('selectedProvider')
    expect(studio).not.toContain('selectedModel')
  })

  it('adult remains on hold', () => {
    const adult = getRuntimeTruth().capabilities.find(item => item.capability === 'adult_text')
    expect(adult.classification).toBe('POLICY_RESTRICTED')
    expect(adult.executableNow).toBe(false)
  })

  it('no fake music execution or worker executor was added', () => {
    const worker = fs.readFileSync(path.join(ROOT, 'apps/worker/src/providers/provider-executor.ts'), 'utf-8')
    expect(worker).not.toContain('executeMusicGeneration')
    expect(worker).not.toContain('musicGeneration')
  })
})
