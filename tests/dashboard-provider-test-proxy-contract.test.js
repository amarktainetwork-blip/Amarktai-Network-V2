/**
 * Dashboard provider-test proxy contract tests.
 */

import { afterEach, describe, expect, it, vi } from 'vitest'

const { POST } = await import('../app/api/admin/providers/[providerKey]/test/route.js')

function makeRequest() {
  return new Request('http://localhost/api/admin/providers/genx/test', {
    method: 'POST',
    headers: { Authorization: 'Bearer admin-token' },
  })
}

function makeParams(providerKey = 'genx') {
  return { params: Promise.resolve({ providerKey }) }
}

describe('Dashboard provider test proxy', () => {
  afterEach(() => {
    vi.unstubAllGlobals()
  })

  it('forwards backend JSON errors and status instead of generic 502', async () => {
    vi.stubGlobal('fetch', vi.fn().mockResolvedValue(new Response(JSON.stringify({
      error: true,
      message: 'GenX models endpoint HTTP 401: unauthorized',
    }), {
      status: 401,
      headers: { 'content-type': 'application/json' },
    })))

    const response = await POST(makeRequest(), makeParams())
    const body = await response.json()

    expect(response.status).toBe(401)
    expect(body.message).toBe('GenX models endpoint HTTP 401: unauthorized')
    expect(JSON.stringify(body)).not.toContain('Backend unavailable')
  })

  it('returns 504 with a clear message on upstream timeout', async () => {
    const timeout = new Error('The operation timed out')
    timeout.name = 'TimeoutError'
    vi.stubGlobal('fetch', vi.fn().mockRejectedValue(timeout))

    const response = await POST(makeRequest(), makeParams())
    const body = await response.json()

    expect(response.status).toBe(504)
    expect(body.message).toContain('timed out')
    expect(body.upstreamTarget).toBe('http://api:3001/api/admin/providers/genx/test')
    expect(JSON.stringify(body)).not.toContain('admin-token')
  })

  it('returns 502 with a safe upstream target on API connection failure', async () => {
    vi.stubGlobal('fetch', vi.fn().mockRejectedValue(new Error('ECONNREFUSED')))

    const response = await POST(makeRequest(), makeParams('together'))
    const body = await response.json()

    expect(response.status).toBe(502)
    expect(body.message).toContain('Backend API connection failed')
    expect(body.upstreamTarget).toBe('http://api:3001/api/admin/providers/together/test')
    expect(JSON.stringify(body)).not.toContain('admin-token')
  })
})
