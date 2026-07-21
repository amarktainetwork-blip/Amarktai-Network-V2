/**
 * GenX Voice REST client — live integration for TTS and STT capabilities.
 *
 * Uses the official GenX Router async contract:
 *   POST /api/v1/generate          — submit job
 *   GET  /api/v1/jobs/:id          — poll status
 *   GET  /api/v1/jobs/:id/file     — download result
 *
 * API key/baseUrl resolved from stored-key resolver or env fallback.
 */

import { getGenxApiKey, getGenxBaseUrl } from '@amarktai/core'
import { inspectAudioBuffer } from './media-inspection.js'

// ── Types ─────────────────────────────────────────────────────────────────────

export interface GenxTtsRequest {
  text: string
  model?: string
  voice?: string
  speed?: number
  outputFormat?: string
  language?: string
  apiKey?: string
  baseUrl?: string
}

export interface GenxTtsSubmitResponse {
  jobId: string
  status: string
  model: string
}

export interface GenxTtsPollResponse {
  jobId: string
  status: 'pending' | 'processing' | 'completed' | 'failed'
  progress: number
  resultUrl?: string
  error?: string
  metadata?: Record<string, unknown>
}

export interface GenxTtsResult {
  audioBuffer: Buffer
  mimeType: string
  duration: number
  model: string
  providerJobId?: string
  metadata: Record<string, unknown>
}

export interface GenxSttRequest {
  audioBuffer: Buffer
  filename: string
  mimeType: string
  model?: string
  language?: string
  apiKey?: string
  baseUrl?: string
}

export interface GenxSttSubmitResponse {
  jobId: string
  status: string
  model: string
}

export interface GenxSttPollResponse {
  jobId: string
  status: 'pending' | 'processing' | 'completed' | 'failed'
  progress: number
  resultUrl?: string
  transcript?: string
  language?: string
  duration?: number
  segments?: Array<{ start: number; end: number; text: string }>
  error?: string
  metadata?: Record<string, unknown>
}

