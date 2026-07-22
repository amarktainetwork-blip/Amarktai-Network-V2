import { NextResponse } from 'next/server'

const API_BASE = process.env.API_URL ?? 'http://api:3001'

async function forward(request, { params }) {
  const segments = (await params).path ?? []
  const upstream = new URL(`${API_BASE}/api/admin/marketing/${segments.map(encodeURIComponent).join('/')}`)
  const incoming = new URL(request.url)
  upstream.search = incoming.search
  const headers = {
    Authorization: request.headers.get('authorization') ?? '',
    ...(request.headers.get('x-amarktai-app-slug')
      ? { 'x-amarktai-app-slug': request.headers.get('x-amarktai-app-slug') }
      : {}),
  }
  const init = {
    method: request.method,
    headers,
    cache: 'no-store',
  }
  if (!['GET', 'HEAD'].includes(request.method)) {
    const body = await request.text()
    if (body) {
      headers['Content-Type'] = request.headers.get('content-type') ?? 'application/json'
      init.body = body
    }
  }
  try {
    const response = await fetch(upstream, init)
    const body = await response.json().catch(() => ({ error: true, code: 'INVALID_UPSTREAM_RESPONSE', message: 'Marketing workspace returned invalid JSON.' }))
    return NextResponse.json(body, { status: response.status })
  } catch {
    return NextResponse.json({ error: true, code: 'MARKETING_WORKSPACE_UNAVAILABLE', message: 'Marketing workspace API is unavailable.' }, { status: 502 })
  }
}

export const GET = forward
export const POST = forward
