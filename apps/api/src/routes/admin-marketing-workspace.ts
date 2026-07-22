import type { FastifyInstance, FastifyReply, FastifyRequest } from 'fastify'
import { prisma } from '@amarktai/db'
import { parseStoredBrandProfile } from '../lib/brand-profile-store.js'
import {
  registerSocialAdVideoRoutes,
  type SocialAdRouteAuthResolver,
} from './app-social-ad-video.js'
import { registerSocialAdAssemblyRoutes } from './app-social-ad-assembly.js'
import { registerSocialAdFinalApprovalRoutes } from './app-social-ad-final-approval.js'

async function requireAdmin(app: FastifyInstance, authorization: string | undefined) {
  if (!authorization?.startsWith('Bearer ')) return { ok: false as const, statusCode: 401, error: 'Authorization required' }
  try {
    const payload = await app.jwtVerify(authorization.slice('Bearer '.length))
    if (payload?.role !== 'admin') return { ok: false as const, statusCode: 403, error: 'Admin access required' }
    return { ok: true as const }
  } catch {
    return { ok: false as const, statusCode: 401, error: 'Invalid authorization' }
  }
}

function requestedAppSlug(request: FastifyRequest): string {
  const value = request.headers['x-amarktai-app-slug']
  return typeof value === 'string' ? value.trim() : ''
}

function allowedCapabilities(value: string): string[] {
  try {
    const parsed = JSON.parse(value)
    return Array.isArray(parsed) ? parsed.filter((item): item is string => typeof item === 'string') : []
  } catch {
    return []
  }
}

async function requireAdminReply(app: FastifyInstance, request: FastifyRequest, reply: FastifyReply): Promise<boolean> {
  const result = await requireAdmin(app, request.headers.authorization)
  if (!result.ok) {
    reply.status(result.statusCode).send({ error: true, code: 'AUTHENTICATION_FAILED', message: result.error })
    return false
  }
  return true
}

export async function adminMarketingWorkspaceRoutes(app: FastifyInstance): Promise<void> {
  const authenticate: SocialAdRouteAuthResolver = async (authorization, rawRequest) => {
    const admin = await requireAdmin(app, authorization)
    if (!admin.ok) return { ...admin }
    const request = rawRequest as FastifyRequest
    const appSlug = requestedAppSlug(request)
    if (!appSlug) return { ok: false, statusCode: 400, error: 'x-amarktai-app-slug is required' }
    const connection = await prisma.appConnection.findFirst({ where: { appSlug, status: 'active' } })
    if (!connection) return { ok: false, statusCode: 404, error: 'Active app connection not found' }
    return {
      ok: true,
      statusCode: 200,
      error: '',
      app: { slug: appSlug },
      allowedCapabilities: allowedCapabilities(connection.allowedCapabilities),
    }
  }

  await registerSocialAdVideoRoutes(app, { prefix: '/api/admin/marketing', authenticate })
  await registerSocialAdAssemblyRoutes(app, { prefix: '/api/admin/marketing', authenticate })
  await registerSocialAdFinalApprovalRoutes(app, { prefix: '/api/admin/marketing', authenticate })

  app.get('/api/admin/marketing/context', async (request, reply) => {
    if (!(await requireAdminReply(app, request, reply))) return
    const connections = await prisma.appConnection.findMany({ where: { status: 'active' }, orderBy: { appName: 'asc' } })
    const eligible = connections.filter((connection) => allowedCapabilities(connection.allowedCapabilities).includes('social_content_generation'))
    const contexts = []
    for (const connection of eligible) {
      const profileRecords = await prisma.artifact.findMany({
        where: { appSlug: connection.appSlug, type: 'document', subType: 'brand_profile' },
        orderBy: { updatedAt: 'desc' },
      })
      const profiles = profileRecords.flatMap((record) => {
        try {
          const profile = parseStoredBrandProfile(record.metadata)
          return profile.status === 'verified' ? [profile] : []
        } catch {
          return []
        }
      })
      const campaigns = await prisma.campaign.findMany({
        where: { appSlug: connection.appSlug, status: { in: ['draft', 'active'] } },
        orderBy: { updatedAt: 'desc' },
      })
      contexts.push({
        appSlug: connection.appSlug,
        appName: connection.appName,
        profiles,
        campaigns: campaigns.map((campaign) => ({
          id: campaign.id,
          name: campaign.name,
          status: campaign.status,
          brief: parseObject(campaign.metadata),
        })),
      })
    }
    return reply.send({ contexts })
  })
}

function parseObject(value: string): Record<string, unknown> {
  try {
    const parsed = JSON.parse(value)
    return typeof parsed === 'object' && parsed !== null && !Array.isArray(parsed) ? parsed as Record<string, unknown> : {}
  } catch {
    return {}
  }
}
