#!/usr/bin/env node

import { readFileSync } from 'node:fs'
import { resolve } from 'node:path'

const ROOT = resolve(import.meta.dirname, '..')
const argv = process.argv.slice(2)
const options = {
  static: argv.includes('--static') || !argv.includes('--live'),
  live: argv.includes('--live'),
  strict: argv.includes('--strict'),
  capability: valueArg('--capability'),
  provider: valueArg('--provider'),
}
const checks = []

function valueArg(name) {
  const inline = argv.find((argument) => argument.startsWith(`${name}=`))
  if (inline) return inline.slice(name.length + 1).trim()
  const index = argv.indexOf(name)
  return index >= 0 ? String(argv[index + 1] ?? '').trim() : ''
}

function check(ok, label, detail = '') {
  const result = { ok: Boolean(ok), label, detail }
  checks.push(result)
  console.log(`${result.ok ? 'PASS' : 'FAIL'} ${label}${detail ? ` :: ${detail}` : ''}`)
  return result.ok
}

function safeError(error) {
  return (error instanceof Error ? error.message : String(error))
    .replace(/Bearer\s+\S+/gi, 'Bearer [redacted]')
    .replace(/amark_[a-f0-9]+/gi, 'amark_[redacted]')
    .slice(0, 1_000)
}

async function loadCore() {
  try {
    const [contracts, registry, orchestra, jobs] = await Promise.all([
      import('../packages/core/dist/direct-provider-contracts.js'),
      import('../packages/core/dist/executor-registry.js'),
      import('../packages/core/dist/orchestra.js'),
      import('../packages/core/dist/jobs.js'),
    ])
    return { ...contracts, ...registry, ...orchestra, ...jobs }
  } catch (error) {
    throw new Error(`Built core package is required. Run npm run build:backend first. ${safeError(error)}`)
  }
}

