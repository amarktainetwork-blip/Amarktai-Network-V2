function jsonHeaders() { return { 'Content-Type': 'application/json' } }

async function createApp(apiRequest, invariant, adminToken, appSlug, appName, capabilities) {
  const created = await apiRequest('/api/admin/app-connections', adminToken, {
    method: 'POST', headers: jsonHeaders(), body: JSON.stringify({
      appSlug, appName, appType: 'release-fixture', environment: 'test', onboardingState: 'active',
      allowedCapabilities: capabilities, dailyBudgetCents: 100000, monthlyBudgetCents: 1000000,
      requestsPerMinute: 1000, requestsPerDay: 10000, artifactRead: true, artifactWrite: true,
      memoryRead: false, memoryWrite: false, routingMode: 'automatic', qualityTarget: 'premium', spendStrategy: 'quality',
    }),
  })
  invariant(created.response.status === 201, created.body.message || `Social-ad app creation returned ${created.response.status}`)
  const key = await apiRequest(`/api/admin/app-connections/${encodeURIComponent(appSlug)}/keys`, adminToken, {
    method: 'POST', headers: jsonHeaders(), body: JSON.stringify({ label: 'social-ad-release-fixture' }),
  })
  invariant(key.response.status === 201 && typeof key.body.key === 'string', key.body.message || 'Social-ad app key creation failed')
  return key.body.key
}

async function grant(apiRequest, invariant, adminToken, appSlug, capability) {
  const result = await apiRequest(`/api/admin/app-grants/${encodeURIComponent(appSlug)}/${encodeURIComponent(capability)}`, adminToken, {
    method: 'PUT', headers: jsonHeaders(), body: JSON.stringify({
      enabled: true, qualityFloor: 'balanced', budgetPolicy: 'balanced', maxCostPerRequest: 0, maxCostPerWorkflow: 0,
      latencyPreference: 'medium', allowFallback: true, maxFallbackAttempts: 3, liveProofRequired: false,
      approvalRequired: false, artifactRead: true, artifactWrite: true, memoryRead: false, memoryWrite: false,
      ragNamespaces: [], policyProfile: 'release_fixture', adultPermission: false, dataRetentionPolicy: 'fixture_ephemeral',
      passthroughModelAllowed: false, providerResidencyConstraints: [], routingMode: 'automatic', qualityTarget: 'premium',
      spendStrategy: 'quality', fixedRoute: null, preferredPool: [], selectableAllowlist: [], restrictedPool: [], workflowStepOverrides: {},
    }),
  })
  invariant(result.response.ok && result.body.enabled === true, result.body.message || `Social-ad grant ${capability} failed`)
}

async function pollJob(apiRequest, invariant, delay, appKey, jobId, timeoutMs = 120000) {
  const deadline = Date.now() + timeoutMs
  while (Date.now() < deadline) {
    const result = await apiRequest(`/api/v1/jobs/${encodeURIComponent(jobId)}`, appKey)
    invariant(result.response.ok, result.body.message || `Job ${jobId} returned ${result.response.status}`)
    if (['completed', 'failed', 'cancelled'].includes(result.body.status)) return result.body
    await delay(400)
  }
  throw new Error(`Fixture job ${jobId} timed out`)
}

async function createImage(apiRequest, invariant, delay, appKey, label) {
  const submitted = await apiRequest('/api/v1/jobs', appKey, {
    method: 'POST', headers: jsonHeaders(), body: JSON.stringify({
      capability: 'image_generation', prompt: `Deterministic approved product source: ${label}`,
      input: { width: 320, height: 180, steps: 4 }, metadata: { fixtureAssetRole: label },
    }),
  })
  invariant(submitted.response.status === 202 && submitted.body.jobId, submitted.body.message || `Image ${label} submission failed`)
  const job = await pollJob(apiRequest, invariant, delay, appKey, submitted.body.jobId)
  invariant(job.status === 'completed' && job.artifactId, job.error || `Image ${label} did not complete`)
  return job.artifactId
}

