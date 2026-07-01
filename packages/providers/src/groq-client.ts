/**
 * Groq REST client — live integration for text.chat, voice.stt, voice.tts.
 *
 * Uses the official Groq OpenAI-compatible REST API.
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

// ── Types ─────────────────────────────────────────────────────────────────────

export interface GroqChatRequest {
  prompt: string
  model?: string
  systemPrompt?: string
  maxTokens?: number
  temperature?: number
}

export interface GroqChatResponse {
  content: string
  model: string
  usage: { promptTokens: number; completionTokens: number; totalTokens: number }
  finishReason: string
}

export interface GroqSttResponse {
  text: string
  language: string
  duration: number
}

export interface GroqTtsResponse {
  audioBuffer: Buffer
  model: string
}

// ── Chat Completion ───────────────────────────────────────────────────────────

export async function groqChat(request: GroqChatRequest): Promise<GroqChatResponse> {
  const apiKey = getGroqApiKey()
  const model = request.model ?? GROQ_DEFAULT_MODEL

  const messages: Array<{ role: string; content: string }> = []
  if (request.systemPrompt) {
    messages.push({ role: 'system', content: request.systemPrompt })
  }
  messages.push({ role: 'user', content: request.prompt })

  const response = await fetch(`${GROQ_BASE_URL}/chat/completions`, {
    method: 'POST',
    headers: {
      'Authorization': `Bearer ${apiKey}`,
      'Content-Type': 'application/json',
    },
    body: JSON.stringify({
      model,
      messages,
      max_tokens: request.maxTokens ?? 4096,
      temperature: request.temperature ?? 0.7,
    }),
  })

  if (!response.ok) {
    const errBody = await response.text()
    throw new Error(`Groq chat error ${response.status}: ${errBody}`)
  }

  const data = await response.json() as Record<string, unknown>
  const choice = (data.choices as Array<Record<string, unknown>>)?.[0]
  const message = choice?.message as Record<string, unknown> | undefined
  const usage = data.usage as Record<string, number> | undefined

  return {
    content: (message?.content as string) ?? '',
    model: (data.model as string) ?? model,
    usage: {
      promptTokens: usage?.prompt_tokens ?? 0,
      completionTokens: usage?.completion_tokens ?? 0,
      totalTokens: usage?.total_tokens ?? 0,
    },
    finishReason: (choice?.finish_reason as string) ?? 'stop',
  }
}

// ── Speech-to-Text (Whisper) ──────────────────────────────────────────────────

export async function groqStt(audioBuffer: Buffer, filename: string): Promise<GroqSttResponse> {
  const apiKey = getGroqApiKey()

  const formData = new FormData()
  formData.append('file', new Blob([audioBuffer], { type: 'audio/wav' }), filename)
  formData.append('model', GROQ_STT_MODEL)
  formData.append('response_format', 'verbose_json')

  const response = await fetch(`${GROQ_BASE_URL}/audio/transcriptions`, {
    method: 'POST',
    headers: {
      'Authorization': `Bearer ${apiKey}`,
    },
    body: formData,
  })

  if (!response.ok) {
    const errBody = await response.text()
    throw new Error(`Groq STT error ${response.status}: ${errBody}`)
  }

  const data = await response.json() as Record<string, unknown>

  return {
    text: (data.text as string) ?? '',
    language: (data.language as string) ?? 'en',
    duration: (data.duration as number) ?? 0,
  }
}

// ── Text-to-Speech (Orpheus) with 200-char chunking ──────────────────────────

/**
 * Orpheus TTS enforces a strict 200-character limit per payload.
 * This function automatically slices the input into sub-200 char segments,
 * requests individual audio pieces sequentially, and concatenates the raw
 * WAV data buffers into a single unified payload.
 */
export async function groqTts(text: string): Promise<GroqTtsResponse> {
  const apiKey = getGroqApiKey()
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
        model: GROQ_TTS_MODEL,
        input: chunk,
        voice: 'tara',
        response_format: 'wav',
      }),
    })

    if (!response.ok) {
      const errBody = await response.text()
      throw new Error(`Groq TTS error ${response.status}: ${errBody}`)
    }

    const arrayBuffer = await response.arrayBuffer()
    audioBuffers.push(Buffer.from(arrayBuffer))
  }

  // Concatenate all WAV buffers into a single unified payload
  const concatenated = concatenateWavBuffers(audioBuffers)

  return {
    audioBuffer: concatenated,
    model: GROQ_TTS_MODEL,
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