async function runStatic(core) {
  console.log('\nDIRECT_PROVIDER_STATIC_PROOF')
  const {
    DIRECT_PROVIDER_CAPABILITIES,
    DIRECT_PROVIDER_REQUEST_SCHEMAS,
    DIRECT_PROVIDER_OUTPUT_SCHEMAS,
    EXECUTOR_REGISTRATIONS,
    evaluateOrchestra,
    hasBlockedOverrides,
    normalizeDbCandidates,
  } = core
  const expected = [
    'chat', 'streaming_chat', 'reasoning', 'code', 'summarization', 'translation',
    'question_answering', 'classification', 'zero_shot_classification', 'extraction',
    'token_classification', 'fill_mask', 'feature_extraction', 'sentence_similarity',
    'table_qa', 'structured_output', 'tool_use', 'tts', 'stt', 'embeddings',
    'reranking', 'image_generation', 'video_generation', 'music_generation',
  ]
  check(JSON.stringify(DIRECT_PROVIDER_CAPABILITIES) === JSON.stringify(expected), 'exact 24-capability phase scope')
  if (options.capability && !expected.includes(options.capability)) throw new Error(`Unknown direct capability '${options.capability}'`)
  const registrations = EXECUTOR_REGISTRATIONS.filter((registration) =>
    expected.includes(registration.capability)
      && (!options.capability || registration.capability === options.capability)
      && (!options.provider || registration.provider === options.provider),
  )
  const capabilities = [...new Set(registrations.map((registration) => registration.capability))]
  if (options.capability && registrations.length === 0) check(false, `${options.capability} has registration for requested provider`, options.provider)

  const providerSources = {
    groq: ['packages/providers/src/groq-client.ts', 'packages/providers/src/openai-transport.ts'],
    deepinfra: ['packages/providers/src/deepinfra-client.ts', 'packages/providers/src/deepinfra-task-client.ts', 'packages/providers/src/retrieval-client.ts'],
    together: ['packages/providers/src/together-client.ts', 'packages/providers/src/retrieval-client.ts'],
    genx: ['packages/providers/src/genx-client.ts'],
  }
  const worker = read('apps/worker/src/providers/provider-executor.ts')
  const directWorker = read('apps/worker/src/providers/direct-provider-executor.ts')
  const streamRoute = read('apps/api/src/routes/streaming-chat.ts')
  const jobsRoute = read('apps/api/src/routes/jobs.ts')
  const orchestraSource = read('packages/core/src/orchestra.ts')

  for (const registration of registrations) {
    const key = `${registration.capability}/${registration.provider}/${registration.id}`
    const sources = providerSources[registration.provider] ?? []
    check(sources.length > 0 && sources.every((file) => read(file).length > 100), `${key} real provider client exists`)
    const handlerExists = registration.executionMode === 'stream'
      ? streamRoute.includes(`openAiStreamingChat`) && streamRoute.includes(`groq.streaming-chat`)
      : directWorker.includes(registration.handlerName) || worker.includes(registration.handlerName)
    check(handlerExists, `${key} real handler exists`, registration.handlerName)
    check(Boolean(DIRECT_PROVIDER_REQUEST_SCHEMAS[registration.capability]), `${key} request schema exists`)
    check(Boolean(DIRECT_PROVIDER_OUTPUT_SCHEMAS[registration.capability]), `${key} output schema exists`)
    check(registration.modelCompatibility === 'exact_model_allowlist' && registration.compatibleModels.length > 0, `${key} exact model contract exists`)

    const candidate = readyCandidate(registration)
    const decision = evaluateOrchestra({ capability: registration.capability, appGrant: proofGrant(registration.capability), executionId: 'static-proof' }, [candidate])
    check(decision.executionAllowed && decision.selectedExecutorId === registration.id && decision.selectedModel === registration.compatibleModels[0], `${key} Orchestra candidate is eligible`)

    const model = {
      provider: registration.provider,
      modelId: registration.compatibleModels[0],
      displayName: 'Static proof model',
      status: 'active',
      capabilitiesJson: JSON.stringify([registration.capability]),
    }
    const healthyProvider = { providerKey: registration.provider, enabled: true, healthStatus: 'live', apiKey: 'encrypted-static-proof-key' }
    const noCredential = normalizeDbCandidates([model], [{ ...healthyProvider, apiKey: '' }], registration.capability, { databaseReady: true, queueReady: true })[0]
    const noHealth = normalizeDbCandidates([model], [{ ...healthyProvider, healthStatus: 'configured' }], registration.capability, { databaseReady: true, queueReady: true })[0]
    const noDatabase = normalizeDbCandidates([model], [healthyProvider], registration.capability, { databaseReady: false, queueReady: true })[0]
    const incompatible = normalizeDbCandidates([{ ...model, modelId: 'unregistered-model' }], [healthyProvider], registration.capability, { databaseReady: true, queueReady: true })[0]
    check(noCredential && !noCredential.executionReady && !noCredential.providerConfigured, `${key} missing credential fails closed`)
    check(noHealth && !noHealth.executionReady && !noHealth.providerHealthReady, `${key} unproven health fails closed`)
    check(noDatabase && !noDatabase.executionReady && !noDatabase.databaseReady, `${key} missing database evidence fails closed`)
    check(incompatible && !incompatible.executionReady && !incompatible.modelCompatible, `${key} incompatible model fails closed`)
  }

  for (const capability of options.capability ? [options.capability] : expected) {
    check(Boolean(DIRECT_PROVIDER_REQUEST_SCHEMAS[capability]), `${capability} canonical request schema is present`)
    check(Boolean(DIRECT_PROVIDER_OUTPUT_SCHEMAS[capability]), `${capability} canonical output schema is present`)
    check(EXECUTOR_REGISTRATIONS.some((registration) => registration.capability === capability), `${capability} has at least one callable registration`)
  }
  for (const field of ['provider', 'model', 'providerKey', 'modelId', 'selectedProvider', 'selectedModel', 'providerOverride', 'modelOverride']) {
    check(hasBlockedOverrides({ [field]: 'forbidden' }) === field, `public override '${field}' is blocked`)
  }
  check(jobsRoute.includes('hasBlockedOverrides((body.input ?? {})') && streamRoute.includes('hasBlockedOverrides((body.input ?? {})'), 'nested provider/model overrides are blocked')
  check(!worker.includes('infrastructureReady: true'), 'worker has no hardcoded infrastructureReady=true')
  check(orchestraSource.includes('providerConfigured = typeof provider?.apiKey') && orchestraSource.includes('providerHealthReady = HEALTHY_PROVIDER_STATUSES.has'), 'runtime readiness derives from credential and health evidence')
  check(worker.includes("result.provider !== route.provider") && worker.includes("result.model !== route.model"), 'executor rejects hidden provider/model substitution')
  check(streamRoute.includes("selectedProvider !== 'groq'") && streamRoute.includes('signal: controller.signal'), 'streaming route has exact provider gate and cancellation')
  check(capabilities.length > 0, 'static proof selected at least one registered capability')
}

