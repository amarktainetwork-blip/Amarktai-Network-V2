import { describe, expect, it } from 'vitest'
import {
  BRAND_PROFILE_ARTIFACT_SUBTYPE,
  BRAND_PROFILE_ARTIFACT_TYPE,
  brandProfileArtifactId,
  parseStoredBrandProfile,
  serializeBrandProfile,
} from '../apps/api/src/lib/brand-profile-store.js'

const now = '2026-07-21T10:00:00+02:00'

function profile(appSlug = 'marketing-app', brandProfileId = 'brand-1') {
  return {
    version: 1 as const,
    brandProfileId,
    appSlug,
    status: 'verified' as const,
    displayName: 'Test Brand',
    legalName: null,
    website: 'https://example.com',
    summary: 'An evidence-backed test brand profile.',
    mission: null,
    positioning: null,
    differentiators: [],
    audiences: [],
    voice: { tones: ['clear'], styleRules: [], approvedPhrases: [], forbiddenPhrases: [], locale: 'en-ZA' },
    visual: { palette: [], typography: [], imageStyleRules: [], videoStyleRules: [], assets: [] },
    offerings: [],
    approvedClaims: [],
    prohibitedClaims: [],
    sourceEvidence: [{
      sourceId: 'source-1',
      sourceType: 'user_input' as const,
      url: null,
      title: 'Approved user input',
      capturedAt: now,
      contentHash: 'sha256:1234567890abcdef1234567890abcdef',
      rightsBasis: 'user_asserted' as const,
      confidence: 0.95,
    }],
    overallConfidence: 0.9,
    rightsDeclaredBy: 'user-1',
    rightsDeclaredAt: now,
    createdAt: now,
    updatedAt: now,
  }
}

describe('Brand Profile artifact identity', () => {
  it('is deterministic without exposing the app slug or external profile ID', () => {
    const first = brandProfileArtifactId('marketing-app', 'brand-1')
    const second = brandProfileArtifactId('marketing-app', 'brand-1')
    expect(first).toBe(second)
    expect(first).toMatch(/^brand-[0-9a-f]{40}$/)
    expect(first).not.toContain('marketing-app')
    expect(first).not.toContain('brand-1')
  })

  it('isolates identical profile IDs across apps', () => {
    expect(brandProfileArtifactId('marketing-app', 'brand-1'))
      .not.toBe(brandProfileArtifactId('horse-app', 'brand-1'))
  })
})

describe('Brand Profile artifact payload', () => {
  it('uses the existing durable document artifact contract', () => {
    expect(BRAND_PROFILE_ARTIFACT_TYPE).toBe('document')
    expect(BRAND_PROFILE_ARTIFACT_SUBTYPE).toBe('brand_profile')
  })

  it('round-trips a validated profile without losing evidence', () => {
    const original = profile()
    const restored = parseStoredBrandProfile(serializeBrandProfile(original))
    expect(restored).toEqual(original)
    expect(restored.sourceEvidence[0]?.contentHash).toContain('sha256:')
  })

  it('rejects corrupt stored JSON instead of fabricating a profile', () => {
    expect(() => parseStoredBrandProfile('{not-json')).toThrow('Stored Brand Profile metadata is not valid JSON')
  })
})
