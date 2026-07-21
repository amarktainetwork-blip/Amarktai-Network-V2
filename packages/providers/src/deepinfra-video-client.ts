import { inspectVideoBuffer } from './media-inspection.js'
import { CanonicalProviderError, normalizeProviderError, providerHttpError } from './provider-errors.js'

export interface DeepInfraVideoRequest {
  apiKey: string
  model: string
  prompt: string
  baseUrl?: string
  signal?: AbortSignal
}

export interface DeepInfraVideoResult {
  videoBuffer: Buffer
  mimeType: string
  duration: number
  width: number
  height: number
  model: string
}

export async function deepinfraGenerateVideo(input: DeepInfraVideoRequest): Promise<DeepInfraVideoResult> {
  if (!input.model.trim()) throw new CanonicalProviderError({ code: 'invalid_request', provider: 'deepinfra', message: 'DeepInfra video requires the exact Orchestra-selected model' })
  const base = (input.baseUrl?.trim() || 'https://api.deepinfra.com')
    .replace(/\/+$/, '')
    .replace(/\/v1(?:\/(?:openai|inference).*)?$/i, '')
  const response = await fetch(`${base}/v1/inference/${encodeModelPath(input.model)}`, {
    method: 'POST',
    headers: { Authorization: `Bearer ${input.apiKey}`, Accept: 'application/json', 'Content-Type': 'application/json' },
    body: JSON.stringify({ prompt: input.prompt }),
    signal: input.signal,
  }).catch((error) => { throw normalizeProviderError('deepinfra', error) })
  const text = await response.text()
  if (!response.ok) throw providerHttpError({ provider: 'deepinfra', status: response.status, body: text })
  let payload: unknown
  try { payload = JSON.parse(text) } catch { throw malformed('DeepInfra video response was not JSON') }
  if (!isRecord(payload)) throw malformed('DeepInfra video response was not an object')
  const videoUrl = firstString(payload.video) || firstString(payload.videos) || firstString(payload.output)
  if (!videoUrl || !/^https?:\/\//i.test(videoUrl)) throw malformed('DeepInfra video response omitted a downloadable video URL')
  const download = await fetch(videoUrl, { signal: input.signal }).catch((error) => { throw normalizeProviderError('deepinfra', error) })
  if (!download.ok) throw providerHttpError({ provider: 'deepinfra', status: download.status, body: await download.text() })
  const videoBuffer = Buffer.from(await download.arrayBuffer())
  const mimeType = download.headers.get('content-type')?.split(';', 1)[0]?.trim().toLowerCase() || 'video/mp4'
  const inspection = inspectVideoBuffer(videoBuffer, mimeType, 'deepinfra')
  return { videoBuffer, mimeType, duration: inspection.duration, width: inspection.width!, height: inspection.height!, model: input.model }
}

function encodeModelPath(model: string): string { return model.split('/').map(encodeURIComponent).join('/') }
function firstString(value: unknown): string {
  if (typeof value === 'string') return value.trim()
  if (Array.isArray(value)) return value.find((item): item is string => typeof item === 'string')?.trim() ?? ''
  return ''
}
function isRecord(value: unknown): value is Record<string, unknown> { return typeof value === 'object' && value !== null && !Array.isArray(value) }
function malformed(message: string): CanonicalProviderError { return new CanonicalProviderError({ code: 'malformed_response', provider: 'deepinfra', message }) }
