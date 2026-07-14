import fs from 'node:fs'
import path from 'node:path'
import { describe, expect, it, vi } from 'vitest'
import { projectProofStatusFromTruth } from '../apps/api/src/lib/runtime-proof-status.ts'
import {
  getRuntimeCapabilityProof,
  getRuntimeProofProviderState,
  isRuntimeCapabilityReady,
  normalizeRuntimeProofStatus,
} from '../lib/runtime-proof-status.js'

const ROOT = process.cwd()
const FINAL_PROVIDERS = ['genx', 'groq', 'together', 'mimo', 'deepinfra']
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
  'lib/capability-catalog.js',
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

function makeTruthWithProof(provenCapabilities = []) {
  return {
    generatedAt: new Date().toISOString(),
    providerPolicy: { runtimeExecutionProviders: ['genx', 'groq', 'together', 'deepinfra'], codingOnlyProviders: ['mimo'], qwenRuntimeEligible: false },
    providers: [],
    capabilities: provenCapabilities.map((cap) => ({
      capability: cap,
      liveProven: true,
      classification: 'LIVE_PROVEN',
      eligibleModels: [{ provider: 'groq', modelId: 'test-model', liveProven: true }],
    })),
    releaseReadiness: provenCapabilities.map((capability) => ({ capability, readyForDashboardExecution: true })),
    countsByClassification: {},
    evidenceAvailable: true,
  }
}

describe('Dashboard runtime proof status UI contract', () => {
  it('projects proof status from canonical truth', () => {
    const truth = makeTruthWithProof(['chat', 'image_generation'])
    const payload = projectProofStatusFromTruth(truth)
    const normalized = normalizeRuntimeProofStatus(payload)

    expect(normalized.providers).toEqual(FINAL_PROVIDERS)
    expect(normalized.provenCapabilities).toHaveLength(2)
    expect(normalized.summary.source).toBe('backend-runtime-proof-status')
  })

  it('keeps release readiness explicit and separate from proof status', () => {
    const truth = makeTruthWithProof(['chat', 'code'])
    const payload = projectProofStatusFromTruth(truth)
    const status = normalizeRuntimeProofStatus(payload)

    expect(isRuntimeCapabilityReady(status, 'chat')).toBe(true)
    expect(getRuntimeCapabilityProof(status, 'chat').status).toBe('proven')
    expect(isRuntimeCapabilityReady(status, 'code')).toBe(true)

    for (const capability of status.unprovenCapabilities) {
      expect(capability.readyForDashboardExecution).toBe(false)
      expect(isRuntimeCapabilityReady(status, capability.capability)).toBe(false)
    }
  })

  it('keeps Mimo and DeepInfra approved but not proven', () => {
    const payload = projectProofStatusFromTruth(makeMinimalTruth())
    const status = normalizeRuntimeProofStatus(payload)

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

  it('uses one runtime proof summary contract in settings and capabilities while command center delegates to health', () => {
    expect(source('app/dashboard/command-center/page.js')).toContain("export { default } from '../operations/page'")
    expect(source('app/dashboard/settings/page.js')).toContain('RuntimeProofSummary')
    expect(source('app/dashboard/capabilities/page.js')).toContain('RuntimeProofSummary')
    expect(source('components/dashboard/runtime-proof-summary.jsx')).toContain('Approved providers')
    expect(source('components/dashboard/runtime-proof-summary.jsx')).toContain('Proven capabilities')
    expect(source('components/dashboard/runtime-proof-summary.jsx')).toContain('Unproven capabilities')
    expect(source('components/dashboard/runtime-proof-summary.jsx')).toContain('Backend proof source')
  })

  it('does not keep the old duplicate capability display catalog', () => {
    expect(fs.existsSync(path.join(ROOT, 'lib/capability-display-catalog.js'))).toBe(false)
    expect(source('lib/capability-catalog.js')).toContain('../packages/core/src/capabilities.ts')
  })

  it('gates dashboard and Studio UI on canonical release readiness', () => {
    const capabilitiesSource = source('app/dashboard/capabilities/page.js')
    const studioSource = source('app/dashboard/studio/page.jsx')

    expect(capabilitiesSource).toContain('aria-disabled={!ready}')
    expect(capabilitiesSource).toContain('readyForDashboardExecution')
    expect(capabilitiesSource).toContain('deployed live proof remains separate')
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

  it('distinguishes zero evidence from unavailable evidence', () => {
    const zeroEvidence = projectProofStatusFromTruth({
      generatedAt: new Date().toISOString(),
      providerPolicy: { runtimeExecutionProviders: ['genx', 'groq', 'together', 'deepinfra'], codingOnlyProviders: ['mimo'], qwenRuntimeEligible: false },
      providers: [],
      capabilities: [],
      countsByClassification: {},
      evidenceAvailable: true,
    })
    expect(zeroEvidence.evidenceAvailable).toBe(true)
    expect(zeroEvidence.provenCapabilities).toHaveLength(0)

    const unavailable = projectProofStatusFromTruth({
      generatedAt: new Date().toISOString(),
      providerPolicy: { runtimeExecutionProviders: ['genx', 'groq', 'together', 'deepinfra'], codingOnlyProviders: ['mimo'], qwenRuntimeEligible: false },
      providers: [],
      capabilities: [],
      countsByClassification: {},
      evidenceAvailable: false,
    })
    expect(unavailable.evidenceAvailable).toBe(false)
    expect(unavailable.unprovenCapabilities[0].description).toContain('unavailable')
  })
})

function makeMinimalTruth() {
  return {
    generatedAt: new Date().toISOString(),
    providerPolicy: { runtimeExecutionProviders: ['genx', 'groq', 'together', 'deepinfra'], codingOnlyProviders: ['mimo'], qwenRuntimeEligible: false },
    providers: [],
    capabilities: [],
    countsByClassification: {},
    evidenceAvailable: true,
  }
}
