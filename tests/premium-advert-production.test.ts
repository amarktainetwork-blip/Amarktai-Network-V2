import assert from 'node:assert/strict'
import { readFile } from 'node:fs/promises'
import { describe, it } from 'vitest'
import {
  assertPremiumAdvertSpendConfirmed,
  buildPremiumAdvertPlan,
  scorePremiumVideoCandidate,
  selectPremiumAdvertWinners,
  validatePremiumAdvertRequest,
  type PremiumAdvertRoute,
  type PremiumCandidateEvidence,
} from '../packages/core/src/premium-advert.js'

function request(overrides: Record<string, unknown> = {}) {
  return validatePremiumAdvertRequest({
    brandName: 'AmarktAI Network',
    campaignTitle: 'Build Anything. Operate Everything.',
    prompt: 'A premium cinematic technology advert showing one intelligent capability network replacing disconnected AI tools.',
    objective: 'Make founders understand the platform immediately.',
    audience: 'Founders, agencies, creators and operators.',
    callToAction: 'Build anything. Operate everything.',
    targetDurationSeconds: 30,
    candidateCount: 3,
    aspectRatio: '16:9',
    maxCredits: 1000,
    reserveCredits: 100,
    confirmation: 'CONFIRM_PREMIUM_GENX_SPEND',
    ...overrides,
  })
}

const videoRoute: PremiumAdvertRoute = { provider: 'genx', model: 'veo-3.1', executorId: 'genx.video-generation', estimatedCreditsPerUnit: 20 }
const narrationRoute: PremiumAdvertRoute = { provider: 'genx', model: 'genx-lm-voice-pro', executorId: 'genx.tts', estimatedCreditsPerUnit: 5 }
const musicRoute: PremiumAdvertRoute = { provider: 'genx', model: 'lyria-3-pro-preview', executorId: 'genx.song-generation', estimatedCreditsPerUnit: 25 }

function plan(overrides: Record<string, unknown> = {}) {
  return buildPremiumAdvertPlan({
    request: request(overrides),
    videoRoute,
    narrationRoute,
    musicRoute,
    availableCredits: 2000,
  })
}

