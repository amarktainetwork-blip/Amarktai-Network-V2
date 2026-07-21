import { NextResponse } from 'next/server'

const API_BASE = process.env.API_URL ?? 'http://api:3001'

async function proxy(request, params, method) {
  const authorization = request.headers.get('authorization')
  const { appSlug, capability } = await params
  const body = method === 'PUT' ? await request.text() : undefined

  try {
    const response = await fetch(
      `${API_BASE}/api/admin/app-grants/${encodeURIComponent(appSlug)}/${encodeURIComponent(capability)}`,
      {
        method,
        headers: {
          ...(authorization ? { Authorization: authorization } : {}),
          ...(method === 'PUT' ? { 'Content-Type': 'application/json' } : {}),
        },
        ...(body === undefined ? {} : { body }),
        signal: AbortSignal.timeout(10000),
      },
    )
    return NextResponse.json(await response.json(), { status: response.status })
  } catch {
    return NextResponse.json(
      { error: true, message: 'Backend unavailable. App grant operation failed.' },
      { status: 502 },
    )
  }
}

export async function GET(request, { params }) {
  return proxy(request, params, 'GET')
}

export async function PUT(request, { params }) {
  return proxy(request, params, 'PUT')
}

export async function DELETE(request, { params }) {
  return proxy(request, params, 'DELETE')
}
