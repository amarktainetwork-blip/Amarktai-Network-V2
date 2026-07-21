import { NextResponse } from 'next/server'

export const dynamic = 'force-dynamic'

export async function GET() {
  const gitSha = process.env.GIT_SHA ?? 'unknown'
  const buildTime = process.env.BUILD_TIME ?? 'unknown'

  return NextResponse.json(
    {
      status: gitSha === 'unknown' ? 'unidentified' : 'healthy',
      timestamp: new Date().toISOString(),
      build: {
        gitSha,
        buildTime,
        serviceName: process.env.SERVICE_NAME ?? 'amarktai-dashboard',
        version: process.env.APP_VERSION ?? '0.0.0',
      },
    },
    { status: gitSha === 'unknown' && process.env.NODE_ENV === 'production' ? 503 : 200 }
  )
}
