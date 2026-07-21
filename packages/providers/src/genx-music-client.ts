/**
 * GenX Music REST client — live integration for music_generation capabilities.
 *
 * Uses the official GenX Router async contract:
 *   POST /api/v1/generate          — submit job
 *   GET  /api/v1/jobs/:id          — poll status
 *   GET  /api/v1/jobs/:id/result   — get result metadata
 *   GET  /api/v1/jobs/:id/file     — download audio result
 *
 * API key/baseUrl resolved from stored-key resolver or env fallback.
 */

import { getGenxApiKey, getGenxBaseUrl } from '@amarktai/core'
import { inspectAudioBuffer } from './media-inspection.js'

// ── Types ─────────────────────────────────────────────────────────────────────

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
  negativePrompt?: string
  apiKey?: string
  baseUrl?: string
}

export interface GenxMusicSubmitResponse {
  jobId: string
  status: string
  model: string
}

export interface GenxMusicPollResponse {
  jobId: string
  status: 'pending' | 'processing' | 'completed' | 'failed'
  progress: number
  resultUrl?: string
  error?: string
  metadata?: Record<string, unknown>
}

export interface GenxMusicResult {
  audioBuffer: Buffer
  mimeType: string
  duration: number
  model: string
  providerJobId?: string
  metadata: Record<string, unknown>
}

// ── Helpers ───────────────────────────────────────────────────────────────────

function resolveGenxApiKey(requestApiKey?: string): string {
  return requestApiKey?.trim() || getGenxApiKey()
}

function resolveGenxBaseUrl(requestBaseUrl?: string): string {
  return requestBaseUrl?.trim() || getGenxBaseUrl()
}

function resolveOptionalGenxApiKey(requestApiKey?: string): string {
  if (requestApiKey?.trim()) return requestApiKey.trim()

  try {
    return getGenxApiKey()
  } catch {
    return ''
  }
}

export function resolveGenxMusicModel(
  request: Pick<GenxMusicRequest, 'model'> = {},
): string {
  const explicitModel = request.model?.trim()
  if (explicitModel) return explicitModel
  throw new Error('GenX music transport requires the exact Orchestra-selected model')
}

function sleep(ms: number): Promise<void> {
  return new Promise((resolve) => setTimeout(resolve, ms))
}

function removeUndefined(obj: Record<string, unknown>): Record<string, unknown> {
  const clean: Record<string, unknown> = {}
  for (const [key, value] of Object.entries(obj)) {
    if (value !== undefined && value !== null) {
      clean[key] = value
    }
  }
  return clean
}

function extractResultUrl(data: Record<string, unknown>): string | undefined {
  const direct = data.result_url ?? data.output_url ?? data.file_url ?? data.url ?? data.audio_url
  if (typeof direct === 'string' && direct) return direct

  const result = data.result as Record<string, unknown> | undefined
  if (result) {
    const nested = result.url ?? result.file_url ?? result.output_url ?? result.audio_url
    if (typeof nested === 'string' && nested) return nested
  }

  const output = data.output as Record<string, unknown> | undefined
  if (output) {
    const nested = output.url ?? output.file_url ?? output.audio_url
    if (typeof nested === 'string' && nested) return nested
  }

  return undefined
}

function redactSecrets(message: string, secrets: string[]): string {
  let safe = message
  for (const secret of secrets) {
    if (secret) safe = safe.split(secret).join('[redacted]')
  }
  return safe
}

function shortSafeBody(body: string, secrets: string[] = []): string {
  return redactSecrets(body.replace(/\s+/g, ' ').trim(), secrets).slice(0, 500) || '[empty body]'
}

function shouldAuthenticateDownload(url: string, baseUrl?: string): boolean {
  if (!baseUrl) return true

  try {
    const downloadUrl = new URL(url)
    const genxBaseUrl = new URL(baseUrl)
    return downloadUrl.origin === genxBaseUrl.origin
  } catch {
    return url.startsWith('/api/v1/jobs/') || url.includes('/api/v1/jobs/')
  }
}

function isTransientPollError(err: unknown): boolean {
  return err instanceof GenxMusicHttpError && [500, 502, 503, 504].includes(err.status)
}

function safeBaseUrlDescriptor(baseUrl: string): string {
  try {
    const parsed = new URL(baseUrl)
    return `${parsed.origin}${parsed.pathname === '/' ? '' : parsed.pathname}`
  } catch {
    return '[invalid-base-url]'
  }
}

