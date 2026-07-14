#!/usr/bin/env node

const baseUrl = (process.env.PROOF_API_URL || 'http://127.0.0.1:3001').replace(/\/$/, '')
const email = process.env.PROOF_ADMIN_EMAIL || process.env.ADMIN_EMAIL
const password = process.env.PROOF_ADMIN_PASSWORD || process.env.ADMIN_PASSWORD
if (!email || !password) {
  console.error('AUTHENTICATED_DISCOVERY_FATAL=PROOF_ADMIN_EMAIL and PROOF_ADMIN_PASSWORD are required')
  process.exit(1)
}

async function requestJson(path, { method = 'GET', token, body } = {}) {
  const response = await fetch(`${baseUrl}${path}`, {
    method,
    headers: {
      Accept: 'application/json',
      ...(token ? { Authorization: `Bearer ${token}` } : {}),
      ...(body === undefined ? {} : { 'Content-Type': 'application/json' }),
    },
    ...(body === undefined ? {} : { body: JSON.stringify(body) }),
    signal: AbortSignal.timeout(120_000),
  })
  const text = await response.text()
  let payload
  try { payload = text ? JSON.parse(text) : {} } catch { payload = { message: text.slice(0, 500) } }
  if (!response.ok) throw new Error(`HTTP ${response.status} ${method} ${path}: ${payload.message || 'request failed'}`)
  return payload
}

function safeError(error) {
  return (error instanceof Error ? error.message : String(error))
    .replace(/Bearer\s+\S+/gi, 'Bearer [redacted]')
    .replace(/gnxk_[A-Za-z0-9_-]+/g, 'gnxk_[redacted]')
    .slice(0, 1_000)
}

try {
  const login = await requestJson('/api/v1/auth/login', { method: 'POST', body: { email, password } })
  if (!login.token) throw new Error('Admin login returned no token')
  const discovery = await requestJson('/api/admin/models/discovery/run', {
    method: 'POST', token: login.token, body: { live: true, strict: true },
  })
  const runtimeProviders = ['genx', 'groq', 'together', 'deepinfra']
  const results = Array.isArray(discovery.results) ? discovery.results : []
  for (const provider of runtimeProviders) {
    const result = results.find((entry) => entry.provider === provider)
    if (!result?.liveDiscoverySucceeded) throw new Error(`${provider} stored-credential discovery was not successful`)
  }
  const mimo = results.find((entry) => entry.provider === 'mimo')
  if (mimo && mimo.runtimeExecutionAllowed !== false) throw new Error('MiMo runtime policy was not restricted')
  console.log('AUTHENTICATED_DISCOVERY_RESULT=PASS')
  console.log(JSON.stringify({
    source: 'normal_authenticated_platform_api',
    providers: runtimeProviders.map((provider) => {
      const result = results.find((entry) => entry.provider === provider)
      return { provider, models: result?.models?.length ?? 0, source: result?.source ?? null }
    }),
    mimoPolicy: 'coding_agent_only',
  }, null, 2))
} catch (error) {
  console.error(`AUTHENTICATED_DISCOVERY_FATAL=${safeError(error)}`)
  process.exitCode = 1
}
