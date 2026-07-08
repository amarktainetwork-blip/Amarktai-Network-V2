import fs from 'node:fs'
import path from 'node:path'
import { describe, expect, it } from 'vitest'
import { CAPABILITY_CATALOG, CAPABILITY_KEYS, PROVIDER_KEYS } from '../packages/core/src/index.ts'
import { getRuntimeProofStatus } from '../apps/api/src/lib/runtime-proof-status.ts'
import { TARGET_CAPABILITY_CATALOG } from '../lib/capability-display-catalog.js'
import { fallbackMediaCanProveCapability, MEDIA_TRUTH_CONTRACTS } from '../lib/media-truth-contract.js'
import { REPO_WORKBENCH_ACTIONS, repoWorkbenchActionResponse } from '../lib/repo-workbench-contract.js'
import { DESIGN_QUALITY_GATES } from '../lib/design-quality-contract.js'

const ROOT = process.cwd()
const FINAL_PROVIDERS = ['genx', 'groq', 'together', 'mimo', 'deepinfra']
const PROVEN_CAPABILITIES = ['chat', 'reasoning', 'code', 'summarization', 'translation', 'classification', 'extraction', 'structured_output', 'image_generation', 'video_generation']
const REQUIRED_TARGET_CAPABILITIES = [
  'chat',
  'reasoning',
  'code',
  'structured_output',
  'tool_use',
  'summarization',
  'translation',
  'classification',
  'extraction',
  'research',
  'brand_scrape',
  'image_generation',
  'image_edit',
  'video_generation',
  'image_to_video',
  'long_form_video',
  'tts',
  'stt',
  'music_generation',
  'avatar_generation',
  'embeddings',
  'reranking',
  'rag_ingest',
  'rag_search',
  'document_qa',
  'ocr',
  'campaign_generation',
  'social_content_generation',
  'adult_text',
  'adult_image',
  'adult_voice',
  'adult_avatar',
  'adult_video',
]
const BANNED_ACTIVE_PROVIDERS = ['openai', 'anthropic', 'gemini', 'qwen', 'huggingface', 'heygen', 'minimax', 'replicate']

function source(file) {
  return fs.readFileSync(path.join(ROOT, file), 'utf8').toLowerCase()
}

describe('Donor transplant V2 contract', () => {
  it('keeps approved providers exactly final five with no banned active provider IDs', () => {
    expect([...PROVIDER_KEYS]).toEqual(FINAL_PROVIDERS)
    for (const provider of BANNED_ACTIVE_PROVIDERS) {
      expect(PROVIDER_KEYS).not.toContain(provider)
    }
  })

  it('represents the donor-backed target capability catalog in backend and dashboard contracts', () => {
    expect([...CAPABILITY_KEYS]).toEqual(expect.arrayContaining(REQUIRED_TARGET_CAPABILITIES))
    expect(TARGET_CAPABILITY_CATALOG.map((capability) => capability.key)).toEqual([...CAPABILITY_KEYS])
    expect(CAPABILITY_CATALOG).toHaveLength(34)

    for (const capability of CAPABILITY_CATALOG) {
      expect(capability.proofStatus).toBe('unproven')
      expect(capability.readyForDashboardExecution).toBe(false)
      expect(capability.inputContract.length, capability.key).toBeGreaterThan(0)
      expect(capability.outputType, capability.key).toBeTruthy()
    }
  })

  it('keeps proven capabilities exactly the live runtime paths', () => {
    const payload = getRuntimeProofStatus()

    expect(payload.provenCapabilities.map((item) => item.capability)).toEqual(PROVEN_CAPABILITIES)
    expect(payload.summary).toMatchObject({
      providerCount: 5,
      provenCount: 10,
      source: 'backend-runtime-proof-status',
    })
    expect(payload.unprovenCapabilities).toHaveLength(24)
    for (const capability of payload.unprovenCapabilities) {
      expect(capability.readyForDashboardExecution).toBe(false)
    }
  })

  it('keeps Studio free of provider/model selectors while exposing proof-gated catalog controls', () => {
    const studioSource = source('app/dashboard/studio/page.jsx')

    expect(studioSource).not.toContain('/api/admin/providers')
    expect(studioSource).not.toContain('provider selector')
    expect(studioSource).not.toContain('model selector')
    expect(studioSource).toContain('disabled={!ready}')
    expect(studioSource).toContain('disabled until backend proof passes')
  })

  it('Repo Workbench donor section cannot fake PR success', () => {
    expect(REPO_WORKBENCH_ACTIONS.map((action) => action.id)).toEqual(['analyze', 'repair-plan', 'diff', 'checks', 'pr'])
    for (const action of REPO_WORKBENCH_ACTIONS) {
      expect(action.enabled).toBe(false)
      const response = repoWorkbenchActionResponse(action.id)
      expect(response.status).toBe(501)
      expect(response.body).toMatchObject({
        error: true,
        enabled: false,
        fakeSuccess: false,
      })
    }
  })

  it('fallback media and design gates cannot count as runtime proof', () => {
    expect(MEDIA_TRUTH_CONTRACTS.length).toBeGreaterThan(0)
    for (const contract of MEDIA_TRUTH_CONTRACTS) {
      expect(contract.fallbackCountsAsProof).toBe(false)
      expect(fallbackMediaCanProveCapability(contract.capability)).toBe(false)
    }

    expect(DESIGN_QUALITY_GATES.length).toBeGreaterThan(0)
    for (const gate of DESIGN_QUALITY_GATES) {
      expect(gate.status).not.toBe('enforced')
    }
  })
})
