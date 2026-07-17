#!/usr/bin/env node
import { writeFile } from 'node:fs/promises'
import { PROVIDER_KEYS, RUNTIME_EXECUTION_PROVIDERS, getInternalDashboardApps, getReleaseCandidateCapabilityKeys } from '@amarktai/core'

const args = parseArgs(process.argv.slice(2))
const baseUrl = String(args['base-url'] || '').replace(/\/$/, '')
const strict = args.strict === true
const skipExpensive = args['skip-expensive'] === true
const includeLongForm = args['long-form'] === true || strict
const fixtureMode = args.fixture === true
const capabilityFilter = typeof args.capability === 'string' ? new Set(args.capability.split(',').filter(Boolean)) : null
const jsonOutput = typeof args['json-output'] === 'string' ? args['json-output'] : ''
if (!baseUrl) throw new Error('--base-url is required')

const report = {
  buildSha: null,
  timestamp: new Date().toISOString(),
  mode: fixtureMode ? 'local_fixture' : 'deployed_live',
  strict,
  tests: [],
}
let token = ''
let ttsArtifactId = ''
let imageArtifactId = ''
let videoArtifactId = ''

function record(test, status, fields = {}) {
  const row = {
    buildSha: report.buildSha,
    timestamp: new Date().toISOString(),
    test,
    status,
    provider: fields.provider ?? null,
    model: fields.model ?? null,
    jobId: fields.jobId ?? null,
    executionId: fields.executionId ?? null,
    artifactId: fields.artifactId ?? null,
    evidence: fields.evidence ?? null,
    blocker: fields.blocker ?? null,
  }
  report.tests.push(row)
  console.log(`${status} ${test}${row.blocker ? ` - ${row.blocker}` : ''}`)
  return row
}

async function request(path, init = {}) {
  const { raw = false, ...requestInit } = init
  const headers = new Headers(init.headers || {})
  if (token && !headers.has('Authorization')) headers.set('Authorization', `Bearer ${token}`)
  const response = await fetch(`${baseUrl}${path}`, { ...requestInit, headers, signal: init.signal || AbortSignal.timeout(30_000) })
  const contentType = response.headers.get('content-type') || ''
  const body = raw ? null : contentType.includes('json') ? await response.json().catch(() => ({})) : await response.text().catch(() => '')
  return { response, body }
}

async function runCheck(name, run) {
  try {
    const evidence = await run()
    record(name, 'PASS', evidence || {})
    return evidence
  } catch (error) {
    record(name, 'FAIL', { blocker: safeError(error) })
    return null
  }
}

await runCheck('dashboard_and_platform_health', async () => {
  const { response, body } = await request('/api/system/health')
  if (!response.ok || body.ready !== true) throw new Error(`health returned ${response.status}`)
  const required = ['process', 'mariadb', 'redis', 'qdrant', 'migrations', 'artifactStorage', 'ffmpeg', 'worker']
  for (const name of required) if (body.checks?.[name]?.ok !== true) throw new Error(`${name} is unhealthy`)
  report.buildSha = body.build?.gitSha || null
  if (!report.buildSha || body.checks.worker?.gitSha !== report.buildSha) throw new Error('API/worker build SHA mismatch')
  const dashboard = await request('/api/build-identity')
  if (!dashboard.response.ok || dashboard.body.build?.gitSha !== report.buildSha) throw new Error('API/worker/dashboard build SHA mismatch')
  return { evidence: { build: body.build, dashboardBuild: dashboard.body.build, checks: body.checks } }
})

await runCheck('invalid_login_rejected', async () => {
  const { response } = await request('/api/auth/login', {
    method: 'POST', headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ email: process.env.ADMIN_EMAIL || 'fixture-admin@invalid.example', password: 'deliberately-invalid-fixture-password' }),
  })
  if (response.status !== 401) throw new Error(`expected 401, received ${response.status}`)
})

