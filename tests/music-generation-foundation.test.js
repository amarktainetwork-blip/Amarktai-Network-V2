import { describe, it, expect, beforeAll, afterAll } from 'vitest'
import Fastify from 'fastify'
import { readFileSync, existsSync } from 'fs'
import {
  MODEL_CATALOGUE,
  PROVIDER_KEYS,
  createMusicGenerationPlan,
  getMusicCapabilityStatus,
  normalizeMusicPrompt,
  routeBrain,
  validateMusicGenerationRequest,
} from '../packages/core/src/index.ts'
import { adminMusicRoutes } from '../apps/api/src/routes/admin-music.ts'

const ROOT = process.cwd()

describe('Music generation backend foundation', () => {
  it('validates instrumental music requests without provider execution fields', () => {
    const parsed = validateMusicGenerationRequest({
      prompt: 'Original cinematic instrumental underscore for a product reveal',
      style: 'cinematic',
      durationSeconds: 45,
      instrumentalOnly: true,
      outputFormat: 'mp3',
    })

    expect(parsed.prompt).toContain('Original cinematic')
    expect(parsed.instrumentalOnly).toBe(true)
    expect(parsed.durationSeconds).toBe(45)
  })

  it('rejects lyrics and vocals when instrumentalOnly is true', () => {
    expect(() => validateMusicGenerationRequest({
      prompt: 'Original song',
      instrumentalOnly: true,
      lyrics: 'line one',
    })).toThrow(/Lyrics cannot be supplied/)

    expect(() => validateMusicGenerationRequest({
      prompt: 'Original song',
      instrumentalOnly: true,
      vocalsRequested: true,
    })).toThrow(/vocalsRequested cannot be true/)
  })

  it('blocks direct artist, song, voice, or copyrighted track cloning language', () => {
    const normalized = normalizeMusicPrompt('Clone a famous song exactly')
    expect(normalized.blocked).toBe(true)
    expect(normalized.blockedReason).toContain('cloning is not allowed')
  })

  it('transforms latest-song and artist-style wording into non-copying guidance', () => {
    const latest = normalizeMusicPrompt('Make the latest pop songs energy for a product bumper')
    expect(latest.blocked).toBe(false)
    expect(latest.transformed).toBe(true)
    expect(latest.prompt).toContain('contemporary radio-pop-inspired production')
    expect(latest.prompt).not.toMatch(/latest pop songs/i)

    const artistStyle = normalizeMusicPrompt('Make a track in the style of Taylor Swift')
    expect(artistStyle.blocked).toBe(false)
    expect(artistStyle.transformed).toBe(true)
    expect(artistStyle.prompt).toContain('original, non-copying style')
  })

  it('creates a planning result but keeps execution blocked', () => {
    const plan = createMusicGenerationPlan({
      prompt: 'Original ambient loop',
      style: 'ambient',
      durationSeconds: 30,
      instrumentalOnly: true,
      vocalsRequested: false,
      routingMode: 'balanced',
      safetyLevel: 'standard',
      outputFormat: 'mp3',
    })

    expect(plan.capability).toBe('music_generation')
    expect(plan.executionReady).toBe(false)
    expect(plan.blockedReason).toContain('GenX music capability is known')
    expect(plan.lyricsStatus).toBe('not_requested')
    expect(plan.vocalsStatus).toBe('not_requested')
  })

  it('marks vocals and lyrics as pending provider support, not ready', () => {
    const plan = createMusicGenerationPlan({
      prompt: 'Original pop track with a hook',
      style: 'pop',
      durationSeconds: 60,
      instrumentalOnly: false,
      vocalsRequested: true,
      lyrics: 'A short original chorus',
      routingMode: 'balanced',
      safetyLevel: 'standard',
      outputFormat: 'mp3',
    })

    expect(plan.executionReady).toBe(false)
    expect(plan.vocalsStatus).toBe('pending_provider_support')
    expect(plan.lyricsStatus).toBe('pending_provider_support')
  })

  it('reports honest capability status for foundation-only music', () => {
    const status = getMusicCapabilityStatus()
    expect(status.foundationReady).toBe(true)
    expect(status.schemaReady).toBe(true)
    expect(status.plannerReady).toBe(true)
    expect(status.providerClientExists).toBe(false)
    expect(status.workerExecutorExists).toBe(false)
    expect(status.artifactPersistenceReady).toBe(true)
    expect(status.dashboardReady).toBe(true)
    expect(status.instrumentalReady).toBe(true)
    expect(status.vocalsReady).toBe(false)
    expect(status.lyricsReady).toBe(false)
    expect(status.musicGenerationReady).toBe(false)
    expect(status.executionBlocked).toBe(true)
    expect(status.blockedReason).toContain('GenX music capability is known')
    expect(status.genxMusicCapabilityKnown).toBe(true)
    expect(status.lyriaClipDiscovered).toBe(true)
    expect(status.lyriaProDiscovered).toBe(true)
    expect(status.musicExecutorReady).toBe(false)
    expect(status.approvedProviderAudit).toHaveLength(5)
    expect(status.approvedProviderAudit.find((entry) => entry.provider === 'mimo')?.note).toContain('coding_tools_only')
  })

  it('keeps the approved provider list unchanged', () => {
    expect([...PROVIDER_KEYS]).toEqual(['genx', 'groq', 'together', 'mimo', 'deepinfra'])
  })

  it('adds docs-known music catalogue entries without making them executable', () => {
    const musicModels = MODEL_CATALOGUE.filter((model) => model.capabilities.includes('music_generation'))
    expect(musicModels.length).toBeGreaterThanOrEqual(2)
    expect(musicModels.every((model) => model.executable === false)).toBe(true)
    expect(musicModels).toContainEqual(expect.objectContaining({
      provider: 'genx',
      modelId: 'lyria-3-clip-preview',
      status: 'planned',
      executable: false,
      supportsArtifacts: true,
      providerClientExists: false,
      workerExecutorExists: false,
    }))
    expect(musicModels).toContainEqual(expect.objectContaining({
      provider: 'genx',
      modelId: 'lyria-3-pro-preview',
      executable: false,
    }))
  })

  it('Brain Router blocks music generation because no executable model exists', () => {
    const decision = routeBrain({ capability: 'music_generation', routingMode: 'balanced' })
    expect(decision.executionAllowed).toBe(false)
    expect(decision.selectedProvider).toBeNull()
    expect(decision.selectedModel).toBeNull()
    expect(decision.blockReason).toContain("No executable model found for capability 'music_generation'")
    expect(decision.truth).toContain('Brain Router v1 blocked')
  })

  it('keeps adult capabilities on hold', () => {
    const decision = routeBrain({ capability: 'adult_text', routingMode: 'balanced' })
    expect(decision.executionAllowed).toBe(false)
    expect(decision.blockReason).toContain('adult_text')
  })

  it('does not add a fake worker music executor or artifact execution path', () => {
    const executor = readFileSync(`${ROOT}/apps/worker/src/providers/provider-executor.ts`, 'utf-8')
    expect(executor).not.toContain('executeMusicGeneration')
    expect(executor).not.toContain('music_artifact_execution_path')
  })

  it('registers admin music routes without queueing or saving artifacts', () => {
    const routePath = `${ROOT}/apps/api/src/routes/admin-music.ts`
    expect(existsSync(routePath)).toBe(true)
    const routeSource = readFileSync(routePath, 'utf-8')
    expect(routeSource).toContain('/api/admin/music/status')
    expect(routeSource).toContain('/api/admin/music/plan')
    expect(routeSource).toContain('/api/admin/music/generate')
    expect(routeSource).toContain('reply.status(409)')
    expect(routeSource).not.toContain('saveArtifact')
    expect(routeSource).not.toContain('Queue')
  })
})

