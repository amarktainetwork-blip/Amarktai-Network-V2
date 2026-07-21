import { readFileSync } from 'node:fs'
import { describe, expect, it } from 'vitest'

const mainFixture = readFileSync(new URL('../scripts/proof-release-fixture.mjs', import.meta.url), 'utf8')
const researchFixture = readFileSync(new URL('../scripts/lib/proof-research-release-fixture.mjs', import.meta.url), 'utf8')
const fixtureExecutor = readFileSync(new URL('../apps/worker/src/providers/release-fixture-executor.ts', import.meta.url), 'utf8')

describe('authoritative governed research release fixture', () => {
  it('runs inside the existing real-service fixture stack', () => {
    expect(mainFixture).toContain("import { proveResearchReleaseFixture } from './lib/proof-research-release-fixture.mjs'")
    expect(mainFixture).toContain('await proveResearchReleaseFixture({ apiRequest, invariant, delay, adminToken: catalogueToken })')
    expect(mainFixture).toContain("console.log('RESEARCH_RELEASE_FIXTURE=PASS')")
    expect(mainFixture).toContain("'searxng'")
  })

  it('creates two real apps and immutable research grants', () => {
    expect(researchFixture).toContain("capabilities = ['research', 'question_answering']")
    expect(researchFixture).toContain("'/api/admin/app-connections'")
    expect(researchFixture).toContain('/api/admin/app-connections/${encodeURIComponent(appSlug)}/keys')
    expect(researchFixture).toContain('/api/admin/app-grants/${encodeURIComponent(appSlug)}/${encodeURIComponent(capability)}')
    expect(researchFixture).toContain("configureGrant(apiRequest, invariant, adminToken, primarySlug, 'research')")
    expect(researchFixture).toContain("configureGrant(apiRequest, invariant, adminToken, primarySlug, 'question_answering')")
  })

  it('proves grant, override and automatic RAG-export denial', () => {
    expect(researchFixture).toContain("missingAnswerGrant.body.code === 'RESEARCH_GRANT_REQUIRED'")
    expect(researchFixture).toContain("override.body.code === 'INVALID_RESEARCH_REQUEST'")
    expect(researchFixture).toContain("automaticRagExport.body.code === 'RESEARCH_RAG_EXPORT_REQUIRES_EXPLICIT_INGEST'")
    expect(researchFixture).toContain("console.log('RESEARCH_GRANT_DENIAL=PASS')")
    expect(researchFixture).toContain("console.log('RESEARCH_OVERRIDE_DENIAL=PASS')")
    expect(researchFixture).toContain("console.log('RESEARCH_RAG_EXPORT_DENIAL=PASS')")
  })

  it('proves durable cited reports, source snapshots and route evidence', () => {
    expect(researchFixture).toContain("apiRequest('/api/v1/research/executions'")
    expect(researchFixture).toContain("evidenceChild.provider === 'amarktai-network'")
    expect(researchFixture).toContain("answerChild.capability === 'question_answering'")
    expect(researchFixture).toContain("report.body.searchEvidence?.provider === 'searxng'")
    expect(researchFixture).toContain('citedSource.snapshotArtifactId')
    expect(researchFixture).toContain("console.log('RESEARCH_CITED_REPORT=PASS')")
    expect(researchFixture).toContain("console.log('RESEARCH_SOURCE_SNAPSHOTS=PASS')")
    expect(fixtureExecutor).toContain("if (payload.capability === 'question_answering')")
    expect(fixtureExecutor).toContain('sourceIds: sourceIds.slice(0, 1)')
  })

  it('proves execution, report and snapshot isolation', () => {
    expect(researchFixture).toContain("crossAppExecution.body.code === 'RESEARCH_EXECUTION_NOT_FOUND'")
    expect(researchFixture).toContain('!crossAppReport.response.ok')
    expect(researchFixture).toContain('!crossAppSnapshot.response.ok')
    expect(researchFixture).toContain("console.log('RESEARCH_APP_ISOLATION=PASS')")
  })
})
