import { readFileSync } from 'node:fs'
import { describe, expect, it } from 'vitest'

const browser = readFileSync(new URL('../packages/providers/src/controlled-browser.ts', import.meta.url), 'utf8')
const search = readFileSync(new URL('../packages/providers/src/searxng-client.ts', import.meta.url), 'utf8')
const providerIndex = readFileSync(new URL('../packages/providers/src/index.ts', import.meta.url), 'utf8')

describe('controlled research transport security contract', () => {
  it('validates canonical URLs, DNS answers and domain policy before browsing', () => {
    expect(browser).toContain('normalizeResearchUrl(input)')
    expect(browser).toContain("lookup(hostname, { all: true, verbatim: true })")
    expect(browser).toContain('addresses.some((address) => isForbiddenResearchHostname(address))')
    expect(browser).toContain('researchDomainAllowed({')
    expect(browser).toContain('throw new Error(`Research domain is not allowed: ${url.hostname}`)')
  })

  it('applies robots policy before every navigation and fails closed when unavailable', () => {
    expect(browser).toContain("matchedRule: 'unreachable:fail-closed'")
    expect(browser).toContain("matchedRule: 'unavailable:fail-closed'")
    expect(browser).toContain('latestRobots = await getRobotsEvidence(rawUrl, policy)')
    expect(browser).toContain("if (!latestRobots.allowed) throw new Error('robots')")
    expect(browser).toContain("policy: 'rfc9309-compatible'")
  })

  it('blocks unsafe methods, schemes, media, fonts, downloads and service workers', () => {
    expect(browser).toContain("if (!['GET', 'HEAD'].includes(request.method()))")
    expect(browser).toContain("if (url.protocol !== 'https:')")
    expect(browser).toContain("if (['media', 'font'].includes(request.resourceType()))")
    expect(browser).toContain("serviceWorkers: 'block'")
    expect(browser).toContain("page.on('download', (download) => void download.cancel())")
    expect(browser).toContain('acceptDownloads: false')
  })

  it('enforces byte, redirect and timeout limits', () => {
    expect(browser).toContain('if (byteLength > maxBytes)')
    expect(browser).toContain('navigationCount > (policy.maxRedirects ?? RESEARCH_MAX_REDIRECTS) + 1')
    expect(browser).toContain('context.setDefaultNavigationTimeout')
    expect(browser).toContain('AbortSignal.timeout(RESEARCH_ROBOTS_TIMEOUT_MS)')
  })

  it('exposes only governed Network transports and keeps search provider-neutral', () => {
    expect(providerIndex).toContain('controlledBrowsePage')
    expect(providerIndex).toContain('searxngSearch')
    expect(search).not.toMatch(/TOGETHER_API_KEY|GENX_API_KEY|DEEPINFRA_API_KEY/)
    expect(search).not.toMatch(/provider\s*:|model\s*:|route\s*:/)
  })
})
