import { z } from 'zod'
import { QUALITY_PROFILES } from './quality-evaluation.js'
import type { CapabilityKey } from './capabilities.js'

/**
 * The Network owns reusable execution powers. The Marketing App owns the
 * marketing product experience and requests outcomes through these contracts.
 * Neither side exposes provider/model selection to the app user or payload.
 */
export const MARKETING_PLATFORM_CAPABILITY_KEYS = [
  'reasoning',
  'summarization',
  'translation',
  'classification',
  'extraction',
  'structured_output',
  'tool_use',
  'image_generation',
  'image_edit',
  'image_to_image',
  'image_upscale',
  'video_generation',
  'image_to_video',
  'video_to_video',
  'long_form_video',
  'video_understanding',
  'storyboard_generation',
  'subtitle_generation',
  'tts',
  'stt',
  'music_generation',
  'song_generation',
  'embeddings',
  'reranking',
  'rag_ingest',
  'rag_search',
  'research',
  'brand_scrape',
  'document_ingest',
  'campaign_generation',
  'social_content_generation',
] as const satisfies readonly CapabilityKey[]

export type MarketingPlatformCapability = (typeof MARKETING_PLATFORM_CAPABILITY_KEYS)[number]

export const NETWORK_OWNED_MARKETING_POWERS = [
  'capability_routing_and_fallback',
  'provider_model_discovery',
  'brand_intelligence_extraction',
  'versioned_brand_profile_storage',
  'research_rag_and_scoped_memory',
  'campaign_and_asset_execution',
  'social_ad_video_execution',
  'content_repurposing_execution',
  'media_processing_and_assembly',
  'quality_evaluation_and_candidate_selection',
  'cost_estimation_budget_and_spend_enforcement',
  'approval_state_enforcement',
  'secure_connector_execution',
  'publishing_receipts_and_delivery_evidence',
  'artifact_storage_preview_and_download',
  'usage_provenance_and_audit_evidence',
] as const

export const MARKETING_APP_OWNED_PRODUCT_CONCERNS = [
  'customer_onboarding_experience',
  'brand_profile_review_and_editing_experience',
  'campaign_brief_and_strategy_experience',
  'audience_offer_channel_and_goal_decisions',
  'marketing_calendar_and_workflow_experience',
  'crm_customer_and_lead_context',
  'social_account_connection_experience',
  'human_approval_and_revision_decisions',
  'performance_dashboard_and_business_reporting',
  'subscription_plan_and_customer_billing_experience',
] as const

export const MARKETING_APP_FORBIDDEN_EXECUTION_FIELDS = [
  'provider',
  'model',
  'route',
  'executorId',
  'endpoint',
  'apiKey',
] as const

export const MARKETING_CHANNELS = [
  'facebook',
  'instagram',
  'linkedin',
  'x',
  'tiktok',
  'youtube',
  'email',
  'website',
  'blog',
  'paid_search',
  'display',
] as const

export const SOCIAL_AD_VIDEO_MODES = [
  'pattern_interrupt',
  'product_breakout',
  'logo_reveal',
  'character_remix',
  'social_mockup',
  'offer_promotion',
  'template_remix',
  'start_from_scratch',
  'source_video_repurpose',
] as const

export const SOCIAL_VIDEO_ASPECT_RATIOS = ['16:9', '9:16', '1:1'] as const

