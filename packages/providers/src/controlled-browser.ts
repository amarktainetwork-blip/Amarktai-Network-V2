import { lookup } from 'node:dns/promises'
import { Buffer } from 'node:buffer'
import { chromium, type BrowserContext, type Route } from 'playwright'
import {
  RESEARCH_BROWSER_TIMEOUT_MS,
  RESEARCH_MAX_REDIRECTS,
  RESEARCH_ROBOTS_TIMEOUT_MS,
} from '@amarktai/core/config'
import {
  RESEARCH_USER_AGENT,
  evaluateRobotsAccess,
  isForbiddenResearchHostname,
  normalizeResearchUrl,
  researchContentHash,
  researchDomainAllowed,
  type ResearchRequest,
  type RobotsEvidence,
} from '@amarktai/core/research-platform'

export interface ControlledBrowserPolicy {
  allowedDomains: readonly string[]
  blockedDomains: readonly string[]
  maxBytes: number
  maxRedirects?: number
  timeoutMs?: number
}

export interface ControlledPageResult {
  requestedUrl: string
  finalUrl: string
  canonicalUrl: string
  title: string
  description: string
  extractedText: string
  publishedAt: string | null
  statusCode: number
  mimeType: string
  byteLength: number
  contentHash: string
  links: string[]
  robots: RobotsEvidence
  snapshotHtml: string
}

interface RobotsCacheEntry {
  evidence: RobotsEvidence
  expiresAt: number
}

const ROBOTS_MAX_BYTES = 512_000
const robotsCache = new Map<string, RobotsCacheEntry>()
const dnsCache = new Map<string, { expiresAt: number; addresses: string[] }>()

function policyForRequest(request: ResearchRequest): ControlledBrowserPolicy {
  return {
    allowedDomains: request.allowedDomains,
    blockedDomains: request.blockedDomains,
    maxBytes: request.maxBytesPerPage,
    maxRedirects: RESEARCH_MAX_REDIRECTS,
    timeoutMs: RESEARCH_BROWSER_TIMEOUT_MS,
  }
}

async function publicAddresses(hostname: string): Promise<string[]> {
  const cached = dnsCache.get(hostname)
  if (cached && cached.expiresAt > Date.now()) return cached.addresses
  const records = await lookup(hostname, { all: true, verbatim: true })
  const addresses = [...new Set(records.map((record) => record.address))]
  if (addresses.length === 0) throw new Error(`Research hostname did not resolve: ${hostname}`)
  if (addresses.some((address) => isForbiddenResearchHostname(address))) {
    throw new Error(`Research hostname resolves to a forbidden network: ${hostname}`)
  }
  dnsCache.set(hostname, { addresses, expiresAt: Date.now() + 60_000 })
  return addresses
}

export async function assertPublicResearchUrl(input: string, policy: ControlledBrowserPolicy): Promise<string> {
  const canonical = normalizeResearchUrl(input)
  const url = new URL(canonical)
  if (!researchDomainAllowed({
    hostname: url.hostname,
    allowedDomains: policy.allowedDomains,
    blockedDomains: policy.blockedDomains,
  })) {
    throw new Error(`Research domain is not allowed: ${url.hostname}`)
  }
  await publicAddresses(url.hostname)
  return canonical
}

async function boundedText(response: Response, maxBytes: number): Promise<{ text: string; byteLength: number }> {
  const declared = Number(response.headers.get('content-length') ?? 0)
  if (Number.isFinite(declared) && declared > maxBytes) throw new Error(`Research response exceeds ${maxBytes} bytes.`)
  if (!response.body) return { text: '', byteLength: 0 }
  const reader = response.body.getReader()
  const chunks: Uint8Array[] = []
  let byteLength = 0
  while (true) {
    const { done, value } = await reader.read()
    if (done) break
    byteLength += value.byteLength
    if (byteLength > maxBytes) {
      await reader.cancel('Research response exceeded byte limit.')
      throw new Error(`Research response exceeds ${maxBytes} bytes.`)
    }
    chunks.push(value)
  }
  return { text: Buffer.concat(chunks).toString('utf8'), byteLength }
}

