/**
 * Groq REST client — live integration for text.chat, voice.stt, voice.tts.
 *
 * Uses the official Groq chat and audio REST API.
 * All API key resolution goes through @amarktai/core config (single source of truth).
 */

import {
  getGroqApiKey,
  GROQ_BASE_URL,
  GROQ_DEFAULT_MODEL,
  GROQ_STT_MODEL,
  GROQ_TTS_MODEL,
  GROQ_TTS_MAX_CHARS,
} from '@amarktai/core'
import {
  openAiChatCompletion,
  type OpenAiToolCall,
  type OpenAiToolDefinition,
  type OpenAiTransportMessage,
} from './openai-transport.js'
import { CanonicalProviderError, providerHttpError } from './provider-errors.js'

// ── Types ─────────────────────────────────────────────────────────────────────

export interface GroqChatRequest {
  prompt: string
  apiKey?: string
  model?: string
  systemPrompt?: string
  maxTokens?: number
  temperature?: number
  messages?: OpenAiTransportMessage[]
  responseFormat?: Record<string, unknown>
  tools?: OpenAiToolDefinition[]
  toolChoice?: 'auto' | 'none' | 'required'
  reasoningEffort?: 'low' | 'medium' | 'high'
}

export interface GroqChatResponse {
  content: string
  model: string
  usage: { promptTokens: number; completionTokens: number; totalTokens: number }
  finishReason: string
  reasoningSummary: string | null
  toolCalls: OpenAiToolCall[]
}

export interface GroqSttResponse {
  text: string
  language: string
  duration: number
  segments: Array<Record<string, unknown>>
  words: Array<Record<string, unknown>>
  model: string
}

export interface GroqTtsResponse {
  audioBuffer: Buffer
  model: string
  voice: string
  mimeType: string
  duration: number
  outputFormat: 'wav' | 'mp3' | 'flac' | 'ogg'
  chunkCount: number
}

export interface GroqSttOptions {
  apiKey?: string
  model?: string
  language?: string
  timestamps?: 'none' | 'segment' | 'word' | 'both'
  translateToEnglish?: boolean
  mimeType?: string
}

export interface GroqTtsRequest {
  text: string
  apiKey?: string
  model?: string
  voice?: string
  speed?: number
  outputFormat?: 'wav' | 'mp3' | 'flac' | 'ogg'
}

// ── Chat Completion ───────────────────────────────────────────────────────────

export async function groqChat(request: GroqChatRequest): Promise<GroqChatResponse> {
  const apiKey = request.apiKey ?? getGroqApiKey()
  const model = request.model ?? GROQ_DEFAULT_MODEL

  const messages: OpenAiTransportMessage[] = []
  if (request.systemPrompt) {
    messages.push({ role: 'system', content: request.systemPrompt })
  }
  messages.push(...(request.messages ?? []))
  if (request.prompt.trim()) messages.push({ role: 'user', content: request.prompt })

  const result = await openAiChatCompletion({
    provider: 'groq',
    baseUrl: GROQ_BASE_URL,
    apiKey,
    model,
    messages,
    maxOutputTokens: request.maxTokens,
    temperature: request.temperature,
    responseFormat: request.responseFormat,
    tools: request.tools,
    toolChoice: request.toolChoice,
    reasoningEffort: request.reasoningEffort,
  })

  return {
    content: result.content,
    model: result.model,
    usage: {
      promptTokens: result.usage.inputTokens,
      completionTokens: result.usage.outputTokens,
      totalTokens: result.usage.totalTokens,
    },
    finishReason: result.finishReason,
    reasoningSummary: result.reasoningSummary,
    toolCalls: result.toolCalls,
  }
}

// ── Speech-to-Text (Whisper) ──────────────────────────────────────────────────

