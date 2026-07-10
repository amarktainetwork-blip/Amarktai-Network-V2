import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest'
import { execFileSync } from 'child_process'
import fs from 'fs'
import path from 'path'
import {
  PROVIDER_KEYS,
  DISCOVERED_PROVIDER_MODELS,
  MODEL_CATALOGUE,
  buildCapabilityReadiness,
  getMusicCapabilityStatus,
  routeBrain,
} from '../packages/core/src/index.ts'
import {
  discoverGenXProviderModels,
  discoverGroqProviderModels,
  discoverMimoProviderModels,
} from '../packages/providers/src/index.ts'

const ROOT = process.cwd()

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
    expect(packageJson.scripts['discover:models']).toBe('node scripts/discover-provider-models.mjs')
    expect(packageJson.scripts['discover:models:live']).toBe('node scripts/discover-provider-models.mjs --live')
  })

  it('default discovery mode makes no live calls and writes reports', () => {
    const output = execFileSync(process.execPath, ['scripts/discover-provider-models.mjs'], { cwd: ROOT, encoding: 'utf-8' })
    expect(output).toContain('Mode: safe_static')
    const report = JSON.parse(fs.readFileSync(path.join(ROOT, 'BUILD_MODEL_DISCOVERY_REPORT.json'), 'utf-8'))
    expect(report.liveDiscoveryAttempted).toBe(false)
    expect(report.mode).toBe('safe_static')
    expect(report.approvedProviders).toEqual(['genx', 'groq', 'together', 'mimo', 'deepinfra'])
  })

  it('live discovery mode is explicit and safe when keys are missing', () => {
    const reportSource = fs.readFileSync(path.join(ROOT, 'scripts/discover-provider-models.mjs'), 'utf-8')
    expect(reportSource).toContain("process.argv.includes('--live')")
    expect(reportSource).toContain('/openai/v1/models')
    expect(reportSource).toContain('/v1/models')
    expect(reportSource).toContain('/api/v1/models')
    expect(reportSource).not.toContain('/api/v1/generate')
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

  it('GenX discovery checks for Lyria-like music models without assuming execution', async () => {
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
    expect(lyria.providerClientExists).toBe(false)
    expect(lyria.workerExecutorExists).toBe(false)
    expect(lyria.executableNow).toBe(false)
  })

  it('MiMo remains coding_tools_only and never executable', async () => {
    const result = await discoverMimoProviderModels({ live: true, apiKey: 'ignored' })
    expect(result.models).toHaveLength(1)
    expect(result.models[0].blockedReason).toContain('coding_tools_only')
    expect(result.models[0].executableNow).toBe(false)
  })

  it('discovered model does not automatically become executable', () => {
    const catalogueOnly = DISCOVERED_PROVIDER_MODELS.filter((model) => !model.executableNow)
    expect(catalogueOnly.length).toBeGreaterThan(0)
    for (const model of catalogueOnly) {
      expect(model.blockedReason).toBeTruthy()
    }
  })

  it('Brain Router separates executable candidates from catalogue-only candidates', () => {
    const image = routeBrain({ capability: 'image_generation', routingMode: 'balanced' })
    expect(image.executionAllowed).toBe(true)
    expect(image.executableCandidates.length).toBeGreaterThan(0)
    expect(Array.isArray(image.catalogueOnlyCandidates)).toBe(true)
    expect(Array.isArray(image.discoveredCandidates)).toBe(true)

    const music = routeBrain({ capability: 'music_generation', routingMode: 'balanced' })
    expect(music.executionAllowed).toBe(false)
    expect(music.catalogueOnlyCandidates.some((model) => model.capabilities.includes('music_generation'))).toBe(true)
    expect(music.missingExecutorCandidates.some((candidate) => candidate.modelId.includes('music'))).toBe(true)
    expect(music.providerClientMissingCandidates.some((candidate) => candidate.modelId.includes('music'))).toBe(true)
  })

  it('capability readiness keeps model discovery separate from execution readiness', () => {
    const readiness = buildCapabilityReadiness(DISCOVERED_PROVIDER_MODELS)
    const music = readiness.find((item) => item.capability === 'music_generation')
    expect(music.modelDiscovered).toBe(true)
    expect(music.executableNow).toBe(false)
  })

  it('musicGenerationReady remains false unless client, worker, and artifact path are wired', () => {
    const status = getMusicCapabilityStatus()
    expect(status.discoveredMusicModels).toBeGreaterThan(0)
    expect(status.musicGenerationReady).toBe(false)
    expect(status.executableNow).toBe(false)
    expect(status.providerClientExists).toBe(false)
    expect(status.workerExecutorExists).toBe(false)
  })

  it('admin API and dashboard expose discovery counts and blockers', () => {
    const apiSource = fs.readFileSync(path.join(ROOT, 'apps/api/src/routes/admin-model-discovery.ts'), 'utf-8')
    expect(apiSource).toContain('/api/admin/models/discovery/status')
    expect(apiSource).toContain('/api/admin/models/discovery/run')
    expect(apiSource).toContain('/api/admin/models/catalogue')
    expect(apiSource).toContain('/api/admin/models/capabilities')
    expect(apiSource).toContain('/api/admin/providers/:provider/models')

    const dashboard = fs.readFileSync(path.join(ROOT, 'app/dashboard/capability-lab/page.js'), 'utf-8')
    expect(dashboard).toContain('Provider has model is not the same as AmarktAI can execute capability')
    expect(dashboard).toContain('Catalogue-only')
    expect(dashboard).toContain('Missing')
  })

  it('app-facing flows still expose no provider/model selectors', () => {
    const jobsRoute = fs.readFileSync(path.join(ROOT, 'apps/api/src/routes/jobs.ts'), 'utf-8')
    expect(jobsRoute).toContain('Block provider/model overrides')
    const studio = fs.readFileSync(path.join(ROOT, 'app/dashboard/studio/page.jsx'), 'utf-8')
    expect(studio).not.toContain('selectedProvider')
    expect(studio).not.toContain('selectedModel')
  })

  it('adult remains on hold', () => {
    const adult = routeBrain({ capability: 'adult_text', routingMode: 'balanced' })
    expect(adult.executionAllowed).toBe(false)
    expect(adult.blockReason).toContain('adult_text')
  })

  it('no fake music execution or worker executor was added', () => {
    const worker = fs.readFileSync(path.join(ROOT, 'apps/worker/src/providers/provider-executor.ts'), 'utf-8')
    expect(worker).not.toContain('executeMusicGeneration')
    expect(worker).not.toContain('musicGeneration')
  })
})
