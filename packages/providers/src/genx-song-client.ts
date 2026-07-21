import { getGenxApiKey, getGenxBaseUrl } from '@amarktai/core'
import {
  genxPollMusic,
  genxDownloadMusic,
  GENX_MUSIC_POLL_INTERVAL_MS,
  GENX_MUSIC_POLL_MAX_ATTEMPTS,
  GENX_MUSIC_POLL_TRANSIENT_MAX_RETRIES,
  GenxMusicHttpError,
  resolveGenxMusicModel,
  type GenxMusicPollResponse,
  type GenxMusicResult,
  type GenxMusicLongPollCallbacks,
} from './genx-music-client.js'

export interface GenxMusicRequest {
  prompt: string
  model?: string
  duration?: number
  instrumental?: boolean
  lyrics?: string
  vocals?: boolean
  genre?: string
  mood?: string
  tempo?: string
  title?: string
  language?: string
  structure?: string[]
  masteringProfile?: string
  outputFormat?: string
  negativePrompt?: string
  apiKey?: string
  baseUrl?: string
}

export interface GenxMusicSubmitResponse {
  jobId: string
  status: string
  model: string
  requestContract: 'full_song_params' | 'minimal_compatible_params'
}

export {
  genxPollMusic,
  genxDownloadMusic,
  GENX_MUSIC_POLL_INTERVAL_MS,
  GENX_MUSIC_POLL_MAX_ATTEMPTS,
  GENX_MUSIC_POLL_TRANSIENT_MAX_RETRIES,
  GenxMusicHttpError,
  resolveGenxMusicModel,
  type GenxMusicPollResponse,
  type GenxMusicResult,
  type GenxMusicLongPollCallbacks,
}

function apiKey(value?: string): string {
  return value?.trim() || getGenxApiKey()
}

function baseUrl(value?: string): string {
  return (value?.trim() || getGenxBaseUrl()).replace(/\/$/, '')
}

function clean(input: Record<string, unknown>): Record<string, unknown> {
  return Object.fromEntries(Object.entries(input).filter(([, value]) => value !== undefined && value !== null && value !== ''))
}

function safeBody(text: string, secret: string): string {
  return text.replaceAll(secret, '[redacted]').replace(/\s+/g, ' ').trim().slice(0, 500) || '[empty body]'
}

function isUnsupportedParameter(status: number, body: string): boolean {
  return [400, 422].includes(status) && /unknown|unsupported|unrecognized|invalid (?:field|parameter)|extra fields?/i.test(body)
}

async function submit(
  request: GenxMusicRequest,
  params: Record<string, unknown>,
  requestContract: GenxMusicSubmitResponse['requestContract'],
): Promise<GenxMusicSubmitResponse> {
  const key = apiKey(request.apiKey)
  const model = resolveGenxMusicModel(request)
  const response = await fetch(`${baseUrl(request.baseUrl)}/api/v1/generate`, {
    method: 'POST',
    headers: {
      Authorization: `Bearer ${key}`,
      'Content-Type': 'application/json',
    },
    body: JSON.stringify({
      model,
      params,
      metadata: {
        capability: request.vocals || request.lyrics ? 'song_generation' : 'music_generation',
        source: 'amarktai',
        request_contract: requestContract,
      },
    }),
    signal: AbortSignal.timeout(30_000),
  })
  const text = await response.text()
  if (!response.ok) {
    const snippet = safeBody(text, key)
    const error = new GenxMusicHttpError(`GenX music submit error ${response.status}: ${snippet}`, response.status, snippet)
    Object.assign(error, { unsupportedParameter: isUnsupportedParameter(response.status, text) })
    throw error
  }
  const data = text.trim() ? JSON.parse(text) as Record<string, unknown> : {}
  return {
    jobId: String(data.job_id ?? data.id ?? ''),
    status: String(data.status ?? 'pending'),
    model,
    requestContract,
  }
}

export async function genxSubmitMusic(request: GenxMusicRequest): Promise<GenxMusicSubmitResponse> {
  const fullParams = clean({
    prompt: request.prompt,
    duration: request.duration,
    instrumental: request.instrumental,
    lyrics: request.lyrics,
    vocals: request.vocals,
    genre: request.genre,
    mood: request.mood,
    tempo: request.tempo,
    title: request.title,
    language: request.language,
    structure: request.structure,
    mastering_profile: request.masteringProfile,
    output_format: request.outputFormat,
    negative_prompt: request.negativePrompt,
  })
  try {
    return await submit(request, fullParams, 'full_song_params')
  } catch (error) {
    if (!(error instanceof GenxMusicHttpError) || (error as GenxMusicHttpError & { unsupportedParameter?: boolean }).unsupportedParameter !== true) throw error
    return submit(request, clean({
      prompt: request.prompt,
      lyrics: request.lyrics,
      vocals: request.vocals,
      instrumental: request.instrumental,
    }), 'minimal_compatible_params')
  }
}

function sleep(ms: number): Promise<void> {
  return new Promise((resolve) => setTimeout(resolve, ms))
}

export async function genxGenerateMusic(
  request: GenxMusicRequest,
  callbacks?: GenxMusicLongPollCallbacks,
): Promise<GenxMusicResult> {
  const key = apiKey(request.apiKey)
  const root = baseUrl(request.baseUrl)
  const model = resolveGenxMusicModel(request)
  const submitted = await genxSubmitMusic({ ...request, apiKey: key, baseUrl: root, model })
  if (!submitted.jobId) throw new Error('GenX did not return a music job ID')

  let transientFailures = 0
  for (let attempt = 1; attempt <= GENX_MUSIC_POLL_MAX_ATTEMPTS; attempt++) {
    await sleep(GENX_MUSIC_POLL_INTERVAL_MS)
    let polled: GenxMusicPollResponse
    try {
      polled = await genxPollMusic(submitted.jobId, { apiKey: key, baseUrl: root, pollAttempt: attempt })
      transientFailures = 0
    } catch (error) {
      if (error instanceof GenxMusicHttpError && [500, 502, 503, 504].includes(error.status) && ++transientFailures <= GENX_MUSIC_POLL_TRANSIENT_MAX_RETRIES) continue
      throw error
    }
    callbacks?.onProgress?.(polled.progress, polled.status)
    if (polled.status === 'failed') throw new Error(`GenX music generation failed for providerJobId=${submitted.jobId}; model=${model}; ${polled.error ?? 'unknown error'}`)
    if (polled.status !== 'completed') continue
    const urls = [polled.resultUrl, `/api/v1/jobs/${submitted.jobId}/result`, `/api/v1/jobs/${submitted.jobId}/file`].filter((value): value is string => !!value)
    let lastError: unknown
    for (const url of urls) {
      try {
        const result = await genxDownloadMusic(url, { apiKey: key, baseUrl: root, model })
        return { ...result, providerJobId: submitted.jobId, metadata: { ...result.metadata, requestContract: submitted.requestContract } }
      } catch (error) {
        lastError = error
      }
    }
    throw lastError instanceof Error ? lastError : new Error('GenX music result could not be downloaded')
  }
  throw new Error(`GenX music generation timed out for providerJobId=${submitted.jobId}; model=${model}`)
}
