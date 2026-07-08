import fs from 'node:fs'
import path from 'node:path'
import { describe, expect, it } from 'vitest'
import { PROVIDER_KEYS } from '../packages/core/src/providers.ts'
import { BLOCKED_OVERRIDE_FIELDS, hasBlockedOverrides } from '../packages/core/src/jobs.ts'
import { DASHBOARD_TO_BACKEND_CAPABILITY_MAP } from '../lib/capability-map.js'
import { PROVIDER_CONTRACTS, STUDIO_MODES } from '../lib/dashboard-contract.js'
import { CAPABILITY_SCHEMAS, REQUIRED_MUSIC_GENRES } from '../lib/studio-capability-schemas.js'

const ROOT = process.cwd()
const FINAL_PROVIDERS = ['genx', 'groq', 'together', 'mimo', 'deepinfra']
const BANNED_PROVIDER_IDS = [
  'heygen', 'huggingface', 'hugging-face', 'qwen', 'minimax',
  'gemini', 'openai', 'anthropic', 'replicate', 'lyria',
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

  it('DeepInfra exists as an approved but unproven backend-controlled lane', () => {
    const deepinfra = PROVIDER_CONTRACTS.find((provider) => provider.id === 'deepinfra')
    expect(deepinfra).toMatchObject({
      finalProvider: true, gated: true, gatedCapability: 'uncensored.text',
      role: 'gated_uncensored_lane', status: 'backend_pending',
    })
  })

  it('MiMo exists as a final coding and reasoning provider', () => {
    const mimo = PROVIDER_CONTRACTS.find((provider) => provider.id === 'mimo')
    expect(mimo).toMatchObject({ finalProvider: true, role: 'coding_reasoning', status: 'backend_pending' })
  })
})

