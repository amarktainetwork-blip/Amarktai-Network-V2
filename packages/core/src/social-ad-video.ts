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

export const ProductBreakoutCreativeContractSchema = z.object({
  version: z.literal('product-breakout-v1'),
  productSourceArtifactId: z.string().min(1),
  logoArtifactIds: z.array(z.string().min(1)),
  treatment: z.literal('social_post_card_frame'),
  initialContainment: z.literal('product_inside_frame'),
  breakoutRequirement: z.literal('product_visibly_crosses_frame_boundary'),
  depthTreatment: z.object({ foreground: z.string().min(1), background: z.string().min(1) }).strict(),
  motion: z.object({ scale: z.string().min(1), camera: z.string().min(1) }).strict(),
  preservation: z.object({ productIdentity: z.literal('required'), productGeometry: z.literal('required'), logoIntegrity: z.literal('required') }).strict(),
  brandSafeBackground: z.string().min(1),
  approvedClaims: z.array(z.string()),
  prohibitedClaims: z.array(z.string()),
  requiredDisclaimers: z.array(z.string()),
  overlayInstructions: z.array(z.string().min(1)),
  captionInstructions: z.array(z.string().min(1)),
  safeAreas: z.record(z.enum(['16:9', '9:16', '1:1']), z.object({
    horizontalPercent: z.number().min(0).max(50),
    verticalPercent: z.number().min(0).max(50),
  }).strict()),
  callToAction: z.string().min(1),
  durationSeconds: z.number().int().min(5).max(180),
  qualityProfile: z.enum(['draft', 'standard', 'premium', 'publication']),
  candidateCount: z.number().int().min(2).max(6),
  creditCeiling: z.number().positive(),
  segmentationAvailable: z.boolean(),
  visualLimitation: z.string().nullable(),
}).strict()

export type ProductBreakoutCreativeContract = z.infer<typeof ProductBreakoutCreativeContractSchema>

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
  productSourceArtifactId: z.string().nullable(),
  logoArtifactIds: z.array(z.string()),
  creativeContractVersion: z.string().nullable(),
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
  creativeContract: ProductBreakoutCreativeContractSchema.nullable(),
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
      productArtifactId: request.productArtifactId,
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

function resolveProductAsset(request: SocialAdVideoRequest, profile: BrandProfile) {
  if (request.mode !== 'product_breakout') return null
  if (!request.productArtifactId) throw new Error('SOCIAL_AD_PRODUCT_ASSET_REQUIRED')
  const asset = profile.visual.assets.find((item) => item.artifactId === request.productArtifactId)
  if (!asset) throw new Error('SOCIAL_AD_PRODUCT_ASSET_NOT_IN_BRAND')
  if (!['product', 'offering'].includes(asset.role)) throw new Error('SOCIAL_AD_PRODUCT_ASSET_ROLE_INVALID')
  if (!asset.approved) throw new Error('SOCIAL_AD_PRODUCT_ASSET_NOT_APPROVED')
  if (!asset.rightsVerified) throw new Error('SOCIAL_AD_PRODUCT_ASSET_RIGHTS_UNVERIFIED')
  if (!request.offeringId || !asset.offeringIds.includes(request.offeringId)) {
    throw new Error('SOCIAL_AD_PRODUCT_ASSET_OFFERING_MISMATCH')
  }
  if (asset.sourceEvidenceIds.length === 0) throw new Error('SOCIAL_AD_PRODUCT_ASSET_EVIDENCE_REQUIRED')
  return asset
}

function resolveApprovedLogos(request: SocialAdVideoRequest, profile: BrandProfile): string[] {
  const approved = new Set(approvedLogoArtifactIds(profile))
  for (const artifactId of request.logoArtifactIds) {
    if (!approved.has(artifactId)) throw new Error('SOCIAL_AD_LOGO_ASSET_NOT_APPROVED')
  }
  return request.logoArtifactIds.length > 0 ? [...new Set(request.logoArtifactIds)] : [...approved]
}

function generationCapabilityFor(
  request: SocialAdVideoRequest,
  profile: BrandProfile,
): 'video_generation' | 'image_to_video' | 'video_to_video' {
  if (request.mode === 'source_video_repurpose') return 'video_to_video'
  if (request.mode === 'template_remix' && request.sourceArtifactIds.length > 0) return 'video_to_video'
  if (request.mode === 'product_breakout' && request.productArtifactId) return 'image_to_video'
  if (['logo_reveal', 'offer_promotion', 'social_mockup'].includes(request.mode)
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
  const minimumReservedCredits = request.candidateCount + 3
  if (request.maxCredits < minimumReservedCredits) {
    throw new Error(`SOCIAL_AD_CREDIT_CEILING_TOO_LOW:${minimumReservedCredits}`)
  }
}

function candidatePrompt(input: {
  request: SocialAdVideoRequest
  campaign: MarketingCampaignBrief
  profile: BrandProfile
  audienceDescription: string
  offeringDescription: string | null
  candidateIndex: number
  creativeContract: ProductBreakoutCreativeContract | null
}): string {
  const { request, campaign, profile, audienceDescription, offeringDescription, candidateIndex, creativeContract } = input
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
    creativeContract
      ? `Product-breakout contract ${creativeContract.version}: begin with the approved product visibly contained inside a social post card, then use controlled scale and camera motion so the product visibly crosses beyond the card boundary while preserving exact product identity and geometry. Keep foreground and background depth coherent, keep logos intact, respect channel safe areas, and leave deterministic text overlays to assembly.`
      : '',
    'Do not render unreliable readable text inside generated imagery; final overlays and captions are assembled deterministically.',
  ].filter(Boolean).join(' ')
}