async function pollExecution(apiRequest, invariant, delay, appKey, executionId, wanted, timeoutMs = 240000) {
  const deadline = Date.now() + timeoutMs
  while (Date.now() < deadline) {
    const result = await apiRequest(`/api/v1/social-ad-video/executions/${encodeURIComponent(executionId)}`, appKey)
    invariant(result.response.ok, result.body.message || `Social-ad execution returned ${result.response.status}`)
    if (wanted.includes(result.body.phase) || wanted.includes(result.body.status)) return result.body
    if (['failed', 'cancelled'].includes(result.body.status)) throw new Error(result.body.error || `Social-ad execution became ${result.body.status}`)
    await delay(500)
  }
  throw new Error(`Social-ad execution ${executionId} timed out waiting for ${wanted.join(', ')}`)
}

function requestBody({ brandProfileId, campaign, productArtifactId, logoArtifactId, idempotencyKey }) {
  return {
    request: {
      brandProfileId, campaignId: campaign.campaignId, mode: 'product_breakout',
      prompt: 'Present the approved product inside a social post card, then create a visible controlled frame-boundary breakout while preserving product identity and geometry.',
      objective: campaign.objective, audienceId: campaign.audienceIds[0], offeringId: campaign.offeringIds[0],
      productArtifactId, logoArtifactIds: [logoArtifactId], callToAction: campaign.callToAction, sourceArtifactIds: [],
      aspectRatios: ['16:9', '9:16', '1:1'], durationSeconds: 5, candidateCount: 2,
      includeCaptions: true, includeSubtitleFiles: true, includeThumbnail: true, includeSocialCopy: true,
      qualityProfile: 'premium', approvalRequired: true, maxCredits: 100,
    },
    campaign,
    ...(idempotencyKey ? { idempotencyKey } : {}),
  }
}

