import { describe, it, expect } from 'vitest'
import fs from 'fs'
import path from 'path'

const ROOT = path.join(import.meta.dirname, '..')

describe('dashboard polish and routing map contract', () => {
  describe('main nav remains simple', () => {
    it('DASHBOARD_PAGES contains the 9 release workspaces', async () => {
      const { DASHBOARD_PAGES } = await import('../lib/dashboard-contract.js')
      const labels = DASHBOARD_PAGES.map((p) => p.label)
      expect(labels).toContain('Chat')
      expect(labels).toContain('Image')
      expect(labels).toContain('Video')
      expect(labels).toContain('Music')
      expect(labels).toContain('Voice')
      expect(labels).toContain('Research')
      expect(labels).toContain('Library')
      expect(labels).toContain('Operations')
      expect(labels).toContain('Settings')
      expect(DASHBOARD_PAGES.length).toBe(9)
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

    it('Capability Lab derives the callable release set from canonical truth', () => {
      const pagePath = path.join(ROOT, 'app/dashboard/capability-lab/page.js')
      const content = fs.readFileSync(pagePath, 'utf8')
      expect(content).toContain('/api/admin/truth')
      expect(content).toContain('releaseReadiness')
      expect(content).toContain("item.appSlug === 'dashboard-capability-lab'")
    })

    it('Capability Lab executes through the canonical Studio job flow', () => {
      const pagePath = path.join(ROOT, 'app/dashboard/capability-lab/page.js')
      const content = fs.readFileSync(pagePath, 'utf8')
      expect(content).toContain('submitJob')
      expect(content).toContain('pollJob')
      expect(content).toContain('Orchestra owns routing')
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

  describe('Image page exposes only canonical image generation', () => {
    it('Image page contains automatic canonical routing', () => {
      const pagePath = path.join(ROOT, 'app/dashboard/image/page.js')
      const content = fs.readFileSync(pagePath, 'utf8')
      expect(content).toContain('Auto mode')
      expect(content).toContain('image_generation')
    })

    it('Image page gates execution from canonical readiness', () => {
      const pagePath = path.join(ROOT, 'app/dashboard/image/page.js')
      const content = fs.readFileSync(pagePath, 'utf8')
      expect(content).toContain('readyForDashboardExecution')
    })

    it('Image page does not expose provider/model selectors', () => {
      const pagePath = path.join(ROOT, 'app/dashboard/image/page.js')
      const content = fs.readFileSync(pagePath, 'utf8')
      expect(content).not.toContain('provider-select')
      expect(content).not.toContain('model-select')
      expect(content).toContain('Provider/model selection is handled by the platform runtime')
    })

    it('Image page honestly excludes non-release image capabilities', () => {
      const pagePath = path.join(ROOT, 'app/dashboard/image/page.js')
      const content = fs.readFileSync(pagePath, 'utf8')
      expect(content).toContain('Image editing, inpainting, upscaling, and variations remain outside')
    })

    it('Image page has authenticated preview and download controls', () => {
      const pagePath = path.join(ROOT, 'app/dashboard/image/page.js')
      const content = fs.readFileSync(pagePath, 'utf8')
      expect(content).toContain('previewUrl')
      expect(content).toContain('?download=1')
      expect(content).toContain('URL.revokeObjectURL')
    })
  })

  describe('Video page exposes current source-aware and durable modes', () => {
    it('Video page shows text-to-video through runtime readiness', () => {
      const pagePath = path.join(ROOT, 'app/dashboard/video/page.js')
      const content = fs.readFileSync(pagePath, 'utf8')
      expect(content).toContain('Text to video')
      expect(content).toContain('readyForDashboardExecution')
    })

    it('Video page shows persistent durable multimedia orchestration', () => {
      const pagePath = path.join(ROOT, 'app/dashboard/video/page.js')
      const content = fs.readFileSync(pagePath, 'utf8')
      expect(content).toContain('Long-form video')
      expect(content).toContain('LONG_EXECUTION_KEY')
      expect(content).toContain('componentState')
      expect(content).toContain('Download final video')
    })

    it('Video page shows image-to-video with source selection', () => {
      const pagePath = path.join(ROOT, 'app/dashboard/video/page.js')
      const content = fs.readFileSync(pagePath, 'utf8')
      expect(content).toContain('Image to video')
      expect(content).toContain('sourceImageArtifactId')
    })

    it('Video page delegates storyboard planning to long-form execution', () => {
      const pagePath = path.join(ROOT, 'app/dashboard/video/page.js')
      const content = fs.readFileSync(pagePath, 'utf8')
      expect(content).toContain('/api/admin/long-form-video/executions')
    })

    it('Video page shows voiceover/subtitles as pending', () => {
      const pagePath = path.join(ROOT, 'app/dashboard/video/page.js')
      const content = fs.readFileSync(pagePath, 'utf8')
      expect(content).toContain('Voiceover')
      expect(content).toContain('Subtitles')
    })

    it('Video page has source provenance and component controls', () => {
      const pagePath = path.join(ROOT, 'app/dashboard/video/page.js')
      const content = fs.readFileSync(pagePath, 'utf8')
      expect(content).toContain('Source provenance')
      expect(content).toContain('Voiceover')
      expect(content).toContain('Subtitles')
      expect(content).toContain('Assembly')
    })
  })

  describe('canonical routing truth exists and is correct', () => {
    it('old capability-routing-map.js is removed', () => {
      const mapPath = path.join(ROOT, 'lib/capability-routing-map.js')
      expect(fs.existsSync(mapPath)).toBe(false)
    })

    it('canonical registrations map verified video transports without changing Orchestra authority', async () => {
      const { getExecutorRegistrations } = await import('../packages/core/src/index.ts')
      expect(getExecutorRegistrations('image_generation').map(entry => entry.provider)).toEqual(['together'])
      expect(getExecutorRegistrations('video_generation').map(entry => entry.provider)).toEqual(['genx'])
    })

    it('public job contracts block provider/model overrides', async () => {
      const { BLOCKED_OVERRIDE_FIELDS } = await import('../packages/core/src/index.ts')
      expect(BLOCKED_OVERRIDE_FIELDS).toEqual(expect.arrayContaining(['provider', 'model', 'providerOverride', 'modelOverride']))
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

    it('chat has DeepInfra as primary and long-form/research remain not live-proven', async () => {
      const { getExecutorRegistrations, getRuntimeTruth } = await import('../packages/core/src/index.ts')
      const chatProviders = getExecutorRegistrations('chat').map(entry => entry.provider)
      const truth = getRuntimeTruth()
      expect(chatProviders).toEqual(['deepinfra'])
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

    it('Research page marks the capability excluded from this release', () => {
      const pagePath = path.join(ROOT, 'app/dashboard/research/page.js')
      const content = fs.readFileSync(pagePath, 'utf8')
      expect(content).toContain('Excluded from this release')
    })
  })

  describe('Operations page has real dependency health', () => {
    it('Operations page contains all required health checks', () => {
      const pagePath = path.join(ROOT, 'app/dashboard/operations/page.js')
      const content = fs.readFileSync(pagePath, 'utf8')
      expect(content).toContain('API process')
      expect(content).toContain('MariaDB')
      expect(content).toContain('Redis')
      expect(content).toContain('Qdrant')
      expect(content).toContain('Artifact storage')
      expect(content).toContain('FFmpeg')
      expect(content).toContain('Worker heartbeat')
    })

    it('Operations page distinguishes liveness from readiness', () => {
      const pagePath = path.join(ROOT, 'app/dashboard/operations/page.js')
      const content = fs.readFileSync(pagePath, 'utf8')
      expect(content).toContain('Process liveness is reported separately')
      expect(content).toContain("health?.ready ? 'Ready'")
    })
  })
})