describe('Phase 1 capability map', () => {
  it.each([
    ['text.chat', 'chat'], ['text.reasoning', 'reasoning'], ['text.code', 'code'],
    ['image.generate', 'image_generation'], ['image.edit', 'image_edit'],
    ['video.generate', 'video_generation'], ['music.generate', 'music_generation'],
    ['voice.tts', 'tts'], ['voice.stt', 'stt'], ['avatar.generate', 'avatar_generation'],
    ['scrape.crawl', 'brand_scrape'], ['rag.ingest', 'rag_ingest'], ['rag.query', 'rag_search'],
  ])('%s maps to %s', (dashboardCapability, backendCapability) => {
    expect(DASHBOARD_TO_BACKEND_CAPABILITY_MAP[dashboardCapability]).toMatchObject({ backendCapability, missing: false })
  })

  it('video.longform remains missing until backend canonical support exists', () => {
    expect(DASHBOARD_TO_BACKEND_CAPABILITY_MAP['video.longform']).toMatchObject({ backendCapability: null, missing: true, expectedBackendKey: 'long_form_video' })
  })

  it('uncensored.text remains a gated planned capability until backend support exists', () => {
    expect(DASHBOARD_TO_BACKEND_CAPABILITY_MAP['uncensored.text']).toMatchObject({ backendCapability: null, missing: true, plannedBackendKey: 'uncensored_text', gated: true, providerId: 'deepinfra' })
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
    const activeDependencies = { ...pkg.dependencies, ...pkg.devDependencies, ...pkg.optionalDependencies, ...pkg.peerDependencies }
    expect(activeDependencies.mongodb).toBeUndefined()
  })

  it('does not keep the old Studio chat response function name', () => {
    const storeText = fs.readFileSync(path.join(ROOT, 'lib/useStudioStore.js'), 'utf8')
    expect(storeText).not.toContain('simulateChatResponse')
    expect(storeText).not.toContain('Math.random')
    expect(storeText).not.toContain('setTimeout')
    expect(storeText).not.toContain('appendBackendPendingChatNotice')
  })

  it('does not keep local worker simulation adapter files', () => {
    for (const adapter of ['image', 'text', 'video', 'voice']) {
      expect(fs.existsSync(path.join(ROOT, `apps/worker/src/adapters/${adapter}-simulation.ts`))).toBe(false)
    }
  })

  it('jobs route no longer uses Math.random for trace IDs', () => {
    const jobsRouteText = fs.readFileSync(path.join(ROOT, 'apps/api/src/routes/jobs.ts'), 'utf8')
    expect(jobsRouteText).toContain('randomUUID')
    expect(jobsRouteText).not.toContain('Math.random')
  })

  it('provider and model override fields remain blocked', () => {
    expect([...BLOCKED_OVERRIDE_FIELDS]).toEqual([
      'providerOverride', 'modelOverride', 'provider', 'model', 'providerKey', 'modelId',
    ])

    for (const field of BLOCKED_OVERRIDE_FIELDS) {
      expect(hasBlockedOverrides({ [field]: 'blocked' })).toBe(field)
    }
    expect(hasBlockedOverrides({ capability: 'chat' })).toBeNull()
  })

  it('does not add dashboard or Studio job submission API routes', () => {
    const forbiddenRoutes = [
      'app/api/jobs/route.js',
      'app/api/studio/jobs/route.js',
      'app/api/dashboard/jobs/route.js',
      'app/api/v1/jobs/route.js',
    ]
    for (const route of forbiddenRoutes) {
      expect(fs.existsSync(path.join(ROOT, route))).toBe(false)
    }
  })

  it('does not add Mimo or DeepInfra runtime execution adapters', () => {
    const workerRegistry = fs.readFileSync(path.join(ROOT, 'apps/worker/src/adapters/index.ts'), 'utf8')
    const providerFiles = listFiles(path.join(ROOT, 'packages/providers/src'))
    const adapterFiles = listFiles(path.join(ROOT, 'apps/worker/src/adapters'))

    expect(workerRegistry).not.toMatch(/Mimo|DeepInfra/i)
    for (const file of [...providerFiles, ...adapterFiles]) {
      const normalized = file.replace(/\\/g, '/').toLowerCase()
      expect(normalized).not.toContain('mimo')
      expect(normalized).not.toContain('deepinfra')
    }
  })

  it('backend foundation scripts exist', () => {
    const pkg = JSON.parse(fs.readFileSync(path.join(ROOT, 'package.json'), 'utf8'))
    expect(pkg.scripts['prisma:validate']).toBe('node scripts/prisma-validate.mjs')
    expect(pkg.scripts['build:backend']).toContain('@amarktai/core')
    expect(pkg.scripts['build:backend']).toContain('@amarktai/worker')
    expect(fs.existsSync(path.join(ROOT, 'scripts/prisma-validate.mjs'))).toBe(true)
  })
})

