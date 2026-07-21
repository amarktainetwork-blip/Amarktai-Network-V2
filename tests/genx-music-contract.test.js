/**
 * GenX music provider contract tests.
 *
 * Mirrors the proven genx-video-contract.test.js patterns.
 * Tests model resolution, submit/poll/download, authenticated downloads,
 * transient retry, and diagnostic safety.
 */

import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'

import {
  GENX_MUSIC_POLL_TRANSIENT_MAX_RETRIES,
  genxDownloadMusic,
  genxGenerateMusic,
  genxPollMusic,
  genxSubmitMusic,
  resolveGenxMusicModel,
} from '../packages/providers/src/genx-music-client.ts'

function jsonResponse(body) {
  return {
    ok: true,
    status: 200,
    json: async () => body,
    text: async () => JSON.stringify(body),
  }
}

const TEST_AUDIO = Buffer.alloc(834)
TEST_AUDIO.set([0xff, 0xfb, 0x90, 0x00], 0) // MPEG-1 Layer III, 128 kbps, 417-byte frame.
TEST_AUDIO.set([0xff, 0xfb, 0x90, 0x00], 417)

function audioResponse() {
  return {
    ok: true,
    status: 200,
    headers: { get: (name) => name === 'content-type' ? 'audio/mpeg' : null },
    arrayBuffer: async () => TEST_AUDIO.buffer.slice(TEST_AUDIO.byteOffset, TEST_AUDIO.byteOffset + TEST_AUDIO.byteLength),
  }
}

function errorResponse(status, body = 'not found') {
  return {
    ok: false,
    status,
    text: async () => body,
  }
}

describe('GenX music model resolution', () => {
  beforeEach(() => {
    vi.restoreAllMocks()
    globalThis.fetch = vi.fn()
  })

  afterEach(() => {
    vi.useRealTimers()
    vi.restoreAllMocks()
  })

  it('forwards the exact Orchestra-selected model', async () => {
    globalThis.fetch.mockResolvedValueOnce(jsonResponse({ job_id: 'job-1', status: 'pending' }))

    const result = await genxSubmitMusic({
      prompt: 'A calm ambient loop',
      model: 'newly-discovered-music-model',
      apiKey: 'genx-secret',
      baseUrl: 'https://query.genx.sh',
    })

    const requestBody = JSON.parse(globalThis.fetch.mock.calls[0][1].body)
    expect(resolveGenxMusicModel({ model: 'newly-discovered-music-model' })).toBe('newly-discovered-music-model')
    expect(requestBody.model).toBe('newly-discovered-music-model')
    expect(result.model).toBe('newly-discovered-music-model')
  })

  it('fails closed instead of choosing a client-side default', () => {
    expect(() => resolveGenxMusicModel()).toThrow('exact Orchestra-selected model')
  })

  it('sends only proven GenX Lyria native fields in the submit payload', async () => {
    globalThis.fetch.mockResolvedValueOnce(jsonResponse({ job_id: 'job-contract', status: 'pending' }))

    await genxSubmitMusic({
      prompt: 'Original bright electronic instrumental, 118 BPM',
      model: 'lyria-3-pro-preview',
      duration: 30,
      instrumental: true,
      genre: 'electronic',
      mood: 'bright',
      tempo: '118 BPM',
      negativePrompt: 'no vocals',
      apiKey: 'genx-secret',
      baseUrl: 'https://query.genx.sh',
    })

    const requestBody = JSON.parse(globalThis.fetch.mock.calls[0][1].body)
    expect(requestBody).toEqual({
      model: 'lyria-3-pro-preview',
      params: {
        prompt: 'Original bright electronic instrumental, 118 BPM',
      },
      metadata: { capability: 'music_generation', source: 'amarktai' },
    })
    expect(requestBody.params).not.toHaveProperty('duration')
    expect(requestBody.params).not.toHaveProperty('instrumental')
    expect(requestBody.params).not.toHaveProperty('negative_prompt')
    expect(requestBody.params).not.toHaveProperty('genre')
    expect(requestBody.params).not.toHaveProperty('mood')
    expect(requestBody.params).not.toHaveProperty('tempo')
  })

})

describe('GenX music authenticated downloads', () => {
  beforeEach(() => {
    vi.restoreAllMocks()
    globalThis.fetch = vi.fn()
  })

  afterEach(() => {
    vi.useRealTimers()
    vi.restoreAllMocks()
  })

  it('sends Authorization when downloading from the GenX file fallback', async () => {
    vi.useFakeTimers()
    globalThis.fetch
      .mockResolvedValueOnce(jsonResponse({ job_id: 'job-1', status: 'pending' }))
      .mockResolvedValueOnce(jsonResponse({ status: 'completed', progress: 100 }))
      .mockResolvedValueOnce(errorResponse(404))
      .mockResolvedValueOnce(audioResponse())

    const resultPromise = genxGenerateMusic({
      prompt: 'A short ambient proof clip',
      model: 'lyria-3-clip-preview',
      apiKey: 'genx-secret',
      baseUrl: 'https://query.genx.sh',
    })

    await vi.advanceTimersByTimeAsync(5000)
    const result = await resultPromise
    const fileDownload = globalThis.fetch.mock.calls[3]

    expect(fileDownload[0]).toBe('https://query.genx.sh/api/v1/jobs/job-1/file')
    expect(fileDownload[1].headers.Authorization).toBe('Bearer genx-secret')
    expect(result.audioBuffer.length).toBe(TEST_AUDIO.length)
    expect(result.duration).toBeGreaterThan(0)
    expect(result.model).toBe('lyria-3-clip-preview')
    expect(result.providerJobId).toBe('job-1')
  })

  it('does not attach the GenX key to external signed result URLs when baseUrl differs', async () => {
    globalThis.fetch.mockResolvedValueOnce(audioResponse())

    await genxDownloadMusic('https://signed-results.example/audio.mp3', {
      apiKey: 'genx-secret',
      baseUrl: 'https://query.genx.sh',
      model: 'lyria-3-clip-preview',
    })

    expect(globalThis.fetch.mock.calls[0][1].headers.Authorization).toBeUndefined()
  })
})

