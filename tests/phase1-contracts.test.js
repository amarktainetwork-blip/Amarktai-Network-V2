import fs from 'node:fs'
import path from 'node:path'
import { describe, expect, it } from 'vitest'
import { PROVIDER_KEYS } from '../packages/core/src/providers.ts'
import { DASHBOARD_TO_BACKEND_CAPABILITY_MAP } from '../lib/capability-map.js'
import { PROVIDER_CONTRACTS, STUDIO_MODES } from '../lib/dashboard-contract.js'
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

  it('dashboard index redirects to Studio', () => {
    const pageIndex = fs.readFileSync(path.join(ROOT, 'app/dashboard/page.js'), 'utf8')
    expect(pageIndex).toContain("redirect('/dashboard/studio')")
  })

  it('Studio uses grouped capability selector instead of icon rail', () => {
    const studioText = fs.readFileSync(path.join(ROOT, 'app/dashboard/studio/page.jsx'), 'utf8')

    expect(studioText).toContain('CapabilitySelector')
    expect(studioText).toContain('CAPABILITY_GROUPS')
    expect(studioText).toContain('DirectorBlock')
    expect(studioText).toContain('OptionsBlock')
    expect(studioText).not.toContain("provider: 'groq'")
    expect(studioText).not.toContain("provider: 'together'")
    expect(studioText).not.toContain("provider: 'genx'")
    expect(studioText).not.toContain("provider: 'mimo'")
  })

  it('Studio has two-block layout (Director + Options)', () => {
    const studioText = fs.readFileSync(path.join(ROOT, 'app/dashboard/studio/page.jsx'), 'utf8')

    expect(studioText).toContain('lg:grid-cols-')
    expect(studioText).toContain('DirectorBlock')
    expect(studioText).toContain('OptionsBlock')
    expect(studioText).toContain('Accordion')
    expect(studioText).toContain('Developer contract')
    expect(studioText).toContain('Runtime routing')
    expect(studioText).toContain('Artifact & proof status')
  })

  it('every final Studio selector label appears in page', () => {
    const studioText = fs.readFileSync(path.join(ROOT, 'app/dashboard/studio/page.jsx'), 'utf8')
    const labels = [
      'Chat', 'Reasoning', 'Code', 'Research',
      'Image generation', 'Image editing',
      'Short video', 'Long-form video', 'Image-to-video', 'Video edit / remix',
      'Music / Song', 'Voice / TTS', 'Speech-to-text',
      'Avatar generation', 'Talking avatar', 'Lip-sync avatar',
      'Website scrape / BrandPack', 'Campaign content', 'Social / reel pack',
      'RAG ingest', 'RAG search',
      'App request', 'Agent task', 'Workflow automation',
      'DeepInfra gated text',
    ]
    for (const label of labels) {
      expect(studioText, `Missing selector label: ${label}`).toContain(label)
    }
  })

  it('every schema key required by the selector exists', () => {
    // These keys must exist directly in CAPABILITY_SCHEMAS
    const directSchemaKeys = [
      'chat', 'reasoning', 'code', 'research',
      'image', 'video', 'longvideo',
      'image_to_video', 'video_edit',
      'music', 'voice',
      'avatar',
      'scrape', 'campaign', 'social_reel',
      'rag', 'rag_search',
      'app_request', 'agent_task', 'workflow',
      'uncensored',
    ]
    for (const key of directSchemaKeys) {
      expect(CAPABILITY_SCHEMAS[key], `Schema missing for ${key}`).toBeDefined()
    }
    // These modes share schemas via SCHEMA_MAP - verify the target schema exists
    const sharedSchemaTargets = {
      image_edit: 'image',
      voice_stt: 'voice',
      talking_avatar: 'avatar',
      lip_sync: 'avatar',
    }
    for (const [mode, targetSchema] of Object.entries(sharedSchemaTargets)) {
      expect(CAPABILITY_SCHEMAS[targetSchema], `Shared schema target ${targetSchema} missing for ${mode}`).toBeDefined()
    }
  })

  it('music schema includes required genres and controls', () => {
    const genreOptions = CAPABILITY_SCHEMAS.music.genre.options
    for (const genre of REQUIRED_MUSIC_GENRES) {
      expect(genreOptions).toContain(genre)
    }
    expect(CAPABILITY_SCHEMAS.music.describe_song).toBeDefined()
    expect(CAPABILITY_SCHEMAS.music.lyrics).toBeDefined()
    expect(CAPABILITY_SCHEMAS.music.instrumental_only).toBeDefined()
    expect(CAPABILITY_SCHEMAS.music.genre).toBeDefined()
    expect(CAPABILITY_SCHEMAS.music.vocal_style).toBeDefined()
    expect(CAPABILITY_SCHEMAS.music.instrumentation).toBeDefined()
    expect(CAPABILITY_SCHEMAS.music.tempo_bpm).toBeDefined()
    expect(CAPABILITY_SCHEMAS.music.target_duration).toBeDefined()
    expect(CAPABILITY_SCHEMAS.music.reference_track).toBeDefined()
  })

  it('long-form video schema includes required controls', () => {
    const lv = CAPABILITY_SCHEMAS.longvideo
    expect(lv.source).toBeDefined()
    expect(lv.script_input).toBeDefined()
    expect(lv.target_duration).toBeDefined()
    expect(lv.scene_count).toBeDefined()
    expect(lv.scene_cards).toBeDefined()
    expect(lv.subtitles).toBeDefined()
    expect(lv.cutdown_pack).toBeDefined()
    expect(lv.export_format).toBeDefined()
  })

  it('image-to-video schema includes required controls', () => {
    const i2v = CAPABILITY_SCHEMAS.image_to_video
    expect(i2v.source_image).toBeDefined()
    expect(i2v.first_frame).toBeDefined()
    expect(i2v.motion_strength).toBeDefined()
    expect(i2v.camera_movement).toBeDefined()
    expect(i2v.duration).toBeDefined()
    expect(i2v.prompt).toBeDefined()
  })

  it('campaign schema includes required controls', () => {
    const camp = CAPABILITY_SCHEMAS.campaign
    expect(camp.brand_product).toBeDefined()
    expect(camp.target_audience).toBeDefined()
    expect(camp.platforms).toBeDefined()
    expect(camp.campaign_objective).toBeDefined()
    expect(camp.offer_cta).toBeDefined()
    expect(camp.variants).toBeDefined()
  })

  it('agent_task schema includes required controls', () => {
    const agent = CAPABILITY_SCHEMAS.agent_task
    expect(agent.task_directive).toBeDefined()
    expect(agent.allowed_tools).toBeDefined()
    expect(agent.memory_access).toBeDefined()
    expect(agent.brand_access).toBeDefined()
    expect(agent.app_scope).toBeDefined()
    expect(agent.approval_required).toBeDefined()
  })

  it('workflow schema includes required controls', () => {
    const wf = CAPABILITY_SCHEMAS.workflow
    expect(wf.trigger_type).toBeDefined()
    expect(wf.steps).toBeDefined()
    expect(wf.approval_gates).toBeDefined()
    expect(wf.schedule).toBeDefined()
    expect(wf.success_criteria).toBeDefined()
    expect(wf.rollback_notes).toBeDefined()
  })

  it('voice schema includes South African accent', () => {
    const accentOptions = CAPABILITY_SCHEMAS.voice.accent.options
    expect(accentOptions).toContain('South African')
  })

  it('uncensored Studio mode is DeepInfra-only and gated backend pending', () => {
    const uncensored = CAPABILITY_SCHEMAS.uncensored
    const studioText = fs.readFileSync(path.join(ROOT, 'app/dashboard/studio/page.jsx'), 'utf8')

    expect(uncensored.provider.options).toEqual(['DeepInfra gated lane'])
    expect(uncensored.backend_gating.options).toEqual(['gated_backend_pending'])
    expect(studioText).toContain('DeepInfra gated')
    expect(studioText).toContain('gated: true')
  })

  it('DynamicFormRenderer hides Backend Pending groups by default', () => {
    const rendererText = fs.readFileSync(path.join(ROOT, 'components/amarkt/DynamicFormRenderer.jsx'), 'utf8')
    expect(rendererText).toContain('BACKEND_PENDING_GROUPS')
    expect(rendererText).toContain('Backend Pending')
    expect(rendererText).toContain('Advanced & Backend Details')
  })

  it('capability map has frontend-planned entries for new modes', () => {
    expect(DASHBOARD_TO_BACKEND_CAPABILITY_MAP['video.image_to_video']).toMatchObject({ missing: true })
    expect(DASHBOARD_TO_BACKEND_CAPABILITY_MAP['video.edit']).toMatchObject({ missing: true })
    expect(DASHBOARD_TO_BACKEND_CAPABILITY_MAP['campaign.generate']).toMatchObject({ missing: true })
    expect(DASHBOARD_TO_BACKEND_CAPABILITY_MAP['social.reel_pack']).toMatchObject({ missing: true })
    expect(DASHBOARD_TO_BACKEND_CAPABILITY_MAP['app.request']).toMatchObject({ missing: true })
    expect(DASHBOARD_TO_BACKEND_CAPABILITY_MAP['agent.task']).toMatchObject({ missing: true })
    expect(DASHBOARD_TO_BACKEND_CAPABILITY_MAP['workflow.automation']).toMatchObject({ missing: true })
    expect(DASHBOARD_TO_BACKEND_CAPABILITY_MAP['research']).toMatchObject({ missing: true })
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

  it('STUDIO_MODES does not contain defaultProvider', () => {
    for (const mode of STUDIO_MODES) {
      expect(mode.defaultProvider, `defaultProvider found in mode ${mode.id}`).toBeUndefined()
    }
  })

  it('Studio uses Developer/Admin labels instead of Backend', () => {
    const studioText = fs.readFileSync(path.join(ROOT, 'app/dashboard/studio/page.jsx'), 'utf8')
    expect(studioText).toContain('Developer')
    expect(studioText).toContain('Runtime routing')
    expect(studioText).toContain('Developer contract')
    expect(studioText).not.toContain("'Backend contract'")
    expect(studioText).not.toContain("'Provider routing'")
  })

  it('App page does not show raw contract JSON by default', () => {
    const appText = fs.readFileSync(path.join(ROOT, 'app/dashboard/app-gateway/page.js'), 'utf8')
    expect(appText).not.toContain('App Contract Drawer')
    expect(appText).not.toContain('apiKeyStatus')
    expect(appText).not.toContain('webhookSecretStatus')
    expect(appText).not.toContain('Workspace State')
    expect(appText).not.toContain('Request runner')
    expect(appText).toContain('Developer details')
    expect(appText).toContain('App Templates')
  })

  it('Jobs/Work Library page does not show backend debug panels', () => {
    const jobsText = fs.readFileSync(path.join(ROOT, 'app/dashboard/jobs/page.js'), 'utf8')
    expect(jobsText).not.toContain('Provider attempts panel')
    expect(jobsText).not.toContain('Signed URL status')
    expect(jobsText).not.toContain('Webhook delivery status')
    expect(jobsText).not.toContain('Proof status')
    expect(jobsText).not.toContain('Job timeline panel')
    expect(jobsText).toContain('Work Library')
    expect(jobsText).toContain('Admin diagnostics')
  })

  it('Capabilities page does not hard-code providers', () => {
    const capText = fs.readFileSync(path.join(ROOT, 'app/dashboard/capabilities/page.js'), 'utf8')
    expect(capText).not.toContain('Required env')
    expect(capText).not.toContain('Backend key')
    expect(capText).not.toContain('Backend route')
    expect(capText).not.toContain('Live proof')
    expect(capText).not.toContain('route_pending')
    expect(capText).not.toContain('capability_missing')
    expect(capText).not.toContain('live_proof_required')
    expect(capText).not.toContain('Next action: wire')
    expect(capText).toContain('Runtime selected')
    expect(capText).toContain('Capability Library')
    expect(capText).toContain('Developer matrix')
  })

  it('Settings page does not show hard-coded fallback order', () => {
    const settingsText = fs.readFileSync(path.join(ROOT, 'app/dashboard/settings/page.js'), 'utf8')
    expect(settingsText).not.toContain('Language: Groq')
    expect(settingsText).not.toContain('Image: Together')
    expect(settingsText).not.toContain('Video: GenX')
    expect(settingsText).not.toContain('Voice: Groq')
    expect(settingsText).not.toContain('Music: GenX')
    expect(settingsText).toContain('Runtime selected')
    expect(settingsText).toContain('Runtime Policy')
  })
})

function listFiles(dir) {
  if (!fs.existsSync(dir)) return []
  return fs.readdirSync(dir, { withFileTypes: true }).flatMap((entry) => {
    const fullPath = path.join(dir, entry.name)
    return entry.isDirectory() ? listFiles(fullPath) : [fullPath]
  })
}
