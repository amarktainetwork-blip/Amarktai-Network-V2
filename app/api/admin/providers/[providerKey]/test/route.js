import { NextResponse } from 'next/server'

const API_BASE = process.env.API_URL ?? 'http://api:3001'
const PROXY_TIMEOUT_MS = 30000

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
  const upstreamUrl = `${API_BASE}/api/admin/providers/${encodeURIComponent(providerKey)}/test`

  try {
    const response = await fetch(upstreamUrl, {
      method: 'POST',
      headers: authorization ? { Authorization: authorization } : {},
      signal: AbortSignal.timeout(PROXY_TIMEOUT_MS),
    })
    const data = await parseBackendResponse(response)

    return NextResponse.json(data, { status: response.status })
  } catch (err) {
    if (isTimeoutError(err)) {
      return NextResponse.json(
        {
          error: true,
          message: 'Provider test timed out while waiting for the backend API.',
          upstreamTarget: safeUpstreamTarget(upstreamUrl),
        },
        { status: 504 },
      )
    }

    return NextResponse.json(
      {
        error: true,
        message: 'Backend API connection failed. Provider key could not be tested.',
        upstreamTarget: safeUpstreamTarget(upstreamUrl),
      },
      { status: 502 },
    )
  }
}

function isTimeoutError(err) {
  return err instanceof Error && (
    err.name === 'TimeoutError'
    || err.name === 'AbortError'
    || err.message.toLowerCase().includes('timeout')
    || err.message.toLowerCase().includes('aborted')
  )
}

function safeUpstreamTarget(upstreamUrl) {
  try {
    const url = new URL(upstreamUrl)
    return `${url.origin}${url.pathname}`
  } catch {
    return '/api/admin/providers/[providerKey]/test'
  }
}
