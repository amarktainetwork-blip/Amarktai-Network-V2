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
  invariant(created.response.status === 201, created.body.message || `Research fixture app creation returned ${created.response.status}`)

  const key = await apiRequest(`/api/admin/app-connections/${encodeURIComponent(appSlug)}/keys`, adminToken, {
    method: 'POST',
    headers: jsonHeaders(),
    body: JSON.stringify({ label: 'research-release-fixture' }),
  })
  invariant(key.response.status === 201 && typeof key.body.key === 'string', key.body.message || `Research fixture app key creation returned ${key.response.status}`)
  return key.body.key
}

async function configureGrant(apiRequest, invariant, adminToken, appSlug, capability) {
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
      artifactRead: true,
      artifactWrite: true,
      memoryRead: false,
      memoryWrite: false,
      ragNamespaces: [],
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
  invariant(result.response.ok && result.body.enabled === true, result.body.message || `Research grant ${capability} returned ${result.response.status}`)
}

async function pollResearchExecution(apiRequest, invariant, delay, appKey, executionId, timeoutMs = 120000) {
  const deadline = Date.now() + timeoutMs
  while (Date.now() < deadline) {
    const result = await apiRequest(`/api/v1/research/executions/${encodeURIComponent(executionId)}`, appKey)
    invariant(result.response.ok, result.body.message || `Research execution ${executionId} returned ${result.response.status}`)
    if (['completed', 'failed', 'cancelled'].includes(result.body.status)) return result.body
    await delay(500)
  }
  throw new Error(`Research execution ${executionId} timed out`)
}

