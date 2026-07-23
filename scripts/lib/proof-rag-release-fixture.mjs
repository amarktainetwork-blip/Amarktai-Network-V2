function jsonHeaders() {
  return { 'Content-Type': 'application/json' }
}

async function createFixtureApp(apiRequest, invariant, adminToken, appSlug, appName, capabilities) {
  const created = await apiRequest('/api/admin/app-connections', adminToken, {
    method: 'POST',
    headers: jsonHeaders(),
    body: JSON.stringify({
      appSlug,
      appName,
      appType: 'release-fixture',
      environment: 'test',
      onboardingState: 'active',
      allowedCapabilities: capabilities,
      dailyBudgetCents: 100000,
      monthlyBudgetCents: 1000000,
      requestsPerMinute: 1000,
      requestsPerDay: 10000,
      artifactRead: true,
      artifactWrite: true,
      memoryRead: true,
      memoryWrite: true,
      routingMode: 'automatic',
      qualityTarget: 'standard',
      spendStrategy: 'best_value',
    }),
  })
  invariant(created.response.status === 201, created.body.message || `Fixture app creation returned ${created.response.status}`)

  const key = await apiRequest(`/api/admin/app-connections/${encodeURIComponent(appSlug)}/keys`, adminToken, {
    method: 'POST',
    headers: jsonHeaders(),
    body: JSON.stringify({ label: 'rag-release-fixture' }),
  })
  invariant(key.response.status === 201 && typeof key.body.key === 'string', key.body.message || `Fixture app key creation returned ${key.response.status}`)
  return key.body.key
}

async function configureGrant(apiRequest, invariant, adminToken, appSlug, capability, namespace, permissions = {}) {
  const result = await apiRequest(`/api/admin/app-grants/${encodeURIComponent(appSlug)}/${encodeURIComponent(capability)}`, adminToken, {
    method: 'PUT',
    headers: jsonHeaders(),
    body: JSON.stringify({
      enabled: true,
      qualityFloor: 'balanced',
      budgetPolicy: 'balanced',
      maxCostPerRequest: 0,
      maxCostPerWorkflow: 0,
      latencyPreference: 'medium',
      allowFallback: true,
      maxFallbackAttempts: 3,
      liveProofRequired: false,
      approvalRequired: false,
      artifactRead: permissions.artifactRead !== false,
      artifactWrite: permissions.artifactWrite !== false,
      memoryRead: permissions.memoryRead === true,
      memoryWrite: permissions.memoryWrite === true,
      ragNamespaces: permissions.namespaced === false ? [] : [namespace],
      policyProfile: 'release_fixture',
      adultPermission: false,
      dataRetentionPolicy: 'fixture_ephemeral',
      passthroughModelAllowed: false,
      providerResidencyConstraints: [],
      routingMode: 'automatic',
      qualityTarget: 'standard',
      spendStrategy: 'best_value',
      fixedRoute: null,
      preferredPool: [],
      selectableAllowlist: [],
      restrictedPool: [],
      workflowStepOverrides: {},
    }),
  })
  invariant(result.response.ok && result.body.enabled === true, result.body.message || `Grant ${capability} returned ${result.response.status}`)
}

async function pollRagExecution(apiRequest, invariant, delay, appKey, executionId, timeoutMs = 120000) {
  const deadline = Date.now() + timeoutMs
  while (Date.now() < deadline) {
    const result = await apiRequest(`/api/v1/rag/executions/${encodeURIComponent(executionId)}`, appKey)
    invariant(result.response.ok, result.body.message || `RAG execution ${executionId} returned ${result.response.status}`)
    if (['completed', 'failed', 'cancelled'].includes(result.body.status)) return result.body
    await delay(500)
  }
  throw new Error(`RAG execution ${executionId} timed out`)
}

function parseCapturedJson(result, label) {
  const rows = String(result.stdout || '').trim().split(/\r?\n/).filter(Boolean)
  const row = [...rows].reverse().find((value) => value.trim().startsWith('{'))
  if (!row) throw new Error(`${label} returned no JSON evidence`)
  return JSON.parse(row)
}

