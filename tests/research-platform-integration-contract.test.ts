import { readFileSync } from 'node:fs'
import { describe, expect, it } from 'vitest'

const server = readFileSync(new URL('../apps/api/src/server.ts', import.meta.url), 'utf8')
const route = readFileSync(new URL('../apps/api/src/routes/app-research.ts', import.meta.url), 'utf8')
const parentWorkflow = readFileSync(new URL('../apps/worker/src/parent-workflow.ts', import.meta.url), 'utf8')
const fallback = readFileSync(new URL('../apps/worker/src/providers/durable-provider-fallback.ts', import.meta.url), 'utf8')
const evidence = readFileSync(new URL('../apps/worker/src/research-evidence-executor.ts', import.meta.url), 'utf8')
const common = readFileSync(new URL('../apps/worker/src/research-workflow-common.ts', import.meta.url), 'utf8')
const workflow = readFileSync(new URL('../apps/worker/src/research-workflow.ts', import.meta.url), 'utf8')
const sdk = readFileSync(new URL('../packages/sdk/src/index.ts', import.meta.url), 'utf8')
const openapi = readFileSync(new URL('../docs/app-api-openapi.yaml', import.meta.url), 'utf8')

describe('durable governed research integration contract', () => {
  it('registers dedicated app-authenticated execution and status routes', () => {
    expect(server).toContain("import { appResearchRoutes } from './routes/app-research.js'")
    expect(server).toContain('await app.register(appResearchRoutes)')
    expect(route).toContain("app.post('/api/v1/research/executions'")
    expect(route).toContain("app.get('/api/v1/research/executions/:id'")
    expect(route).toContain('authenticateAppKey(request.headers.authorization)')
    expect(route).toContain("capability: 'research'")
    expect(route).toContain('appSlug,')
  })

  it('preflights and freezes research and answer authority before queueing', () => {
    expect(route).toContain("resolveAppCapabilityGrantSnapshot(appSlug, 'research', allowedCapabilities)")
    expect(route).toContain("resolveAppCapabilityGrantSnapshot(appSlug, 'question_answering', allowedCapabilities)")
    expect(route).toContain('researchGrantSnapshot: researchGrant')
    expect(route).toContain('answerGrantSnapshot: answerGrant')
    expect(route).toContain("code: 'RESEARCH_ARTIFACT_WRITE_REQUIRED'")
    expect(route).toContain("code: 'RESEARCH_RAG_EXPORT_REQUIRES_EXPLICIT_INGEST'")
    expect(route.indexOf('resolveAppCapabilityGrantSnapshot')).toBeLessThan(route.indexOf("getQueue().add('process'"))
  })

  it('keeps search and browsing as internal Network execution', () => {
    expect(evidence).toContain('searxngSearch(request)')
    expect(evidence).toContain('controlledBrowsePage({ url: candidate.url, request })')
    expect(evidence).toContain("subType: 'research_source_snapshot'")
    expect(evidence).toContain("subType: 'research_evidence'")
    expect(evidence).toContain('snapshotArtifactId')
    expect(evidence).toContain("provider: 'amarktai-network'")
    expect(evidence).toContain("model: 'governed-research-v1'")
    expect(fallback).toContain('isInternalResearchEvidence')
    expect(fallback).toContain('executeResearchEvidence(payload)')
    expect(fallback).toContain('isInternalLocalExecution(payload)')
  })

  it('routes only the answer child through immutable Orchestra authority', () => {
    expect(parentWorkflow).toContain("if (kind === 'research')")
    expect(parentWorkflow).toContain('await advanceResearchWorkflow(parent.id, queue)')
    expect(common).toContain("capability: 'question_answering'")
    expect(common).toContain('appGrantSnapshot: input.grant')
    expect(common).toContain("validateDirectProviderRequest('question_answering'")
    expect(common).toContain("throw new Error('Research answer cites a source outside the fetched evidence')")
    expect(workflow).toContain('parseResearchAnswer(answerChild.output, evidence.sources.map((source) => source.citationId))')
  })

  it('persists a validated cited report and app-owned source lineage', () => {
    expect(workflow).toContain('validateResearchCitationSet({ citations, sources: input.evidence.sources })')
    expect(workflow).toContain('ResearchReportSchema.parse')
    expect(workflow).toContain("subType: 'research_report'")
    expect(workflow).toContain('sources: input.evidence.sources')
    expect(workflow).toContain('citationCount: report.citations.length')
    expect(route).toContain('where: { appSlug, parentJobId: parent.id }')
    expect(route).toContain("code: 'RESEARCH_EXECUTION_NOT_FOUND'")
  })

  it('exposes only provider-neutral SDK and OpenAPI fields', () => {
    expect(sdk).toContain('export interface ResearchExecutionPayload')
    expect(sdk).toContain('executeResearch(payload: ResearchExecutionPayload)')
    expect(sdk).toContain('researchExecution(executionId: string)')
    const sdkContract = sdk.match(/export interface ResearchExecutionPayload[\s\S]+?(?=export type VoiceAvatarUseScope)/)?.[0] ?? ''
    expect(sdkContract).toContain('includeSnapshots?: boolean')
    expect(sdkContract).not.toMatch(/appSlug|provider|model|route|executorId|endpoint|apiKey|ragNamespace/)
    expect(openapi).toContain('version: 1.5.0')
    expect(openapi).toContain('ResearchExecution:')
    expect(openapi).toContain('additionalProperties: false')
    expect(openapi).toContain('/api/v1/research/executions:')
    expect(openapi).toContain('/api/v1/research/executions/{id}:')
    const openapiContract = openapi.match(/ResearchExecution:[\s\S]+?paths:/)?.[0] ?? ''
    expect(openapiContract).not.toMatch(/appSlug|provider:|model:|route:|executorId|endpoint:|apiKey|ragNamespace/)
  })
})
