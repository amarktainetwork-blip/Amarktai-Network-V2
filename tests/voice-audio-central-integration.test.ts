import { readFileSync } from 'node:fs'
import { resolve } from 'node:path'
import { describe, expect, it } from 'vitest'

const root = process.cwd()
const source = (path: string) => readFileSync(resolve(root, path), 'utf8')

describe('central voice audio integration', () => {
  it('registers all governed routes on the production API server', () => {
    const server = source('apps/api/src/server.ts')
    const plugin = source('apps/api/src/routes/voice-audio.ts')
    expect(server).toContain("import { registerVoiceAudioRoutes } from './routes/voice-audio.js'")
    expect(server).toContain('await app.register(registerVoiceAudioRoutes)')
    for (const registrar of ['registerVoiceCloneRoutes', 'registerVoiceConversionRoutes', 'registerAudioToAudioRoutes']) {
      expect(plugin).toContain(`await ${registrar}(app)`)
    }
  })

  it('dispatches executable audio transforms through the canonical worker', () => {
    const dispatcher = source('apps/worker/src/providers/durable-provider-fallback.ts')
    expect(dispatcher).toContain("payload.capability === 'audio_to_audio'")
    expect(dispatcher).toContain("import('../handlers/voice-audio-handlers.js')")
    expect(dispatcher).toContain('return handleAudioToAudioJob(payload)')
  })

  it('persists known blockers without queueing them or calling providers', () => {
    const clone = source('apps/api/src/routes/voice-clone.ts')
    const conversion = source('apps/api/src/routes/voice-conversion.ts')
    const audio = source('apps/api/src/routes/audio-to-audio.ts')
    const helper = source('apps/api/src/lib/blocked-capability-job.ts')
    for (const text of [clone, conversion]) {
      expect(text).toContain('persistBlockedCapabilityJob')
      expect(text).toContain("evidenceSource: 'executor_unavailable'")
      expect(text).not.toContain("evidenceSource: 'local_fixture'")
    }
    expect(audio).toContain('INTERNAL_FFMPEG_OPERATIONS')
    expect(audio).toContain("status: 'failed'")
    expect(audio).toContain("evidenceSource: 'executor_unavailable'")
    expect(helper).toContain("status: 'failed'")
    expect(helper).toContain('durableIdempotencyTrace')
    expect(helper).not.toMatch(/Queue|executeWithProvider|providerAdapter/)
  })

  it('runs the voice audio proof inside the authoritative Docker fixture', () => {
    const fixture = source('scripts/proof-release-fixture.mjs')
    const proof = source('scripts/lib/proof-voice-audio-release-fixture.mjs')
    expect(fixture).toContain('proveVoiceAudioReleaseFixture')
    expect(fixture).toContain('VOICE_AUDIO_RELEASE_FIXTURE=PASS')
    expect(proof).toContain("operation: 'normalize'")
    expect(proof).toContain("evidenceSource === 'internal_ffmpeg'")
    expect(proof).toContain("evidenceSource === 'executor_unavailable'")
    expect(proof).toContain('Cross-app source audio was not hidden')
    expect(proof).toContain('Voice clone blocker was not durable')
  })
})
