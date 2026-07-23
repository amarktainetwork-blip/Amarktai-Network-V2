import { createHash } from 'node:crypto'
import { isIP } from 'node:net'
import { z } from 'zod'

export const RESEARCH_MODES = ['search', 'browse', 'deep'] as const
export const RESEARCH_SAFE_SEARCH_LEVELS = ['strict', 'moderate', 'off'] as const
export const RESEARCH_SOURCE_STATUSES = ['discovered', 'allowed', 'blocked', 'fetched', 'failed'] as const
export const RESEARCH_USER_AGENT = 'AmarktAIResearchBot/1.0' as const

export const ResearchRequestSchema = z.object({
  query: z.string().trim().min(3).max(4_000),
  mode: z.enum(RESEARCH_MODES).default('deep'),
  seedUrls: z.array(z.string().url().max(4_096)).max(20).default([]),
  allowedDomains: z.array(z.string().trim().min(1).max(253)).max(50).default([]),
  blockedDomains: z.array(z.string().trim().min(1).max(253)).max(100).default([]),
  maxSearchResults: z.number().int().min(1).max(25).default(10),
  maxPages: z.number().int().min(1).max(20).default(8),
  maxDepth: z.number().int().min(0).max(3).default(1),
  maxBytesPerPage: z.number().int().min(10_000).max(5_000_000).default(1_500_000),
  freshnessDays: z.number().int().min(1).max(3_650).optional(),
  language: z.string().trim().min(2).max(20).default('en'),
  safeSearch: z.enum(RESEARCH_SAFE_SEARCH_LEVELS).default('strict'),
  answer: z.boolean().default(true),
  includeSnapshots: z.boolean().default(true),
  ragNamespace: z.string().trim().min(1).max(100).regex(/^[a-zA-Z0-9][a-zA-Z0-9._:-]*$/).optional(),
  metadata: z.record(z.string(), z.unknown()).default({}),
}).strict().superRefine((value, context) => {
  if (value.mode === 'browse' && value.seedUrls.length === 0) {
    context.addIssue({ code: 'custom', path: ['seedUrls'], message: 'Browse mode requires at least one seed URL.' })
  }
})

export type ResearchRequest = z.infer<typeof ResearchRequestSchema>

export const RobotsEvidenceSchema = z.object({
  robotsUrl: z.string().url(),
  fetchedAt: z.string().datetime(),
  statusCode: z.number().int().min(0).max(599),
  allowed: z.boolean(),
  matchedRule: z.string().nullable(),
  contentHash: z.string().regex(/^[a-f0-9]{64}$/).nullable(),
  policy: z.literal('rfc9309-compatible'),
})

export type RobotsEvidence = z.infer<typeof RobotsEvidenceSchema>

export const ResearchSearchResultSchema = z.object({
  rank: z.number().int().positive(),
  title: z.string().trim().min(1).max(1_000),
  url: z.string().url(),
  canonicalUrl: z.string().url(),
  snippet: z.string().max(10_000).default(''),
  engine: z.string().max(100).nullable().default(null),
  publishedAt: z.string().datetime().nullable().default(null),
  score: z.number().finite().nullable().default(null),
})

export type ResearchSearchResult = z.infer<typeof ResearchSearchResultSchema>

export const ResearchSourceSchema = z.object({
  sourceId: z.string().min(1).max(128),
  citationId: z.string().min(1).max(128),
  url: z.string().url(),
  canonicalUrl: z.string().url(),
  domain: z.string().min(1).max(253),
  title: z.string().max(1_000),
  description: z.string().max(10_000).default(''),
  extractedText: z.string().max(2_000_000),
  contentHash: z.string().regex(/^[a-f0-9]{64}$/),
  retrievedAt: z.string().datetime(),
  publishedAt: z.string().datetime().nullable().default(null),
  statusCode: z.number().int().min(100).max(599),
  mimeType: z.string().max(255),
  byteLength: z.number().int().nonnegative(),
  depth: z.number().int().min(0).max(3),
  robots: RobotsEvidenceSchema,
  snapshotArtifactId: z.string().nullable().default(null),
  metadata: z.record(z.string(), z.unknown()).default({}),
})

export type ResearchSource = z.infer<typeof ResearchSourceSchema>

