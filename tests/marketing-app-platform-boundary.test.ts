import { describe, expect, it } from 'vitest'
import {
  BrandProfileSchema,
  MARKETING_APP_FORBIDDEN_EXECUTION_FIELDS,
  MARKETING_APP_OWNED_PRODUCT_CONCERNS,
  MARKETING_PLATFORM_CAPABILITY_KEYS,
  NETWORK_OWNED_MARKETING_POWERS,
  SocialAdVideoRequestSchema,
  validateMarketingCapabilityRequest,
} from '../packages/core/src/marketing-platform.js'

const now = '2026-07-21T10:00:00+02:00'

function validBrandProfile() {
  return {
    version: 1 as const,
    brandProfileId: 'brand-course2career',
    appSlug: 'marketing-app',
    status: 'verified' as const,
    displayName: 'Course2Career',
    legalName: 'Course2Career (Pty) Ltd',
    website: 'https://example.com',
    summary: 'Career education and placement support for ambitious learners.',
    mission: 'Help learners turn practical education into better careers.',
    positioning: 'A guided path from training to employment outcomes.',
    differentiators: ['Practical programmes', 'Career-focused support'],
    audiences: [{
      audienceId: 'career-switchers',
      name: 'Career switchers',
      description: 'Working adults seeking a credible route into a new field.',
      pains: ['Unclear learning path'],
      desiredOutcomes: ['Job-ready skills'],
    }],
    voice: {
      tones: ['credible', 'encouraging'],
      styleRules: ['Use plain language'],
      approvedPhrases: ['Build practical career momentum'],
      forbiddenPhrases: ['Guaranteed employment'],
      locale: 'en-ZA',
    },
    visual: {
      palette: [{ name: 'Primary blue', hex: '#0057B8', role: 'primary' as const }],
      typography: [{ family: 'Inter', role: 'body' as const, source: null }],
      imageStyleRules: ['Real people in credible learning environments'],
      videoStyleRules: ['Natural motion and restrained overlays'],
      assets: [{
        artifactId: 'artifact-logo-1',
        role: 'primary_logo' as const,
        approved: true,
        rightsVerified: true,
        sourceEvidenceIds: ['source-homepage'],
      }],
    },
    offerings: [{
      offeringId: 'programme-data',
      name: 'Data Career Programme',
      description: 'Practical data training with career support.',
      url: 'https://example.com/data',
      priceText: null,
      approvedClaims: ['Practical portfolio projects'],
      requiredDisclaimers: [],
    }],
    approvedClaims: ['Practical portfolio projects'],
    prohibitedClaims: ['Guaranteed employment'],
    sourceEvidence: [{
      sourceId: 'source-homepage',
      sourceType: 'website' as const,
      url: 'https://example.com',
      title: 'Course2Career home page',
      capturedAt: now,
      contentHash: 'sha256:1234567890abcdef1234567890abcdef',
      rightsBasis: 'authorised_access' as const,
      confidence: 0.96,
    }],
    overallConfidence: 0.9,
    rightsDeclaredBy: 'marketing-app-user-1',
    rightsDeclaredAt: now,
    createdAt: now,
    updatedAt: now,
  }
}

