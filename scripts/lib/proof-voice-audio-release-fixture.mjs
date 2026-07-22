function jsonHeaders() { return { 'Content-Type': 'application/json' } }

function wavFixture(durationSeconds = 2, sampleRate = 16000, channels = 1) {
  const bytesPerSample = 2
  const dataSize = durationSeconds * sampleRate * channels * bytesPerSample
  const buffer = Buffer.alloc(44 + dataSize)
  buffer.write('RIFF', 0)
  buffer.writeUInt32LE(36 + dataSize, 4)
  buffer.write('WAVE', 8)
  buffer.write('fmt ', 12)
  buffer.writeUInt32LE(16, 16)
  buffer.writeUInt16LE(1, 20)
  buffer.writeUInt16LE(channels, 22)
  buffer.writeUInt32LE(sampleRate, 24)
  buffer.writeUInt32LE(sampleRate * channels * bytesPerSample, 28)
  buffer.writeUInt16LE(channels * bytesPerSample, 32)
  buffer.writeUInt16LE(16, 34)
  buffer.write('data', 36)
  buffer.writeUInt32LE(dataSize, 40)
  return buffer
}

function pngFixture() {
  return Buffer.from('iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAQAAAC1HAwCAAAAC0lEQVR42mNk+A8AAQUBAScY42YAAAAASUVORK5CYII=', 'base64')
}

function pdfFixture(label) {
  return Buffer.from(`%PDF-1.4\n% ${label}\n1 0 obj\n<< /Type /Catalog >>\nendobj\ntrailer\n<< /Root 1 0 R >>\n%%EOF\n`, 'utf8')
}

async function createApp(apiRequest, invariant, adminToken, appSlug, capabilities) {
  const created = await apiRequest('/api/admin/app-connections', adminToken, {
    method: 'POST', headers: jsonHeaders(),
    body: JSON.stringify({
      appSlug, appName: `Voice audio fixture ${appSlug}`, appType: 'release-fixture', environment: 'test',
      onboardingState: 'active', allowedCapabilities: capabilities, dailyBudgetCents: 100000,
      monthlyBudgetCents: 1000000, requestsPerMinute: 1000, requestsPerDay: 10000,
      artifactRead: true, artifactWrite: true, routingMode: 'automatic', qualityTarget: 'standard', spendStrategy: 'best_value',
    }),
  })
  invariant(created.response.status === 201, created.body.message || `Voice audio fixture app creation returned ${created.response.status}`)
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
    invariant(grant.response.ok && grant.body.enabled === true, grant.body.message || `Voice audio grant ${capability} failed`)
  }
  const key = await apiRequest(`/api/admin/app-connections/${encodeURIComponent(appSlug)}/keys`, adminToken, {
    method: 'POST', headers: jsonHeaders(), body: JSON.stringify({ label: 'voice-audio-release-fixture' }),
  })
  invariant(key.response.status === 201 && typeof key.body.key === 'string', key.body.message || 'Voice audio fixture API key creation failed')
  return key.body.key
}

async function uploadEvidence(apiRequest, invariant, appKey, purpose, bytes, mimeType, filename) {
  const form = new FormData()
  form.append('file', new Blob([bytes], { type: mimeType }), filename)
  const result = await apiRequest(`/api/v1/profile-artifacts/${encodeURIComponent(purpose)}`, appKey, { method: 'POST', body: form })
  invariant(result.response.status === 201 && result.body.status === 'completed' && result.body.artifactId, result.body.message || `Voice audio evidence ${purpose} upload returned ${result.response.status}`)
  return result.body.artifactId
}

async function pollAudio(apiRequest, invariant, delay, appKey, executionId, timeoutMs = 120000) {
  const deadline = Date.now() + timeoutMs
  while (Date.now() < deadline) {
    const result = await apiRequest(`/api/v1/audio-to-audio/${encodeURIComponent(executionId)}`, appKey)
    invariant(result.response.ok, result.body.error || `Audio-to-audio status returned ${result.response.status}`)
    if (['completed', 'failed', 'cancelled'].includes(result.body.status)) return result.body
    await delay(300)
  }
  throw new Error(`Audio-to-audio fixture ${executionId} timed out`)
}

