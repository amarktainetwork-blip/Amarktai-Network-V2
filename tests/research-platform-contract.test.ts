import { describe, expect, it } from 'vitest'
import {
  ResearchRequestSchema,
  evaluateRobotsAccess,
  isForbiddenResearchHostname,
  normalizeResearchUrl,
  parseRobotsTxt,
  researchCitationId,
  researchContentHash,
  researchDomainAllowed,
  researchSourceId,
  validateResearchCitationSet,
  type ResearchCitation,
  type ResearchSource,
} from '@amarktai/core/research-platform'

function source(overrides: Partial<ResearchSource> = {}): ResearchSource {
  return {
    sourceId: 'src_one',
    citationId: 'src_one_c1',
    url: 'https://example.com/report',
    canonicalUrl: 'https://example.com/report',
    domain: 'example.com',
    title: 'Report',
    description: '',
    extractedText: 'Evidence-backed report text.',
    contentHash: 'a'.repeat(64),
    retrievedAt: '2026-07-21T12:00:00.000Z',
    publishedAt: null,
    statusCode: 200,
    mimeType: 'text/html',
    byteLength: 100,
    depth: 0,
    robots: {
      robotsUrl: 'https://example.com/robots.txt',
      fetchedAt: '2026-07-21T11:59:00.000Z',
      statusCode: 200,
      allowed: true,
      matchedRule: null,
      contentHash: 'b'.repeat(64),
      policy: 'rfc9309-compatible',
    },
    snapshotArtifactId: null,
    metadata: {},
    ...overrides,
  }
}

function citation(overrides: Partial<ResearchCitation> = {}): ResearchCitation {
  return {
    citationId: 'src_one_c1',
    sourceId: 'src_one',
    url: 'https://example.com/report',
    title: 'Report',
    claim: 'The report supports the claim.',
    excerpt: 'Evidence-backed report text.',
    ...overrides,
  }
}

describe('governed research platform contract', () => {
  it('accepts provider-neutral deep research requests and applies safe defaults', () => {
    const parsed = ResearchRequestSchema.parse({ query: 'Compare current market evidence.' })
    expect(parsed).toMatchObject({
      mode: 'deep',
      maxSearchResults: 10,
      maxPages: 8,
      maxDepth: 1,
      safeSearch: 'strict',
      answer: true,
      includeSnapshots: true,
    })
  })

  it('rejects provider, model, route and credential authority', () => {
    for (const field of ['provider', 'model', 'route', 'executorId', 'endpoint', 'apiKey', 'appSlug']) {
      expect(ResearchRequestSchema.safeParse({ query: 'Research this topic.', [field]: 'blocked' }).success).toBe(false)
    }
  })

  it('requires seed URLs for browse-only execution', () => {
    expect(ResearchRequestSchema.safeParse({ query: 'Browse the supplied source.', mode: 'browse' }).success).toBe(false)
    expect(ResearchRequestSchema.safeParse({ query: 'Browse the supplied source.', mode: 'browse', seedUrls: ['https://example.com'] }).success).toBe(true)
  })

  it('normalizes canonical HTTPS URLs deterministically', () => {
    expect(normalizeResearchUrl('https://EXAMPLE.com/a//b/?z=2&a=1#fragment')).toBe('https://example.com/a/b?a=1&z=2')
    expect(() => normalizeResearchUrl('http://example.com')).toThrow(/HTTPS/)
    expect(() => normalizeResearchUrl('https://user:pass@example.com')).toThrow(/credentials/)
    expect(() => normalizeResearchUrl('https://example.com:8443')).toThrow(/non-standard ports/)
  })

  it('blocks local, link-local, private, documentation and multicast targets', () => {
    for (const hostname of [
      'localhost', 'service.local', 'api.internal', '127.0.0.1', '10.1.2.3', '100.64.0.1',
      '169.254.169.254', '172.16.0.1', '192.168.1.1', '198.18.0.1', '224.0.0.1', '::1', 'fd00::1', 'fe80::1',
    ]) {
      expect(isForbiddenResearchHostname(hostname), hostname).toBe(true)
    }
    expect(isForbiddenResearchHostname('93.184.216.34')).toBe(false)
    expect(isForbiddenResearchHostname('example.com')).toBe(false)
  })

  it('enforces exact or subdomain allowlists and dominant blocklists', () => {
    expect(researchDomainAllowed({ hostname: 'docs.example.com', allowedDomains: ['example.com'] })).toBe(true)
    expect(researchDomainAllowed({ hostname: 'example.org', allowedDomains: ['example.com'] })).toBe(false)
    expect(researchDomainAllowed({ hostname: 'blocked.example.com', allowedDomains: ['example.com'], blockedDomains: ['blocked.example.com'] })).toBe(false)
    expect(researchDomainAllowed({ hostname: 'notexample.com', allowedDomains: ['example.com'] })).toBe(false)
  })

  it('parses robots groups and applies the most specific matching user-agent group', () => {
    const content = `
User-agent: *
Disallow: /private
Allow: /private/public

User-agent: AmarktAIResearchBot
Disallow: /bot-only
Allow: /bot-only/allowed
`
    expect(parseRobotsTxt(content)).toHaveLength(2)
    expect(evaluateRobotsAccess({ content, url: 'https://example.com/private/public/article' })).toEqual({ allowed: true, matchedRule: null })
    expect(evaluateRobotsAccess({ content, url: 'https://example.com/private/secret' })).toEqual({ allowed: true, matchedRule: null })
    expect(evaluateRobotsAccess({ content, url: 'https://example.com/bot-only/allowed' })).toEqual({ allowed: true, matchedRule: 'allow:/bot-only/allowed' })
    expect(evaluateRobotsAccess({ content, url: 'https://example.com/bot-only/secret' })).toEqual({ allowed: false, matchedRule: 'disallow:/bot-only' })
    expect(evaluateRobotsAccess({ content, url: 'https://example.com/private/public/article', userAgent: 'OtherCrawler' })).toEqual({ allowed: true, matchedRule: 'allow:/private/public' })
    expect(evaluateRobotsAccess({ content, url: 'https://example.com/private/secret', userAgent: 'OtherCrawler' })).toEqual({ allowed: false, matchedRule: 'disallow:/private' })
  })

  it('creates deterministic content, source and citation identities', () => {
    const hash = researchContentHash('same content')
    expect(hash).toMatch(/^[a-f0-9]{64}$/)
    expect(researchContentHash('same content')).toBe(hash)
    expect(researchSourceId('https://example.com/report', hash)).toBe(researchSourceId('https://example.com/report', hash))
    expect(researchCitationId('src_abc', 2)).toBe('src_abc_c3')
  })

  it('accepts citations only when they belong to canonical sources', () => {
    expect(() => validateResearchCitationSet({ sources: [source()], citations: [citation()] })).not.toThrow()
    expect(() => validateResearchCitationSet({ sources: [source()], citations: [citation({ sourceId: 'unknown' })] })).toThrow(/unknown source/)
    expect(() => validateResearchCitationSet({ sources: [source()], citations: [citation({ url: 'https://other.example/report' })] })).toThrow(/does not match source/)
    expect(() => validateResearchCitationSet({ sources: [source()], citations: [citation(), citation()] })).toThrow(/Duplicate/)
  })
})