describe('marketing app and Network boundary', () => {
  it('keeps product decisions in the Marketing App and reusable execution powers in the Network', () => {
    expect(MARKETING_APP_OWNED_PRODUCT_CONCERNS).toContain('campaign_brief_and_strategy_experience')
    expect(MARKETING_APP_OWNED_PRODUCT_CONCERNS).toContain('human_approval_and_revision_decisions')
    expect(NETWORK_OWNED_MARKETING_POWERS).toContain('capability_routing_and_fallback')
    expect(NETWORK_OWNED_MARKETING_POWERS).toContain('quality_evaluation_and_candidate_selection')
    expect(NETWORK_OWNED_MARKETING_POWERS).toContain('secure_connector_execution')
  })

  it('exposes only non-adult and non-3D powers to the Marketing App contract', () => {
    expect(MARKETING_PLATFORM_CAPABILITY_KEYS.length).toBeGreaterThan(20)
    expect(MARKETING_PLATFORM_CAPABILITY_KEYS.some((key) => key.startsWith('adult_'))).toBe(false)
    expect(MARKETING_PLATFORM_CAPABILITY_KEYS).not.toContain('text_to_3d')
    expect(MARKETING_PLATFORM_CAPABILITY_KEYS).not.toContain('image_to_3d')
  })

  it('rejects provider, model and route authority from Marketing App requests', () => {
    for (const field of MARKETING_APP_FORBIDDEN_EXECUTION_FIELDS) {
      expect(() => validateMarketingCapabilityRequest({
        capability: 'campaign_generation',
        prompt: 'Create a multi-channel launch campaign for this approved brand profile.',
        [field]: field === 'route' ? { provider: 'genx', model: 'hidden' } : 'hidden',
      })).toThrow(`Marketing App request must not include execution authority field: ${field}`)
    }
  })

  it('accepts an outcome request without provider or model fields', () => {
    expect(validateMarketingCapabilityRequest({
      capability: 'campaign_generation',
      prompt: 'Create a multi-channel launch campaign for this approved brand profile.',
      input: { brandProfileId: 'brand-course2career', campaignId: 'campaign-spring' },
      metadata: { requestedBy: 'marketing-app-user-1' },
    })).toMatchObject({ capability: 'campaign_generation' })
  })
})

describe('shared brand intelligence contract', () => {
  it('accepts a verified, evidence-backed brand profile', () => {
    expect(BrandProfileSchema.parse(validBrandProfile())).toMatchObject({
      status: 'verified',
      appSlug: 'marketing-app',
      overallConfidence: 0.9,
    })
  })

  it('rejects verified profiles with weak confidence', () => {
    const profile = { ...validBrandProfile(), overallConfidence: 0.5 }
    expect(() => BrandProfileSchema.parse(profile)).toThrow('Verified brand profiles require at least 0.75 confidence')
  })

  it('rejects brand assets without matching source evidence', () => {
    const profile = validBrandProfile()
    profile.visual.assets[0]!.sourceEvidenceIds = ['missing-source']
    expect(() => BrandProfileSchema.parse(profile)).toThrow('Brand asset references missing source evidence')
  })
})

describe('social ad capability input', () => {
  it('supports reusable multi-format production while keeping product decisions in the app', () => {
    const parsed = SocialAdVideoRequestSchema.parse({
      brandProfileId: 'brand-course2career',
      campaignId: 'campaign-spring',
      mode: 'product_breakout',
      prompt: 'Turn the approved course offer into a premium social advert with a clear transformation story.',
      objective: 'Drive qualified prospective learners to the programme page.',
      audienceId: 'career-switchers',
      offeringId: 'programme-data',
      callToAction: 'Explore the programme',
      sourceArtifactIds: ['artifact-logo-1'],
      aspectRatios: ['16:9', '9:16', '1:1'],
      durationSeconds: 30,
      candidateCount: 3,
      maxCredits: 250,
    })

    expect(parsed.aspectRatios).toEqual(['16:9', '9:16', '1:1'])
    expect(parsed.qualityProfile).toBe('premium')
    expect(parsed.approvalRequired).toBe(true)
  })

  it('rejects hidden execution authority because the request schema is strict', () => {
    expect(() => SocialAdVideoRequestSchema.parse({
      brandProfileId: 'brand-course2career',
      campaignId: 'campaign-spring',
      mode: 'start_from_scratch',
      prompt: 'Create a high-quality social advert from the approved brand and campaign brief.',
      objective: 'Increase qualified awareness.',
      audienceId: 'career-switchers',
      offeringId: null,
      callToAction: 'Learn more',
      aspectRatios: ['9:16'],
      durationSeconds: 15,
      maxCredits: 100,
      provider: 'genx',
    })).toThrow()
  })
})
