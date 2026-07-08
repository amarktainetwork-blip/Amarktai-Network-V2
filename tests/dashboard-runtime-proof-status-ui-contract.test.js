import fs from 'node:fs'
import path from 'node:path'
import { describe, expect, it } from 'vitest'
import { getRuntimeProofStatus } from '../apps/api/src/lib/runtime-proof-status.ts'
import {
  getRuntimeCapabilityProof,
  getRuntimeProofProviderState,
  isRuntimeCapabilityReady,
  normalizeRuntimeProofStatus,
} from '../lib/runtime-proof-status.js'

const ROOT = process.cwd()
const FINAL_PROVIDERS = ['genx', 'groq', 'together', 'mimo', 'deepinfra']
const PROVEN_CAPABILITIES = ['chat', 'image_generation', 'video_generation']
const BANNED_PROVIDER_NAMES = [
  'OpenAI',
  'Anthropic',
  'Gemini',
  'Qwen',
  'Hugging Face',
  'HeyGen',
  'MiniMax',
  'Replicate',
]

const dashboardTruthFiles = [
  'lib/runtime-proof-status.js',
  'lib/capability-display-catalog.js',
  'components/dashboard/runtime-proof-summary.jsx',
  'app/dashboard/command-center/page.js',
  'app/dashboard/capabilities/page.js',
  'app/dashboard/settings/page.js',
  'app/dashboard/studio/page.jsx',
  'lib/dashboard-contract.js',
  'lib/appdata.js',
]

function source(file) {
  return fs.readFileSync(path.join(ROOT, file), 'utf8')
}

describe('Dashboard runtime proof status UI contract', () => {
  it('maps the backend runtime proof payload without changing provider or proven capability truth', () => {
    const normalized = normalizeRuntimeProofStatus(getRuntimeProofStatus())

    expect(normalized.providers).toEqual(FINAL_PROVIDERS)
    expect(normalized.provenCapabilities.map((item) => item.capability)).toEqual(PROVEN_CAPABILITIES)
    expect(normalized.summary).toMatchObject({
      providerCount: 5,
      provenCount: 3,
      source: 'backend-runtime-proof-status',
    })
    expect(normalized.unprovenCapabilities).toHaveLength(31)
  })

  it('marks only backend-proven capabilities dashboard-ready', () => {
    const status = normalizeRuntimeProofStatus(getRuntimeProofStatus())

    for (const capability of PROVEN_CAPABILITIES) {
      expect(isRuntimeCapabilityReady(status, capability)).toBe(true)
      expect(getRuntimeCapabilityProof(status, capability).status).toBe('proven')
    }

    for (const capability of status.unprovenCapabilities) {
      expect(capability.readyForDashboardExecution).toBe(false)
      expect(isRuntimeCapabilityReady(status, capability.capability)).toBe(false)
    }
  })

  it('keeps Mimo and DeepInfra approved but not proven', () => {
    const status = normalizeRuntimeProofStatus(getRuntimeProofStatus())

    expect(getRuntimeProofProviderState(status, 'mimo')).toMatchObject({
      approved: true,
      status: 'unproven',
      provenCapabilities: [],
    })
    expect(getRuntimeProofProviderState(status, 'deepinfra')).toMatchObject({
      approved: true,
      status: 'unproven',
      provenCapabilities: [],
    })
  })

  it('keeps dashboard truth UI and constants free of banned provider names', () => {
    const combined = dashboardTruthFiles.map(source).join('\n')

    for (const provider of BANNED_PROVIDER_NAMES) {
      expect(combined).not.toContain(provider)
    }
    expect(combined).not.toContain('Unknown connection')
  })

  it('uses one runtime proof summary contract in overview, settings, and capabilities', () => {
    expect(source('app/dashboard/command-center/page.js')).toContain('RuntimeProofSummary')
    expect(source('app/dashboard/settings/page.js')).toContain('RuntimeProofSummary')
    expect(source('app/dashboard/capabilities/page.js')).toContain('RuntimeProofSummary')
    expect(source('components/dashboard/runtime-proof-summary.jsx')).toContain('Approved providers')
    expect(source('components/dashboard/runtime-proof-summary.jsx')).toContain('Proven capabilities')
    expect(source('components/dashboard/runtime-proof-summary.jsx')).toContain('Unproven capabilities')
    expect(source('components/dashboard/runtime-proof-summary.jsx')).toContain('Backend proof source')
  })

  it('disables unproven dashboard and Studio capability UI instead of implying readiness', () => {
    const capabilitiesSource = source('app/dashboard/capabilities/page.js')
    const studioSource = source('app/dashboard/studio/page.jsx')

    expect(capabilitiesSource).toContain('aria-disabled={!ready}')
    expect(capabilitiesSource).toContain('Disabled until backend proof passes')
    expect(studioSource).toContain('disabled={!ready}')
    expect(studioSource).toContain('disabled={!input.trim() || !backendReady}')
    expect(studioSource).toContain('backend-runtime-proof-status')
  })

  it('does not reintroduce provider or model selectors into Studio', () => {
    const studioSource = source('app/dashboard/studio/page.jsx')

    expect(studioSource).not.toContain('/api/admin/providers')
    expect(studioSource).not.toContain('ProviderSettingsPanel')
    expect(studioSource).not.toContain('Provider selector')
    expect(studioSource).not.toContain('Model selector')
  })
})
