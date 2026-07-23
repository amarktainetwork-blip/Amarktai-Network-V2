import { Buffer } from 'node:buffer'
import {
  ResearchRequestSchema,
  ResearchSourceSchema,
  researchCitationId,
  researchContentHash,
  researchSourceId,
  type ResearchRequest,
  type ResearchSearchResult,
  type ResearchSource,
} from '@amarktai/core/research-platform'
import {
  controlledBrowsePage,
  searxngSearch,
  type ControlledPageResult,
  type SearxngSearchResponse,
} from '@amarktai/providers'
import {
  findCompletedArtifactByTraceId,
  getArtifactFile,
  saveArtifact,
} from '@amarktai/artifacts'
import { isReleaseFixtureAdapterEnabled } from './providers/release-fixture-executor.js'
import type { ProcessorResult, WorkerJobData } from './processors/job-processor.js'

export interface ResearchEvidenceArtifact {
  version: 1
  query: string
  request: ResearchRequest
  searchedAt: string
  completedAt: string
  searchEvidence: {
    provider: 'searxng'
    queryHash: string
    resultCount: number
    selectedCount: number
  } | null
  sources: ResearchSource[]
  warnings: string[]
  failedCount: number
  blockedCount: number
}

function parseJsonObject(buffer: Buffer): Record<string, unknown> {
  const parsed = JSON.parse(buffer.toString('utf8'))
  if (!parsed || typeof parsed !== 'object' || Array.isArray(parsed)) throw new Error('Research evidence artifact is invalid')
  return parsed as Record<string, unknown>
}

export async function readResearchEvidenceArtifact(artifactId: string): Promise<ResearchEvidenceArtifact> {
  const artifact = await getArtifactFile(artifactId)
  if (!artifact || artifact.mimeType !== 'application/json') throw new Error('Research evidence artifact was not found')
  const parsed = parseJsonObject(artifact.buffer)
  const request = ResearchRequestSchema.parse(parsed.request)
  const sources = ResearchSourceSchema.array().parse(parsed.sources)
  return {
    version: 1,
    query: String(parsed.query ?? request.query),
    request,
    searchedAt: String(parsed.searchedAt),
    completedAt: String(parsed.completedAt),
    searchEvidence: parsed.searchEvidence && typeof parsed.searchEvidence === 'object'
      ? parsed.searchEvidence as ResearchEvidenceArtifact['searchEvidence']
      : null,
    sources,
    warnings: Array.isArray(parsed.warnings) ? parsed.warnings.filter((value): value is string => typeof value === 'string') : [],
    failedCount: Number(parsed.failedCount ?? 0),
    blockedCount: Number(parsed.blockedCount ?? 0),
  }
}

async function saveSnapshot(input: {
  payload: WorkerJobData
  sourceId: string
  title: string
  canonicalUrl: string
  html: string
  contentHash: string
}): Promise<string> {
  const traceId = `${input.payload.traceId}_${input.sourceId}`
  const existing = await findCompletedArtifactByTraceId(traceId, 'research_source_snapshot')
  if (existing) return existing.id
  const saved = await saveArtifact({
    input: {
      appSlug: input.payload.appSlug,
      type: 'document',
      subType: 'research_source_snapshot',
      title: input.title,
      description: `Governed research snapshot for ${input.canonicalUrl}`,
      provider: 'amarktai-network',
      model: 'controlled-browser-v1',
      traceId,
      mimeType: 'text/html',
      metadata: {
        researchSnapshot: true,
        parentJobId: input.payload.metadata?.parentJobId ?? null,
        executionId: input.payload.metadata?.executionId ?? null,
        sourceId: input.sourceId,
        canonicalUrl: input.canonicalUrl,
        contentHash: input.contentHash,
      },
    },
    data: Buffer.from(input.html, 'utf8'),
    explicitMimeType: 'text/html',
  })
  return saved.id
}