function formatGenxMusicPollFailure(
  err: unknown,
  context: {
    model: string
    providerJobId: string
    pollAttempt: number
    transientPollFailures: number
    baseUrl: string
  },
): Error {
  const prefix = `GenX music poll failed for providerJobId=${context.providerJobId}; model=${context.model}; baseUrl=${safeBaseUrlDescriptor(context.baseUrl)}; pollAttempt=${context.pollAttempt}`

  if (err instanceof GenxMusicHttpError) {
    const transient = isTransientPollError(err)
      ? `; transientRetries=${context.transientPollFailures}/${GENX_MUSIC_POLL_TRANSIENT_MAX_RETRIES}`
      : ''
    return new Error(`${prefix}${transient}; httpStatus=${err.status}; body=${err.bodySnippet}`)
  }

  if (err instanceof Error) return new Error(`${prefix}; ${err.message}`)
  return new Error(`${prefix}; unknown GenX music poll error`)
}

export class GenxMusicHttpError extends Error {
  constructor(
    message: string,
    readonly status: number,
    readonly bodySnippet: string,
    readonly providerJobId?: string,
    readonly pollAttempt?: number,
  ) {
    super(message)
    this.name = 'GenxMusicHttpError'
  }
}

// ── Constants ─────────────────────────────────────────────────────────────────

export const GENX_MUSIC_POLL_INTERVAL_MS = 5000
export const GENX_MUSIC_POLL_MAX_ATTEMPTS = 120
export const GENX_MUSIC_POLL_TRANSIENT_MAX_RETRIES = 5

// ── Submit Music Job ──────────────────────────────────────────────────────────

export async function genxSubmitMusic(request: GenxMusicRequest): Promise<GenxMusicSubmitResponse> {
  const apiKey = resolveGenxApiKey(request.apiKey)
  const baseUrl = resolveGenxBaseUrl(request.baseUrl)
  const model = resolveGenxMusicModel(request)

  const params: Record<string, unknown> = removeUndefined({
    prompt: request.prompt,
    ...(request.lyrics ? { lyrics: request.lyrics } : {}),
    ...(request.vocals ? { vocals: request.vocals } : {}),
  })

  const body = removeUndefined({
    model,
    params,
    metadata: { capability: 'music_generation', source: 'amarktai' },
  })

  const response = await fetch(`${baseUrl}/api/v1/generate`, {
    method: 'POST',
    headers: {
      'Authorization': `Bearer ${apiKey}`,
      'Content-Type': 'application/json',
    },
    body: JSON.stringify(body),
  })

  if (!response.ok) {
    const errBody = await response.text()
    const bodySnippet = shortSafeBody(errBody, [apiKey])
    throw new GenxMusicHttpError(`GenX music submit error ${response.status}: ${bodySnippet}`, response.status, bodySnippet)
  }

  const data = await response.json() as Record<string, unknown>

  return {
    jobId: (data.job_id as string) ?? (data.id as string) ?? '',
    status: (data.status as string) ?? 'pending',
    model,
  }
}

// ── Poll Music Job Status ─────────────────────────────────────────────────────

export async function genxPollMusic(
  jobId: string,
  request?: Pick<GenxMusicRequest, 'apiKey' | 'baseUrl'> & { pollAttempt?: number },
): Promise<GenxMusicPollResponse> {
  const apiKey = resolveGenxApiKey(request?.apiKey)
  const baseUrl = resolveGenxBaseUrl(request?.baseUrl)

  const response = await fetch(`${baseUrl}/api/v1/jobs/${jobId}`, {
    method: 'GET',
    headers: {
      'Authorization': `Bearer ${apiKey}`,
    },
  })

  if (!response.ok) {
    const errBody = await response.text()
    const bodySnippet = shortSafeBody(errBody, [apiKey])
    const attemptText = request?.pollAttempt ? ` on attempt ${request.pollAttempt}` : ''
    throw new GenxMusicHttpError(
      `GenX music poll error ${response.status}${attemptText} for providerJobId=${jobId}: ${bodySnippet}`,
      response.status,
      bodySnippet,
      jobId,
      request?.pollAttempt,
    )
  }

  const data = await response.json() as Record<string, unknown>

  const rawStatus = (data.status as string) ?? 'pending'
  let status: GenxMusicPollResponse['status']
  switch (rawStatus) {
    case 'completed':
    case 'succeeded':
    case 'success':
      status = 'completed'
      break
    case 'failed':
    case 'error':
    case 'cancelled':
    case 'canceled':
      status = 'failed'
      break
    case 'processing':
    case 'running':
    case 'queued':
    case 'pending':
      status = 'processing'
      break
    default:
      status = 'pending'
  }

  return {
    jobId,
    status,
    progress: (data.progress as number) ?? (status === 'completed' ? 100 : 0),
    resultUrl: extractResultUrl(data),
    error: (data.error as string) ?? (data.message as string) ?? undefined,
    metadata: data as Record<string, unknown>,
  }
}

// ── Download Music Result ─────────────────────────────────────────────────────