async function fetchRobots(origin: string, policy: ControlledBrowserPolicy): Promise<RobotsEvidence> {
  const cached = robotsCache.get(origin)
  if (cached && cached.expiresAt > Date.now()) return cached.evidence
  const robotsUrl = new URL('/robots.txt', origin).toString()
  let current = robotsUrl
  let redirects = 0
  let response: Response
  try {
    while (true) {
      current = await assertPublicResearchUrl(current, { ...policy, allowedDomains: [] })
      response = await fetch(current, {
        redirect: 'manual',
        headers: { Accept: 'text/plain', 'User-Agent': RESEARCH_USER_AGENT },
        signal: AbortSignal.timeout(RESEARCH_ROBOTS_TIMEOUT_MS),
      })
      if (![301, 302, 303, 307, 308].includes(response.status)) break
      const location = response.headers.get('location')
      if (!location) throw new Error('Robots redirect is missing a Location header.')
      redirects += 1
      if (redirects > (policy.maxRedirects ?? RESEARCH_MAX_REDIRECTS)) throw new Error('Robots redirect limit exceeded.')
      current = new URL(location, current).toString()
    }
  } catch {
    const evidence: RobotsEvidence = {
      robotsUrl,
      fetchedAt: new Date().toISOString(),
      statusCode: 0,
      allowed: false,
      matchedRule: 'unreachable:fail-closed',
      contentHash: null,
      policy: 'rfc9309-compatible',
    }
    robotsCache.set(origin, { evidence, expiresAt: Date.now() + 60_000 })
    return evidence
  }

  if (response.status >= 500 || response.status === 429) {
    const evidence: RobotsEvidence = {
      robotsUrl,
      fetchedAt: new Date().toISOString(),
      statusCode: response.status,
      allowed: false,
      matchedRule: 'unavailable:fail-closed',
      contentHash: null,
      policy: 'rfc9309-compatible',
    }
    robotsCache.set(origin, { evidence, expiresAt: Date.now() + 60_000 })
    return evidence
  }
  if (response.status >= 400) {
    const evidence: RobotsEvidence = {
      robotsUrl,
      fetchedAt: new Date().toISOString(),
      statusCode: response.status,
      allowed: true,
      matchedRule: null,
      contentHash: null,
      policy: 'rfc9309-compatible',
    }
    robotsCache.set(origin, { evidence, expiresAt: Date.now() + 15 * 60_000 })
    return evidence
  }

  const body = await boundedText(response, ROBOTS_MAX_BYTES)
  const evidence: RobotsEvidence = {
    robotsUrl,
    fetchedAt: new Date().toISOString(),
    statusCode: response.status,
    allowed: true,
    matchedRule: null,
    contentHash: researchContentHash(body.text),
    policy: 'rfc9309-compatible',
  }
  robotsCache.set(origin, { evidence, expiresAt: Date.now() + 60 * 60_000 })
  return evidence
}

export async function getRobotsEvidence(input: string, policy: ControlledBrowserPolicy): Promise<RobotsEvidence> {
  const canonical = await assertPublicResearchUrl(input, policy)
  const url = new URL(canonical)
  const base = await fetchRobots(url.origin, policy)
  if (!base.allowed || base.statusCode === 0 || base.statusCode >= 400 || !base.contentHash) return base

  let response: Response
  try {
    response = await fetch(base.robotsUrl, {
      redirect: 'error',
      headers: { Accept: 'text/plain', 'User-Agent': RESEARCH_USER_AGENT },
      signal: AbortSignal.timeout(RESEARCH_ROBOTS_TIMEOUT_MS),
    })
  } catch {
    return { ...base, allowed: false, matchedRule: 'unreachable:fail-closed' }
  }
  const body = await boundedText(response, ROBOTS_MAX_BYTES)
  const evaluated = evaluateRobotsAccess({ content: body.text, url: canonical })
  return { ...base, ...evaluated }
}

async function configureRequestGuard(
  context: BrowserContext,
  target: string,
  policy: ControlledBrowserPolicy,
): Promise<() => RobotsEvidence | null> {
  let navigationCount = 0
  let latestRobots: RobotsEvidence | null = null
  const originTarget = new URL(target)

  await context.route('**/*', async (route: Route) => {
    const request = route.request()
    const rawUrl = request.url()
    if (rawUrl.startsWith('data:') || rawUrl.startsWith('blob:')) {
      await route.continue()
      return
    }
    if (!['GET', 'HEAD'].includes(request.method())) {
      await route.abort('blockedbyclient')
      return
    }
    let url: URL
    try {
      url = new URL(rawUrl)
      if (url.protocol !== 'https:') throw new Error('scheme')
      const navigation = request.isNavigationRequest()
      if (navigation) {
        navigationCount += 1
        if (navigationCount > (policy.maxRedirects ?? RESEARCH_MAX_REDIRECTS) + 1) throw new Error('redirects')
      }
      const effectivePolicy = navigation
        ? policy
        : { ...policy, allowedDomains: policy.allowedDomains.length > 0 ? policy.allowedDomains : [originTarget.hostname] }
      await assertPublicResearchUrl(rawUrl, effectivePolicy)
      if (navigation) {
        latestRobots = await getRobotsEvidence(rawUrl, policy)
        if (!latestRobots.allowed) throw new Error('robots')
      }
      if (['media', 'font'].includes(request.resourceType())) {
        await route.abort('blockedbyclient')
        return
      }
      await route.continue()
    } catch {
      await route.abort('blockedbyclient')
    }
  })
  return () => latestRobots
}

