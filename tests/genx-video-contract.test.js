/**
 * GenX video provider contract tests.
 */

import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'

import {
  DEFAULT_GENX_VIDEO_MODEL,
  genxDownloadVideo,
  genxGenerateVideo,
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
