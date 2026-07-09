import { NextResponse } from 'next/server'

const API_BASE = process.env.API_URL ?? 'http://api:3001'

export async function GET(request) {
  const authorization = request.headers.get('authorization')

  try {
    const response = await fetch(`${API_BASE}/api/admin/app-connections`, {
      method: 'GET',
      headers: authorization ? { Authorization: authorization } : {},
      signal: AbortSignal.timeout(10000),
    })
    const data = await response.json()
    return NextResponse.json(data, { status: response.status })
  } catch {
    return NextResponse.json(
      { error: true, message: 'Backend unavailable.' },
      { status: 502 },
    )
  }
}

export async function POST(request) {
  const authorization = request.headers.get('authorization')
  const body = await request.json()

  try {
    const response = await fetch(`${API_BASE}/api/admin/app-connections`, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        ...(authorization ? { Authorization: authorization } : {}),
      },
      body: JSON.stringify(body),
      signal: AbortSignal.timeout(10000),
    })
    const data = await response.json()
    return NextResponse.json(data, { status: response.status })
  } catch {
    return NextResponse.json(
      { error: true, message: 'Backend unavailable.' },
      { status: 502 },
    )
  }
}
