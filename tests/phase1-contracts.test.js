import fs from 'node:fs'
import path from 'node:path'
import { describe, expect, it } from 'vitest'
import { PROVIDER_KEYS } from '../packages/core/src/providers.ts'
import { DASHBOARD_TO_BACKEND_CAPABILITY_MAP } from '../lib/capability-map.js'
import { PROVIDER_CONTRACTS } from '../lib/dashboard-contract.js'

const ROOT = process.cwd()
const FINAL_PROVIDERS = ['genx', 'groq', 'together', 'mimo', 'deepinfra']
const BANNED_PROVIDER_IDS = [
  'heygen',
  'huggingface',
  'hugging-face',
  'qwen',
  'minimax',
  'gemini',
  'openai',
  'anthropic',
  'replicate',
  'lyria',
]

describe('Phase 1 provider source of truth', () => {
  it('core provider IDs are exactly the final five providers', () => {
    expect([...PROVIDER_KEYS]).toEqual(FINAL_PROVIDERS)
  })

  it('dashboard provider contracts are exactly the final five providers', () => {
    expect(PROVIDER_CONTRACTS.map((provider) => provider.id)).toEqual(FINAL_PROVIDERS)
  })

  it('dashboard provider contracts do not include banned legacy providers', () => {
    const activeProviderText = JSON.stringify(PROVIDER_CONTRACTS).toLowerCase()
    for (const banned of BANNED_PROVIDER_IDS) {
      expect(activeProviderText).not.toContain(banned)
    }
  })

  it('DeepInfra exists as the gated uncensored lane', () => {
    const deepinfra = PROVIDER_CONTRACTS.find((provider) => provider.id === 'deepinfra')
    expect(deepinfra).toMatchObject({
      finalProvider: true,
      gated: true,
      gatedCapability: 'uncensored.text',
      role: 'gated_uncensored_lane',
      status: 'gated_backend_pending',
    })
  })

  it('MiMo exists as a final coding and reasoning provider', () => {
    const mimo = PROVIDER_CONTRACTS.find((provider) => provider.id === 'mimo')
    expect(mimo).toMatchObject({
      finalProvider: true,
      role: 'coding_reasoning',
      status: 'backend_pending',
    })
  })
})

describe('Phase 1 capability map', () => {
  it.each([
    ['text.chat', 'chat'],
    ['text.reasoning', 'reasoning'],
    ['text.code', 'code'],
    ['image.generate', 'image_generation'],
    ['image.edit', 'image_edit'],
    ['video.generate', 'video_generation'],
    ['music.generate', 'music_generation'],
    ['voice.tts', 'tts'],
    ['voice.stt', 'stt'],
    ['avatar.generate', 'avatar_generation'],
    ['scrape.crawl', 'brand_scrape'],
    ['rag.ingest', 'rag_ingest'],
    ['rag.query', 'rag_search'],
  ])('%s maps to %s', (dashboardCapability, backendCapability) => {
    expect(DASHBOARD_TO_BACKEND_CAPABILITY_MAP[dashboardCapability]).toMatchObject({
      backendCapability,
      missing: false,
    })
  })

  it('video.longform remains missing until backend canonical support exists', () => {
    expect(DASHBOARD_TO_BACKEND_CAPABILITY_MAP['video.longform']).toMatchObject({
      backendCapability: null,
      missing: true,
      expectedBackendKey: 'long_form_video',
    })
  })

  it('uncensored.text remains a gated planned capability until backend support exists', () => {
    expect(DASHBOARD_TO_BACKEND_CAPABILITY_MAP['uncensored.text']).toMatchObject({
      backendCapability: null,
      missing: true,
      plannedBackendKey: 'uncensored_text',
      gated: true,
      providerId: 'deepinfra',
    })
  })
})

describe('Phase 1 hard cleanup filesystem checks', () => {
  it('does not keep an /api/simulation route file', () => {
    expect(fs.existsSync(path.join(ROOT, 'app/api/simulation/[[...path]]/route.js'))).toBe(false)
  })

  it('does not keep a MongoDB production API route or data access utility', () => {
    expect(fs.existsSync(path.join(ROOT, 'app/api/[[...path]]/route.js'))).toBe(false)
    expect(fs.existsSync(path.join(ROOT, 'lib/dataAccess.js'))).toBe(false)
  })
})
