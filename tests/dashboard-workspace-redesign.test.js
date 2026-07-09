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
  })

  describe('image studio page', () => {
    it('image page exists at /dashboard/image', () => {
      expect(fs.existsSync(path.join(ROOT, 'app/dashboard/image/page.js'))).toBe(true)
    })

    it('image page keeps existing image_generation job flow or links to it', () => {
      const image = read('app/dashboard/image/page.js')
      expect(image).toContain('image_generation')
      expect(image).toContain('Studio')
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
  })

  describe('video studio page', () => {
    it('video page exists at /dashboard/video', () => {
      expect(fs.existsSync(path.join(ROOT, 'app/dashboard/video/page.js'))).toBe(true)
    })

    it('video page distinguishes short video vs long-form pending status', () => {
      const video = read('app/dashboard/video/page.js')
      expect(video).toContain('Short Video')
      expect(video).toContain('Long-Form Video')
      expect(video).toContain('Backend Pending')
    })

    it('video page shows short video as live', () => {
      const video = read('app/dashboard/video/page.js')
      expect(video).toContain('Live')
      expect(video).toContain('GenX')
    })
  })

  describe('music studio page', () => {
    it('music page exists at /dashboard/music', () => {
      expect(fs.existsSync(path.join(ROOT, 'app/dashboard/music/page.js'))).toBe(true)
    })

    it('music page does not fake audio generation', () => {
      const music = read('app/dashboard/music/page.js')
      expect(music).toContain('Backend Pending')
      expect(music).toContain('not yet wired')
      expect(music).toContain('No audio is being generated')
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
