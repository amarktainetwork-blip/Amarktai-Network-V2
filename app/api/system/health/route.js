import { NextResponse } from 'next/server'

const API_BASE = process.env.API_URL ?? 'http://api:3001'

export async function GET() {
  try {
    const response = await fetch(`${API_BASE}/health`, { cache: 'no-store', signal: AbortSignal.timeout(10000) })
    return NextResponse.json(await response.json(), { status: response.status })
  } catch {
    return NextResponse.json({ status: 'unavailable', processAlive: false, ready: false, checks: {} }, { status: 503 })
  }
}