export async function genxDownloadMusic(
  url: string,
  request: Pick<GenxMusicRequest, 'apiKey' | 'baseUrl' | 'model'> = {},
): Promise<GenxMusicResult> {
  const apiKey = resolveOptionalGenxApiKey(request.apiKey)
  const baseUrl = resolveGenxBaseUrl(request.baseUrl)
  const downloadUrl = baseUrl ? new URL(url, baseUrl).toString() : url
  const headers: Record<string, string> = {}
  const authenticated = !!apiKey && shouldAuthenticateDownload(downloadUrl, baseUrl)

  if (authenticated) {
    headers.Authorization = `Bearer ${apiKey}`
  }

  const response = await fetch(downloadUrl, { headers })

  if (!response.ok) {
    throw new Error(`GenX music download error ${response.status}`)
  }

  const contentType = response.headers.get('content-type') ?? ''

  if (contentType.includes('application/json')) {
    throw new Error('GenX music download returned metadata instead of audio bytes')
  }

  const arrayBuffer = await response.arrayBuffer()
  const audioBuffer = Buffer.from(arrayBuffer)

  if (audioBuffer.length === 0) {
    throw new Error('GenX music download returned empty audio buffer')
  }

  const mimeType = contentType || 'audio/mpeg'
  const model = resolveGenxMusicModel(request)
  const inspected = inspectAudioBuffer(audioBuffer, mimeType, 'genx')

  return {
    audioBuffer,
    mimeType,
    duration: inspected.duration,
    model,
    metadata: { downloaded: true, sizeBytes: audioBuffer.length, authenticated, durationSource: inspected.durationSource },
  }
}

// ── Long-Poll Orchestrator ────────────────────────────────────────────────────

export interface GenxMusicLongPollCallbacks {
  onProgress?: (progress: number, status: string) => void
}

export async function genxGenerateMusic(
  request: GenxMusicRequest,
  callbacks?: GenxMusicLongPollCallbacks,
): Promise<GenxMusicResult> {
  const apiKey = resolveGenxApiKey(request.apiKey)
  const baseUrl = resolveGenxBaseUrl(request.baseUrl)
  const model = resolveGenxMusicModel(request)

  const submitResult = await genxSubmitMusic({ ...request, model })
  if (!submitResult.jobId) {
    throw new Error('GenX did not return a music job ID')
  }

  let attempts = 0
  let transientPollFailures = 0
  while (attempts < GENX_MUSIC_POLL_MAX_ATTEMPTS) {
    await sleep(GENX_MUSIC_POLL_INTERVAL_MS)
    attempts++

    let pollResult: GenxMusicPollResponse
    try {
      pollResult = await genxPollMusic(submitResult.jobId, { apiKey, baseUrl, pollAttempt: attempts })
      transientPollFailures = 0
    } catch (err) {
      if (isTransientPollError(err)) {
        transientPollFailures++
        if (transientPollFailures <= GENX_MUSIC_POLL_TRANSIENT_MAX_RETRIES) {
          continue
        }
      }

      throw formatGenxMusicPollFailure(err, {
        model,
        providerJobId: submitResult.jobId,
        pollAttempt: attempts,
        transientPollFailures,
        baseUrl,
      })
    }

    if (callbacks?.onProgress) {
      callbacks.onProgress(pollResult.progress, pollResult.status)
    }

    if (pollResult.status === 'failed') {
      throw new Error(`GenX music generation failed for providerJobId=${submitResult.jobId}; model=${model}; pollAttempt=${attempts}; providerStatus=failed; ${pollResult.error ?? 'unknown error'}`)
    }

    if (pollResult.status === 'completed') {
      const downloadUrls = [
        pollResult.resultUrl,
        `${baseUrl}/api/v1/jobs/${submitResult.jobId}/result`,
        `${baseUrl}/api/v1/jobs/${submitResult.jobId}/file`,
      ].filter((candidate): candidate is string => !!candidate)

      let lastDownloadError: unknown
      for (const downloadUrl of downloadUrls) {
        try {
          const music = await genxDownloadMusic(downloadUrl, {
            apiKey,
            baseUrl,
            model,
          })
          return {
            ...music,
            model,
            providerJobId: submitResult.jobId,
            metadata: {
              ...music.metadata,
              providerJobId: submitResult.jobId,
              selectedModel: model,
              pollAttempt: attempts,
            },
          }
        } catch (err) {
          lastDownloadError = err
        }
      }

      if (lastDownloadError instanceof Error) {
        throw new Error(`GenX music download failed for providerJobId=${submitResult.jobId}; model=${model}; ${lastDownloadError.message}`)
      }

      throw new Error(`GenX music download failed for providerJobId=${submitResult.jobId}; model=${model}`)
    }
  }

  throw new Error(`GenX music generation timed out after ${GENX_MUSIC_POLL_MAX_ATTEMPTS} poll attempts; providerJobId=${submitResult.jobId}; model=${model}`)
}