function normalizePublishedAt(value: string | null): string | null {
  if (!value) return null
  const date = new Date(value)
  return Number.isNaN(date.getTime()) ? null : date.toISOString()
}

export async function controlledBrowsePage(input: {
  url: string
  request: ResearchRequest
}): Promise<ControlledPageResult> {
  const policy = policyForRequest(input.request)
  const requestedUrl = await assertPublicResearchUrl(input.url, policy)
  const initialRobots = await getRobotsEvidence(requestedUrl, policy)
  if (!initialRobots.allowed) throw new Error(`Robots policy denies research access: ${requestedUrl}`)

  const browser = await chromium.launch({ headless: true })
  try {
    const context = await browser.newContext({
      acceptDownloads: false,
      bypassCSP: false,
      ignoreHTTPSErrors: false,
      javaScriptEnabled: true,
      serviceWorkers: 'block',
      userAgent: RESEARCH_USER_AGENT,
      viewport: { width: 1280, height: 720 },
      locale: input.request.language,
    })
    context.setDefaultTimeout(policy.timeoutMs ?? RESEARCH_BROWSER_TIMEOUT_MS)
    context.setDefaultNavigationTimeout(policy.timeoutMs ?? RESEARCH_BROWSER_TIMEOUT_MS)
    const latestRobots = await configureRequestGuard(context, requestedUrl, policy)
    const page = await context.newPage()
    page.on('download', (download) => void download.cancel())

    const response = await page.goto(requestedUrl, {
      waitUntil: 'domcontentloaded',
      timeout: policy.timeoutMs ?? RESEARCH_BROWSER_TIMEOUT_MS,
    })
    if (!response) throw new Error('Research navigation returned no main response.')
    const statusCode = response.status()
    if (statusCode < 200 || statusCode >= 400) throw new Error(`Research page returned HTTP ${statusCode}.`)
    const mimeType = (await response.headerValue('content-type') ?? 'text/html').split(';')[0]!.trim().toLowerCase()
    if (!['text/html', 'application/xhtml+xml', 'text/plain'].includes(mimeType)) {
      throw new Error(`Research page MIME type is not supported: ${mimeType}`)
    }

    const snapshotHtml = await page.content()
    const byteLength = Buffer.byteLength(snapshotHtml, 'utf8')
    if (byteLength > policy.maxBytes) throw new Error(`Research page exceeds ${policy.maxBytes} bytes.`)

    const extracted = await page.evaluate(() => {
      const text = (document.body?.innerText ?? '').replace(/\u00a0/g, ' ').replace(/[ \t]+\n/g, '\n').replace(/\n{3,}/g, '\n\n').trim()
      const meta = (selector: string) => document.querySelector<HTMLMetaElement>(selector)?.content?.trim() || null
      const canonical = document.querySelector<HTMLLinkElement>('link[rel="canonical"]')?.href || location.href
      const published = meta('meta[property="article:published_time"]')
        || meta('meta[name="date"]')
        || meta('meta[name="datePublished"]')
      const links = [...document.querySelectorAll<HTMLAnchorElement>('a[href]')]
        .map((anchor) => anchor.href)
        .filter(Boolean)
        .slice(0, 500)
      return {
        title: document.title.trim(),
        description: meta('meta[name="description"]') || meta('meta[property="og:description"]') || '',
        canonical,
        published,
        text,
        links,
      }
    })
    if (!extracted.text) throw new Error('Research page produced no extractable text.')

    const finalUrl = await assertPublicResearchUrl(page.url(), policy)
    let canonicalUrl = finalUrl
    try {
      canonicalUrl = await assertPublicResearchUrl(extracted.canonical, policy)
    } catch {
      canonicalUrl = finalUrl
    }
    const robots = latestRobots() ?? initialRobots
    if (!robots.allowed) throw new Error(`Robots policy denies final research URL: ${finalUrl}`)

    const links: string[] = []
    const seen = new Set<string>()
    for (const raw of extracted.links) {
      if (links.length >= 100) break
      try {
        const normalized = normalizeResearchUrl(raw)
        const url = new URL(normalized)
        if (!researchDomainAllowed({ hostname: url.hostname, allowedDomains: policy.allowedDomains, blockedDomains: policy.blockedDomains })) continue
        if (seen.has(normalized)) continue
        seen.add(normalized)
        links.push(normalized)
      } catch {
        // Non-HTTPS, local, malformed and credentialed links are excluded.
      }
    }

    await context.close()
    return {
      requestedUrl,
      finalUrl,
      canonicalUrl,
      title: extracted.title || new URL(finalUrl).hostname,
      description: extracted.description,
      extractedText: extracted.text.slice(0, 2_000_000),
      publishedAt: normalizePublishedAt(extracted.published),
      statusCode,
      mimeType,
      byteLength,
      contentHash: researchContentHash(extracted.text),
      links,
      robots,
      snapshotHtml,
    }
  } finally {
    await browser.close()
  }
}