function readyCandidate(registration) {
  return {
    provider: registration.provider,
    model: registration.compatibleModels[0],
    displayName: 'Static proof',
    capability: registration.capability,
    executorId: registration.id,
    providerConfigured: true,
    providerEnabled: true,
    providerHealth: 'live',
    providerHealthReady: true,
    providerAccountAllowed: true,
    providerPolicyAllowed: true,
    modelLifecycleAllowed: true,
    adapterSupported: true,
    executorSupported: true,
    requestShapeKnown: true,
    responseShapeKnown: true,
    endpointReady: true,
    databaseReady: true,
    queueReady: true,
    modelCompatible: true,
    infrastructureReady: true,
    executionReady: true,
    liveProven: false,
    estimatedCost: null,
    costTier: 'low', qualityTier: 'balanced', latencyTier: 'low', pricingConfidence: 'unknown',
    score: 0, scoreBreakdown: {}, blockers: [],
  }
}

function proofGrant(capability) {
  return {
    appSlug: process.env.PROOF_APP_SLUG || 'direct-provider-proof', capability, enabled: true,
    qualityFloor: 'balanced', budgetPolicy: 'balanced', maxCostPerRequest: 0, maxCostPerWorkflow: 0,
    latencyPreference: 'medium', allowFallback: true, maxFallbackAttempts: 2, liveProofRequired: false,
    approvalRequired: false, artifactRead: true, artifactWrite: true, memoryRead: false, memoryWrite: false,
    ragNamespaces: [], policyProfile: 'standard', adultPermission: false, dataRetentionPolicy: 'proof',
    passthroughModelAllowed: false, providerResidencyConstraints: [],
  }
}

async function runLive(core) {
  console.log('\nDIRECT_PROVIDER_LIVE_PROOF')
  const baseUrl = (process.env.PROOF_API_URL || 'https://amarktai.co.za').replace(/\/$/, '')
  const email = process.env.PROOF_ADMIN_EMAIL || process.env.ADMIN_EMAIL
  const password = process.env.PROOF_ADMIN_PASSWORD || process.env.ADMIN_PASSWORD
  if (!email || !password) throw new Error('PROOF_ADMIN_EMAIL and PROOF_ADMIN_PASSWORD are required for authenticated live proof')
  const requested = selectedLiveCapabilities(core)
  const adminToken = await adminLogin(baseUrl, email, password)
  const appSlug = process.env.PROOF_APP_SLUG || 'direct-provider-proof'
  const appKey = await prepareProofApp(baseUrl, adminToken, appSlug, requested)
  await requestJson(`${baseUrl}/api/admin/model-catalog/seed`, { method: 'POST', token: adminToken, body: {} }).catch((error) => {
    check(false, 'canonical model catalogue seed', safeError(error))
  })

  const results = []
  let ttsArtifactId = process.env.PROOF_STT_ARTIFACT_ID || ''
  const ordered = [...requested].sort((left, right) => orderCapability(left) - orderCapability(right))
  for (const capability of ordered) {
    try {
      let result
      if (capability === 'streaming_chat') result = await proveStreaming(baseUrl, appKey, appSlug)
      else {
        const input = liveInput(capability, ttsArtifactId)
        result = await submitAndPoll(baseUrl, appKey, appSlug, capability, input)
      }
      validateLiveResult(core, capability, result, appSlug)
      if (options.provider && result.provider !== options.provider) throw new Error(`Orchestra selected ${result.provider}; requested proof provider was ${options.provider}`)
      if (capability === 'tts' && result.artifactId) ttsArtifactId = result.artifactId
      results.push({ capability, ok: true, ...proofSummary(result) })
      check(true, `${capability} live authenticated execution`, `${result.provider}/${result.model}/${result.executionEvidence?.executorId ?? 'unknown-executor'}`)
    } catch (error) {
      results.push({ capability, ok: false, error: safeError(error) })
      check(false, `${capability} live authenticated execution`, safeError(error))
    }
  }
  console.log(JSON.stringify({ mode: 'live', appSlug, capabilities: results }, null, 2))
}

