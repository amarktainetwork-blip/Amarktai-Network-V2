import { readFileSync } from 'node:fs'
import { describe, expect, it } from 'vitest'
import { DURABLE_WORKFLOW_REGISTRATIONS } from '../packages/core/src/long-form-execution.js'

const read = (path: string) => readFileSync(new URL(`../${path}`, import.meta.url), 'utf8')
const route = read('apps/api/src/routes/app-social-ad-video.ts')
const campaignRoute = read('apps/api/src/routes/app-marketing-campaigns.ts')
const quality = read('apps/worker/src/social-ad-quality-workflow-v2.ts')
const assembly = read('apps/worker/src/social-ad-assembly.ts')
const fixture = read('scripts/lib/proof-social-ad-release-fixture.mjs')
const runner = read('scripts/proof-release-fixture.mjs')
const dashboard = read('app/dashboard/social-ad/page.js')
const dashboardProxy = read('app/api/admin/marketing/[...path]/route.js')
const openapi = read('docs/app-api-openapi.yaml')
const sdk = read('packages/sdk/src/index.ts')
const prismaSchema = read('prisma/schema.prisma')
const campaignMetadataMigration = read('prisma/migrations/20260722_expand_campaign_metadata/migration.sql')

describe('product-breakout platform closure', () => {
  it('recognises only fixture-backed durable workflows in canonical truth', () => {
    const capabilities = DURABLE_WORKFLOW_REGISTRATIONS.map((item) => item.capability)
    expect(capabilities).toEqual(expect.arrayContaining(['long_form_video', 'rag_ingest', 'rag_search', 'research', 'social_content_generation']))
    expect(capabilities).toEqual(expect.arrayContaining(['brand_scrape', 'document_ingest', 'campaign_generation']))
    for (const workflow of DURABLE_WORKFLOW_REGISTRATIONS) {
      expect(workflow.fixtureProof).toBeTruthy()
      expect(workflow.infrastructure).toContain('mariadb')
      expect(workflow.recovery).toBeTruthy()
      expect(workflow.artifactPersistence).toBeTruthy()
    }
  })

  it('requires persisted campaign scope and real same-app product artifacts', () => {
    expect(campaignRoute).toContain("app.post('/api/v1/marketing-campaigns'")
    expect(route).toContain("code: 'SOCIAL_AD_CAMPAIGN_NOT_FOUND'")
    expect(route).toContain("throw new Error('SOCIAL_AD_PRODUCT_ASSET_CROSS_APP')")
    expect(route).toContain("throw new Error('SOCIAL_AD_PRODUCT_ASSET_NOT_READY')")
    expect(route).toContain("throw new Error('SOCIAL_AD_PRODUCT_ASSET_TYPE_INVALID')")
    expect(route).toContain('SOCIAL_AD_EXECUTION_AUTHORITY_FORBIDDEN')
    expect(prismaSchema).toMatch(/model Campaign[\s\S]+metadata\s+String\s+@default\("\{\}"\) @db\.LongText/)
    expect(campaignMetadataMigration).toContain('ALTER TABLE `campaigns` MODIFY `metadata` LONGTEXT NOT NULL')
  })

  it('persists measured, model-evaluated and human-review-required evidence', () => {
    expect(quality).toContain('inspectCandidateVideo')
    expect(quality).toContain("subType: 'social_ad_candidate_quality_report'")
    expect(quality).toContain('modelEvaluated')
    expect(quality).toContain('humanReviewRequired')
    expect(quality).toContain('pixel_level_product_source_similarity')
    expect(quality).toContain('frame_boundary_breakout_visibility')
  })

  it('assembles a truthful framed pack and preserves the segmentation limitation', () => {
    expect(assembly).toContain('drawbox=')
    expect(assembly).toContain("'-movflags', '+faststart'")
    expect(assembly).toContain('sourceAudioPreservedWhenPresent')
    expect(assembly).toContain("subtype: 'social_ad_final_quality_report'")
    expect(assembly).toContain("subtype: 'social_ad_execution_evidence'")
    expect(assembly).toContain('segmentationClaimed: false')
  })

  it('exposes a backend-backed dashboard without provider or model controls', () => {
    expect(dashboard).toContain("fetch('/api/admin/marketing/context'")
    expect(dashboard).toContain('Plan without execution')
    expect(dashboard).toContain('Approve winner')
    expect(dashboard).toContain('Final approve delivery pack')
    expect(dashboard).toContain('Download ${artifact.label}')
    expect(dashboard).not.toMatch(/label="Provider"|label="Model"|name="provider"|name="model"/)
    expect(dashboardProxy).toContain('if (body)')
    expect(dashboardProxy).toContain("request.headers.get('content-type') ?? 'application/json'")
  })

  it('publishes idempotent provider-neutral SDK and OpenAPI operations', () => {
    for (const method of ['resumeSocialAdVideo', 'retrySocialAdVideoCandidate', 'cancelSocialAdVideo', 'regenerateSocialAdVideo']) expect(sdk).toContain(method)
    expect(sdk).toContain("decision: 'approved' | 'rejected' | 'revision_requested'")
    expect(openapi).toContain('ProductBreakoutCreativeContract:')
    expect(openapi).toContain('/api/v1/social-ad-video/executions/{id}/resume:')
    expect(openapi).toContain('/api/v1/social-ad-video/executions/{id}/candidates/{jobId}/retry:')
    expect(openapi).toContain('/api/v1/social-ad-video/executions/{id}/cancel:')
    expect(openapi).toContain('/api/v1/social-ad-video/executions/{id}/regenerate:')
  })

  it('runs the authoritative real-service and browser proof', () => {
    expect(runner).toContain("import { proveSocialAdReleaseFixture } from './lib/proof-social-ad-release-fixture.mjs'")
    expect(runner).toContain('await proveSocialAdReleaseFixture')
    for (const assertion of [
      'SOCIAL_AD_PRODUCT_ASSET_DENIALS=PASS', 'SOCIAL_AD_CANDIDATE_QUALITY=PASS',
      'SOCIAL_AD_APPROVAL_ASSEMBLY=PASS', 'SOCIAL_AD_ARTIFACT_PACK=PASS',
      'SOCIAL_AD_IDEMPOTENCY_CANCELLATION=PASS', 'SOCIAL_AD_WORKFLOW_TRUTH=PASS',
    ]) expect(fixture).toContain(assertion)
  })
})
