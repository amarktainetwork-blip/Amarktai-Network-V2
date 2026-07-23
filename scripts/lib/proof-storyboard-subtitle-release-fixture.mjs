function jsonHeaders() { return { 'Content-Type': 'application/json' } }

async function createApp(apiRequest, invariant, adminToken, appSlug, capabilities) {
  const created = await apiRequest('/api/admin/app-connections', adminToken, {
    method: 'POST', headers: jsonHeaders(),
    body: JSON.stringify({
      appSlug, appName: `Storyboard subtitle fixture ${appSlug}`, appType: 'release-fixture', environment: 'test',
      onboardingState: 'active', allowedCapabilities: capabilities, dailyBudgetCents: 100000,
      monthlyBudgetCents: 1000000, requestsPerMinute: 1000, requestsPerDay: 10000,
      artifactRead: true, artifactWrite: true, routingMode: 'automatic', qualityTarget: 'standard', spendStrategy: 'best_value',
    }),
  })
  invariant(created.response.status === 201, created.body.message || `Storyboard fixture app creation returned ${created.response.status}`)
  for (const capability of capabilities) {
    const grant = await apiRequest(`/api/admin/app-grants/${encodeURIComponent(appSlug)}/${encodeURIComponent(capability)}`, adminToken, {
      method: 'PUT', headers: jsonHeaders(),
      body: JSON.stringify({
        enabled: true, qualityFloor: 'balanced', budgetPolicy: 'balanced', maxCostPerRequest: 0,
        maxCostPerWorkflow: 0, latencyPreference: 'medium', allowFallback: true, maxFallbackAttempts: 3,
        liveProofRequired: false, approvalRequired: false, artifactRead: true, artifactWrite: true,
        memoryRead: false, memoryWrite: false, ragNamespaces: [], policyProfile: 'release_fixture',
        adultPermission: false, dataRetentionPolicy: 'fixture_ephemeral', passthroughModelAllowed: false,
        providerResidencyConstraints: [], routingMode: 'automatic', qualityTarget: 'standard',
        spendStrategy: 'best_value', fixedRoute: null, preferredPool: [], selectableAllowlist: [],
        restrictedPool: [], workflowStepOverrides: {},
      }),
    })
    invariant(grant.response.ok && grant.body.enabled === true, grant.body.message || `Fixture grant ${capability} failed`)
  }
  const key = await apiRequest(`/api/admin/app-connections/${encodeURIComponent(appSlug)}/keys`, adminToken, {
    method: 'POST', headers: jsonHeaders(), body: JSON.stringify({ label: 'storyboard-subtitle-release-fixture' }),
  })
  invariant(key.response.status === 201 && typeof key.body.key === 'string', key.body.message || 'Storyboard fixture API key creation failed')
  return key.body.key
}

async function pollJob(apiRequest, invariant, delay, appKey, jobId, timeoutMs = 120000) {
  const deadline = Date.now() + timeoutMs
  while (Date.now() < deadline) {
    const result = await apiRequest(`/api/v1/jobs/${encodeURIComponent(jobId)}`, appKey)
    invariant(result.response.ok, result.body.message || `Fixture job ${jobId} status returned ${result.response.status}`)
    if (['completed', 'failed', 'cancelled'].includes(result.body.status)) return result.body
    await delay(300)
  }
  throw new Error(`Storyboard/subtitle fixture job ${jobId} timed out`)
}

async function downloadArtifact(invariant, appKey, artifactId, expectedMime) {
  // apiRequest intentionally parses JSON response bodies for normal fixture API
  // calls. Binary artifact proof must use its own response so the body remains
  // unread until arrayBuffer() consumes it.
  const response = await fetch(`http://127.0.0.1:3211/api/v1/artifacts/${encodeURIComponent(artifactId)}/file?download=1`, {
    headers: { Authorization: `Bearer ${appKey}` },
    signal: AbortSignal.timeout(30_000),
  })
  invariant(response.ok, `Artifact ${artifactId} download returned ${response.status}`)
  invariant(String(response.headers.get('content-type') || '').startsWith(expectedMime), `Artifact ${artifactId} MIME was not ${expectedMime}`)
  return Buffer.from(await response.arrayBuffer())
}

