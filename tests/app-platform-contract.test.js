import { describe, it, expect, vi, beforeAll, beforeEach } from 'vitest'
import fs from 'fs'
import path from 'path'

const ROOT = path.join(import.meta.dirname, '..')

describe('app platform contract', () => {
  // ── Schema Verification ─────────────────────────────────────────────────

  it('AppConnection model exists with required fields', () => {
    const schemaPath = path.join(ROOT, 'prisma/schema.prisma')
    const content = fs.readFileSync(schemaPath, 'utf8')
    expect(content).toContain('model AppConnection')
    expect(content).toContain('allowedCapabilities')
    expect(content).toContain('dailyBudgetCents')
    expect(content).toContain('tokenBalance')
  })

  it('AppApiKey model exists with required fields', () => {
    const schemaPath = path.join(ROOT, 'prisma/schema.prisma')
    const content = fs.readFileSync(schemaPath, 'utf8')
    expect(content).toContain('model AppApiKey')
    expect(content).toContain('key')
    expect(content).toContain('active')
  })

  it('AppBudgetConfig model exists with required fields', () => {
    const schemaPath = path.join(ROOT, 'prisma/schema.prisma')
    const content = fs.readFileSync(schemaPath, 'utf8')
    expect(content).toContain('model AppBudgetConfig')
    expect(content).toContain('monthlyBudgetCents')
    expect(content).toContain('dailyBudgetCents')
    expect(content).toContain('requestsPerMinute')
    expect(content).toContain('requestsPerDay')
    expect(content).toContain('capabilityQuotas')
    expect(content).toContain('premiumToggles')
    expect(content).toContain('paused')
  })

  it('UsageMeter model exists with required fields', () => {
    const schemaPath = path.join(ROOT, 'prisma/schema.prisma')
    const content = fs.readFileSync(schemaPath, 'utf8')
    expect(content).toContain('model UsageMeter')
    expect(content).toContain('requestCount')
    expect(content).toContain('successCount')
    expect(content).toContain('errorCount')
    expect(content).toContain('costUsdCents')
  })

  it('Job model has callbackUrl field', () => {
    const schemaPath = path.join(ROOT, 'prisma/schema.prisma')
    const content = fs.readFileSync(schemaPath, 'utf8')
    expect(content).toContain('callbackUrl')
  })

  // ── Route Verification ──────────────────────────────────────────────────

  it('admin app connections route exists', () => {
    const routePath = path.join(ROOT, 'apps/api/src/routes/admin-app-connections.ts')
    expect(fs.existsSync(routePath)).toBe(true)
    const content = fs.readFileSync(routePath, 'utf8')
    expect(content).toContain('adminAppConnectionRoutes')
    expect(content).toContain('/api/admin/app-connections')
  })

  it('admin app connections route requires admin auth', () => {
    const routePath = path.join(ROOT, 'apps/api/src/routes/admin-app-connections.ts')
    const content = fs.readFileSync(routePath, 'utf8')
    expect(content).toContain('requireAdmin')
  })

  it('admin app connections persist explicit release-candidate grants', () => {
    const routePath = path.join(ROOT, 'apps/api/src/routes/admin-app-connections.ts')
    const content = fs.readFileSync(routePath, 'utf8')
    expect(content).toContain('getReleaseCandidateCapabilityKeys')
    expect(content).toContain('appCapabilityGrant.createMany')
    expect(content).toContain('appCapabilityGrant.upsert')
    expect(content).toContain('passthroughModelAllowed: false')
    expect(content).toContain('adultPermission: false')
  })

  it('admin app connections route has key lifecycle', () => {
    const routePath = path.join(ROOT, 'apps/api/src/routes/admin-app-connections.ts')
    const content = fs.readFileSync(routePath, 'utf8')
    expect(content).toContain('Create app API key')
    expect(content).toContain('List app API keys')
    expect(content).toContain('Revoke app API key')
  })

  it('server registers admin app connections route', () => {
    const serverPath = path.join(ROOT, 'apps/api/src/server.ts')
    const content = fs.readFileSync(serverPath, 'utf8')
    expect(content).toContain('adminAppConnectionRoutes')
  })

  it('dashboard proxy exists for app connections', () => {
    const proxyPath = path.join(ROOT, 'app/api/admin/app-connections/route.js')
    expect(fs.existsSync(proxyPath)).toBe(true)
    const content = fs.readFileSync(proxyPath, 'utf8')
    expect(content).toContain('Authorization')
  })

  it('dashboard proxy exists for app budgets', () => {
    const proxyPath = path.join(ROOT, 'app/api/admin/app-budgets/route.js')
    expect(fs.existsSync(proxyPath)).toBe(true)
    const content = fs.readFileSync(proxyPath, 'utf8')
    expect(content).toContain('Authorization')
  })

  // ── Auth Verification ───────────────────────────────────────────────────

  it('job route authenticates app API key', () => {
    const routePath = path.join(ROOT, 'apps/api/src/routes/jobs.ts')
    const content = fs.readFileSync(routePath, 'utf8')
    expect(content).toContain('authenticateAppKey')
    expect(content).toContain('AppApiKey')
  })

  it('job route resolves canonical AppCapabilityGrant authority', () => {
    const routePath = path.join(ROOT, 'apps/api/src/routes/jobs.ts')
    const content = fs.readFileSync(routePath, 'utf8')
    expect(content).toContain('resolveAppCapabilityGrantSnapshot')
    expect(content).toContain('no enabled AppCapabilityGrant')
  })

  it('job route checks daily budget', () => {
    const routePath = path.join(ROOT, 'apps/api/src/routes/jobs.ts')
    const content = fs.readFileSync(routePath, 'utf8')
    expect(content).toContain('dailyBudgetCents')
    expect(content).toContain('Daily cost budget limit reached')
  })

  it('job route checks token balance', () => {
    const routePath = path.join(ROOT, 'apps/api/src/routes/jobs.ts')
    const content = fs.readFileSync(routePath, 'utf8')
    expect(content).toContain('tokenBalance')
    expect(content).toContain('Insufficient token balance')
  })

  it('job route blocks provider/model override', () => {
    const routePath = path.join(ROOT, 'apps/api/src/routes/jobs.ts')
    const content = fs.readFileSync(routePath, 'utf8')
    expect(content).toContain('hasBlockedOverrides')
    expect(content).toContain('not allowed')
  })

  it('job route stores callbackUrl', () => {
    const routePath = path.join(ROOT, 'apps/api/src/routes/jobs.ts')
    const content = fs.readFileSync(routePath, 'utf8')
    expect(content).toContain('callbackUrl')
  })

  // ── Artifact Access Verification ────────────────────────────────────────

  it('artifact route authenticates app API key', () => {
    const routePath = path.join(ROOT, 'apps/api/src/routes/artifacts.ts')
    const content = fs.readFileSync(routePath, 'utf8')
    expect(content).toContain('authenticateArtifactAccess')
  })

  it('artifact route checks ownership', () => {
    const routePath = path.join(ROOT, 'apps/api/src/routes/artifacts.ts')
    const content = fs.readFileSync(routePath, 'utf8')
    expect(content).toContain('canAccessArtifact')
  })

  it('auth context supports app API key', () => {
    const authPath = path.join(ROOT, 'apps/api/src/lib/auth-context.ts')
    const content = fs.readFileSync(authPath, 'utf8')
    expect(content).toContain('authenticateAppApiKey')
    expect(content).toContain('kind: \'app\'')
  })

  it('auth context allows admin to access all artifacts', () => {
    const authPath = path.join(ROOT, 'apps/api/src/lib/auth-context.ts')
    const content = fs.readFileSync(authPath, 'utf8')
    expect(content).toContain('auth.kind === \'admin\'')
  })

  it('auth context restricts app to own artifacts', () => {
    const authPath = path.join(ROOT, 'apps/api/src/lib/auth-context.ts')
    const content = fs.readFileSync(authPath, 'utf8')
    expect(content).toContain('auth.appSlug === artifactAppSlug')
  })

  // ── Provider Safety ─────────────────────────────────────────────────────

  it('provider list remains exactly 5', async () => {
    const { PROVIDER_KEYS } = await import('../packages/core/src/index.ts')
    expect(PROVIDER_KEYS).toHaveLength(5)
  })

  it('MiMo remains coding_tools_only', async () => {
    const { APPROVED_PROVIDER_DEFINITIONS, CODING_ONLY_PROVIDERS } = await import('../packages/core/src/index.ts')
    expect([...CODING_ONLY_PROVIDERS]).toEqual(['mimo'])
    expect(APPROVED_PROVIDER_DEFINITIONS.find(provider => provider.key === 'mimo')).toMatchObject({ codingOnly: true, backendExecutionAllowed: false })
  })

  it('adult generation remains policy restricted', async () => {
    const { getRuntimeTruth } = await import('../packages/core/src/index.ts')
    expect(getRuntimeTruth().capabilities.filter((item) => item.capability.startsWith('adult_')).every((item) => item.classification === 'POLICY_RESTRICTED')).toBe(true)
  })

  it('no provider/model selectors are exposed', () => {
    const studioPath = path.join(ROOT, 'app/dashboard/studio/page.jsx')
    const content = fs.readFileSync(studioPath, 'utf8')
    expect(content).not.toContain('SelectProvider')
    expect(content).not.toContain('SelectModel')
  })

  // ── Hashing Verification ────────────────────────────────────────────────

  it('API key is hashed before storage', () => {
    const routePath = path.join(ROOT, 'apps/api/src/routes/admin-app-connections.ts')
    const content = fs.readFileSync(routePath, 'utf8')
    expect(content).toContain('hashApiKey')
    expect(content).toContain('sha256')
    expect(content).toContain('hashedKey')
  })

  it('raw key returned only on creation', () => {
    const routePath = path.join(ROOT, 'apps/api/src/routes/admin-app-connections.ts')
    const content = fs.readFileSync(routePath, 'utf8')
    expect(content).toContain('Return raw key only once')
    expect(content).toContain('Store this key securely')
  })

  it('key list shows masked preview only', () => {
    const routePath = path.join(ROOT, 'apps/api/src/routes/admin-app-connections.ts')
    const content = fs.readFileSync(routePath, 'utf8')
    expect(content).toContain('maskApiKey')
  })

  // ── Budget Verification ─────────────────────────────────────────────────

  it('admin can manage app budgets', () => {
    const routePath = path.join(ROOT, 'apps/api/src/routes/admin-app-connections.ts')
    const content = fs.readFileSync(routePath, 'utf8')
    expect(content).toContain('List app budget configs')
    expect(content).toContain('Update app budget config')
    expect(content).toContain('/api/admin/app-budgets')
  })

  // ── Audit Verification ──────────────────────────────────────────────────

  it('audit events logged on key lifecycle', () => {
    const routePath = path.join(ROOT, 'apps/api/src/routes/admin-app-connections.ts')
    const content = fs.readFileSync(routePath, 'utf8')
    expect(content).toContain('logAuditEvent')
    expect(content).toContain('app_api_key_created')
    expect(content).toContain('app_api_key_revoked')
  })
})
