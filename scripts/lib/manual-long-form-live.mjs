import { execFileSync } from 'node:child_process'
import { readFile, writeFile, rm } from 'node:fs/promises'
import { basename, resolve } from 'node:path'
import { randomUUID } from 'node:crypto'

const delay = (ms) => new Promise((resolveDelay) => setTimeout(resolveDelay, ms))

export async function runManualLongFormLive({ fixturePath, proofName }) {
  if (!process.argv.includes('--confirm-paid-live')) {
    throw new Error('Paid provider execution is locked. Re-run with --confirm-paid-live after confirming the configured account and budget.')
  }
  const baseUrl = (process.env.PROOF_API_URL || 'http://localhost:3001').replace(/\/$/, '')
  const email = process.env.ADMIN_EMAIL
  const password = process.env.ADMIN_PASSWORD
  if (!email || !password) throw new Error('ADMIN_EMAIL and ADMIN_PASSWORD are required')
  const fixture = JSON.parse(await readFile(fixturePath, 'utf8'))
  const report = { proofName, fixture: basename(fixturePath), startedAt: new Date().toISOString(), checks: [], evidence: {} }
  let token = ''
  const check = (condition, name, detail = '') => {
    report.checks.push({ name, passed: Boolean(condition), detail })
    if (!condition) throw new Error(`${name}${detail ? `: ${detail}` : ''}`)
  }
  const request = async (path, options = {}) => {
    const response = await fetch(`${baseUrl}${path}`, {
      ...options,
      headers: { ...(options.body ? { 'Content-Type': 'application/json' } : {}), ...(token ? { Authorization: `Bearer ${token}` } : {}), ...options.headers },
      signal: AbortSignal.timeout(options.timeoutMs || 120_000),
    })
    const raw = await response.text()
    let body
    try { body = JSON.parse(raw) } catch { body = raw }
    return { response, body }
  }

  const login = await request('/api/v1/auth/login', { method: 'POST', body: JSON.stringify({ email, password }) })
  check(login.response.ok && typeof login.body?.token === 'string', 'admin authentication')
  token = login.body.token

  const planned = await request('/api/admin/long-form-video/plan', { method: 'POST', body: JSON.stringify(fixture) })
  check(planned.response.ok, 'immutable plan created', String(planned.body?.message || planned.response.status))
  check(planned.body.providerCallsStarted === false, 'planning made no provider call')
  check(typeof planned.body.versionHash === 'string' && planned.body.versionHash.length > 0, 'plan version hash persisted')
  check(planned.body.plan?.storyboard?.scenes?.length === fixture.sceneCount, 'planned scene count')
  check(new Set(planned.body.plan.storyboard.scenes.map((scene) => scene.visualPrompt)).size === fixture.sceneCount, 'scene prompts are distinct')
  check(planned.body.plan.storyboard.scenes.reduce((total, scene) => total + scene.durationSeconds, 0) === fixture.targetDurationSeconds, 'planned duration')

  const preview = await request('/api/admin/long-form-video/preview-scene', {
    method: 'POST',
    body: JSON.stringify({ executionId: planned.body.executionId, planId: planned.body.planId, versionHash: planned.body.versionHash, sceneNumber: 1 }),
  })
  check(preview.response.ok && typeof preview.body?.previewJobId === 'string', 'scene preview submitted', String(preview.body?.message || preview.response.status))
  const previewJob = await pollJob(request, preview.body.previewJobId, 15 * 60_000)
  check(previewJob.status === 'completed' && Boolean(previewJob.artifactId), 'scene preview completed', String(previewJob.error || previewJob.status))

  const approved = await request('/api/admin/long-form-video/approve', {
    method: 'POST',
    body: JSON.stringify({ executionId: planned.body.executionId, planId: planned.body.planId, versionHash: planned.body.versionHash }),
    timeoutMs: 180_000,
  })
  check(approved.response.ok && approved.body.providerCallsStarted === true, 'approved plan started execution', String(approved.body?.message || approved.response.status))
  const execution = await pollExecution(request, approved.body.executionId, 45 * 60_000)
  check(execution.parent?.status === 'completed', 'composite parent completed', String(execution.parent?.error || execution.parent?.status))
  check(execution.scenes?.length === fixture.sceneCount, 'three scene jobs linked')
  check(execution.scenes.every((scene) => scene.status === 'completed' && scene.provider && scene.model && scene.artifactId), 'all scene route and artifact evidence present')
  check(!JSON.stringify(execution).toLowerCase().includes('groq'), 'removed provider absent')
  for (const component of ['scenes', 'voiceover', 'subtitles', 'musicBed', 'assembly']) {
    const state = execution.componentState?.[component]
    check(Boolean(state) && (state.ready === true || state.generated === true), `${component} component complete`)
  }
  check(Boolean(execution.costEvidence) && typeof execution.costEvidence.knownCostUsdCents === 'number', 'workflow cost evidence exposed')
  const voiceEvidence = JSON.stringify(execution.componentState?.voiceover || {})
  check(/voice/i.test(voiceEvidence) && /(en-GB|British|voiceId|voiceProfile)/i.test(voiceEvidence), 'selected voice evidence present')

  const artifactId = execution.finalArtifactId || execution.parent.finalArtifactId
  check(Boolean(artifactId), 'final artifact linked')
  const artifact = await request(`/api/admin/artifacts/${encodeURIComponent(artifactId)}`)
  check(artifact.response.ok && artifact.body?.mimeType === 'video/mp4' && artifact.body.fileSizeBytes > 0, 'final MP4 metadata validated')
  const download = await fetch(`${baseUrl}/api/admin/artifacts/${encodeURIComponent(artifactId)}/file?download=1`, {
    headers: { Authorization: `Bearer ${token}` }, signal: AbortSignal.timeout(180_000),
  })
  check(download.ok && String(download.headers.get('content-type') || '').startsWith('video/'), 'authorised final download')
  const bytes = Buffer.from(await download.arrayBuffer())
  check(bytes.length > 1024 && bytes.subarray(0, 32).includes(Buffer.from('ftyp')), 'MP4 signature and bytes')
  const temporary = resolve(process.cwd(), `.manual-proof-${randomUUID()}.mp4`)
  await writeFile(temporary, bytes, { mode: 0o600 })
  try {
    const probe = JSON.parse(execFileSync('ffprobe', ['-v', 'error', '-show_streams', '-show_format', '-of', 'json', temporary], { encoding: 'utf8' }))
    const duration = Number(probe.format?.duration)
    check(probe.streams?.some((stream) => stream.codec_type === 'video'), 'final video stream')
    check(probe.streams?.some((stream) => stream.codec_type === 'audio'), 'final audio stream')
    check(Number.isFinite(duration) && Math.abs(duration - fixture.targetDurationSeconds) <= 3, 'final duration', String(duration))
    report.evidence = {
      executionId: approved.body.executionId,
      planId: planned.body.planId,
      versionHash: planned.body.versionHash,
      previewJobId: preview.body.previewJobId,
      sceneRoutes: execution.scenes.map(({ jobId, provider, model, artifactId }) => ({ jobId, provider, model, artifactId })),
      finalArtifactId: artifactId,
      finalBytes: bytes.length,
      durationSeconds: duration,
      costEvidence: execution.costEvidence,
      voiceEvidence: execution.componentState.voiceover,
    }
  } finally {
    await rm(temporary, { force: true })
  }
  report.completedAt = new Date().toISOString()
  const outputArg = process.argv.find((value) => value.startsWith('--json='))
  if (outputArg) await writeFile(resolve(outputArg.slice('--json='.length)), `${JSON.stringify(report, null, 2)}\n`, { mode: 0o600 })
  console.log(JSON.stringify({ proofName, passed: report.checks.length, executionId: report.evidence.executionId, finalArtifactId: report.evidence.finalArtifactId }))
}

async function pollJob(request, jobId, timeoutMs) {
  const deadline = Date.now() + timeoutMs
  while (Date.now() < deadline) {
    const current = await request(`/api/admin/jobs/${encodeURIComponent(jobId)}`)
    if (!current.response.ok) throw new Error(`Job poll returned ${current.response.status}`)
    if (['completed', 'failed', 'cancelled'].includes(current.body.status)) return current.body
    await delay(3000)
  }
  throw new Error(`Job ${jobId} timed out`)
}

async function pollExecution(request, executionId, timeoutMs) {
  const deadline = Date.now() + timeoutMs
  while (Date.now() < deadline) {
    const current = await request(`/api/admin/long-form-video/executions/${encodeURIComponent(executionId)}`)
    if (!current.response.ok) throw new Error(`Execution poll returned ${current.response.status}`)
    const execution = current.body.execution
    if (['completed', 'failed', 'cancelled'].includes(execution?.parent?.status)) return execution
    await delay(5000)
  }
  throw new Error(`Execution ${executionId} timed out`)
}
