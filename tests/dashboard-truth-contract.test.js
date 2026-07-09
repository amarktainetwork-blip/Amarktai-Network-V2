import { describe, it, expect } from 'vitest'
import fs from 'fs'
import path from 'path'

const ROOT = path.join(import.meta.dirname, '..')

describe('dashboard truth contract', () => {
  it('Studio Preview tab does not show stale Backend proof required', () => {
    const studioPath = path.join(ROOT, 'app/dashboard/studio/page.jsx')
    const content = fs.readFileSync(studioPath, 'utf8')
    // Preview tab should not show "Backend proof required" button
    expect(content).not.toContain('Backend proof required')
  })

  it('Studio Preview tab shows job result when available', () => {
    const studioPath = path.join(ROOT, 'app/dashboard/studio/page.jsx')
    const content = fs.readFileSync(studioPath, 'utf8')
    expect(content).toContain('Job completed')
    expect(content).toContain('Job failed')
  })

  it('Studio Developer tab shows wired status for proven capabilities', () => {
    const studioPath = path.join(ROOT, 'app/dashboard/studio/page.jsx')
    const content = fs.readFileSync(studioPath, 'utf8')
    expect(content).toContain("'wired'")
    expect(content).not.toContain("'route_pending'")
  })

  it('Command Center shows Marketing-first platform roadmap', () => {
    const ccPath = path.join(ROOT, 'app/dashboard/command-center/page.js')
    const content = fs.readFileSync(ccPath, 'utf8')
    expect(content).toContain('Marketing-First Platform Roadmap')
    expect(content).toContain('Proven Capabilities')
    expect(content).toContain('Marketing App MVP Dependencies')
  })

  it('Command Center shows correct integration status', () => {
    const ccPath = path.join(ROOT, 'app/dashboard/command-center/page.js')
    const content = fs.readFileSync(ccPath, 'utf8')
    expect(content).toContain('Studio job submission')
    expect(content).toContain('Wired')
    expect(content).not.toContain('UI not connected')
  })

  it('Studio still blocks unproven capabilities', () => {
    const studioPath = path.join(ROOT, 'app/dashboard/studio/page.jsx')
    const content = fs.readFileSync(studioPath, 'utf8')
    expect(content).toContain('Disabled until backend proof passes')
  })

  it('provider list remains exactly 5', () => {
    const providers = ['genx', 'groq', 'together', 'mimo', 'deepinfra']
    expect(providers).toHaveLength(5)
  })

  it('MiMo remains coding_tools_only', () => {
    const routingPath = path.join(ROOT, 'packages/core/src/provider-routing.ts')
    const content = fs.readFileSync(routingPath, 'utf8')
    // MiMo should have empty category support
    expect(content).toContain("mimo: []")
  })

  it('no provider/model selectors are exposed', () => {
    const studioPath = path.join(ROOT, 'app/dashboard/studio/page.jsx')
    const content = fs.readFileSync(studioPath, 'utf8')
    // Should not have provider/model selector dropdowns
    expect(content).not.toContain('SelectProvider')
    expect(content).not.toContain('SelectModel')
  })

  it('adult generation remains on hold', () => {
    const ccPath = path.join(ROOT, 'app/dashboard/command-center/page.js')
    const content = fs.readFileSync(ccPath, 'utf8')
    expect(content).toContain('On Hold')
    expect(content).toContain('adult_generation')
  })
})
