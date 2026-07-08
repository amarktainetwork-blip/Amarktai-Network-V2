import { describe, expect, it } from 'vitest'

const { GET, POST } = await import('../app/api/admin/repo-workbench/[action]/route.js')

function request() {
  return new Request('http://localhost/api/admin/repo-workbench/pr', {
    headers: { Authorization: 'Bearer admin-token' },
  })
}

describe('Dashboard Repo Workbench safe stubs', () => {
  it('requires an admin Authorization header', async () => {
    const response = await GET(new Request('http://localhost/api/admin/repo-workbench/analyze'), {
      params: Promise.resolve({ action: 'analyze' }),
    })

    expect(response.status).toBe(401)
    expect(await response.json()).toMatchObject({ error: true })
  })

  it('returns not implemented for known actions instead of fake success', async () => {
    const response = await POST(request(), {
      params: Promise.resolve({ action: 'pr' }),
    })
    const body = await response.json()

    expect(response.status).toBe(501)
    expect(body).toMatchObject({
      error: true,
      action: 'pr',
      enabled: false,
      fakeSuccess: false,
    })
    expect(body.message).toContain('not ready')
  })

  it('rejects unknown actions safely', async () => {
    const response = await GET(request(), {
      params: Promise.resolve({ action: 'merge-to-main' }),
    })

    expect(response.status).toBe(404)
    expect(await response.json()).toMatchObject({
      error: true,
      message: 'Unknown Repo Workbench action.',
    })
  })
})
