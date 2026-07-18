import { readFileSync } from 'node:fs'
import { describe, expect, it } from 'vitest'
import {
  APPROVED_PROVIDER_DEFINITIONS,
  CAPABILITY_KEYS,
  DURABLE_WORKFLOW_REGISTRATIONS,
  EXECUTOR_REGISTRATIONS,
  getInternalDashboardApps,
  getReleaseCandidateCapabilityKeys,
  getRuntimeTruth,
} from '../packages/core/src/index.ts'

const root = process.cwd()
const source = (path: string) => readFileSync(`${root}/${path}`, 'utf8')

describe('production release-candidate canonical contract', () => {
  it('derives exactly 27 release capabilities from callable executors and durable workflows', () => {
    const expected = [...new Set([
      ...EXECUTOR_REGISTRATIONS.map((entry) => entry.capability),
      ...DURABLE_WORKFLOW_REGISTRATIONS.map((entry) => entry.capability),
    ])]
    expect(getReleaseCandidateCapabilityKeys()).toEqual(expected)
    expect(expected).toHaveLength(27)
    expect(expected).toContain('long_form_video')
    expect(expected).not.toContain('voice_clone')
    expect(expected.some((capability) => capability.startsWith('adult_'))).toBe(false)
  })

  it('keeps all other catalogue capabilities blocked from release readiness', () => {
    const truth = getRuntimeTruth()
    const release = new Set(getReleaseCandidateCapabilityKeys())
    for (const capability of truth.releaseReadiness) {
      expect(capability.releaseCandidate).toBe(release.has(capability.capability))
      if (!release.has(capability.capability)) {
        expect(capability.readyForDashboardExecution).toBe(false)
        expect(capability.blockedReasons).toContain('no_callable_executor_or_durable_workflow')
      }
    }
    expect(truth.releaseReadiness).toHaveLength(CAPABILITY_KEYS.length)
  })

  it('requires the long-form app grant and every workflow dependency grant', () => {
    const grants = Object.fromEntries(getInternalDashboardApps().map((app) => [
      app.appSlug,
      Object.fromEntries(app.capabilities.map((capability) => [capability, true])),
    ]))
    const full = getRuntimeTruth({ appGrants: grants })
    expect(full.releaseReadiness.find((item) => item.capability === 'long_form_video')?.appGrantPresent).toBe(true)
    grants['dashboard-long-form'].tts = false
    const missing = getRuntimeTruth({ appGrants: grants })
    expect(missing.releaseReadiness.find((item) => item.capability === 'long_form_video')?.appGrantPresent).toBe(false)
  })

  it('keeps MiMo coding-only and derives all provider identities from one definition list', () => {
    expect(APPROVED_PROVIDER_DEFINITIONS).toHaveLength(4)
    expect(APPROVED_PROVIDER_DEFINITIONS.filter((provider) => provider.backendExecutionAllowed)).toHaveLength(3)
    expect(APPROVED_PROVIDER_DEFINITIONS.find((provider) => provider.key === 'mimo')).toMatchObject({ codingOnly: true, backendExecutionAllowed: false })
    expect(source('lib/provider-settings-contract.js')).toContain('APPROVED_PROVIDER_DEFINITIONS')
    expect(source('lib/dashboard-contract.js')).toContain('APPROVED_PROVIDER_DEFINITIONS.map')
  })

  it('enforces one authorised artifact route with streaming, range, and download semantics', () => {
    const route = source('apps/api/src/routes/artifacts.ts')
    const proxy = source('app/api/admin/artifacts/[id]/file/route.js')
    expect(route).toContain('getArtifactStream')
    expect(route).toContain(".header('Accept-Ranges', 'bytes')")
    expect(route).toContain(".header('Content-Disposition'")
    expect(route).toContain("reply.status(416)")
    expect(proxy).toContain("request.headers.get('range')")
    expect(proxy).toContain("'content-range'")
    expect(proxy).toContain('response.headers.get(header)')
  })

  it('has fail-closed schema guards, recovery, CI, preflight and production proof tooling', () => {
    const workflow = source('.github/workflows/release-candidate-checks.yml')
    const packageJson = source('package.json')
    expect(source('apps/api/src/server.ts')).toContain('assertDatabaseSchemaCurrent')
    expect(source('apps/worker/src/worker.ts')).toContain('assertDatabaseSchemaCurrent')
    expect(source('apps/worker/src/recovery.ts')).toContain('recoverStaleProcessingJobs')
    expect(workflow).toContain('release-candidate-checks')
    expect(workflow).toContain('real-service-fixture:')
    expect(workflow).toContain('needs: static-and-build')
    expect(workflow).toContain('npm run proof 2>&1 | tee')
    expect(workflow).toContain('bash scripts/verify-migrations-disposable.sh')
    expect(workflow).toContain('if: always()')
    expect(workflow).toContain('echo "::add-mask::$value"')
    expect(packageJson).toContain('"proof": "node scripts/proof-release-fixture.mjs"')
    expect(source('docker-compose.release-fixture.yml')).toContain('healthcheck.sh", "--connect", "--innodb_initialized"')
    expect(source('prisma/migrations/20260715_expand_app_connection_capabilities/migration.sql')).toContain('VARCHAR(4096)')
    expect(source('prisma/migrations/20260715_expand_job_prompt/migration.sql')).toContain('TEXT NOT NULL')
    expect(source('deploy/preflight.sh')).toContain('PRODUCTION_PREFLIGHT=PASS')
    expect(source('scripts/proof-production-release-candidate.mjs')).toContain('--base-url is required')
  })

  it('keeps the deterministic provider and queue controls behind the exact test-only fixture switch', () => {
    const providerFixture = source('apps/worker/src/providers/release-fixture-executor.ts')
    const queueFixture = source('scripts/release-fixture-queue-control.mjs')
    const runner = source('scripts/proof-release-fixture.mjs')
    expect(providerFixture).toContain("process.env.NODE_ENV === 'test'")
    expect(providerFixture).toContain("process.env.RELEASE_FIXTURE_MODE === 'true'")
    expect(providerFixture).toContain('process.env.RELEASE_FIXTURE_SAFETY_TOKEN === FIXTURE_SAFETY_TOKEN')
    expect(providerFixture).toContain("database.hostname === 'mariadb'")
    expect(providerFixture).toContain("process.env.AMARKTAI_TEST_FIXTURE_ADAPTER === FIXTURE_SWITCH")
    expect(queueFixture).toContain("process.env.NODE_ENV === 'test'")
    expect(queueFixture).toContain("process.env.RELEASE_FIXTURE_MODE === 'true'")
    expect(queueFixture).toContain("process.env.AMARKTAI_TEST_FIXTURE_ADAPTER === 'release-candidate-v1'")
    expect(runner).toContain("queueControl('prepare-stale'")
    expect(runner).toContain("queueControl('redeliver'")
    expect(runner).toContain("queueControl('prepare-cancelled'")
    expect(runner).toContain("const tsx = join(root, 'node_modules', '.bin'")
    expect(runner).toContain('Queued job was not visible after API restart')
    expect(runner).toContain('Long-form final assembly was not exactly once')
  })
})
