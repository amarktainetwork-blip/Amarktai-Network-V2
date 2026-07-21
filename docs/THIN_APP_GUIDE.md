# Connect a thin app

Create the app in **Apps**, grant atomic and composite capabilities, choose each capability's routing policy, set budgets and webhooks, then create an API key. The raw key is shown once.

Install `@amarktai/sdk`, create `new AmarktAIClient({ apiKey })`, call `execute`, and poll `job`. Streaming chat uses `streamChat`, artifacts remain app-authorised, and completed jobs expose immutable route, usage, cost, validation, and fallback evidence.

## Ownership boundary

A thin app owns its product experience, domain records and business decisions. It collects the user's brief, chooses the desired outcome, stores domain-specific customer state, presents approvals and displays results. It does not own provider discovery, model selection, execution endpoints, retries, fallback, media assembly, quality evaluation, cost enforcement, artifact storage or execution evidence.

The AmarktAI Network owns those reusable powers. Apps request canonical capabilities and pass domain inputs or resource IDs. They must not send provider, model, route, executor, endpoint or provider credential fields. Orchestra selects execution under capability grants, quality policy, budget, provider health and model availability.

### Marketing App boundary

The Marketing App owns customer onboarding, campaign brief and strategy UX, audience/offer/channel decisions, marketing-calendar UX, CRM and lead context, social-account connection UX, human approval decisions and business performance reporting.

The Network owns authorised brand extraction, versioned Brand Profiles, research/RAG/memory, campaign and media execution, social-ad production, content repurposing, quality and candidate selection, secure connector execution, publishing receipts, artifacts, provenance, budgets and audit evidence. Brand Profiles and generated assets remain isolated by `appSlug` and are referenced by ID from the Marketing App.

## Governed research

Grant `research` before starting evidence collection. Grant `question_answering` as well when the app requests a cited answer. The Network owns SearXNG discovery, Playwright browsing, DNS/IP and redirect validation, robots enforcement, source snapshots, provider/model selection for the answer child, citation validation and report persistence.

```ts
const execution = await network.executeResearch({
  query: 'Compare current evidence about the market and cite each conclusion.',
  mode: 'deep',
  maxPages: 8,
  freshnessDays: 30,
  safeSearch: 'strict',
  answer: true,
  includeSnapshots: true,
}) as { executionId: string }

const status = await network.researchExecution(execution.executionId)
```

Research requests must not contain `appSlug`, provider, model, route, executor, endpoint or credential fields. A completed report contains the fetched source set, canonical citation IDs, retrieval and robots evidence, optional source-snapshot artifact IDs, answer route evidence and an app-authorised report artifact.

Automatic research-to-RAG export is intentionally not accepted yet. After human or product approval, retrieve the completed report or source artifact and call `ingestRag` explicitly with a granted namespace. This keeps RAG ingestion durable, reviewable and independently isolated.

## Governed voice and avatar profiles

Voice and avatar profiles are app-owned reusable resources. They are separate from the provider voice catalogue and from generation execution. Grant `voice_clone` for human recordings, synthetic voice designs or voice remixes. A provider-catalogue voice uses `tts`. Grant `avatar_generation` for avatar evidence and profiles. Every write grant must allow artifact writes.

Upload evidence through a purpose-specific multipart endpoint. The Network accepts one file, derives its artifact type and MIME from the bytes, applies a purpose-specific size limit and stores it under the authenticated app. Client metadata, `appSlug`, provider, model, route, executor, endpoint and credential fields are not accepted.

```ts
const sourceAudio = await network.uploadProfileArtifact(
  'voice_source_audio',
  new Blob([audioBytes], { type: 'audio/wav' }),
  'narrator.wav',
) as { artifactId: string }

const identity = await network.uploadProfileArtifact(
  'voice_identity_verification',
  new Blob([identityImage], { type: 'image/png' }),
  'identity.png',
) as { artifactId: string }

const consent = await network.uploadProfileArtifact(
  'voice_consent',
  new Blob([consentPdf], { type: 'application/pdf' }),
  'consent.pdf',
) as { artifactId: string }

const recordingConsent = await network.uploadProfileArtifact(
  'voice_recording_consent',
  new Blob([recordingConsentPdf], { type: 'application/pdf' }),
  'recording-consent.pdf',
) as { artifactId: string }

const profile = await network.createVoiceProfile({
  displayName: 'Consented narrator',
  source: { sourceType: 'user_recording', sourceAudioArtifactIds: [sourceAudio.artifactId] },
  language: 'en',
  locale: 'en-ZA',
  permittedUses: ['narration', 'avatar_performance'],
  consentEvidence: {
    version: 1,
    subjectReference: 'subject:verified-adult',
    rightsHolderReference: 'rights-holder:verified',
    subjectAgeConfirmedAdult: true,
    identityVerificationArtifactId: identity.artifactId,
    consentArtifactId: consent.artifactId,
    sourceRecordingConsentArtifactId: recordingConsent.artifactId,
    permittedUses: ['narration', 'avatar_performance'],
    commercialUseAllowed: true,
    revocable: true,
    declaredAt: new Date().toISOString(),
    verifiedAt: new Date().toISOString(),
    verifierReference: 'customer-consent-workflow',
    jurisdictions: ['ZA'],
  },
})
```

Apps can list, read, create, update and archive only their own profiles. App writes always produce a `draft` with `rightsStatus: pending`; editing a verified profile resets its rights decision and removes any internal provider binding. Only an authenticated Network administrator can verify, reject or revoke a profile. The administrator identity and decision time are server-derived and stored durably. Revoked profiles cannot be edited or silently re-verified, and archived profiles cannot be reactivated by a verification request.

A human-derived voice requires identity, consent, source-recording consent and source-audio artifacts owned by the same app. Its requested uses must be a subset of the signed consent, and marketing use requires commercial permission. Human-likeness avatars require equivalent identity and consent evidence. Synthetic avatars require an app-owned portrait and creation-evidence artifact. A default voice is accepted for avatar verification only when it is a verified, usable voice profile owned by the same app.

The currently proven surface is evidence upload and governed reusable profile management. `voice_clone`, `voice_conversion`, `lip_sync` and `avatar_generation` execution must not be treated as live until an exact approved provider transport, runtime-selected model, durable output, cost evidence and real-service proof are added.

## Webhooks

When an administrator configures a webhook, store the returned `webhookSigningSecret`; like the API key, it is shown only once. Terminal `job.completed` and `job.failed` requests are sent only to that exact configured HTTPS URL. Verify `X-AmarktAI-Signature` as HMAC-SHA256 over `<X-AmarktAI-Timestamp>.<raw request body>` using the signing secret, reject stale timestamps, and deduplicate with `X-AmarktAI-Event-Id` (also supplied as `Idempotency-Key`). A per-request `callbackUrl`, when supplied, must exactly match the configured endpoint.