function selectedLiveCapabilities(core) {
  let capabilities = [...core.DIRECT_PROVIDER_CAPABILITIES]
  if (options.capability) capabilities = capabilities.filter((capability) => capability === options.capability)
  if (options.provider) {
    const supported = new Set(core.EXECUTOR_REGISTRATIONS.filter((registration) => registration.provider === options.provider).map((registration) => registration.capability))
    capabilities = capabilities.filter((capability) => supported.has(capability))
  }
  if (capabilities.length === 0) throw new Error('No capabilities match the requested live proof filters')
  return capabilities
}

async function adminLogin(baseUrl, email, password) {
  const response = await requestJson(`${baseUrl}/api/v1/auth/login`, { method: 'POST', body: { email, password } })
  if (!response.token) throw new Error('Admin login returned no token')
  return response.token
}

async function prepareProofApp(baseUrl, adminToken, appSlug, capabilities) {
  const list = await requestJson(`${baseUrl}/api/admin/app-connections`, { token: adminToken })
  const exists = Array.isArray(list.connections) && list.connections.some((connection) => connection.appSlug === appSlug)
  const connectionBody = { appSlug, appName: 'Direct Provider Capability Proof', allowedCapabilities: capabilities, dailyBudgetCents: 0 }
  if (exists) {
    await requestJson(`${baseUrl}/api/admin/app-connections/${encodeURIComponent(appSlug)}`, {
      method: 'PUT', token: adminToken, body: { ...connectionBody, status: 'active', tokenBalance: 1_000_000 },
    })
  } else {
    await requestJson(`${baseUrl}/api/admin/app-connections`, { method: 'POST', token: adminToken, body: connectionBody })
    await requestJson(`${baseUrl}/api/admin/app-connections/${encodeURIComponent(appSlug)}`, { method: 'PUT', token: adminToken, body: { tokenBalance: 1_000_000 } })
  }
  const existingGrants = await requestJson(`${baseUrl}/api/admin/app-grants/${encodeURIComponent(appSlug)}`, { token: adminToken })
  for (const capability of Object.keys(existingGrants.grants ?? {})) {
    if (!capabilities.includes(capability)) {
      await requestJson(`${baseUrl}/api/admin/app-grants/${encodeURIComponent(appSlug)}/${encodeURIComponent(capability)}`, { method: 'DELETE', token: adminToken })
    }
  }
  for (const capability of capabilities) {
    await requestJson(`${baseUrl}/api/admin/app-grants/${encodeURIComponent(appSlug)}/${encodeURIComponent(capability)}`, {
      method: 'PUT', token: adminToken, body: proofGrant(capability),
    })
  }
  const oldKeys = await requestJson(`${baseUrl}/api/admin/app-connections/${encodeURIComponent(appSlug)}/keys`, { token: adminToken })
  for (const key of oldKeys.keys ?? []) {
    if (key.label === 'direct-provider-proof' && key.active) {
      await requestJson(`${baseUrl}/api/admin/app-connections/${encodeURIComponent(appSlug)}/keys/${encodeURIComponent(key.id)}`, { method: 'DELETE', token: adminToken })
    }
  }
  const created = await requestJson(`${baseUrl}/api/admin/app-connections/${encodeURIComponent(appSlug)}/keys`, {
    method: 'POST', token: adminToken, body: { label: 'direct-provider-proof' },
  })
  if (!created.key) throw new Error('Proof app key creation returned no key')
  return created.key
}

async function submitAndPoll(baseUrl, appKey, appSlug, capability, input) {
  const created = await requestJson(`${baseUrl}/api/v1/jobs`, {
    method: 'POST', token: appKey, body: { capability, prompt: livePrompt(capability), input, metadata: { proofRun: 'direct-provider-capabilities' } },
  })
  const deadline = Date.now() + Number(process.env.PROOF_TIMEOUT_MS || 900_000)
  let job
  do {
    await delay(Number(process.env.PROOF_POLL_MS || 2_000))
    job = await requestJson(`${baseUrl}/api/v1/jobs/${encodeURIComponent(created.jobId)}`, { token: appKey })
  } while (!['completed', 'failed', 'cancelled'].includes(job.status) && Date.now() < deadline)
  if (!job || !['completed', 'failed', 'cancelled'].includes(job.status)) throw new Error(`${capability} job ${created.jobId} timed out`)
  if (job.status !== 'completed') throw new Error(`${capability} job ${created.jobId} ended ${job.status}: ${job.error ?? 'no error detail'}`)
  if (job.appSlug !== appSlug) throw new Error(`${capability} returned the wrong app slug`)
  if (job.artifactId) job.artifactDownload = await downloadArtifact(baseUrl, appKey, job.artifactId)
  return job
}

