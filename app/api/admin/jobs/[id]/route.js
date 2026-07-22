import { NextResponse } from 'next/server'

const API_BASE = process.env.API_URL ?? 'http://api:3001'

export async function GET(request, { params }) {
  const authorization = request.headers.get('authorization')
  const { id } = params

  try {
    const response = await fetch(`${API_BASE}/api/admin/jobs/${id}`, {
      method: 'GET',
      headers: authorization ? { Authorization: authorization } : {},
      signal: AbortSignal.timeout(10000),
    })
    const data = await response.json()
    return NextResponse.json(data, { status: response.status })
  } catch {
    return NextResponse.json(
      { error: true, message: 'Backend unavailable. Job detail could not be loaded.' },
      { status: 502 },
    )
  }
}

export async function POST(request, { params }) {
  const authorization = request.headers.get('authorization')
  const { id } = params
  const action = new URL(request.url).searchParams.get('action')
  if (!['cancel', 'requeue'].includes(action)) return NextResponse.json({ error: true, message: 'Unsupported job action' }, { status: 400 })
  try {
    const response = await fetch(`${API_BASE}/api/admin/jobs/${encodeURIComponent(id)}/${action}`, { method: 'POST', headers: authorization ? { Authorization: authorization } : {}, signal: AbortSignal.timeout(10000) })
    const data = await response.json()
    return NextResponse.json(data, { status: response.status })
  } catch {
    return NextResponse.json({ error: true, message: 'Backend unavailable. Job action could not be completed.' }, { status: 502 })
  }
}