describe('premium AmarktAI advert benchmark', () => {
  it('creates six exact scenes, three candidates per scene, and one protected spend decision', () => {
    const result = plan()
    assert.equal(result.scenes.length, 6)
    assert.equal(result.candidates.length, 18)
    assert.equal(result.scenes.reduce((total, scene) => total + scene.durationSeconds, 0), 30)
    assert.ok(result.scenes.every((scene) => scene.durationSeconds === 5))
    assert.ok(result.candidates.every((candidate) => candidate.route.provider === 'genx' && candidate.route.model === 'veo-3.1'))
    assert.equal(result.spend.estimatedCredits, 390)
    assert.equal(result.spend.allowed, true)
    assert.deepEqual(result.spend.lines.map((line) => line.role), ['video_scene', 'voiceover', 'full_song'])
    assertPremiumAdvertSpendConfirmed(result, 'CONFIRM_PREMIUM_GENX_SPEND')
    assert.throws(() => assertPremiumAdvertSpendConfirmed(result, ''), /confirmation token/)
  })

  it('blocks unknown pricing, insufficient balance, ceiling overruns and non-flagship route identities', () => {
    const unknown = buildPremiumAdvertPlan({ request: request(), videoRoute: { ...videoRoute, estimatedCreditsPerUnit: null }, narrationRoute, musicRoute, availableCredits: 2000 })
    assert.equal(unknown.spend.allowed, false)
    assert.ok(unknown.spend.blockers.some((blocker) => blocker.startsWith('pricing_unknown:')))
    const ceiling = buildPremiumAdvertPlan({ request: request({ maxCredits: 100 }), videoRoute, narrationRoute, musicRoute, availableCredits: 2000 })
    assert.equal(ceiling.spend.allowed, false)
    assert.ok(ceiling.spend.blockers.includes('estimated_spend_exceeds_ceiling'))
    const balance = buildPremiumAdvertPlan({ request: request({ maxCredits: 1000, reserveCredits: 100 }), videoRoute, narrationRoute, musicRoute, availableCredits: 400 })
    assert.equal(balance.spend.allowed, false)
    assert.ok(balance.spend.blockers.includes('insufficient_credits_after_reserve'))
    assert.throws(() => buildPremiumAdvertPlan({ request: request(), videoRoute: { ...videoRoute, model: 'seedance-v1-fast' }, narrationRoute, musicRoute, availableCredits: 2000 }), /flagship GenX family/)
    assert.throws(() => buildPremiumAdvertPlan({ request: request(), videoRoute, narrationRoute: { ...narrationRoute, model: 'generic-voice' }, musicRoute, availableCredits: 2000 }), /approved GenX voice family/)
    assert.throws(() => buildPremiumAdvertPlan({ request: request(), videoRoute, narrationRoute, musicRoute: { ...musicRoute, model: 'lyria-3-clip-preview' }, availableCredits: 2000 }), /Lyria 3 Pro/)
  })

  it('scores measurable media evidence and deterministically selects one winner per scene', () => {
    const result = plan({ candidateCount: 2 })
    const evidence: PremiumCandidateEvidence[] = result.scenes.flatMap((scene) => ([
      { candidateId: `scene-${scene.sceneNumber}-candidate-1`, sceneNumber: scene.sceneNumber, model: 'veo-3.1', width: 1280, height: 720, durationSeconds: scene.durationSeconds + 1.5, fileSizeBytes: 1_000_000, outputValidated: true },
      { candidateId: `scene-${scene.sceneNumber}-candidate-2`, sceneNumber: scene.sceneNumber, model: 'veo-3.1', width: 1920, height: 1080, durationSeconds: scene.durationSeconds, fileSizeBytes: 8_000_000, outputValidated: true },
    ]))
    const weak = scorePremiumVideoCandidate(evidence[0]!, 5)
    const strong = scorePremiumVideoCandidate(evidence[1]!, 5)
    assert.ok(strong.score > weak.score)
    const winners = selectPremiumAdvertWinners(evidence, result.scenes)
    assert.equal(winners.length, 6)
    assert.ok(winners.every((winner) => winner.candidateId.endsWith('candidate-2')))
    assert.deepEqual(winners.map((winner) => winner.sceneNumber), [1, 2, 3, 4, 5, 6])
  })

  it('rejects invalid benchmark sizes before any provider work', () => {
    assert.throws(() => request({ candidateCount: 1 }), /Too small|greater than or equal to 2/i)
    assert.throws(() => request({ candidateCount: 5 }), /Too big|less than or equal to 4/i)
    assert.throws(() => request({ targetDurationSeconds: 12 }), /Too small|greater than or equal to 24/i)
  })

  it('wires stored-account pricing, exact routes, durable children and idempotent finalisation', async () => {
    const [route, server, assembly] = await Promise.all([
      readFile(new URL('../apps/api/src/routes/admin-premium-advert.ts', import.meta.url), 'utf8'),
      readFile(new URL('../apps/api/src/server.ts', import.meta.url), 'utf8'),
      readFile(new URL('../apps/api/src/lib/premium-advert-assembly.ts', import.meta.url), 'utf8'),
    ])
    assert.match(route, /rankPremiumGenxModels/)
    assert.match(route, /genxGetCreditBalance/)
    assert.match(route, /genxGetModelPricing/)
    assert.match(route, /assertPremiumAdvertSpendConfirmed/)
    assert.match(route, /premiumAdvertCandidate:\s*true/)
    assert.match(route, /orchestraSelectedProvider/)
    assert.match(route, /orchestraSelectedModel/)
    assert.match(route, /orchestraSelectedExecutorId/)
    assert.match(route, /appGrantSnapshot/)
    assert.match(route, /selectPremiumAdvertWinners/)
    assert.match(route, /loaded\.parent\.status === 'completed'/)
    assert.match(route, /assemblePremiumAdvert/)
    assert.match(server, /app\.register\(adminPremiumAdvertRoutes\)/)

    assert.match(assembly, /execFile/)
    assert.doesNotMatch(assembly, /\bexec\(/)
    assert.match(assembly, /scale=\$\{target\.width\}:\$\{target\.height\}/)
    assert.match(assembly, /loudnorm=I=-16/)
    assert.match(assembly, /subtitles=/)
    assert.match(assembly, /ffprobe/)
    assert.match(assembly, /finalVideoValidated:\s*true/)
    assert.match(assembly, /finalAudioValidated:\s*true/)
    assert.match(assembly, /subType:\s*'premium_amarktai_advert'/)
  })

  it('provides dashboard and terminal surfaces without provider/model controls or unconfirmed paid execution', async () => {
    const [page, runner, dashboard, planProxy, generateProxy, finaliseProxy] = await Promise.all([
      readFile(new URL('../app/dashboard/premium-advert/page.js', import.meta.url), 'utf8'),
      readFile(new URL('../scripts/run-premium-amarktai-advert.mjs', import.meta.url), 'utf8'),
      readFile(new URL('../lib/dashboard-contract.js', import.meta.url), 'utf8'),
      readFile(new URL('../app/api/admin/premium-advert/plan/route.js', import.meta.url), 'utf8'),
      readFile(new URL('../app/api/admin/premium-advert/generate/route.js', import.meta.url), 'utf8'),
      readFile(new URL('../app/api/admin/premium-advert/executions/[id]/finalize/route.js', import.meta.url), 'utf8'),
    ])
    assert.match(page, /Premium AmarktAI Advert/)
    assert.match(page, /CONFIRM_PREMIUM_GENX_SPEND/)
    assert.match(page, /Score candidates and assemble winners/)
    assert.match(page, /\/api\/admin\/artifacts\/\$\{execution\.finalArtifactId\}\/file/)
    assert.doesNotMatch(page, /name=["']provider["']/)
    assert.doesNotMatch(page, /name=["']model["']/)
    assert.match(dashboard, /\/dashboard\/premium-advert/)
    assert.match(runner, /--confirm-paid-live/)
    assert.match(runner, /PREMIUM_ADVERT_MAX_CREDITS/)
    assert.match(runner, /CONFIRM_PREMIUM_GENX_SPEND/)
    assert.match(runner, /finalVideoValidated/)
    assert.match(runner, /finalAudioValidated/)
    assert.match(planProxy, /premium-advert\/plan/)
    assert.match(generateProxy, /premium-advert\/generate/)
    assert.match(finaliseProxy, /premium-advert\/executions\/\$\{encodeURIComponent\(id\)\}\/finalize/)
  })
})