await runCheck('admin_login', async () => {
  const email = process.env.ADMIN_EMAIL
  const password = process.env.ADMIN_PASSWORD
  if (!email || !password) throw new Error('ADMIN_EMAIL and ADMIN_PASSWORD are required')
  const { response, body } = await request('/api/auth/login', {
    method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ email, password }),
  })
  if (!response.ok || typeof body.token !== 'string') throw new Error(`login returned ${response.status}`)
  token = body.token
  return { evidence: { role: body.user?.role || 'admin' } }
})

await runCheck('invalid_token_rejected', async () => {
  const { response } = await request('/api/admin/truth', { headers: { Authorization: 'Bearer invalid-release-proof-token' } })
  if (response.status !== 401) throw new Error(`expected 401, received ${response.status}`)
})

const truthResult = await runCheck('canonical_truth', async () => {
  const { response, body } = await request('/api/admin/truth')
  if (!response.ok || !body.truth) throw new Error(`truth returned ${response.status}`)
  const truth = body.truth
  const providerKeys = truth.providers?.map((item) => item.provider)
  if (JSON.stringify(providerKeys) !== JSON.stringify([...PROVIDER_KEYS])) throw new Error('approved provider identities differ')
  if (truth.providers.filter((item) => item.runtimeExecutionProvider).length !== RUNTIME_EXECUTION_PROVIDERS.length) throw new Error('runtime provider count differs from canonical policy')
  if (!truth.providers.find((item) => item.provider === 'mimo')?.codingOnly) throw new Error('MiMo is not coding-agent-only')
  const expectedRelease = getReleaseCandidateCapabilityKeys()
  if (JSON.stringify(truth.releaseCandidateCapabilities) !== JSON.stringify(expectedRelease)) throw new Error('release set differs from canonical implementation evidence')
  return { evidence: truth }
})
const truth = truthResult?.evidence

await runCheck('provider_status_consistency', async () => {
  const { response, body } = await request('/api/admin/providers')
  if (!response.ok || !Array.isArray(body.providers)) throw new Error(`providers returned ${response.status}`)
  const projected = truth?.providers || []
  for (const provider of body.providers) {
    const canonical = projected.find((item) => item.provider === provider.providerKey)
    if (!canonical || canonical.credentialConfigured !== provider.configured || canonical.healthStatus !== provider.healthStatus) throw new Error(`${provider.providerKey} differs from canonical truth`)
  }
  return { evidence: { count: body.providers.length } }
})

await runCheck('dashboard_apps_and_grants', async () => {
  const expectedApps = getInternalDashboardApps()
  const connectionsResult = await request('/api/admin/app-connections')
  if (!connectionsResult.response.ok || !Array.isArray(connectionsResult.body.connections)) throw new Error(`app connections returned ${connectionsResult.response.status}`)
  for (const expected of expectedApps) {
    const connection = connectionsResult.body.connections.find((item) => item.appSlug === expected.appSlug)
    if (!connection || connection.status !== 'active') throw new Error(`${expected.appSlug} is missing or inactive`)
    const grantsResult = await request(`/api/admin/app-grants/${encodeURIComponent(expected.appSlug)}`)
    if (!grantsResult.response.ok || !grantsResult.body.grants) throw new Error(`${expected.appSlug} grants returned ${grantsResult.response.status}`)
    for (const capability of expected.capabilities) {
      if (grantsResult.body.grants[capability]?.enabled !== true) throw new Error(`${expected.appSlug}/${capability} is missing or disabled`)
    }
  }
  return { evidence: { appCount: expectedApps.length, grantCount: expectedApps.reduce((total, app) => total + app.capabilities.length, 0) } }
})

