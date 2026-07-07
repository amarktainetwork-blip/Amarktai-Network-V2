import { NextResponse } from 'next/server'

const API_BASE = process.env.API_URL ?? 'http://api:3001'

async function parseBackendResponse(response) {
  const text = await response.text()
  if (!text) return {}

  try {
    return JSON.parse(text)
  } catch {
    return { error: true, message: 'Backend returned an unreadable provider test response' }
  }
}

export async function POST(request, { params }) {
  const authorization = request.headers.get('authorization')
  const { providerKey } = await params

  try {
    const response = await fetch(`${API_BASE}/api/admin/providers/${encodeURIComponent(providerKey)}/test`, {
      method: 'POST',
      headers: authorization ? { Authorization: authorization } : {},
      signal: AbortSignal.timeout(30000),
    })
    const data = await parseBackendResponse(response)

    return NextResponse.json(data, { status: response.status })
  } catch {
    return NextResponse.json(
      { error: true, message: 'Backend unavailable. Provider key could not be tested.' },
      { status: 502 },
    )
  }
}
