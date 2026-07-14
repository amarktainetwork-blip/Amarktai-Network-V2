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

  it('Command Center uses canonical System Monitoring', () => {
    const ccPath = path.join(ROOT, 'app/dashboard/command-center/page.js')
    const content = fs.readFileSync(ccPath, 'utf8')
    expect(content).toContain("export { default } from '../operations/page'")
    const operations = fs.readFileSync(path.join(ROOT, 'app/dashboard/operations/page.js'), 'utf8')
    expect(operations).toContain('/api/system/health')
    expect(operations).toContain('/api/admin/truth')
  })

  it('Command Center shows correct integration status', () => {
    const ccPath = path.join(ROOT, 'app/dashboard/command-center/page.js')
    const content = fs.readFileSync(ccPath, 'utf8')
    expect(content).toContain("export { default } from '../operations/page'")
    expect(content).not.toContain('UI not connected')
  })

  it('Studio still blocks unproven capabilities', () => {
    const studioPath = path.join(ROOT, 'app/dashboard/studio/page.jsx')
    const content = fs.readFileSync(studioPath, 'utf8')
    expect(content).toContain('Disabled until backend proof passes')
  })

  it('provider list remains exactly 5', async () => {
    const { PROVIDER_KEYS } = await import('../packages/core/src/index.ts')
    expect(PROVIDER_KEYS).toHaveLength(5)
  })

  it('MiMo remains coding_tools_only', async () => {
    const { APPROVED_PROVIDER_DEFINITIONS, CODING_ONLY_PROVIDERS } = await import('../packages/core/src/index.ts')
    expect([...CODING_ONLY_PROVIDERS]).toEqual(['mimo'])
    expect(APPROVED_PROVIDER_DEFINITIONS.find(provider => provider.key === 'mimo')).toMatchObject({ codingOnly: true, backendExecutionAllowed: false })
  })

  it('no provider/model selectors are exposed', () => {
    const studioPath = path.join(ROOT, 'app/dashboard/studio/page.jsx')
    const content = fs.readFileSync(studioPath, 'utf8')
    // Should not have provider/model selector dropdowns
    expect(content).not.toContain('SelectProvider')
    expect(content).not.toContain('SelectModel')
  })

  it('adult generation remains policy restricted', async () => {
    const { getRuntimeTruth } = await import('../packages/core/src/index.ts')
    const adult = getRuntimeTruth().capabilities.filter((item) => item.capability.startsWith('adult_'))
    expect(adult.every((item) => item.classification === 'POLICY_RESTRICTED')).toBe(true)
  })
})