if (fixtureMode) {
  await runCheck('fixture_live_provider_boundary', async () => {
    const { response, body } = await request('/api/admin/providers')
    if (!response.ok || !Array.isArray(body.providers)) throw new Error(`providers returned ${response.status}`)
    if (body.providers.some((provider) => provider.healthStatus === 'live')) throw new Error('fixture provider was incorrectly marked live')
    return { evidence: { liveCallsMade: 0, liveProviderProof: false } }
  })
} else {
  await runCheck('authenticated_live_discovery', async () => {
    const { response, body } = await request('/api/admin/models/discovery/run', {
      method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ live: true, strict: true }), signal: AbortSignal.timeout(120_000),
    })
    if (!response.ok || body.success !== true || body.live !== true) throw new Error(body.message || `discovery returned ${response.status}`)
    return { evidence: body.summary }
  })

  for (const provider of RUNTIME_EXECUTION_PROVIDERS) {
    await runCheck(`provider_live_test:${provider}`, async () => {
      const { response, body } = await request(`/api/admin/providers/${provider}/test`, { method: 'POST', signal: AbortSignal.timeout(120_000) })
      if (!response.ok || body.provider?.healthStatus !== 'live') throw new Error(body.message || body.provider?.healthMessage || `test returned ${response.status}`)
      return { provider, evidence: { healthStatus: body.provider.healthStatus, lastCheckedAt: body.provider.lastCheckedAt } }
    })
  }
}

await runCheck('missing_external_style_grant_does_not_block_internal_dashboard', async () => {
  const appSlug = 'dashboard-studio'
  const capability = 'chat'
  const original = await readGrant(appSlug, capability)
  try {
    const removed = await request(`/api/admin/app-grants/${appSlug}/${capability}`, { method: 'DELETE' })
    if (!removed.response.ok) throw new Error(`grant delete returned ${removed.response.status}`)
    const job = await expectStudioSubmissionAccepted(capability)
    return { evidence: { appSlug, capability, internalExecution: job.status, externalStyleGrant: 'missing' } }
  } finally {
    await writeGrant(appSlug, capability, original)
  }
})

await runCheck('disabled_external_style_grant_does_not_block_internal_dashboard', async () => {
  const appSlug = 'dashboard-studio'
  const capability = 'chat'
  const original = await readGrant(appSlug, capability)
  try {
    await writeGrant(appSlug, capability, { ...original, enabled: false })
    const job = await expectStudioSubmissionAccepted(capability)
    return { evidence: { appSlug, capability, internalExecution: job.status, externalStyleGrant: 'disabled' } }
  } finally {
    await writeGrant(appSlug, capability, original)
  }
})

await runCheck('unimplemented_capability_rejected', async () => {
  const { response } = await request('/api/admin/studio/jobs', {
    method: 'POST', headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ capability: 'voice_clone', prompt: 'must remain blocked', input: {} }),
  })
  if (response.status !== 400) throw new Error(`expected 400, received ${response.status}`)
})

const cheapCapabilities = [
  'chat', 'reasoning', 'code', 'summarization', 'translation', 'question_answering', 'classification',
  'zero_shot_classification', 'extraction', 'token_classification', 'fill_mask', 'feature_extraction',
  'sentence_similarity', 'table_qa', 'structured_output', 'embeddings', 'reranking', 'tts',
]
for (const capability of cheapCapabilities) {
  if (capabilityFilter && !capabilityFilter.has(capability)) continue
  const result = await executeCapability(capability, capabilityInput(capability))
  if (capability === 'tts' && result?.artifactId) ttsArtifactId = result.artifactId
}

if (!capabilityFilter || capabilityFilter.has('streaming_chat')) await proveStreamingChat()

const expensiveCapabilities = ['image_generation', 'video_generation', 'image_to_video', 'video_to_video', 'music_generation']
for (const capability of expensiveCapabilities) {
  if (capabilityFilter && !capabilityFilter.has(capability)) continue
  if (skipExpensive) { record(`capability:${capability}`, 'SKIP', { blocker: '--skip-expensive was supplied' }); continue }
  let input = capabilityInput(capability)
  if (capability === 'image_to_video') {
    if (!imageArtifactId) { record(`capability:${capability}`, 'FAIL', { blocker: 'same-run image artifact is unavailable' }); continue }
    input = { sourceImageArtifactId: imageArtifactId, duration: 3 }
  }
  if (capability === 'video_to_video') {
    if (!videoArtifactId) { record(`capability:${capability}`, 'FAIL', { blocker: 'same-run video artifact is unavailable' }); continue }
    input = { sourceVideoArtifactId: videoArtifactId, duration: 3 }
  }
  const result = capability === 'music_generation' ? await executeMusic() : await executeCapability(capability, input, 900_000)
  if (capability === 'image_generation' && result?.artifactId) imageArtifactId = result.artifactId
  if (capability === 'video_generation' && result?.artifactId) videoArtifactId = result.artifactId
}

