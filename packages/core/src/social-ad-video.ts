import { createHash } from 'node:crypto'
import { z } from 'zod'
import {
  BrandProfileSchema,
  MarketingCampaignBriefSchema,
  SocialAdVideoRequestSchema,
  type BrandProfile,
  type MarketingCampaignBrief,
  type SocialAdVideoRequest,
} from './marketing-platform.js'
import { createQualityPolicy, QualityPolicySchema } from './quality-evaluation.js'
import type { CapabilityKey } from './capabilities.js'

export const SOCIAL_AD_WORKFLOW_STAGES = [
  'validate_brand',
  'analyse_sources',
  'plan_creative',
  'generate_candidates',
  'evaluate_candidates',
  'assemble_master',
  'derive_variants',
  'generate_copy',
  'await_approval',
  'package_delivery',
] as const

export const SOCIAL_AD_DELIVERABLE_TYPES = [
  'master_video',
  'captioned_video',
  'subtitle_srt',
  'subtitle_vtt',
  'thumbnail',
  'social_copy',
  'quality_report',
  'execution_evidence',
] as const

export const SocialAdCandidatePlanSchema = z.object({
  candidateId: z.string().min(1),
  candidateIndex: z.number().int().positive(),
  generationCapability: z.enum([
    'video_generation',
    'image_to_video',
    'video_to_video',
  ] satisfies readonly CapabilityKey[]),
  prompt: z.string().min(20),
  negativePrompt: z.string().min(1),
  sourceArtifactIds: z.array(z.string()).default([]),
  durationSeconds: z.number().int().min(5).max(180),
  masterAspectRatio: z.enum(['16:9', '9:16', '1:1']),
})

export const SocialAdDeliveryVariantSchema = z.object({
  variantId: z.string().min(1),
  aspectRatio: z.enum(['16:9', '9:16', '1:1']),
  durationSeconds: z.number().int().min(5).max(180),
  includeCaptions: z.boolean(),
  includeSubtitleFiles: z.boolean(),
  includeThumbnail: z.boolean(),
})

export const SocialAdVideoPlanSchema = z.object({
  version: z.literal('social-ad-video-v1'),
  planId: z.string().min(1),
  appSlug: z.string().min(1),
  brandProfileId: z.string().min(1),
  campaignId: z.string().min(1),
  mode: z.string().min(1),
  stages: z.array(z.enum(SOCIAL_AD_WORKFLOW_STAGES)),
  requiredCapabilities: z.array(z.string().min(1)),
  creativeContext: z.object({
    brandName: z.string().min(1),
    objective: z.string().min(1),
    audience: z.string().min(1),
    offering: z.string().nullable(),
    approvedClaims: z.array(z.string()),
    prohibitedClaims: z.array(z.string()),
    requiredDisclaimers: z.array(z.string()),
    toneRules: z.array(z.string()),
    visualRules: z.array(z.string()),
    callToAction: z.string().min(1),
    channels: z.array(z.string().min(1)),
  }),
  candidates: z.array(SocialAdCandidatePlanSchema).min(2),
  deliveryVariants: z.array(SocialAdDeliveryVariantSchema).min(1),
  deliverables: z.array(z.enum(SOCIAL_AD_DELIVERABLE_TYPES)),
  qualityPolicy: QualityPolicySchema,
  approvalRequired: z.boolean(),
  maxCredits: z.number().positive(),
  executionAuthority: z.literal('orchestra'),
})

export type SocialAdCandidatePlan = z.infer<typeof SocialAdCandidatePlanSchema>
export type SocialAdVideoPlan = z.infer<typeof SocialAdVideoPlanSchema>

function planIdFor(request: SocialAdVideoRequest): string {
  const digest = createHash('sha256')
    .update(JSON.stringify({
      brandProfileId: request.brandProfileId,
      campaignId: request.campaignId,
      mode: request.mode,
      prompt: request.prompt,
      aspectRatios: request.aspectRatios,
      durationSeconds: request.durationSeconds,
    }))
    .digest('hex')
    .slice(0, 20)
  return `social-ad-${digest}`
}

function resolveAudience(profile: BrandProfile, audienceId: string) {
  const audience = profile.audiences.find((item) => item.audienceId === audienceId)
  if (!audience) throw new Error(`SOCIAL_AD_AUDIENCE_NOT_FOUND:${audienceId}`)
  return audience
}

