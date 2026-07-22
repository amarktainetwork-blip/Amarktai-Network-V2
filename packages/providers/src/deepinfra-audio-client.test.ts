import { afterEach, describe, expect, it, vi } from 'vitest'
import { deepinfraTextToSpeech } from './deepinfra-audio-client.js'

function wavFixture(): Buffer {
  const sampleRate = 8_000
  const samples = 800
  const dataSize = samples * 2
  const buffer = Buffer.alloc(44 + dataSize)
  buffer.write('RIFF', 0)
  buffer.writeUInt32LE(36 + dataSize, 4)
  buffer.write('WAVE', 8)
  buffer.write('fmt ', 12)
  buffer.writeUInt32LE(16, 16)
  buffer.writeUInt16LE(1, 20)
  buffer.writeUInt16LE(1, 22)
  buffer.writeUInt32LE(sampleRate, 24)
  buffer.writeUInt32LE(sampleRate * 2, 28)
  buffer.writeUInt16LE(2, 32)
  buffer.writeUInt16LE(16, 34)
  buffer.write('data', 36)
  buffer.writeUInt32LE(dataSize, 40)
  return buffer
}

afterEach(() => vi.unstubAllGlobals())

describe('deepinfraTextToSpeech', () => {
  it('uses the current DeepInfra audio speech contract and validates returned audio', async () => {
    const wav = wavFixture()
    const fetchMock = vi.fn(async (url: string | URL | Request, init?: RequestInit) => {
      expect(String(url)).toBe('https://api.deepinfra.com/v1/audio/speech')
      expect(init?.headers).toMatchObject({ Authorization: 'Bearer secret', 'Content-Type': 'application/json' })
      expect(JSON.parse(String(init?.body))).toEqual({
        model: 'hexgrad/Kokoro-82M',
        input: 'Hello from AmarktAI',
        response_format: 'wav',
        speed: 1.1,
        voice: 'af_heart',
      })
      return new Response(wav, { status: 200, headers: { 'Content-Type': 'audio/wav' } })
    })
    vi.stubGlobal('fetch', fetchMock)

    const result = await deepinfraTextToSpeech({
      apiKey: 'secret',
      model: 'hexgrad/Kokoro-82M',
      text: 'Hello from AmarktAI',
      voice: 'af_heart',
      responseFormat: 'wav',
      speed: 1.1,
    })

    expect(result).toMatchObject({ model: 'hexgrad/Kokoro-82M', mimeType: 'audio/wav', voice: 'af_heart' })
    expect(result.duration).toBeCloseTo(0.1, 2)
    expect(result.audioBuffer.equals(wav)).toBe(true)
  })

  it('rejects speed outside the documented contract before issuing a request', async () => {
    const fetchMock = vi.fn()
    vi.stubGlobal('fetch', fetchMock)
    await expect(deepinfraTextToSpeech({
      apiKey: 'secret', model: 'hexgrad/Kokoro-82M', text: 'Hello', speed: 5,
    })).rejects.toMatchObject({ code: 'invalid_request', provider: 'deepinfra' })
    expect(fetchMock).not.toHaveBeenCalled()
  })
})