if (imageArtifactId) {
  await runCheck('source_artifact_permission_enforced', async () => {
    const appSlug = 'dashboard-video'
    const capability = 'image_to_video'
    const original = await readGrant(appSlug, capability)
    try {
      await writeGrant(appSlug, capability, { ...original, artifactRead: false })
      const submitted = await request('/api/admin/studio/jobs', {
        method: 'POST', headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ capability, prompt: 'source permission denial proof', input: { sourceImageArtifactId: imageArtifactId, duration: 3 } }),
      })
      if (!submitted.response.ok || !submitted.body.jobId) throw new Error(submitted.body.message || `submission returned ${submitted.response.status}`)
      const job = await pollJob(submitted.body.jobId, 300_000)
      if (job.status !== 'failed' || !String(job.error || '').includes('denies source-artifact read')) throw new Error('source-artifact execution was not denied by the immutable grant')
      return { jobId: job.id, evidence: { appSlug, capability, artifactRead: false, denied: true } }
    } finally {
      await writeGrant(appSlug, capability, original)
    }
  })
} else {
  record('source_artifact_permission_enforced', 'FAIL', { blocker: 'same-run image artifact is unavailable' })
}

if ((!capabilityFilter || capabilityFilter.has('stt')) && ttsArtifactId) {
  await executeCapability('stt', { artifactId: ttsArtifactId, language: 'en', timestamps: 'both', persistTranscript: true }, 300_000)
} else if (!capabilityFilter || capabilityFilter.has('stt')) {
  record('capability:stt', 'FAIL', { blocker: 'same-run TTS artifact is unavailable' })
}

if (includeLongForm && (!capabilityFilter || capabilityFilter.has('long_form_video'))) {
  if (skipExpensive) record('capability:long_form_video', 'SKIP', { blocker: '--skip-expensive was supplied' })
  else await executeLongForm()
}

await runCheck('provider_model_override_rejected', async () => {
  const { response } = await request('/api/admin/studio/jobs', {
    method: 'POST', headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ capability: 'chat', prompt: 'override proof', input: { provider: 'groq', model: 'manual' } }),
  })
  if (response.status !== 400) throw new Error(`expected 400, received ${response.status}`)
})

await runCheck('logout_and_session_denial', async () => {
  const oldToken = token
  const { response } = await request('/api/auth/logout', { method: 'POST' })
  if (!response.ok) throw new Error(`logout returned ${response.status}`)
  token = oldToken
  const denied = await request('/api/admin/truth')
  if (denied.response.status !== 401) throw new Error(`old token remained valid (${denied.response.status})`)
  token = ''
})

report.summary = {
  pass: report.tests.filter((item) => item.status === 'PASS').length,
  fail: report.tests.filter((item) => item.status === 'FAIL').length,
  skip: report.tests.filter((item) => item.status === 'SKIP').length,
}
if (jsonOutput) await writeFile(jsonOutput, `${JSON.stringify(report, null, 2)}\n`, { mode: 0o600 })
console.log(JSON.stringify(report.summary))
if (report.summary.fail > 0 || (strict && report.summary.skip > 0)) process.exit(1)

async function executeCapability(capability, input, timeoutMs = 300_000) {
  return runCheck(`capability:${capability}`, async () => {
    const submitted = await request('/api/admin/studio/jobs', {
      method: 'POST', headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ capability, prompt: proofPrompt(capability), input }),
    })
    if (!submitted.response.ok || !submitted.body.jobId) throw new Error(submitted.body.message || `submission returned ${submitted.response.status}`)
    const job = await pollJob(submitted.body.jobId, timeoutMs)
    if (job.status !== 'completed') throw new Error(job.error || `job ended ${job.status}`)
    validateExecutionEvidence(job)
    const artifact = job.artifactId ? await proveArtifact(job.artifactId, artifactRequirements(capability)) : null
    return { provider: job.provider, model: job.model, jobId: job.id || submitted.body.jobId, artifactId: job.artifactId, evidence: { ...job.executionEvidence, artifact } }
  })
}