function resolveOffering(profile: BrandProfile, offeringId: string | null) {
  if (!offeringId) return null
  const offering = profile.offerings.find((item) => item.offeringId === offeringId)
  if (!offering) throw new Error(`SOCIAL_AD_OFFERING_NOT_FOUND:${offeringId}`)
  return offering
}

function approvedLogoArtifactIds(profile: BrandProfile): string[] {
  return profile.visual.assets
    .filter((asset) => ['primary_logo', 'secondary_logo', 'icon'].includes(asset.role))
    .filter((asset) => asset.approved && asset.rightsVerified)
    .map((asset) => asset.artifactId)
}

function generationCapabilityFor(
  request: SocialAdVideoRequest,
  profile: BrandProfile,
): 'video_generation' | 'image_to_video' | 'video_to_video' {
  if (request.mode === 'source_video_repurpose') return 'video_to_video'
  if (request.mode === 'template_remix' && request.sourceArtifactIds.length > 0) return 'video_to_video'
  if (['logo_reveal', 'product_breakout', 'offer_promotion', 'social_mockup'].includes(request.mode)
    && approvedLogoArtifactIds(profile).length > 0) return 'image_to_video'
  return 'video_generation'
}

function validateModeRequirements(request: SocialAdVideoRequest, profile: BrandProfile): void {
  if (request.mode === 'source_video_repurpose' && request.sourceArtifactIds.length === 0) {
    throw new Error('SOCIAL_AD_SOURCE_VIDEO_REQUIRED')
  }
  if (request.mode === 'logo_reveal' && approvedLogoArtifactIds(profile).length === 0) {
    throw new Error('SOCIAL_AD_APPROVED_LOGO_REQUIRED')
  }
  if (['product_breakout', 'offer_promotion'].includes(request.mode) && !request.offeringId) {
    throw new Error('SOCIAL_AD_OFFERING_REQUIRED')
  }
  if (['premium', 'publication'].includes(request.qualityProfile) && !request.approvalRequired) {
    throw new Error('SOCIAL_AD_PREMIUM_APPROVAL_REQUIRED')
  }
}

function candidatePrompt(input: {
  request: SocialAdVideoRequest
  campaign: MarketingCampaignBrief
  profile: BrandProfile
  audienceDescription: string
  offeringDescription: string | null
  candidateIndex: number
}): string {
  const { request, campaign, profile, audienceDescription, offeringDescription, candidateIndex } = input
  return [
    `Create candidate ${candidateIndex} for a ${request.durationSeconds}-second ${request.mode.replaceAll('_', ' ')} social advert.`,
    `Brand: ${profile.displayName}. Campaign objective: ${campaign.objective}.`,
    `Audience: ${audienceDescription}.`,
    offeringDescription ? `Offering: ${offeringDescription}.` : '',
    `Creative brief: ${request.prompt}`,
    `Call to action: ${request.callToAction}.`,
    `Brand tone: ${profile.voice.tones.join(', ')}.`,
    `Visual rules: ${profile.visual.videoStyleRules.join('; ') || profile.visual.imageStyleRules.join('; ') || 'premium, coherent, brand-safe visual treatment'}.`,
    `Approved claims only: ${profile.approvedClaims.join('; ') || 'no unsupported claims'}.`,
    `Do not use prohibited claims: ${profile.prohibitedClaims.join('; ') || 'none supplied'}.`,
    'Do not render unreliable readable text inside generated imagery; final overlays and captions are assembled deterministically.',
  ].filter(Boolean).join(' ')
}

