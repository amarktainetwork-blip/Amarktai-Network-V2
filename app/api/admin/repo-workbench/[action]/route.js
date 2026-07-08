import { NextResponse } from 'next/server'
import { repoWorkbenchActionResponse } from '../../../../../lib/repo-workbench-contract.js'

function requireBearer(request) {
  const authorization = request.headers.get('authorization') ?? ''
  return authorization.startsWith('Bearer ')
}

async function handle(request, context) {
  if (!requireBearer(request)) {
    return NextResponse.json(
      { error: true, message: 'Admin Authorization header required.' },
      { status: 401 },
    )
  }

  const { action } = await context.params
  const response = repoWorkbenchActionResponse(action)
  return NextResponse.json(response.body, { status: response.status })
}

export async function GET(request, context) {
  return handle(request, context)
}

export async function POST(request, context) {
  return handle(request, context)
}
