import { NextResponse } from 'next/server'

export async function POST(request) {
  try {
    const body = await request.json()
    const { name, email, message } = body

    if (!name || !email || !message) {
      return NextResponse.json(
        { ok: false, message: 'Name, email, and message are required.' },
        { status: 400 },
      )
    }

    // Validate email format
    const emailRegex = /^[^\s@]+@[^\s@]+\.[^\s@]+$/
    if (!emailRegex.test(email)) {
      return NextResponse.json(
        { ok: false, message: 'Please provide a valid email address.' },
        { status: 400 },
      )
    }

    // Forward to the Fastify API if available, otherwise log
    const apiUrl = process.env.API_URL ?? 'http://api:3001'
    try {
      const res = await fetch(`${apiUrl}/api/v1/contact`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(body),
        signal: AbortSignal.timeout(5000),
      })

      if (res.ok) {
        return NextResponse.json({ ok: true, message: 'Message sent successfully.' })
      }
    } catch {
      // API unavailable — log locally and still accept
      console.log('[contact] API unavailable, logging locally:', { name, email, message: message.slice(0, 200) })
    }

    // Fallback: accept the submission even if the API is down
    return NextResponse.json({ ok: true, message: 'Message received. We will get back to you soon.' })
  } catch {
    return NextResponse.json(
      { ok: false, message: 'Invalid request body.' },
      { status: 400 },
    )
  }
}
