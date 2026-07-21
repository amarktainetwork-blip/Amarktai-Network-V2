import { NextResponse } from 'next/server'

const API_BASE = process.env.API_URL ?? 'http://api:3001'

export async function POST(request) {
  const authorization = request.headers.get('authorization')
  try {
    const response = await fetch(`${API_BASE}/api/admin/streaming-chat`, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        ...(authorization ? { Authorization: authorization } : {}),
      },
      body: await request.text(),
      signal: request.signal,
    })
    if (!response.ok) {
      return NextResponse.json(await response.json().catch(() => ({ error: true, message: 'Streaming chat failed.' })), { status: response.status })
    }
    return new Response(response.body, {
      status: response.status,
      headers: {
        'Content-Type': response.headers.get('content-type') || 'text/event-stream; charset=utf-8',
        'Cache-Control': 'no-cache, no-transform',
        'X-Accel-Buffering': 'no',
      },
    })
  } catch {
    return NextResponse.json({ error: true, message: 'Streaming chat service is unavailable.' }, { status: 502 })
  }
}
