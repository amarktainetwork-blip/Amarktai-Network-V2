function jsonHeaders() { return { 'Content-Type': 'application/json' } }

async function createApp(apiRequest, invariant, adminToken, appSlug, capabilities) {
  const created = await apiRequest('/api/admin/app-connections', adminToken, { method: 'POST', headers: jsonHeaders(), body: JSON.stringify({ appSlug, appName: `Specialist fixture ${appSlug}`, appType: 'release-fixture', environment: 'test', onboardingState: 'active', allowedCapabilities: capabilities, dailyBudgetCents: 100000, monthlyBudgetCents: 1000000, requestsPerMinute: 1000, requestsPerDay: 10000, artifactRead: true, artifactWrite: true, memoryRead: false, memoryWrite: false, routingMode: 'automatic', qualityTarget: 'premium', spendStrategy: 'quality' }) })
  invariant(created.response.status === 201, created.body.message || `Fixture app creation returned ${created.response.status}`)
  const key = await apiRequest(`/api/admin/app-connections/${encodeURIComponent(appSlug)}/keys`, adminToken, { method: 'POST', headers: jsonHeaders(), body: JSON.stringify({ label: 'specialist-workflow-release-fixture' }) })
  invariant(key.response.status === 201 && key.body.key, key.body.message || 'Fixture app key creation failed')
  for (const capability of capabilities) {
    const grant = await apiRequest(`/api/admin/app-grants/${encodeURIComponent(appSlug)}/${encodeURIComponent(capability)}`, adminToken, { method: 'PUT', headers: jsonHeaders(), body: JSON.stringify({ enabled: true, qualityFloor: 'balanced', budgetPolicy: 'balanced', maxCostPerRequest: 0, maxCostPerWorkflow: 0, latencyPreference: 'medium', allowFallback: true, maxFallbackAttempts: 3, liveProofRequired: false, approvalRequired: capability === 'brand_scrape' || capability === 'campaign_generation', artifactRead: true, artifactWrite: true, memoryRead: false, memoryWrite: false, ragNamespaces: ['*'], policyProfile: 'release_fixture', adultPermission: false, dataRetentionPolicy: 'fixture_ephemeral', passthroughModelAllowed: false, providerResidencyConstraints: [], routingMode: 'automatic', qualityTarget: 'premium', spendStrategy: 'quality', fixedRoute: null, preferredPool: [], selectableAllowlist: [], restrictedPool: [], workflowStepOverrides: {} }) })
    invariant(grant.response.ok && grant.body.enabled === true, grant.body.message || `Fixture grant ${capability} failed`)
  }
  return key.body.key
}

async function pollJob(apiRequest, invariant, delay, appKey, jobId, timeoutMs = 180000) {
  const deadline = Date.now() + timeoutMs
  while (Date.now() < deadline) {
    const result = await apiRequest(`/api/v1/jobs/${encodeURIComponent(jobId)}`, appKey)
    invariant(result.response.ok, result.body.message || `Job ${jobId} returned ${result.response.status}`)
    if (['completed', 'failed', 'cancelled'].includes(result.body.status)) return result.body
    await delay(400)
  }
  throw new Error(`Job ${jobId} timed out`)
}

async function pollWorkflow(apiRequest, invariant, delay, appKey, path, executionId, wanted, timeoutMs = 240000) {
  const deadline = Date.now() + timeoutMs
  while (Date.now() < deadline) {
    const result = await apiRequest(`/api/v1/${path}/executions/${encodeURIComponent(executionId)}`, appKey)
    invariant(result.response.ok, result.body.message || `${path} status returned ${result.response.status}`)
    if (wanted.includes(result.body.phase) || wanted.includes(result.body.status)) return result.body
    if (['failed', 'cancelled'].includes(result.body.status)) throw new Error(result.body.error || `${path} became ${result.body.status}`)
    await delay(500)
  }
  throw new Error(`${path} ${executionId} timed out waiting for ${wanted.join(', ')}`)
}

