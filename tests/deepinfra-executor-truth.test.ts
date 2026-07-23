import { afterEach, describe, expect, it, vi } from 'vitest'
import { getExecutorRegistration, hasExecutorRegistration } from '../packages/core/src/executor-registry.ts'
import { discoverDeepInfraProviderModels } from '../packages/providers/src/model-discovery/deepinfra.ts'

function jsonResponse(body: unknown) {
  return new Response(JSON.stringify(body), {
    status: 200,
    headers: { 'content-type': 'application/json' },
  })
}

afterEach(() => {
  vi.unstubAllGlobals()
  vi.restoreAllMocks()
})

describe('DeepInfra discovery executable truth', () => {
  it('marks discovered TTS executable only when the exact speech client and worker are registered', async () => {
    const fetchMock = vi.fn(async (input: string | URL | Request) => {
      const url = String(input)
      if (url.endsWith('/v1/models')) {
        return jsonResponse({ data: [{ id: 'account/text-to-speech-model', task: 'text-to-speech' }] })
      }
      if (url.endsWith('/models/list')) {
        return jsonResponse([{ model_name: 'account/text-to-speech-model', task: 'text-to-speech', private: false, deprecated: false }])
      }
      return new Response('not found', { status: 404 })
    })
    vi.stubGlobal('fetch', fetchMock)

    const result = await discoverDeepInfraProviderModels({
      live: true,
      apiKey: 'fixture-key',
      now: '2026-07-21T18:00:00.000Z',
    })

    expect(result.liveDiscoverySucceeded).toBe(true)
    const model = result.models.find((entry) => entry.modelId === 'account/text-to-speech-model')
    expect(model).toBeDefined()
    expect(model?.inferredCapabilities).toContain('tts')
    expect(model?.endpointShapeKnown).toBe(true)
    expect(model?.requestShapeKnown).toBe(true)
    expect(model?.responseShapeKnown).toBe(true)
    expect(model?.providerClientExists).toBe(true)
    expect(model?.workerExecutorExists).toBe(true)
    expect(model?.artifactPersistenceExists).toBe(true)
    expect(model?.transportProfile).toBe('openai_audio_speech_binary')
    expect(model?.endpointFamily).toContain('audio_speech')
    expect(model?.rawMetadata).toMatchObject({
      providerClientExists: true,
      workerExecutorExists: true,
      artifactPersistenceExists: true,
      executorRegistryMatched: true,
      transportProfile: 'openai_audio_speech_binary',
    })
    expect(hasExecutorRegistration('tts', 'deepinfra')).toBe(true)
    expect(getExecutorRegistration('tts', 'deepinfra')?.id).toBe('deepinfra.task-inference')
  })

  it('marks a discovered registered text model executable from canonical registry truth', async () => {
    const fetchMock = vi.fn(async (input: string | URL | Request) => {
      const url = String(input)
      if (url.endsWith('/v1/models')) {
        return jsonResponse({ data: [{ id: 'account/chat-model', task: 'text-generation', streaming: true }] })
      }
      if (url.endsWith('/models/list')) {
        return jsonResponse([{ model_name: 'account/chat-model', task: 'text-generation', private: false, deprecated: false }])
      }
      return new Response('not found', { status: 404 })
    })
    vi.stubGlobal('fetch', fetchMock)

    const result = await discoverDeepInfraProviderModels({
      live: true,
      apiKey: 'fixture-key',
      now: '2026-07-21T18:00:00.000Z',
    })

    const model = result.models.find((entry) => entry.modelId === 'account/chat-model')
    expect(model?.inferredCapabilities).toContain('chat')
    expect(model?.providerClientExists).toBe(true)
    expect(model?.workerExecutorExists).toBe(true)
    expect(model?.artifactPersistenceExists).toBe(true)
    expect(model?.rawMetadata?.executorRegistryMatched).toBe(true)
    expect(hasExecutorRegistration('chat', 'deepinfra')).toBe(true)
  })
})