export async function proveStoryboardSubtitleReleaseFixture({ apiRequest, invariant, delay, adminToken }) {
  const suffix = `${Date.now().toString(36)}-${Math.random().toString(36).slice(2, 7)}`
  const capabilities = ['storyboard_generation', 'subtitle_generation']
  const appKey = await createApp(apiRequest, invariant, adminToken, `storyboard-fixture-${suffix}`, capabilities)
  const otherKey = await createApp(apiRequest, invariant, adminToken, `storyboard-isolation-${suffix}`, capabilities)

  const storyboardPayload = {
    capability: 'storyboard_generation',
    prompt: 'Create a cinematic launch storyboard for a governed horse-management platform.',
    input: {
      brief: 'Create a cinematic launch storyboard for a professional horse-management platform, with clear benefits and a confident call to action.',
      targetDurationSeconds: 30,
      sceneCount: 6,
      aspectRatio: '16:9',
      style: 'cinematic',
      tone: 'professional',
      brandName: 'Fixture Equine Platform',
      objective: 'Explain the platform clearly and create interest.',
      callToAction: 'Create your horse profile today.',
      idempotencyKey: `storyboard-${suffix}`,
    },
  }
  const storyboardSubmitted = await apiRequest('/api/v1/jobs', appKey, { method: 'POST', headers: jsonHeaders(), body: JSON.stringify(storyboardPayload) })
  invariant(storyboardSubmitted.response.status === 201 && storyboardSubmitted.body.jobId, storyboardSubmitted.body.message || `Storyboard submission returned ${storyboardSubmitted.response.status}`)
  const storyboardDuplicate = await apiRequest('/api/v1/jobs', appKey, { method: 'POST', headers: jsonHeaders(), body: JSON.stringify(storyboardPayload) })
  invariant(storyboardDuplicate.response.status === 200 && storyboardDuplicate.body.jobId === storyboardSubmitted.body.jobId && storyboardDuplicate.body.deduplicated === true, 'Storyboard idempotency failed')
  const storyboardJob = await pollJob(apiRequest, invariant, delay, appKey, storyboardSubmitted.body.jobId)
  invariant(storyboardJob.status === 'completed' && storyboardJob.provider === 'internal' && storyboardJob.model === 'planner-storyboard-v1' && storyboardJob.artifactId, storyboardJob.error || 'Storyboard job did not complete internally')
  invariant(storyboardJob.executionEvidence?.routeType === 'internal_planner', 'Storyboard execution evidence was misclassified')
  invariant(storyboardJob.executionEvidence?.outputValidation?.providerCallsStarted === false, 'Storyboard fixture falsely claimed provider execution')
  const storyboardBytes = await downloadArtifact(invariant, appKey, storyboardJob.artifactId, 'application/json')
  const storyboardArtifact = JSON.parse(storyboardBytes.toString('utf8'))
  invariant(storyboardArtifact.providerCallsStarted === false && storyboardArtifact.plan?.storyboard?.scenes?.length === 6, 'Storyboard artifact did not contain the validated six-scene plan')
  const storyboardDenied = await apiRequest(`/api/v1/jobs/${encodeURIComponent(storyboardSubmitted.body.jobId)}`, otherKey)
  invariant(storyboardDenied.response.status === 404, 'Cross-app storyboard Job access was not denied')

  const subtitlePayload = {
    capability: 'subtitle_generation',
    prompt: 'Create a validated SRT subtitle artifact from timed campaign scenes.',
    input: {
      format: 'srt',
      title: 'Fixture campaign subtitles',
      language: 'en-ZA',
      scenes: [
        { sceneNumber: 1, subtitleText: 'Every horse deserves a complete record.', durationSeconds: 5 },
        { sceneNumber: 2, subtitleText: 'Manage health, training and performance in one place.', durationSeconds: 5 },
        { sceneNumber: 3, subtitleText: 'Create your horse profile today.', durationSeconds: 5 },
      ],
      idempotencyKey: `subtitles-${suffix}`,
    },
  }
  const subtitleSubmitted = await apiRequest('/api/v1/jobs', appKey, { method: 'POST', headers: jsonHeaders(), body: JSON.stringify(subtitlePayload) })
  invariant(subtitleSubmitted.response.status === 201 && subtitleSubmitted.body.jobId, subtitleSubmitted.body.message || `Subtitle submission returned ${subtitleSubmitted.response.status}`)
  const subtitleDuplicate = await apiRequest('/api/v1/jobs', appKey, { method: 'POST', headers: jsonHeaders(), body: JSON.stringify(subtitlePayload) })
  invariant(subtitleDuplicate.response.status === 200 && subtitleDuplicate.body.jobId === subtitleSubmitted.body.jobId && subtitleDuplicate.body.deduplicated === true, 'Subtitle idempotency failed')
  const subtitleJob = await pollJob(apiRequest, invariant, delay, appKey, subtitleSubmitted.body.jobId)
  invariant(subtitleJob.status === 'completed' && subtitleJob.provider === 'internal' && subtitleJob.model === 'formatter-subtitle-v1' && subtitleJob.artifactId, subtitleJob.error || 'Subtitle job did not complete internally')
  invariant(subtitleJob.executionEvidence?.routeType === 'internal_formatter', 'Subtitle execution evidence was misclassified')
  invariant(subtitleJob.executionEvidence?.outputValidation?.segmentCount === 3 && subtitleJob.executionEvidence?.outputValidation?.nonOverlapping === true, 'Subtitle timing validation was missing')
  const subtitleBytes = await downloadArtifact(invariant, appKey, subtitleJob.artifactId, 'application/x-subrip')
  const subtitleText = subtitleBytes.toString('utf8')
  invariant(subtitleText.includes('00:00:00,000 --> 00:00:05,000') && subtitleText.includes('Create your horse profile today.'), 'Subtitle artifact content was invalid')
  const subtitleDenied = await apiRequest(`/api/v1/artifacts/${encodeURIComponent(subtitleJob.artifactId)}/file`, otherKey)
  invariant(subtitleDenied.response.status === 404, 'Cross-app subtitle Artifact access was not denied')

  console.log(`STORYBOARD_SUBTITLE_RELEASE_FIXTURE=PASS storyboardJob=${storyboardSubmitted.body.jobId} subtitleJob=${subtitleSubmitted.body.jobId}`)
}
