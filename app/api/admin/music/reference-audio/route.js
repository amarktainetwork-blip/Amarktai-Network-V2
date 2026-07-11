import { NextResponse } from 'next/server'

const API_BASE = process.env.API_URL ?? 'http://api:3001'

export async function POST(request) {
  const authorization = request.headers.get('authorization')
  const contentType = request.headers.get('content-type')

  try {
    const response = await fetch(`${API_BASE}/api/admin/music/reference-audio`, {
      method: 'POST',
      headers: {
        ...(contentType ? { 'Content-Type': contentType } : {}),
        ...(authorization ? { Authorization: authorization } : {}),
      },
      body: request.body,
      duplex: 'half',
      signal: AbortSignal.timeout(30000),
    })
    const data = await response.json()
    return NextResponse.json(data, { status: response.status })
  } catch {
    return NextResponse.json(
      { error: true, message: 'Backend unavailable. Reference audio could not be uploaded.' },
      { status: 502 },
    )
  }
}
