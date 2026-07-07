import fs from 'node:fs'
import path from 'node:path'
import { describe, expect, it } from 'vitest'
import {
  FINAL_PROVIDER_IDS,
  buildProviderUpdatePayload,
  getCredentialSourceLabel,
  getHealthStatusLabel,
  makeProviderDraft,
  normalizeProviderStatuses,
  sanitizeProviderStatus,
} from '../lib/provider-settings-contract.js'

const ROOT = process.cwd()
const panelSource = fs.readFileSync(path.join(ROOT, 'components/dashboard/provider-settings-panel.jsx'), 'utf8')
const settingsSource = fs.readFileSync(path.join(ROOT, 'app/dashboard/settings/page.js'), 'utf8')
const studioSource = fs.readFileSync(path.join(ROOT, 'app/dashboard/studio/page.jsx'), 'utf8')
const appGatewaySource = fs.readFileSync(path.join(ROOT, 'app/dashboard/app-gateway/page.js'), 'utf8')

function provider(overrides = {}) {
  return {
    providerKey: 'groq',
    displayName: 'Groq',
    enabled: true,
    configured: true,
    source: 'database',
    maskedPreview: 'gsk_********abcd',
    baseUrl: '',
    defaultModel: 'llama-3.3-70b-versatile',
    fallbackModel: '',
    healthStatus: 'configured',
    healthMessage: 'Credential stored; live health not checked.',
    lastCheckedAt: null,
    sortOrder: 2,
    notes: '',
    ...overrides,
  }
}

describe('Dashboard provider settings UI contract', () => {
  it('renders the final five provider IDs from backend status data only', () => {
    const statuses = normalizeProviderStatuses([
      provider({ providerKey: 'together', displayName: 'Together AI', sortOrder: 3 }),
      provider({ providerKey: 'deepinfra', displayName: 'DeepInfra', enabled: false, configured: false, source: 'missing', healthStatus: 'unconfigured', sortOrder: 5 }),
      provider({ providerKey: 'genx', displayName: 'GenX', enabled: false, configured: false, source: 'missing', healthStatus: 'unconfigured', sortOrder: 1 }),
      provider({ providerKey: 'mimo', displayName: 'MiMo', enabled: false, configured: false, source: 'missing', healthStatus: 'unconfigured', sortOrder: 4 }),
      provider(),
    ])

    expect(FINAL_PROVIDER_IDS).toEqual(['genx', 'groq', 'together', 'mimo', 'deepinfra'])
    expect(statuses.map((status) => status.providerKey)).toEqual(FINAL_PROVIDER_IDS)
  })

  it('uses honest credential source labels', () => {
    expect(getCredentialSourceLabel('database')).toBe('Stored securely')
    expect(getCredentialSourceLabel('env')).toBe('Env fallback / server env')
    expect(getCredentialSourceLabel('missing')).toBe('Missing')
    expect(getCredentialSourceLabel('disabled')).toBe('Disabled by admin')
  })

  it('never treats env fallback as a live provider state', () => {
    expect(getHealthStatusLabel('live')).toBe('Live tested')
    expect(getHealthStatusLabel('configured')).toBe('Configured')
    expect(getHealthStatusLabel('failed')).toBe('Failed')
    expect(getHealthStatusLabel('gated')).toBe('Gated')
    expect(panelSource).not.toContain('Connected')
  })

  it('sanitizes raw key and ciphertext fields before UI state', () => {
    const sanitized = sanitizeProviderStatus({
      ...provider(),
      apiKey: 'gsk_live_secret_abcd',
      encryptedApiKey: 'v1:ciphertext',
      ciphertext: 'v1:ciphertext',
    })

    expect(JSON.stringify(sanitized)).not.toContain('gsk_live_secret_abcd')
    expect(JSON.stringify(sanitized)).not.toContain('v1:ciphertext')
    expect(sanitized.apiKey).toBeUndefined()
  })

  it('keeps masked previews display-only and password input empty by default', () => {
    const draft = makeProviderDraft(provider({ maskedPreview: 'gsk_********abcd' }))

    expect(draft.apiKey).toBe('')
    expect(panelSource).toContain('Masked preview')
    expect(panelSource).toContain('value={draft.apiKey}')
    expect(panelSource).not.toContain('value={provider.maskedPreview}')
  })

  it('saving a key sends apiKey and enabled state', () => {
    const payload = buildProviderUpdatePayload({
      enabled: true,
      apiKey: ' gsk_live_secret_abcd ',
      baseUrl: 'https://api.groq.com/openai/v1',
      defaultModel: 'llama-3.3-70b-versatile',
      fallbackModel: '',
      notes: 'admin metadata',
    })

    expect(payload).toMatchObject({
      enabled: true,
      apiKey: 'gsk_live_secret_abcd',
      baseUrl: 'https://api.groq.com/openai/v1',
      defaultModel: 'llama-3.3-70b-versatile',
      fallbackModel: '',
      notes: 'admin metadata',
    })
  })

  it('saving metadata without a new key does not send a stale raw key', () => {
    const payload = buildProviderUpdatePayload({
      enabled: true,
      apiKey: '',
      baseUrl: '',
      defaultModel: 'llama-3.3-70b-versatile',
      fallbackModel: '',
      notes: 'metadata only',
    })

    expect(payload.apiKey).toBeUndefined()
    expect(JSON.stringify(payload)).not.toContain('gsk_live_secret_abcd')
  })

  it('fetches and mutates only the backend admin provider routes with bearer auth', () => {
    expect(settingsSource).toContain('ProviderSettingsPanel')
    expect(panelSource).toContain("fetch('/api/admin/providers'")
    expect(panelSource).toContain('method: \'PUT\'')
    expect(panelSource).toContain('method: \'POST\'')
    expect(panelSource).toContain('method: \'DELETE\'')
    expect(panelSource).toContain('Authorization: `Bearer ${token}`')
  })

  it('separates Save Key from Test Key and configured from live-tested status', () => {
    expect(panelSource).toContain('Save Key')
    expect(panelSource).toContain('Test Key')
    expect(panelSource).toContain('/test`')
    expect(panelSource).toContain('Saved key configured')
    expect(panelSource).toContain('Live tested means')
  })

  it('clears the password draft after successful save and clear-key responses', () => {
    expect(panelSource).toContain('apiKey: \'\'')
    expect(panelSource).toContain('Password input cleared')
    expect(panelSource).toContain('/key`')
  })

  it('uses safe auth and backend-unavailable messages', () => {
    expect(panelSource).toContain('Admin sign-in required')
    expect(panelSource).toContain('Admin access required')
    expect(panelSource).toContain('Backend unavailable')
    expect(panelSource).toContain('providerTestErrorMessage')
    expect(panelSource).toContain('data.errorMessage')
  })

  it('keeps DeepInfra gated and does not activate execution in UI copy', () => {
    expect(panelSource).toContain('DeepInfra remains gated')
    expect(panelSource).toContain('does not activate execution')
  })

  it('does not expose provider or model selection to Studio or apps', () => {
    expect(studioSource).not.toContain('/api/admin/providers')
    expect(appGatewaySource).not.toContain('/api/admin/providers')
    expect(studioSource).not.toContain('ProviderSettingsPanel')
    expect(appGatewaySource).not.toContain('ProviderSettingsPanel')
  })
})
