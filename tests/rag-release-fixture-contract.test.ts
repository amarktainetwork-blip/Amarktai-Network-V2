import { readFileSync } from 'node:fs'
import { describe, expect, it } from 'vitest'

const mainFixture = readFileSync(new URL('../scripts/proof-release-fixture.mjs', import.meta.url), 'utf8')
const ragFixture = readFileSync(new URL('../scripts/lib/proof-rag-release-fixture.mjs', import.meta.url), 'utf8')
const fixtureExecutor = readFileSync(new URL('../apps/worker/src/providers/release-fixture-executor.ts', import.meta.url), 'utf8')
const fixtureAdapter = readFileSync(new URL('../apps/worker/src/providers/release-fixture-adapter.ts', import.meta.url), 'utf8')

describe('authoritative RAG release fixture', () => {
  it('runs inside the existing real-service fixture stack', () => {
    expect(mainFixture).toContain("import { proveRagReleaseFixture } from './lib/proof-rag-release-fixture.mjs'")
    expect(mainFixture).toContain('await proveRagReleaseFixture({ apiRequest, invariant, delay, run, docker, compose, adminToken: catalogueToken })')
    expect(mainFixture).toContain("console.log('RAG_RELEASE_FIXTURE=PASS')")
  })

  it('uses real app connections, API keys and immutable grants', () => {
    expect(ragFixture).toContain("'/api/admin/app-connections'")
    expect(ragFixture).toContain("/api/admin/app-connections/${encodeURIComponent(appSlug)}/keys")
    expect(ragFixture).toContain("/api/admin/app-grants/${encodeURIComponent(appSlug)}/${encodeURIComponent(capability)}")
    expect(ragFixture).toContain("capabilities = ['rag_ingest', 'rag_search', 'embeddings', 'reranking', 'question_answering']")
    expect(ragFixture).toContain("ragNamespaces: permissions.namespaced === false ? [] : [namespace]")
  })

  it('proves ingest, search, cited answers and Qdrant source lineage', () => {
    expect(ragFixture).toContain("apiRequest('/api/v1/rag/ingest'")
    expect(ragFixture).toContain("apiRequest('/api/v1/rag/search'")
    expect(ragFixture).toContain("answer: true")
    expect(ragFixture).toContain("rerank: true")
    expect(ragFixture).toContain("'/points/scroll'")
    expect(ragFixture).toContain("points[0].payload?.sourceId === sourceId")
    expect(ragFixture).toContain("artifact.body.answer.sourceIds.includes(artifact.body.citations[0].citationId)")
  })

  it('proves namespace denial and cross-app isolation', () => {
    expect(ragFixture).toContain("denied.body.code === 'RAG_NAMESPACE_DENIED'")
    expect(ragFixture).toContain("crossAppExecution.body.code === 'RAG_EXECUTION_NOT_FOUND'")
    expect(ragFixture).toContain("!crossAppArtifact.response.ok")
    expect(ragFixture).toContain("console.log('RAG_NAMESPACE_DENIAL=PASS')")
    expect(ragFixture).toContain("console.log('RAG_APP_ISOLATION=PASS')")
  })

  it('returns contract-valid deterministic provider outputs', () => {
    expect(fixtureExecutor).toContain('output = { vectors, dimensions: 4, count: vectors.length }')
    expect(fixtureExecutor).toContain("if (payload.capability === 'question_answering')")
    expect(fixtureExecutor).toContain('supportedByContext: sourceIds.length > 0')
    expect(fixtureExecutor).toContain('sourceIds: sourceIds.slice(0, 1)')
  })

  it('keeps one canonical fixture implementation', () => {
    expect(fixtureAdapter).toContain("from './release-fixture-executor.js'")
    expect(fixtureAdapter).not.toContain('function textResult')
    expect(fixtureAdapter).not.toContain('function generateFixtureMedia')
  })
})
