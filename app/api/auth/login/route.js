import { NextResponse } from 'next/server'

const API_BASE = process.env.API_URL ?? 'http://127.0.0.1:3001'

export async function POST(request) {
  try {
    const body = await request.json()

    const res = await fetch(`${API_BASE}/api/v1/auth/login`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify(body),
    })

    const data = await res.json()
    return NextResponse.json(data, { status: res.status })
  } catch (err) {
    return NextResponse.json(
      { error: true, message: 'API unavailable' },
      { status: 502 },
    )
  }
}