async function proveStreaming(baseUrl, appKey, appSlug) {
  const response = await fetch(`${baseUrl}/api/v1/streaming-chat`, {
    method: 'POST', headers: { Authorization: `Bearer ${appKey}`, 'Content-Type': 'application/json', Accept: 'text/event-stream' },
    body: JSON.stringify({ capability: 'streaming_chat', prompt: livePrompt('streaming_chat'), input: { maxOutputTokens: 300 }, metadata: { proofRun: 'direct-provider-capabilities' } }),
  })
  if (!response.ok) throw new Error(`streaming_chat HTTP ${response.status}: ${(await response.text()).slice(0, 500)}`)
  const body = await response.text()
  const events = parseSse(body)
  const route = events.find((event) => event.event === 'route')?.data
  const chunks = events.filter((event) => event.event === 'chunk')
  const complete = events.find((event) => event.event === 'complete')?.data
  const failure = events.find((event) => event.event === 'error')?.data
  if (failure) throw new Error(`streaming_chat failed: ${failure.message}`)
  if (!route?.jobId || !complete) throw new Error('streaming_chat did not emit route and complete events')
  const job = await requestJson(`${baseUrl}/api/v1/jobs/${encodeURIComponent(route.jobId)}`, { token: appKey })
  return { ...job, appSlug, streamedContent: chunks.map((chunk) => chunk.data.delta).join(''), upstreamChunks: chunks.length, streamRoute: route }
}

function validateLiveResult(core, capability, result, appSlug) {
  if (!result.jobId || !result.executionId || result.appSlug !== appSlug) throw new Error(`${capability} is missing job/execution/app evidence`)
  if (!result.provider || !result.model) throw new Error(`${capability} is missing exact provider/model evidence`)
  const evidence = result.executionEvidence ?? {}
  if (!evidence.grantSnapshotSource || !evidence.executorId || !evidence.routeType) throw new Error(`${capability} is missing grant/executor/route evidence`)
  if (!evidence.usage || typeof evidence.usage !== 'object') throw new Error(`${capability} is missing canonical usage evidence`)
  if (!evidence.cost || typeof evidence.cost !== 'object') throw new Error(`${capability} is missing cost provenance (null is allowed, omission is not)`)
  if (!evidence.outputValidation?.valid) throw new Error(`${capability} output was not marked valid by the executor`)
  let output
  if (capability === 'chat') output = result.output
  else if (capability === 'streaming_chat') output = { content: result.streamedContent, chunks: result.upstreamChunks }
  else output = parseOutput(result.output, capability)
  const validation = core.validateJsonSchemaValue(output, core.DIRECT_PROVIDER_OUTPUT_SCHEMAS[capability])
  if (!validation.valid) throw new Error(`${capability} output schema failed: ${validation.errors.join('; ')}`)
  if (capability === 'streaming_chat' && result.upstreamChunks < 2) throw new Error('streaming_chat emitted fewer than two real upstream chunks')
  if (capability === 'tool_use' && (!Array.isArray(output.toolCalls) || !output.toolCalls.some((call) => call.tool === 'calculator' && call.outcome === 'completed'))) throw new Error('tool_use did not execute the registered calculator')
  if (capability === 'embeddings' && (!Array.isArray(output.vectors) || output.vectors.some((vector) => vector.length !== output.dimensions))) throw new Error('embeddings dimensions are inconsistent')
  if (capability === 'reranking' && output.results.some((entry, index) => index > 0 && output.results[index - 1].score < entry.score)) throw new Error('reranking scores are not sorted descending')
  if (result.artifactId && (!result.artifactDownload?.ok || !result.artifactDownload.signatureValid)) throw new Error(`${capability} artifact download or signature validation failed`)
}