export async function groqStt(audioBuffer: Buffer, filename: string, options: GroqSttOptions = {}): Promise<GroqSttResponse> {
  if (audioBuffer.length === 0) throw new CanonicalProviderError({ code: 'artifact_validation', provider: 'groq', message: 'STT source artifact is empty' })
  const apiKey = options.apiKey ?? getGroqApiKey()
  const model = options.model ?? GROQ_STT_MODEL

  const formData = new FormData()
  formData.append('file', new Blob([new Uint8Array(audioBuffer)], { type: options.mimeType ?? 'audio/wav' }), filename)
  formData.append('model', model)
  formData.append('response_format', 'verbose_json')
  if (options.language) formData.append('language', options.language)
  if (options.timestamps === 'word' || options.timestamps === 'both') formData.append('timestamp_granularities[]', 'word')
  if (options.timestamps !== 'none' && options.timestamps !== 'word') formData.append('timestamp_granularities[]', 'segment')

  const endpoint = options.translateToEnglish ? 'translations' : 'transcriptions'
  const response = await fetch(`${GROQ_BASE_URL}/audio/${endpoint}`, {
    method: 'POST',
    headers: {
      'Authorization': `Bearer ${apiKey}`,
    },
    body: formData,
  })

  if (!response.ok) {
    const errBody = await response.text()
    throw providerHttpError({ provider: 'groq', status: response.status, body: errBody })
  }

  const data = await response.json() as Record<string, unknown>

  const text = (data.text as string) ?? ''
  if (!text.trim()) throw new CanonicalProviderError({ code: 'malformed_response', provider: 'groq', message: 'Groq STT returned an empty transcript' })
  return {
    text,
    language: (data.language as string) ?? 'en',
    duration: (data.duration as number) ?? 0,
    segments: Array.isArray(data.segments) ? data.segments.filter(isRecord) : [],
    words: Array.isArray(data.words) ? data.words.filter(isRecord) : [],
    model,
  }
}

// ── Text-to-Speech (Orpheus) with 200-char chunking ──────────────────────────

/**
 * Orpheus TTS enforces a strict 200-character limit per payload.
 * This function automatically slices the input into sub-200 char segments,
 * requests individual audio pieces sequentially, and concatenates the raw
 * WAV data buffers into a single unified payload.
 */
export async function groqTts(input: string | GroqTtsRequest): Promise<GroqTtsResponse> {
  const request: GroqTtsRequest = typeof input === 'string' ? { text: input } : input
  const text = request.text.trim()
  if (!text) throw new CanonicalProviderError({ code: 'invalid_request', provider: 'groq', message: 'TTS text must not be empty' })
  const apiKey = request.apiKey ?? getGroqApiKey()
  const model = request.model ?? GROQ_TTS_MODEL
  const voice = request.voice ?? 'tara'
  const outputFormat = request.outputFormat ?? 'wav'
  const speed = request.speed ?? 1
  const chunks = chunkText(text, GROQ_TTS_MAX_CHARS)
  const audioBuffers: Buffer[] = []

  for (const chunk of chunks) {
    const response = await fetch(`${GROQ_BASE_URL}/audio/speech`, {
      method: 'POST',
      headers: {
        'Authorization': `Bearer ${apiKey}`,
        'Content-Type': 'application/json',
      },
      body: JSON.stringify({
        model,
        input: chunk,
        voice,
        speed,
        response_format: outputFormat,
      }),
    })

    if (!response.ok) {
      const errBody = await response.text()
      throw providerHttpError({ provider: 'groq', status: response.status, body: errBody })
    }

    const arrayBuffer = await response.arrayBuffer()
    const buffer = Buffer.from(arrayBuffer)
    validateAudioBuffer(buffer, outputFormat)
    audioBuffers.push(buffer)
  }

  const concatenated = outputFormat === 'wav' ? concatenateWavBuffers(audioBuffers) : Buffer.concat(audioBuffers)
  validateAudioBuffer(concatenated, outputFormat)

  return {
    audioBuffer: concatenated,
    model,
    voice,
    mimeType: audioMimeType(outputFormat),
    duration: outputFormat === 'wav' ? wavDurationSeconds(concatenated) : 0,
    outputFormat,
    chunkCount: chunks.length,
  }
}

// ── Text Chunking ─────────────────────────────────────────────────────────────

/**
 * Splits text into segments each ≤ maxChars.
 * Splits on sentence boundaries when possible, falls back to word boundaries.
 */
function chunkText(text: string, maxChars: number): string[] {
  if (text.length <= maxChars) return [text]

  const chunks: string[] = []
  let remaining = text.trim()

  while (remaining.length > 0) {
    if (remaining.length <= maxChars) {
      chunks.push(remaining)
      break
    }

    // Try to split at sentence boundary within limit
    let splitPoint = -1
    const searchSlice = remaining.slice(0, maxChars)

    // Look for sentence-ending punctuation followed by space
    const sentenceMatch = searchSlice.match(/.*[.!?]\s+/s)
    if (sentenceMatch && sentenceMatch[0].length > maxChars * 0.3) {
      splitPoint = sentenceMatch[0].length
    }

    // Fall back to last space within limit
    if (splitPoint <= 0) {
      const lastSpace = searchSlice.lastIndexOf(' ')
      splitPoint = lastSpace > 0 ? lastSpace : maxChars
    }

    chunks.push(remaining.slice(0, splitPoint).trim())
    remaining = remaining.slice(splitPoint).trim()
  }

  return chunks.filter((c) => c.length > 0)
}

