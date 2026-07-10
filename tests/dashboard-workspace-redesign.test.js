import { describe, it, expect } from 'vitest'
import fs from 'fs'
import path from 'path'

const ROOT = path.join(import.meta.dirname, '..')

function read(rel) {
  return fs.readFileSync(path.join(ROOT, rel), 'utf8')
}

describe('dashboard creation workspace redesign', () => {
  describe('navigation structure', () => {
    it('main nav contains Chat, Image, Video, Music, Research, Library, Operations, Settings', () => {
      const { DASHBOARD_PAGES } = require('../lib/dashboard-contract.js')
      const labels = DASHBOARD_PAGES.map((p) => p.label)
      expect(labels).toContain('Chat')
      expect(labels).toContain('Image')
      expect(labels).toContain('Video')
      expect(labels).toContain('Music')
      expect(labels).toContain('Research')
      expect(labels).toContain('Library')
      expect(labels).toContain('Operations')
      expect(labels).toContain('Settings')
    })

    it('main nav has exactly 8 items', () => {
      const { DASHBOARD_PAGES } = require('../lib/dashboard-contract.js')
      expect(DASHBOARD_PAGES).toHaveLength(8)
    })

    it('main nav does not show old confusing primary items', () => {
      const { DASHBOARD_PAGES } = require('../lib/dashboard-contract.js')
      const labels = DASHBOARD_PAGES.map((p) => p.label)
      expect(labels).not.toContain('Studio')
      expect(labels).not.toContain('Capabilities')
      expect(labels).not.toContain('Command Center')
      expect(labels).not.toContain('Apps')
      expect(labels).not.toContain('Brand Library')
      expect(labels).not.toContain('Agents & Learning')
      expect(labels).not.toContain('Work Library')
    })

    it('advanced pages exist for internal/engineering access', () => {
      const { ADVANCED_PAGES } = require('../lib/dashboard-contract.js')
      const ids = ADVANCED_PAGES.map((p) => p.id)
      expect(ids).toContain('studio')
      expect(ids).toContain('artifacts')
      expect(ids).toContain('capabilities')
      expect(ids).toContain('command-center')
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

    it('chat page is honest about backend/memory status', () => {
      const chat = read('app/dashboard/chat/page.js')
      expect(chat).toContain('Backend conversation memory endpoint pending')
      expect(chat).toContain('Memory backend pending')
    })

    it('chat page has message list, prompt composer, memory panel, attached tools', () => {
      const chat = read('app/dashboard/chat/page.js')
      expect(chat).toContain('messages')
      expect(chat).toContain('Input')
      expect(chat).toContain('Memory')
      expect(chat).toContain('Attached Tools')
    })

    it('chat attached tools link to real pages', () => {
      const chat = read('app/dashboard/chat/page.js')
      expect(chat).toContain('/dashboard/image')
      expect(chat).toContain('/dashboard/video')
      expect(chat).toContain('/dashboard/music')
      expect(chat).toContain('/dashboard/research')
      expect(chat).toContain('/dashboard/library')
    })

    it('chat tool statuses are honest based on runtime proof', () => {
      const chat = read('app/dashboard/chat/page.js')
      expect(chat).toContain('imageReady')
      expect(chat).toContain('videoReady')
      expect(chat).toContain('pending')
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

    it('image page uses Auto mode as default', () => {
      const image = read('app/dashboard/image/page.js')
      expect(image).toContain('Auto mode')
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

    it('video page distinguishes short video vs long-form pending status', () => {
      const video = read('app/dashboard/video/page.js')
      expect(video).toContain('Short Video')
      expect(video).toContain('Long-Form Video')
      expect(video).toContain('Backend Pending')
    })

    it('video page does not claim Live unless using real job flow', () => {
      const video = read('app/dashboard/video/page.js')
      expect(video).toContain('shortReady')
      expect(video).toContain('runtimeProofStatusClasses')
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
      expect(research).toContain('Backend Pending')
      expect(research).toContain('not yet wired')
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

    it('library page does not fake chats/music/research history', () => {
      const library = read('app/dashboard/library/page.js')
      expect(library).toContain('backend pending')
    })
  })

  describe('operations page', () => {
    it('operations page exists at /dashboard/operations', () => {
      expect(fs.existsSync(path.join(ROOT, 'app/dashboard/operations/page.js'))).toBe(true)
    })

    it('operations page shows capacity/upgrade monitoring placeholders honestly', () => {
      const ops = read('app/dashboard/operations/page.js')
      expect(ops).toContain('metric pending')
      expect(ops).toContain('Active Users')
      expect(ops).toContain('Jobs Queued')
      expect(ops).toContain('Provider Spend')
      expect(ops).toContain('Revenue')
      expect(ops).toContain('Margin')
      expect(ops).toContain('Upgrade Warning')
    })
  })

  describe('provider list', () => {
    it('provider list remains exactly genx, groq, together, mimo, deepinfra', () => {
      const { PROVIDER_CONTRACTS } = require('../lib/dashboard-contract.js')
      const ids = PROVIDER_CONTRACTS.map((p) => p.id)
      expect(ids).toEqual(['genx', 'groq', 'together', 'mimo', 'deepinfra'])
    })

    it('MiMo remains coding_tools_only', () => {
      const { PROVIDER_CONTRACTS } = require('../lib/dashboard-contract.js')
      const mimo = PROVIDER_CONTRACTS.find((p) => p.id === 'mimo')
      expect(mimo.runtimeUse).toBe('coding_tools_only')
      expect(mimo.credentialUsagePolicy).toBe('coding_tools_only')
    })

    it('adult generation remains on hold', () => {
      const cc = read('app/dashboard/command-center/page.js')
      expect(cc).toContain('On Hold')
      expect(cc).toContain('adult_generation')
    })
  })

  describe('existing routes preserved', () => {
    it('/dashboard redirects to /dashboard/chat', () => {
      const index = read('app/dashboard/page.js')
      expect(index).toContain('/dashboard/chat')
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

  describe('app-facing provider/model overrides remain blocked', () => {
    it('no provider/model selectors in studio page', () => {
      const studio = read('app/dashboard/studio/page.jsx')
      expect(studio).not.toContain('SelectProvider')
      expect(studio).not.toContain('SelectModel')
    })

    it('image page does not expose provider/model selectors', () => {
      const image = read('app/dashboard/image/page.js')
      expect(image).not.toContain('SelectProvider')
      expect(image).not.toContain('SelectModel')
    })

    it('video page does not expose provider/model selectors', () => {
      const video = read('app/dashboard/video/page.js')
      expect(video).not.toContain('SelectProvider')
      expect(video).not.toContain('SelectModel')
    })
  })
})
