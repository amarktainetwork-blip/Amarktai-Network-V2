import { NextResponse } from 'next/server'

const API_BASE = process.env.API_URL ?? 'http://api:3001'

export async function GET(request, { params }) {
  const authorization = request.headers.get('authorization')
  const { appSlug } = await params

  try {
    const response = await fetch(`${API_BASE}/api/admin/app-grants/${encodeURIComponent(appSlug)}`, {
      headers: authorization ? { Authorization: authorization } : {},
      signal: AbortSignal.timeout(10000),
    })
    return NextResponse.json(await response.json(), { status: response.status })
  } catch {
    return NextResponse.json(
      { error: true, message: 'Backend unavailable. App grants could not be loaded.' },
      { status: 502 },
    )
  }
}
