import { inspectVideoBuffer } from './media-inspection.js'
import { CanonicalProviderError, normalizeProviderError, providerHttpError } from './provider-errors.js'

const DEFAULT_BASE_URL = 'https://api.together.ai'
export const TOGETHER_VIDEO_POLL_INTERVAL_MS = 5_000
export const TOGETHER_VIDEO_POLL_MAX_ATTEMPTS = 240

export interface TogetherVideoRequest {
  apiKey: string
  model: string
  prompt: string
  baseUrl?: string
  width?: number
  height?: number
  seconds?: number
  fps?: number
  steps?: number
  seed?: number
  guidanceScale?: number
  negativePrompt?: string
  generateAudio?: boolean
  sourceImageDataUrl?: string
  sourceVideoUrl?: string
  referenceVideoUrl?: string
  signal?: AbortSignal
  pollIntervalMs?: number
  pollMaxAttempts?: number
  onSubmitted?: (jobId: string) => Promise<void> | void
  providerJobId?: string
}

export interface TogetherVideoJob {
  id: string
  status: 'queued' | 'in_progress' | 'completed' | 'failed' | 'cancelled'
  outputUrl?: string
  error?: string
  cost?: number
}

export interface TogetherVideoResult {
  videoBuffer: Buffer
  mimeType: string
  duration: number
  width: number
  height: number
  model: string
  providerJobId: string
  cost?: number
}

export async function togetherSubmitVideo(input: TogetherVideoRequest): Promise<TogetherVideoJob> {
  if (!input.model.trim()) throw invalid('Together video requires the exact Orchestra-selected model')
  const body: Record<string, unknown> = { model: input.model, prompt: input.prompt }
  if (input.width) body.width = input.width
  if (input.height) body.height = input.height
  if (input.seconds) body.seconds = String(input.seconds)
  if (input.fps) body.fps = input.fps
  if (input.steps) body.steps = input.steps
  if (input.seed !== undefined) body.seed = input.seed
  if (input.guidanceScale !== undefined) body.guidance_scale = input.guidanceScale
  if (input.negativePrompt) body.negative_prompt = input.negativePrompt
  if (input.generateAudio !== undefined) body.generate_audio = input.generateAudio
  if (input.sourceImageDataUrl) body.media = { frame_images: [{ input_image: input.sourceImageDataUrl, frame: 'first' }] }
  if (input.sourceVideoUrl) body.media = { frame_videos: [{ video: input.sourceVideoUrl }] }
  if (input.referenceVideoUrl) body.media = { reference_videos: [{ video: input.referenceVideoUrl }] }

  const response = await fetch(`${baseUrl(input.baseUrl)}/v2/videos`, {
    method: 'POST',
    headers: headers(input.apiKey),
    body: JSON.stringify(body),
    signal: input.signal,
  }).catch((error) => { throw normalizeProviderError('together', error) })
  const payload = await responsePayload(response)
  if (!response.ok) throw providerHttpError({ provider: 'together', status: response.status, body: payload.text })
  return normalizeJob(payload.json)
}

export async function togetherPollVideo(jobId: string, options: Pick<TogetherVideoRequest, 'apiKey' | 'baseUrl' | 'signal'>): Promise<TogetherVideoJob> {
  const response = await fetch(`${baseUrl(options.baseUrl)}/v2/videos/${encodeURIComponent(jobId)}`, {
    headers: headers(options.apiKey),
    signal: options.signal,
  }).catch((error) => { throw normalizeProviderError('together', error) })
  const payload = await responsePayload(response)
  if (!response.ok) throw providerHttpError({ provider: 'together', status: response.status, body: payload.text })
  return normalizeJob(payload.json)
}

export async function togetherDownloadVideo(url: string, signal?: AbortSignal): Promise<Omit<TogetherVideoResult, 'model' | 'providerJobId' | 'cost'>> {
  const response = await fetch(url, { signal }).catch((error) => { throw normalizeProviderError('together', error) })
  if (!response.ok) throw providerHttpError({ provider: 'together', status: response.status, body: await response.text() })
  const videoBuffer = Buffer.from(await response.arrayBuffer())
  const mimeType = response.headers.get('content-type')?.split(';', 1)[0]?.trim().toLowerCase() || inferVideoMime(videoBuffer)
  const inspection = inspectVideoBuffer(videoBuffer, mimeType, 'together')
  return {
    videoBuffer,
    mimeType,
    duration: inspection.duration,
    width: inspection.width!,
    height: inspection.height!,
  }
}