function proofSummary(result) {
  return {
    jobId: result.jobId, executionId: result.executionId, appSlug: result.appSlug,
    provider: result.provider, model: result.model, executorId: result.executionEvidence?.executorId,
    routeType: result.executionEvidence?.routeType,
    fallbackAttempts: Math.max(0, (result.executionEvidence?.fallbackAttempts?.length ?? 1) - 1),
    grantSnapshotSource: result.executionEvidence?.grantSnapshotSource,
    usage: result.executionEvidence?.usage, cost: result.executionEvidence?.cost,
    outputValidation: result.executionEvidence?.outputValidation,
    artifactId: result.artifactId ?? null, artifactDownload: result.artifactDownload ?? null,
    upstreamChunks: result.upstreamChunks ?? null,
  }
}

function liveInput(capability, ttsArtifactId) {
  const inputs = {
    chat: {}, reasoning: { context: 'Use arithmetic and provide a concise rationale.', effort: 'low' },
    code: { language: 'javascript', task: 'Write a function add(a, b) that returns their sum.' },
    summarization: { sourceText: 'AmarktAI routes capability requests through governed provider executors. Runtime readiness requires credentials, health, infrastructure, and exact model compatibility.', includeKeyPoints: true },
    translation: { sourceText: 'The platform is ready for testing.', targetLanguage: 'Afrikaans' },
    question_answering: { question: 'Which checks are required?', context: 'Required checks are credentials, provider health, infrastructure, and exact model compatibility.', sourceIds: ['proof-context'] },
    classification: { text: 'The service was fast and reliable.', labels: ['positive', 'negative'], multiLabel: false },
    zero_shot_classification: { text: 'The invoice is overdue.', labels: ['finance', 'sports', 'travel'], multiLabel: false },
    extraction: { sourceText: 'Order A-42 has total 19.95 USD.', schema: { type: 'object', properties: { orderId: { type: 'string' }, total: { type: 'number' }, currency: { type: 'string' } }, required: ['orderId', 'total', 'currency'], additionalProperties: false } },
    token_classification: { text: 'Nelson Mandela was born in Mvezo.' },
    fill_mask: { text: 'The capital of France is [MASK].', topK: 3 },
    feature_extraction: { text: ['provider runtime proof', 'exact model evidence'] },
    sentence_similarity: { sourceSentence: 'The service is reliable.', comparisonSentences: ['The platform is dependable.', 'The sky is green.'] },
    table_qa: { question: 'What is the total for order B?', table: { order: ['A', 'B'], total: [10, 25] } },
    structured_output: { context: 'Return status ready and count 2.', schema: { type: 'object', properties: { status: { type: 'string', enum: ['ready'] }, count: { type: 'integer', minimum: 2, maximum: 2 } }, required: ['status', 'count'], additionalProperties: false } },
    tool_use: { allowedTools: ['calculator'], maxIterations: 3 },
    tts: { text: 'AmarktAI direct provider runtime proof is active.', voice: 'tara', outputFormat: 'wav' },
    stt: { artifactId: ttsArtifactId, timestamps: 'segment', persistTranscript: true },
    embeddings: { texts: ['provider runtime proof', 'exact model evidence'] },
    reranking: { query: 'exact provider execution evidence', documents: [{ id: 'a', text: 'A cooking recipe.' }, { id: 'b', text: 'Provider, model, executor, usage and cost evidence.' }], topN: 2 },
    image_generation: { width: 512, height: 512, steps: 4 },
    video_generation: { duration: 4, aspectRatio: '16:9' },
    music_generation: { instrumentalOnly: true, vocalsRequested: false },
  }
  const input = inputs[capability]
  if (!input) throw new Error(`No live input fixture for '${capability}'`)
  if (capability === 'stt' && !ttsArtifactId) throw new Error('STT requires a proven authorised artifact; run TTS in the same proof or set PROOF_STT_ARTIFACT_ID')
  return input
}

function livePrompt(capability) {
  if (capability === 'streaming_chat') return 'Explain in at least six short sentences why exact provider, model, executor, usage, and cost evidence matter in a governed AI runtime.'
  if (capability === 'tool_use') return 'Use the calculator tool to compute 17 * 23, then state the result.'
  if (capability === 'image_generation') return 'A simple blue circle centered on a white background, clean icon style.'
  if (capability === 'video_generation') return 'A red ball bounces once on a plain white background.'
  if (capability === 'music_generation') return 'A gentle instrumental ambient piano motif for a calm product demo.'
  return `Execute a deterministic validation for the ${capability} capability.`
}

