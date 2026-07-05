import fs from 'node:fs'
import path from 'node:path'
import { describe, expect, it } from 'vitest'
import { PROVIDER_KEYS } from '../packages/core/src/providers.ts'
import { DASHBOARD_TO_BACKEND_CAPABILITY_MAP } from '../lib/capability-map.js'
import { PROVIDER_CONTRACTS } from '../lib/dashboard-contract.js'
import { CAPABILITY_SCHEMAS, REQUIRED_MUSIC_GENRES } from '../lib/studio-capability-schemas.js'

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

  it('does not keep the old mock schema contract filename', () => {
    expect(fs.existsSync(path.join(ROOT, 'lib/mockSchemas.js'))).toBe(false)
    expect(fs.existsSync(path.join(ROOT, 'lib/studio-capability-schemas.js'))).toBe(true)
  })

  it('does not keep a MongoDB production API route or data access utility', () => {
    expect(fs.existsSync(path.join(ROOT, 'app/api/[[...path]]/route.js'))).toBe(false)
    expect(fs.existsSync(path.join(ROOT, 'lib/dataAccess.js'))).toBe(false)
  })

  it('does not declare an active mongodb dependency', () => {
    const pkg = JSON.parse(fs.readFileSync(path.join(ROOT, 'package.json'), 'utf8'))
    const activeDependencies = {
      ...pkg.dependencies,
      ...pkg.devDependencies,
      ...pkg.optionalDependencies,
      ...pkg.peerDependencies,
    }

    expect(activeDependencies.mongodb).toBeUndefined()
  })

  it('does not keep the old Studio chat response function name', () => {
    const storeText = fs.readFileSync(path.join(ROOT, 'lib/useStudioStore.js'), 'utf8')

    expect(storeText).toContain('appendBackendPendingChatNotice')
    expect(storeText).not.toContain('simulateChatResponse')
    expect(storeText).not.toContain('Math.random')
  })

  it('does not keep local worker simulation adapter files', () => {
    for (const adapter of ['image', 'text', 'video', 'voice']) {
      expect(fs.existsSync(path.join(ROOT, `apps/worker/src/adapters/${adapter}-simulation.ts`))).toBe(false)
    }
  })
})

describe('Prompt 2 dashboard frontend contracts', () => {
  it('Studio keeps a no-scroll full viewport layout', () => {
    const studioText = fs.readFileSync(path.join(ROOT, 'app/dashboard/studio/page.jsx'), 'utf8')
    const layoutText = fs.readFileSync(path.join(ROOT, 'app/dashboard/layout.js'), 'utf8')

    expect(studioText).toContain('h-[100dvh]')
    expect(studioText).toContain('overflow-hidden')
    expect(layoutText).toContain("pathname === '/dashboard/studio'")
    expect(layoutText).toContain('overflow-hidden')
  })

  it('Studio includes the backend-pending preview message', () => {
    const studioText = fs.readFileSync(path.join(ROOT, 'app/dashboard/studio/page.jsx'), 'utf8')

    expect(studioText).toContain('Backend integration pending.')
    expect(studioText).toContain('Real previews appear after /api/v1 jobs and artifacts are wired.')
  })

  it('music schema includes required Prompt 2 genres', () => {
    const genreOptions = CAPABILITY_SCHEMAS.music.genre.options

    for (const genre of REQUIRED_MUSIC_GENRES) {
      expect(genreOptions).toContain(genre)
    }
  })

  it('uncensored Studio mode is DeepInfra-only and gated backend pending', () => {
    const uncensored = CAPABILITY_SCHEMAS.uncensored
    const studioText = fs.readFileSync(path.join(ROOT, 'app/dashboard/studio/page.jsx'), 'utf8')

    expect(uncensored.provider.options).toEqual(['DeepInfra gated lane'])
    expect(uncensored.backend_gating.options).toEqual(['gated_backend_pending'])
    expect(studioText).toContain("provider: 'deepinfra'")
    expect(studioText).toContain('gated: true')
    expect(studioText).not.toContain("provider: 'groq', gated: true")
    expect(studioText).not.toContain("provider: 'mimo', gated: true")
  })

  it('active UI code does not use old proof-risk wording', () => {
    const banned = ['mock', 'simulation', 'fake', 'fabricated', 'random provider', 'MongoDB', '/api/simulation']
    const activeRoots = ['app', 'components/amarkt', 'lib']
    const files = activeRoots.flatMap((root) => listFiles(path.join(ROOT, root)))
      .filter((file) => /\.(js|jsx|ts|tsx)$/.test(file))
      .filter((file) => !file.endsWith('phase1-contracts.test.js'))

    for (const file of files) {
      const text = fs.readFileSync(file, 'utf8')
      const normalized = text.toLowerCase()
      for (const term of banned) {
        expect(normalized, file).not.toContain(term.toLowerCase())
      }
    }
  })
})

function listFiles(dir) {
  if (!fs.existsSync(dir)) return []
  return fs.readdirSync(dir, { withFileTypes: true }).flatMap((entry) => {
    const fullPath = path.join(dir, entry.name)
    return entry.isDirectory() ? listFiles(fullPath) : [fullPath]
  })
}