export async function proveResearchReleaseFixture({ apiRequest, invariant, delay, adminToken }) {
  const suffix = `${Date.now().toString(36)}-${Math.random().toString(36).slice(2, 8)}`
  const primarySlug = `research-fixture-${suffix}`
  const secondarySlug = `research-isolation-${suffix}`
  const capabilities = ['research', 'question_answering']

  const primaryKey = await createFixtureApp(apiRequest, invariant, adminToken, primarySlug, 'Research Release Fixture', capabilities)
  const secondaryKey = await createFixtureApp(apiRequest, invariant, adminToken, secondarySlug, 'Research Isolation Fixture', capabilities)
  await configureGrant(apiRequest, invariant, adminToken, primarySlug, 'research')

  const missingAnswerGrant = await apiRequest('/api/v1/research/executions', primaryKey, {
    method: 'POST',
    headers: jsonHeaders(),
    body: JSON.stringify({ query: 'What responsibilities belong to AmarktAI Network?', answer: true }),
  })
  invariant(
    missingAnswerGrant.response.status === 403
      && missingAnswerGrant.body.code === 'RESEARCH_GRANT_REQUIRED'
      && missingAnswerGrant.body.missingCapabilities?.includes('question_answering'),
    'Research did not reject cited-answer execution without question_answering authority',
  )

  await configureGrant(apiRequest, invariant, adminToken, primarySlug, 'question_answering')

  const override = await apiRequest('/api/v1/research/executions', primaryKey, {
    method: 'POST',
    headers: jsonHeaders(),
    body: JSON.stringify({
      query: 'Reject hidden execution authority.',
      provider: 'deepinfra',
      model: 'fixture/blocked',
      endpoint: 'https://example.invalid',
    }),
  })
  invariant(override.response.status === 400 && override.body.code === 'INVALID_RESEARCH_REQUEST', 'Research accepted provider, model or endpoint authority from an app')

  const automaticRagExport = await apiRequest('/api/v1/research/executions', primaryKey, {
    method: 'POST',
    headers: jsonHeaders(),
    body: JSON.stringify({
      query: 'Reject unproven automatic RAG export.',
      ragNamespace: 'fixture:research',
    }),
  })
  invariant(
    automaticRagExport.response.status === 409 && automaticRagExport.body.code === 'RESEARCH_RAG_EXPORT_REQUIRES_EXPLICIT_INGEST',
    'Research accepted automatic RAG export before its durable proof exists',
  )

  const submitted = await apiRequest('/api/v1/research/executions', primaryKey, {
    method: 'POST',
    headers: jsonHeaders(),
    body: JSON.stringify({
      query: 'What responsibilities belong to AmarktAI Network rather than a thin app?',
      mode: 'deep',
      maxSearchResults: 5,
      maxPages: 3,
      maxDepth: 1,
      safeSearch: 'strict',
      answer: true,
      includeSnapshots: true,
      metadata: { fixture: true, purpose: 'authoritative-research-round-trip' },
    }),
  })
  invariant(
    submitted.response.status === 202
      && submitted.body.executionId
      && submitted.body.parentJobId
      && submitted.body.evidenceJobId
      && submitted.body.executionAuthority === 'amarktai-network',
    submitted.body.message || `Research submission returned ${submitted.response.status}`,
  )

  const execution = await pollResearchExecution(apiRequest, invariant, delay, primaryKey, submitted.body.executionId)
  invariant(execution.status === 'completed' && execution.artifactId, execution.error || 'Research execution did not complete')
  invariant(Number(execution.result?.citationCount ?? 0) >= 1, 'Research completed without a citation')
  invariant(Number(execution.result?.sourceCount ?? 0) >= 1, 'Research completed without a source')
  invariant(execution.result?.supportedBySources === true, 'Research answer was not marked source-supported')

  const evidenceChild = execution.evidence?.find((item) => item.role === 'evidence_collection')
  const answerChild = execution.evidence?.find((item) => item.role === 'answer_generation')
  invariant(
    evidenceChild?.status === 'completed'
      && evidenceChild.provider === 'amarktai-network'
      && evidenceChild.model === 'governed-research-v1'
      && evidenceChild.artifactId,
    'Research evidence child did not preserve internal Network execution evidence',
  )
  invariant(
    answerChild?.status === 'completed'
      && answerChild.capability === 'question_answering'
      && typeof answerChild.provider === 'string'
      && typeof answerChild.model === 'string',
    'Research answer child did not preserve Orchestra provider/model evidence',
  )

  const report = await apiRequest(`/api/v1/artifacts/${encodeURIComponent(execution.artifactId)}/file`, primaryKey)
  invariant(report.response.ok && report.body.version === 1, 'Research report artifact was not readable')
  invariant(report.body.supportedBySources === true && Array.isArray(report.body.citations) && report.body.citations.length >= 1, 'Research report is missing source-supported citations')
  invariant(Array.isArray(report.body.sources) && report.body.sources.length >= 1, 'Research report is missing fetched sources')
  invariant(report.body.searchEvidence?.provider === 'searxng', 'Research report lost SearXNG search evidence')
  const citedSource = report.body.sources.find((source) => source.sourceId === report.body.citations[0].sourceId)
  invariant(citedSource && citedSource.citationId === report.body.citations[0].citationId, 'Research citation does not belong to a fetched source')
  invariant(citedSource.snapshotArtifactId, 'Research source snapshot artifact was not preserved')

  const evidenceArtifact = await apiRequest(`/api/v1/artifacts/${encodeURIComponent(evidenceChild.artifactId)}/file`, primaryKey)
  invariant(evidenceArtifact.response.ok && Array.isArray(evidenceArtifact.body.sources) && evidenceArtifact.body.sources.length >= 1, 'Research evidence artifact is missing normalized sources')
  invariant(evidenceArtifact.body.sources[0].sourceId === citedSource.sourceId, 'Research report lost evidence-artifact source lineage')

  const snapshot = await apiRequest(`/api/v1/artifacts/${encodeURIComponent(citedSource.snapshotArtifactId)}/file`, primaryKey)
  invariant(snapshot.response.ok && String(snapshot.response.headers.get('content-type') || '').includes('text/html'), 'Research source snapshot bytes were not readable by the owning app')

  const crossAppExecution = await apiRequest(`/api/v1/research/executions/${encodeURIComponent(submitted.body.executionId)}`, secondaryKey)
  invariant(crossAppExecution.response.status === 404 && crossAppExecution.body.code === 'RESEARCH_EXECUTION_NOT_FOUND', 'A second app could read another app research execution')
  const crossAppReport = await apiRequest(`/api/v1/artifacts/${encodeURIComponent(execution.artifactId)}/file`, secondaryKey)
  invariant(!crossAppReport.response.ok, 'A second app could read another app research report')
  const crossAppSnapshot = await apiRequest(`/api/v1/artifacts/${encodeURIComponent(citedSource.snapshotArtifactId)}/file`, secondaryKey)
  invariant(!crossAppSnapshot.response.ok, 'A second app could read another app research source snapshot')

  console.log(`RESEARCH_FIXTURE_APP=${primarySlug}`)
  console.log(`RESEARCH_FIXTURE_CITATIONS=${report.body.citations.length}`)
  console.log(`RESEARCH_FIXTURE_SOURCES=${report.body.sources.length}`)
  console.log('RESEARCH_GRANT_DENIAL=PASS')
  console.log('RESEARCH_OVERRIDE_DENIAL=PASS')
  console.log('RESEARCH_RAG_EXPORT_DENIAL=PASS')
  console.log('RESEARCH_CITED_REPORT=PASS')
  console.log('RESEARCH_SOURCE_SNAPSHOTS=PASS')
  console.log('RESEARCH_APP_ISOLATION=PASS')
}