export function buildSocialAdVideoPlan(input: {
  request: SocialAdVideoRequest
  campaign: MarketingCampaignBrief
  brandProfile: BrandProfile
}): SocialAdVideoPlan {
  const request = SocialAdVideoRequestSchema.parse(input.request)
  const campaign = MarketingCampaignBriefSchema.parse(input.campaign)
  const profile = BrandProfileSchema.parse(input.brandProfile)

  if (profile.status !== 'verified') throw new Error('SOCIAL_AD_VERIFIED_BRAND_REQUIRED')
  if (profile.brandProfileId !== request.brandProfileId || campaign.brandProfileId !== request.brandProfileId) {
    throw new Error('SOCIAL_AD_BRAND_PROFILE_MISMATCH')
  }
  if (campaign.campaignId !== request.campaignId) throw new Error('SOCIAL_AD_CAMPAIGN_MISMATCH')
  if (!campaign.audienceIds.includes(request.audienceId)) throw new Error('SOCIAL_AD_AUDIENCE_NOT_IN_CAMPAIGN')
  if (request.offeringId && !campaign.offeringIds.includes(request.offeringId)) {
    throw new Error('SOCIAL_AD_OFFERING_NOT_IN_CAMPAIGN')
  }

  validateModeRequirements(request, profile)
  const audience = resolveAudience(profile, request.audienceId)
  const offering = resolveOffering(profile, request.offeringId)
  const generationCapability = generationCapabilityFor(request, profile)
  const masterAspectRatio = request.aspectRatios[0]!
  const sourceArtifactIds = [...new Set([
    ...request.sourceArtifactIds,
    ...(generationCapability === 'image_to_video' ? approvedLogoArtifactIds(profile) : []),
  ])]

  const candidates: SocialAdCandidatePlan[] = Array.from(
    { length: request.candidateCount },
    (_, index) => ({
      candidateId: `${planIdFor(request)}-candidate-${index + 1}`,
      candidateIndex: index + 1,
      generationCapability,
      prompt: candidatePrompt({
        request,
        campaign,
        profile,
        audienceDescription: `${audience.name}: ${audience.description}`,
        offeringDescription: offering ? `${offering.name}: ${offering.description}` : null,
        candidateIndex: index + 1,
      }),
      negativePrompt: [
        'No distorted anatomy, warped logos, unreadable generated text, duplicated subjects, abrupt motion, low-resolution output or unlicensed brand elements.',
        ...profile.prohibitedClaims.map((claim) => `Do not imply: ${claim}`),
      ].join(' '),
      sourceArtifactIds,
      durationSeconds: request.durationSeconds,
      masterAspectRatio,
    }),
  )

  const requiredCapabilities = new Set<CapabilityKey>([
    'storyboard_generation',
    generationCapability,
    'video_understanding',
    'subtitle_generation',
  ])
  if (request.sourceArtifactIds.length > 0) requiredCapabilities.add('video_understanding')
  if (request.includeSocialCopy) requiredCapabilities.add('social_content_generation')

  const deliverables = new Set<(typeof SOCIAL_AD_DELIVERABLE_TYPES)[number]>([
    'master_video',
    'quality_report',
    'execution_evidence',
  ])
  if (request.includeCaptions) deliverables.add('captioned_video')
  if (request.includeSubtitleFiles) {
    deliverables.add('subtitle_srt')
    deliverables.add('subtitle_vtt')
  }
  if (request.includeThumbnail) deliverables.add('thumbnail')
  if (request.includeSocialCopy) deliverables.add('social_copy')

  return SocialAdVideoPlanSchema.parse({
    version: 'social-ad-video-v1',
    planId: planIdFor(request),
    appSlug: profile.appSlug,
    brandProfileId: profile.brandProfileId,
    campaignId: campaign.campaignId,
    mode: request.mode,
    stages: SOCIAL_AD_WORKFLOW_STAGES,
    requiredCapabilities: [...requiredCapabilities],
    creativeContext: {
      brandName: profile.displayName,
      objective: request.objective,
      audience: `${audience.name}: ${audience.description}`,
      offering: offering ? `${offering.name}: ${offering.description}` : null,
      approvedClaims: [...profile.approvedClaims, ...(offering?.approvedClaims ?? [])],
      prohibitedClaims: profile.prohibitedClaims,
      requiredDisclaimers: offering?.requiredDisclaimers ?? [],
      toneRules: [...profile.voice.tones, ...profile.voice.styleRules],
      visualRules: [...profile.visual.imageStyleRules, ...profile.visual.videoStyleRules],
      callToAction: request.callToAction,
      channels: campaign.channels,
    },
    candidates,
    deliveryVariants: request.aspectRatios.map((aspectRatio) => ({
      variantId: `${planIdFor(request)}-${aspectRatio.replace(':', 'x')}`,
      aspectRatio,
      durationSeconds: request.durationSeconds,
      includeCaptions: request.includeCaptions,
      includeSubtitleFiles: request.includeSubtitleFiles,
      includeThumbnail: request.includeThumbnail,
    })),
    deliverables: [...deliverables],
    qualityPolicy: createQualityPolicy(request.qualityProfile, {
      policyId: `quality:social-ad:${request.qualityProfile}:v1`,
      requireHumanApproval: request.approvalRequired,
      requireRightsVerification: true,
    }),
    approvalRequired: request.approvalRequired,
    maxCredits: request.maxCredits,
    executionAuthority: 'orchestra',
  })
}
