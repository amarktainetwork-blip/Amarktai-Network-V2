import { DEEPINFRA_BASE_URL } from '@amarktai/core'
import { CanonicalProviderError, normalizeProviderError, providerHttpError } from './provider-errors.js'

export interface DeepInfraImageEditRequest {
  apiKey: string
  model: string
  imageBuffer: Buffer
  imageMimeType: string
  prompt: string
  maskBuffer?: Buffer
  maskMimeType?: string
  size?: string
  baseUrl?: string
  timeoutMs?: number
  signal?: AbortSignal
}

export interface DeepInfraImageEditResponse {
  imageBuffer: Buffer
  mimeType: 'image/png' | 'image/jpeg' | 'image/webp'
  revisedPrompt?: string
  model: string
}

function apiRoot(baseUrl?: string): string {
  return (baseUrl?.trim() || DEEPINFRA_BASE_URL)
    .replace(/\/v1\/openai\/?$/i, '')
    .replace(/\/v1\/?$/i, '')
    .replace(/\/$/, '')
}

function extensionForMime(mimeType: string): string {
  if (mimeType === 'image/jpeg') return 'jpg'
  if (mimeType === 'image/webp') return 'webp'
  return 'png'
}

function detectImageMime(buffer: Buffer): DeepInfraImageEditResponse['mimeType'] {
  if (buffer.length >= 8 && buffer.subarray(0, 8).equals(Buffer.from([0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a]))) return 'image/png'
  if (buffer.length >= 3 && buffer[0] === 0xff && buffer[1] === 0xd8 && buffer[2] === 0xff) return 'image/jpeg'
  if (buffer.length >= 12 && buffer.subarray(0, 4).toString('ascii') === 'RIFF' && buffer.subarray(8, 12).toString('ascii') === 'WEBP') return 'image/webp'
  throw new CanonicalProviderError({ code: 'malformed_response', provider: 'deepinfra', message: 'DeepInfra image edit returned bytes without a supported image signature' })
}

export async function deepinfraEditImage(request: DeepInfraImageEditRequest): Promise<DeepInfraImageEditResponse> {
  const controller = new AbortController()
  let timedOut = false
  const timeout = setTimeout(() => {
    timedOut = true
    controller.abort(new Error('provider timeout'))
  }, request.timeoutMs ?? 120_000)
  const cancel = () => controller.abort(request.signal?.reason)
  request.signal?.addEventListener('abort', cancel, { once: true })

  try {
    if (!request.model.trim()) throw new CanonicalProviderError({ code: 'invalid_request', provider: 'deepinfra', message: 'DeepInfra image edit requires an Orchestra-selected model' })
    if (!request.prompt.trim()) throw new CanonicalProviderError({ code: 'invalid_request', provider: 'deepinfra', message: 'DeepInfra image edit requires a prompt' })
    if (!request.imageBuffer.length) throw new CanonicalProviderError({ code: 'invalid_request', provider: 'deepinfra', message: 'DeepInfra image edit requires source image bytes' })

    const form = new FormData()
    form.append('image', new Blob([request.imageBuffer], { type: request.imageMimeType }), `source.${extensionForMime(request.imageMimeType)}`)
    form.append('prompt', request.prompt)
    form.append('model', request.model)
    form.append('n', '1')
    form.append('response_format', 'b64_json')
    if (request.size) form.append('size', request.size)
    if (request.maskBuffer?.length) {
      form.append('mask', new Blob([request.maskBuffer], { type: request.maskMimeType || 'image/png' }), `mask.${extensionForMime(request.maskMimeType || 'image/png')}`)
    }

    const response = await fetch(`${apiRoot(request.baseUrl)}/v1/images/edits`, {
      method: 'POST',
      headers: { Authorization: `Bearer ${request.apiKey}`, Accept: 'application/json' },
      body: form,
      signal: controller.signal,
    })
    const body = await response.text()
    if (!response.ok) throw providerHttpError({ provider: 'deepinfra', status: response.status, body })

    let parsed: unknown
    try { parsed = body ? JSON.parse(body) : null }
    catch (error) {
      throw new CanonicalProviderError({ code: 'malformed_response', provider: 'deepinfra', message: 'DeepInfra image edit returned unreadable JSON', cause: error })
    }
    const record = typeof parsed === 'object' && parsed !== null && !Array.isArray(parsed) ? parsed as Record<string, unknown> : {}
    const data = Array.isArray(record.data) ? record.data : []
    const first = typeof data[0] === 'object' && data[0] !== null && !Array.isArray(data[0]) ? data[0] as Record<string, unknown> : {}
    const encoded = typeof first.b64_json === 'string' ? first.b64_json.trim() : ''
    if (!encoded) throw new CanonicalProviderError({ code: 'malformed_response', provider: 'deepinfra', message: 'DeepInfra image edit response did not include base64 image data' })
    const imageBuffer = Buffer.from(encoded, 'base64')
    if (!imageBuffer.length) throw new CanonicalProviderError({ code: 'malformed_response', provider: 'deepinfra', message: 'DeepInfra image edit returned empty image data' })

    return {
      imageBuffer,
      mimeType: detectImageMime(imageBuffer),
      revisedPrompt: typeof first.revised_prompt === 'string' && first.revised_prompt.trim() ? first.revised_prompt.trim() : undefined,
      model: request.model,
    }
  } catch (error) {
    if (timedOut) throw new CanonicalProviderError({ code: 'provider_timeout', provider: 'deepinfra', message: 'DeepInfra image edit request timed out', cause: error })
    throw normalizeProviderError('deepinfra', error)
  } finally {
    clearTimeout(timeout)
    request.signal?.removeEventListener('abort', cancel)
  }
}