async function createMedia(apiRequest, invariant, delay, appKey, capability, label) {
  const submitted = await apiRequest('/api/v1/jobs', appKey, { method: 'POST', headers: jsonHeaders(), body: JSON.stringify({ capability, prompt: `Deterministic specialist source ${label}`, input: capability === 'image_generation' ? { width: 320, height: 180, steps: 4 } : { duration: 2, aspectRatio: '16:9' }, metadata: { fixtureSourceRole: label } }) })
  invariant(submitted.response.status === 201 && submitted.body.jobId, submitted.body.message || `${capability} submission failed`)
  const job = await pollJob(apiRequest, invariant, delay, appKey, submitted.body.jobId)
  invariant(job.status === 'completed' && job.artifactId, job.error || `${capability} source failed`)
  return job.artifactId
}

async function uploadDocument(apiRequest, invariant, appKey, title, bytes, declaredMimeType) {
  const uploaded = await apiRequest('/api/v1/source-artifacts', appKey, { method: 'POST', headers: jsonHeaders(), body: JSON.stringify({ title, kind: 'document', declaredMimeType, dataBase64: Buffer.from(bytes).toString('base64') }) })
  invariant(uploaded.response.status === 201 && uploaded.body.artifactId, uploaded.body.message || 'Document upload failed')
  return uploaded.body.artifactId
}

function createTextPdf(text) {
  const escaped = text.replaceAll('\\', '\\\\').replaceAll('(', '\\(').replaceAll(')', '\\)')
  const content = `BT /F1 11 Tf 50 740 Td (${escaped}) Tj ET`
  const objects = [
    '<< /Type /Catalog /Pages 2 0 R >>',
    '<< /Type /Pages /Kids [3 0 R] /Count 1 >>',
    '<< /Type /Page /Parent 2 0 R /MediaBox [0 0 612 792] /Resources << /Font << /F1 5 0 R >> >> /Contents 4 0 R >>',
    `<< /Length ${Buffer.byteLength(content)} >>\nstream\n${content}\nendstream`,
    '<< /Type /Font /Subtype /Type1 /BaseFont /Helvetica >>',
  ]
  let pdf = '%PDF-1.4\n'
  const offsets = [0]
  for (let index = 0; index < objects.length; index += 1) {
    offsets.push(Buffer.byteLength(pdf))
    pdf += `${index + 1} 0 obj\n${objects[index]}\nendobj\n`
  }
  const xrefOffset = Buffer.byteLength(pdf)
  pdf += `xref\n0 ${objects.length + 1}\n0000000000 65535 f \n`
  for (const offset of offsets.slice(1)) pdf += `${String(offset).padStart(10, '0')} 00000 n \n`
  pdf += `trailer\n<< /Size ${objects.length + 1} /Root 1 0 R >>\nstartxref\n${xrefOffset}\n%%EOF\n`
  return Buffer.from(pdf, 'latin1')
}

function collectArtifactIds(value, output = new Set()) {
  if (!value || typeof value !== 'object') return output
  if (typeof value.artifactId === 'string') output.add(value.artifactId)
  for (const child of Object.values(value)) if (child && typeof child === 'object') collectArtifactIds(child, output)
  return output
}

