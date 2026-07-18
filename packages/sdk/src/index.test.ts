import { describe, expect, it, vi } from 'vitest'
import { AmarktAIClient, AmarktAIError } from './index.js'

describe('AmarktAIClient', () => {
  it('sends automatic and approved fixed-route requests without arbitrary overrides', async () => {
    const transport = vi.fn(async (_url: string, _init: RequestInit) => new Response(JSON.stringify({ jobId: 'job-1' }), { status: 201, headers: { 'content-type': 'application/json' } }))
    const client = new AmarktAIClient({ apiKey: 'app-key', baseUrl: 'https://example.test', fetch: transport as typeof fetch })
    await client.execute({ capability: 'image_generation', input: { prompt: 'x' }, route: { provider: 'together', model: 'approved/model' } })
    expect(JSON.parse(String(transport.mock.calls[0]![1]!.body))).toMatchObject({ route: { provider: 'together', model: 'approved/model' } })
  })
  it('returns stable typed errors', async () => {
    const client = new AmarktAIClient({ apiKey: 'x', fetch: async () => new Response(JSON.stringify({ code: 'DENIED', message: 'No grant' }), { status: 403 }) })
    await expect(client.policy()).rejects.toBeInstanceOf(AmarktAIError)
  })
  it('downloads authorised artifact ranges without exposing the app key in the URL', async () => {
    const transport = vi.fn(async (_url: string, _init?: RequestInit) => new Response(new Uint8Array([1, 2, 3]), { status: 206 }))
    const client = new AmarktAIClient({ apiKey: 'private-app-key', baseUrl: 'https://example.test', fetch: transport as typeof fetch })
    await client.artifactFile('artifact-1', { download: true, range: 'bytes=0-2' })
    expect(transport.mock.calls[0]![0]).toBe('https://example.test/api/v1/artifacts/artifact-1/file?download=1')
    expect(transport.mock.calls[0]![1]?.headers).toMatchObject({ Authorization: 'Bearer private-app-key', Range: 'bytes=0-2' })
  })
})
