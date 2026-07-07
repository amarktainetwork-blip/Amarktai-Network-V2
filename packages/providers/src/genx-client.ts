/**
 * GenX REST client — live integration for video.generate capabilities.
 *
 * Implements async video generation with long-polling:
 *   1. Submit prompt to GenX, receive remote job tracker ID
 *   2. Poll GenX servers at regular intervals for status updates
 *   3. On completion, fetch the MP4 binary and return it
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
  metadata: Record<string, unknown>
}

// ── Helpers ───────────────────────────────────────────────────────────────────

function resolveGenxApiKey(requestApiKey?: string): string {
  return requestApiKey?.trim() || getGenxApiKey()
}

function resolveGenxBaseUrl(requestBaseUrl?: string): string {
  return requestBaseUrl?.trim() || getGenxBaseUrl()
}

function sleep(ms: number): Promise<void> {
  return new Promise((resolve) => setTimeout(resolve, ms))
}

// ── Submit Video Job ──────────────────────────────────────────────────────────

export async function genxSubmitVideo(request: GenxVideoRequest): Promise<GenxVideoSubmitResponse> {
  const apiKey = resolveGenxApiKey(request.apiKey)
  const baseUrl = resolveGenxBaseUrl(request.baseUrl)

  const body: Record<string, unknown> = {
    prompt: request.prompt,
    model: request.model ?? request.providerDefaultModel ?? undefined,
    duration: request.duration ?? 5,
    aspect_ratio: request.aspectRatio ?? '16:9',
    style: request.style ?? undefined,
    negative_prompt: request.negativePrompt ?? undefined,
  }

  // Remove undefined fields
  Object.keys(body).forEach((key) => {
    if (body[key] === undefined) delete body[key]
  })

  const response = await fetch(`${baseUrl}/api/v1/video/generate`, {
    method: 'POST',
    headers: {
      'Authorization': `Bearer ${apiKey}`,
      'Content-Type': 'application/json',
    },
    body: JSON.stringify(body),
  })

  if (!response.ok) {
    const errBody = await response.text()
    throw new Error(`GenX video submit error ${response.status}: ${errBody}`)
  }

  const data = await response.json() as Record<string, unknown>

  return {
    jobId: (data.job_id as string) ?? (data.id as string) ?? '',
    status: (data.status as string) ?? 'pending',
  }
}

// ── Poll Video Job Status ─────────────────────────────────────────────────────

export async function genxPollVideo(jobId: string, request?: Pick<GenxVideoRequest, 'apiKey' | 'baseUrl'>): Promise<GenxVideoPollResponse> {
  const apiKey = resolveGenxApiKey(request?.apiKey)
  const baseUrl = resolveGenxBaseUrl(request?.baseUrl)

  const response = await fetch(`${baseUrl}/api/v1/video/status/${jobId}`, {
    method: 'GET',
    headers: {
      'Authorization': `Bearer ${apiKey}`,
    },
  })

  if (!response.ok) {
    const errBody = await response.text()
    throw new Error(`GenX video poll error ${response.status}: ${errBody}`)
  }

  const data = await response.json() as Record<string, unknown>

  const rawStatus = (data.status as string) ?? 'pending'
  let status: GenxVideoPollResponse['status']
  switch (rawStatus) {
    case 'completed':
    case 'succeeded':
      status = 'completed'
      break
    case 'failed':
    case 'error':
      status = 'failed'
      break
    case 'processing':
    case 'running':
      status = 'processing'
      break
    default:
      status = 'pending'
  }

  return {
    jobId,
    status,
    progress: (data.progress as number) ?? (status === 'completed' ? 100 : 0),
    resultUrl: (data.result_url as string) ?? (data.output_url as string) ?? undefined,
    error: (data.error as string) ?? undefined,
    metadata: data as Record<string, unknown>,
  }
}

// ── Download Video Result ─────────────────────────────────────────────────────

export async function genxDownloadVideo(url: string): Promise<GenxVideoResult> {
  const response = await fetch(url)

  if (!response.ok) {
    throw new Error(`GenX video download error ${response.status}`)
  }

  const arrayBuffer = await response.arrayBuffer()
  const videoBuffer = Buffer.from(arrayBuffer)

  return {
    videoBuffer,
    mimeType: response.headers.get('content-type') ?? 'video/mp4',
    duration: 5,
    width: 1920,
    height: 1080,
    metadata: { downloaded: true, sizeBytes: videoBuffer.length },
  }
}

// ── Long-Poll Orchestrator ────────────────────────────────────────────────────

export const GENX_POLL_INTERVAL_MS = 5000
export const GENX_POLL_MAX_ATTEMPTS = 120 // 10 minutes max

export interface GenxLongPollCallbacks {
  onProgress?: (progress: number, status: string) => void
}

export async function genxGenerateVideo(
  request: GenxVideoRequest,
  callbacks?: GenxLongPollCallbacks,
): Promise<GenxVideoResult> {
  const submitResult = await genxSubmitVideo(request)
  if (!submitResult.jobId) {
    throw new Error('GenX did not return a job ID')
  }

  let attempts = 0
  while (attempts < GENX_POLL_MAX_ATTEMPTS) {
    await sleep(GENX_POLL_INTERVAL_MS)
    attempts++

    const pollResult = await genxPollVideo(submitResult.jobId, {
      apiKey: request.apiKey,
      baseUrl: request.baseUrl,
    })

    if (callbacks?.onProgress) {
      callbacks.onProgress(pollResult.progress, pollResult.status)
    }

    if (pollResult.status === 'failed') {
      throw new Error(`GenX video generation failed: ${pollResult.error ?? 'unknown error'}`)
    }

    if (pollResult.status === 'completed' && pollResult.resultUrl) {
      return await genxDownloadVideo(pollResult.resultUrl)
    }
  }

  throw new Error(`GenX video generation timed out after ${GENX_POLL_MAX_ATTEMPTS} poll attempts`)
}