function productBreakoutContract(input: {
  request: SocialAdVideoRequest
  profile: BrandProfile
  approvedClaims: string[]
  prohibitedClaims: string[]
  requiredDisclaimers: string[]
  logoArtifactIds: string[]
}): ProductBreakoutCreativeContract | null {
  if (input.request.mode !== 'product_breakout' || !input.request.productArtifactId) return null
  return ProductBreakoutCreativeContractSchema.parse({
    version: 'product-breakout-v1',
    productSourceArtifactId: input.request.productArtifactId,
    logoArtifactIds: input.logoArtifactIds,
    treatment: 'social_post_card_frame',
    initialContainment: 'product_inside_frame',
    breakoutRequirement: 'product_visibly_crosses_frame_boundary',
    depthTreatment: {
      foreground: 'approved product remains the dominant foreground subject',
      background: 'brand-safe depth layer without competing claims or products',
    },
    motion: {
      scale: 'controlled progressive scale with no geometry warping',
      camera: 'stable forward camera move with restrained parallax',
    },
    preservation: { productIdentity: 'required', productGeometry: 'required', logoIntegrity: 'required' },
    brandSafeBackground: input.profile.visual.videoStyleRules.join('; ')
      || input.profile.visual.imageStyleRules.join('; ')
      || 'clean, premium and brand-safe',
    approvedClaims: input.approvedClaims,
    prohibitedClaims: input.prohibitedClaims,
    requiredDisclaimers: input.requiredDisclaimers,
    overlayInstructions: [
      'Render approved claims, CTA and disclaimers only during deterministic assembly.',
      'Never rely on generated readable text.',
    ],
    captionInstructions: [
      'Keep captions inside the declared safe area.',
      'Preserve required disclaimers verbatim.',
    ],
    safeAreas: {
      '16:9': { horizontalPercent: 8, verticalPercent: 10 },
      '9:16': { horizontalPercent: 10, verticalPercent: 14 },
      '1:1': { horizontalPercent: 10, verticalPercent: 12 },
    },
    callToAction: input.request.callToAction,
    durationSeconds: input.request.durationSeconds,
    qualityProfile: input.request.qualityProfile,
    candidateCount: input.request.candidateCount,
    creditCeiling: input.request.maxCredits,
    segmentationAvailable: false,
    visualLimitation: 'No segmentation mask is available; deterministic delivery uses a truthful social-card frame and requires human review of the generated breakout appearance.',
  })
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
  const productAsset = resolveProductAsset(request, profile)
  const logoArtifactIds = resolveApprovedLogos(request, profile)
  const generationCapability = generationCapabilityFor(request, profile)
  const masterAspectRatio = request.aspectRatios[0]!
  const approvedClaims = [...profile.approvedClaims, ...(offering?.approvedClaims ?? [])]
  const requiredDisclaimers = offering?.requiredDisclaimers ?? []
  const creativeContract = productBreakoutContract({
    request,
    profile,
    approvedClaims,
    prohibitedClaims: profile.prohibitedClaims,
    requiredDisclaimers,
    logoArtifactIds,
  })
  const sourceArtifactIds = [...new Set([
    ...(productAsset ? [productAsset.artifactId] : []),
    ...request.sourceArtifactIds,
    ...(generationCapability === 'image_to_video' && !productAsset ? logoArtifactIds : []),
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
        creativeContract,
      }),
      negativePrompt: [
        'No distorted anatomy, warped logos, unreadable generated text, duplicated subjects, abrupt motion, low-resolution output or unlicensed brand elements.',
        ...profile.prohibitedClaims.map((claim) => `Do not imply: ${claim}`),
      ].join(' '),
      sourceArtifactIds,
      productSourceArtifactId: productAsset?.artifactId ?? null,
      logoArtifactIds,
      creativeContractVersion: creativeContract?.version ?? null,
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
      approvedClaims,
      prohibitedClaims: profile.prohibitedClaims,
      requiredDisclaimers,
      toneRules: [...profile.voice.tones, ...profile.voice.styleRules],
      visualRules: [...profile.visual.imageStyleRules, ...profile.visual.videoStyleRules],
      callToAction: request.callToAction,
      channels: campaign.channels,
    },
    creativeContract,
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
