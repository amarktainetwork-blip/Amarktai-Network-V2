import { describe, it, expect } from 'vitest'
import fs from 'fs'
import path from 'path'

const ROOT = path.join(import.meta.dirname, '..')

describe('admin-jobs route contract', () => {
  it('admin-jobs route exists', () => {
    const filePath = path.join(ROOT, 'apps/api/src/routes/admin-jobs.ts')
    expect(fs.existsSync(filePath)).toBe(true)
    const content = fs.readFileSync(filePath, 'utf8')
    expect(content).toContain('adminJobRoutes')
    expect(content).toContain('/api/admin/jobs')
    expect(content).toContain('requireAdmin')
  })

  it('does not expose secrets in job shape', () => {
    const filePath = path.join(ROOT, 'apps/api/src/routes/admin-jobs.ts')
    const content = fs.readFileSync(filePath, 'utf8')
    expect(content).not.toContain('apiKey')
    expect(content).not.toContain('providerKey')
    expect(content).not.toContain('secret')
    expect(content).not.toContain('token')
  })

  it('server registers admin-jobs route', () => {
    const serverPath = path.join(ROOT, 'apps/api/src/server.ts')
    const content = fs.readFileSync(serverPath, 'utf8')
    expect(content).toContain('adminJobRoutes')
  })
})

describe('admin-artifacts route contract', () => {
  it('admin-artifacts route exists', () => {
    const filePath = path.join(ROOT, 'apps/api/src/routes/admin-artifacts.ts')
    expect(fs.existsSync(filePath)).toBe(true)
    const content = fs.readFileSync(filePath, 'utf8')
    expect(content).toContain('adminArtifactRoutes')
    expect(content).toContain('/api/admin/artifacts')
    expect(content).toContain('requireAdmin')
  })

  it('does not expose secrets in artifact shape', () => {
    const filePath = path.join(ROOT, 'apps/api/src/routes/admin-artifacts.ts')
    const content = fs.readFileSync(filePath, 'utf8')
    expect(content).not.toContain('filePath')
    expect(content).not.toContain('storagePath')
    expect(content).not.toContain('apiKey')
  })

  it('server registers admin-artifacts route', () => {
    const serverPath = path.join(ROOT, 'apps/api/src/server.ts')
    const content = fs.readFileSync(serverPath, 'utf8')
    expect(content).toContain('adminArtifactRoutes')
  })
})
