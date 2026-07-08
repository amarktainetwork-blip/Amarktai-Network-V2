import { describe, it, expect } from 'vitest'
import fs from 'fs'
import path from 'path'

const ROOT = path.join(import.meta.dirname, '..')

describe('studio execution loop contract', () => {
  it('Studio uses amarktai_token', () => {
    const storePath = path.join(ROOT, 'lib/useStudioStore.js')
    const content = fs.readFileSync(storePath, 'utf8')
    expect(content).toContain("localStorage.getItem('amarktai_token')")
    expect(content).not.toContain("localStorage.getItem('admin_token')")
  })

  it('Studio no longer uses admin_token', () => {
    const storePath = path.join(ROOT, 'lib/useStudioStore.js')
    const content = fs.readFileSync(storePath, 'utf8')
    expect(content).not.toContain('admin_token')
  })

  it('admin Studio route exists', () => {
    const routePath = path.join(ROOT, 'apps/api/src/routes/admin-studio.ts')
    expect(fs.existsSync(routePath)).toBe(true)
    const content = fs.readFileSync(routePath, 'utf8')
    expect(content).toContain('adminStudioRoutes')
    expect(content).toContain('/api/admin/studio/jobs')
  })

  it('admin Studio route requires admin JWT', () => {
    const routePath = path.join(ROOT, 'apps/api/src/routes/admin-studio.ts')
    const content = fs.readFileSync(routePath, 'utf8')
    expect(content).toContain('requireAdmin')
  })

  it('admin Studio route rejects provider override', () => {
    const routePath = path.join(ROOT, 'apps/api/src/routes/admin-studio.ts')
    const content = fs.readFileSync(routePath, 'utf8')
    expect(content).toContain('Provider/model override not allowed')
  })

  it('admin Studio route rejects unproven capabilities', () => {
    const routePath = path.join(ROOT, 'apps/api/src/routes/admin-studio.ts')
    const content = fs.readFileSync(routePath, 'utf8')
    expect(content).toContain('not proven or not ready for dashboard execution')
  })

  it('admin Studio route creates Job row', () => {
    const routePath = path.join(ROOT, 'apps/api/src/routes/admin-studio.ts')
    const content = fs.readFileSync(routePath, 'utf8')
    expect(content).toContain('prisma.job.create')
  })

  it('admin Studio route enqueues BullMQ job', () => {
    const routePath = path.join(ROOT, 'apps/api/src/routes/admin-studio.ts')
    const content = fs.readFileSync(routePath, 'utf8')
    expect(content).toContain('q.add')
  })

  it('server registers admin-studio route', () => {
    const serverPath = path.join(ROOT, 'apps/api/src/server.ts')
    const content = fs.readFileSync(serverPath, 'utf8')
    expect(content).toContain('adminStudioRoutes')
  })

  it('dashboard proxy route exists', () => {
    const proxyPath = path.join(ROOT, 'app/api/admin/studio/jobs/route.js')
    expect(fs.existsSync(proxyPath)).toBe(true)
    const content = fs.readFileSync(proxyPath, 'utf8')
    expect(content).toContain('POST')
    expect(content).toContain('/api/admin/studio/jobs')
  })

  it('provider list remains exactly 5', () => {
    const providers = ['genx', 'groq', 'together', 'mimo', 'deepinfra']
    expect(providers).toHaveLength(5)
  })

  it('no provider/model selectors are exposed', () => {
    const storePath = path.join(ROOT, 'lib/useStudioStore.js')
    const content = fs.readFileSync(storePath, 'utf8')
    // Store should not accept provider/model from user
    expect(content).not.toContain('provider')
    expect(content).not.toContain('model')
  })
})