function fixturePage(): ControlledPageResult {
  const canonicalUrl = 'https://fixture.invalid/amarktai-network-research'
  const extractedText = [
    'AmarktAI Network owns provider routing, model selection, grants, durable jobs, evidence, artifacts, quality gates, budgets, memory, RAG and controlled research.',
    'Thin apps own product-specific user experience and send outcome requests without provider, model, endpoint or credential overrides.',
  ].join(' ')
  const contentHash = researchContentHash(extractedText)
  return {
    requestedUrl: canonicalUrl,
    finalUrl: canonicalUrl,
    canonicalUrl,
    title: 'AmarktAI Network research fixture',
    description: 'Deterministic governed research fixture source.',
    extractedText,
    publishedAt: '2026-07-21T00:00:00.000Z',
    statusCode: 200,
    mimeType: 'text/html',
    byteLength: Buffer.byteLength(extractedText, 'utf8'),
    contentHash,
    links: [],
    robots: {
      robotsUrl: 'https://fixture.invalid/robots.txt',
      fetchedAt: new Date().toISOString(),
      statusCode: 200,
      allowed: true,
      matchedRule: null,
      contentHash: researchContentHash('User-agent: *\nAllow: /\n'),
      policy: 'rfc9309-compatible',
    },
    snapshotHtml: `<html><head><title>AmarktAI Network research fixture</title></head><body>${extractedText}</body></html>`,
  }
}

function classifyFailure(error: unknown): 'blocked' | 'failed' {
  const message = error instanceof Error ? error.message.toLowerCase() : String(error).toLowerCase()
  return /robots|not allowed|forbidden|private|publicly routable|credential|non-standard port|https/.test(message)
    ? 'blocked'
    : 'failed'
}

async function pageToSource(input: {
  payload: WorkerJobData
  request: ResearchRequest
  page: ControlledPageResult
  depth: number
}): Promise<ResearchSource> {
  const sourceId = researchSourceId(input.page.canonicalUrl, input.page.contentHash)
  const snapshotArtifactId = input.request.includeSnapshots
    ? await saveSnapshot({
        payload: input.payload,
        sourceId,
        title: input.page.title,
        canonicalUrl: input.page.canonicalUrl,
        html: input.page.snapshotHtml,
        contentHash: input.page.contentHash,
      })
    : null
  return ResearchSourceSchema.parse({
    sourceId,
    citationId: researchCitationId(sourceId),
    url: input.page.finalUrl,
    canonicalUrl: input.page.canonicalUrl,
    domain: new URL(input.page.canonicalUrl).hostname,
    title: input.page.title,
    description: input.page.description,
    extractedText: input.page.extractedText,
    contentHash: input.page.contentHash,
    retrievedAt: new Date().toISOString(),
    publishedAt: input.page.publishedAt,
    statusCode: input.page.statusCode,
    mimeType: input.page.mimeType,
    byteLength: input.page.byteLength,
    depth: input.depth,
    robots: input.page.robots,
    snapshotArtifactId,
    metadata: {},
  })
}

function uniqueCandidates(input: {
  request: ResearchRequest
  search: SearxngSearchResponse | null
}): Array<{ url: string; depth: number; searchResult: ResearchSearchResult | null }> {
  const seen = new Set<string>()
  const candidates: Array<{ url: string; depth: number; searchResult: ResearchSearchResult | null }> = []
  for (const url of input.request.seedUrls) {
    if (seen.has(url)) continue
    seen.add(url)
    candidates.push({ url, depth: 0, searchResult: null })
  }
  for (const result of input.search?.results ?? []) {
    if (seen.has(result.canonicalUrl)) continue
    seen.add(result.canonicalUrl)
    candidates.push({ url: result.canonicalUrl, depth: 0, searchResult: result })
  }
  return candidates
}

