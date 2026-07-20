import assert from 'node:assert/strict'
import { readFile } from 'node:fs/promises'
import { afterEach, describe, it } from 'vitest'
import {
  assertSongPackageSpendConfirmed,
  buildFullSongPrompt,
  createSongPackagePlan,
  validateOriginalSongRequest,
} from '../packages/core/src/song-generation.js'
import { getInternalDashboardApps } from '../packages/core/src/dashboard-apps.js'
import { genxSubmitMusic } from '../packages/providers/src/genx-song-client.js'

const originalFetch = globalThis.fetch
afterEach(() => { globalThis.fetch = originalFetch })

function request(overrides: Record<string, unknown> = {}) {
  return validateOriginalSongRequest({
    title: 'Build Anything',
    prompt: 'A completely original cinematic pop anthem about turning one idea into an intelligent business platform.',
    genre: 'cinematic pop',
    mood: 'uplifting and bold',
    language: 'English',
    vocalStyle: 'powerful modern lead with stacked harmonies',
    durationSeconds: 180,
    lyricsMode: 'generated',
    instrumentalVersion: true,
    adCutSeconds: 30,
    masteringProfile: 'streaming',
    maxCredits: 100,
    reserveCredits: 20,
    confirmation: 'CONFIRM_PREMIUM_GENX_SPEND',
    ...overrides,
  })
}

