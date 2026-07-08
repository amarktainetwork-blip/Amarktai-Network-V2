/**
 * GenX video provider contract tests.
 */

import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'

import {
  DEFAULT_GENX_VIDEO_MODEL,
  GENX_POLL_TRANSIENT_MAX_RETRIES,
  genxDownloadVideo,
  genxGenerateVideo,
  genxPollVideo,
  genxSubmitVideo,
  resolveGenxVideoModel,
} from '../packages/providers/src/genx-client.ts'

function jsonResponse(body) {
  return {
    ok: true,
    status: 200,
    json: async () => body,
    text: async () => JSON.stringify(body),
  }
}

function videoResponse() {
  return {
    ok: true,
    status: 200,
    headers: { get: (name) => name === 'content-type' ? 'video/mp4' : null },
    arrayBuffer: async () => new Uint8Array([1, 2, 3, 4]).buffer,
  }
}

function errorResponse(status, body = 'not found') {
  return {
    ok: false,
    status,
    text: async () => body,
  }
}

describe('GenX video model resolution', () => {
  beforeEach(() => {
    vi.restoreAllMocks()
    globalThis.fetch = vi.fn()
  })

  afterEach(() => {
    vi.useRealTimers()
    vi.restoreAllMocks()
  })

  it('uses seedance-v1-fast as the repo default instead of veo-3.1', async () => {
    globalThis.fetch.mockResolvedValueOnce(jsonResponse({ job_id: 'job-1', status: 'pending' }))

    const result = await genxSubmitVideo({
      prompt: 'A calm proof clip',
      apiKey: 'genx-secret',
      baseUrl: 'https://query.genx.sh',
    })

    const requestBody = JSON.parse(globalThis.fetch.mock.calls[0][1].body)
    expect(DEFAULT_GENX_VIDEO_MODEL).toBe('seedance-v1-fast')
    expect(resolveGenxVideoModel()).toBe('seedance-v1-fast')
    expect(requestBody.model).toBe('seedance-v1-fast')
    expect(requestBody.model).not.toBe('veo-3.1')
    expect(result.model).toBe('seedance-v1-fast')
  })

  it('prefers an explicit model and then DB provider defaultModel', async () => {
    globalThis.fetch
      .mockResolvedValueOnce(jsonResponse({ job_id: 'job-explicit', status: 'pending' }))
      .mockResolvedValueOnce(jsonResponse({ job_id: 'job-db', status: 'pending' }))

    await genxSubmitVideo({
      prompt: 'Explicit model proof',
      model: 'explicit-video-model',
      providerDefaultModel: 'db-video-model',
      apiKey: 'genx-secret',
      baseUrl: 'https://query.genx.sh',
    })
    await genxSubmitVideo({
      prompt: 'DB model proof',
      providerDefaultModel: 'db-video-model',
      apiKey: 'genx-secret',
      baseUrl: 'https://query.genx.sh',
    })

    expect(JSON.parse(globalThis.fetch.mock.calls[0][1].body).model).toBe('explicit-video-model')
    expect(JSON.parse(globalThis.fetch.mock.calls[1][1].body).model).toBe('db-video-model')
  })

  it('does not use an unsupported stale DB default when Router models expose usable video models', async () => {
    const model = resolveGenxVideoModel({
      providerDefaultModel: 'seedance-v1-fast',
      providerAvailableModels: ['grok-imagine-video', 'kling-avatar-v2-pro', 'kling-v2.5-turbo'],
    })

    expect(model).toBe('grok-imagine-video')
    expect(model).not.toBe('seedance-v1-fast')
    expect(model).not.toContain('avatar')
  })

  it('uses a supported DB default when the Router model list includes it', async () => {
    const model = resolveGenxVideoModel({
      providerDefaultModel: 'kling-v2.5-turbo',
      providerAvailableModels: ['grok-imagine-video', 'kling-v2.5-turbo'],
    })

    expect(model).toBe('kling-v2.5-turbo')
  })
})

