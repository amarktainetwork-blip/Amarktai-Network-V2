import { TOGETHER_BASE_URL } from '@amarktai/core'
import { inspectAudioBuffer } from './media-inspection.js'
import { providerHttpError } from './provider-errors.js'

export interface TogetherSpeechRequest {
  apiKey: string
  baseUrl?: string
  model: string
  text: string
  voice?: string
  responseFormat?: string
}

export interface TogetherTranscriptionRequest {
  apiKey: string
  baseUrl?: string
  model: string
  audioBuffer: Buffer
  filename: string
  mimeType: string
  language?: string
}

function endpoint(baseUrl: string | undefined, path: string): string {
  return `${(baseUrl?.trim() || TOGETHER_BASE_URL).replace(/\/$/, '')}/${path}`
}

export function resolveTogetherVoice(model: string, requested?: string): string {
  if (requested?.trim()) return requested.trim()
  if (/orpheus/i.test(model)) return 'tara'
  if (/kokoro/i.test(model)) return 'af_heart'
  throw new Error(`Together model '${model}' requires an explicit compatible voice`)
}

export async function togetherTextToSpeech(request: TogetherSpeechRequest): Promise<{
  audioBuffer: Buffer; mimeType: string; duration: number; voice: string
}> {
  const voice = resolveTogetherVoice(request.model, request.voice)
  const responseFormat = request.responseFormat?.trim().toLowerCase() || 'wav'
  const response = await fetch(endpoint(request.baseUrl, 'audio/speech'), {
    method: 'POST',
    headers: { Authorization: `Bearer ${request.apiKey}`, 'Content-Type': 'application/json' },
    body: JSON.stringify({ model: request.model, input: request.text, voice, response_format: responseFormat }),
  })
  if (!response.ok) throw providerHttpError({ provider: 'together', status: response.status, body: await response.text() })
  const audioBuffer = Buffer.from(await response.arrayBuffer())
  const mimeType = response.headers.get('content-type')?.split(';', 1)[0]
    || ({ wav: 'audio/wav', mp3: 'audio/mpeg', flac: 'audio/flac', ogg: 'audio/ogg' }[responseFormat] ?? 'audio/wav')
  const inspected = inspectAudioBuffer(audioBuffer, mimeType, 'together')
  return { audioBuffer, mimeType, duration: inspected.duration, voice }
}

export async function togetherSpeechToText(request: TogetherTranscriptionRequest): Promise<{
  text: string; language: string | null; duration: number | null
}> {
  const form = new FormData()
  form.append('model', request.model)
  form.append('file', new Blob([new Uint8Array(request.audioBuffer)], { type: request.mimeType }), request.filename)
  if (request.language?.trim()) form.append('language', request.language.trim())
  const response = await fetch(endpoint(request.baseUrl, 'audio/transcriptions'), {
    method: 'POST', headers: { Authorization: `Bearer ${request.apiKey}` }, body: form,
  })
  if (!response.ok) throw providerHttpError({ provider: 'together', status: response.status, body: await response.text() })
  const body = await response.json() as Record<string, unknown>
  const text = typeof body.text === 'string' ? body.text.trim() : ''
  if (!text) throw new Error('Together transcription returned empty text')
  return {
    text,
    language: typeof body.language === 'string' ? body.language : null,
    duration: typeof body.duration === 'number' && body.duration > 0 ? body.duration : null,
  }
}
