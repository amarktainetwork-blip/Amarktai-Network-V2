import { afterEach, describe, expect, it, vi } from 'vitest'
import { discoverGenXProviderModels } from './genx.js'

afterEach(() => {
  vi.unstubAllGlobals()
})

describe('GenX live model discovery classification', () => {
  it('classifies specialist media before generic video and voice routes without inventing executors', async () => {
    const records = [
      { id: 'talking-avatar-v2', category: 'video', description: 'Digital human avatar talking head generation' },
      { id: 'portrait-lip-sync-v1', category: 'video', description: 'Lip sync a portrait video to supplied audio' },
      { id: 'instant-voice-clone-v1', category: 'voice', description: 'Clone voice from an authorised reference sample' },
      { id: 'voice-remix-v1', category: 'voice', description: 'Voice conversion and speech-to-speech remix' },
      { id: 'cinematic-sfx-v1', category: 'audio', description: 'Text to audio sound effect generation' },
      { id: 'seedance-v1-fast', category: 'video', description: 'Text to video generation' },
      { id: 'speech-standard-v1', category: 'voice', description: 'Text to speech synthesis' },
    ]
    vi.stubGlobal('fetch', vi.fn(async () => new Response(JSON.stringify({ data: records }), {
      status: 200,
      headers: { 'content-type': 'application/json' },
    })))

    const result = await discoverGenXProviderModels({
      live: true,
      apiKey: 'fixture-genx-key',
      baseUrl: 'https://genx.fixture.invalid',
      now: '2026-07-23T08:00:00.000Z',
    })

    expect(result.error).toBeNull()
    const byId = new Map(result.models.map((model) => [model.modelId, model]))

    expect(byId.get('talking-avatar-v2')?.inferredCapabilities).toEqual(['avatar_generation'])
    expect(byId.get('portrait-lip-sync-v1')?.inferredCapabilities).toEqual(['lip_sync'])
    expect(byId.get('instant-voice-clone-v1')?.inferredCapabilities).toEqual(['voice_clone'])
    expect(byId.get('voice-remix-v1')?.inferredCapabilities).toEqual(['voice_conversion'])
    expect(byId.get('cinematic-sfx-v1')?.inferredCapabilities).toEqual(['text_to_audio'])

    for (const modelId of ['talking-avatar-v2', 'portrait-lip-sync-v1', 'instant-voice-clone-v1', 'voice-remix-v1', 'cinematic-sfx-v1']) {
      const model = byId.get(modelId)!
      expect(model.providerClientExists).toBe(false)
      expect(model.workerExecutorExists).toBe(false)
      expect(model.requestShapeKnown).toBe(false)
      expect(model.responseShapeKnown).toBe(false)
      expect(model.executableBlockers).toContain('genx_live_model_schema_and_executor_activation_required')
    }

    expect(byId.get('seedance-v1-fast')?.inferredCapabilities).toEqual(['video_generation'])
    expect(byId.get('seedance-v1-fast')?.workerExecutorExists).toBe(true)
    expect(byId.get('speech-standard-v1')?.inferredCapabilities).toEqual(['tts'])
    expect(byId.get('speech-standard-v1')?.workerExecutorExists).toBe(true)
  })
})
