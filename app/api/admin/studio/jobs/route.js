import { NextResponse } from 'next/server'

const API_BASE = process.env.API_URL ?? 'http://api:3001'

export async function POST(request) {
  const authorization = request.headers.get('authorization')
  const body = await request.json()

  try {
    const response = await fetch(`${API_BASE}/api/admin/studio/jobs`, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        ...(authorization ? { Authorization: authorization } : {}),
      },
      body: JSON.stringify(body),
      signal: AbortSignal.timeout(15000),
    })
    const data = await response.json()
    return NextResponse.json(data, { status: response.status })
  } catch {
    return NextResponse.json(
      { error: true, message: 'Backend unavailable. Studio job submission failed.' },
      { status: 502 },
    )
  }
}
