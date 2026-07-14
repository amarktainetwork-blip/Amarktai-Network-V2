import { NextResponse } from 'next/server'

const API_BASE = process.env.API_URL ?? 'http://api:3001'

export async function GET(request) {
  const sessionToken = request.cookies?.get?.('amarktai_session')?.value
  const authorization = request.headers.get('authorization')
    || (sessionToken ? `Bearer ${sessionToken}` : '')
  try {
    const response = await fetch(`${API_BASE}/api/v1/auth/verify`, {
      headers: authorization ? { Authorization: authorization } : {},
      cache: 'no-store',
      signal: AbortSignal.timeout(10000),
    })
    return NextResponse.json(await response.json(), { status: response.status })
  } catch {
    return NextResponse.json({ error: true, message: 'Authentication service is unavailable.' }, { status: 502 })
  }
}