async function executeMusic() {
  return runCheck('capability:music_generation', async () => {
    const submitted = await request('/api/admin/music/generate', {
      method: 'POST', headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ prompt: 'Original instrumental release proof bed', style: 'cinematic', durationSeconds: 15, instrumentalOnly: true, vocalsRequested: false }),
    })
    if (!submitted.response.ok || !submitted.body.jobId) throw new Error(submitted.body.message || `submission returned ${submitted.response.status}`)
    const job = await pollJob(submitted.body.jobId, 900_000)
    if (job.status !== 'completed') throw new Error(job.error || `job ended ${job.status}`)
    validateExecutionEvidence(job)
    const artifact = await proveArtifact(job.artifactId, artifactRequirements('music_generation'))
    return { provider: job.provider, model: job.model, jobId: job.id, artifactId: job.artifactId, evidence: { ...job.executionEvidence, artifact } }
  })
}

async function proveStreamingChat() {
  return runCheck('capability:streaming_chat', async () => {
    const result = await request('/api/admin/streaming-chat', {
      method: 'POST', headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ prompt: 'Reply with a short production proof sentence.', input: { messages: [{ role: 'user', content: 'Reply with a short production proof sentence.' }] } }), signal: AbortSignal.timeout(120_000),
    })
    if (!result.response.ok || typeof result.body !== 'string' || !result.body.includes('data:')) throw new Error(`stream returned ${result.response.status}`)
    return { evidence: { bytes: Buffer.byteLength(result.body), chunks: result.body.split('\n\n').filter(Boolean).length } }
  })
}

async function executeLongForm() {
  return runCheck('capability:long_form_video', async () => {
    const submitted = await request('/api/admin/long-form-video/executions', {
      method: 'POST', headers: { 'Content-Type': 'application/json' }, signal: AbortSignal.timeout(120_000),
      body: JSON.stringify({ request: { prompt: 'A concise original product launch story', targetDurationSeconds: 30, sceneCount: 3, aspectRatio: '16:9', style: 'cinematic', tone: 'professional', voiceoverEnabled: true, subtitlesEnabled: true, musicBedEnabled: true, count: 1, routingMode: 'balanced' } }),
    })
    if (!submitted.response.ok || !submitted.body.executionId) throw new Error(submitted.body.message || `submission returned ${submitted.response.status}`)
    const id = submitted.body.executionId
    const deadline = Date.now() + 1_800_000
    let execution
    while (Date.now() < deadline) {
      const current = await request(`/api/admin/long-form-video/executions/${id}`)
      if (!current.response.ok) throw new Error(current.body.message || `poll returned ${current.response.status}`)
      execution = current.body.execution
      if (['completed', 'failed', 'cancelled'].includes(execution?.parent?.status)) break
      await delay(5000)
    }
    if (execution?.parent?.status !== 'completed') throw new Error(execution?.parent?.error || `execution ended ${execution?.parent?.status || 'timeout'}`)
    for (const component of ['scenes', 'voiceover', 'subtitles', 'musicBed', 'assembly']) {
      const state = execution.componentState?.[component]
      if (!state) throw new Error(`${component} component evidence is missing`)
      if (state.ready !== true && state.generated !== true) throw new Error(`${component} component is not complete`)
    }
    const artifactId = execution.finalArtifactId || execution.parent.artifactId
    const artifact = await proveArtifact(artifactId, { mimePrefix: 'video/', dimensions: true, duration: true, finalMultimedia: true })
    return { executionId: id, jobId: execution.parent.id, artifactId, evidence: { ...execution.componentState, artifact } }
  })
}