const HexColourSchema = z.string().regex(/^#[0-9a-fA-F]{6}$/, 'Expected a six-digit hexadecimal colour')
const IsoDateTimeSchema = z.string().datetime({ offset: true })

export const MarketingSourceEvidenceSchema = z.object({
  sourceId: z.string().min(1).max(200),
  sourceType: z.enum(['website', 'document', 'user_input', 'asset', 'research']),
  url: z.string().url().nullable().default(null),
  title: z.string().min(1).max(500),
  capturedAt: IsoDateTimeSchema,
  contentHash: z.string().min(16).max(256),
  rightsBasis: z.enum(['owned', 'licensed', 'public_domain', 'authorised_access', 'user_asserted']),
  confidence: z.number().min(0).max(1),
}).strict()

export const BrandAssetReferenceSchema = z.object({
  artifactId: z.string().min(1).max(200),
  role: z.enum(['primary_logo', 'secondary_logo', 'icon', 'product', 'campaign_reference', 'photography', 'video', 'audio']),
  approved: z.boolean().default(false),
  rightsVerified: z.boolean().default(false),
  sourceEvidenceIds: z.array(z.string().min(1)).min(1),
}).strict()

export const BrandProfileSchema = z.object({
  version: z.literal(1),
  brandProfileId: z.string().min(1).max(200),
  appSlug: z.string().min(1).max(120),
  status: z.enum(['draft', 'verified', 'archived']).default('draft'),
  displayName: z.string().min(1).max(200),
  legalName: z.string().max(300).nullable().default(null),
  website: z.string().url().nullable().default(null),
  summary: z.string().min(1).max(5000),
  mission: z.string().max(2000).nullable().default(null),
  positioning: z.string().max(3000).nullable().default(null),
  differentiators: z.array(z.string().min(1).max(1000)).max(50).default([]),
  audiences: z.array(z.object({
    audienceId: z.string().min(1).max(120),
    name: z.string().min(1).max(200),
    description: z.string().min(1).max(2000),
    pains: z.array(z.string().min(1).max(1000)).max(30).default([]),
    desiredOutcomes: z.array(z.string().min(1).max(1000)).max(30).default([]),
  }).strict()).max(50).default([]),
  voice: z.object({
    tones: z.array(z.string().min(1).max(120)).max(30),
    styleRules: z.array(z.string().min(1).max(1000)).max(100).default([]),
    approvedPhrases: z.array(z.string().min(1).max(500)).max(100).default([]),
    forbiddenPhrases: z.array(z.string().min(1).max(500)).max(100).default([]),
    locale: z.string().min(2).max(35).default('en'),
  }).strict(),
  visual: z.object({
    palette: z.array(z.object({
      name: z.string().min(1).max(120),
      hex: HexColourSchema,
      role: z.enum(['primary', 'secondary', 'accent', 'background', 'text', 'supporting']),
    }).strict()).max(30).default([]),
    typography: z.array(z.object({
      family: z.string().min(1).max(200),
      role: z.enum(['display', 'heading', 'body', 'caption', 'accent']),
      source: z.string().url().nullable().default(null),
    }).strict()).max(20).default([]),
    imageStyleRules: z.array(z.string().min(1).max(1000)).max(100).default([]),
    videoStyleRules: z.array(z.string().min(1).max(1000)).max(100).default([]),
    assets: z.array(BrandAssetReferenceSchema).max(500).default([]),
  }).strict(),
  offerings: z.array(z.object({
    offeringId: z.string().min(1).max(120),
    name: z.string().min(1).max(300),
    description: z.string().min(1).max(5000),
    url: z.string().url().nullable().default(null),
    priceText: z.string().max(500).nullable().default(null),
    approvedClaims: z.array(z.string().min(1).max(1000)).max(100).default([]),
    requiredDisclaimers: z.array(z.string().min(1).max(1000)).max(100).default([]),
  }).strict()).max(500).default([]),
  approvedClaims: z.array(z.string().min(1).max(1000)).max(500).default([]),
  prohibitedClaims: z.array(z.string().min(1).max(1000)).max(500).default([]),
  sourceEvidence: z.array(MarketingSourceEvidenceSchema).min(1).max(2000),
  overallConfidence: z.number().min(0).max(1),
  rightsDeclaredBy: z.string().min(1).max(300),
  rightsDeclaredAt: IsoDateTimeSchema,
  createdAt: IsoDateTimeSchema,
  updatedAt: IsoDateTimeSchema,
}).strict().superRefine((profile, context) => {
  const evidenceIds = new Set(profile.sourceEvidence.map((source) => source.sourceId))
  for (const asset of profile.visual.assets) {
    for (const sourceEvidenceId of asset.sourceEvidenceIds) {
      if (!evidenceIds.has(sourceEvidenceId)) {
        context.addIssue({
          code: 'custom',
          path: ['visual', 'assets'],
          message: `Brand asset references missing source evidence: ${sourceEvidenceId}`,
        })
      }
    }
  }
  if (profile.status === 'verified' && profile.overallConfidence < 0.75) {
    context.addIssue({
      code: 'custom',
      path: ['overallConfidence'],
      message: 'Verified brand profiles require at least 0.75 confidence',
    })
  }
})

export type BrandProfile = z.infer<typeof BrandProfileSchema>

export const MarketingCampaignBriefSchema = z.object({
  campaignId: z.string().min(1).max(200),
  brandProfileId: z.string().min(1).max(200),
  title: z.string().min(1).max(300),
  objective: z.string().min(10).max(5000),
  audienceIds: z.array(z.string().min(1).max(120)).min(1).max(50),
  offeringIds: z.array(z.string().min(1).max(120)).max(100).default([]),
  channels: z.array(z.enum(MARKETING_CHANNELS)).min(1),
  callToAction: z.string().min(1).max(500),
  locale: z.string().min(2).max(35).default('en'),
  constraints: z.array(z.string().min(1).max(1000)).max(100).default([]),
  sourceArtifactIds: z.array(z.string().min(1).max(200)).max(200).default([]),
  qualityProfile: z.enum(QUALITY_PROFILES).default('standard'),
  approvalRequired: z.boolean().default(true),
  maxCredits: z.number().positive().max(1_000_000).nullable().default(null),
  dueAt: IsoDateTimeSchema.nullable().default(null),
}).strict()

export type MarketingCampaignBrief = z.infer<typeof MarketingCampaignBriefSchema>

export const SocialAdVideoRequestSchema = z.object({
  brandProfileId: z.string().min(1).max(200),
  campaignId: z.string().min(1).max(200),
  mode: z.enum(SOCIAL_AD_VIDEO_MODES),
  prompt: z.string().min(10).max(10_000),
  objective: z.string().min(10).max(5000),
  audienceId: z.string().min(1).max(120),
  offeringId: z.string().min(1).max(120).nullable().default(null),
  callToAction: z.string().min(1).max(500),
  sourceArtifactIds: z.array(z.string().min(1).max(200)).max(200).default([]),
  aspectRatios: z.array(z.enum(SOCIAL_VIDEO_ASPECT_RATIOS)).min(1),
  durationSeconds: z.number().int().min(5).max(180),
  candidateCount: z.number().int().min(2).max(6).default(3),
  includeCaptions: z.boolean().default(true),
  includeSubtitleFiles: z.boolean().default(true),
  includeThumbnail: z.boolean().default(true),
  includeSocialCopy: z.boolean().default(true),
  qualityProfile: z.enum(QUALITY_PROFILES).default('premium'),
  approvalRequired: z.boolean().default(true),
  maxCredits: z.number().positive().max(1_000_000),
}).strict()

export type SocialAdVideoRequest = z.infer<typeof SocialAdVideoRequestSchema>

export const MarketingCapabilityRequestSchema = z.object({
  capability: z.enum(MARKETING_PLATFORM_CAPABILITY_KEYS),
  prompt: z.string().max(20_000).optional(),
  input: z.record(z.string(), z.unknown()).default({}),
  metadata: z.record(z.string(), z.unknown()).default({}),
  callbackUrl: z.string().url().optional(),
}).strict()

export type MarketingCapabilityRequest = z.infer<typeof MarketingCapabilityRequestSchema>

export function assertMarketingAppOwnsNoExecutionAuthority(value: unknown): void {
  if (!value || typeof value !== 'object' || Array.isArray(value)) return
  const record = value as Record<string, unknown>
  for (const forbiddenField of MARKETING_APP_FORBIDDEN_EXECUTION_FIELDS) {
    if (Object.prototype.hasOwnProperty.call(record, forbiddenField)) {
      throw new Error(`Marketing App request must not include execution authority field: ${forbiddenField}`)
    }
  }
}

export function validateMarketingCapabilityRequest(value: unknown): MarketingCapabilityRequest {
  assertMarketingAppOwnsNoExecutionAuthority(value)
  return MarketingCapabilityRequestSchema.parse(value)
}
