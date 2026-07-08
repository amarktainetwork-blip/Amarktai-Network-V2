import { afterEach, describe, expect, it, vi } from 'vitest'

const { GET } = await import('../app/api/admin/runtime-proofs/route.js')

function makeRequest() {
  return new Request('http://localhost/api/admin/runtime-proofs', {
    method: 'GET',
    headers: { Authorization: 'Bearer admin-token' },
  })
}

describe('Dashboard runtime proof proxy', () => {
  afterEach(() => {
    vi.unstubAllGlobals()
  })

  it('forwards the admin Authorization header and backend proof payload', async () => {
    const fetchMock = vi.fn().mockResolvedValue(new Response(JSON.stringify({
      providers: ['genx', 'groq', 'together', 'mimo', 'deepinfra'],
      provenCapabilities: [],
      unprovenCapabilities: [],
      summary: {
        providerCount: 5,
        provenCount: 3,
        lastUpdatedFrom: 'runtime-proof-code',
        source: 'backend-runtime-proof-status',
      },
    }), { status: 200 }))
    vi.stubGlobal('fetch', fetchMock)

    const response = await GET(makeRequest())
    const body = await response.json()

    expect(response.status).toBe(200)
    expect(body.summary.source).toBe('backend-runtime-proof-status')
    expect(fetchMock).toHaveBeenCalledWith('http://api:3001/api/admin/runtime-proofs', expect.objectContaining({
      method: 'GET',
      headers: { Authorization: 'Bearer admin-token' },
    }))
  })

  it('forwards backend auth failures instead of hiding them', async () => {
    vi.stubGlobal('fetch', vi.fn().mockResolvedValue(new Response(JSON.stringify({
      error: true,
      message: 'Admin access required',
    }), { status: 403 })))

    const response = await GET(makeRequest())
    const body = await response.json()

    expect(response.status).toBe(403)
    expect(body.message).toBe('Admin access required')
  })

  it('returns a safe backend unavailable message on connection failure', async () => {
    vi.stubGlobal('fetch', vi.fn().mockRejectedValue(new Error('ECONNREFUSED')))

    const response = await GET(makeRequest())
    const body = await response.json()

    expect(response.status).toBe(502)
    expect(body.message).toBe('Backend unavailable. Runtime proof status could not be loaded.')
    expect(JSON.stringify(body)).not.toContain('admin-token')
  })
})
