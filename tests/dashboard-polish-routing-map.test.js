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

    it('Capability Lab page contains canonical capability families', () => {
      const pagePath = path.join(ROOT, 'app/dashboard/capability-lab/page.js')
      const content = fs.readFileSync(pagePath, 'utf8')
      expect(content).toContain('Language')
      expect(content).toContain('Image')
      expect(content).toContain('Video')
      expect(content).toContain('Audio')
      expect(content).toContain('Knowledge')
      expect(content).toContain('Marketing')
      expect(content).toContain('Adult Governed')
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

  describe('Video page shows short/live and long-form durable Phase 1 honestly', () => {
    it('Video page shows short video as live capability', () => {
      const pagePath = path.join(ROOT, 'app/dashboard/video/page.js')
      const content = fs.readFileSync(pagePath, 'utf8')
      expect(content).toContain('Short Video')
      expect(content).toContain('Live')
    })

    it('Video page shows long-form durable orchestration as ready while multimedia remains pending', () => {
      const pagePath = path.join(ROOT, 'app/dashboard/video/page.js')
      const content = fs.readFileSync(pagePath, 'utf8')
      expect(content).toContain('Long-Form Video')
      expect(content).toContain('Phase 1 Ready')
      expect(content).toContain('Durable Orchestration Ready')
      expect(content).toContain('Full multimedia assembly is pending')
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

  describe('canonical routing truth exists and is correct', () => {
    it('old capability-routing-map.js is removed', () => {
      const mapPath = path.join(ROOT, 'lib/capability-routing-map.js')
      expect(fs.existsSync(mapPath)).toBe(false)
    })

    it('Brain Router says image_generation is Together-selected and video_generation is GenX-selected', async () => {
      const { routeBrain } = await import('../packages/core/src/index.ts')
      expect(routeBrain({ capability: 'image_generation', routingMode: 'balanced' }).selectedProvider).toBe('together')
      expect(routeBrain({ capability: 'video_generation', routingMode: 'balanced' }).selectedProvider).toBe('genx')
    })

    it('canonical runtime truth keeps provider/model override app-facing false', async () => {
      const { CAPABILITY_KEYS, routeBrain } = await import('../packages/core/src/index.ts')
      for (const capability of CAPABILITY_KEYS) {
        const decision = routeBrain({ capability, routingMode: 'balanced' })
        expect(decision.appFacingProviderOverride).toBe(false)
        expect(decision.appFacingModelOverride).toBe(false)
      }
    })

    it('provider list remains exactly genx, groq, together, mimo, deepinfra', async () => {
      const { PROVIDER_KEYS } = await import('../packages/core/src/index.ts')
      expect([...PROVIDER_KEYS]).toEqual(['genx', 'groq', 'together', 'mimo', 'deepinfra'])
    })

    it('MiMo remains coding_tools_only and adult generation remains on hold', async () => {
      const { CODING_ONLY_PROVIDERS, getRuntimeTruth } = await import('../packages/core/src/index.ts')
      const truth = getRuntimeTruth()
      expect([...CODING_ONLY_PROVIDERS]).toEqual(['mimo'])
      expect(truth.providers.find((provider) => provider.provider === 'mimo')?.codingOnly).toBe(true)
      expect(truth.capabilities.filter((capability) => capability.capability.startsWith('adult_')).every((capability) => capability.classification === 'POLICY_RESTRICTED')).toBe(true)
    })

    it('chat has Groq with DeepInfra fallback and long-form/research remain not live-proven', async () => {
      const { getRuntimeTruth, routeBrain } = await import('../packages/core/src/index.ts')
      const decision = routeBrain({ capability: 'chat', routingMode: 'balanced' })
      const truth = getRuntimeTruth()
      expect(decision.selectedProvider).toBe('groq')
      expect(decision.fallbackChain.some((entry) => entry.provider === 'deepinfra')).toBe(true)
      expect(truth.capabilities.find((capability) => capability.capability === 'long_form_video')?.liveProven).toBe(false)
      expect(truth.capabilities.find((capability) => capability.capability === 'research')?.liveProven).toBe(false)
      expect(truth.capabilities.find((capability) => capability.capability === 'embeddings')?.classification).not.toBe('LIVE_PROVEN')
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
