function jsonHeaders() {
  return { 'Content-Type': 'application/json' }
}

function wavFixture() {
  const buffer = Buffer.alloc(44)
  buffer.write('RIFF', 0)
  buffer.writeUInt32LE(36, 4)
  buffer.write('WAVE', 8)
  buffer.write('fmt ', 12)
  buffer.writeUInt32LE(16, 16)
  buffer.writeUInt16LE(1, 20)
  buffer.writeUInt16LE(1, 22)
  buffer.writeUInt32LE(8000, 24)
  buffer.writeUInt32LE(16000, 28)
  buffer.writeUInt16LE(2, 32)
  buffer.writeUInt16LE(16, 34)
  buffer.write('data', 36)
  buffer.writeUInt32LE(0, 40)
  return buffer
}

function pngFixture() {
  return Buffer.from('iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAQAAAC1HAwCAAAAC0lEQVR42mNk+A8AAQUBAScY42YAAAAASUVORK5CYII=', 'base64')
}

function pdfFixture(label) {
  return Buffer.from(`%PDF-1.4\n% ${label}\n1 0 obj\n<< /Type /Catalog >>\nendobj\ntrailer\n<< /Root 1 0 R >>\n%%EOF\n`, 'utf8')
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
      memoryRead: false,
      memoryWrite: false,
      routingMode: 'automatic',
      qualityTarget: 'standard',
      spendStrategy: 'best_value',
    }),
  })
  invariant(created.response.status === 201, created.body.message || `Profile fixture app creation returned ${created.response.status}`)

  const key = await apiRequest(`/api/admin/app-connections/${encodeURIComponent(appSlug)}/keys`, adminToken, {
    method: 'POST',
    headers: jsonHeaders(),
    body: JSON.stringify({ label: 'voice-avatar-profile-release-fixture' }),
  })
  invariant(key.response.status === 201 && typeof key.body.key === 'string', key.body.message || `Profile fixture app key creation returned ${key.response.status}`)
  return key.body.key
}

async function expandCapabilities(apiRequest, invariant, adminToken, appSlug, capabilities) {
  const result = await apiRequest(`/api/admin/app-connections/${encodeURIComponent(appSlug)}`, adminToken, {
    method: 'PUT',
    headers: jsonHeaders(),
    body: JSON.stringify({ allowedCapabilities: capabilities }),
  })
  invariant(result.response.ok, result.body.message || `Profile fixture capability expansion returned ${result.response.status}`)
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
  invariant(result.response.ok && result.body.enabled === true, result.body.message || `Profile grant ${capability} returned ${result.response.status}`)
}

async function uploadEvidence(apiRequest, invariant, appKey, purpose, bytes, mimeType, filename) {
  const form = new FormData()
  form.append('file', new Blob([bytes], { type: mimeType }), filename)
  const result = await apiRequest(`/api/v1/profile-artifacts/${encodeURIComponent(purpose)}`, appKey, {
    method: 'POST',
    body: form,
  })
  invariant(
    result.response.status === 201
      && typeof result.body.artifactId === 'string'
      && result.body.purpose === purpose
      && result.body.status === 'completed',
    result.body.message || `Profile evidence upload ${purpose} returned ${result.response.status}`,
  )
  return result.body
}

async function decideProfile(apiRequest, invariant, adminToken, kind, appSlug, profileId, decision, notes) {
  const result = await apiRequest(`/api/admin/${kind}-profiles/${encodeURIComponent(appSlug)}/${encodeURIComponent(profileId)}/decision`, adminToken, {
    method: 'POST',
    headers: jsonHeaders(),
    body: JSON.stringify({ decision, notes }),
  })
  invariant(result.response.ok, result.body.message || `${kind} profile decision returned ${result.response.status}`)
  return result.body
}

async function executeAppJob(apiRequest, invariant, appKey, capability, input) {
  const submitted = await apiRequest('/api/v1/jobs', appKey, {
    method: 'POST',
    headers: jsonHeaders(),
    body: JSON.stringify({ capability, prompt: input.text || `${capability} release fixture`, input }),
  })
  invariant(submitted.response.status === 201 && submitted.body.jobId, submitted.body.message || `${capability} submission returned ${submitted.response.status}`)
  for (let attempt = 0; attempt < 160; attempt++) {
    const polled = await apiRequest(`/api/v1/jobs/${encodeURIComponent(submitted.body.jobId)}`, appKey)
    invariant(polled.response.ok, polled.body.message || `${capability} polling returned ${polled.response.status}`)
    if (['completed', 'failed', 'cancelled'].includes(polled.body.status)) return polled.body
    await new Promise((resolve) => setTimeout(resolve, 250))
  }
  throw new Error(`${capability} fixture job did not reach a terminal state`)
}