async function collectEvidence(payload: WorkerJobData, request: ResearchRequest): Promise<ResearchEvidenceArtifact> {
  const searchedAt = new Date().toISOString()
  if (isReleaseFixtureAdapterEnabled()) {
    const source = await pageToSource({ payload, request, page: fixturePage(), depth: 0 })
    return {
      version: 1,
      query: request.query,
      request,
      searchedAt,
      completedAt: new Date().toISOString(),
      searchEvidence: request.mode === 'browse' ? null : {
        provider: 'searxng',
        queryHash: researchContentHash(`${request.query}\0fixture`),
        resultCount: 1,
        selectedCount: 1,
      },
      sources: [source],
      warnings: [],
      failedCount: 0,
      blockedCount: 0,
    }
  }

  const search = request.mode === 'browse' ? null : await searxngSearch(request)
  const queue = uniqueCandidates({ request, search })
  const queued = new Set(queue.map((candidate) => candidate.url))
  const sourceKeys = new Set<string>()
  const sources: ResearchSource[] = []
  const warnings: string[] = []
  let failedCount = 0
  let blockedCount = 0

  for (let index = 0; index < queue.length && sources.length < request.maxPages; index += 1) {
    const candidate = queue[index]!
    try {
      const page = await controlledBrowsePage({ url: candidate.url, request })
      const source = await pageToSource({ payload, request, page, depth: candidate.depth })
      const key = `${source.canonicalUrl}\0${source.contentHash}`
      if (!sourceKeys.has(key)) {
        sourceKeys.add(key)
        sources.push(source)
      }
      if (request.mode === 'deep' && candidate.depth < request.maxDepth) {
        for (const link of page.links) {
          if (queue.length >= request.maxPages * 10 || queued.has(link)) continue
          queued.add(link)
          queue.push({ url: link, depth: candidate.depth + 1, searchResult: null })
        }
      }
    } catch (error) {
      const message = error instanceof Error ? error.message : String(error)
      const kind = classifyFailure(error)
      if (kind === 'blocked') blockedCount += 1
      else failedCount += 1
      warnings.push(`${candidate.url}: ${message}`.slice(0, 2_000))
    }
  }

  if (sources.length === 0) throw new Error(`Research collected no usable sources. ${warnings.slice(0, 3).join(' | ')}`)
  return {
    version: 1,
    query: request.query,
    request,
    searchedAt,
    completedAt: new Date().toISOString(),
    searchEvidence: search ? {
      provider: 'searxng',
      queryHash: researchContentHash(search.evidence.queryHashInput),
      resultCount: search.evidence.resultCount,
      selectedCount: sources.length,
    } : null,
    sources,
    warnings: [...(search?.evidence.unresponsiveEngines.map((engine) => `SearXNG engine unavailable: ${engine}`) ?? []), ...warnings].slice(0, 100),
    failedCount,
    blockedCount,
  }
}

export async function executeResearchEvidence(payload: WorkerJobData): Promise<ProcessorResult> {
  if (payload.capability !== 'research'
    || payload.metadata?.researchEvidence !== true
    || payload.metadata?.internalLocalExecution !== true) {
    return { success: false, status: 'failed', error: 'Invalid internal research evidence execution request' }
  }
  const existing = await findCompletedArtifactByTraceId(payload.traceId, 'research_evidence')
  if (existing) {
    return {
      success: true,
      status: 'completed',
      provider: 'amarktai-network',
      model: 'governed-research-v1',
      artifactId: existing.id,
      output: JSON.stringify({ evidenceArtifactId: existing.id, reused: true }),
      metadata: { internalLocalExecution: true, reused: true },
    }
  }

  try {
    const request = ResearchRequestSchema.parse(payload.input ?? {})
    const evidence = await collectEvidence(payload, request)
    const artifact = await saveArtifact({
      input: {
        appSlug: payload.appSlug,
        type: 'document',
        subType: 'research_evidence',
        title: `Research evidence: ${request.query.slice(0, 120)}`,
        description: 'Governed SearXNG and controlled-browser research evidence.',
        provider: 'amarktai-network',
        model: 'governed-research-v1',
        traceId: payload.traceId,
        mimeType: 'application/json',
        metadata: {
          researchEvidence: true,
          parentJobId: payload.metadata?.parentJobId ?? null,
          executionId: payload.metadata?.executionId ?? null,
          sourceCount: evidence.sources.length,
          failedCount: evidence.failedCount,
          blockedCount: evidence.blockedCount,
        },
      },
      data: Buffer.from(JSON.stringify(evidence, null, 2), 'utf8'),
      explicitMimeType: 'application/json',
    })
    return {
      success: true,
      status: 'completed',
      provider: 'amarktai-network',
      model: 'governed-research-v1',
      artifactId: artifact.id,
      output: JSON.stringify({
        evidenceArtifactId: artifact.id,
        sourceCount: evidence.sources.length,
        failedCount: evidence.failedCount,
        blockedCount: evidence.blockedCount,
      }),
      metadata: {
        internalLocalExecution: true,
        sourceCount: evidence.sources.length,
        failedCount: evidence.failedCount,
        blockedCount: evidence.blockedCount,
      },
    }
  } catch (error) {
    return {
      success: false,
      status: 'failed',
      error: error instanceof Error ? error.message : 'Research evidence collection failed',
      provider: 'amarktai-network',
      model: 'governed-research-v1',
      metadata: { internalLocalExecution: true },
    }
  }
}
