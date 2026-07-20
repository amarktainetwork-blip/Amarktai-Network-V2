#!/usr/bin/env node
import { execFileSync } from 'node:child_process'
import { randomUUID } from 'node:crypto'
import { readFile, rm, writeFile } from 'node:fs/promises'
import { resolve } from 'node:path'

if (!process.argv.includes('--confirm-paid-live')) {
  throw new Error('Paid GenX execution is locked. Re-run with --confirm-paid-live after reviewing the plan and maximum-credit ceiling.')
}

const maxCredits = Number(process.env.PREMIUM_ADVERT_MAX_CREDITS)
const reserveCredits = Number(process.env.PREMIUM_ADVERT_RESERVE_CREDITS || 0)
if (!Number.isFinite(maxCredits) || maxCredits <= 0) throw new Error('PREMIUM_ADVERT_MAX_CREDITS must be a positive number')
if (!Number.isFinite(reserveCredits) || reserveCredits < 0) throw new Error('PREMIUM_ADVERT_RESERVE_CREDITS must be zero or greater')

const baseUrl = (process.env.PROOF_API_URL || 'http://127.0.0.1:3001').replace(/\/$/, '')
const email = process.env.ADMIN_EMAIL
const password = process.env.ADMIN_PASSWORD
if (!email || !password) throw new Error('ADMIN_EMAIL and ADMIN_PASSWORD are required')

const requestBody = {
  brandName: 'AmarktAI Network',
  campaignTitle: 'Build Anything. Operate Everything.',
  prompt: 'Show how AmarktAI Network transforms one idea into an entire intelligent business through one orchestrated capability platform, using premium cinematic technology storytelling, extraordinary visual continuity and an unforgettable brand close.',
  objective: 'Make founders and operators immediately understand that AmarktAI replaces disconnected AI tools with one intelligent capability platform.',
  audience: 'Founders, agencies, creators and operators building AI-powered products and businesses.',
  callToAction: 'Build anything. Operate everything.',
  targetDurationSeconds: 30,
  candidateCount: Number(process.env.PREMIUM_ADVERT_CANDIDATES || 3),
  aspectRatio: process.env.PREMIUM_ADVERT_ASPECT_RATIO || '16:9',
  style: 'cinematic premium global technology commercial with graphite, electric cyan and restrained violet art direction',
  tone: 'bold, intelligent, ambitious and emotionally uplifting',
  voiceStyle: 'confident premium commercial narration with controlled energy and an inspiring final resolve',
  musicBrief: 'Original cinematic electronic anthem with a restrained opening, escalating pulse, powerful orchestration reveal and memorable final resolve. Instrumental only, premium cinematic master.',
  maxCredits,
  reserveCredits,
}

const delay = (ms) => new Promise((resolveDelay) => setTimeout(resolveDelay, ms))
let token = ''
const report = { startedAt: new Date().toISOString(), checks: [], plan: null, execution: null, artifact: null }

function check(condition, name, detail = '') {
  report.checks.push({ name, passed: Boolean(condition), detail })
  if (!condition) throw new Error(`${name}${detail ? `: ${detail}` : ''}`)
}

async function request(path, options = {}) {
  const response = await fetch(`${baseUrl}${path}`, {
    ...options,
    headers: {
      ...(options.body ? { 'Content-Type': 'application/json' } : {}),
      ...(token ? { Authorization: `Bearer ${token}` } : {}),
      ...options.headers,
    },
    signal: AbortSignal.timeout(options.timeoutMs || 120_000),
  })
  const raw = await response.text()
  let body
  try { body = JSON.parse(raw) } catch { body = raw }
  return { response, body }
}

const login = await request('/api/v1/auth/login', { method: 'POST', body: JSON.stringify({ email, password }) })
check(login.response.ok && typeof login.body?.token === 'string', 'administrator authentication', String(login.response.status))
token = login.body.token

const planned = await request('/api/admin/premium-advert/plan', { method: 'POST', body: JSON.stringify(requestBody) })
check(planned.response.ok, 'premium plan created', String(planned.body?.message || planned.response.status))
check(planned.body.providerCallsStarted === false, 'planning made no generation call')
check(planned.body.plan?.spend?.allowed === true, 'credit and reserve preflight passed', JSON.stringify(planned.body.plan?.spend?.blockers || []))
check(planned.body.plan?.candidateCount === planned.body.plan?.candidatesPerScene * 6, 'six-scene candidate count is exact')
check(planned.body.plan?.routes?.video?.provider === 'genx', 'video route is GenX')
check(planned.body.plan?.routes?.narration?.provider === 'genx', 'narration route is GenX')
check(planned.body.plan?.routes?.music?.provider === 'genx', 'music route is GenX')
report.plan = planned.body.plan
console.log(JSON.stringify({ phase: 'planned', spend: planned.body.plan.spend, routes: planned.body.plan.routes }, null, 2))

