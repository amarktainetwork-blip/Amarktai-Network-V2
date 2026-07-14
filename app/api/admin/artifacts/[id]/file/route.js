import { NextResponse } from 'next/server'

const API_BASE = process.env.API_URL ?? 'http://api:3001'

export async function GET(request, { params }) {
  const sessionToken = request.cookies?.get?.('amarktai_session')?.value
  const authorization = request.headers.get('authorization')
    || (sessionToken ? `Bearer ${sessionToken}` : '')
  const range = request.headers.get('range')
  const { id } = params
  const download = new URL(request.url).searchParams.get('download') === '1'

  try {
    const response = await fetch(`${API_BASE}/api/v1/artifacts/${encodeURIComponent(id)}/file${download ? '?download=1' : ''}`, {
      method: 'GET',
      headers: {
        ...(authorization ? { Authorization: authorization } : {}),
        ...(range ? { Range: range } : {}),
      },
      signal: AbortSignal.timeout(20000),
    })

    const contentType = response.headers.get('content-type') || ''
    if (contentType.includes('application/json')) {
      const data = await response.json().catch(() => ({ error: true, message: 'Artifact file request failed.' }))
      return NextResponse.json(data, { status: response.status })
    }

    const headers = new Headers()
    for (const header of ['content-type', 'content-length', 'content-disposition', 'content-range', 'accept-ranges', 'cache-control']) {
      const value = response.headers.get(header)
      if (value) headers.set(header, value)
    }

    return new Response(response.body, {
      status: response.status,
      headers,
    })
  } catch {
    return NextResponse.json(
      { error: true, message: 'Backend unavailable. Artifact file could not be loaded.' },
      { status: 502 },
    )
  }
}
