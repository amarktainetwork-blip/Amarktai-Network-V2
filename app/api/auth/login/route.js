import { NextResponse } from 'next/server'

const API_BASE = process.env.API_URL ?? 'http://api:3001'

export async function POST(request) {
  console.log('[auth-proxy] Forwarding login to:', `${API_BASE}/api/v1/auth/login`)

  try {
    const body = await request.json()

    const res = await fetch(`${API_BASE}/api/v1/auth/login`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify(body),
      signal: AbortSignal.timeout(10000),
    })

    const data = await res.json()
    console.log('[auth-proxy] Fastify response:', res.status)
    return NextResponse.json(data, { status: res.status })
  } catch (err) {
    console.error('[auth-proxy] Failed:', err.message)
    return NextResponse.json(
      { error: true, message: `API unavailable: ${err.message}` },
      { status: 502 },
    )
  }
}
