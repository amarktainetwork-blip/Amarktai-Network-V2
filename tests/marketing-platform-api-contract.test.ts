import { readFileSync } from 'node:fs'
import { describe, expect, it } from 'vitest'

const server = readFileSync(new URL('../apps/api/src/server.ts', import.meta.url), 'utf8')
const brandRoutes = readFileSync(new URL('../apps/api/src/routes/app-brand-profiles.ts', import.meta.url), 'utf8')
const socialAdRoutes = readFileSync(new URL('../apps/api/src/routes/app-social-ad-video.ts', import.meta.url), 'utf8')
const qualityWorkflow = readFileSync(new URL('../apps/worker/src/social-ad-quality-workflow.ts', import.meta.url), 'utf8')
const sdk = readFileSync(new URL('../packages/sdk/src/index.ts', import.meta.url), 'utf8')

describe('marketing platform API contract', () => {
  it('registers dedicated thin-app Brand Profile and social-ad routes', () => {
    expect(server).toContain("import { appBrandProfileRoutes } from './routes/app-brand-profiles.js'")
    expect(server).toContain("import { appSocialAdVideoRoutes } from './routes/app-social-ad-video.js'")
    expect(server).toContain('await app.register(appBrandProfileRoutes)')
    expect(server).toContain('await app.register(appSocialAdVideoRoutes)')
  })

  it('scopes Brand Profile storage to the authenticated app and capability grants', () => {
    expect(brandRoutes).toContain("parsed.data.appSlug !== auth.app!.slug")
    expect(brandRoutes).toContain('BRAND_PROFILE_CAPABILITY_REQUIRED')
    expect(brandRoutes).toContain("app.delete('/api/v1/brand-profiles/:id'")
    expect(brandRoutes).toContain('archiveBrandProfile')
  })

  it('loads the Brand Profile by authenticated app scope before planning social ads', () => {
    expect(socialAdRoutes).toContain('getBrandProfile(appSlug, requestResult.data.brandProfileId)')
    expect(socialAdRoutes).toContain("allowedCapabilities.includes('social_content_generation')")
    expect(socialAdRoutes).toContain('buildSocialAdVideoPlan')
  })

  it('creates durable parent and candidate child jobs with generation and quality grants', () => {
    expect(socialAdRoutes).toContain("app.post('/api/v1/social-ad-video/executions'")
    expect(socialAdRoutes).toContain("'video_understanding'")
    expect(socialAdRoutes).toContain('qualityGrantSnapshot: qualityGrant.grant')
    expect(socialAdRoutes).toContain("capability: 'social_content_generation'")
    expect(socialAdRoutes).toContain('parentJobId: parent.id')
    expect(socialAdRoutes).toContain('resolveAppCapabilityGrantSnapshot')
    expect(socialAdRoutes).toContain('appGrantSnapshot: childGrant.grant')
    expect(socialAdRoutes).toContain("await getQueue().add('process', payload")
    expect(socialAdRoutes).toContain('validateDirectProviderRequest')
  })

  it('queues one evidence-based quality analysis per completed candidate', () => {
    expect(qualityWorkflow).toContain("capability: 'video_understanding'")
    expect(qualityWorkflow).toContain('videoArtifactId: candidate.artifactId')
    expect(qualityWorkflow).toContain('sampleCount: 6')
    expect(qualityWorkflow).toContain('rankQualityCandidates')
    expect(qualityWorkflow).toContain("currentPhase: 'human_approval_pending'")
    expect(qualityWorkflow).toContain('selectedCandidateArtifactId')
  })

  it('polls generation and quality evidence without mutating parent state', () => {
    expect(socialAdRoutes).toContain("app.get('/api/v1/social-ad-video/executions/:id'")
    expect(socialAdRoutes).toContain('appSlug: auth.app!.slug')
    expect(socialAdRoutes).toContain('provider: job.provider')
    expect(socialAdRoutes).toContain('model: job.model')
    expect(socialAdRoutes).toContain('qualityRanking')
    expect(socialAdRoutes).not.toContain("if (status.phase !== parent.workflowPhase")
  })

  it('allows the Marketing App to decide only after Network quality selection', () => {
    expect(socialAdRoutes).toContain("app.post('/api/v1/social-ad-video/executions/:id/approval'")
    expect(socialAdRoutes).toContain("parent.workflowPhase !== 'human_approval_pending'")
    expect(socialAdRoutes).toContain('SOCIAL_AD_QUALITY_WINNER_MISSING')
    expect(socialAdRoutes).toContain("? 'assembly_pending'")
  })

  it('does not expose provider, model or route controls through the thin-app SDK', () => {
    const executeRequest = sdk.match(/export interface ExecuteRequest \{([^}]+)\}/s)?.[1] ?? ''
    expect(executeRequest).not.toMatch(/provider|model|route|executorId|endpoint|apiKey/)
    expect(sdk).toContain('planSocialAdVideo')
    expect(sdk).toContain('executeSocialAdVideo')
    expect(sdk).toContain('socialAdVideoExecution')
    expect(sdk).toContain('decideSocialAdVideo')
  })
})
