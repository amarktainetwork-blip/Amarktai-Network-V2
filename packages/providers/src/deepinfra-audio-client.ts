import { DEEPINFRA_BASE_URL } from '@amarktai/core'
import { inspectAudioBuffer } from './media-inspection.js'
import { CanonicalProviderError, normalizeProviderError, providerHttpError } from './provider-errors.js'

export interface DeepInfraSpeechRequest {
  apiKey: string
  model: string
  text: string
  voice?: string
  responseFormat?: 'mp3' | 'opus' | 'flac' | 'wav' | 'pcm'
  speed?: number
  baseUrl?: string
  timeoutMs?: number
  signal?: AbortSignal
}

export interface DeepInfraSpeechResponse {
  audioBuffer: Buffer
  mimeType: string
  duration: number
  voice: string | null
  model: string
}

function apiRoot(baseUrl?: string): string {
  return (baseUrl?.trim() || DEEPINFRA_BASE_URL)
    .replace(/\/v1\/openai\/?$/i, '')
    .replace(/\/v1\/?$/i, '')
    .replace(/\/$/, '')
}

function expectedMime(format: DeepInfraSpeechRequest['responseFormat']): string {
  return ({ mp3: 'audio/mpeg', opus: 'audio/ogg', flac: 'audio/flac', wav: 'audio/wav', pcm: 'audio/L16' } as const)[format || 'wav']
}

export async function deepinfraTextToSpeech(request: DeepInfraSpeechRequest): Promise<DeepInfraSpeechResponse> {
  const controller = new AbortController()
  let timedOut = false
  const timeout = setTimeout(() => {
    timedOut = true
    controller.abort(new Error('provider timeout'))
  }, request.timeoutMs ?? 120_000)
  const cancel = () => controller.abort(request.signal?.reason)
  request.signal?.addEventListener('abort', cancel, { once: true })

  try {
    const model = request.model.trim()
    const text = request.text.trim()
    if (!model) throw new CanonicalProviderError({ code: 'invalid_request', provider: 'deepinfra', message: 'DeepInfra TTS requires an Orchestra-selected model' })
    if (!text) throw new CanonicalProviderError({ code: 'invalid_request', provider: 'deepinfra', message: 'DeepInfra TTS requires nonempty text' })
    const responseFormat = request.responseFormat || 'wav'
    const speed = request.speed ?? 1
    if (!Number.isFinite(speed) || speed < 0.25 || speed > 4) {
      throw new CanonicalProviderError({ code: 'invalid_request', provider: 'deepinfra', message: 'DeepInfra TTS speed must be between 0.25 and 4' })
    }

    const response = await fetch(`${apiRoot(request.baseUrl)}/v1/audio/speech`, {
      method: 'POST',
      headers: { Authorization: `Bearer ${request.apiKey}`, 'Content-Type': 'application/json', Accept: 'audio/*,application/octet-stream' },
      body: JSON.stringify({
        model,
        input: text,
        response_format: responseFormat,
        speed,
        ...(request.voice?.trim() ? { voice: request.voice.trim() } : {}),
      }),
      signal: controller.signal,
    })
    if (!response.ok) throw providerHttpError({ provider: 'deepinfra', status: response.status, body: await response.text() })
    const audioBuffer = Buffer.from(await response.arrayBuffer())
    if (!audioBuffer.length) throw new CanonicalProviderError({ code: 'malformed_response', provider: 'deepinfra', message: 'DeepInfra TTS returned empty audio bytes' })
    const mimeType = response.headers.get('content-type')?.split(';', 1)[0]?.trim() || expectedMime(responseFormat)
    const inspected = inspectAudioBuffer(audioBuffer, mimeType, 'deepinfra')
    return {
      audioBuffer,
      mimeType,
      duration: inspected.duration,
      voice: request.voice?.trim() || null,
      model,
    }
  } catch (error) {
    if (timedOut) throw new CanonicalProviderError({ code: 'provider_timeout', provider: 'deepinfra', message: 'DeepInfra TTS request timed out', cause: error })
    throw normalizeProviderError('deepinfra', error)
  } finally {
    clearTimeout(timeout)
    request.signal?.removeEventListener('abort', cancel)
  }
}
