import { describe, expect, it } from 'vitest'
import { buildSocialAdVideoPlan } from '../packages/core/src/social-ad-video.js'

const now = '2026-07-21T10:00:00+02:00'

function brandProfile() {
  return {
    version: 1 as const,
    brandProfileId: 'brand-1',
    appSlug: 'marketing-app',
    status: 'verified' as const,
    displayName: 'Course2Career',
    legalName: null,
    website: 'https://example.com',
    summary: 'Career education and placement support.',
    mission: null,
    positioning: null,
    differentiators: ['Practical programmes'],
    audiences: [{ audienceId: 'career-switchers', name: 'Career switchers', description: 'Adults seeking a credible route into a new career.', pains: [], desiredOutcomes: [] }],
    voice: { tones: ['credible', 'encouraging'], styleRules: ['Use plain language'], approvedPhrases: [], forbiddenPhrases: [], locale: 'en-ZA' },
    visual: {
      palette: [], typography: [], imageStyleRules: ['Real people and natural light'], videoStyleRules: ['Controlled motion and restrained overlays'],
      assets: [
        { artifactId: 'logo-1', role: 'primary_logo' as const, approved: true, rightsVerified: true, sourceEvidenceIds: ['source-1'], offeringIds: [] },
        { artifactId: 'product-1', role: 'product' as const, approved: true, rightsVerified: true, sourceEvidenceIds: ['source-1'], offeringIds: ['data-programme'] },
      ],
    },
    offerings: [{ offeringId: 'data-programme', name: 'Data Career Programme', description: 'Practical data training with career support.', url: null, priceText: null, approvedClaims: ['Practical portfolio projects'], requiredDisclaimers: [] }],
    approvedClaims: ['Practical portfolio projects'],
    prohibitedClaims: ['Guaranteed employment'],
    sourceEvidence: [{ sourceId: 'source-1', sourceType: 'user_input' as const, url: null, title: 'Approved input', capturedAt: now, contentHash: 'sha256:1234567890abcdef1234567890abcdef', rightsBasis: 'user_asserted' as const, confidence: 0.95 }],
    overallConfidence: 0.9,
    rightsDeclaredBy: 'user-1', rightsDeclaredAt: now, createdAt: now, updatedAt: now,
  }
}

function campaign() {
  return {
    campaignId: 'campaign-1', brandProfileId: 'brand-1', title: 'Spring launch', objective: 'Drive qualified prospective learners to the programme page.',
    audienceIds: ['career-switchers'], offeringIds: ['data-programme'], channels: ['facebook', 'instagram'] as const,
    callToAction: 'Explore the programme', locale: 'en-ZA', constraints: [], sourceArtifactIds: [], qualityProfile: 'premium' as const,
    approvalRequired: true, maxCredits: 250, dueAt: null,
  }
}

function request() {
  return {
    brandProfileId: 'brand-1', campaignId: 'campaign-1', mode: 'product_breakout' as const,
    prompt: 'Create a premium transformation-led advert for the approved programme.', objective: 'Increase qualified programme enquiries.',
    audienceId: 'career-switchers', offeringId: 'data-programme', productArtifactId: 'product-1', logoArtifactIds: ['logo-1'], callToAction: 'Explore the programme', sourceArtifactIds: [],
    aspectRatios: ['16:9', '9:16', '1:1'] as const, durationSeconds: 30, candidateCount: 3,
    includeCaptions: true, includeSubtitleFiles: true, includeThumbnail: true, includeSocialCopy: true,
    qualityProfile: 'premium' as const, approvalRequired: true, maxCredits: 250,
  }
}

describe('social ad video planner', () => {
  it('creates multiple candidates and delivery variants without provider or model authority', () => {
    const plan = buildSocialAdVideoPlan({ request: request(), campaign: campaign(), brandProfile: brandProfile() })
    expect(plan.candidates).toHaveLength(3)
    expect(plan.deliveryVariants.map((item) => item.aspectRatio)).toEqual(['16:9', '9:16', '1:1'])
    expect(plan.candidates[0]?.generationCapability).toBe('image_to_video')
    expect(plan.executionAuthority).toBe('orchestra')
    expect(JSON.stringify(plan)).not.toMatch(/"provider"|"model"|"route"|"executorId"/)
    expect(plan.deliverables).toContain('quality_report')
    expect(plan.qualityPolicy.requireHumanApproval).toBe(true)
    expect(plan.creativeContract).toMatchObject({
      version: 'product-breakout-v1',
      productSourceArtifactId: 'product-1',
      breakoutRequirement: 'product_visibly_crosses_frame_boundary',
      segmentationAvailable: false,
    })
    expect(plan.candidates[0]).toMatchObject({
      productSourceArtifactId: 'product-1',
      logoArtifactIds: ['logo-1'],
      creativeContractVersion: 'product-breakout-v1',
    })
  })

  it('requires a source video for repurposing mode', () => {
    expect(() => buildSocialAdVideoPlan({ request: { ...request(), mode: 'source_video_repurpose', sourceArtifactIds: [] }, campaign: campaign(), brandProfile: brandProfile() }))
      .toThrow('SOCIAL_AD_SOURCE_VIDEO_REQUIRED')
  })

  it('rejects unverified brands and mismatched campaign scope', () => {
    expect(() => buildSocialAdVideoPlan({ request: request(), campaign: campaign(), brandProfile: { ...brandProfile(), status: 'draft' } }))
      .toThrow('SOCIAL_AD_VERIFIED_BRAND_REQUIRED')
    expect(() => buildSocialAdVideoPlan({ request: request(), campaign: { ...campaign(), campaignId: 'other' }, brandProfile: brandProfile() }))
      .toThrow('SOCIAL_AD_CAMPAIGN_MISMATCH')
  })

  it('does not allow premium output to bypass app approval', () => {
    expect(() => buildSocialAdVideoPlan({ request: { ...request(), approvalRequired: false }, campaign: campaign(), brandProfile: brandProfile() }))
      .toThrow('SOCIAL_AD_PREMIUM_APPROVAL_REQUIRED')
  })

  it('rejects missing, unapproved, rights-unverified and offering-mismatched product assets', () => {
    expect(() => buildSocialAdVideoPlan({ request: { ...request(), productArtifactId: null }, campaign: campaign(), brandProfile: brandProfile() }))
      .toThrow('SOCIAL_AD_PRODUCT_ASSET_REQUIRED')
    const unapproved = brandProfile()
    unapproved.visual.assets[1]!.approved = false
    expect(() => buildSocialAdVideoPlan({ request: request(), campaign: campaign(), brandProfile: unapproved }))
      .toThrow('SOCIAL_AD_PRODUCT_ASSET_NOT_APPROVED')
    const unverified = brandProfile()
    unverified.visual.assets[1]!.rightsVerified = false
    expect(() => buildSocialAdVideoPlan({ request: request(), campaign: campaign(), brandProfile: unverified }))
      .toThrow('SOCIAL_AD_PRODUCT_ASSET_RIGHTS_UNVERIFIED')
    const mismatched = brandProfile()
    mismatched.visual.assets[1]!.offeringIds = ['other-offering']
    expect(() => buildSocialAdVideoPlan({ request: request(), campaign: campaign(), brandProfile: mismatched }))
      .toThrow('SOCIAL_AD_PRODUCT_ASSET_OFFERING_MISMATCH')
  })
})
