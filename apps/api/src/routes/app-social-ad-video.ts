import type { FastifyInstance } from 'fastify'
import { MarketingCampaignBriefSchema, SocialAdVideoRequestSchema } from '@amarktai/core/marketing-platform'
import { buildSocialAdVideoPlan } from '@amarktai/core/social-ad-video'
import { getBrandProfile } from '../lib/brand-profile-store.js'
import { authenticateAppKey } from './jobs.js'

export async function appSocialAdVideoRoutes(app: FastifyInstance): Promise<void> {
  app.post('/api/v1/social-ad-video/plan', async (request, reply) => {
    const auth = await authenticateAppKey(request.headers.authorization)
    if (!auth.ok) {
      return reply.status(auth.statusCode).send({ error: true, code: 'AUTHENTICATION_FAILED', message: auth.error })
    }
    if (!auth.allowedCapabilities?.includes('social_content_generation')) {
      return reply.status(403).send({
        error: true,
        code: 'SOCIAL_CONTENT_CAPABILITY_REQUIRED',
        message: 'App requires social_content_generation access.',
      })
    }

    const body = request.body as Record<string, unknown>
    const requestResult = SocialAdVideoRequestSchema.safeParse(body.request)
    const campaignResult = MarketingCampaignBriefSchema.safeParse(body.campaign)
    if (!requestResult.success || !campaignResult.success) {
      return reply.status(400).send({
        error: true,
        code: 'INVALID_SOCIAL_AD_PLAN_REQUEST',
        message: 'Social-ad request or campaign brief validation failed.',
        issues: [
          ...(requestResult.success ? [] : requestResult.error.issues),
          ...(campaignResult.success ? [] : campaignResult.error.issues),
        ],
      })
    }

    const profile = await getBrandProfile(auth.app!.slug, requestResult.data.brandProfileId)
    if (!profile) {
      return reply.status(404).send({
        error: true,
        code: 'BRAND_PROFILE_NOT_FOUND',
        message: 'Brand Profile not found for the authenticated app.',
      })
    }

    try {
      const plan = buildSocialAdVideoPlan({
        request: requestResult.data,
        campaign: campaignResult.data,
        brandProfile: profile,
      })
      return reply.send({ plan })
    } catch (error) {
      return reply.status(409).send({
        error: true,
        code: error instanceof Error ? error.message.split(':')[0] : 'SOCIAL_AD_PLAN_REJECTED',
        message: error instanceof Error ? error.message : 'Social-ad plan was rejected.',
      })
    }
  })
}
