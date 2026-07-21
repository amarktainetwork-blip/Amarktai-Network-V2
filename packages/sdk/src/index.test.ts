import { describe, expect, it, vi } from 'vitest'
import { AmarktAIClient, AmarktAIError } from './index.js'

describe('AmarktAIClient', () => {
  it('sends outcome requests without provider or model authority', async () => {
    const transport = vi.fn(async (_url: string, _init: RequestInit) => new Response(JSON.stringify({ jobId: 'job-1' }), { status: 201, headers: { 'content-type': 'application/json' } }))
    const client = new AmarktAIClient({ apiKey: 'app-key', baseUrl: 'https://example.test', fetch: transport as typeof fetch })
    await client.execute({ capability: 'image_generation', input: { prompt: 'x' } })
    const payload = JSON.parse(String(transport.mock.calls[0]![1]!.body)) as Record<string, unknown>
    expect(payload).toMatchObject({ capability: 'image_generation', input: { prompt: 'x' } })
    expect(payload).not.toHaveProperty('provider')
    expect(payload).not.toHaveProperty('model')
    expect(payload).not.toHaveProperty('route')
  })

  it('provides app-scoped Brand Profile API methods', async () => {
    const transport = vi.fn(async (_url: string, _init?: RequestInit) => new Response(JSON.stringify({ profile: { brandProfileId: 'brand-1' } }), { status: 200, headers: { 'content-type': 'application/json' } }))
    const client = new AmarktAIClient({ apiKey: 'app-key', baseUrl: 'https://example.test', fetch: transport as typeof fetch })

    await client.brandProfiles()
    await client.brandProfile('brand / one')
    await client.createBrandProfile({ brandProfileId: 'brand-1' })
    await client.updateBrandProfile('brand-1', { brandProfileId: 'brand-1' })
    await client.archiveBrandProfile('brand-1')

    expect(transport.mock.calls.map((call) => call[0])).toEqual([
      'https://example.test/api/v1/brand-profiles',
      'https://example.test/api/v1/brand-profiles/brand%20%2F%20one',
      'https://example.test/api/v1/brand-profiles',
      'https://example.test/api/v1/brand-profiles/brand-1',
      'https://example.test/api/v1/brand-profiles/brand-1',
    ])
    expect(transport.mock.calls[2]![1]?.method).toBe('POST')
    expect(transport.mock.calls[3]![1]?.method).toBe('PUT')
    expect(transport.mock.calls[4]![1]?.method).toBe('DELETE')
  })

  it('requests a provider-neutral social-ad execution plan', async () => {
    const transport = vi.fn(async (_url: string, _init?: RequestInit) => new Response(JSON.stringify({ plan: { executionAuthority: 'orchestra' } }), { status: 200, headers: { 'content-type': 'application/json' } }))
    const client = new AmarktAIClient({ apiKey: 'app-key', baseUrl: 'https://example.test', fetch: transport as typeof fetch })
    await client.planSocialAdVideo({
      request: { brandProfileId: 'brand-1', campaignId: 'campaign-1' },
      campaign: { brandProfileId: 'brand-1', campaignId: 'campaign-1' },
    })
    expect(transport.mock.calls[0]![0]).toBe('https://example.test/api/v1/social-ad-video/plan')
    expect(transport.mock.calls[0]![1]?.method).toBe('POST')
    const payload = JSON.parse(String(transport.mock.calls[0]![1]?.body)) as Record<string, unknown>
    expect(JSON.stringify(payload)).not.toMatch(/"provider"|"model"|"route"/)
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