export async function proveVoiceAvatarProfileReleaseFixture({ apiRequest, invariant, adminToken }) {
  const suffix = `${Date.now().toString(36)}-${Math.random().toString(36).slice(2, 8)}`
  const primarySlug = `profile-fixture-${suffix}`
  const secondarySlug = `profile-isolation-${suffix}`
  const fullCapabilities = ['tts', 'voice_clone', 'avatar_generation']

  const primaryKey = await createFixtureApp(apiRequest, invariant, adminToken, primarySlug, 'Voice Avatar Profile Fixture', ['tts', 'voice_clone'])
  const secondaryKey = await createFixtureApp(apiRequest, invariant, adminToken, secondarySlug, 'Voice Avatar Isolation Fixture', fullCapabilities)
  await configureGrant(apiRequest, invariant, adminToken, primarySlug, 'tts')
  await configureGrant(apiRequest, invariant, adminToken, primarySlug, 'voice_clone')
  await configureGrant(apiRequest, invariant, adminToken, secondarySlug, 'tts')
  await configureGrant(apiRequest, invariant, adminToken, secondarySlug, 'voice_clone')
  await configureGrant(apiRequest, invariant, adminToken, secondarySlug, 'avatar_generation')

  const missingAvatarGrant = new FormData()
  missingAvatarGrant.append('file', new Blob([pngFixture()], { type: 'image/png' }), 'portrait.png')
  const deniedUpload = await apiRequest('/api/v1/profile-artifacts/avatar_portrait', primaryKey, { method: 'POST', body: missingAvatarGrant })
  invariant(
    deniedUpload.response.status === 403 && deniedUpload.body.code === 'PROFILE_EVIDENCE_GRANT_REQUIRED',
    'Avatar evidence upload did not fail closed without avatar_generation authority',
  )

  const mismatched = new FormData()
  mismatched.append('file', new Blob([pngFixture()], { type: 'image/jpeg' }), 'spoofed.jpg')
  const mismatchedUpload = await apiRequest('/api/v1/profile-artifacts/voice_identity_verification', primaryKey, { method: 'POST', body: mismatched })
  invariant(
    mismatchedUpload.response.status === 415 && mismatchedUpload.body.code === 'VOICE_AVATAR_EVIDENCE_MIME_MISMATCH',
    'Profile evidence upload accepted a declared/detected MIME mismatch',
  )

  const sourceAudio = await uploadEvidence(apiRequest, invariant, primaryKey, 'voice_source_audio', wavFixture(), 'audio/wav', 'source.wav')
  const identity = await uploadEvidence(apiRequest, invariant, primaryKey, 'voice_identity_verification', pngFixture(), 'image/png', 'identity.png')
  const consent = await uploadEvidence(apiRequest, invariant, primaryKey, 'voice_consent', pdfFixture('voice consent'), 'application/pdf', 'consent.pdf')
  const recordingConsent = await uploadEvidence(apiRequest, invariant, primaryKey, 'voice_recording_consent', wavFixture(), 'audio/wav', 'recording-consent.wav')

  const consentEvidence = {
    version: 1,
    subjectReference: `subject:${suffix}`,
    rightsHolderReference: `rights-holder:${suffix}`,
    subjectAgeConfirmedAdult: true,
    identityVerificationArtifactId: identity.artifactId,
    consentArtifactId: consent.artifactId,
    sourceRecordingConsentArtifactId: recordingConsent.artifactId,
    permittedUses: ['narration', 'avatar_performance'],
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

  const voiceCreated = await apiRequest('/api/v1/voice-profiles', primaryKey, {
    method: 'POST',
    headers: jsonHeaders(),
    body: JSON.stringify({
      displayName: 'Release Fixture Narrator',
      description: 'Consented draft voice profile.',
      source: { sourceType: 'user_recording', sourceAudioArtifactIds: [sourceAudio.artifactId] },
      language: 'en',
      locale: 'en-ZA',
      styleTags: ['fixture', 'narration'],
      permittedUses: ['narration', 'avatar_performance'],
      consentEvidence,
    }),
  })
  invariant(
    voiceCreated.response.status === 201
      && voiceCreated.body.status === 'draft'
      && voiceCreated.body.rightsStatus === 'pending'
      && !voiceCreated.body.rightsDecision
      && !voiceCreated.body.providerBinding,
    voiceCreated.body.message || `Voice profile creation returned ${voiceCreated.response.status}`,
  )
  const voiceProfileId = voiceCreated.body.voiceProfileId

  const spoofedVerifier = await apiRequest(`/api/admin/voice-profiles/${encodeURIComponent(primarySlug)}/${encodeURIComponent(voiceProfileId)}/decision`, adminToken, {
    method: 'POST',
    headers: jsonHeaders(),
    body: JSON.stringify({ decision: 'verified', verifierReference: 'spoofed', notes: 'Must be rejected.' }),
  })
  invariant(spoofedVerifier.response.status === 400 && spoofedVerifier.body.code === 'INVALID_PROFILE_DECISION', 'Admin decision accepted a client-supplied verifier identity')

  const verifiedVoice = await decideProfile(apiRequest, invariant, adminToken, 'voice', primarySlug, voiceProfileId, 'verified', 'Fixture voice rights verified.')
  invariant(
    verifiedVoice.status === 'verified'
      && verifiedVoice.rightsStatus === 'verified'
      && verifiedVoice.rightsDecision?.decision === 'verified'
      && String(verifiedVoice.rightsDecision?.verifierReference || '').startsWith('admin:fixture-admin@invalid.example'),
    'Voice profile verification did not preserve server-derived decision evidence',
  )

  const voiceCatalogue = await apiRequest('/api/admin/voices', adminToken)
  const fixtureCatalogueVoice = voiceCatalogue.body.voices?.find((voice) => voice.voiceId === 'fixture-genx-narrator-v1')
  invariant(voiceCatalogue.response.ok && fixtureCatalogueVoice?.enabled, 'Fixture-only governed voice catalogue entry was not bootstrapped')
  const catalogueProfileCreated = await apiRequest('/api/v1/voice-profiles', primaryKey, {
    method: 'POST',
    headers: jsonHeaders(),
    body: JSON.stringify({
      displayName: 'Verified Catalogue Narrator',
      description: 'App-scoped reusable profile backed by the fixture-only governed catalogue.',
      source: { sourceType: 'provider_catalogue', catalogueVoiceId: fixtureCatalogueVoice.voiceId },
      language: 'en',
      locale: 'en-ZA',
      styleTags: ['fixture', 'narration'],
      permittedUses: ['narration'],
    }),
  })
  invariant(catalogueProfileCreated.response.status === 201 && catalogueProfileCreated.body.status === 'draft', 'Catalogue-backed voice profile was not created as a draft')
  const catalogueProfileId = catalogueProfileCreated.body.voiceProfileId
  const draftDenied = await executeAppJob(apiRequest, invariant, primaryKey, 'tts', {
    text: 'Draft profiles must not speak.', voiceProfileId: catalogueProfileId, intendedUse: 'narration', language: 'en', locale: 'en-ZA', speed: 1, outputFormat: 'wav',
  })
  invariant(draftDenied.status === 'failed' && /not usable|status is draft/i.test(draftDenied.error || ''), 'Draft voice profile executed TTS')
  await decideProfile(apiRequest, invariant, adminToken, 'voice', primarySlug, catalogueProfileId, 'verified', 'Fixture catalogue voice rights verified.')
  const governedTts = await executeAppJob(apiRequest, invariant, primaryKey, 'tts', {
    text: 'Verified reusable profile fixture proof.', voiceProfileId: catalogueProfileId, intendedUse: 'narration', language: 'en', locale: 'en-ZA', speed: 1, outputFormat: 'wav',
  })
  invariant(governedTts.status === 'completed' && governedTts.artifactId, governedTts.error || 'Verified reusable voice profile did not create a durable audio artifact')
  const crossAppDenied = await executeAppJob(apiRequest, invariant, secondaryKey, 'tts', {
    text: 'Cross-app profiles must not speak.', voiceProfileId: catalogueProfileId, intendedUse: 'narration', language: 'en', locale: 'en-ZA', speed: 1, outputFormat: 'wav',
  })
  invariant(crossAppDenied.status === 'failed' && /not found for the authenticated app/i.test(crossAppDenied.error || ''), 'Cross-app voice profile executed TTS')
  const archivedCatalogueProfile = await apiRequest(`/api/v1/voice-profiles/${encodeURIComponent(catalogueProfileId)}`, primaryKey, { method: 'DELETE' })
  invariant(archivedCatalogueProfile.response.ok && archivedCatalogueProfile.body.status === 'archived', 'Catalogue-backed voice profile was not archived')
  const archivedDenied = await executeAppJob(apiRequest, invariant, primaryKey, 'tts', {
    text: 'Archived profiles must not speak.', voiceProfileId: catalogueProfileId, intendedUse: 'narration', language: 'en', locale: 'en-ZA', speed: 1, outputFormat: 'wav',
  })
  invariant(archivedDenied.status === 'failed' && /not usable|status is archived/i.test(archivedDenied.error || ''), 'Archived voice profile executed TTS')

  const editedVoice = await apiRequest(`/api/v1/voice-profiles/${encodeURIComponent(voiceProfileId)}`, primaryKey, {
    method: 'PUT',
    headers: jsonHeaders(),
    body: JSON.stringify({ description: 'Edited draft requires re-verification.' }),
  })
  invariant(
    editedVoice.response.ok
      && editedVoice.body.status === 'draft'
      && editedVoice.body.rightsStatus === 'pending'
      && !editedVoice.body.rightsDecision
      && !editedVoice.body.providerBinding,
    editedVoice.body.message || 'Editing a voice profile did not reset rights to pending',
  )
  await decideProfile(apiRequest, invariant, adminToken, 'voice', primarySlug, voiceProfileId, 'verified', 'Fixture voice re-verified after edit.')

  await expandCapabilities(apiRequest, invariant, adminToken, primarySlug, fullCapabilities)
  await configureGrant(apiRequest, invariant, adminToken, primarySlug, 'voice_clone')
  await configureGrant(apiRequest, invariant, adminToken, primarySlug, 'avatar_generation')

  const portrait = await uploadEvidence(apiRequest, invariant, primaryKey, 'avatar_portrait', pngFixture(), 'image/png', 'portrait.png')
  const creationEvidence = await uploadEvidence(apiRequest, invariant, primaryKey, 'avatar_creation_evidence', pdfFixture('synthetic avatar creation evidence'), 'application/pdf', 'creation.pdf')
  const avatarCreated = await apiRequest('/api/v1/avatar-profiles', primaryKey, {
    method: 'POST',
    headers: jsonHeaders(),
    body: JSON.stringify({
      displayName: 'Release Fixture Presenter',
      description: 'Synthetic presenter profile.',
      source: {
        subjectType: 'synthetic',
        portraitArtifactId: portrait.artifactId,
        creationEvidenceArtifactId: creationEvidence.artifactId,
      },
      permittedUses: ['avatar_performance'],
      defaultVoiceProfileId: voiceProfileId,
      styleTags: ['fixture', 'studio'],
    }),
  })
  invariant(
    avatarCreated.response.status === 201
      && avatarCreated.body.status === 'draft'
      && avatarCreated.body.rightsStatus === 'pending',
    avatarCreated.body.message || `Avatar profile creation returned ${avatarCreated.response.status}`,
  )
  const avatarProfileId = avatarCreated.body.avatarProfileId
  const verifiedAvatar = await decideProfile(apiRequest, invariant, adminToken, 'avatar', primarySlug, avatarProfileId, 'verified', 'Synthetic avatar evidence verified.')
  invariant(
    verifiedAvatar.status === 'verified'
      && verifiedAvatar.rightsStatus === 'verified'
      && verifiedAvatar.defaultVoiceProfileId === voiceProfileId,
    'Avatar profile verification did not preserve its verified default voice dependency',
  )

  const primaryVoiceList = await apiRequest('/api/v1/voice-profiles', primaryKey)
  const primaryAvatarList = await apiRequest('/api/v1/avatar-profiles', primaryKey)
  invariant(primaryVoiceList.response.ok && primaryVoiceList.body.profiles?.some((profile) => profile.voiceProfileId === voiceProfileId), 'Owning app could not list its voice profile')
  invariant(primaryAvatarList.response.ok && primaryAvatarList.body.profiles?.some((profile) => profile.avatarProfileId === avatarProfileId), 'Owning app could not list its avatar profile')

  const crossVoice = await apiRequest(`/api/v1/voice-profiles/${encodeURIComponent(voiceProfileId)}`, secondaryKey)
  const crossAvatar = await apiRequest(`/api/v1/avatar-profiles/${encodeURIComponent(avatarProfileId)}`, secondaryKey)
  const crossSource = await apiRequest(`/api/v1/artifacts/${encodeURIComponent(sourceAudio.artifactId)}/file`, secondaryKey)
  invariant(crossVoice.response.status === 404 && crossVoice.body.code === 'VOICE_PROFILE_NOT_FOUND', 'A second app could read another app voice profile')
  invariant(crossAvatar.response.status === 404 && crossAvatar.body.code === 'AVATAR_PROFILE_NOT_FOUND', 'A second app could read another app avatar profile')
  invariant(!crossSource.response.ok, 'A second app could read another app voice source artifact')

  const archivedAvatar = await apiRequest(`/api/v1/avatar-profiles/${encodeURIComponent(avatarProfileId)}`, primaryKey, { method: 'DELETE' })
  invariant(archivedAvatar.response.ok && archivedAvatar.body.status === 'archived', 'Avatar profile archive did not preserve a durable archived state')
  const verifyArchivedAvatar = await apiRequest(`/api/admin/avatar-profiles/${encodeURIComponent(primarySlug)}/${encodeURIComponent(avatarProfileId)}/decision`, adminToken, {
    method: 'POST',
    headers: jsonHeaders(),
    body: JSON.stringify({ decision: 'verified', notes: 'Must remain archived.' }),
  })
  invariant(verifyArchivedAvatar.response.status === 409 && verifyArchivedAvatar.body.code === 'PROFILE_ARCHIVED', 'Archived avatar profile was silently re-verified')

  const revokedVoice = await decideProfile(apiRequest, invariant, adminToken, 'voice', primarySlug, voiceProfileId, 'revoked', 'Fixture subject revoked consent.')
  invariant(
    revokedVoice.status === 'revoked'
      && revokedVoice.rightsStatus === 'revoked'
      && revokedVoice.rightsDecision?.decision === 'revoked'
      && revokedVoice.revokedAt,
    'Voice profile revocation did not preserve irreversible decision evidence',
  )
  const verifyRevokedVoice = await apiRequest(`/api/admin/voice-profiles/${encodeURIComponent(primarySlug)}/${encodeURIComponent(voiceProfileId)}/decision`, adminToken, {
    method: 'POST',
    headers: jsonHeaders(),
    body: JSON.stringify({ decision: 'verified', notes: 'Must remain revoked.' }),
  })
  invariant(verifyRevokedVoice.response.status === 409 && verifyRevokedVoice.body.code === 'PROFILE_REVOKED', 'Revoked voice profile was silently re-verified')
  const editRevokedVoice = await apiRequest(`/api/v1/voice-profiles/${encodeURIComponent(voiceProfileId)}`, primaryKey, {
    method: 'PUT',
    headers: jsonHeaders(),
    body: JSON.stringify({ description: 'Must fail.' }),
  })
  invariant(editRevokedVoice.response.status === 409 && editRevokedVoice.body.code === 'VOICE_PROFILE_REVOKED', 'Revoked voice profile remained app-editable')
  const revokedDenied = await executeAppJob(apiRequest, invariant, primaryKey, 'tts', {
    text: 'Revoked profiles must not speak.', voiceProfileId, intendedUse: 'narration', language: 'en', locale: 'en-ZA', speed: 1, outputFormat: 'wav',
  })
  invariant(revokedDenied.status === 'failed' && /not usable|status is revoked/i.test(revokedDenied.error || ''), 'Revoked voice profile executed TTS')

  console.log(`VOICE_PROFILE_FIXTURE_APP=${primarySlug}`)
  console.log(`VOICE_PROFILE_FIXTURE_ID=${voiceProfileId}`)
  console.log(`AVATAR_PROFILE_FIXTURE_ID=${avatarProfileId}`)
  console.log('PROFILE_EVIDENCE_GRANT_DENIAL=PASS')
  console.log('PROFILE_EVIDENCE_MIME_DENIAL=PASS')
  console.log('VOICE_PROFILE_DRAFT_VERIFY_RESET=PASS')
  console.log('AVATAR_PROFILE_VERIFY_ARCHIVE=PASS')
  console.log('PROFILE_SERVER_DERIVED_VERIFIER=PASS')
  console.log('PROFILE_REVOCATION_GUARD=PASS')
  console.log('PROFILE_APP_ISOLATION=PASS')
  console.log('GOVERNED_TTS_PROFILE_EXECUTION=PASS')
  console.log('GOVERNED_TTS_DRAFT_REVOKED_ARCHIVED_DENIAL=PASS')
  console.log('GOVERNED_TTS_CROSS_APP_DENIAL=PASS')
}
