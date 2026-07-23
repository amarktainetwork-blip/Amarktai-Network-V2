import { readFileSync } from 'node:fs'
import { resolve } from 'node:path'
import { describe, expect, it } from 'vitest'
import {
  BrandScrapeRequestSchema,
  CampaignGenerationRequestSchema,
  DocumentIngestRequestSchema,
  SPECIALIST_VISION_CAPABILITIES,
  SPECIALIST_VISION_REQUEST_SCHEMAS,
  chunkDocumentPages,
  inspectDocumentArtifact,
  inspectImageArtifact,
} from '../packages/core/src/index.ts'
import { DURABLE_WORKFLOW_REGISTRATIONS } from '../packages/core/src/long-form-execution.ts'
import { isForbiddenResearchHostname, normalizeResearchUrl } from '../packages/core/src/research-platform.ts'

const root = resolve(import.meta.dirname, '..')
const read = (path: string) => readFileSync(resolve(root, path), 'utf8')
const uuid = '11111111-1111-4111-8111-111111111111'

function png(width = 320, height = 180): Buffer {
  const bytes = Buffer.alloc(24)
  Buffer.from([137, 80, 78, 71, 13, 10, 26, 10]).copy(bytes)
  bytes.writeUInt32BE(width, 16)
  bytes.writeUInt32BE(height, 20)
  return bytes
}

