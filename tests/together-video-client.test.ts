import { afterEach, describe, expect, it, vi } from 'vitest'
import { togetherGenerateVideo } from '../packages/providers/src/together-video-client.ts'

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

describe('Together managed video transport', () => {
  it('submits exact model and actual source image, polls, downloads, and validates media', async () => {
    const calls: Array<{ url: string; init?: RequestInit }> = []
    const fixture = videoFixture()
    vi.stubGlobal('fetch', vi.fn(async (url: string, init?: RequestInit) => {
      calls.push({ url: String(url), init })
      if (String(url).endsWith('/v2/videos') && init?.method === 'POST') return new Response(JSON.stringify({ id: 'video-job-1', status: 'queued' }), { status: 200 })
      if (String(url).endsWith('/v2/videos/video-job-1')) return new Response(JSON.stringify({ id: 'video-job-1', status: 'completed', outputs: { video_url: 'https://cdn.example/video.mp4', cost: 0.2 } }), { status: 200 })
      return new Response(fixture, { status: 200, headers: { 'content-type': 'video/mp4' } })
    }))
    const source = 'data:image/png;base64,iVBORw0KGgoAAAANSUhEUg=='
    const result = await togetherGenerateVideo({ apiKey: 'secret', model: 'provider/new-i2v', prompt: 'animate', sourceImageDataUrl: source, pollIntervalMs: 0 })
    const submitted = JSON.parse(String(calls[0]!.init!.body))
    expect(submitted).toMatchObject({ model: 'provider/new-i2v', media: { frame_images: [{ input_image: source, frame: 'first' }] } })
    expect(result).toMatchObject({ model: 'provider/new-i2v', providerJobId: 'video-job-1', width: 1280, height: 720, duration: 5, cost: 0.2 })
    expect(calls.every((call) => !String(call.init?.body ?? '').includes('another-provider'))).toBe(true)
  })

  it('resumes a persisted job without creating another provider job', async () => {
    const fetchMock = vi.fn(async (url: string) => String(url).includes('/v2/videos/persisted')
      ? new Response(JSON.stringify({ id: 'persisted', status: 'completed', outputs: { video_url: 'https://cdn.example/video.mp4' } }))
      : new Response(videoFixture(), { headers: { 'content-type': 'video/mp4' } }))
    vi.stubGlobal('fetch', fetchMock)
    await togetherGenerateVideo({ apiKey: 'secret', model: 'exact-model', prompt: 'resume', providerJobId: 'persisted', pollIntervalMs: 0 })
    expect(fetchMock.mock.calls.some(([, init]) => init?.method === 'POST')).toBe(false)
  })

  it('normalizes the canonical configured v1 base URL before calling the v2 video API', async () => {
    const fixture = videoFixture()
    const fetchMock = vi.fn(async (url: string, init?: RequestInit) => {
      if (init?.method === 'POST') return new Response(JSON.stringify({ id: 'normalized', status: 'completed', outputs: { video_url: 'https://cdn.example/video.mp4' } }))
      return new Response(fixture, { headers: { 'content-type': 'video/mp4' } })
    })
    vi.stubGlobal('fetch', fetchMock)
    await togetherGenerateVideo({ apiKey: 'secret', baseUrl: 'https://api.together.xyz/v1', model: 'exact-model', prompt: 'normalize', pollIntervalMs: 0 })
    expect(fetchMock.mock.calls[0]![0]).toBe('https://api.together.xyz/v2/videos')
  })

  it('sends the authorised source-video URL as a reference video', async () => {
    const fixture = videoFixture()
    const fetchMock = vi.fn(async (url: string, init?: RequestInit) => {
      if (String(url).endsWith('/v2/videos') && init?.method === 'POST') return new Response(JSON.stringify({ id: 'video-job-v2v', status: 'completed', outputs: { video_url: 'https://cdn.example/video.mp4' } }))
      return new Response(fixture, { headers: { 'content-type': 'video/mp4' } })
    })
    vi.stubGlobal('fetch', fetchMock)
    const referenceVideoUrl = 'https://api.example.com/api/v1/provider-media/artifact-1?expires=1&signature=signed'
    await togetherGenerateVideo({ apiKey: 'secret', model: 'Wan-AI/wan2.7-r2v', prompt: 'continue this subject', referenceVideoUrl, pollIntervalMs: 0 })
    const body = JSON.parse(String(fetchMock.mock.calls[0]![1]!.body))
    expect(body.media).toEqual({ reference_videos: [{ video: referenceVideoUrl }] })
  })
})
