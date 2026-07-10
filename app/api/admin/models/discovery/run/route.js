import { NextResponse } from 'next/server'

const API_BASE = process.env.API_URL ?? 'http://api:3001'

export async function POST(request) {
  const authorization = request.headers.get('authorization')
  const payload = await request.json().catch(() => ({}))
  try {
    const response = await fetch(`${API_BASE}/api/admin/models/discovery/run`, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        ...(authorization ? { Authorization: authorization } : {}),
      },
      body: JSON.stringify(payload),
      signal: AbortSignal.timeout(30000),
    })
    return NextResponse.json(await response.json(), { status: response.status })
  } catch {
    return NextResponse.json({ error: true, message: 'Backend unavailable. Model discovery could not be run.' }, { status: 502 })
  }
}