export async function proveVoiceAudioReleaseFixture({ apiRequest, invariant, delay, adminToken }) {
  const suffix = `${Date.now().toString(36)}-${Math.random().toString(36).slice(2, 7)}`
  const capabilities = ['audio_to_audio', 'voice_clone', 'voice_conversion']
  const appSlug = `voice-audio-fixture-${suffix}`
  const otherSlug = `voice-audio-isolation-${suffix}`
  const appKey = await createApp(apiRequest, invariant, adminToken, appSlug, capabilities)
  const otherKey = await createApp(apiRequest, invariant, adminToken, otherSlug, ['voice_clone'])

  const sourceAudioId = await uploadEvidence(apiRequest, invariant, appKey, 'voice_source_audio', wavFixture(), 'audio/wav', 'source.wav')
  const crossAppAudioId = await uploadEvidence(apiRequest, invariant, otherKey, 'voice_source_audio', wavFixture(), 'audio/wav', 'cross-app.wav')

  const transformPayload = {
    sourceAudioArtifactId: sourceAudioId,
    operation: 'normalize',
    intendedUse: 'narration',
    outputFormat: 'wav',
    idempotencyKey: `normalize-${suffix}`,
    parameters: {},
    metadata: { fixture: 'voice-audio' },
  }
  const submitted = await apiRequest('/api/v1/audio-to-audio', appKey, { method: 'POST', headers: jsonHeaders(), body: JSON.stringify(transformPayload) })
  invariant(submitted.response.status === 202 && submitted.body.audioToAudioId, submitted.body.error || `Audio transform submission returned ${submitted.response.status}`)
  invariant(submitted.body.evidence?.evidenceSource === 'internal_ffmpeg' && submitted.body.evidence?.liveProviderProof === false, 'Audio transform submission evidence was misclassified')
  const duplicate = await apiRequest('/api/v1/audio-to-audio', appKey, { method: 'POST', headers: jsonHeaders(), body: JSON.stringify(transformPayload) })
  invariant(duplicate.response.status === 200 && duplicate.body.audioToAudioId === submitted.body.audioToAudioId && duplicate.body.evidence?.idempotent === true, 'Audio transform idempotency failed')
  const completed = await pollAudio(apiRequest, invariant, delay, appKey, submitted.body.audioToAudioId)
  invariant(completed.status === 'completed' && completed.outputArtifactId, completed.error || 'Audio transform did not complete')
  invariant(completed.evidence?.evidenceSource === 'internal_ffmpeg' && completed.evidence?.liveProviderProof === false, 'Completed audio transform evidence was misclassified')
  const download = await apiRequest(`/api/v1/artifacts/${encodeURIComponent(completed.outputArtifactId)}/file?download=1`, appKey)
  invariant(download.response.ok && String(download.response.headers.get('content-type') || '').startsWith('audio/'), 'Audio transform artifact was not downloadable as audio')

  const crossApp = await apiRequest('/api/v1/audio-to-audio', appKey, {
    method: 'POST', headers: jsonHeaders(),
    body: JSON.stringify({ ...transformPayload, sourceAudioArtifactId: crossAppAudioId, idempotencyKey: `cross-${suffix}` }),
  })
  invariant(crossApp.response.status === 404 && crossApp.body.code === 'ARTIFACT_NOT_FOUND', 'Cross-app source audio was not hidden')

  const unsupportedPayload = { ...transformPayload, operation: 'denoise', idempotencyKey: `denoise-${suffix}` }
  const unsupported = await apiRequest('/api/v1/audio-to-audio', appKey, { method: 'POST', headers: jsonHeaders(), body: JSON.stringify(unsupportedPayload) })
  invariant(unsupported.response.status === 422 && unsupported.body.audioToAudioId && unsupported.body.evidence?.evidenceSource === 'executor_unavailable', 'Unsupported audio operation did not persist a truthful blocker')
  const unsupportedDuplicate = await apiRequest('/api/v1/audio-to-audio', appKey, { method: 'POST', headers: jsonHeaders(), body: JSON.stringify(unsupportedPayload) })
  invariant(unsupportedDuplicate.response.status === 200 && unsupportedDuplicate.body.audioToAudioId === unsupported.body.audioToAudioId, 'Blocked audio operation was not idempotent')

  const identityId = await uploadEvidence(apiRequest, invariant, appKey, 'voice_identity_verification', pngFixture(), 'image/png', 'identity.png')
  const consentId = await uploadEvidence(apiRequest, invariant, appKey, 'voice_consent', pdfFixture('voice consent'), 'application/pdf', 'consent.pdf')
  const recordingConsentId = await uploadEvidence(apiRequest, invariant, appKey, 'voice_recording_consent', wavFixture(), 'audio/wav', 'recording-consent.wav')
  const consentEvidence = {
    version: 1,
    subjectReference: `subject:${suffix}`,
    rightsHolderReference: `rights:${suffix}`,
    subjectAgeConfirmedAdult: true,
    identityVerificationArtifactId: identityId,
    consentArtifactId: consentId,
    sourceRecordingConsentArtifactId: recordingConsentId,
    permittedUses: ['narration'],
    commercialUseAllowed: true,
    syntheticDisclosureRequired: true,
    revocable: true,
    declaredAt: '2026-07-21T10:00:00.000Z',
    verifiedAt: '2026-07-21T11:00:00.000Z',
    expiresAt: '2030-07-21T11:00:00.000Z',
    verifierReference: 'fixture-evidence-verifier',
    jurisdictions: ['ZA'],
    notes: 'Disposable release fixture consent evidence.',
  }
  const profileCreated = await apiRequest('/api/v1/voice-profiles', appKey, {
    method: 'POST', headers: jsonHeaders(),
    body: JSON.stringify({
      displayName: 'Voice Audio Fixture Profile', description: 'Verified user-recording profile for blocker proof.',
      source: { sourceType: 'user_recording', sourceAudioArtifactIds: [sourceAudioId] }, language: 'en', locale: 'en-ZA',
      styleTags: ['fixture'], permittedUses: ['narration'], consentEvidence,
    }),
  })
  invariant(profileCreated.response.status === 201 && profileCreated.body.voiceProfileId, profileCreated.body.message || 'Voice audio fixture profile creation failed')
  const verified = await apiRequest(`/api/admin/voice-profiles/${encodeURIComponent(appSlug)}/${encodeURIComponent(profileCreated.body.voiceProfileId)}/decision`, adminToken, {
    method: 'POST', headers: jsonHeaders(), body: JSON.stringify({ decision: 'verified', notes: 'Voice audio fixture rights verified.' }),
  })
  invariant(verified.response.ok && verified.body.status === 'verified' && verified.body.rightsDecision?.verifierReference, verified.body.message || 'Voice audio fixture profile verification failed')

  const clonePayload = {
    sourceAudioArtifactId: sourceAudioId,
    voiceProfileId: profileCreated.body.voiceProfileId,
    language: 'en', locale: 'en-ZA', intendedUse: 'narration',
    consentEvidenceReference: consentId,
    rightsDeclarationReference: verified.body.rightsDecision.verifierReference,
    qualityProfile: 'standard', maxCredits: 100, idempotencyKey: `clone-${suffix}`, metadata: { fixture: 'voice-audio' },
  }
  const clone = await apiRequest('/api/v1/voice-clone', appKey, { method: 'POST', headers: jsonHeaders(), body: JSON.stringify(clonePayload) })
  invariant(clone.response.status === 422 && clone.body.voiceCloneId && clone.body.evidence?.evidenceSource === 'executor_unavailable', clone.body.error || 'Voice clone blocker was not persisted truthfully')
  const cloneDuplicate = await apiRequest('/api/v1/voice-clone', appKey, { method: 'POST', headers: jsonHeaders(), body: JSON.stringify(clonePayload) })
  invariant(cloneDuplicate.response.status === 422 && cloneDuplicate.body.voiceCloneId === clone.body.voiceCloneId && cloneDuplicate.body.evidence?.idempotent === true, 'Voice clone blocker was not idempotent')
  const cloneStatus = await apiRequest(`/api/v1/voice-clone/${encodeURIComponent(clone.body.voiceCloneId)}`, appKey)
  invariant(cloneStatus.response.ok && cloneStatus.body.status === 'failed' && cloneStatus.body.evidence?.evidenceSource === 'executor_unavailable', 'Voice clone blocker was not durable')

  const conversionPayload = {
    sourceAudioArtifactId: sourceAudioId,
    targetVoiceProfileId: profileCreated.body.voiceProfileId,
    intendedUse: 'narration', preserveTiming: true, outputFormat: 'wav', maxCredits: 100,
    idempotencyKey: `conversion-${suffix}`, metadata: { fixture: 'voice-audio' },
  }
  const conversion = await apiRequest('/api/v1/voice-conversion', appKey, { method: 'POST', headers: jsonHeaders(), body: JSON.stringify(conversionPayload) })
  invariant(conversion.response.status === 422 && conversion.body.voiceConversionId && conversion.body.evidence?.evidenceSource === 'executor_unavailable', conversion.body.error || 'Voice conversion blocker was not persisted truthfully')
  const conversionDuplicate = await apiRequest('/api/v1/voice-conversion', appKey, { method: 'POST', headers: jsonHeaders(), body: JSON.stringify(conversionPayload) })
  invariant(conversionDuplicate.response.status === 422 && conversionDuplicate.body.voiceConversionId === conversion.body.voiceConversionId && conversionDuplicate.body.evidence?.idempotent === true, 'Voice conversion blocker was not idempotent')

  console.log(`VOICE_AUDIO_RELEASE_FIXTURE=PASS transformJob=${submitted.body.audioToAudioId} cloneBlocker=${clone.body.voiceCloneId} conversionBlocker=${conversion.body.voiceConversionId}`)
}
