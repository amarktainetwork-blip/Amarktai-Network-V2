#!/usr/bin/env node
import { readFile } from 'node:fs/promises'
import { fileURLToPath } from 'node:url'

const fixturePath = fileURLToPath(new URL('./fixtures/avatar-app-onboarding.json', import.meta.url))
const fixture = JSON.parse(await readFile(fixturePath, 'utf8'))
const capabilitySource = await readFile(fileURLToPath(new URL('../packages/core/src/capabilities.ts', import.meta.url)), 'utf8')
const requiredCapabilities = [
  'chat', 'streaming_chat', 'image_generation', 'image_edit', 'tts', 'voice_clone', 'stt',
  'avatar_generation', 'lip_sync', 'video_generation', 'image_to_video', 'long_form_video', 'music_generation',
]

const failures = []
for (const capability of requiredCapabilities) {
  if (!fixture.capabilities.includes(capability)) failures.push(`fixture missing ${capability}`)
  if (!capabilitySource.includes(`  '${capability}',`)) failures.push(`canonical catalogue missing ${capability}`)
}
for (const permission of ['voiceSelection', 'voiceCloneConsentRequired', 'artifactRead', 'artifactWrite', 'memoryRead', 'memoryWrite', 'approvalRequired', 'webhooks']) {
  if (fixture.permissions[permission] !== true) failures.push(`permission missing ${permission}`)
}
if (fixture.identity.appType !== 'avatar_video_platform') failures.push('avatar app type is missing')
if (fixture.defaultPolicy.qualityTarget !== 'premium' || fixture.defaultPolicy.spendStrategy !== 'best_value') failures.push('default routing policy is incomplete')
if (failures.length > 0) throw new Error(failures.join('; '))

if (!process.argv.includes('--apply')) {
  console.log(JSON.stringify({ fixture: fixture.identity.appSlug, mode: 'deterministic-static', paidCalls: false, requiredCapabilities: requiredCapabilities.length, permissionsValidated: 8 }))
  process.exit(0)
}

const baseUrl = (process.env.PROOF_API_URL || 'http://localhost:3001').replace(/\/$/, '')
if (!process.env.ADMIN_EMAIL || !process.env.ADMIN_PASSWORD) throw new Error('ADMIN_EMAIL and ADMIN_PASSWORD are required with --apply')
let token = ''
const request = async (path, options = {}, appKey = '') => {
  const response = await fetch(`${baseUrl}${path}`, {
    ...options,
    headers: { ...(options.body ? { 'Content-Type': 'application/json' } : {}), ...(appKey ? { Authorization: `Bearer ${appKey}` } : token ? { Authorization: `Bearer ${token}` } : {}), ...options.headers },
    signal: AbortSignal.timeout(60_000),
  })
  const text = await response.text()
  let body
  try { body = JSON.parse(text) } catch { body = text }
  return { response, body }
}
const login = await request('/api/v1/auth/login', { method: 'POST', body: JSON.stringify({ email: process.env.ADMIN_EMAIL, password: process.env.ADMIN_PASSWORD }) })
if (!login.response.ok || typeof login.body?.token !== 'string') throw new Error(`Admin login failed (${login.response.status})`)
token = login.body.token
const list = await request('/api/admin/app-connections')
if (!list.response.ok) throw new Error(`App list failed (${list.response.status})`)
const existing = (list.body.connections || []).some((connection) => connection.appSlug === fixture.identity.appSlug)
const connectionBody = {
  appSlug: fixture.identity.appSlug,
  appName: fixture.identity.appName,
  appType: fixture.identity.appType,
  website: fixture.identity.website,
  description: fixture.identity.description,
  environment: fixture.identity.environment,
  onboardingState: 'acceptance',
  webhookUrl: fixture.webhookUrl,
  allowedCapabilities: fixture.capabilities,
  qualityTarget: fixture.defaultPolicy.qualityTarget,
  spendStrategy: fixture.defaultPolicy.spendStrategy,
  dailyBudgetCents: fixture.budget.dailyLimitUsdCents,
  domain: fixture.businessContext.domain,
  users: fixture.businessContext.users,
  brand: fixture.businessContext.brand,
  productInstructions: fixture.businessContext.productInstructions,
}
const connection = await request(existing ? `/api/admin/app-connections/${fixture.identity.appSlug}` : '/api/admin/app-connections', {
  method: existing ? 'PUT' : 'POST', body: JSON.stringify(connectionBody),
})
if (!connection.response.ok) throw new Error(`App ${existing ? 'update' : 'create'} failed: ${connection.body?.message || connection.response.status}`)

for (const capability of fixture.capabilities) {
  const permissionSensitive = ['voice_clone', 'avatar_generation', 'lip_sync', 'long_form_video'].includes(capability)
  const grant = await request(`/api/admin/app-grants/${fixture.identity.appSlug}/${capability}`, {
    method: 'PUT', body: JSON.stringify({
      enabled: true,
      routingMode: 'automatic',
      qualityTarget: fixture.defaultPolicy.qualityTarget,
      spendStrategy: fixture.defaultPolicy.spendStrategy,
      allowFallback: fixture.defaultPolicy.allowFallback,
      approvalRequired: permissionSensitive || fixture.permissions.approvalRequired,
      artifactRead: fixture.permissions.artifactRead,
      artifactWrite: fixture.permissions.artifactWrite,
      memoryRead: fixture.permissions.memoryRead,
      memoryWrite: fixture.permissions.memoryWrite,
      passthroughModelAllowed: false,
      adultPermission: false,
      policyProfile: permissionSensitive ? 'consent_and_approval_required' : 'standard',
    }),
  })
  if (!grant.response.ok) throw new Error(`Grant update failed for ${capability}: ${grant.body?.message || grant.response.status}`)
}
const budget = await request(`/api/admin/app-budgets/${fixture.identity.appSlug}`, {
  method: 'PUT', body: JSON.stringify({ monthlyBudgetCents: fixture.budget.monthlyLimitUsdCents, dailyBudgetCents: fixture.budget.dailyLimitUsdCents, paused: false }),
})
if (!budget.response.ok) throw new Error(`Budget update failed (${budget.response.status})`)
const keyResult = await request(`/api/admin/app-connections/${fixture.identity.appSlug}/keys`, { method: 'POST', body: JSON.stringify({ label: 'acceptance-once' }) })
if (!keyResult.response.ok || typeof keyResult.body?.key !== 'string') throw new Error(`API key creation failed (${keyResult.response.status})`)
const rawKey = keyResult.body.key
const [capabilities, policy, usage] = await Promise.all([
  request('/api/v1/capabilities', {}, rawKey), request('/api/v1/policy', {}, rawKey), request('/api/v1/usage', {}, rawKey),
])
if (![capabilities, policy, usage].every((result) => result.response.ok)) throw new Error('Thin-app authenticated acceptance endpoints did not all succeed')
const visible = new Set(capabilities.body.capabilities.map((capability) => capability.key))
for (const capability of requiredCapabilities) if (!visible.has(capability)) throw new Error(`Authenticated discovery omitted ${capability}`)
console.log(JSON.stringify({ fixture: fixture.identity.appSlug, mode: 'applied', paidCalls: false, created: !existing, authenticatedCapabilities: visible.size, policyValidated: true, budgetValidated: true, rawKeyDiscarded: true }))