function orderCapability(capability) {
  if (capability === 'tts') return 1
  if (capability === 'stt') return 2
  return 0
}

async function downloadArtifact(baseUrl, appKey, artifactId) {
  const response = await fetch(`${baseUrl}/api/v1/artifacts/${encodeURIComponent(artifactId)}/file`, { headers: { Authorization: `Bearer ${appKey}` } })
  const buffer = Buffer.from(await response.arrayBuffer())
  const mimeType = (response.headers.get('content-type') || '').split(';')[0]
  return { ok: response.ok, status: response.status, mimeType, bytes: buffer.length, signatureValid: response.ok && mediaSignature(buffer, mimeType) }
}

function mediaSignature(buffer, mimeType) {
  const ascii = (start, end) => buffer.subarray(start, end).toString('ascii')
  if (mimeType === 'image/png') return buffer.length >= 8 && buffer.subarray(1, 4).toString('ascii') === 'PNG'
  if (mimeType === 'image/jpeg') return buffer[0] === 0xff && buffer[1] === 0xd8
  if (mimeType === 'video/mp4' || mimeType === 'video/quicktime') return ascii(4, 8) === 'ftyp'
  if (mimeType === 'video/webm') return buffer.subarray(0, 4).equals(Buffer.from([0x1a, 0x45, 0xdf, 0xa3]))
  if (mimeType === 'audio/wav' || mimeType === 'audio/x-wav') return ascii(0, 4) === 'RIFF' && ascii(8, 12) === 'WAVE'
  if (mimeType === 'audio/mpeg') return ascii(0, 3) === 'ID3' || (buffer[0] === 0xff && (buffer[1] & 0xe0) === 0xe0)
  if (mimeType === 'audio/ogg') return ascii(0, 4) === 'OggS'
  if (mimeType === 'audio/flac') return ascii(0, 4) === 'fLaC'
  if (mimeType === 'application/json') { try { JSON.parse(buffer.toString('utf8')); return true } catch { return false } }
  return false
}

function parseOutput(value, capability) {
  if (typeof value !== 'string' || !value.trim()) throw new Error(`${capability} returned empty output`)
  try { return JSON.parse(value) } catch { throw new Error(`${capability} returned invalid JSON output`) }
}

function parseSse(body) {
  return body.split(/\r?\n\r?\n/).flatMap((block) => {
    let event = 'message'; const data = []
    for (const line of block.split(/\r?\n/)) {
      if (line.startsWith('event:')) event = line.slice(6).trim()
      if (line.startsWith('data:')) data.push(line.slice(5).trim())
    }
    if (!data.length) return []
    try { return [{ event, data: JSON.parse(data.join('\n')) }] } catch { return [] }
  })
}

async function requestJson(url, { method = 'GET', token, body } = {}) {
  const response = await fetch(url, {
    method,
    headers: { ...(token ? { Authorization: `Bearer ${token}` } : {}), ...(body !== undefined ? { 'Content-Type': 'application/json' } : {}), Accept: 'application/json' },
    ...(body !== undefined ? { body: JSON.stringify(body) } : {}),
  })
  const text = await response.text()
  let data = {}
  try { data = text ? JSON.parse(text) : {} } catch { data = { message: text.slice(0, 500) } }
  if (!response.ok) throw new Error(`HTTP ${response.status} ${method} ${new URL(url).pathname}: ${data.message ?? text.slice(0, 500)}`)
  return data
}

function read(relativePath) {
  return readFileSync(resolve(ROOT, relativePath), 'utf8')
}

function delay(ms) { return new Promise((resolveDelay) => setTimeout(resolveDelay, ms)) }

async function main() {
  const core = await loadCore()
  if (options.static) await runStatic(core)
  if (options.live) await runLive(core)
  const failures = checks.filter((result) => !result.ok)
  console.log(`\nDIRECT_PROVIDER_PROOF_RESULT=${checks.length - failures.length}/${checks.length}`)
  if (failures.length && options.strict) process.exitCode = 1
}

main().catch((error) => {
  console.error(`DIRECT_PROVIDER_PROOF_FATAL=${safeError(error)}`)
  process.exitCode = 1
})
