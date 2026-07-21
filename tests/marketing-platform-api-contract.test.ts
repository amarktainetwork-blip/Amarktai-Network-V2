import { readFileSync } from 'node:fs'
import { describe, expect, it } from 'vitest'

const server = readFileSync(new URL('../apps/api/src/server.ts', import.meta.url), 'utf8')
const brandRoutes = readFileSync(new URL('../apps/api/src/routes/app-brand-profiles.ts', import.meta.url), 'utf8')
const socialAdRoutes = readFileSync(new URL('../apps/api/src/routes/app-social-ad-video.ts', import.meta.url), 'utf8')
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
    expect(socialAdRoutes).toContain("getBrandProfile(auth.app!.slug, requestResult.data.brandProfileId)")
    expect(socialAdRoutes).toContain("auth.allowedCapabilities?.includes('social_content_generation')")
    expect(socialAdRoutes).toContain('buildSocialAdVideoPlan')
  })

  it('does not expose provider, model or route controls through the thin-app SDK', () => {
    const executeRequest = sdk.match(/export interface ExecuteRequest \{([^}]+)\}/s)?.[1] ?? ''
    expect(executeRequest).not.toMatch(/provider|model|route|executorId|endpoint|apiKey/)
    expect(sdk).toContain('planSocialAdVideo')
    expect(sdk).toContain('/api/v1/social-ad-video/plan')
  })
})
