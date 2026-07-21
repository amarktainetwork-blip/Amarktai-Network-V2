import { afterEach, describe, expect, it, vi } from 'vitest'
import { deepinfraGenerateVideo } from '../packages/providers/src/deepinfra-video-client.ts'

function box(type: string, payload: Buffer): Buffer {
  const header = Buffer.alloc(8); header.writeUInt32BE(8 + payload.length, 0); header.write(type, 4, 4, 'ascii'); return Buffer.concat([header, payload])
}

function videoFixture(): Buffer {
  const ftyp = box('ftyp', Buffer.from('isom0000'))
  const mvhd = Buffer.alloc(100); mvhd.writeUInt32BE(1_000, 12); mvhd.writeUInt32BE(5_000, 16)
  const tkhd = Buffer.alloc(84); tkhd.writeUInt32BE(1280 * 65_536, 76); tkhd.writeUInt32BE(720 * 65_536, 80)
  return Buffer.concat([ftyp, box('moov', Buffer.concat([box('mvhd', mvhd), box('trak', box('tkhd', tkhd))]))])
}

afterEach(() => vi.unstubAllGlobals())

describe('DeepInfra documented text-to-video transport', () => {
  it('normalizes the canonical v1 base URL and validates the downloaded result', async () => {
    const fixture = videoFixture()
    const fetchMock = vi.fn(async (url: string, init?: RequestInit) => {
      if (init?.method === 'POST') return new Response(JSON.stringify({ video: 'https://cdn.example/deepinfra.mp4' }))
      return new Response(fixture, { headers: { 'content-type': 'video/mp4' } })
    })
    vi.stubGlobal('fetch', fetchMock)

    const result = await deepinfraGenerateVideo({
      apiKey: 'secret',
      baseUrl: 'https://api.deepinfra.com/v1',
      model: 'Wan-AI/Wan2.1-T2V-14B',
      prompt: 'A mountain lake at dawn',
    })

    expect(fetchMock.mock.calls[0]![0]).toBe('https://api.deepinfra.com/v1/inference/Wan-AI/Wan2.1-T2V-14B')
    expect(JSON.parse(String(fetchMock.mock.calls[0]![1]!.body))).toEqual({ prompt: 'A mountain lake at dawn' })
    expect(result).toMatchObject({ model: 'Wan-AI/Wan2.1-T2V-14B', width: 1280, height: 720, duration: 5 })
  })
})
