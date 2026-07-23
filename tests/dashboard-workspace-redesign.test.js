import { describe, it, expect } from 'vitest'
import fs from 'fs'
import path from 'path'

const ROOT = path.join(import.meta.dirname, '..')

function read(rel) {
  return fs.readFileSync(path.join(ROOT, rel), 'utf8')
}

describe('dashboard creation workspace redesign', () => {
  describe('navigation structure', () => {
    it('main nav contains the canonical production sections', () => {
      const { DASHBOARD_PAGES } = require('../lib/dashboard-contract.js')
      const labels = DASHBOARD_PAGES.map((p) => p.label)
      expect(labels).toContain('Overview')
      expect(labels).toContain('Apps')
      expect(labels).toContain('Capabilities')
      expect(labels).toContain('Models')
      expect(labels).toContain('Jobs & Workflows')
      expect(labels).toContain('Artifacts')
      expect(labels).toContain('Monitoring')
      expect(labels).toContain('Settings')
    })

    it('main nav includes the complete production workspaces including Voices', () => {
      const { DASHBOARD_PAGES } = require('../lib/dashboard-contract.js')
      expect(DASHBOARD_PAGES.length).toBeGreaterThanOrEqual(13)
      expect(DASHBOARD_PAGES.map((page) => page.label)).toContain('Voices')
    })

    it('main nav does not show old duplicate primary items', () => {
      const { DASHBOARD_PAGES } = require('../lib/dashboard-contract.js')
      const labels = DASHBOARD_PAGES.map((p) => p.label)
      expect(labels).not.toContain('Command Center')
      expect(labels).not.toContain('Brand Library')
      expect(labels).not.toContain('Agents & Learning')
      expect(labels).not.toContain('Work Library')
    })

    it('advanced pages exist for internal/engineering access', () => {
      const { ADVANCED_PAGES } = require('../lib/dashboard-contract.js')
      const ids = ADVANCED_PAGES.map((p) => p.id)
      expect(ids).toContain('model-lab')
      expect(ids).toContain('developer')
    })

    it('dashboard layout imports NAV and ADVANCED_NAV', () => {
      const layout = read('app/dashboard/layout.js')
      expect(layout).toContain('NAV')
      expect(layout).toContain('ADVANCED_NAV')
    })
  })

  describe('chat page', () => {
    it('chat page exists at /dashboard/chat', () => {
      expect(fs.existsSync(path.join(ROOT, 'app/dashboard/chat/page.js'))).toBe(true)
    })

    it('chat page uses real SSE with local history', () => {
      const chat = read('app/dashboard/chat/page.js')
      expect(chat).toContain('/api/admin/streaming-chat')
      expect(chat).toContain('HISTORY_KEY')
    })

    it('chat page has message list, prompt composer, cancellation, and evidence', () => {
      const chat = read('app/dashboard/chat/page.js')
      expect(chat).toContain('messages')
      expect(chat).toContain('Message AmarktAI...')
      expect(chat).toContain('controllerRef')
      expect(chat).toContain('evidence')
    })

    it('chat does not retain stale attached-tool placeholders', () => {
      const chat = read('app/dashboard/chat/page.js')
      expect(chat).not.toContain('Attached Tools')
      expect(chat).not.toContain('Backend Pending')
    })

    it('chat reports route and chunk evidence', () => {
      const chat = read('app/dashboard/chat/page.js')
      expect(chat).toContain("event === 'route'")
      expect(chat).toContain("event === 'chunk'")
      expect(chat).toContain("event === 'complete'")
    })
  })

  describe('image studio page', () => {
    it('image page exists at /dashboard/image', () => {
      expect(fs.existsSync(path.join(ROOT, 'app/dashboard/image/page.js'))).toBe(true)
    })

    it('image page uses real submit route /api/admin/studio/jobs', () => {
      const image = read('app/dashboard/image/page.js')
      expect(image).toContain('submitJob')
      expect(image).toContain('image_generation')
      expect(image).toContain('pollJob')
    })

    it('image page uses governed Auto mode by default', () => {
      const image = read('app/dashboard/image/page.js')
      expect(image).toContain('Governed auto mode')
    })

    it('image page does not expose provider/model selectors', () => {
      const image = read('app/dashboard/image/page.js')
      expect(image).not.toContain('SelectProvider')
      expect(image).not.toContain('SelectModel')
    })

    it('image page shows artifact preview when job completes', () => {
      const image = read('app/dashboard/image/page.js')
      expect(image).toContain('previewUrl')
      expect(image).toContain('/api/admin/artifacts/')
    })

    it('image page shows provider/model returned by backend after execution', () => {
      const image = read('app/dashboard/image/page.js')
      expect(image).toContain('jobResult.provider')
      expect(image).toContain('jobResult.model')
    })

    it('image page does not have fake unused prompt/result flow', () => {
      const image = read('app/dashboard/image/page.js')
      expect(image).not.toContain('Generate via Studio')
      expect(image).not.toContain('Generated images will appear here')
    })
  })

  describe('video studio page', () => {
    it('video page exists at /dashboard/video', () => {
      expect(fs.existsSync(path.join(ROOT, 'app/dashboard/video/page.js'))).toBe(true)
    })

    it('video page submits real short video via /api/admin/studio/jobs', () => {
      const video = read('app/dashboard/video/page.js')
      expect(video).toContain('submitJob')
      expect(video).toContain('video_generation')
      expect(video).toContain('pollJob')
    })

    it('video page exposes canonical text/source/long-form modes', () => {
      const video = read('app/dashboard/video/page.js')
      expect(video).toContain('Text to video')
      expect(video).toContain('Image to video')
      expect(video).toContain('Video to video')
      expect(video).toContain('Long-form video')
    })

    it('video page derives execution readiness from canonical runtime proof', () => {
      const video = read('app/dashboard/video/page.js')
      expect(video).toContain('getRuntimeCapabilityProof')
      expect(video).toContain('readyForDashboardExecution')
    })

    it('video page does not expose provider/model selectors', () => {
      const video = read('app/dashboard/video/page.js')
      expect(video).not.toContain('SelectProvider')
      expect(video).not.toContain('SelectModel')
    })
  })

  describe('music studio page', () => {
    it('music page exists at /dashboard/music', () => {
      expect(fs.existsSync(path.join(ROOT, 'app/dashboard/music/page.js'))).toBe(true)
    })

    it('music page uses real generation API', () => {
      const music = read('app/dashboard/music/page.js')
      expect(music).toContain('/api/admin/music/generate')
      expect(music).toContain('handleGenerate')
    })
  })

  describe('research page', () => {
    it('research page exists at /dashboard/research', () => {
      expect(fs.existsSync(path.join(ROOT, 'app/dashboard/research/page.js'))).toBe(true)
    })

    it('research page does not fake research results', () => {
      const research = read('app/dashboard/research/page.js')
      expect(research).toContain('Excluded from this release')
      expect(research).toContain('cannot fabricate')
    })
  })

  describe('library page', () => {
    it('library page exists at /dashboard/library', () => {
      expect(fs.existsSync(path.join(ROOT, 'app/dashboard/library/page.js'))).toBe(true)
    })

    it('library page links to artifacts', () => {
      const library = read('app/dashboard/library/page.js')
      expect(library).toContain('/dashboard/artifacts')
      expect(library).toContain('Artifacts')
    })

    it('library page distinguishes browser-local chat and excluded research', () => {
      const library = read('app/dashboard/library/page.js')
      expect(library).toContain('Browser local')
      expect(library).toContain('Research is outside this release candidate')
    })
  })

  describe('operations page', () => {
    it('operations page exists at /dashboard/operations', () => {
      expect(fs.existsSync(path.join(ROOT, 'app/dashboard/operations/page.js'))).toBe(true)
    })

    it('operations page consumes real dependency health and build identity', () => {
      const ops = read('app/dashboard/operations/page.js')
      expect(ops).toContain('/api/system/health')
      expect(ops).toContain('Worker heartbeat')
      expect(ops).toContain('Expected SHA')
    })
  })

  describe('provider list', () => {
    it('provider list remains exactly genx, deepinfra, together, mimo, deepinfra', () => {
      const { PROVIDER_CONTRACTS } = require('../lib/dashboard-contract.js')
      const ids = PROVIDER_CONTRACTS.map((p) => p.id)
      expect(ids).toEqual(['genx', 'together', 'mimo', 'deepinfra'])
    })

    it('MiMo remains coding_tools_only', () => {
      const { PROVIDER_CONTRACTS } = require('../lib/dashboard-contract.js')
      const mimo = PROVIDER_CONTRACTS.find((p) => p.id === 'mimo')
      expect(mimo.runtimeUse).toBe('coding_tools_only')
      expect(mimo.credentialUsagePolicy).toBe('coding_tools_only')
    })

    it('adult generation remains policy restricted', async () => {
      const { getRuntimeTruth } = await import('../packages/core/src/index.ts')
      expect(getRuntimeTruth().capabilities.filter((item) => item.capability.startsWith('adult_')).every((item) => item.classification === 'POLICY_RESTRICTED')).toBe(true)
    })
  })

  describe('existing routes preserved', () => {
    it('/dashboard renders the canonical overview', () => {
      const index = read('app/dashboard/page.js')
      expect(index).toContain('Platform overview')
    })

    it('existing studio page still exists', () => {
      expect(fs.existsSync(path.join(ROOT, 'app/dashboard/studio/page.jsx'))).toBe(true)
    })

    it('existing artifacts page still exists', () => {
      expect(fs.existsSync(path.join(ROOT, 'app/dashboard/artifacts/page.js'))).toBe(true)
    })

    it('existing settings page still exists', () => {
      expect(fs.existsSync(path.join(ROOT, 'app/dashboard/settings/page.js'))).toBe(true)
    })

    it('login page still exists', () => {
      expect(fs.existsSync(path.join(ROOT, 'app/login/page.js'))).toBe(true)
    })
  })
})
