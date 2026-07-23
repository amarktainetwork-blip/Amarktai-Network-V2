import type { FastifyInstance } from 'fastify'
import { prisma } from '@amarktai/db'
import { MarketingCampaignBriefSchema } from '@amarktai/core/marketing-platform'
import { getBrandProfile } from '../lib/brand-profile-store.js'
import { authenticateAppKey } from './jobs.js'

export async function appMarketingCampaignRoutes(app: FastifyInstance): Promise<void> {
  app.get('/api/v1/marketing-campaigns', async (request, reply) => {
    const auth = await authenticateAppKey(request.headers.authorization)
    if (!auth.ok) return reply.status(auth.statusCode).send({ error: true, code: 'AUTHENTICATION_FAILED', message: auth.error })
    if (!auth.allowedCapabilities?.includes('social_content_generation')) {
      return reply.status(403).send({ error: true, code: 'SOCIAL_CONTENT_CAPABILITY_REQUIRED', message: 'social_content_generation access is required.' })
    }
    const records = await prisma.campaign.findMany({ where: { appSlug: auth.app!.slug }, orderBy: { updatedAt: 'desc' } })
    return reply.send({
      campaigns: records.flatMap((record) => {
        try { return [MarketingCampaignBriefSchema.parse(JSON.parse(record.metadata))] } catch { return [] }
      }),
    })
  })

  app.post('/api/v1/marketing-campaigns', async (request, reply) => {
    const auth = await authenticateAppKey(request.headers.authorization)
    if (!auth.ok) return reply.status(auth.statusCode).send({ error: true, code: 'AUTHENTICATION_FAILED', message: auth.error })
    if (!auth.allowedCapabilities?.includes('social_content_generation')) {
      return reply.status(403).send({ error: true, code: 'SOCIAL_CONTENT_CAPABILITY_REQUIRED', message: 'social_content_generation access is required.' })
    }
    const parsed = MarketingCampaignBriefSchema.safeParse(request.body)
    if (!parsed.success) return reply.status(400).send({ error: true, code: 'INVALID_MARKETING_CAMPAIGN', message: 'Campaign validation failed.', issues: parsed.error.issues })
    const profile = await getBrandProfile(auth.app!.slug, parsed.data.brandProfileId)
    if (!profile || profile.status !== 'verified') {
      return reply.status(409).send({ error: true, code: 'VERIFIED_BRAND_PROFILE_REQUIRED', message: 'Campaign requires a verified Brand Profile owned by the app.' })
    }
    const existing = await prisma.campaign.findUnique({ where: { id: parsed.data.campaignId } })
    if (existing && existing.appSlug !== auth.app!.slug) {
      return reply.status(409).send({ error: true, code: 'CAMPAIGN_ID_ALREADY_OWNED', message: 'Campaign ID belongs to another app.' })
    }
    const record = await prisma.campaign.upsert({
      where: { id: parsed.data.campaignId },
      create: {
        id: parsed.data.campaignId,
        appSlug: auth.app!.slug,
        brandId: parsed.data.brandProfileId,
        name: parsed.data.title,
        goal: parsed.data.objective,
        targetAudience: parsed.data.audienceIds.join(', '),
        platforms: JSON.stringify(parsed.data.channels),
        qualityTier: parsed.data.qualityProfile,
        approvalMode: parsed.data.approvalRequired ? 'manual_review' : 'auto',
        status: 'active',
        metadata: JSON.stringify(parsed.data),
      },
      update: {
        brandId: parsed.data.brandProfileId,
        name: parsed.data.title,
        goal: parsed.data.objective,
        targetAudience: parsed.data.audienceIds.join(', '),
        platforms: JSON.stringify(parsed.data.channels),
        qualityTier: parsed.data.qualityProfile,
        approvalMode: parsed.data.approvalRequired ? 'manual_review' : 'auto',
        status: 'active',
        metadata: JSON.stringify(parsed.data),
      },
    })
    return reply.status(existing ? 200 : 201).send({ campaign: parsed.data, persistedCampaignId: record.id })
  })
}
