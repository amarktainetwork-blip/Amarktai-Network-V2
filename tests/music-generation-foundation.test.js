import { describe, it, expect, beforeAll, afterAll, beforeEach, afterEach } from 'vitest'
import Fastify from 'fastify'
import { readFileSync, existsSync } from 'fs'
import {
  MODEL_CATALOGUE,
  PROVIDER_KEYS,
  createMusicGenerationPlan,
  createLongFormMusicRequest,
  analyzeMusicReferenceAudio,
  GENX_LYRIA_REQUEST_CONTRACT,
  getMusicCapabilityStatus,
  inspirationProfileToPrompt,
  normalizeMusicPrompt,
  getExecutorRegistrations,
  getRuntimeTruth,
  validateMusicGenerationRequest,
  validateMusicReferenceUploadRequest,
} from '../packages/core/src/index.ts'
import { adminMusicRoutes } from '../apps/api/src/routes/admin-music.ts'

const ROOT = process.cwd()
const ORIGINAL_ENV = { ...process.env }

describe('Music generation backend foundation', () => {
  beforeEach(() => {
    delete process.env.GENX_API_KEY
  })

  afterEach(() => {
    process.env = { ...ORIGINAL_ENV }
  })

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
    expect(plan.blockedReason).toContain('credentials_missing')
    expect(plan.lyricsStatus).toBe('not_requested')
    expect(plan.vocalsStatus).toBe('not_requested')
    expect(plan.providerPrompt).toContain('Original ambient loop')
    expect(plan.providerPrompt).toContain('target duration about 30 seconds')
    expect(plan.nativeProviderFields).toEqual(['model', 'params.prompt'])
    expect(plan.derivedPromptOnlyFields).toContain('durationSeconds')
  })

  it('blocks vocals and lyrics as unproven provider features', () => {
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
    // Vocals and lyrics are no longer globally blocked - they are model-dependent
    expect(plan.vocalsStatus).toBe('pending_provider_support')
    expect(plan.lyricsStatus).toBe('pending_provider_support')
  })

  it('classifies GenX Lyria controls truthfully', () => {
    expect(GENX_LYRIA_REQUEST_CONTRACT.prompt).toBe('PROVEN_SUPPORTED')
    expect(GENX_LYRIA_REQUEST_CONTRACT.model).toBe('PROVEN_SUPPORTED')
    expect(GENX_LYRIA_REQUEST_CONTRACT.duration).toBe('INTERNAL_DERIVED_PROMPT_ONLY')
    expect(GENX_LYRIA_REQUEST_CONTRACT.genre).toBe('INTERNAL_DERIVED_PROMPT_ONLY')
    expect(GENX_LYRIA_REQUEST_CONTRACT.mood).toBe('INTERNAL_DERIVED_PROMPT_ONLY')
    expect(GENX_LYRIA_REQUEST_CONTRACT.tempoBpm).toBe('INTERNAL_DERIVED_PROMPT_ONLY')
    expect(GENX_LYRIA_REQUEST_CONTRACT.lyrics).toBe('UNPROVEN')
    expect(GENX_LYRIA_REQUEST_CONTRACT.vocals).toBe('UNPROVEN')
    expect(GENX_LYRIA_REQUEST_CONTRACT.referenceAudio).toBe('UNPROVEN')
  })

  it('derives unsupported native controls into a safe original provider prompt', () => {
    const plan = createMusicGenerationPlan({
      prompt: 'Original launch soundtrack',
      style: 'electronic',
      mood: 'bright',
      genre: 'synth pop',
      tempo: 'fast',
      bpm: 118,
      arrangement: ['intro', 'chorus lift', 'soft ending'],
      durationSeconds: 45,
      instrumentalOnly: true,
      vocalsRequested: false,
      routingMode: 'balanced',
      safetyLevel: 'standard',
      outputFormat: 'mp3',
    })

    expect(plan.providerPrompt).toContain('synth pop genre')
    expect(plan.providerPrompt).toContain('bright mood')
    expect(plan.providerPrompt).toContain('approximately 118 BPM')
    expect(plan.providerPrompt).toContain('arrangement sections: intro, chorus lift, soft ending')
    expect(plan.providerPrompt).toContain('do not copy melody')
  })

  it('requires legal reference upload declaration and audio MIME', () => {
    expect(() => validateMusicReferenceUploadRequest({
      mimeType: 'audio/mpeg',
      rights: { accepted: false, basis: 'own', statement: 'I own this reference' },
    })).toThrow(/rights declaration/)

    expect(() => validateMusicReferenceUploadRequest({
      mimeType: 'image/png',
      rights: { accepted: true, basis: 'license', statement: 'I have a valid licence' },
    })).toThrow(/audio MIME/)
  })

  it('derives a bounded non-copying inspiration profile from reference audio metadata', () => {
    const profile = analyzeMusicReferenceAudio({
      artifactId: 'reference-artifact-001',
      mimeType: 'audio/mpeg',
      fileSizeBytes: 1024 * 1024,
      durationSeconds: 60,
    })
    const prompt = inspirationProfileToPrompt(profile)

    expect(profile.sourceArtifactId).toBe('reference-artifact-001')
    expect(profile.durationSeconds).toBe(60)
    expect(prompt).toContain('reference-inspired abstract traits only')
    expect(prompt).toContain('no copied melody')
    expect(prompt).not.toMatch(/lyrics to copy|performer voice to copy/i)
  })

  it('keeps direct reference-audio conditioning unavailable until provider support is proven', () => {
    const plan = createMusicGenerationPlan({
      prompt: 'Original music inspired by broad reference traits',
      style: 'ambient',
      durationSeconds: 30,
      instrumentalOnly: true,
      vocalsRequested: false,
      referenceAudioArtifactId: 'reference-artifact-001',
      routingMode: 'balanced',
      safetyLevel: 'standard',
      outputFormat: 'mp3',
    })

    expect(plan.referenceAudioAnalysisMode).toBe('inspiration_profile')
    expect(plan.referenceAudioConditioningReady).toBe(false)
    // referenceAudioArtifactId is no longer in unsupportedFields when instrumentalOnly is true
    expect(plan.unsupportedFields).toEqual(expect.arrayContaining(['vocalsRequested', 'lyrics']))
  })

  it('reports implementation ready but not configured/executable/live-proven without GenX config', () => {
    const status = getMusicCapabilityStatus({ configured: false, infrastructureReady: true })
    expect(status.foundationReady).toBe(true)
    expect(status.schemaReady).toBe(true)
    expect(status.plannerReady).toBe(true)
    expect(status.providerClientExists).toBe(true)
    expect(status.clientImplemented).toBe(true)
    expect(status.workerExecutorExists).toBe(true)
    expect(status.executorRegistered).toBe(true)
    expect(status.queuePathImplemented).toBe(true)
    expect(status.routeImplemented).toBe(true)
    expect(status.artifactPersistenceReady).toBe(true)
    expect(status.artifactPathImplemented).toBe(true)
    expect(status.implementationReady).toBe(true)
    expect(status.catalogueKnown).toBe(true)
    expect(status.dashboardReady).toBe(true)
    expect(status.instrumentalReady).toBe(true)
    // vocalsReady and lyricsReady are now model-dependent (true when GenX music models are known)
    expect(status.vocalsReady).toBe(true)
    expect(status.lyricsReady).toBe(true)
    expect(status.referenceAudioAnalysisReady).toBe(true)
    expect(status.referenceAudioConditioningReady).toBe(false)
    expect(status.durationControlReady).toBe(false)
    expect(status.genreControlReady).toBe(false)
    expect(status.moodControlReady).toBe(false)
    expect(status.tempoControlReady).toBe(false)
    expect(status.arrangementControlReady).toBe(false)
    expect(status.outputFormatControlReady).toBe(false)
    expect(status.configured).toBe(false)
    expect(status.policyAllowed).toBe(true)
    expect(status.infrastructureReady).toBe(true)
    expect(status.executableNow).toBe(false)
    expect(status.musicGenerationReady).toBe(false)
    expect(status.executionBlocked).toBe(true)
    expect(status.blockedReasons).toContain('credentials_missing')
    expect(status.blockedReason).toContain('credentials_missing')
    expect(status.genxMusicCapabilityKnown).toBe(true)
    expect(status.lyriaClipDiscovered).toBe(true)
    expect(status.lyriaProDiscovered).toBe(true)
    expect(status.liveProven).toBe(false)
    expect(status.lastProofAt).toBeNull()
    expect(status.approvedProviderAudit).toHaveLength(5)
    expect(status.approvedProviderAudit.find((entry) => entry.provider === 'mimo')?.note).toContain('coding_tools_only')
  })

  it('allows first live proof when implementation/configuration/infrastructure gates pass without requiring liveProven', () => {
    const status = getMusicCapabilityStatus({
      configured: true,
      infrastructureReady: true,
      policyAllowed: true,
      liveProven: false,
    })
    expect(status.implementationReady).toBe(true)
    expect(status.configured).toBe(true)
    expect(status.executableNow).toBe(true)
    expect(status.liveProven).toBe(false)
    expect(status.executionBlocked).toBe(false)
    expect(status.blockedReasons).toEqual([])
    expect(status.blockedReason).toContain('ready for first live proof')
  })

  it('marks liveProven true only when proof evidence is supplied', () => {
    const status = getMusicCapabilityStatus({
      configured: true,
      infrastructureReady: true,
      liveProven: true,
      lastProofAt: '2026-07-10T00:00:00.000Z',
    })
    expect(status.executableNow).toBe(true)
    expect(status.liveProven).toBe(true)
    expect(status.lastProofAt).toBe('2026-07-10T00:00:00.000Z')
  })

  it('keeps the approved provider list unchanged', () => {
    expect([...PROVIDER_KEYS]).toEqual(['genx', 'groq', 'together', 'mimo', 'deepinfra'])
  })

  it('has music catalogue entries without making catalogue presence sufficient for execution', () => {
    const musicModels = MODEL_CATALOGUE.filter((model) => model.capabilities.includes('music_generation'))
    expect(musicModels.length).toBeGreaterThanOrEqual(2)
    const staticLyria = musicModels.filter((m) => m.provider === 'genx' && m.modelId.startsWith('lyria-'))
    expect(staticLyria.length).toBeGreaterThanOrEqual(2)
    expect(staticLyria.every((model) => model.executable !== true)).toBe(true)
    expect(getExecutorRegistrations('music_generation').map(entry => entry.provider)).toEqual(['genx'])
    expect(staticLyria.every((model) => model.executableNow !== true)).toBe(true)
    expect(staticLyria).toContainEqual(expect.objectContaining({
      provider: 'genx',
      modelId: 'lyria-3-clip-preview',
      status: 'available',
      supportsArtifacts: true,
    }))
    expect(staticLyria).toContainEqual(expect.objectContaining({
      provider: 'genx',
      modelId: 'lyria-3-pro-preview',
    }))
  })

  it('runtime truth blocks music_generation without runtime GenX configuration', () => {
    const music = getRuntimeTruth().capabilities.find(item => item.capability === 'music_generation')
    expect(music.executorRegistered).toBe(true)
    expect(music.configured).toBe(false)
    expect(music.executableNow).toBe(false)
  })

  it('runtime truth exposes only the registered GenX music path when configured', () => {
    const music = getRuntimeTruth({
      providers: { genx: { enabled: true, configured: true } },
      capabilities: { music_generation: { infrastructureReady: true } },
    }).capabilities.find(item => item.capability === 'music_generation')
    expect(music.executableNow).toBe(true)
    expect(music.eligibleProviders).toEqual(['genx'])
    expect(music.eligibleModels.every(model => model.modelId.includes('lyria'))).toBe(true)
  })

  it('keeps adult capabilities on hold', () => {
    const adult = getRuntimeTruth().capabilities.find(item => item.capability === 'adult_text')
    expect(adult.classification).toBe('POLICY_RESTRICTED')
    expect(adult.executableNow).toBe(false)
  })

  it('does not add a fake worker music executor or artifact execution path', () => {
    const executor = readFileSync(`${ROOT}/apps/worker/src/providers/provider-executor.ts`, 'utf-8')
    expect(executor).not.toContain('executeMusicGeneration')
    expect(executor).not.toContain('music_artifact_execution_path')
  })

  it('registers admin music routes with queue-based job creation', () => {
    const routePath = `${ROOT}/apps/api/src/routes/admin-music.ts`
    expect(existsSync(routePath)).toBe(true)
    const routeSource = readFileSync(routePath, 'utf-8')
    expect(routeSource).toContain('/api/admin/music/status')
    expect(routeSource).toContain('/api/admin/music/plan')
    expect(routeSource).toContain('/api/admin/music/generate')
    expect(routeSource).toContain('/api/admin/music/reference-audio')
    expect(routeSource).toContain('rightsDeclaration')
    expect(routeSource).toContain('checksumSha256')
    expect(routeSource).toContain("subType: 'music_reference'")
    expect(routeSource).toContain('reply.status(409)')
    expect(routeSource).toContain('saveArtifact')
    // Route now queues jobs via BullMQ instead of blocking with 409
    expect(routeSource).toContain('Queue')
    expect(routeSource).toContain('prisma.job.create')
    expect(routeSource).toContain('202')
  })

  it('dashboard uses real music APIs and exposes no provider/model selectors', () => {
    const page = readFileSync(`${ROOT}/app/dashboard/music/page.js`, 'utf-8')
    expect(page).toContain('/api/admin/music/status')
    expect(page).toContain('/api/admin/music/generate')
    expect(page).toContain('/api/admin/music/reference-audio')
    expect(page).toContain('new FormData')
    expect(page).not.toContain('readAsDataURL')
    expect(page).not.toContain('selectedProvider')
    expect(page).not.toContain('selectedModel')
    expect(page).toContain('instrumentalOnly: true')
    expect(page).toContain('<Switch disabled checked />')
  })

  it('long-form handoff uses canonical music_generation request shape', () => {
    const request = createLongFormMusicRequest({
      targetDurationSeconds: 45,
      mood: 'uplifting',
      style: 'cinematic',
      loop: true,
      fadeOutSeconds: 3,
      parentExecutionId: 'long-form-001',
      traceId: 'trace-long-form-music',
      appSlug: 'future-long-form-app',
    })

    expect(request.capability).toBe('music_generation')
    expect(request.purpose).toBe('background_music')
    expect(request.instrumentalOnly).toBe(true)
    expect(request.vocalsRequested).toBe(false)
    expect(request.parentExecutionId).toBe('long-form-001')
    expect(request.traceId).toBe('trace-long-form-music')
    expect(request.appSlug).toBe('future-long-form-app')
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

  it('returns music capability status to admins', async () => {
    const response = await app.inject({
      method: 'GET',
      url: '/api/admin/music/status',
      headers: { authorization: 'Bearer admin-token' },
    })

    expect(response.statusCode).toBe(200)
    const body = response.json()
    expect(body.success).toBe(true)
    expect(body.status.foundationReady).toBe(true)
    expect(body.status.implementationReady).toBe(true)
    expect(body.status.configured).toBe(false)
    expect(body.status.executableNow).toBe(false)
    expect(body.status.liveProven).toBe(false)
    expect(body.status.executionBlocked).toBe(true)
  })

  it('creates plans with dynamic execution readiness', async () => {
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

  it('blocks generate with 409 when configuration/infrastructure gates are missing', async () => {
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
    expect(body.message).toContain('credentials_missing')
    expect(body.missingDependencies).toEqual(expect.arrayContaining(['credentials_missing', 'infrastructure_missing']))
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
