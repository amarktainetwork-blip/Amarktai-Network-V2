import { createHash } from 'node:crypto'
import { z } from 'zod'
import { MARKETING_CHANNELS } from './marketing-platform.js'
import { QUALITY_PROFILES } from './quality-evaluation.js'
import { normalizeResearchUrl } from './research-platform.js'

const IdempotencyKey = z.string().regex(/^[A-Za-z0-9._:-]{8,200}$/)
const MaxCredits = z.number().positive().max(1_000_000)
const ArtifactId = z.string().uuid()

export const BrandScrapeRequestSchema = z.object({
  url: z.string().url().max(4_096),
  crawlDepth: z.number().int().min(0).max(3).default(1),
  permittedContentCategories: z.array(z.enum(['brand', 'products', 'services', 'legal', 'contact', 'about', 'assets'])).min(1).max(7),
  campaignId: z.string().trim().min(1).max(200).optional(),
  maxPages: z.number().int().min(1).max(20).default(8),
  maxCredits: MaxCredits,
  idempotencyKey: IdempotencyKey,
}).strict().transform((value) => ({ ...value, url: normalizeResearchUrl(value.url) }))

export const BrandProfileProposalSchema = z.object({
  version: z.literal(1),
  sourceWebsite: z.string().url(),
  displayName: z.string().min(1).max(300),
  summary: z.string().min(1).max(5_000),
  colors: z.array(z.object({ hex: z.string().regex(/^#[0-9A-Fa-f]{6}$/), evidenceCitationIds: z.array(z.string().min(1)).min(1) }).strict()).max(30),
  typographySignals: z.array(z.object({ family: z.string().min(1).max(200), evidenceCitationIds: z.array(z.string().min(1)).min(1) }).strict()).max(30),
  assetCandidates: z.array(z.object({ sourceUrl: z.string().url(), role: z.enum(['logo', 'icon', 'product', 'photography']), approved: z.literal(false), evidenceCitationIds: z.array(z.string().min(1)).min(1) }).strict()).max(100),
  offeringCandidates: z.array(z.object({ name: z.string().min(1).max(300), description: z.string().max(5_000), evidenceCitationIds: z.array(z.string().min(1)).min(1) }).strict()).max(100),
  claims: z.array(z.object({ text: z.string().min(1).max(2_000), evidenceCitationIds: z.array(z.string().min(1)).min(1), humanReviewRequired: z.boolean() }).strict()).max(200),
  legalSignals: z.array(z.object({ text: z.string().min(1).max(2_000), evidenceCitationIds: z.array(z.string().min(1)).min(1) }).strict()).max(100),
  citations: z.array(z.object({ citationId: z.string().min(1), sourceId: z.string().min(1), url: z.string().url(), title: z.string().min(1), contentHash: z.string().regex(/^[a-f0-9]{64}$/), capturedAt: z.string().datetime() }).strict()).min(1),
  approval: z.object({ required: z.literal(true), status: z.enum(['pending', 'approved', 'rejected']), materialVerifiedProfileChange: z.boolean() }).strict(),
}).strict()

export const DocumentIngestRequestSchema = z.object({
  sourceArtifactId: ArtifactId,
  documentId: z.string().trim().min(1).max(200),
  namespace: z.string().trim().min(1).max(100).regex(/^[a-zA-Z0-9][a-zA-Z0-9._:-]*$/),
  title: z.string().trim().min(1).max(1_000).optional(),
  chunkSize: z.number().int().min(200).max(4_000).default(1_200),
  chunkOverlap: z.number().int().min(0).max(800).default(200),
  ocrMode: z.enum(['automatic', 'never', 'always']).default('automatic'),
  maxPages: z.number().int().min(1).max(2_000).default(500),
  maxCredits: MaxCredits,
  idempotencyKey: IdempotencyKey,
}).strict().superRefine((value, context) => {
  if (value.chunkOverlap >= value.chunkSize) context.addIssue({ code: 'custom', path: ['chunkOverlap'], message: 'chunkOverlap must be smaller than chunkSize.' })
})

export interface DocumentPageText {
  page: number
  section: string | null
  text: string
  coordinates?: { x: number; y: number; width: number; height: number } | null
  parserEvidence: string
  ocrEvidence: string | null
}

export interface DocumentChunk {
  appSlug: string
  documentId: string
  artifactId: string
  checksum: string
  page: number
  section: string | null
  text: string
  coordinates: DocumentPageText['coordinates']
  chunkIndex: number
  chunkHash: string
  citationId: string
  parserEvidence: string
  ocrEvidence: string | null
}

export function chunkDocumentPages(input: {
  appSlug: string
  documentId: string
  artifactId: string
  checksum: string
  pages: readonly DocumentPageText[]
  chunkSize?: number
  chunkOverlap?: number
}): DocumentChunk[] {
  const chunkSize = input.chunkSize ?? 1_200
  const overlap = input.chunkOverlap ?? 200
  if (overlap < 0 || overlap >= chunkSize) throw new Error('Invalid document chunk overlap.')
  const chunks: DocumentChunk[] = []
  for (const page of input.pages) {
    const text = page.text.replace(/\r\n?/g, '\n').trim()
    if (!text) continue
    let start = 0
    while (start < text.length) {
      let end = Math.min(text.length, start + chunkSize)
      if (end < text.length) {
        const boundary = Math.max(text.lastIndexOf('\n', end), text.lastIndexOf('. ', end), text.lastIndexOf(' ', end))
        if (boundary > start + Math.floor(chunkSize * 0.55)) end = boundary + 1
      }
      const value = text.slice(start, end).trim()
      if (value) {
        const chunkIndex = chunks.length
        const chunkHash = createHash('sha256').update(value).digest('hex')
        chunks.push({
          appSlug: input.appSlug,
          documentId: input.documentId,
          artifactId: input.artifactId,
          checksum: input.checksum,
          page: page.page,
          section: page.section,
          text: value,
          coordinates: page.coordinates ?? null,
          chunkIndex,
          chunkHash,
          citationId: `${input.documentId}:page-${page.page}:chunk-${chunkIndex}`,
          parserEvidence: page.parserEvidence,
          ocrEvidence: page.ocrEvidence,
        })
      }
      if (end >= text.length) break
      start = Math.max(start + 1, end - overlap)
    }
  }
  if (!chunks.length) throw new Error('Document extraction produced no ingestible text.')
  return chunks
}

export const CampaignGenerationRequestSchema = z.object({
  campaignId: z.string().trim().min(1).max(200),
  brandProfileId: z.string().trim().min(1).max(200),
  offeringId: z.string().trim().min(1).max(120),
  objective: z.string().trim().min(10).max(5_000),
  audienceIds: z.array(z.string().trim().min(1).max(120)).min(1).max(50),
  channels: z.array(z.enum(MARKETING_CHANNELS)).min(1),
  startDate: z.string().date(),
  endDate: z.string().date(),
  researchExecutionIds: z.array(z.string().trim().min(1).max(200)).max(100).default([]),
  ragNamespace: z.string().trim().min(1).max(100).regex(/^[a-zA-Z0-9][a-zA-Z0-9._:-]*$/).optional(),
  budgetCredits: MaxCredits,
  qualityProfile: z.enum(QUALITY_PROFILES).default('standard'),
  approvalRequired: z.literal(true).default(true),
  createChildSocialWorkflows: z.boolean().default(false),
  idempotencyKey: IdempotencyKey,
}).strict().refine((value) => value.endDate >= value.startDate, { path: ['endDate'], message: 'endDate must be on or after startDate.' })

const CitationSchema = z.object({ citationId: z.string().min(1), sourceArtifactId: ArtifactId, excerptHash: z.string().regex(/^[a-f0-9]{64}$/), page: z.number().int().positive().nullable() }).strict()
export const CampaignPlanSchema = z.object({
  version: z.literal(1),
  campaignId: z.string().min(1),
  objective: z.string().min(1),
  audiences: z.array(z.object({ audienceId: z.string().min(1), positioning: z.string().min(1) }).strict()).min(1),
  channelPlan: z.array(z.object({ channel: z.enum(MARKETING_CHANNELS), purpose: z.string().min(1), cadence: z.string().min(1), budgetCredits: z.number().nonnegative() }).strict()).min(1),
  contentPillars: z.array(z.string().min(1)).min(1),
  messaging: z.array(z.string().min(1)).min(1),
  offers: z.array(z.string().min(1)),
  claims: z.array(z.object({ text: z.string().min(1), approved: z.boolean(), citationIds: z.array(z.string().min(1)) }).strict()),
  disclaimers: z.array(z.string().min(1)),
  assetPlan: z.array(z.object({ assetType: z.string().min(1), channel: z.enum(MARKETING_CHANNELS), quantity: z.number().int().positive() }).strict()),
  schedule: z.array(z.object({ date: z.string().date(), channel: z.enum(MARKETING_CHANNELS), activity: z.string().min(1) }).strict()).min(1),
  kpis: z.array(z.object({ name: z.string().min(1), definition: z.string().min(1), target: z.number().nullable(), targetBasis: z.string().nullable(), estimated: z.boolean() }).strict()).min(1),
  budgetAllocation: z.array(z.object({ category: z.string().min(1), credits: z.number().nonnegative() }).strict()).min(1),
  approvalGates: z.array(z.object({ gate: z.string().min(1), required: z.boolean(), status: z.enum(['pending', 'approved', 'rejected']) }).strict()).min(1),
  citations: z.array(CitationSchema),
  executionEvidence: z.object({ strategyCandidateCount: z.number().int().positive(), claimValidation: z.enum(['verified_profile_only', 'human_review_required']), researchContextUsed: z.boolean(), ragContextUsed: z.boolean() }).strict(),
}).strict().superRefine((plan, context) => {
  const citationIds = new Set(plan.citations.map((citation) => citation.citationId))
  for (const claim of plan.claims) for (const id of claim.citationIds) if (!citationIds.has(id)) context.addIssue({ code: 'custom', path: ['claims'], message: `Claim citation does not resolve: ${id}` })
  const allocated = plan.budgetAllocation.reduce((sum, item) => sum + item.credits, 0)
  const channel = plan.channelPlan.reduce((sum, item) => sum + item.budgetCredits, 0)
  if (Math.abs(allocated - channel) > 0.001) context.addIssue({ code: 'custom', path: ['budgetAllocation'], message: 'Budget allocation must equal channel budget.' })
})

export const WorkflowApprovalSchema = z.object({
  decision: z.enum(['approved', 'rejected', 'revision_requested']),
  notes: z.string().trim().min(1).max(5_000),
}).strict()

export function durableIdempotencyTrace(appSlug: string, capability: string, key: string): string {
  return `trace_${capability}_${createHash('sha256').update(`${appSlug}\0${capability}\0${key}`).digest('hex').slice(0, 32)}`
}