async function pollJob(id, timeoutMs) {
  const deadline = Date.now() + timeoutMs
  while (Date.now() < deadline) {
    const result = await request(`/api/admin/jobs/${encodeURIComponent(id)}`)
    if (!result.response.ok) throw new Error(result.body.message || `job poll returned ${result.response.status}`)
    if (['completed', 'failed', 'cancelled'].includes(result.body.status)) return result.body
    await delay(2500)
  }
  throw new Error('job polling timed out')
}

function validateExecutionEvidence(job) {
  const evidence = job.executionEvidence
  if (!job.provider || !job.model) throw new Error('provider/model evidence is missing')
  if (!evidence?.grantSnapshot?.enabled || !evidence.executorId || !evidence.outputValidation) throw new Error('grant/executor/output-validation evidence is missing')
}

async function proveArtifact(id, requirements = {}) {
  if (!id) throw new Error('artifact ID is missing')
  const detail = await request(`/api/admin/artifacts/${encodeURIComponent(id)}`)
  if (!detail.response.ok) throw new Error(`artifact detail returned ${detail.response.status}`)
  if (!detail.body.mimeType || detail.body.fileSizeBytes <= 0) throw new Error('artifact detail lacks MIME or nonzero bytes')
  if (requirements.mimePrefix && !detail.body.mimeType.startsWith(requirements.mimePrefix)) throw new Error(`artifact MIME ${detail.body.mimeType} does not match ${requirements.mimePrefix}`)
  if (requirements.dimensions && !(detail.body.media?.width > 0 && detail.body.media?.height > 0)) throw new Error('artifact dimensions are missing')
  if (requirements.duration && !(detail.body.media?.durationSeconds > 0)) throw new Error('artifact duration is missing')
  if (requirements.finalMultimedia) {
    for (const field of ['finalVideoValidated', 'finalAudioValidated', 'voiceoverIncluded', 'subtitlesIncluded', 'musicBedIncluded']) {
      if (detail.body.media?.[field] !== true) throw new Error(`final multimedia evidence is missing: ${field}`)
    }
  }
  const result = await request(`/api/admin/artifacts/${encodeURIComponent(id)}/file`, { raw: true, headers: { Range: 'bytes=0-31' } })
  if (result.response.status !== 206) throw new Error(`artifact range returned ${result.response.status}`)
  if (!result.response.headers.get('content-type') || Number(result.response.headers.get('content-length') || 0) <= 0) throw new Error('artifact MIME/length evidence is missing')
  if (result.response.headers.get('accept-ranges') !== 'bytes' || !result.response.headers.get('content-range')) throw new Error('artifact byte-range headers are missing')
  await result.response.body?.cancel().catch(() => {})
  const download = await request(`/api/admin/artifacts/${encodeURIComponent(id)}/file?download=1`, { raw: true })
  if (!download.response.ok || !String(download.response.headers.get('content-disposition') || '').startsWith('attachment;')) throw new Error('authorised artifact download is missing attachment semantics')
  await download.response.body?.cancel().catch(() => {})
  const unauthorised = await fetch(`${baseUrl}/api/admin/artifacts/${encodeURIComponent(id)}/file`, { signal: AbortSignal.timeout(30_000) })
  if (unauthorised.status !== 401) throw new Error(`unauthorised artifact access returned ${unauthorised.status}`)
  return { mimeType: detail.body.mimeType, fileSizeBytes: detail.body.fileSizeBytes, media: detail.body.media, rangeStatus: result.response.status, downloadable: true }
}

function artifactRequirements(capability) {
  if (capability === 'image_generation') return { mimePrefix: 'image/', dimensions: true }
  if (['video_generation', 'image_to_video', 'video_to_video'].includes(capability)) return { mimePrefix: 'video/', dimensions: true, duration: true }
  if (['tts', 'music_generation'].includes(capability)) return { mimePrefix: 'audio/', duration: true }
  if (capability === 'stt') return { mimePrefix: 'application/json' }
  return {}
}

