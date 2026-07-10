import { describe, it, expect } from 'vitest'
import fs from 'fs'
import path from 'path'

const ROOT = path.join(import.meta.dirname, '..')

describe('dashboard polish and routing map contract', () => {
  describe('main nav remains simple', () => {
    it('DASHBOARD_PAGES contains the 8 main sections', async () => {
      const { DASHBOARD_PAGES } = await import('../lib/dashboard-contract.js')
      const labels = DASHBOARD_PAGES.map((p) => p.label)
      expect(labels).toContain('Chat')
      expect(labels).toContain('Image')
      expect(labels).toContain('Video')
      expect(labels).toContain('Music')
      expect(labels).toContain('Research')
      expect(labels).toContain('Library')
      expect(labels).toContain('Operations')
      expect(labels).toContain('Settings')
      expect(DASHBOARD_PAGES.length).toBe(8)
    })
  })

  describe('Capability Lab exists', () => {
    it('Capability Lab page file exists', () => {
      const pagePath = path.join(ROOT, 'app/dashboard/capability-lab/page.js')
      expect(fs.existsSync(pagePath)).toBe(true)
    })

    it('Capability Lab is in ADVANCED_NAV', async () => {
      const { ADVANCED_PAGES } = await import('../lib/dashboard-contract.js')
      const capLab = ADVANCED_PAGES.find((p) => p.id === 'capability-lab')
      expect(capLab).toBeDefined()
      expect(capLab.href).toBe('/dashboard/capability-lab')
    })

    it('Capability Lab page contains workflow sections', () => {
      const pagePath = path.join(ROOT, 'app/dashboard/capability-lab/page.js')
      const content = fs.readFileSync(pagePath, 'utf8')
      expect(content).toContain('Chat & Reasoning')
      expect(content).toContain('Image Creation')
      expect(content).toContain('Video Creation')
      expect(content).toContain('Music & Audio')
      expect(content).toContain('Voice')
      expect(content).toContain('Research & RAG')
      expect(content).toContain('Brand & Marketing')
      expect(content).toContain('Apps & Automation')
      expect(content).toContain('Operations & Governance')
      expect(content).toContain('Adult / Restricted')
    })

    it('Capability Lab references platform architecture', () => {
      const pagePath = path.join(ROOT, 'app/dashboard/capability-lab/page.js')
      const content = fs.readFileSync(pagePath, 'utf8')
      expect(content).toContain('Platform Architecture')
      expect(content).toContain('central capability platform')
      expect(content).toContain('External apps')
    })
  })

  describe('Advanced does not make old Studio look like the main dashboard', () => {
    it('Studio is labeled as Developer Studio / Legacy in nav', async () => {
      const { ADVANCED_PAGES } = await import('../lib/dashboard-contract.js')
      const studio = ADVANCED_PAGES.find((p) => p.id === 'studio')
      expect(studio).toBeDefined()
      expect(studio.label).toContain('Developer Studio')
      expect(studio.label).toContain('Legacy')
    })

    it('Studio page header says Developer Studio / Legacy', () => {
      const studioPath = path.join(ROOT, 'app/dashboard/studio/page.jsx')
      const content = fs.readFileSync(studioPath, 'utf8')
      expect(content).toContain('Developer Studio / Legacy')
      expect(content).toContain('Execution tester')
    })

    it('Advanced section is renamed to Platform Tools', () => {
      const layoutPath = path.join(ROOT, 'app/dashboard/layout.js')
      const content = fs.readFileSync(layoutPath, 'utf8')
      expect(content).toContain('Platform Tools')
    })
  })

  describe('Music page uses the canonical route/status/artifact flow', () => {
    it('Music page file exists and exposes truthful gated controls', () => {
      const pagePath = path.join(ROOT, 'app/dashboard/music/page.js')
      const content = fs.readFileSync(pagePath, 'utf8')
      expect(content).toContain('Music Studio')
      expect(content).toContain('/api/admin/music/status')
      expect(content).toContain('/api/admin/music/generate')
      expect(content).toContain('/api/admin/jobs/${jobId}')
      expect(content).toContain('/api/admin/artifacts/${data.artifactId}/file')
      expect(content).toContain('Implementation')
      expect(content).toContain('Configured')
      expect(content).toContain('Executable Now')
      expect(content).toContain('Live Proven')
      expect(content).toContain('Instrumental Only')
      expect(content).not.toContain('selectedProvider')
      expect(content).not.toContain('selectedModel')
    })

    it('Music page shows active generation controls or blocked status', () => {
      const pagePath = path.join(ROOT, 'app/dashboard/music/page.js')
      const content = fs.readFileSync(pagePath, 'utf8')
      expect(content).toContain('Music Studio')
      expect(content).toContain('canExecute')
    })

    it('Music page has generation form controls', () => {
      const pagePath = path.join(ROOT, 'app/dashboard/music/page.js')
      const content = fs.readFileSync(pagePath, 'utf8')
      expect(content).toContain('instrumental')
      expect(content).toContain('handleGenerate')
    })

    it('Music page controls are disabled', () => {
      const pagePath = path.join(ROOT, 'app/dashboard/music/page.js')
      const content = fs.readFileSync(pagePath, 'utf8')
      expect(content).toContain('disabled')
    })
  })

  describe('Image page shows Balanced/Premium/Fast/Budget but does not expose provider/model selectors', () => {
    it('Image page contains quality mode controls', () => {
      const pagePath = path.join(ROOT, 'app/dashboard/image/page.js')
      const content = fs.readFileSync(pagePath, 'utf8')
      expect(content).toContain('Balanced')
      expect(content).toContain('Premium')
      expect(content).toContain('Fast')
      expect(content).toContain('Budget')
    })

    it('Image page quality mode controls are disabled', () => {
      const pagePath = path.join(ROOT, 'app/dashboard/image/page.js')
      const content = fs.readFileSync(pagePath, 'utf8')
      expect(content).toContain('Routing backend pending')
    })

    it('Image page does not expose provider/model selectors', () => {
      const pagePath = path.join(ROOT, 'app/dashboard/image/page.js')
      const content = fs.readFileSync(pagePath, 'utf8')
      expect(content).not.toContain('provider-select')
      expect(content).not.toContain('model-select')
      expect(content).toContain('Provider/model selection is handled by the platform runtime')
    })

    it('Image page shows pending capabilities', () => {
      const pagePath = path.join(ROOT, 'app/dashboard/image/page.js')
      const content = fs.readFileSync(pagePath, 'utf8')
      expect(content).toContain('Image Edit')
      expect(content).toContain('Upscale')
      expect(content).toContain('Variations')
    })

    it('Image page has planned controls section', () => {
      const pagePath = path.join(ROOT, 'app/dashboard/image/page.js')
      const content = fs.readFileSync(pagePath, 'utf8')
      expect(content).toContain('Planned Controls')
      expect(content).toContain('Aspect Ratio')
      expect(content).toContain('Style')
      expect(content).toContain('Negative Prompt')
      expect(content).toContain('Seed')
      expect(content).toContain('Brand Mode')
    })
  })

  describe('Video page shows short/live and long-form/pending honestly', () => {
    it('Video page shows short video as live capability', () => {
      const pagePath = path.join(ROOT, 'app/dashboard/video/page.js')
      const content = fs.readFileSync(pagePath, 'utf8')
      expect(content).toContain('Short Video')
      expect(content).toContain('Live')
    })

    it('Video page shows long-form as pending', () => {
      const pagePath = path.join(ROOT, 'app/dashboard/video/page.js')
      const content = fs.readFileSync(pagePath, 'utf8')
      expect(content).toContain('Long-Form Video')
      expect(content).toContain('Pending')
      expect(content).toContain('Backend Pending')
    })

    it('Video page shows image-to-video as pending', () => {
      const pagePath = path.join(ROOT, 'app/dashboard/video/page.js')
      const content = fs.readFileSync(pagePath, 'utf8')
      expect(content).toContain('Image-to-Video')
    })

    it('Video page shows storyboard as pending', () => {
      const pagePath = path.join(ROOT, 'app/dashboard/video/page.js')
      const content = fs.readFileSync(pagePath, 'utf8')
      expect(content).toContain('Storyboard')
    })

    it('Video page shows voiceover/subtitles as pending', () => {
      const pagePath = path.join(ROOT, 'app/dashboard/video/page.js')
      const content = fs.readFileSync(pagePath, 'utf8')
      expect(content).toContain('Voiceover')
      expect(content).toContain('Subtitles')
    })

    it('Video page has planned controls', () => {
      const pagePath = path.join(ROOT, 'app/dashboard/video/page.js')
      const content = fs.readFileSync(pagePath, 'utf8')
      expect(content).toContain('Quality Mode')
      expect(content).toContain('Balanced')
      expect(content).toContain('Premium')
      expect(content).toContain('Fast')
      expect(content).toContain('Budget')
      expect(content).toContain('Aspect Ratio')
      expect(content).toContain('Scene Count')
      expect(content).toContain('Storyboard Outline')
      expect(content).toContain('Brand Mode')
    })
  })

  describe('routing map exists and is correct', () => {
    it('capability-routing-map.js file exists', () => {
      const mapPath = path.join(ROOT, 'lib/capability-routing-map.js')
      expect(fs.existsSync(mapPath)).toBe(true)
    })

    it('routing map says image_generation is Together-only', async () => {
      const { CAPABILITY_ROUTING_MAP, ROUTING_TRUTH } = await import('../lib/capability-routing-map.js')
      const imageCap = CAPABILITY_ROUTING_MAP.find((c) => c.id === 'image_generation')
      expect(imageCap).toBeDefined()
      expect(imageCap.wiredProvider).toBe('together')
      expect(imageCap.availableProviders).toEqual(['together'])
      expect(ROUTING_TRUTH.image_generation_wired_to).toBe('together')
    })

    it('routing map says video_generation is GenX-only', async () => {
      const { CAPABILITY_ROUTING_MAP, ROUTING_TRUTH } = await import('../lib/capability-routing-map.js')
      const videoCap = CAPABILITY_ROUTING_MAP.find((c) => c.id === 'video_generation')
      expect(videoCap).toBeDefined()
      expect(videoCap.wiredProvider).toBe('genx')
      expect(videoCap.availableProviders).toEqual(['genx'])
      expect(ROUTING_TRUTH.video_generation_wired_to).toBe('genx')
    })

    it('routing map says music_generation pending', async () => {
      const { CAPABILITY_ROUTING_MAP, ROUTING_TRUTH } = await import('../lib/capability-routing-map.js')
      const musicCap = CAPABILITY_ROUTING_MAP.find((c) => c.id === 'music_generation')
      expect(musicCap).toBeDefined()
      expect(musicCap.executionStatus).toBe('pending')
      expect(musicCap.wiredProvider).toBeNull()
      expect(ROUTING_TRUTH.music_generation).toBe('pending')
    })

    it('routing map says app-facing provider/model override is false', async () => {
      const { CAPABILITY_ROUTING_MAP, ROUTING_TRUTH } = await import('../lib/capability-routing-map.js')
      for (const cap of CAPABILITY_ROUTING_MAP) {
        expect(cap.appFacingProviderOverride).toBe(false)
        expect(cap.appFacingModelOverride).toBe(false)
      }
      expect(ROUTING_TRUTH.app_facing_provider_override).toBe(false)
      expect(ROUTING_TRUTH.app_facing_model_override).toBe(false)
    })

    it('provider list remains exactly genx, groq, together, mimo, deepinfra', async () => {
      const { APPROVED_PROVIDERS, ROUTING_TRUTH } = await import('../lib/capability-routing-map.js')
      expect(APPROVED_PROVIDERS).toEqual(['genx', 'groq', 'together', 'mimo', 'deepinfra'])
      expect(ROUTING_TRUTH.approved_providers).toEqual(['genx', 'groq', 'together', 'mimo', 'deepinfra'])
    })

    it('MiMo remains coding_tools_only', async () => {
      const { CAPABILITY_ROUTING_MAP, PROVIDER_ROLES, ROUTING_TRUTH } = await import('../lib/capability-routing-map.js')
      expect(PROVIDER_ROLES.mimo.runtimeUse).toBe('coding_tools_only')
      expect(ROUTING_TRUTH.mimo_policy).toBe('coding_tools_only')
      const codingCap = CAPABILITY_ROUTING_MAP.find((c) => c.id === 'coding_tools')
      expect(codingCap).toBeDefined()
      expect(codingCap.executionStatus).toBe('blocked')
    })

    it('adult generation remains on hold', async () => {
      const { CAPABILITY_ROUTING_MAP, ROUTING_TRUTH } = await import('../lib/capability-routing-map.js')
      const adultCaps = CAPABILITY_ROUTING_MAP.filter((c) => c.id.startsWith('adult_'))
      expect(adultCaps.length).toBeGreaterThan(0)
      for (const cap of adultCaps) {
        expect(cap.executionStatus).toBe('blocked')
        expect(cap.wiredProvider).toBeNull()
      }
      expect(ROUTING_TRUTH.adult_generation).toBe('on_hold')
    })

    it('no new providers were added', async () => {
      const { APPROVED_PROVIDERS } = await import('../lib/capability-routing-map.js')
      const banned = ['hugging_face', 'huggingface', 'qwen', 'gemini', 'openai', 'anthropic', 'replicate', 'heygen', 'minimax']
      for (const provider of APPROVED_PROVIDERS) {
        expect(banned).not.toContain(provider)
      }
      expect(APPROVED_PROVIDERS.length).toBe(5)
    })

    it('text/chat is wired to Groq with DeepInfra fallback', async () => {
      const { CAPABILITY_ROUTING_MAP, ROUTING_TRUTH } = await import('../lib/capability-routing-map.js')
      const chatCap = CAPABILITY_ROUTING_MAP.find((c) => c.id === 'chat')
      expect(chatCap).toBeDefined()
      expect(chatCap.wiredProvider).toBe('groq')
      expect(chatCap.executionStatus).toBe('live')
      expect(chatCap.fallbacksPlanned).toContain('deepinfra')
      expect(ROUTING_TRUTH.text_chat_wired_to).toBe('groq')
      expect(ROUTING_TRUTH.text_chat_fallback).toBe('deepinfra')
    })

    it('long-form video is pending', async () => {
      const { CAPABILITY_ROUTING_MAP, ROUTING_TRUTH } = await import('../lib/capability-routing-map.js')
      const lfCap = CAPABILITY_ROUTING_MAP.find((c) => c.id === 'long_form_video')
      expect(lfCap).toBeDefined()
      expect(lfCap.executionStatus).toBe('pending')
      expect(ROUTING_TRUTH.long_form_video).toBe('pending')
    })

    it('research is pending', async () => {
      const { CAPABILITY_ROUTING_MAP, ROUTING_TRUTH } = await import('../lib/capability-routing-map.js')
      const researchCap = CAPABILITY_ROUTING_MAP.find((c) => c.id === 'research')
      expect(researchCap).toBeDefined()
      expect(researchCap.executionStatus).toBe('pending')
      expect(ROUTING_TRUTH.research).toBe('pending')
    })

    it('voice is pending', async () => {
      const { ROUTING_TRUTH } = await import('../lib/capability-routing-map.js')
      expect(ROUTING_TRUTH.voice).toBe('pending')
    })

    it('embeddings RAG workflow is partial', async () => {
      const { CAPABILITY_ROUTING_MAP, ROUTING_TRUTH } = await import('../lib/capability-routing-map.js')
      const embCap = CAPABILITY_ROUTING_MAP.find((c) => c.id === 'embeddings')
      expect(embCap).toBeDefined()
      expect(embCap.executionStatus).toBe('partial')
      expect(ROUTING_TRUTH.embeddings_rag_workflow).toContain('partial')
    })
  })

  describe('Research page is design-ready but honest', () => {
    it('Research page contains all planned sections', () => {
      const pagePath = path.join(ROOT, 'app/dashboard/research/page.js')
      const content = fs.readFileSync(pagePath, 'utf8')
      expect(content).toContain('Web Research')
      expect(content).toContain('Brand Research')
      expect(content).toContain('Competitor Research')
      expect(content).toContain('Document Research')
      expect(content).toContain('Citations')
      expect(content).toContain('Saved Reports')
      expect(content).toContain('Send to Chat')
      expect(content).toContain('Turn into Campaign Idea')
    })

    it('Research page shows backend pending', () => {
      const pagePath = path.join(ROOT, 'app/dashboard/research/page.js')
      const content = fs.readFileSync(pagePath, 'utf8')
      expect(content).toContain('Backend Pending')
    })
  })

  describe('Operations page has all required metrics', () => {
    it('Operations page contains all required metrics', () => {
      const pagePath = path.join(ROOT, 'app/dashboard/operations/page.js')
      const content = fs.readFileSync(pagePath, 'utf8')
      expect(content).toContain('Active Users')
      expect(content).toContain('Logged-In Users')
      expect(content).toContain('Jobs Queued')
      expect(content).toContain('Jobs Running')
      expect(content).toContain('Failed Jobs')
      expect(content).toContain('Average Wait Time')
      expect(content).toContain('P95 Wait Time')
      expect(content).toContain('Worker Concurrency')
      expect(content).toContain('Provider Spend')
      expect(content).toContain('App Spend')
      expect(content).toContain('Revenue')
      expect(content).toContain('Margin')
      expect(content).toContain('Storage')
      expect(content).toContain('DB Health')
      expect(content).toContain('Redis Health')
      expect(content).toContain('Qdrant Health')
      expect(content).toContain('Upgrade Warning')
    })

    it('Operations page shows metrics as pending', () => {
      const pagePath = path.join(ROOT, 'app/dashboard/operations/page.js')
      const content = fs.readFileSync(pagePath, 'utf8')
      expect(content).toContain('metric pending')
      expect(content).toContain('Metrics not wired yet')
    })
  })
})
