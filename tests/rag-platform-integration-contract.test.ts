import { readFileSync } from 'node:fs'
import { describe, expect, it } from 'vitest'

const server = readFileSync(new URL('../apps/api/src/server.ts', import.meta.url), 'utf8')
const registrar = readFileSync(new URL('../apps/api/src/routes/app-rag-v2.ts', import.meta.url), 'utf8')
const ingestRoute = readFileSync(new URL('../apps/api/src/routes/app-rag-ingest-route.ts', import.meta.url), 'utf8')
const searchRoute = readFileSync(new URL('../apps/api/src/routes/app-rag-search-route.ts', import.meta.url), 'utf8')
const routes = [registrar, ingestRoute, searchRoute].join('\n')
const parentWorkflow = readFileSync(new URL('../apps/worker/src/parent-workflow.ts', import.meta.url), 'utf8')
const dispatcher = readFileSync(new URL('../apps/worker/src/rag-workflow.ts', import.meta.url), 'utf8')
const ingest = readFileSync(new URL('../apps/worker/src/rag-ingest-workflow.ts', import.meta.url), 'utf8')
const search = readFileSync(new URL('../apps/worker/src/rag-search-workflow.ts', import.meta.url), 'utf8')
const common = readFileSync(new URL('../apps/worker/src/rag-workflow-common.ts', import.meta.url), 'utf8')
const sdk = readFileSync(new URL('../packages/sdk/src/index.ts', import.meta.url), 'utf8')

describe('durable RAG integration contract', () => {
  it('registers dedicated thin-app RAG routes and provider-neutral SDK methods', () => {
    expect(server).toContain("import { appRagRoutes } from './routes/app-rag.js'")
    expect(server).toContain('await app.register(appRagRoutes)')
    expect(routes).toContain("app.post('/api/v1/rag/ingest'")
    expect(routes).toContain("app.post('/api/v1/rag/search'")
    expect(routes).toContain("app.get('/api/v1/rag/executions/:id'")
    expect(sdk).toContain('ingestRag(')
    expect(sdk).toContain('searchRag(')
    expect(sdk).toContain('ragExecution(')
    const contracts = sdk.match(/export interface RagIngestPayload[\s\S]+?(?=export interface ResearchExecutionPayload)/)?.[0] ?? ''
    expect(contracts).toContain('export interface RagSearchPayload')
    expect(contracts).not.toMatch(/provider|model|route|executorId|endpoint|apiKey|appSlug/)
  })

  it('preflights and freezes every later capability before queueing paid work', () => {
    expect(ingestRoute).toContain("grantSnapshot(auth.app!.slug, 'rag_ingest', allowed)")
    expect(ingestRoute).toContain("grantSnapshot(auth.app!.slug, 'embeddings', allowed)")
    expect(searchRoute).toContain("'reranking' as CapabilityKey")
    expect(searchRoute).toContain("'question_answering' as CapabilityKey")
    expect(routes).toContain('appGrantSnapshot: parentGrant.grant')
    expect(routes).toContain('embeddingGrantSnapshot: embeddingGrant.grant')
    expect(searchRoute).toContain('rerankingGrantSnapshot: rerankingGrant.grant')
    expect(searchRoute).toContain('answerGrantSnapshot: answerGrant.grant')
    expect(routes).toContain('validNamespace(parentGrant.grant, parsed.data.namespace)')
  })

  it('persists source bytes before provider-routed embedding execution', () => {
    expect(ingestRoute).toContain("subType: 'rag_source'")
    expect(ingestRoute).toContain("ragRole: 'source_embedding'")
    expect(ingestRoute).toContain("capability: 'embeddings'")
    expect(ingestRoute.indexOf('await saveArtifact')).toBeLessThan(ingestRoute.indexOf("await getQueue().add('process', payload"))
    expect(routes).not.toContain('provider: parsed.data')
    expect(routes).not.toContain('model: parsed.data')
  })

  it('dispatches durable RAG and research parents after every child completion', () => {
    expect(parentWorkflow).toContain("ParentWorkflowKind = 'long_form_video' | 'social_ad_video' | 'rag' | 'research' | 'durable_closure' | 'unknown'")
    expect(parentWorkflow).toContain("if (kind === 'rag')")
    expect(parentWorkflow).toContain('await advanceRagWorkflow(parent.id, queue)')
    expect(parentWorkflow).toContain("if (kind === 'research')")
    expect(parentWorkflow).toContain('await advanceResearchWorkflow(parent.id, queue)')
    expect(dispatcher).toContain("parent.capability === 'rag_ingest'")
    expect(dispatcher).toContain("parent.capability === 'rag_search'")
    expect(dispatcher).toContain('advanceRagIngestWorkflow')
    expect(dispatcher).toContain('advanceRagSearchWorkflow')
  })

  it('upserts deterministic source lineage and never omits tenant isolation', () => {
    expect(ingest).toContain('ragPointId({ appSlug: parent.appSlug, namespace, sourceId, chunkHash: chunk.hash })')
    expect(ingest).toContain('appSlug: parent.appSlug')
    expect(ingest).toContain('namespace,')
    expect(ingest).toContain('citationId: chunk.citationId')
    expect(ingest).toContain('sourceArtifactId')
    expect(ingest).toContain("subType: 'rag_ingest_manifest'")
    expect(search).toContain('ragIsolationFilter(parent.appSlug, namespace)')
    expect(search).toContain('input.payload.appSlug !== input.appSlug || input.payload.namespace !== input.namespace')
  })

  it('validates reranking and cited answers against retrieved source ids', () => {
    expect(common).toContain("throw new Error('RAG reranking index is invalid')")
    expect(common).toContain('sourceIds.some((sourceId) => !allowed.has(sourceId))')
    expect(common).toContain('Context-supported RAG answer has no citations')
    expect(search).toContain('contextFromChunks(chunks)')
    expect(search).toContain('parseAnswerOutput(answerJob.output, sourceIds)')
    expect(search).toContain("subType: 'rag_search_result'")
  })

  it('keeps child creation idempotent by parent and role', () => {
    expect(common).toContain('findRagChild(input.parent.id, input.parent.appSlug, input.role)')
    expect(common).toContain('if (existing) return existing')
    expect(common).toContain('appGrantSnapshot: input.grant')
    expect(common).toContain("await input.queue.add('process', payload")
  })
})