function capabilityInput(capability) {
  const text = 'AmarktAI release candidate proof input.'
  return ({
    chat: { messages: [{ role: 'user', content: text }] },
    reasoning: { context: text, constraints: ['Be concise'], effort: 'low' },
    code: { language: 'JavaScript', task: 'Return a function that adds two numbers.', outputFormat: 'code' },
    summarization: { sourceText: `${text} The platform routes capabilities centrally.`, desiredLength: 'brief', format: 'bullets', includeKeyPoints: true },
    translation: { sourceText: 'Hello world', targetLanguage: 'French', preserveTone: true },
    question_answering: { question: 'What routes capabilities?', context: 'Orchestra routes capabilities centrally.' },
    classification: { text, labels: ['positive', 'negative'], multiLabel: false },
    zero_shot_classification: { text, labels: ['release', 'unrelated'], multiLabel: false },
    extraction: { sourceText: 'Name: AmarktAI', schema: { type: 'object', properties: { name: { type: 'string' } }, required: ['name'] } },
    token_classification: { text: 'AmarktAI operates in South Africa.' },
    fill_mask: { text: 'The platform router is [MASK].', topK: 3 },
    feature_extraction: { text: [text, 'Second vector input'], normalize: true },
    sentence_similarity: { sourceSentence: text, comparisonSentences: ['Release proof input.', 'Unrelated sentence.'] },
    table_qa: { question: 'Which service owns routing?', table: { Service: ['Orchestra'], Responsibility: ['Routing'] } },
    structured_output: { context: text, schema: { type: 'object', properties: { status: { type: 'string' } }, required: ['status'] } },
    embeddings: { texts: [text, 'Second embedding input'], normalize: true },
    reranking: { query: 'central router', documents: ['Orchestra is the central router.', 'A different topic.'], topN: 2 },
    tts: { text: 'AmarktAI production release proof.', voice: 'tara', speed: 1, outputFormat: 'wav', language: 'en' },
    image_generation: { width: 512, height: 512, steps: 4 },
    video_generation: { duration: 3, aspectRatio: '16:9', style: 'cinematic' },
  })[capability] || {}
}

function proofPrompt(capability) { return `Production release proof for ${capability}` }
async function readGrant(appSlug, capability) {
  const result = await request(`/api/admin/app-grants/${encodeURIComponent(appSlug)}/${encodeURIComponent(capability)}`)
  if (!result.response.ok) throw new Error(`grant read returned ${result.response.status}`)
  return result.body
}
async function writeGrant(appSlug, capability, grant) {
  const result = await request(`/api/admin/app-grants/${encodeURIComponent(appSlug)}/${encodeURIComponent(capability)}`, {
    method: 'PUT', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify(grant),
  })
  if (!result.response.ok) throw new Error(`grant write returned ${result.response.status}`)
  return result.body
}
async function expectStudioSubmissionAccepted(capability) {
  const result = await request('/api/admin/studio/jobs', {
    method: 'POST', headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ capability, prompt: 'internal dashboard grant separation proof', input: capabilityInput(capability) }),
  })
  if (!result.response.ok || !result.body.jobId) throw new Error(result.body.message || `internal dashboard submission returned ${result.response.status}`)
  const job = await pollJob(result.body.jobId, 300_000)
  if (job.status !== 'completed') throw new Error(job.error || `internal dashboard job ended in ${job.status}`)
  return job
}
function delay(ms) { return new Promise((resolve) => setTimeout(resolve, ms)) }
function safeError(error) { return (error instanceof Error ? error.message : String(error)).replace(/(Bearer|api[_-]?key|secret|password)\s*[:=]?\s*\S+/gi, '$1=[redacted]').slice(0, 500) }
function parseArgs(argv) {
  const parsed = {}
  for (let index = 0; index < argv.length; index++) {
    const value = argv[index]
    if (!value.startsWith('--')) continue
    const key = value.slice(2)
    const next = argv[index + 1]
    if (next && !next.startsWith('--')) { parsed[key] = next; index++ } else parsed[key] = true
  }
  return parsed
}
