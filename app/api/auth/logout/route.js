import { NextResponse } from 'next/server'

const API_BASE = process.env.API_URL ?? 'http://api:3001'

export async function POST(request) {
  const sessionToken = request.cookies?.get?.('amarktai_session')?.value
  const authorization = request.headers.get('authorization')
    || (sessionToken ? `Bearer ${sessionToken}` : '')
  try {
    const response = await fetch(`${API_BASE}/api/v1/auth/logout`, {
      method: 'POST',
      headers: authorization ? { Authorization: authorization } : {},
      signal: AbortSignal.timeout(10000),
    })
    const result = NextResponse.json(await response.json(), { status: response.status })
    result.cookies.delete('amarktai_session')
    return result
  } catch {
    const result = NextResponse.json({ error: true, message: 'Authentication service is unavailable.' }, { status: 502 })
    result.cookies.delete('amarktai_session')
    return result
  }
}