describe('GenX authenticated downloads', () => {
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
      .mockResolvedValueOnce(videoResponse())

    const resultPromise = genxGenerateVideo({
      prompt: 'A short seedance proof clip',
      apiKey: 'genx-secret',
      baseUrl: 'https://query.genx.sh',
    })

    await vi.advanceTimersByTimeAsync(5000)
    const result = await resultPromise
    const fileDownload = globalThis.fetch.mock.calls[3]

    expect(fileDownload[0]).toBe('https://query.genx.sh/api/v1/jobs/job-1/file')
    expect(fileDownload[1].headers.Authorization).toBe('Bearer genx-secret')
    expect(result.videoBuffer.length).toBe(4)
    expect(result.model).toBe('seedance-v1-fast')
    expect(result.providerJobId).toBe('job-1')
  })

  it('does not attach the GenX key to external signed result URLs when baseUrl differs', async () => {
    globalThis.fetch.mockResolvedValueOnce(videoResponse())

    await genxDownloadVideo('https://signed-results.example/video.mp4', {
      apiKey: 'genx-secret',
      baseUrl: 'https://query.genx.sh',
    })

    expect(globalThis.fetch.mock.calls[0][1].headers.Authorization).toBeUndefined()
  })
})

describe('GenX polling robustness and diagnostics', () => {
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
      .mockResolvedValueOnce(videoResponse())

    const resultPromise = genxGenerateVideo({
      prompt: 'A short resilient proof clip',
      apiKey: 'genx-secret',
      baseUrl: 'https://query.genx.sh',
      providerAvailableModels: ['grok-imagine-video', 'kling-v2.5-turbo'],
    })

    await vi.advanceTimersByTimeAsync(10_000)
    const result = await resultPromise

    expect(globalThis.fetch.mock.calls[1][0]).toBe('https://query.genx.sh/api/v1/jobs/job-transient')
    expect(globalThis.fetch.mock.calls[2][0]).toBe('https://query.genx.sh/api/v1/jobs/job-transient')
    expect(result.videoBuffer.length).toBe(4)
    expect(result.providerJobId).toBe('job-transient')
    expect(result.model).toBe('grok-imagine-video')
    expect(result.metadata.providerJobId).toBe('job-transient')
    expect(result.metadata.selectedModel).toBe('grok-imagine-video')
  })

  it('does not retry poll 401 or 403 as transient', async () => {
    vi.useFakeTimers()
    globalThis.fetch
      .mockResolvedValueOnce(jsonResponse({ job_id: 'job-auth', status: 'pending' }))
      .mockResolvedValueOnce(errorResponse(401, 'unauthorized genx-secret'))

    const resultPromise = genxGenerateVideo({
      prompt: 'A short auth proof clip',
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
    await expect(genxPollVideo('job-forbidden', {
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
    for (let i = 0; i < GENX_POLL_TRANSIENT_MAX_RETRIES + 1; i++) {
      globalThis.fetch.mockResolvedValueOnce(errorResponse(500, 'Internal Server Error genx-secret'))
    }

    const resultPromise = genxGenerateVideo({
      prompt: 'A short failing proof clip',
      apiKey: 'genx-secret',
      baseUrl: 'https://query.genx.sh',
      providerDefaultModel: 'seedance-v1-fast',
      providerAvailableModels: ['grok-imagine-video', 'kling-v2.5-turbo'],
    })
    const failure = resultPromise.catch((err) => err)

    await vi.advanceTimersByTimeAsync(5000 * (GENX_POLL_TRANSIENT_MAX_RETRIES + 1))
    const error = await failure

    expect(error).toBeInstanceOf(Error)
    expect(error.message).toContain('providerJobId=job-fail')
    expect(error.message).toContain('model=grok-imagine-video')
    expect(error.message).toContain('baseUrl=https://query.genx.sh')
    expect(error.message).toContain('pollAttempt=6')
    expect(error.message).toContain('httpStatus=500')
    expect(error.message).toContain('[redacted]')
    expect(error.message).not.toContain('genx-secret')
  })
})
