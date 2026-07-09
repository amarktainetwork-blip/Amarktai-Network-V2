import type { FastifyInstance } from 'fastify'
import { prisma } from '@amarktai/db'
import { parseBearerToken, hashAppApiKey } from '@amarktai/core'

export type AuthContext =
  | { kind: 'admin'; subject: string }
  | { kind: 'app'; appSlug: string; connectionId: string }

export async function authenticateArtifactAccess(
  app: FastifyInstance,
  bearerHeader: string | undefined,
): Promise<AuthContext | null> {
  const token = parseBearerToken(bearerHeader)
  if (!token) return null

  const admin = await authenticateAdminJwt(app, token)
  if (admin) return admin

  return authenticateAppApiKey(token)
}

export function canAccessArtifact(auth: AuthContext, artifactAppSlug: string): boolean {
  return auth.kind === 'admin' || auth.appSlug === artifactAppSlug
}

async function authenticateAdminJwt(app: FastifyInstance, token: string): Promise<AuthContext | null> {
  try {
    const payload = await app.jwtVerify(token)
    if (payload?.role === 'admin' && payload.sub) {
      return { kind: 'admin', subject: payload.sub }
    }
  } catch {
    return null
  }
  return null
}

async function authenticateAppApiKey(token: string): Promise<AuthContext | null> {
  const hashedToken = hashAppApiKey(token)
  const apiKey = await prisma.appApiKey.findUnique({
    where: { key: hashedToken },
    include: {
      appConnection: {
        select: {
          id: true,
          appSlug: true,
          status: true,
        },
      },
    },
  })

  if (!apiKey?.active) return null

  const connection = apiKey.appConnection
  if (!connection || connection.status !== 'active') return null

  return {
    kind: 'app',
    appSlug: connection.appSlug,
    connectionId: connection.id,
  }
}
