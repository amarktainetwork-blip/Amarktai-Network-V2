import { NextResponse } from 'next/server'

const API_BASE = process.env.API_URL ?? 'http://api:3001'

export async function POST(request) {
  return proxy(request, '/api/admin/long-form-video/executions')
}

async function proxy(request, path) {
  const sessionToken = request.cookies?.get?.('amarktai_session')?.value
  const authorization = request.headers.get('authorization') || (sessionToken ? `Bearer ${sessionToken}` : '')
  try {
    const response = await fetch(`${API_BASE}${path}`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json', ...(authorization ? { Authorization: authorization } : {}) },
      body: await request.text(),
      signal: AbortSignal.timeout(30_000),
    })
    return NextResponse.json(await response.json(), { status: response.status })
  } catch {
    return NextResponse.json({ error: true, message: 'Long-form execution service is unavailable.' }, { status: 502 })
  }
}