function inspectQdrant(run, docker, compose, collection, appSlug, namespace) {
  const script = `
const collection = ${JSON.stringify(collection)};
const appSlug = ${JSON.stringify(appSlug)};
const namespace = ${JSON.stringify(namespace)};
const base = process.env.QDRANT_URL;
const infoResponse = await fetch(base + '/collections/' + encodeURIComponent(collection));
const info = await infoResponse.json();
const scrollResponse = await fetch(base + '/collections/' + encodeURIComponent(collection) + '/points/scroll', {
  method: 'POST',
  headers: { 'Content-Type': 'application/json' },
  body: JSON.stringify({
    limit: 20,
    with_payload: true,
    with_vector: false,
    filter: { must: [
      { key: 'appSlug', match: { value: appSlug } },
      { key: 'namespace', match: { value: namespace } }
    ] }
  })
});
const scroll = await scrollResponse.json();
console.log(JSON.stringify({ infoStatus: infoResponse.status, info, scrollStatus: scrollResponse.status, scroll }));
`
  return parseCapturedJson(run(docker, [...compose, 'exec', '-T', 'api', 'node', '--input-type=module', '-e', script], { capture: true }), 'Qdrant inspection')
}

export async function proveRagReleaseFixture({ apiRequest, invariant, delay, run, docker, compose, adminToken }) {
  const suffix = `${Date.now().toString(36)}-${Math.random().toString(36).slice(2, 8)}`
  const primarySlug = `rag-fixture-${suffix}`
  const secondarySlug = `rag-isolation-${suffix}`
  const namespace = `fixture:${suffix}`
  const deniedNamespace = `denied:${suffix}`
  const capabilities = ['rag_ingest', 'rag_search', 'embeddings', 'reranking', 'question_answering']

  const primaryKey = await createFixtureApp(apiRequest, invariant, adminToken, primarySlug, 'RAG Release Fixture', capabilities)
  const secondaryKey = await createFixtureApp(apiRequest, invariant, adminToken, secondarySlug, 'RAG Isolation Fixture', capabilities)

  await configureGrant(apiRequest, invariant, adminToken, primarySlug, 'rag_ingest', namespace, { memoryWrite: true })
  await configureGrant(apiRequest, invariant, adminToken, primarySlug, 'rag_search', namespace, { memoryRead: true })
  await configureGrant(apiRequest, invariant, adminToken, primarySlug, 'embeddings', namespace, { namespaced: false })
  await configureGrant(apiRequest, invariant, adminToken, primarySlug, 'reranking', namespace, { namespaced: false })
  await configureGrant(apiRequest, invariant, adminToken, primarySlug, 'question_answering', namespace, { namespaced: false })

  const denied = await apiRequest('/api/v1/rag/ingest', primaryKey, {
    method: 'POST',
    headers: jsonHeaders(),
    body: JSON.stringify({
      namespace: deniedNamespace,
      sourceId: 'denied-source',
      text: 'This source must never be accepted outside the granted namespace.',
      chunkSize: 1200,
      chunkOverlap: 0,
    }),
  })
  invariant(denied.response.status === 403 && denied.body.code === 'RAG_NAMESPACE_DENIED', 'RAG ingest did not reject an ungranted namespace')

  const sourceId = `network-architecture-${suffix}`
  const sourceText = 'AmarktAI Network owns provider routing, model selection, capability grants, durable jobs, evidence, artifact storage, quality gates, budgets, memory and RAG. Thin apps own their product-specific user experience and send outcome requests without provider or model overrides.'
  const ingest = await apiRequest('/api/v1/rag/ingest', primaryKey, {
    method: 'POST',
    headers: jsonHeaders(),
    body: JSON.stringify({
      namespace,
      sourceId,
      title: 'AmarktAI Network architecture fixture',
      url: 'https://fixture.invalid/amarktai-network-architecture',
      text: sourceText,
      metadata: { fixture: true, purpose: 'authoritative-rag-round-trip' },
      chunkSize: 1200,
      chunkOverlap: 0,
    }),
  })
  invariant(ingest.response.status === 202 && ingest.body.executionId && ingest.body.sourceArtifactId, ingest.body.message || `RAG ingest returned ${ingest.response.status}`)
  const ingestExecution = await pollRagExecution(apiRequest, invariant, delay, primaryKey, ingest.body.executionId)
  invariant(ingestExecution.status === 'completed' && ingestExecution.artifactId, ingestExecution.error || 'RAG ingest did not complete')

  const search = await apiRequest('/api/v1/rag/search', primaryKey, {
    method: 'POST',
    headers: jsonHeaders(),
    body: JSON.stringify({
      namespace,
      query: 'What responsibilities belong to AmarktAI Network rather than a thin app?',
      topK: 5,
      minScore: 0,
      rerank: true,
      answer: true,
    }),
  })
  invariant(search.response.status === 202 && search.body.executionId, search.body.message || `RAG search returned ${search.response.status}`)
  const searchExecution = await pollRagExecution(apiRequest, invariant, delay, primaryKey, search.body.executionId)
  invariant(searchExecution.status === 'completed' && searchExecution.artifactId, searchExecution.error || 'RAG search did not complete')
  invariant(Number(searchExecution.result?.citationCount ?? 0) >= 1, 'RAG search completed without citations')
  invariant(searchExecution.result?.answer?.supportedByContext === true, 'RAG answer was not marked context-supported')
  invariant(Array.isArray(searchExecution.result?.answer?.sourceIds) && searchExecution.result.answer.sourceIds.length >= 1, 'RAG answer did not preserve cited source IDs')

  const artifact = await apiRequest(`/api/v1/artifacts/${encodeURIComponent(searchExecution.artifactId)}/file`, primaryKey)
  invariant(artifact.response.ok && Array.isArray(artifact.body.citations) && artifact.body.citations.length >= 1, 'RAG result artifact has no citations')
  invariant(artifact.body.citations[0].sourceId === sourceId, 'RAG citation does not point to the ingested source')
  invariant(artifact.body.citations[0].sourceArtifactId === ingest.body.sourceArtifactId, 'RAG citation lost source-artifact lineage')
  invariant(artifact.body.answer?.supportedByContext === true, 'RAG result artifact answer is not context-supported')
  invariant(artifact.body.answer.sourceIds.includes(artifact.body.citations[0].citationId), 'RAG answer citation is outside the retrieved context')

  const crossAppExecution = await apiRequest(`/api/v1/rag/executions/${encodeURIComponent(search.body.executionId)}`, secondaryKey)
  invariant(crossAppExecution.response.status === 404 && crossAppExecution.body.code === 'RAG_EXECUTION_NOT_FOUND', 'A second app could read another app RAG execution')
  const crossAppArtifact = await apiRequest(`/api/v1/artifacts/${encodeURIComponent(searchExecution.artifactId)}/file`, secondaryKey)
  invariant(!crossAppArtifact.response.ok, 'A second app could read another app RAG artifact')

  const qdrant = inspectQdrant(run, docker, compose, artifact.body.collection, primarySlug, namespace)
  const points = qdrant.scroll?.result?.points ?? []
  invariant(qdrant.infoStatus === 200 && qdrant.scrollStatus === 200, 'Qdrant collection inspection failed')
  invariant(points.length >= 1, 'Qdrant contains no point for the authorised app namespace')
  invariant(points[0].payload?.appSlug === primarySlug && points[0].payload?.namespace === namespace, 'Qdrant point is missing tenant isolation payload')
  invariant(points[0].payload?.sourceId === sourceId && points[0].payload?.citationId === artifact.body.citations[0].citationId, 'Qdrant point is missing source lineage')

  console.log(`RAG_FIXTURE_APP=${primarySlug}`)
  console.log(`RAG_FIXTURE_NAMESPACE=${namespace}`)
  console.log(`RAG_FIXTURE_COLLECTION=${artifact.body.collection}`)
  console.log(`RAG_FIXTURE_CITATIONS=${artifact.body.citations.length}`)
  console.log('RAG_NAMESPACE_DENIAL=PASS')
  console.log('RAG_APP_ISOLATION=PASS')
  console.log('RAG_QDRANT_ROUND_TRIP=PASS')
  console.log('RAG_CITED_ANSWER=PASS')
}