// ── WAV Concatenation ─────────────────────────────────────────────────────────

/**
 * Concatenates multiple WAV buffers into a single WAV file.
 * Assumes all buffers share the same sample rate, channels, and bit depth.
 * Strips individual WAV headers and rebuilds a single header for the combined data.
 */
function concatenateWavBuffers(buffers: Buffer[]): Buffer {
  if (buffers.length === 0) return Buffer.alloc(0)
  if (buffers.length === 1) return buffers[0]!

  // Extract format info from first buffer
  const first = buffers[0]!
  const numChannels = first.readUInt16LE(22)
  const sampleRate = first.readUInt32LE(24)
  const bitsPerSample = first.readUInt16LE(34)
  const bytesPerSample = bitsPerSample / 8

  // Extract raw PCM data from each buffer (skip 44-byte WAV header)
  const pcmChunks: Buffer[] = []
  for (const buf of buffers) {
    // Find the 'data' chunk
    let dataOffset = 44 // Default WAV header size
    for (let i = 12; i < buf.length - 8; i++) {
      if (buf.subarray(i, i + 4).toString() === 'data') {
        dataOffset = i + 8
        break
      }
    }
    pcmChunks.push(buf.subarray(dataOffset))
  }

  const totalPcmSize = pcmChunks.reduce((sum, c) => sum + c.length, 0)
  const headerSize = 44
  const output = Buffer.alloc(headerSize + totalPcmSize)

  // RIFF header
  output.write('RIFF', 0)
  output.writeUInt32LE(36 + totalPcmSize, 4)
  output.write('WAVE', 8)

  // fmt chunk
  output.write('fmt ', 12)
  output.writeUInt32LE(16, 16)
  output.writeUInt16LE(1, 20) // PCM
  output.writeUInt16LE(numChannels, 22)
  output.writeUInt32LE(sampleRate, 24)
  output.writeUInt32LE(sampleRate * numChannels * bytesPerSample, 28)
  output.writeUInt16LE(numChannels * bytesPerSample, 32)
  output.writeUInt16LE(bitsPerSample, 34)

  // data chunk
  output.write('data', 36)
  output.writeUInt32LE(totalPcmSize, 40)

  // Copy PCM data
  let offset = headerSize
  for (const chunk of pcmChunks) {
    chunk.copy(output, offset)
    offset += chunk.length
  }

  return output
}

function validateAudioBuffer(buffer: Buffer, format: GroqTtsResponse['outputFormat']): void {
  const valid = format === 'wav'
    ? buffer.length >= 44 && buffer.subarray(0, 4).toString('ascii') === 'RIFF' && buffer.subarray(8, 12).toString('ascii') === 'WAVE'
    : format === 'flac'
      ? buffer.length >= 4 && buffer.subarray(0, 4).toString('ascii') === 'fLaC'
      : format === 'ogg'
        ? buffer.length >= 4 && buffer.subarray(0, 4).toString('ascii') === 'OggS'
        : buffer.length >= 3 && (buffer.subarray(0, 3).toString('ascii') === 'ID3' || (buffer[0] === 0xff && (buffer[1]! & 0xe0) === 0xe0))
  if (!valid) throw new CanonicalProviderError({ code: 'artifact_validation', provider: 'groq', message: `Groq TTS returned invalid ${format} audio bytes` })
}

function audioMimeType(format: GroqTtsResponse['outputFormat']): string {
  return format === 'wav' ? 'audio/wav' : format === 'mp3' ? 'audio/mpeg' : format === 'flac' ? 'audio/flac' : 'audio/ogg'
}

function wavDurationSeconds(buffer: Buffer): number {
  if (buffer.length < 44) return 0
  const byteRate = buffer.readUInt32LE(28)
  const dataSize = buffer.readUInt32LE(40)
  return byteRate > 0 ? dataSize / byteRate : 0
}

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === 'object' && value !== null && !Array.isArray(value)
}