describe('GenX music polling robustness and diagnostics', () => {
  beforeEach(() => {
    vi.restoreAllMocks()
    globalThis.fetch = vi.fn()
  })

  afterEach(() => {
    vi.useRealTimers()
    vi.restoreAllMocks()
  })

  it('retries transient poll 500 responses before completing', async () => {
    vi.useFakeTimers()
    globalThis.fetch
      .mockResolvedValueOnce(jsonResponse({ job_id: 'job-transient', status: 'pending' }))
      .mockResolvedValueOnce(errorResponse(500, 'temporary router error'))
      .mockResolvedValueOnce(jsonResponse({ status: 'completed', progress: 100 }))
      .mockResolvedValueOnce(audioResponse())

    const resultPromise = genxGenerateMusic({
      prompt: 'A short resilient proof clip',
      model: 'lyria-3-clip-preview',
      apiKey: 'genx-secret',
      baseUrl: 'https://query.genx.sh',
    })

    await vi.advanceTimersByTimeAsync(10_000)
    const result = await resultPromise

    expect(globalThis.fetch.mock.calls[1][0]).toBe('https://query.genx.sh/api/v1/jobs/job-transient')
    expect(globalThis.fetch.mock.calls[2][0]).toBe('https://query.genx.sh/api/v1/jobs/job-transient')
    expect(result.audioBuffer.length).toBe(TEST_AUDIO.length)
    expect(result.duration).toBeGreaterThan(0)
    expect(result.providerJobId).toBe('job-transient')
    expect(result.model).toBe('lyria-3-clip-preview')
    expect(result.metadata.providerJobId).toBe('job-transient')
    expect(result.metadata.selectedModel).toBe('lyria-3-clip-preview')
  })

  it('does not retry poll 401 or 403 as transient', async () => {
    vi.useFakeTimers()
    globalThis.fetch
      .mockResolvedValueOnce(jsonResponse({ job_id: 'job-auth', status: 'pending' }))
      .mockResolvedValueOnce(errorResponse(401, 'unauthorized genx-secret'))

    const resultPromise = genxGenerateMusic({
      prompt: 'A short auth proof clip',
      model: 'lyria-3-clip-preview',
      apiKey: 'genx-secret',
      baseUrl: 'https://query.genx.sh',
    })
    const failure = resultPromise.catch((err) => err)

    await vi.advanceTimersByTimeAsync(5000)
    const error = await failure
    expect(error).toBeInstanceOf(Error)
    expect(error.message).toContain('httpStatus=401')
    expect(globalThis.fetch).toHaveBeenCalledTimes(2)

    globalThis.fetch.mockResolvedValueOnce(errorResponse(401, 'forbidden genx-secret'))
    await expect(genxPollMusic('job-forbidden', {
      apiKey: 'genx-secret',
      baseUrl: 'https://query.genx.sh',
      pollAttempt: 7,
    })).rejects.toMatchObject({
      status: 401,
      providerJobId: 'job-forbidden',
      pollAttempt: 7,
    })
  })

  it('poll failure errors include safe diagnostics without leaking the API key', async () => {
    vi.useFakeTimers()
    globalThis.fetch.mockResolvedValueOnce(jsonResponse({ job_id: 'job-fail', status: 'pending' }))
    for (let i = 0; i < GENX_MUSIC_POLL_TRANSIENT_MAX_RETRIES + 1; i++) {
      globalThis.fetch.mockResolvedValueOnce(errorResponse(500, 'Internal Server Error genx-secret'))
    }

    const resultPromise = genxGenerateMusic({
      prompt: 'A short failing proof clip',
      model: 'lyria-3-clip-preview',
      apiKey: 'genx-secret',
      baseUrl: 'https://query.genx.sh',
    })
    const failure = resultPromise.catch((err) => err)

    await vi.advanceTimersByTimeAsync(5000 * (GENX_MUSIC_POLL_TRANSIENT_MAX_RETRIES + 1))
    const error = await failure

    expect(error).toBeInstanceOf(Error)
    expect(error.message).toContain('providerJobId=job-fail')
    expect(error.message).toContain('model=lyria-3-clip-preview')
    expect(error.message).toContain('baseUrl=https://query.genx.sh')
    expect(error.message).toContain('pollAttempt=6')
    expect(error.message).toContain('httpStatus=500')
    expect(error.message).toContain('[redacted]')
    expect(error.message).not.toContain('genx-secret')
  })

  it('reports music-specific error prefix in poll failures', async () => {
    vi.useFakeTimers()
    globalThis.fetch
      .mockResolvedValueOnce(jsonResponse({ job_id: 'job-prefix', status: 'pending' }))
      .mockResolvedValueOnce(errorResponse(400, 'bad request'))

    const resultPromise = genxGenerateMusic({
      prompt: 'A short prefix proof clip',
      model: 'lyria-3-clip-preview',
      apiKey: 'genx-secret',
      baseUrl: 'https://query.genx.sh',
    })
    const failure = resultPromise.catch((err) => err)

    await vi.advanceTimersByTimeAsync(5000)
    const error = await failure

    expect(error).toBeInstanceOf(Error)
    expect(error.message).toContain('GenX music poll failed')
  })
})