describe('Admin music API contract', () => {
  let app

  beforeAll(async () => {
    app = Fastify()
    app.decorate('jwtVerify', async (token) => {
      if (token === 'admin-token') return { role: 'admin' }
      if (token === 'user-token') return { role: 'user' }
      throw new Error('bad token')
    })
    await app.register(adminMusicRoutes)
    await app.ready()
  })

  afterAll(async () => {
    await app?.close()
  })

  it('requires admin auth for status', async () => {
    const response = await app.inject({ method: 'GET', url: '/api/admin/music/status' })
    expect(response.statusCode).toBe(401)
  })

  it('returns music foundation status to admins', async () => {
    const response = await app.inject({
      method: 'GET',
      url: '/api/admin/music/status',
      headers: { authorization: 'Bearer admin-token' },
    })

    expect(response.statusCode).toBe(200)
    const body = response.json()
    expect(body.success).toBe(true)
    expect(body.status.foundationReady).toBe(true)
    expect(body.status.executionBlocked).toBe(true)
  })

  it('creates plans without executing jobs', async () => {
    const response = await app.inject({
      method: 'POST',
      url: '/api/admin/music/plan',
      headers: { authorization: 'Bearer admin-token' },
      payload: {
        prompt: 'Original corporate intro',
        style: 'corporate',
        durationSeconds: 30,
        instrumentalOnly: true,
      },
    })

    expect(response.statusCode).toBe(200)
    const body = response.json()
    expect(body.success).toBe(true)
    expect(body.executionReady).toBe(false)
    expect(body.plan.executionReady).toBe(false)
  })

  it('blocks generate with 409 and does not claim completion', async () => {
    const response = await app.inject({
      method: 'POST',
      url: '/api/admin/music/generate',
      headers: { authorization: 'Bearer admin-token' },
      payload: {
        prompt: 'Original electronic bed',
        style: 'electronic',
        durationSeconds: 30,
        instrumentalOnly: true,
      },
    })

    expect(response.statusCode).toBe(409)
    const body = response.json()
    expect(body.success).toBe(false)
    expect(body.executionBlocked).toBe(true)
    expect(body.message).toContain('GenX music capability is known')
    expect(body.missingDependencies).toEqual([
      'approved_provider_music_client',
      'music_worker_executor',
      'music_artifact_execution_path',
    ])
    expect(body).not.toHaveProperty('artifactId')
  })

  it('blocks provider and model overrides at top level and inside input', async () => {
    const topLevel = await app.inject({
      method: 'POST',
      url: '/api/admin/music/generate',
      headers: { authorization: 'Bearer admin-token' },
      payload: {
        prompt: 'Original music',
        provider: 'genx',
      },
    })
    expect(topLevel.statusCode).toBe(400)
    expect(topLevel.json().message).toContain('Provider/model override not allowed')

    const nested = await app.inject({
      method: 'POST',
      url: '/api/admin/music/generate',
      headers: { authorization: 'Bearer admin-token' },
      payload: {
        input: {
          prompt: 'Original music',
          model: 'anything',
        },
      },
    })
    expect(nested.statusCode).toBe(400)
    expect(nested.json().message).toContain('input.model')
  })
})
