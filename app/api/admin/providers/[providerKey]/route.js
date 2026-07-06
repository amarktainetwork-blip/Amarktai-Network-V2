import { NextResponse } from 'next/server'

const API_BASE = process.env.API_URL ?? 'http://api:3001'

async function parseBackendResponse(response) {
  const text = await response.text()
  if (!text) return {}

  try {
    return JSON.parse(text)
  } catch {
    return { error: true, message: 'Backend returned an unreadable provider settings response' }
  }
}

export async function PUT(request, { params }) {
  const authorization = request.headers.get('authorization')
  const body = await request.text()
  const { providerKey } = await params

  try {
    const response = await fetch(`${API_BASE}/api/admin/providers/${encodeURIComponent(providerKey)}`, {
      method: 'PUT',
      headers: {
        ...(authorization ? { Authorization: authorization } : {}),
        'Content-Type': 'application/json',
      },
      body,
      signal: AbortSignal.timeout(10000),
    })
    const data = await parseBackendResponse(response)

    return NextResponse.json(data, { status: response.status })
  } catch {
    return NextResponse.json(
      { error: true, message: 'Backend unavailable. Provider settings could not be saved.' },
      { status: 502 },
    )
  }
}