export interface GenxSttResult {
  text: string
  language: string
  duration: number
  segments: Array<{ start: number; end: number; text: string }>
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

function sleep(ms: number): Promise<void> {
  return new Promise((resolve) => setTimeout(resolve, ms))
}

function removeUndefined(obj: Record<string, unknown>): Record<string, unknown> {
  const clean: Record<string, unknown> = {}
  for (const [key, value] of Object.entries(obj)) {
    if (value !== undefined && value !== null) clean[key] = value
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

// ── Constants ─────────────────────────────────────────────────────────────────

export const GENX_TTS_POLL_INTERVAL_MS = 3000
export const GENX_TTS_POLL_MAX_ATTEMPTS = 120
export const GENX_STT_POLL_INTERVAL_MS = 3000
export const GENX_STT_POLL_MAX_ATTEMPTS = 120

// ── TTS Submit ────────────────────────────────────────────────────────────────

export async function genxSubmitTts(request: GenxTtsRequest): Promise<GenxTtsSubmitResponse> {
  const apiKey = resolveGenxApiKey(request.apiKey)
  const baseUrl = resolveGenxBaseUrl(request.baseUrl)
  const model = request.model?.trim()
  if (!model) throw new Error('GenX TTS transport requires the exact Orchestra-selected model')

  const params = removeUndefined({
    text: request.text,
    voice: request.voice,
    speed: request.speed,
    output_format: request.outputFormat,
    language: request.language,
  })

  const body = removeUndefined({
    model,
    params,
    metadata: { capability: 'tts', source: 'amarktai' },
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
    throw new Error(`GenX TTS submit error ${response.status}: ${bodySnippet}`)
  }

  const data = await response.json() as Record<string, unknown>
  return {
    jobId: (data.job_id as string) ?? (data.id as string) ?? '',
    status: (data.status as string) ?? 'pending',
    model,
  }
}

// ── TTS Poll ──────────────────────────────────────────────────────────────────

export async function genxPollTts(
  jobId: string,
  request?: Pick<GenxTtsRequest, 'apiKey' | 'baseUrl'> & { pollAttempt?: number },
): Promise<GenxTtsPollResponse> {
  const apiKey = resolveGenxApiKey(request?.apiKey)
  const baseUrl = resolveGenxBaseUrl(request?.baseUrl)

  const response = await fetch(`${baseUrl}/api/v1/jobs/${jobId}`, {
    method: 'GET',
    headers: { 'Authorization': `Bearer ${apiKey}` },
  })

  if (!response.ok) {
    const errBody = await response.text()
    const bodySnippet = shortSafeBody(errBody, [apiKey])
    throw new Error(`GenX TTS poll error ${response.status} for providerJobId=${jobId}: ${bodySnippet}`)
  }

  const data = await response.json() as Record<string, unknown>
  let status: GenxTtsPollResponse['status'] = 'pending'
  const rawStatus = String(data.status ?? 'pending').toLowerCase()
  if (rawStatus === 'completed' || rawStatus === 'done') status = 'completed'
  else if (rawStatus === 'failed' || rawStatus === 'error') status = 'failed'
  else if (rawStatus === 'processing' || rawStatus === 'running') status = 'processing'

  return {
    jobId,
    status,
    progress: typeof data.progress === 'number' ? data.progress : status === 'completed' ? 100 : 0,
    resultUrl: extractResultUrl(data),
    error: typeof data.error === 'string' ? data.error : undefined,
    metadata: data as Record<string, unknown>,
  }
}

// ── TTS Download ──────────────────────────────────────────────────────────────

export async function genxDownloadTts(
  resultUrl: string,
  request: Pick<GenxTtsRequest, 'apiKey' | 'baseUrl' | 'model'> = {},
): Promise<GenxTtsResult> {
  const apiKey = resolveGenxApiKey(request.apiKey)
  const baseUrl = resolveGenxBaseUrl(request.baseUrl)
  const model = request.model?.trim()
  if (!model) throw new Error('GenX TTS download requires the exact Orchestra-selected model')

  const fullUrl = resultUrl.startsWith('http') ? resultUrl : `${baseUrl}${resultUrl}`
  const response = await fetch(fullUrl, {
    headers: { 'Authorization': `Bearer ${apiKey}` },
  })

  if (!response.ok) throw new Error(`GenX TTS download error ${response.status}`)
  const arrayBuffer = await response.arrayBuffer()
  const audioBuffer = Buffer.from(arrayBuffer)
  if (audioBuffer.length === 0) throw new Error('GenX TTS download returned empty audio')

  const contentType = response.headers.get('content-type') ?? 'audio/wav'
  const mimeType = (contentType.split(';')[0] ?? 'audio/wav').trim()
  const inspected = inspectAudioBuffer(audioBuffer, mimeType, 'genx')
  return {
    audioBuffer,
    mimeType: mimeType as string,
    duration: inspected.duration,
    model,
    metadata: { provider: 'genx', capability: 'tts', model, fileSizeBytes: audioBuffer.length },
  }
}

// ── TTS Full Generate ─────────────────────────────────────────────────────────

export async function genxGenerateTts(request: GenxTtsRequest): Promise<GenxTtsResult> {
  const apiKey = resolveGenxApiKey(request.apiKey)
  const baseUrl = resolveGenxBaseUrl(request.baseUrl)
  const model = request.model?.trim()
  if (!model) throw new Error('GenX TTS transport requires the exact Orchestra-selected model')

  const submitResult = await genxSubmitTts(request)
  if (!submitResult.jobId) throw new Error('GenX TTS did not return a job ID')

  let attempts = 0
  while (attempts < GENX_TTS_POLL_MAX_ATTEMPTS) {
    await sleep(GENX_TTS_POLL_INTERVAL_MS)
    attempts++
    const pollResult = await genxPollTts(submitResult.jobId, { apiKey, baseUrl, pollAttempt: attempts })
    if (pollResult.status === 'completed') {
      if (!pollResult.resultUrl) throw new Error('GenX TTS completed but no result URL')
      return await genxDownloadTts(pollResult.resultUrl, { apiKey, baseUrl, model })
    }
    if (pollResult.status === 'failed') throw new Error(`GenX TTS failed: ${pollResult.error ?? 'unknown'}`)
  }
  throw new Error(`GenX TTS poll timed out after ${GENX_TTS_POLL_MAX_ATTEMPTS} attempts`)
}

// ── STT Submit ────────────────────────────────────────────────────────────────

export async function genxSubmitStt(request: GenxSttRequest): Promise<GenxSttSubmitResponse> {
  const apiKey = resolveGenxApiKey(request.apiKey)
  const baseUrl = resolveGenxBaseUrl(request.baseUrl)
  const model = request.model?.trim()
  if (!model) throw new Error('GenX STT transport requires the exact Orchestra-selected model')

  const formData = new FormData()
  formData.append('model', model)
  const blob = new Blob([new Uint8Array(request.audioBuffer)], { type: request.mimeType })
  formData.append('file', blob, request.filename)
  if (request.language) formData.append('language', request.language)

  const response = await fetch(`${baseUrl}/api/v1/generate`, {
    method: 'POST',
    headers: { 'Authorization': `Bearer ${apiKey}` },
    body: formData,
  })

  if (!response.ok) {
    const errBody = await response.text()
    const bodySnippet = shortSafeBody(errBody, [apiKey])
    throw new Error(`GenX STT submit error ${response.status}: ${bodySnippet}`)
  }

  const data = await response.json() as Record<string, unknown>
  return {
    jobId: (data.job_id as string) ?? (data.id as string) ?? '',
    status: (data.status as string) ?? 'pending',
    model,
  }
}

// ── STT Poll ──────────────────────────────────────────────────────────────────

export async function genxPollStt(
  jobId: string,
  request?: Pick<GenxSttRequest, 'apiKey' | 'baseUrl'> & { pollAttempt?: number },
): Promise<GenxSttPollResponse> {
  const apiKey = resolveGenxApiKey(request?.apiKey)
  const baseUrl = resolveGenxBaseUrl(request?.baseUrl)

  const response = await fetch(`${baseUrl}/api/v1/jobs/${jobId}`, {
    method: 'GET',
    headers: { 'Authorization': `Bearer ${apiKey}` },
  })

  if (!response.ok) {
    const errBody = await response.text()
    const bodySnippet = shortSafeBody(errBody, [apiKey])
    throw new Error(`GenX STT poll error ${response.status} for providerJobId=${jobId}: ${bodySnippet}`)
  }

  const data = await response.json() as Record<string, unknown>
  let status: GenxSttPollResponse['status'] = 'pending'
  const rawStatus = String(data.status ?? 'pending').toLowerCase()
  if (rawStatus === 'completed' || rawStatus === 'done') status = 'completed'
  else if (rawStatus === 'failed' || rawStatus === 'error') status = 'failed'
  else if (rawStatus === 'processing' || rawStatus === 'running') status = 'processing'

  const result = data.result as Record<string, unknown> | undefined
  const transcript = (data.transcript ?? result?.transcript) as string | undefined
  const language = (data.language ?? result?.language) as string | undefined
  const duration = (data.duration ?? result?.duration) as number | undefined
  const segments = (data.segments ?? result?.segments) as GenxSttPollResponse['segments']

  return {
    jobId,
    status,
    progress: typeof data.progress === 'number' ? data.progress : status === 'completed' ? 100 : 0,
    resultUrl: extractResultUrl(data),
    transcript,
    language,
    duration,
    segments,
    error: typeof data.error === 'string' ? data.error : undefined,
    metadata: data as Record<string, unknown>,
  }
}

// ── STT Full Generate ─────────────────────────────────────────────────────────

export async function genxGenerateStt(request: GenxSttRequest): Promise<GenxSttResult> {
  const apiKey = resolveGenxApiKey(request.apiKey)
  const baseUrl = resolveGenxBaseUrl(request.baseUrl)
  const model = request.model?.trim()
  if (!model) throw new Error('GenX STT transport requires the exact Orchestra-selected model')

  const submitResult = await genxSubmitStt(request)
  if (!submitResult.jobId) throw new Error('GenX STT did not return a job ID')

  let attempts = 0
  while (attempts < GENX_STT_POLL_MAX_ATTEMPTS) {
    await sleep(GENX_STT_POLL_INTERVAL_MS)
    attempts++
    const pollResult = await genxPollStt(submitResult.jobId, { apiKey, baseUrl, pollAttempt: attempts })
    if (pollResult.status === 'completed') {
      const text = pollResult.transcript ?? ''
      if (!text.trim()) throw new Error('GenX STT completed but transcript is empty')
      return {
        text,
        language: pollResult.language ?? 'en',
        duration: pollResult.duration ?? 0,
        segments: pollResult.segments ?? [],
        model,
        providerJobId: submitResult.jobId,
        metadata: { provider: 'genx', capability: 'stt', model },
      }
    }
    if (pollResult.status === 'failed') throw new Error(`GenX STT failed: ${pollResult.error ?? 'unknown'}`)
  }
  throw new Error(`GenX STT poll timed out after ${GENX_STT_POLL_MAX_ATTEMPTS} attempts`)
}
