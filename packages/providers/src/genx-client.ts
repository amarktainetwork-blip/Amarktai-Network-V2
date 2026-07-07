/**
 * GenX Router REST client — live integration for video.generate capabilities.
 *
 * Uses the official GenX Router async contract:
 *   POST /api/v1/generate          — submit job
 *   GET  /api/v1/jobs/:id          — poll status
 *   GET  /api/v1/jobs/:id/file     — download result
 *
 * API key/baseUrl can be passed in from stored-key resolver or env fallback.
 */

import { getGenxApiKey, getGenxBaseUrl } from '@amarktai/core'

// ── Types ─────────────────────────────────────────────────────────────────────

export interface GenxVideoRequest {
  prompt: string
  model?: string
  duration?: number
  aspectRatio?: string
  style?: string
  negativePrompt?: string
  apiKey?: string
  baseUrl?: string
  providerDefaultModel?: string
}

export interface GenxVideoSubmitResponse {
  jobId: string
  status: string
  model: string
}

export interface GenxVideoPollResponse {
  jobId: string
  status: 'pending' | 'processing' | 'completed' | 'failed'
  progress: number
  resultUrl?: string
  error?: string
  metadata?: Record<string, unknown>
}

export interface GenxVideoResult {
  videoBuffer: Buffer
  mimeType: string
  duration: number
  width: number
  height: number
  model: string
  metadata: Record<string, unknown>
}

export const DEFAULT_GENX_VIDEO_MODEL = 'seedance-v1-fast'

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

export function resolveGenxVideoModel(
  request: Pick<GenxVideoRequest, 'model' | 'providerDefaultModel'> = {},
): string {
  return request.model?.trim()
    || request.providerDefaultModel?.trim()
    || DEFAULT_GENX_VIDEO_MODEL
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
  // Try all known GenX response shapes
  const direct = data.result_url ?? data.output_url ?? data.file_url ?? data.url
  if (typeof direct === 'string' && direct) return direct

  const result = data.result as Record<string, unknown> | undefined
  if (result) {
    const nested = result.url ?? result.file_url ?? result.output_url ?? result.video_url
    if (typeof nested === 'string' && nested) return nested
  }

  const output = data.output as Record<string, unknown> | undefined
  if (output) {
    const nested = output.url ?? output.file_url ?? output.video_url
    if (typeof nested === 'string' && nested) return nested
  }

  return undefined
}

// ── Submit Video Job ──────────────────────────────────────────────────────────

export async function genxSubmitVideo(request: GenxVideoRequest): Promise<GenxVideoSubmitResponse> {
  const apiKey = resolveGenxApiKey(request.apiKey)
  const baseUrl = resolveGenxBaseUrl(request.baseUrl)
  const model = resolveGenxVideoModel(request)

  const params: Record<string, unknown> = removeUndefined({
    prompt: request.prompt,
    duration: request.duration ?? 5,
    aspect_ratio: request.aspectRatio ?? '16:9',
    style: request.style,
    negative_prompt: request.negativePrompt,
  })

  const body = removeUndefined({
    model,
    params,
    metadata: { capability: 'video_generation', source: 'amarktai' },
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
    throw new Error(`GenX submit error ${response.status}: ${errBody}`)
  }

  const data = await response.json() as Record<string, unknown>

  return {
    jobId: (data.job_id as string) ?? (data.id as string) ?? '',
    status: (data.status as string) ?? 'pending',
    model,
  }
}

// ── Poll Video Job Status ─────────────────────────────────────────────────────

export async function genxPollVideo(jobId: string, request?: Pick<GenxVideoRequest, 'apiKey' | 'baseUrl'>): Promise<GenxVideoPollResponse> {
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
    throw new Error(`GenX poll error ${response.status}: ${errBody}`)
  }

  const data = await response.json() as Record<string, unknown>

  const rawStatus = (data.status as string) ?? 'pending'
  let status: GenxVideoPollResponse['status']
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

// ── Download Video Result ─────────────────────────────────────────────────────

export async function genxDownloadVideo(
  url: string,
  request: Pick<GenxVideoRequest, 'apiKey' | 'baseUrl' | 'model' | 'providerDefaultModel'> = {},
): Promise<GenxVideoResult> {
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
    throw new Error(`GenX video download error ${response.status}`)
  }

  const mimeType = response.headers.get('content-type') ?? 'video/mp4'
  if (mimeType.includes('application/json')) {
    throw new Error('GenX video download returned metadata instead of video bytes')
  }

  const arrayBuffer = await response.arrayBuffer()
  const videoBuffer = Buffer.from(arrayBuffer)

  return {
    videoBuffer,
    mimeType,
    duration: 5,
    width: 1920,
    height: 1080,
    model: resolveGenxVideoModel(request),
    metadata: { downloaded: true, sizeBytes: videoBuffer.length, authenticated },
  }
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

// ── Long-Poll Orchestrator ────────────────────────────────────────────────────

export const GENX_POLL_INTERVAL_MS = 5000
export const GENX_POLL_MAX_ATTEMPTS = 120

export interface GenxLongPollCallbacks {
  onProgress?: (progress: number, status: string) => void
}

export async function genxGenerateVideo(
  request: GenxVideoRequest,
  callbacks?: GenxLongPollCallbacks,
): Promise<GenxVideoResult> {
  const apiKey = resolveGenxApiKey(request.apiKey)
  const baseUrl = resolveGenxBaseUrl(request.baseUrl)
  const model = resolveGenxVideoModel(request)

  const submitResult = await genxSubmitVideo(request)
  if (!submitResult.jobId) {
    throw new Error('GenX did not return a job ID')
  }

  let attempts = 0
  while (attempts < GENX_POLL_MAX_ATTEMPTS) {
    await sleep(GENX_POLL_INTERVAL_MS)
    attempts++

    const pollResult = await genxPollVideo(submitResult.jobId, { apiKey, baseUrl })

    if (callbacks?.onProgress) {
      callbacks.onProgress(pollResult.progress, pollResult.status)
    }

    if (pollResult.status === 'failed') {
      throw new Error(`GenX video generation failed: ${pollResult.error ?? 'unknown error'}`)
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
          return await genxDownloadVideo(downloadUrl, {
            apiKey,
            baseUrl,
            model,
          })
        } catch (err) {
          lastDownloadError = err
        }
      }

      throw lastDownloadError instanceof Error
        ? lastDownloadError
        : new Error('GenX video download failed')
    }
  }

  throw new Error(`GenX video generation timed out after ${GENX_POLL_MAX_ATTEMPTS} poll attempts`)
}
