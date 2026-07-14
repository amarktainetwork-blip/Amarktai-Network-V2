import { NextResponse } from 'next/server'

const API_BASE = process.env.API_URL ?? 'http://api:3001'

export async function GET(request, { params }) {
  const { id } = await params
  const sessionToken = request.cookies?.get?.('amarktai_session')?.value
  const authorization = request.headers.get('authorization') || (sessionToken ? `Bearer ${sessionToken}` : '')
  try {
    const response = await fetch(`${API_BASE}/api/admin/long-form-video/executions/${encodeURIComponent(id)}`, {
      headers: authorization ? { Authorization: authorization } : {},
      cache: 'no-store',
      signal: AbortSignal.timeout(15_000),
    })
    return NextResponse.json(await response.json(), { status: response.status })
  } catch {
    return NextResponse.json({ error: true, message: 'Long-form execution service is unavailable.' }, { status: 502 })
  }
}
