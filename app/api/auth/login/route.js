import { NextResponse } from 'next/server'

const API_BASE = process.env.API_URL ?? 'http://api:3001'

export async function POST(request) {
  try {
    const body = await request.json()

    const res = await fetch(`${API_BASE}/api/v1/auth/login`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify(body),
      signal: AbortSignal.timeout(10000),
    })

    const data = await res.json()
    const response = NextResponse.json(data, { status: res.status })
    if (res.ok && typeof data.token === 'string') {
      response.cookies.set('amarktai_session', data.token, {
        httpOnly: true,
        secure: process.env.NODE_ENV === 'production',
        sameSite: 'strict',
        path: '/',
        maxAge: Number(process.env.JWT_EXPIRY_SECONDS || 86400),
      })
    }
    return response
  } catch (err) {
    return NextResponse.json(
      { error: true, message: 'Authentication service is unavailable.' },
      { status: 502 },
    )
  }
}