export const ResearchCitationSchema = z.object({
  citationId: z.string().min(1).max(128),
  sourceId: z.string().min(1).max(128),
  url: z.string().url(),
  title: z.string().max(1_000),
  claim: z.string().max(5_000),
  excerpt: z.string().max(2_000),
})

export type ResearchCitation = z.infer<typeof ResearchCitationSchema>

export const ResearchReportSchema = z.object({
  version: z.literal(1),
  query: z.string().min(3).max(4_000),
  answer: z.string().max(200_000),
  supportedBySources: z.boolean(),
  citations: z.array(ResearchCitationSchema).max(100),
  sources: z.array(ResearchSourceSchema).max(25),
  searchedAt: z.string().datetime(),
  completedAt: z.string().datetime(),
  searchEvidence: z.object({
    provider: z.literal('searxng'),
    queryHash: z.string().regex(/^[a-f0-9]{64}$/),
    resultCount: z.number().int().nonnegative(),
    selectedCount: z.number().int().nonnegative(),
  }).nullable(),
  warnings: z.array(z.string().max(2_000)).max(100).default([]),
  executionEvidence: z.object({
    appSlug: z.string().min(1),
    executionId: z.string().min(1),
    sourceCount: z.number().int().nonnegative(),
    fetchedCount: z.number().int().nonnegative(),
    failedCount: z.number().int().nonnegative(),
    blockedCount: z.number().int().nonnegative(),
  }),
})

export type ResearchReport = z.infer<typeof ResearchReportSchema>

export interface RobotsRule {
  directive: 'allow' | 'disallow'
  path: string
}

export interface RobotsGroup {
  userAgents: string[]
  rules: RobotsRule[]
}

function normalizeDomainInput(domain: string): string {
  return domain.trim().toLowerCase().replace(/^\.+|\.+$/g, '')
}

function ipv4Parts(hostname: string): [number, number, number, number] | null {
  if (isIP(hostname) !== 4) return null
  const parts = hostname.split('.').map(Number)
  if (parts.length !== 4 || !parts.every((part) => Number.isInteger(part) && part >= 0 && part <= 255)) return null
  return [parts[0]!, parts[1]!, parts[2]!, parts[3]!]
}

export function isForbiddenResearchHostname(hostname: string): boolean {
  const host = hostname.trim().toLowerCase().replace(/^\[|\]$/g, '')
  if (!host) return true
  if (host === 'localhost' || host.endsWith('.localhost') || host.endsWith('.local') || host.endsWith('.internal')) return true
  if (host === '0.0.0.0' || host === '::' || host === '::1') return true
  const v4 = ipv4Parts(host)
  if (v4) {
    const [a, b] = v4
    return a === 0
      || a === 10
      || a === 127
      || (a === 100 && b >= 64 && b <= 127)
      || (a === 169 && b === 254)
      || (a === 172 && b >= 16 && b <= 31)
      || (a === 192 && b === 0)
      || (a === 192 && b === 168)
      || (a === 198 && (b === 18 || b === 19))
      || a >= 224
  }
  if (isIP(host) === 6) {
    const compact = host.replace(/:/g, '').toLowerCase()
    return host.startsWith('fc')
      || host.startsWith('fd')
      || host.startsWith('fe8')
      || host.startsWith('fe9')
      || host.startsWith('fea')
      || host.startsWith('feb')
      || compact === '1'
  }
  return false
}

export function normalizeResearchUrl(input: string): string {
  const url = new URL(input)
  if (url.protocol !== 'https:') throw new Error('Research URLs must use HTTPS.')
  if (url.username || url.password) throw new Error('Research URLs cannot contain credentials.')
  if (url.port && url.port !== '443') throw new Error('Research URLs cannot use non-standard ports.')
  if (isForbiddenResearchHostname(url.hostname)) throw new Error('Research URL hostname is not publicly routable.')
  url.hash = ''
  url.hostname = url.hostname.toLowerCase()
  if (url.pathname !== '/') url.pathname = url.pathname.replace(/\/{2,}/g, '/').replace(/\/$/, '') || '/'
  const sorted = [...url.searchParams.entries()].sort(([aKey, aValue], [bKey, bValue]) => aKey.localeCompare(bKey) || aValue.localeCompare(bValue))
  url.search = ''
  for (const [key, value] of sorted) url.searchParams.append(key, value)
  return url.toString()
}