const generated = await request('/api/admin/premium-advert/generate', {
  method: 'POST',
  body: JSON.stringify({ ...requestBody, confirmation: 'CONFIRM_PREMIUM_GENX_SPEND' }),
  timeoutMs: 180_000,
})
check(generated.response.status === 202 && typeof generated.body?.executionId === 'string', 'premium generation started', String(generated.body?.message || generated.response.status))
const executionId = generated.body.executionId

let execution
const deadline = Date.now() + 90 * 60_000
while (Date.now() < deadline) {
  const current = await request(`/api/admin/premium-advert/executions/${encodeURIComponent(executionId)}`)
  check(current.response.ok, 'execution poll', String(current.response.status))
  execution = current.body.execution
  const completed = execution.candidates?.filter((candidate) => candidate.status === 'completed').length || 0
  const failed = execution.candidates?.filter((candidate) => candidate.status === 'failed').length || 0
  console.log(JSON.stringify({ phase: execution.workflowPhase, completedCandidates: completed, failedCandidates: failed, narration: execution.narration?.status, music: execution.music?.status, readyToFinalize: execution.readyToFinalize }))
  if (execution.readyToFinalize || execution.finalArtifactId || execution.status === 'failed') break
  await delay(10_000)
}
check(execution?.status !== 'failed', 'premium generation did not fail', String(execution?.error || ''))
check(execution?.readyToFinalize === true || Boolean(execution?.finalArtifactId), 'at least one validated candidate completed for every scene')

if (!execution.finalArtifactId) {
  const finalised = await request(`/api/admin/premium-advert/executions/${encodeURIComponent(executionId)}/finalize`, { method: 'POST', timeoutMs: 20 * 60_000 })
  check(finalised.response.ok && typeof finalised.body?.artifactId === 'string', 'winner selection and final assembly completed', String(finalised.body?.message || finalised.response.status))
  execution = finalised.body.execution
}
report.execution = execution

const artifactId = execution.finalArtifactId
check(typeof artifactId === 'string' && artifactId.length > 0, 'final artifact linked')
const artifact = await request(`/api/admin/artifacts/${encodeURIComponent(artifactId)}`)
check(artifact.response.ok && artifact.body?.mimeType === 'video/mp4', 'final artifact metadata is MP4')
check(artifact.body?.media?.finalVideoValidated === true, 'final video stream validated')
check(artifact.body?.media?.finalAudioValidated === true, 'final audio stream validated')
check(artifact.body?.media?.voiceoverIncluded === true && artifact.body?.media?.subtitlesIncluded === true && artifact.body?.media?.musicBedIncluded === true, 'all multimedia components included')

const download = await fetch(`${baseUrl}/api/admin/artifacts/${encodeURIComponent(artifactId)}/file?download=1`, {
  headers: { Authorization: `Bearer ${token}` }, signal: AbortSignal.timeout(300_000),
})
check(download.ok && String(download.headers.get('content-type') || '').startsWith('video/'), 'authorised final MP4 download')
const bytes = Buffer.from(await download.arrayBuffer())
check(bytes.length > 1024 && bytes.subarray(0, 64).includes(Buffer.from('ftyp')), 'final MP4 bytes and signature')
const temp = resolve(process.cwd(), `.premium-advert-proof-${randomUUID()}.mp4`)
await writeFile(temp, bytes, { mode: 0o600 })
try {
  const probe = JSON.parse(execFileSync('ffprobe', ['-v', 'error', '-show_streams', '-show_format', '-of', 'json', temp], { encoding: 'utf8' }))
  const duration = Number(probe.format?.duration)
  check(probe.streams?.some((stream) => stream.codec_type === 'video'), 'download contains video stream')
  check(probe.streams?.some((stream) => stream.codec_type === 'audio'), 'download contains audio stream')
  check(Number.isFinite(duration) && Math.abs(duration - 30) <= 1, 'download duration is 30 seconds', String(duration))
  report.artifact = { artifactId, bytes: bytes.length, durationSeconds: duration, media: artifact.body.media }
} finally {
  await rm(temp, { force: true })
}

report.completedAt = new Date().toISOString()
const outputArg = process.argv.find((value) => value.startsWith('--json='))
if (outputArg) await writeFile(resolve(outputArg.slice('--json='.length)), `${JSON.stringify(report, null, 2)}\n`, { mode: 0o600 })
console.log(JSON.stringify({ PREMIUM_AMARKTAI_ADVERT: 'PASS', executionId, finalArtifactId: artifactId, checks: report.checks.length }))
