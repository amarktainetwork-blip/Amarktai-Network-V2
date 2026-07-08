import { NextResponse } from 'next/server'

const API_BASE = process.env.API_URL ?? 'http://api:3001'

async function parseBackendResponse(response) {
  const text = await response.text()
  if (!text) return {}

  try {
    return JSON.parse(text)
  } catch {
    return { error: true, message: 'Backend returned an unreadable runtime proof response' }
  }
}

export async function GET(request) {
  const authorization = request.headers.get('authorization')

  try {
    const response = await fetch(`${API_BASE}/api/admin/runtime-proofs`, {
      method: 'GET',
      headers: authorization ? { Authorization: authorization } : {},
      signal: AbortSignal.timeout(10000),
    })
    const data = await parseBackendResponse(response)

    return NextResponse.json(data, { status: response.status })
  } catch {
    return NextResponse.json(
      { error: true, message: 'Backend unavailable. Runtime proof status could not be loaded.' },
      { status: 502 },
    )
  }
}