export async function proveSpecialistWorkflowReleaseFixture({ apiRequest, invariant, delay, adminToken, queueControl }) {
  const suffix = `${Date.now().toString(36)}-${Math.random().toString(36).slice(2, 7)}`
  const appSlug = `specialist-fixture-${suffix}`
  const otherSlug = `specialist-isolation-${suffix}`
  const specialist = ['depth_estimation', 'keypoint_detection', 'mask_generation', 'zero_shot_object_detection', 'visual_document_retrieval', 'video_classification']
  const existingVision = ['image_classification', 'visual_question_answering', 'document_qa', 'ocr', 'video_understanding']
  const capabilities = [...specialist, ...existingVision, 'image_generation', 'image_upscale', 'video_generation', 'brand_scrape', 'document_ingest', 'campaign_generation', 'research', 'structured_output', 'embeddings', 'rag_search', 'social_content_generation']
  const appKey = await createApp(apiRequest, invariant, adminToken, appSlug, capabilities)
  const otherKey = await createApp(apiRequest, invariant, adminToken, otherSlug, ['image_generation', 'document_ingest', 'embeddings', 'ocr'])

  const imageArtifactId = await createMedia(apiRequest, invariant, delay, appKey, 'image_generation', 'authorised-image')
  const videoArtifactId = await createMedia(apiRequest, invariant, delay, appKey, 'video_generation', 'authorised-video')
  const crossAppImageId = await createMedia(apiRequest, invariant, delay, otherKey, 'image_generation', 'cross-app-image')
  const documentArtifactId = await uploadDocument(apiRequest, invariant, appKey, 'Visual fixture document.pdf', createTextPdf('Page one contains cited specialist vision and durable workflow evidence. Brand colours are navy and cyan. The approved offering is inspectable automation.'), 'application/pdf')
  const crossAppDocumentId = await uploadDocument(apiRequest, invariant, otherKey, 'Cross app document.txt', Buffer.from('This document must never be visible to the other app.'), 'text/plain')

  const upscaleInput = { sourceImageArtifactId: imageArtifactId, scaleFactor: 2, outputFormat: 'png', idempotencyKey: `upscale-${suffix}`, maxCredits: 100 }
  const upscaleSubmitted = await apiRequest('/api/v1/jobs', appKey, { method: 'POST', headers: jsonHeaders(), body: JSON.stringify({ capability: 'image_upscale', prompt: 'Governed 2x Lanczos upscale', input: upscaleInput }) })
  invariant(upscaleSubmitted.response.status === 201 && upscaleSubmitted.body.jobId, upscaleSubmitted.body.message || 'image_upscale did not queue')
  const upscaleJob = await pollJob(apiRequest, invariant, delay, appKey, upscaleSubmitted.body.jobId)
  invariant(upscaleJob.status === 'completed' && upscaleJob.artifactId, upscaleJob.error || 'image_upscale failed')
  const upscaleOutput = JSON.parse(upscaleJob.output)
  invariant(upscaleOutput.width === 640 && upscaleOutput.height === 360 && upscaleOutput.scaleFactor === 2, 'image_upscale dimensions are incorrect')
  invariant(upscaleOutput.evidence?.evidenceSource === 'internal_ffmpeg' && upscaleOutput.evidence?.liveProviderProof === false && upscaleOutput.evidence?.filter === 'lanczos', 'image_upscale evidence is incorrect')
  const upscaleDownload = await apiRequest(`/api/v1/artifacts/${encodeURIComponent(upscaleJob.artifactId)}/file?download=1`, appKey)
  invariant(upscaleDownload.response.ok, 'image_upscale artifact was not downloadable')
  const crossUpscaleSubmitted = await apiRequest('/api/v1/jobs', appKey, { method: 'POST', headers: jsonHeaders(), body: JSON.stringify({ capability: 'image_upscale', prompt: 'Cross-App image denial', input: { ...upscaleInput, sourceImageArtifactId: crossAppImageId, idempotencyKey: `upscale-cross-${suffix}` } }) })
  invariant(crossUpscaleSubmitted.response.status === 201 && crossUpscaleSubmitted.body.jobId, 'Cross-App image_upscale request did not enter the governed worker path')
  const crossUpscaleJob = await pollJob(apiRequest, invariant, delay, appKey, crossUpscaleSubmitted.body.jobId)
  invariant(crossUpscaleJob.status === 'failed' && /authorised source image artifact was not found/i.test(crossUpscaleJob.error || ''), 'Cross-App image_upscale did not fail closed')

  const requests = {
    depth_estimation: { sourceImageArtifactId: imageArtifactId, outputMode: 'relative', normalize: true, visualization: true, maxCredits: 100, idempotencyKey: `depth-${suffix}` },
    keypoint_detection: { sourceImageArtifactId: imageArtifactId, domain: 'generic-object-centre', confidenceThreshold: 0.5, overlay: true, maxCredits: 100, idempotencyKey: `keypoints-${suffix}` },
    mask_generation: { sourceImageArtifactId: imageArtifactId, guidance: { type: 'prompt', prompt: 'foreground subject' }, outputFormat: 'binary_png', overlay: true, maxMasks: 5, maxCredits: 100, idempotencyKey: `masks-${suffix}` },
    zero_shot_object_detection: { sourceImageArtifactId: imageArtifactId, candidateLabels: ['product', 'logo'], confidenceThreshold: 0.25, maxDetections: 10, overlay: true, maxCredits: 100, idempotencyKey: `detections-${suffix}` },
    visual_document_retrieval: { sourceDocumentArtifactId: documentArtifactId, query: 'What durable evidence is present?', maxResults: 5, citationsRequired: true, maxCredits: 100, idempotencyKey: `visual-doc-${suffix}` },
    video_classification: { sourceVideoArtifactId: videoArtifactId, candidateLabels: ['product_demo', 'other'], samplingProfile: 'balanced', temporalSegmentation: true, maxCredits: 100, idempotencyKey: `video-class-${suffix}` },
  }
  let specialistArtifactCount = 0
  for (const capability of specialist) {
    const submitted = await apiRequest('/api/v1/jobs', appKey, { method: 'POST', headers: jsonHeaders(), body: JSON.stringify({ capability, prompt: `Execute governed ${capability}`, input: requests[capability] }) })
    invariant(submitted.response.status === 201, submitted.body.message || `${capability} did not queue`)
    const duplicate = await apiRequest('/api/v1/jobs', appKey, { method: 'POST', headers: jsonHeaders(), body: JSON.stringify({ capability, prompt: `Execute governed ${capability}`, input: requests[capability] }) })
    invariant(duplicate.response.status === 200 && duplicate.body.deduplicated === true && duplicate.body.jobId === submitted.body.jobId, `${capability} was not idempotent`)
    const job = await pollJob(apiRequest, invariant, delay, appKey, submitted.body.jobId)
    invariant(job.status === 'completed' && job.artifactId, job.error || `${capability} failed`)
    invariant(job.executionEvidence?.outputValidation?.valid === true, `${capability} output validation evidence is missing`)
    const output = JSON.parse(job.output)
    invariant(output.provenance?.evidenceSource === 'local_fixture' && output.provenance?.liveProviderProof === false, `${capability} fixture evidence was mislabelled`)
    const ids = collectArtifactIds(output)
    invariant(ids.size > 0, `${capability} produced no artifact IDs`)
    for (const artifactId of ids) {
      const download = await apiRequest(`/api/v1/artifacts/${encodeURIComponent(artifactId)}/file?download=1`, appKey)
      invariant(download.response.ok, `${capability} artifact ${artifactId} was not downloadable`)
      specialistArtifactCount += 1
    }
  }
  const crossApp = await apiRequest('/api/v1/jobs', appKey, { method: 'POST', headers: jsonHeaders(), body: JSON.stringify({ capability: 'depth_estimation', prompt: 'Cross-app denial', input: { ...requests.depth_estimation, sourceImageArtifactId: crossAppImageId, idempotencyKey: `cross-${suffix}` } }) })
  invariant(crossApp.response.status === 404, 'Cross-app specialist source was not hidden')
  const override = await apiRequest('/api/v1/jobs', appKey, { method: 'POST', headers: jsonHeaders(), body: JSON.stringify({ capability: 'depth_estimation', prompt: 'Override denial', provider: 'deepinfra', input: requests.depth_estimation }) })
  invariant(override.response.status === 400, 'Specialist provider override was not rejected')
  const existingVisionInputs = {
    image_classification: { imageArtifactId },
    visual_question_answering: { imageArtifactId },
    document_qa: { documentArtifactId },
    ocr: { documentArtifactId },
    video_understanding: { videoArtifactId, sampleCount: 3 },
  }
  for (const capability of existingVision) {
    const submitted = await apiRequest('/api/v1/jobs', appKey, { method: 'POST', headers: jsonHeaders(), body: JSON.stringify({ capability, prompt: `Durable fixture proof for ${capability}`, input: existingVisionInputs[capability] }) })
    invariant(submitted.response.status === 201, submitted.body.message || `${capability} did not queue`)
    const job = await pollJob(apiRequest, invariant, delay, appKey, submitted.body.jobId)
    invariant(job.status === 'completed' && job.executionEvidence?.outputValidation?.valid === true, job.error || `${capability} durable fixture proof failed`)
    invariant(job.executionEvidence?.executorId === 'deepinfra.vision', `${capability} did not preserve its canonical executor evidence`)
  }

  const privateTarget = await apiRequest('/api/v1/brand-scrape/executions', appKey, { method: 'POST', headers: jsonHeaders(), body: JSON.stringify({ url: 'https://127.0.0.1/metadata', permittedContentCategories: ['brand'], maxCredits: 100, idempotencyKey: `private-${suffix}` }) })
  invariant(privateTarget.response.status === 400, 'Brand scrape private target was not rejected')
  const brandPayload = { url: 'https://fixture.invalid/brand', crawlDepth: 1, permittedContentCategories: ['brand', 'products', 'legal', 'assets'], maxPages: 4, maxCredits: 100, idempotencyKey: `brand-${suffix}` }
  const brand = await apiRequest('/api/v1/brand-scrape/executions', appKey, { method: 'POST', headers: jsonHeaders(), body: JSON.stringify(brandPayload) })
  invariant(brand.response.status === 202 && brand.body.executionId, brand.body.message || 'Brand scrape did not start')
  const brandDuplicate = await apiRequest('/api/v1/brand-scrape/executions', appKey, { method: 'POST', headers: jsonHeaders(), body: JSON.stringify(brandPayload) })
  invariant(brandDuplicate.body.deduplicated === true && brandDuplicate.body.executionId === brand.body.executionId, 'Brand scrape was not idempotent')
  const brandPending = await pollWorkflow(apiRequest, invariant, delay, appKey, 'brand-scrape', brand.body.executionId, ['human_approval_pending'])
  invariant(brandPending.artifactId && brandPending.result?.proposal?.citations?.length > 0, 'Brand Profile proposal lacks artifact or citations')
  const brandApproval = await apiRequest(`/api/v1/brand-scrape/executions/${encodeURIComponent(brand.body.executionId)}/approval`, appKey, { method: 'POST', headers: jsonHeaders(), body: JSON.stringify({ decision: 'approved', notes: 'Fixture review approved the proposal.' }) })
  invariant(brandApproval.body.status === 'completed', 'Brand proposal approval was not persisted')
  queueControl('pause')
  let cancellableBrand
  try {
    cancellableBrand = await apiRequest('/api/v1/brand-scrape/executions', appKey, { method: 'POST', headers: jsonHeaders(), body: JSON.stringify({ ...brandPayload, idempotencyKey: `brand-cancel-${suffix}` }) })
    invariant(cancellableBrand.response.status === 202, 'Cancellable brand scrape did not start')
    const cancelledBrand = await apiRequest(`/api/v1/brand-scrape/executions/${encodeURIComponent(cancellableBrand.body.executionId)}/cancel`, appKey, { method: 'POST' })
    invariant(cancelledBrand.body.status === 'cancelled', 'Brand scrape cancellation was not persisted')
  } finally {
    queueControl('resume')
  }
  await delay(750)
  const cancelledBrandStatus = await pollWorkflow(apiRequest, invariant, delay, appKey, 'brand-scrape', cancellableBrand.body.executionId, ['cancelled'])
  invariant(cancelledBrandStatus.status === 'cancelled', 'Late brand worker result reactivated cancellation')

  const ingestPayload = { sourceArtifactId: documentArtifactId, documentId: `document-${suffix}`, namespace: `documents-${suffix}`, ocrMode: 'automatic', maxCredits: 100, idempotencyKey: `document-${suffix}` }
  const ingest = await apiRequest('/api/v1/document-ingest/executions', appKey, { method: 'POST', headers: jsonHeaders(), body: JSON.stringify(ingestPayload) })
  invariant(ingest.response.status === 202 && ingest.body.executionId, ingest.body.message || 'Document ingestion did not start')
  const ingested = await pollWorkflow(apiRequest, invariant, delay, appKey, 'document-ingest', ingest.body.executionId, ['completed'])
  invariant(ingested.result?.chunkCount > 0 && ingested.result?.qdrant?.status === 'ok' && ingested.result?.ocrUsed === false, 'Text document was not persisted to Qdrant')
  const ingestDuplicate = await apiRequest('/api/v1/document-ingest/executions', appKey, { method: 'POST', headers: jsonHeaders(), body: JSON.stringify({ ...ingestPayload, idempotencyKey: `different-${suffix}` }) })
  invariant(ingestDuplicate.body.deduplicated === true && ingestDuplicate.body.executionId === ingest.body.executionId, 'Checksum idempotency did not reuse document ingestion')
  const crossDocument = await apiRequest('/api/v1/document-ingest/executions', appKey, { method: 'POST', headers: jsonHeaders(), body: JSON.stringify({ ...ingestPayload, sourceArtifactId: crossAppDocumentId, documentId: `cross-document-${suffix}` }) })
  invariant(crossDocument.response.status === 404, 'Cross-app document ingestion was allowed')
  const ocrPayload = { sourceArtifactId: imageArtifactId, documentId: `ocr-document-${suffix}`, namespace: `documents-${suffix}`, ocrMode: 'always', maxCredits: 100, idempotencyKey: `ocr-${suffix}` }
  const ocr = await apiRequest('/api/v1/document-ingest/executions', appKey, { method: 'POST', headers: jsonHeaders(), body: JSON.stringify(ocrPayload) })
  invariant(ocr.response.status === 202, ocr.body.message || 'OCR document ingestion did not start')
  const ocrIngested = await pollWorkflow(apiRequest, invariant, delay, appKey, 'document-ingest', ocr.body.executionId, ['completed'])
  invariant(ocrIngested.result?.ocrUsed === true && ocrIngested.result?.chunkCount > 0, 'OCR ingestion evidence is missing')

  const now = new Date().toISOString()
  const brandProfileId = `campaign-brand-${suffix}`
  const offeringId = `offering-${suffix}`
  const sourceEvidenceId = `source-${suffix}`
  const profile = { version: 1, brandProfileId, appSlug, status: 'verified', displayName: 'Campaign Fixture Brand', legalName: null, website: 'https://fixture.invalid/campaign-brand', summary: 'A verified fixture brand for campaign orchestration.', mission: null, positioning: 'Inspectable, evidence-led automation.', differentiators: ['Durable governed execution'], audiences: [{ audienceId: 'buyers', name: 'Buyers', description: 'Buyers evaluating governed automation.', pains: [], desiredOutcomes: [] }], voice: { tones: ['credible'], styleRules: ['Use evidence'], approvedPhrases: [], forbiddenPhrases: ['Guaranteed'], locale: 'en' }, visual: { palette: [], typography: [], imageStyleRules: [], videoStyleRules: [], assets: [{ artifactId: imageArtifactId, role: 'product', approved: true, rightsVerified: true, sourceEvidenceIds: [sourceEvidenceId], offeringIds: [offeringId] }] }, offerings: [{ offeringId, name: 'Governed Automation', description: 'Approved fixture offering.', url: null, priceText: null, approvedClaims: ['Durable and inspectable'], requiredDisclaimers: ['Fixture demonstration'] }], approvedClaims: ['Durable and inspectable'], prohibitedClaims: ['Guaranteed'], sourceEvidence: [{ sourceId: sourceEvidenceId, sourceType: 'asset', url: null, title: 'Approved fixture source', capturedAt: now, contentHash: `sha256:${'a'.repeat(64)}`, rightsBasis: 'owned', confidence: 0.99 }], overallConfidence: 0.99, rightsDeclaredBy: 'fixture-admin', rightsDeclaredAt: now, createdAt: now, updatedAt: now }
  const savedProfile = await apiRequest('/api/v1/brand-profiles', appKey, { method: 'POST', headers: jsonHeaders(), body: JSON.stringify(profile) })
  invariant(savedProfile.response.status === 201, savedProfile.body.message || 'Campaign Brand Profile was not created')
  const campaignPayload = { campaignId: `campaign-${suffix}`, brandProfileId, offeringId, objective: 'Launch governed automation with evidence-backed messaging.', audienceIds: ['buyers'], channels: ['linkedin', 'email'], startDate: '2026-07-22', endDate: '2026-07-29', researchExecutionIds: [], ragNamespace: `documents-${suffix}`, budgetCredits: 100, qualityProfile: 'premium', approvalRequired: true, createChildSocialWorkflows: true, idempotencyKey: `campaign-${suffix}` }
  const campaign = await apiRequest('/api/v1/campaign-generation/executions', appKey, { method: 'POST', headers: jsonHeaders(), body: JSON.stringify(campaignPayload) })
  invariant(campaign.response.status === 202 && campaign.body.executionId, campaign.body.message || 'Campaign generation did not start')
  const campaignPending = await pollWorkflow(apiRequest, invariant, delay, appKey, 'campaign-generation', campaign.body.executionId, ['human_approval_pending'])
  invariant(campaignPending.result?.plan?.channelPlan?.length === 2 && campaignPending.result?.plan?.approvalGates?.[0]?.status === 'pending', 'Structured campaign plan or approval gate is missing')
  const campaignApproval = await apiRequest(`/api/v1/campaign-generation/executions/${encodeURIComponent(campaign.body.executionId)}/approval`, appKey, { method: 'POST', headers: jsonHeaders(), body: JSON.stringify({ decision: 'approved', notes: 'Fixture plan activation approved.' }) })
  invariant(campaignApproval.body.status === 'completed' && campaignApproval.body.childRequestIds?.length === 3, 'Campaign approval or approved child requests were not persisted')
  const campaignApprovalAgain = await apiRequest(`/api/v1/campaign-generation/executions/${encodeURIComponent(campaign.body.executionId)}/approval`, appKey, { method: 'POST', headers: jsonHeaders(), body: JSON.stringify({ decision: 'approved', notes: 'Duplicate approval must not create children.' }) })
  invariant(campaignApprovalAgain.body.deduplicated === true, 'Duplicate campaign approval was not idempotent')

  const truth = await apiRequest('/api/admin/truth', adminToken)
  for (const capability of ['brand_scrape', 'document_ingest', 'campaign_generation']) {
    invariant(truth.body.truth?.releaseCandidateCapabilities?.includes(capability), `Canonical truth omitted ${capability}`)
    const workflow = truth.body.truth?.durableWorkflows?.find((item) => item.capability === capability)
    invariant(workflow?.implementationStatus === 'IMPLEMENTED_DURABLE' && workflow.fixtureProof, `Canonical durable workflow evidence omitted ${capability}`)
  }
  invariant(truth.body.truth?.releaseCandidateCapabilities?.includes('image_upscale'), 'Canonical truth omitted image_upscale')

  console.log(`SPECIALIST_FIXTURE_APP=${appSlug}`)
  console.log(`SPECIALIST_ARTIFACT_DOWNLOADS=${specialistArtifactCount}`)
  console.log('IMAGE_UPSCALE_RELEASE_FIXTURE=PASS')
  console.log('SPECIALIST_VISION_RELEASE_FIXTURE=PASS')
  console.log('BRAND_SCRAPE_RELEASE_FIXTURE=PASS')
  console.log('DOCUMENT_INGEST_RELEASE_FIXTURE=PASS')
  console.log('CAMPAIGN_GENERATION_RELEASE_FIXTURE=PASS')
}