describe('premium full-song contract', () => {
  it('builds a vocal master and a matching instrumental master with an enforced spend ceiling', () => {
    const input = request()
    const plan = createSongPackagePlan({
      request: input,
      selectedModel: 'lyria-3-pro-preview',
      selectedExecutorId: 'genx.song-generation',
      availableCredits: 250,
      estimatedCreditsPerGeneration: 30,
    })
    assert.equal(plan.selectedProvider, 'genx')
    assert.equal(plan.selectedModel, 'lyria-3-pro-preview')
    assert.deepEqual(plan.variants.map((variant) => variant.variant), ['vocal_master', 'instrumental_master'])
    assert.equal(plan.variants[0]?.vocalsRequested, true)
    assert.equal(plan.variants[1]?.instrumentalOnly, true)
    assert.equal(plan.spend.estimatedCredits, 60)
    assert.equal(plan.spend.allowed, true)
    assertSongPackageSpendConfirmed(plan, 'CONFIRM_PREMIUM_GENX_SPEND')
    assert.throws(() => assertSongPackageSpendConfirmed(plan, ''), /confirmation token/)
  })

  it('requires supplied lyrics in provided mode and rejects direct copying requests', () => {
    assert.throws(() => request({ lyricsMode: 'provided', lyrics: undefined }), /Provided lyrics are required/)
    assert.throws(() => request({ prompt: 'Create a cover of an existing chart song exactly' }), /original, non-copying/)
    const provided = request({ lyricsMode: 'provided', lyrics: 'We build the future line by line\nOne bright idea becomes a world of light' })
    const prompt = buildFullSongPrompt(provided)
    assert.match(prompt, /Use the supplied original lyrics/)
    assert.match(prompt, /Mastering target: streaming/)
    assert.match(prompt, /completely original, non-copying composition/)
  })

  it('blocks unknown pricing, spend above the ceiling, and insufficient balance after reserve', () => {
    const base = request({ maxCredits: 50, reserveCredits: 40 })
    const unknown = createSongPackagePlan({ request: base, selectedModel: 'lyria-3-pro-preview', selectedExecutorId: 'genx.song-generation', availableCredits: 200, estimatedCreditsPerGeneration: null })
    assert.equal(unknown.spend.allowed, false)
    assert.ok(unknown.spend.blockers.some((blocker) => blocker.startsWith('pricing_unknown:')))
    const expensive = createSongPackagePlan({ request: base, selectedModel: 'lyria-3-pro-preview', selectedExecutorId: 'genx.song-generation', availableCredits: 200, estimatedCreditsPerGeneration: 30 })
    assert.equal(expensive.spend.allowed, false)
    assert.ok(expensive.spend.blockers.includes('estimated_spend_exceeds_ceiling'))
    const lowBalance = createSongPackagePlan({ request: request({ maxCredits: 100, reserveCredits: 40 }), selectedModel: 'lyria-3-pro-preview', selectedExecutorId: 'genx.song-generation', availableCredits: 80, estimatedCreditsPerGeneration: 25 })
    assert.equal(lowBalance.spend.allowed, false)
    assert.ok(lowBalance.spend.blockers.includes('insufficient_credits_after_reserve'))
  })

  it('submits native full-song parameters to GenX and records the contract used', async () => {
    let body: Record<string, unknown> = {}
    globalThis.fetch = (async (_url, init) => {
      body = JSON.parse(String(init?.body))
      return new Response(JSON.stringify({ job_id: 'song-job-1', status: 'pending' }), { status: 200, headers: { 'content-type': 'application/json' } })
    }) as typeof fetch
    const result = await genxSubmitMusic({
      apiKey: 'test-key', baseUrl: 'https://genx.invalid', model: 'lyria-3-pro-preview',
      prompt: 'Original premium song', duration: 180, instrumental: false, vocals: true,
      lyrics: 'Original lyric line', genre: 'pop', mood: 'bold', tempo: 'midtempo', title: 'Build Anything',
      language: 'English', structure: ['intro', 'verse', 'chorus', 'outro'], masteringProfile: 'streaming', outputFormat: 'wav',
    })
    assert.equal(result.requestContract, 'full_song_params')
    assert.equal(body.model, 'lyria-3-pro-preview')
    const params = body.params as Record<string, unknown>
    assert.equal(params.duration, 180)
    assert.equal(params.vocals, true)
    assert.equal(params.lyrics, 'Original lyric line')
    assert.equal(params.mastering_profile, 'streaming')
    assert.deepEqual(params.structure, ['intro', 'verse', 'chorus', 'outro'])
  })

  it('falls back only when GenX explicitly rejects extended fields', async () => {
    const bodies: Array<Record<string, unknown>> = []
    globalThis.fetch = (async (_url, init) => {
      bodies.push(JSON.parse(String(init?.body)))
      if (bodies.length === 1) return new Response(JSON.stringify({ message: 'unsupported parameter mastering_profile' }), { status: 422 })
      return new Response(JSON.stringify({ job_id: 'song-job-2', status: 'pending' }), { status: 200 })
    }) as typeof fetch
    const result = await genxSubmitMusic({
      apiKey: 'test-key', baseUrl: 'https://genx.invalid', model: 'lyria-3-pro-preview',
      prompt: 'Original song', duration: 180, vocals: true, lyrics: 'Original lyrics', masteringProfile: 'streaming',
    })
    assert.equal(result.requestContract, 'minimal_compatible_params')
    assert.equal(bodies.length, 2)
    const fallback = bodies[1]?.params as Record<string, unknown>
    assert.equal(fallback.prompt, 'Original song')
    assert.equal(fallback.lyrics, 'Original lyrics')
    assert.equal(fallback.vocals, true)
    assert.equal('duration' in fallback, false)
    assert.equal('mastering_profile' in fallback, false)
  })

  it('grants song_generation to the internal music dashboard and exposes no browser route override', async () => {
    const musicApp = getInternalDashboardApps().find((app) => app.appSlug === 'dashboard-music')
    assert.ok(musicApp?.capabilities.includes('song_generation'))

    const [route, server, page, discovery, worker, providerIndex] = await Promise.all([
      readFile(new URL('../apps/api/src/routes/admin-song.ts', import.meta.url), 'utf8'),
      readFile(new URL('../apps/api/src/server.ts', import.meta.url), 'utf8'),
      readFile(new URL('../app/dashboard/song/page.js', import.meta.url), 'utf8'),
      readFile(new URL('../packages/providers/src/model-discovery/genx.ts', import.meta.url), 'utf8'),
      readFile(new URL('../apps/worker/src/providers/provider-executor.ts', import.meta.url), 'utf8'),
      readFile(new URL('../packages/providers/src/index.ts', import.meta.url), 'utf8'),
    ])
    assert.match(route, /loadOrchestraSnapshot/)
    assert.match(route, /genxGetCreditBalance/)
    assert.match(route, /genxGetModelPricing/)
    assert.match(route, /assertSongPackageSpendConfirmed/)
    assert.match(route, /capability:\s*'song_generation'/)
    assert.match(route, /orchestraSelectedModel/)
    assert.match(server, /app\.register\(adminSongRoutes\)/)
    assert.match(discovery, /inferredCapabilities:\s*\['music_generation', 'song_generation'\]/)
    assert.match(worker, /'genx\.song-generation': executeGenxMusic/)
    assert.match(providerIndex, /from '\.\/genx-song-client\.js'/)
    assert.match(page, /Full Song Studio/)
    assert.match(page, /CONFIRM_PREMIUM_GENX_SPEND/)
    assert.match(page, /\/api\/admin\/artifacts\/\$\{job\.artifactId\}\/file/)
    assert.doesNotMatch(page, /name=["']provider["']/)
    assert.doesNotMatch(page, /name=["']model["']/)
  })
})