describe('specialist vision and durable workflow closure', () => {
  it('publishes strict provider-neutral schemas for all six specialist capabilities', () => {
    expect(SPECIALIST_VISION_CAPABILITIES).toEqual([
      'depth_estimation', 'keypoint_detection', 'mask_generation',
      'zero_shot_object_detection', 'visual_document_retrieval', 'video_classification',
    ])
    const common = { maxCredits: 100, idempotencyKey: 'specialist-test-1' }
    expect(SPECIALIST_VISION_REQUEST_SCHEMAS.depth_estimation.parse({ ...common, sourceImageArtifactId: uuid }).outputMode).toBe('relative')
    expect(SPECIALIST_VISION_REQUEST_SCHEMAS.keypoint_detection.parse({ ...common, sourceImageArtifactId: uuid, domain: 'pose' }).overlay).toBe(true)
    expect(SPECIALIST_VISION_REQUEST_SCHEMAS.mask_generation.parse({ ...common, sourceImageArtifactId: uuid, guidance: { type: 'prompt', prompt: 'foreground' } }).maxMasks).toBe(10)
    expect(SPECIALIST_VISION_REQUEST_SCHEMAS.zero_shot_object_detection.parse({ ...common, sourceImageArtifactId: uuid, candidateLabels: ['product', 'product'] }).candidateLabels).toEqual(['product'])
    expect(SPECIALIST_VISION_REQUEST_SCHEMAS.visual_document_retrieval.parse({ ...common, sourceDocumentArtifactId: uuid, query: 'evidence' }).citationsRequired).toBe(true)
    expect(SPECIALIST_VISION_REQUEST_SCHEMAS.video_classification.parse({ ...common, sourceVideoArtifactId: uuid, candidateLabels: ['demo'] }).samplingProfile).toBe('balanced')
    for (const schema of Object.values(SPECIALIST_VISION_REQUEST_SCHEMAS)) {
      expect(schema.safeParse({ ...common, sourceImageArtifactId: uuid, provider: 'deepinfra' }).success).toBe(false)
      expect(schema.safeParse({ ...common, sourceImageArtifactId: 'https://example.com/image.png' }).success).toBe(false)
    }
  })

  it('inspects source bytes instead of trusting extensions or declared MIME', () => {
    const image = inspectImageArtifact(png())
    expect(image).toMatchObject({ detectedMimeType: 'image/png', width: 320, height: 180, byteLength: 24 })
    expect(image.checksum).toMatch(/^[a-f0-9]{64}$/)
    const document = inspectDocumentArtifact(Buffer.from('Authorised plain-text evidence.'))
    expect(document).toMatchObject({ kind: 'document', detectedMimeType: 'text/plain', pageCount: 1 })
    expect(() => inspectImageArtifact(Buffer.from('not an image'))).toThrow(/supported PNG or JPEG/)
    expect(() => inspectDocumentArtifact(Buffer.from([0, 1, 2, 3]))).toThrow(/unsupported/)
  })

  it('keeps SSRF protections fail-closed for brand scraping', () => {
    for (const host of ['localhost', '127.0.0.1', '10.0.0.1', '169.254.169.254', '192.168.1.1', '::1']) expect(isForbiddenResearchHostname(host)).toBe(true)
    expect(() => normalizeResearchUrl('http://example.com')).toThrow(/HTTPS/)
    expect(() => normalizeResearchUrl('https://127.0.0.1/metadata')).toThrow(/publicly routable/)
    expect(BrandScrapeRequestSchema.safeParse({ url: 'https://example.com', permittedContentCategories: ['brand'], maxCredits: 10, idempotencyKey: 'brand-test-1', endpoint: 'https://evil.invalid' }).success).toBe(false)
  })

  it('chunks page structure deterministically and preserves app/document isolation evidence', () => {
    const input = { appSlug: 'app-a', documentId: 'doc-a', artifactId: uuid, checksum: 'a'.repeat(64), pages: [{ page: 2, section: 'Evidence', text: 'A'.repeat(500) + '. ' + 'B'.repeat(500), coordinates: { x: 0, y: 0, width: 100, height: 100 }, parserEvidence: 'pdfjs-dist@5.4.624', ocrEvidence: null }], chunkSize: 400, chunkOverlap: 50 }
    const first = chunkDocumentPages(input)
    const second = chunkDocumentPages(input)
    expect(first).toEqual(second)
    expect(first.length).toBeGreaterThan(1)
    expect(first.every((chunk) => chunk.appSlug === 'app-a' && chunk.documentId === 'doc-a' && chunk.page === 2 && chunk.chunkHash.match(/^[a-f0-9]{64}$/))).toBe(true)
    expect(DocumentIngestRequestSchema.safeParse({ sourceArtifactId: uuid, documentId: 'doc-a', namespace: 'tenant-a', maxCredits: 10, idempotencyKey: 'document-test-1', chunkSize: 200, chunkOverlap: 200 }).success).toBe(false)
  })

  it('requires verified-plan ownership inputs and explicit campaign approval', () => {
    const parsed = CampaignGenerationRequestSchema.parse({ campaignId: 'campaign-a', brandProfileId: 'brand-a', offeringId: 'offering-a', objective: 'Launch the approved offering with credible evidence.', audienceIds: ['buyers'], channels: ['linkedin'], startDate: '2026-07-22', endDate: '2026-07-29', budgetCredits: 100, idempotencyKey: 'campaign-test-1' })
    expect(parsed.approvalRequired).toBe(true)
    expect(CampaignGenerationRequestSchema.safeParse({ ...parsed, approvalRequired: false }).success).toBe(false)
    expect(CampaignGenerationRequestSchema.safeParse({ ...parsed, model: 'forbidden' }).success).toBe(false)
  })

  it('registers only fixture-backed durable workflow truth and exact recovery evidence', () => {
    for (const capability of ['brand_scrape', 'document_ingest', 'campaign_generation']) {
      const workflow = DURABLE_WORKFLOW_REGISTRATIONS.find((item) => item.capability === capability)
      expect(workflow?.handlerName).toBe('advanceDurableClosureWorkflow')
      expect(workflow?.fixtureProof).toMatch(/RELEASE_FIXTURE/)
      expect(workflow?.recovery).toMatch(/idempotent/)
    }
    expect(read('packages/db/src/schema-guard.ts')).toContain('20260722_specialist_workflow_closure')
    expect(read('prisma/migrations/20260722_specialist_workflow_closure/migration.sql')).toContain('document_ingest_chunks')
  })

  it('applies canonical idempotency to every validated capability input', () => {
    const jobs = read('apps/api/src/routes/jobs.ts')
    expect(jobs).toContain("const idempotencyKey = typeof validatedInput.idempotencyKey === 'string'")
    expect(jobs).not.toContain("internalArtifactCapability && typeof validatedInput.idempotencyKey === 'string'")
    expect(jobs).toContain('durableIdempotencyTrace(auth.app!.slug, capability, idempotencyKey)')
    expect(jobs).toContain("where: { appSlug: auth.app!.slug, capability, traceId }")
  })

  it('wires canonical jobs, artifact downloads, dashboard, SDK, OpenAPI and fixture proof without provider selectors', () => {
    const api = read('apps/api/src/routes/app-durable-workflows.ts')
    const fixture = read('scripts/lib/proof-specialist-workflow-release-fixture.mjs')
    const sdk = read('packages/sdk/src/index.ts')
    const openapi = read('docs/app-api-openapi.yaml')
    const dashboard = read('app/dashboard/specialist-vision/page.js')
    for (const route of ['brand-scrape', 'document-ingest', 'campaign-generation']) expect(api).toContain(`/api/v1/${route}/executions`)
    for (const capability of SPECIALIST_VISION_CAPABILITIES) {
      expect(sdk).toContain(capability)
      expect(openapi).toContain(capability)
      expect(dashboard).toContain(capability)
      expect(fixture).toContain(capability)
    }
    expect(api).toContain('forbiddenAuthority')
    expect(dashboard).not.toMatch(/provider\s*<select|model\s*<select/i)
    expect(dashboard).toContain('A production-compatible executor is not registered. Local fixture proof is not live-provider proof.')
    expect(fixture).toContain("evidenceSource === 'local_fixture'")
    expect(fixture).toContain('liveProviderProof === false')
  })

  it('does not touch voice/audio ownership or deferred adult and 3D implementation files', () => {
    const changedRuntime = [
      'packages/core/src/specialist-vision.ts', 'packages/core/src/durable-workflows.ts',
      'apps/worker/src/durable-workflow.ts', 'apps/api/src/routes/app-durable-workflows.ts',
    ].map(read).join('\n')
    expect(changedRuntime).not.toMatch(/voice_clone|voice_conversion|audio_to_audio|lip_sync|avatar_generation/)
    expect(changedRuntime).not.toMatch(/adult_text|adult_image|adult_voice|adult_avatar|adult_video|text_to_3d|image_to_3d/)
  })
})