export async function togetherGenerateVideo(input: TogetherVideoRequest): Promise<TogetherVideoResult> {
  const submitted = input.providerJobId
    ? await togetherPollVideo(input.providerJobId, input)
    : await togetherSubmitVideo(input)
  if (!input.providerJobId) await input.onSubmitted?.(submitted.id)
  const attempts = input.pollMaxAttempts ?? TOGETHER_VIDEO_POLL_MAX_ATTEMPTS
  const interval = input.pollIntervalMs ?? TOGETHER_VIDEO_POLL_INTERVAL_MS
  let job = submitted
  for (let attempt = 0; attempt < attempts; attempt++) {
    if (job.status === 'completed') {
      if (!job.outputUrl) throw malformed('Together completed video job without outputs.video_url')
      const downloaded = await togetherDownloadVideo(job.outputUrl, input.signal)
      return { ...downloaded, model: input.model, providerJobId: job.id, cost: job.cost }
    }
    if (job.status === 'failed') throw new CanonicalProviderError({ code: 'provider_unavailable', provider: 'together', message: job.error || 'Together video generation failed' })
    if (job.status === 'cancelled') throw new CanonicalProviderError({ code: 'cancelled_request', provider: 'together', message: 'Together video generation was cancelled' })
    await delay(interval, input.signal)
    job = await togetherPollVideo(job.id, input)
  }
  throw new CanonicalProviderError({ code: 'provider_timeout', provider: 'together', message: `Together video generation timed out after ${attempts} polls` })
}

function normalizeJob(value: unknown): TogetherVideoJob {
  if (!isRecord(value)) throw malformed('Together video response was not an object')
  const id = stringValue(value.id) || stringValue(value.job_id)
  const rawStatus = stringValue(value.status).toLowerCase()
  const status = rawStatus === 'processing' ? 'in_progress' : rawStatus
  if (!id || !['queued', 'in_progress', 'completed', 'failed', 'cancelled'].includes(status)) {
    throw malformed('Together video response omitted a valid id or status')
  }
  const outputs = isRecord(value.outputs) ? value.outputs : {}
  return {
    id,
    status: status as TogetherVideoJob['status'],
    outputUrl: stringValue(outputs.video_url) || stringValue(value.video_url) || undefined,
    error: stringValue(value.error) || stringValue(value.message) || undefined,
    cost: finiteNumber(outputs.cost) ?? finiteNumber(value.cost) ?? undefined,
  }
}

async function responsePayload(response: Response): Promise<{ text: string; json: unknown }> {
  const text = await response.text()
  try { return { text, json: text ? JSON.parse(text) : null } } catch { return { text, json: null } }
}

function headers(apiKey: string): Record<string, string> {
  return { Authorization: `Bearer ${apiKey}`, Accept: 'application/json', 'Content-Type': 'application/json' }
}

function baseUrl(value?: string): string {
  return (value?.trim() || DEFAULT_BASE_URL)
    .replace(/\/+$/, '')
    .replace(/\/v[12](?:\/.*)?$/i, '')
}
function stringValue(value: unknown): string { return typeof value === 'string' ? value.trim() : '' }
function finiteNumber(value: unknown): number | null { return typeof value === 'number' && Number.isFinite(value) ? value : null }
function isRecord(value: unknown): value is Record<string, unknown> { return typeof value === 'object' && value !== null && !Array.isArray(value) }
function malformed(message: string): CanonicalProviderError { return new CanonicalProviderError({ code: 'malformed_response', provider: 'together', message }) }
function invalid(message: string): CanonicalProviderError { return new CanonicalProviderError({ code: 'invalid_request', provider: 'together', message }) }
function inferVideoMime(buffer: Buffer): string {
  if (buffer.length >= 12 && buffer.subarray(4, 8).toString('ascii') === 'ftyp') return 'video/mp4'
  if (buffer.length >= 4 && buffer.subarray(0, 4).equals(Buffer.from([0x1a, 0x45, 0xdf, 0xa3]))) return 'video/webm'
  return 'application/octet-stream'
}
function delay(ms: number, signal?: AbortSignal): Promise<void> {
  return new Promise((resolve, reject) => {
    if (signal?.aborted) return reject(new DOMException('Aborted', 'AbortError'))
    const timer = setTimeout(resolve, ms)
    signal?.addEventListener('abort', () => { clearTimeout(timer); reject(new DOMException('Aborted', 'AbortError')) }, { once: true })
  })
}