describe('Dashboard truth cleanup', () => {
  it('Studio keeps a no-scroll full viewport layout', () => {
    const studioText = fs.readFileSync(path.join(ROOT, 'app/dashboard/studio/page.jsx'), 'utf8')
    const layoutText = fs.readFileSync(path.join(ROOT, 'app/dashboard/layout.js'), 'utf8')
    expect(studioText).toContain('h-[100dvh]')
    expect(studioText).toContain('overflow-hidden')
    expect(layoutText).toContain("pathname === '/dashboard/studio'")
  })

  it('dashboard index redirects to Studio', () => {
    const pageIndex = fs.readFileSync(path.join(ROOT, 'app/dashboard/page.js'), 'utf8')
    expect(pageIndex).toContain("redirect('/dashboard/studio')")
  })

  it('Studio SCHEMA_MAP includes image_edit, voice_stt, talking_avatar, lip_sync', () => {
    const studioText = fs.readFileSync(path.join(ROOT, 'app/dashboard/studio/page.jsx'), 'utf8')
    expect(studioText).toContain("image_edit: 'image'")
    expect(studioText).toContain("voice_stt: 'voice'")
    expect(studioText).toContain("talking_avatar: 'avatar'")
    expect(studioText).toContain("lip_sync: 'avatar'")
  })

  it('every Studio selector mode resolves to a non-empty schema', () => {
    const schemaKeys = [
      'chat', 'reasoning', 'code', 'research', 'image', 'video', 'longvideo',
      'image_to_video', 'video_edit', 'music', 'voice', 'avatar',
      'scrape', 'campaign', 'social_reel', 'rag', 'rag_search',
      'app_request', 'agent_task', 'workflow', 'uncensored',
    ]
    for (const key of schemaKeys) {
      expect(CAPABILITY_SCHEMAS[key], `Schema missing for ${key}`).toBeDefined()
    }
  })

  it('Studio does not use setTimeout to simulate assistant responses', () => {
    const storeText = fs.readFileSync(path.join(ROOT, 'lib/useStudioStore.js'), 'utf8')
    expect(storeText).not.toContain('setTimeout')
    expect(storeText).not.toContain('appendBackendPendingChatNotice')
    expect(storeText).toContain('submitDraft')
  })

  it('Apps page does not render fake app cards', () => {
    const appText = fs.readFileSync(path.join(ROOT, 'app/dashboard/app-gateway/page.js'), 'utf8')
    expect(appText).not.toContain('APP_TEMPLATES')
    expect(appText).not.toContain('Ready to configure')
    expect(appText).not.toContain('Requires backend connection')
    expect(appText).not.toContain('Connect after backend')
    expect(appText).toContain('No apps connected yet')
    expect(appText).toContain('Backend connection required')
    expect(appText).toContain('Supported app types')
  })

  it('Work Library does not show active tabs/search', () => {
    const jobsText = fs.readFileSync(path.join(ROOT, 'app/dashboard/jobs/page.js'), 'utf8')
    expect(jobsText).not.toContain('Provider attempts panel')
    expect(jobsText).not.toContain('Signed URL status')
    expect(jobsText).not.toContain('Proof status')
    expect(jobsText).toContain('No creations yet')
  })

  it('Capability Library uses backend proof status instead of blanket Studio readiness', () => {
    const capText = fs.readFileSync(path.join(ROOT, 'app/dashboard/capabilities/page.js'), 'utf8')
    expect(capText).toContain('RuntimeProofSummary')
    expect(capText).toContain('runtimeProofStatusLabel')
    expect(capText).toContain('Disabled until backend proof passes')
    expect(capText).not.toContain('Visible in Studio')
    expect(capText).not.toContain('Studio UI ready')
  })

  it('Providers dashboard page is removed', () => {
    expect(fs.existsSync(path.join(ROOT, 'app/dashboard/providers/page.js'))).toBe(false)
  })

  it('DASHBOARD_PAGES does not include providers', () => {
    const { DASHBOARD_PAGES } = require('../lib/dashboard-contract.js')
    const providerPage = DASHBOARD_PAGES.find((p) => p.id === 'providers')
    expect(providerPage).toBeUndefined()
  })

  it('Settings page does not use Save local draft toast', () => {
    const settingsText = fs.readFileSync(path.join(ROOT, 'app/dashboard/settings/page.js'), 'utf8')
    const providerSettingsText = fs.readFileSync(path.join(ROOT, 'components/dashboard/provider-settings-panel.jsx'), 'utf8')
    expect(settingsText).not.toContain('Save local draft')
    expect(settingsText).not.toContain("toast.info('Local draft only'")
    expect(settingsText).not.toContain('toast.info')
    expect(settingsText).toContain('ProviderSettingsPanel')
    expect(providerSettingsText).toContain('Backend provider status is the source of truth')
  })

  it('Agents page does not show fake agent shell text', () => {
    const agentsText = fs.readFileSync(path.join(ROOT, 'app/dashboard/agents/page.js'), 'utf8')
    expect(agentsText).not.toContain('Agent grid shell')
    expect(agentsText).not.toContain('No backend agents loaded')
    expect(agentsText).not.toContain('contract_ready')
    expect(agentsText).not.toContain('backend_pending')
    expect(agentsText).toContain('No agents created yet')
  })

  it('Brand Library does not show fake section cards', () => {
    const brandText = fs.readFileSync(path.join(ROOT, 'app/dashboard/brand-library/page.js'), 'utf8')
    expect(brandText).not.toContain('ui_ready')
    expect(brandText).not.toContain('Brand Details Panel')
    expect(brandText).not.toContain('Awaiting real BrandPack artifact data')
    expect(brandText).toContain('No BrandPacks yet')
  })

  it('Store does not create fake app IDs', () => {
    const storeText = fs.readFileSync(path.join(ROOT, 'lib/useStudioStore.js'), 'utf8')
    expect(storeText).not.toContain('app-${id}')
    expect(storeText).not.toContain('createWorkspace: async (workspaceData)')
    expect(storeText).not.toContain('createApp: async (name)')
    expect(storeText).toContain('backend_required')
  })

  it('STUDIO_MODES does not contain defaultProvider', () => {
    for (const mode of STUDIO_MODES) {
      expect(mode.defaultProvider, `defaultProvider found in mode ${mode.id}`).toBeUndefined()
    }
  })

  it('final active provider list remains exactly five', () => {
    expect(PROVIDER_CONTRACTS.map((p) => p.id)).toEqual(FINAL_PROVIDERS)
  })

  it('DeepInfra gated Studio mode remains disabled until backend proof passes', () => {
    const studioText = fs.readFileSync(path.join(ROOT, 'app/dashboard/studio/page.jsx'), 'utf8')
    expect(studioText).toContain('Backend-controlled gated text')
    expect(studioText).toContain('gated: true')
    expect(studioText).toContain('Disabled until backend proof passes')
  })

  it('Docker Redis uses BullMQ-safe noeviction policy', () => {
    const compose = fs.readFileSync(path.join(ROOT, 'docker-compose.yml'), 'utf8')
    expect(compose).toContain('maxmemory-policy noeviction')
    expect(compose).not.toContain('maxmemory-policy allkeys-lru')
  })

  it('Docker Qdrant has no healthcheck', () => {
    const compose = fs.readFileSync(path.join(ROOT, 'docker-compose.yml'), 'utf8')
    const qdrantSection = compose.split('# ── Qdrant')[1]?.split('# ── API')[0] ?? ''
    // No CMD-SHELL healthcheck with curl/wget
    expect(qdrantSection).not.toContain('CMD-SHELL')
    expect(qdrantSection).not.toContain('healthcheck:')
  })

  it('Docker dashboard binds to all interfaces and uses Node healthcheck', () => {
    const compose = fs.readFileSync(path.join(ROOT, 'docker-compose.yml'), 'utf8')
    const dashboardSection = compose.split('# ── Dashboard')[1]?.split('# ── Volumes')[0] ?? ''
    expect(dashboardSection).toContain('HOSTNAME: 0.0.0.0')
    expect(dashboardSection).toContain('PORT: 3000')
    expect(dashboardSection).toContain('node')
    expect(dashboardSection).toContain('127.0.0.1:3000')
    expect(dashboardSection).not.toContain('wget')
    expect(dashboardSection).not.toContain('curl')
  })

  it('Command Center fetches provider status from backend', () => {
    const cmdText = fs.readFileSync(path.join(ROOT, 'app/dashboard/command-center/page.js'), 'utf8')
    expect(cmdText).toContain('/api/admin/providers')
    expect(cmdText).toContain('getHealthStatusLabel')
    // Should not show static provider.status from contracts
    expect(cmdText).not.toContain('{provider.status}')
  })

  it('Provider Settings uses backend status contract', () => {
    const settingsText = fs.readFileSync(path.join(ROOT, 'components/dashboard/provider-settings-panel.jsx'), 'utf8')
    expect(settingsText).toContain('getHealthStatusLabel')
  })

  it('Provider status labels include Live tested for live status', () => {
    const contractText = fs.readFileSync(path.join(ROOT, 'lib/provider-settings-contract.js'), 'utf8')
    expect(contractText).toContain('live')
    expect(contractText).toContain('Live tested')
  })
})

function listFiles(dir) {
  if (!fs.existsSync(dir)) return []
  return fs.readdirSync(dir, { withFileTypes: true }).flatMap((entry) => {
    const fullPath = path.join(dir, entry.name)
    return entry.isDirectory() ? listFiles(fullPath) : [fullPath]
  })
}
