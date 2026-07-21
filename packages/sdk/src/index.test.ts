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

  it('uses app-scoped memory endpoints without route authority', async () => {
    const transport = vi.fn(async (_url: string, _init?: RequestInit) => new Response(JSON.stringify({ entries: [] }), { status: 200, headers: { 'content-type': 'application/json' } }))
    const client = new AmarktAIClient({ apiKey: 'app-key', baseUrl: 'https://example.test', fetch: transport as typeof fetch })

    await client.searchMemory({ query: 'customer preference', limit: 5, types: ['context', 'learned'] })
    await client.writeMemory({ content: 'Customer prefers concise weekly reports.', key: 'report-style', memoryType: 'context', importance: 0.8, ttlSeconds: 3600 })
    await client.deleteMemory(42)

    expect(transport.mock.calls.map((call) => call[0])).toEqual([
      'https://example.test/api/v1/memory/search?q=customer+preference&limit=5&types=context%2Clearned',
      'https://example.test/api/v1/memory',
      'https://example.test/api/v1/memory/42',
    ])
    expect(transport.mock.calls[0]![1]?.method).toBeUndefined()
    expect(transport.mock.calls[1]![1]?.method).toBe('POST')
    expect(transport.mock.calls[2]![1]?.method).toBe('DELETE')
    const write = JSON.parse(String(transport.mock.calls[1]![1]?.body)) as Record<string, unknown>
    expect(write).toMatchObject({ key: 'report-style', memoryType: 'context', importance: 0.8, ttlSeconds: 3600 })
    expect(write).not.toHaveProperty('provider')
    expect(write).not.toHaveProperty('model')
    expect(write).not.toHaveProperty('appSlug')
  })

  it('plans, starts, polls, approves and resumes provider-neutral social-ad execution', async () => {
    const transport = vi.fn(async (_url: string, _init?: RequestInit) => new Response(JSON.stringify({ executionAuthority: 'orchestra' }), { status: 200, headers: { 'content-type': 'application/json' } }))
    const client = new AmarktAIClient({ apiKey: 'app-key', baseUrl: 'https://example.test', fetch: transport as typeof fetch })
    const payload = {
      request: { brandProfileId: 'brand-1', campaignId: 'campaign-1' },
      campaign: { brandProfileId: 'brand-1', campaignId: 'campaign-1' },
    }
    await client.planSocialAdVideo(payload)
    await client.executeSocialAdVideo(payload)
    await client.socialAdVideoExecution('execution / one')
    await client.decideSocialAdVideo('execution / one', { decision: 'approved', notes: 'Approved by campaign owner.' })

    expect(transport.mock.calls.map((call) => call[0])).toEqual([
      'https://example.test/api/v1/social-ad-video/plan',
      'https://example.test/api/v1/social-ad-video/executions',
      'https://example.test/api/v1/social-ad-video/executions/execution%20%2F%20one',
      'https://example.test/api/v1/social-ad-video/executions/execution%20%2F%20one/approval',
      'https://example.test/api/v1/social-ad-video/executions/execution%20%2F%20one/assemble',
    ])
    expect(transport.mock.calls[0]![1]?.method).toBe('POST')
    expect(transport.mock.calls[1]![1]?.method).toBe('POST')
    expect(transport.mock.calls[2]![1]?.method).toBeUndefined()
    expect(transport.mock.calls[3]![1]?.method).toBe('POST')
    expect(transport.mock.calls[4]![1]?.method).toBe('POST')
    const approval = JSON.parse(String(transport.mock.calls[3]![1]?.body)) as Record<string, unknown>
    expect(approval).toEqual({ decision: 'approved', notes: 'Approved by campaign owner.' })
    expect(JSON.stringify(payload)).not.toMatch(/"provider"|"model"|"route"/)
  })

  it('does not queue assembly after a rejection', async () => {
    const transport = vi.fn(async () => new Response(JSON.stringify({ phase: 'revision_required' }), { status: 200, headers: { 'content-type': 'application/json' } }))
    const client = new AmarktAIClient({ apiKey: 'app-key', baseUrl: 'https://example.test', fetch: transport as typeof fetch })
    await client.decideSocialAdVideo('execution-1', { decision: 'rejected', notes: 'Revise the opening.' })
    expect(transport).toHaveBeenCalledTimes(1)
    expect(transport.mock.calls[0]![0]).toBe('https://example.test/api/v1/social-ad-video/executions/execution-1/approval')
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