export function researchDomainAllowed(input: {
  hostname: string
  allowedDomains?: readonly string[]
  blockedDomains?: readonly string[]
}): boolean {
  const hostname = normalizeDomainInput(input.hostname)
  if (!hostname || isForbiddenResearchHostname(hostname)) return false
  const matches = (candidate: string) => hostname === candidate || hostname.endsWith(`.${candidate}`)
  const blocked = (input.blockedDomains ?? []).map(normalizeDomainInput).filter(Boolean)
  if (blocked.some(matches)) return false
  const allowed = (input.allowedDomains ?? []).map(normalizeDomainInput).filter(Boolean)
  return allowed.length === 0 || allowed.some(matches)
}

export function researchContentHash(content: string | Uint8Array): string {
  return createHash('sha256').update(content).digest('hex')
}

export function researchSourceId(canonicalUrl: string, contentHash: string): string {
  return `src_${researchContentHash(`${canonicalUrl}\0${contentHash}`).slice(0, 32)}`
}

export function researchCitationId(sourceId: string, index = 0): string {
  return `${sourceId}_c${index + 1}`
}

export function parseRobotsTxt(content: string): RobotsGroup[] {
  const groups: RobotsGroup[] = []
  let current: RobotsGroup | null = null
  let seenRule = false
  for (const raw of content.replace(/^\uFEFF/, '').split(/\r?\n/)) {
    const line = raw.replace(/\s*#.*$/, '').trim()
    if (!line) continue
    const separator = line.indexOf(':')
    if (separator < 0) continue
    const key = line.slice(0, separator).trim().toLowerCase()
    const value = line.slice(separator + 1).trim()
    if (key === 'user-agent') {
      if (!current || seenRule) {
        current = { userAgents: [], rules: [] }
        groups.push(current)
        seenRule = false
      }
      if (value) current.userAgents.push(value.toLowerCase())
      continue
    }
    if (!current || (key !== 'allow' && key !== 'disallow')) continue
    if (!value && key === 'disallow') continue
    current.rules.push({ directive: key, path: value || '/' })
    seenRule = true
  }
  return groups.filter((group) => group.userAgents.length > 0)
}

function robotsPatternMatches(pathname: string, pattern: string): boolean {
  if (!pattern) return false
  const endAnchored = pattern.endsWith('$')
  const source = pattern.replace(/\$$/, '').split('*').map((part) => part.replace(/[.*+?^${}()|[\]\\]/g, '\\$&')).join('.*')
  return new RegExp(`^${source}${endAnchored ? '$' : ''}`).test(pathname)
}

export function evaluateRobotsAccess(input: {
  content: string
  url: string
  userAgent?: string
}): { allowed: boolean; matchedRule: string | null } {
  const pathname = new URL(input.url).pathname || '/'
  const agent = (input.userAgent ?? RESEARCH_USER_AGENT).toLowerCase()
  const groups = parseRobotsTxt(input.content)
  const specific = groups.filter((group) => group.userAgents.some((candidate) => candidate !== '*' && agent.includes(candidate)))
  const applicable = specific.length > 0 ? specific : groups.filter((group) => group.userAgents.includes('*'))
  const matches = applicable.flatMap((group) => group.rules).filter((rule) => robotsPatternMatches(pathname, rule.path))
  matches.sort((a, b) => b.path.replace(/[*$]/g, '').length - a.path.replace(/[*$]/g, '').length || (a.directive === 'allow' ? -1 : 1))
  const matched = matches[0]
  return {
    allowed: !matched || matched.directive === 'allow',
    matchedRule: matched ? `${matched.directive}:${matched.path}` : null,
  }
}

export function validateResearchCitationSet(input: {
  citations: readonly ResearchCitation[]
  sources: readonly ResearchSource[]
}): void {
  const sourceById = new Map(input.sources.map((source) => [source.sourceId, source]))
  const citationIds = new Set<string>()
  for (const citation of input.citations) {
    if (citationIds.has(citation.citationId)) throw new Error(`Duplicate research citation ID: ${citation.citationId}`)
    citationIds.add(citation.citationId)
    const source = sourceById.get(citation.sourceId)
    if (!source) throw new Error(`Research citation references an unknown source: ${citation.sourceId}`)
    if (citation.url !== source.canonicalUrl) throw new Error(`Research citation URL does not match source: ${citation.citationId}`)
  }
}