export async function proveSocialAdReleaseFixture({ apiRequest, invariant, delay, adminToken }) {
  const suffix = `${Date.now().toString(36)}-${Math.random().toString(36).slice(2, 7)}`
  const appSlug = `social-ad-fixture-${suffix}`
  const otherSlug = `social-ad-isolation-${suffix}`
  const capabilities = ['social_content_generation', 'image_generation', 'image_to_video', 'video_understanding', 'structured_output']
  const appKey = await createApp(apiRequest, invariant, adminToken, appSlug, 'A Product Breakout Release Fixture', capabilities)
  const otherKey = await createApp(apiRequest, invariant, adminToken, otherSlug, 'Z Product Breakout Isolation Fixture', ['image_generation'])
  for (const capability of capabilities) await grant(apiRequest, invariant, adminToken, appSlug, capability)
  await grant(apiRequest, invariant, adminToken, otherSlug, 'image_generation')

  const productArtifactId = await createImage(apiRequest, invariant, delay, appKey, 'approved-product')
  const logoArtifactId = await createImage(apiRequest, invariant, delay, appKey, 'approved-logo')
  const unapprovedArtifactId = await createImage(apiRequest, invariant, delay, appKey, 'unapproved-product')
  const unverifiedArtifactId = await createImage(apiRequest, invariant, delay, appKey, 'rights-unverified-product')
  const crossAppArtifactId = await createImage(apiRequest, invariant, delay, otherKey, 'cross-app-product')
  const now = new Date().toISOString()
  const brandProfileId = `brand-product-breakout-${suffix}`
  const offeringId = `offering-${suffix}`
  const evidenceId = `source-${suffix}`
  const profile = {
    version: 1, brandProfileId, appSlug, status: 'verified', displayName: 'Fixture Product Brand', legalName: null,
    website: 'https://fixture.invalid/product-brand', summary: 'An evidence-backed product brand for the release fixture.', mission: null, positioning: null,
    differentiators: ['Inspectable governed production'],
    audiences: [{ audienceId: 'launch-buyers', name: 'Launch buyers', description: 'Buyers evaluating the approved product.', pains: [], desiredOutcomes: [] }],
    voice: { tones: ['credible', 'clear'], styleRules: ['Use plain language'], approvedPhrases: [], forbiddenPhrases: ['Guaranteed results'], locale: 'en-ZA' },
    visual: {
      palette: [{ name: 'Fixture navy', hex: '#172554', role: 'primary' }], typography: [], imageStyleRules: ['Clean product focus'], videoStyleRules: ['Controlled motion and stable geometry'],
      assets: [
        { artifactId: productArtifactId, role: 'product', approved: true, rightsVerified: true, sourceEvidenceIds: [evidenceId], offeringIds: [offeringId] },
        { artifactId: logoArtifactId, role: 'primary_logo', approved: true, rightsVerified: true, sourceEvidenceIds: [evidenceId], offeringIds: [] },
        { artifactId: unapprovedArtifactId, role: 'product', approved: false, rightsVerified: true, sourceEvidenceIds: [evidenceId], offeringIds: [offeringId] },
        { artifactId: unverifiedArtifactId, role: 'product', approved: true, rightsVerified: false, sourceEvidenceIds: [evidenceId], offeringIds: [offeringId] },
        { artifactId: crossAppArtifactId, role: 'product', approved: true, rightsVerified: true, sourceEvidenceIds: [evidenceId], offeringIds: [offeringId] },
      ],
    },
    offerings: [{ offeringId, name: 'Fixture Launch Product', description: 'The approved product used by the governed breakout fixture.', url: null, priceText: null, approvedClaims: ['Built for inspectable production'], requiredDisclaimers: ['Fixture demonstration'] }],
    approvedClaims: ['Built for inspectable production'], prohibitedClaims: ['Guaranteed results'],
    sourceEvidence: [{ sourceId: evidenceId, sourceType: 'asset', url: null, title: 'Authorised fixture product evidence', capturedAt: now, contentHash: `sha256:${'a'.repeat(64)}`, rightsBasis: 'owned', confidence: 0.99 }],
    overallConfidence: 0.99, rightsDeclaredBy: 'fixture-admin', rightsDeclaredAt: now, createdAt: now, updatedAt: now,
  }
  const createdProfile = await apiRequest('/api/v1/brand-profiles', appKey, { method: 'POST', headers: jsonHeaders(), body: JSON.stringify(profile) })
  invariant(createdProfile.response.status === 201, createdProfile.body.message || 'Fixture Brand Profile creation failed')

  const campaign = {
    campaignId: `campaign-${suffix}`, brandProfileId, title: 'Product breakout release campaign',
    objective: 'Launch the approved product with a clear and credible social story.', audienceIds: ['launch-buyers'], offeringIds: [offeringId],
    channels: ['facebook', 'instagram', 'tiktok', 'youtube', 'linkedin', 'x'], callToAction: 'Learn more', locale: 'en-ZA',
    constraints: [], sourceArtifactIds: [productArtifactId], qualityProfile: 'premium', approvalRequired: true, maxCredits: 100, dueAt: null,
  }
  const createdCampaign = await apiRequest('/api/v1/marketing-campaigns', appKey, { method: 'POST', headers: jsonHeaders(), body: JSON.stringify(campaign) })
  invariant(createdCampaign.response.status === 201, createdCampaign.body.message || 'Fixture campaign creation failed')

  const valid = requestBody({ brandProfileId, campaign, productArtifactId, logoArtifactId })
  const missing = structuredClone(valid); missing.request.productArtifactId = null
  const missingResult = await apiRequest('/api/v1/social-ad-video/plan', appKey, { method: 'POST', headers: jsonHeaders(), body: JSON.stringify(missing) })
  invariant(missingResult.response.status === 409 && missingResult.body.code === 'SOCIAL_AD_PRODUCT_ASSET_REQUIRED', 'Missing product asset was not rejected')
  for (const [artifactId, expected] of [[unapprovedArtifactId, 'SOCIAL_AD_PRODUCT_ASSET_NOT_APPROVED'], [unverifiedArtifactId, 'SOCIAL_AD_PRODUCT_ASSET_RIGHTS_UNVERIFIED'], [crossAppArtifactId, 'SOCIAL_AD_PRODUCT_ASSET_CROSS_APP']]) {
    const denied = structuredClone(valid); denied.request.productArtifactId = artifactId
    const result = await apiRequest('/api/v1/social-ad-video/plan', appKey, { method: 'POST', headers: jsonHeaders(), body: JSON.stringify(denied) })
    invariant(result.response.status === 409 && result.body.code === expected, `${expected} was not enforced`)
  }
  const override = await apiRequest('/api/v1/social-ad-video/plan', appKey, { method: 'POST', headers: jsonHeaders(), body: JSON.stringify({ ...valid, provider: 'genx' }) })
  invariant(override.response.status === 400 && override.body.code === 'SOCIAL_AD_EXECUTION_AUTHORITY_FORBIDDEN', 'Provider override was not rejected')

  const planned = await apiRequest('/api/v1/social-ad-video/plan', appKey, { method: 'POST', headers: jsonHeaders(), body: JSON.stringify(valid) })
  invariant(planned.response.ok && planned.body.plan?.creativeContract?.productSourceArtifactId === productArtifactId, planned.body.message || 'Product-breakout planning failed')
  invariant(planned.body.plan.creativeContract.breakoutRequirement === 'product_visibly_crosses_frame_boundary', 'Creative contract lost breakout requirement')
  invariant(JSON.stringify(planned.body.plan).includes('provider') === false && JSON.stringify(planned.body.plan).includes('model') === false, 'Plan exposed execution authority')

  const idempotencyKey = `social-ad-fixture-${suffix}`
  const executionPayload = requestBody({ brandProfileId, campaign, productArtifactId, logoArtifactId, idempotencyKey })
  const submitted = await apiRequest('/api/v1/social-ad-video/executions', appKey, { method: 'POST', headers: jsonHeaders(), body: JSON.stringify(executionPayload) })
  invariant(submitted.response.status === 202 && submitted.body.executionId, submitted.body.message || 'Product-breakout execution did not start')
  const duplicate = await apiRequest('/api/v1/social-ad-video/executions', appKey, { method: 'POST', headers: jsonHeaders(), body: JSON.stringify(executionPayload) })
  invariant(duplicate.response.status === 202 && duplicate.body.deduplicated === true && duplicate.body.executionId === submitted.body.executionId, 'Duplicate execution was not idempotent')

  let status = await pollExecution(apiRequest, invariant, delay, appKey, submitted.body.executionId, ['human_approval_pending'])
  invariant(status.generation.candidates.length === 2 && status.generation.candidates.every((item) => item.status === 'completed' && item.artifactId), 'Candidate artifacts are incomplete')
  invariant(status.generation.candidates.every((item) => item.sourceProductArtifactId === productArtifactId && item.creativeContractVersion === 'product-breakout-v1'), 'Candidate product lineage or creative contract evidence is incomplete')
  invariant(status.generation.candidates.every((item) => item.providerEvidence?.provider && item.providerEvidence?.model && item.executionEvidence?.evidenceSource === 'local_fixture' && item.executionEvidence?.liveProviderProof === false), 'Candidate provider evidence was not persisted truthfully')
  invariant(status.generation.candidates.every((item) => item.usageEvidence && Array.isArray(item.retryHistory)), 'Candidate usage or retry evidence is incomplete')
  invariant(status.quality.ranking.length === 2 && status.quality.reports.length === 2, 'Quality ranking or reports are incomplete')
  invariant(JSON.stringify(status.quality.reports).includes('humanReviewRequired') && JSON.stringify(status.quality.reports).includes('ffprobe'), 'Quality reports did not distinguish measured and human-review evidence')
  invariant(status.quality.selectedCandidateArtifactId, 'Network winner was not selected')

  const revision = await apiRequest(`/api/v1/social-ad-video/executions/${encodeURIComponent(submitted.body.executionId)}/approval`, appKey, { method: 'POST', headers: jsonHeaders(), body: JSON.stringify({ decision: 'revision_requested', notes: 'Generate one governed revision candidate.' }) })
  invariant(revision.response.ok && revision.body.phase === 'revision_required', 'Creative revision request was not persisted')
  const regenerated = await apiRequest(`/api/v1/social-ad-video/executions/${encodeURIComponent(submitted.body.executionId)}/regenerate`, appKey, { method: 'POST', headers: jsonHeaders(), body: JSON.stringify({ notes: 'Strengthen the visible frame-boundary transition.' }) })
  invariant(regenerated.response.status === 202 && regenerated.body.regeneratedFromCandidateJobId, regenerated.body.message || 'Revision regeneration did not queue')
  status = await pollExecution(apiRequest, invariant, delay, appKey, submitted.body.executionId, ['human_approval_pending'])
  invariant(status.generation.candidates.length === 3 && status.quality.ranking.length === 3, 'Regenerated candidate did not re-enter quality selection')

  const earlyAssembly = await apiRequest(`/api/v1/social-ad-video/executions/${encodeURIComponent(submitted.body.executionId)}/assemble`, appKey, { method: 'POST' })
  invariant(earlyAssembly.response.status === 409 && earlyAssembly.body.code === 'SOCIAL_AD_ASSEMBLY_NOT_AUTHORISED', 'Assembly ran before creative approval')
  const approved = await apiRequest(`/api/v1/social-ad-video/executions/${encodeURIComponent(submitted.body.executionId)}/approval`, appKey, { method: 'POST', headers: jsonHeaders(), body: JSON.stringify({ decision: 'approved', notes: 'Fixture creative approval.' }) })
  invariant(approved.response.ok && approved.body.phase === 'assembly_pending', approved.body.message || 'Creative approval failed')
  const assembly = await apiRequest(`/api/v1/social-ad-video/executions/${encodeURIComponent(submitted.body.executionId)}/assemble`, appKey, { method: 'POST' })
  invariant(assembly.response.status === 202, assembly.body.message || 'Assembly did not queue')
  status = await pollExecution(apiRequest, invariant, delay, appKey, submitted.body.executionId, ['final_approval_pending'], 360000)
  invariant(status.assembly.deliveryVariants.length === 3, 'Final pack did not contain three video variants')
  invariant(status.assembly.masterVideoArtifactId, 'Final pack did not contain a validated master video')
  invariant(status.assembly.subtitleArtifactIds.length === 2 && status.assembly.thumbnailArtifactId && status.assembly.reportArtifactId && status.assembly.finalQualityReportArtifactId, 'Final delivery documents are incomplete')
  invariant(status.socialCopy.artifactId, 'Selected social-copy artifact is missing')

  const preFinal = await apiRequest(`/api/v1/social-ad-video/executions/${encodeURIComponent(submitted.body.executionId)}`, appKey)
  invariant(preFinal.body.status !== 'completed', 'Execution completed before final approval')
  const finalApproval = await apiRequest(`/api/v1/social-ad-video/executions/${encodeURIComponent(submitted.body.executionId)}/final-approval`, appKey, { method: 'POST', headers: jsonHeaders(), body: JSON.stringify({ decision: 'approved', notes: 'Fixture final-pack approval.' }) })
  invariant(finalApproval.response.ok && finalApproval.body.status === 'completed', finalApproval.body.message || 'Final approval failed')
  const artifacts = [
    finalApproval.body.artifacts.masterVideoArtifactId,
    ...finalApproval.body.artifacts.deliveryVariants.map((item) => item.artifactId),
    ...finalApproval.body.artifacts.subtitleArtifactIds,
    finalApproval.body.artifacts.thumbnailArtifactId,
    finalApproval.body.artifacts.copyArtifactId,
    finalApproval.body.artifacts.reportArtifactId,
    finalApproval.body.artifacts.finalQualityReportArtifactId,
  ].filter(Boolean)
  for (const artifactId of artifacts) {
    const preview = await apiRequest(`/api/v1/artifacts/${encodeURIComponent(artifactId)}/file`, appKey)
    invariant(preview.response.ok, `Authorised preview failed for ${artifactId}`)
    const download = await fetch(`http://127.0.0.1:3211/api/v1/artifacts/${encodeURIComponent(artifactId)}/file?download=1`, { headers: { Authorization: `Bearer ${appKey}` } })
    invariant(download.ok && (download.headers.get('content-disposition') || '').startsWith('attachment;'), `Authorised download failed for ${artifactId}`)
  }
  const isolated = await apiRequest(`/api/v1/artifacts/${encodeURIComponent(finalApproval.body.artifacts.primaryVideoArtifactId)}/file`, otherKey)
  invariant(!isolated.response.ok, 'Cross-app final artifact access was allowed')

  const resumed = await apiRequest(`/api/v1/social-ad-video/executions/${encodeURIComponent(submitted.body.executionId)}/resume`, appKey, { method: 'POST' })
  invariant(resumed.response.ok && resumed.body.deduplicated === true && resumed.body.queued.length === 0, 'Completed resume duplicated work')

  const cancelPayload = requestBody({ brandProfileId, campaign, productArtifactId, logoArtifactId, idempotencyKey: `cancel-${idempotencyKey}` })
  const cancelRun = await apiRequest('/api/v1/social-ad-video/executions', appKey, { method: 'POST', headers: jsonHeaders(), body: JSON.stringify(cancelPayload) })
  invariant(cancelRun.response.status === 202, 'Cancellation proof execution did not start')
  const cancelled = await apiRequest(`/api/v1/social-ad-video/executions/${encodeURIComponent(cancelRun.body.executionId)}/cancel`, appKey, { method: 'POST' })
  invariant(cancelled.response.ok && cancelled.body.status === 'cancelled', 'Cancellation was not persisted')
  await delay(1000)
  const cancelledStatus = await apiRequest(`/api/v1/social-ad-video/executions/${encodeURIComponent(cancelRun.body.executionId)}`, appKey)
  invariant(cancelledStatus.body.status === 'cancelled', 'Late worker result reactivated a cancelled workflow')

  const truth = await apiRequest('/api/admin/truth', adminToken)
  const release = truth.body.truth?.releaseCandidateCapabilities ?? []
  for (const capability of ['rag_ingest', 'rag_search', 'research', 'social_content_generation']) {
    invariant(release.includes(capability), `Canonical workflow truth omitted ${capability}`)
    const workflow = truth.body.truth?.durableWorkflows?.find((item) => item.capability === capability)
    invariant(workflow?.implementationStatus === 'IMPLEMENTED_DURABLE' && workflow.fixtureProof, `Canonical durable workflow evidence omitted ${capability}`)
  }
  for (const capability of ['brand_scrape', 'document_ingest', 'campaign_generation']) {
    const blocked = truth.body.truth?.durableWorkflowBlockers?.find((item) => item.capability === capability)
    invariant(blocked?.implementationStatus === 'NOT_IMPLEMENTED' && blocked.blocker, `Canonical workflow blocker omitted ${capability}`)
  }

  console.log(`SOCIAL_AD_FIXTURE_APP=${appSlug}`)
  console.log(`SOCIAL_AD_FIXTURE_EXECUTION=${submitted.body.executionId}`)
  console.log('SOCIAL_AD_PRODUCT_ASSET_DENIALS=PASS')
  console.log('SOCIAL_AD_CANDIDATE_QUALITY=PASS')
  console.log('SOCIAL_AD_APPROVAL_ASSEMBLY=PASS')
  console.log('SOCIAL_AD_ARTIFACT_PACK=PASS')
  console.log('SOCIAL_AD_IDEMPOTENCY_CANCELLATION=PASS')
  console.log('SOCIAL_AD_WORKFLOW_TRUTH=PASS')
}
