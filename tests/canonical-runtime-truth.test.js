import { describe, it, expect } from 'vitest'
import { readFileSync } from 'fs'
import {
  getRuntimeTruth,
  getCapabilityRuntimeTruth,
  getProviderRuntimeTruth,
  PROVIDER_KEYS,
} from '../packages/core/src/index.ts'

function truth(overrides = {}) {
  return getRuntimeTruth({
    providers: {
      genx: { enabled: true, runtimeEnabled: true, configured: false, healthStatus: 'unconfigured' },
      groq: { enabled: true, runtimeEnabled: true, configured: false, healthStatus: 'unconfigured' },
      together: { enabled: true, runtimeEnabled: true, configured: false, healthStatus: 'unconfigured' },
      deepinfra: { enabled: true, runtimeEnabled: true, configured: false, healthStatus: 'unconfigured' },
      mimo: { enabled: false, runtimeEnabled: false, configured: true, credentialUsagePolicy: 'coding_tools_only', healthStatus: 'runtime_restricted' },
      ...(overrides.providers ?? {}),
    },
    capabilities: overrides.capabilities,
  })
}

function capability(runtimeTruth, key) {
  return runtimeTruth.capabilities.find((entry) => entry.capability === key)
}

describe('canonical runtime truth', () => {
  it('exposes one provider policy with only approved runtime providers', () => {
    const runtimeTruth = truth()

    expect(PROVIDER_KEYS).toEqual(['genx', 'groq', 'together', 'mimo', 'deepinfra'])
    expect(runtimeTruth.providerPolicy.runtimeExecutionProviders).toEqual(['genx', 'groq', 'together', 'deepinfra'])
    expect(runtimeTruth.providerPolicy.codingOnlyProviders).toEqual(['mimo'])
    expect(runtimeTruth.providerPolicy.qwenRuntimeEligible).toBe(false)
  })

  it('keeps MiMo coding-only and never runtime executable', () => {
    const providers = getProviderRuntimeTruth({
      providers: {
        mimo: { enabled: true, configured: true, credentialUsagePolicy: 'coding_tools_only', healthStatus: 'live' },
      },
    })
    const mimo = providers.find((provider) => provider.provider === 'mimo')

    expect(mimo.codingOnly).toBe(true)
    expect(mimo.runtimeExecutionProvider).toBe(false)
    expect(mimo.runtimeEnabled).toBe(false)
    expect(mimo.policyRestrictions).toContain('coding_tools_only_not_backend_runtime')
  })

  it('catalogue presence does not imply implementation', () => {
    const runtimeTruth = truth()
    const toolUse = capability(runtimeTruth, 'tool_use')

    expect(toolUse.catalogueKnown).toBe(true)
    expect(toolUse.implementationReady).toBe(false)
    expect(toolUse.classification).toBe('CATALOGUE_ONLY')
    expect(toolUse.blockedReasons).toContain('executor_missing')
  })

  it('implementationReady does not imply configured', () => {
    const runtimeTruth = truth()
    const music = capability(runtimeTruth, 'music_generation')

    expect(music.implementationReady).toBe(true)
    expect(music.configured).toBe(false)
    expect(music.executableNow).toBe(false)
    expect(music.classification).toBe('IMPLEMENTED_NOT_CONFIGURED')
    expect(music.blockedReasons).toContain('genx_api_key_not_configured')
  })

  it('configured does not imply infrastructureReady', () => {
    const runtimeTruth = truth({
      providers: {
        genx: { enabled: true, runtimeEnabled: true, configured: true, healthStatus: 'configured' },
      },
    })
    const music = capability(runtimeTruth, 'music_generation')

    expect(music.configured).toBe(true)
    expect(music.infrastructureReady).toBe(false)
    expect(music.executableNow).toBe(false)
    expect(music.classification).toBe('BLOCKED')
    expect(music.blockedReasons).toContain('infrastructure_not_ready')
  })

  it('executableNow requires implementation, configuration, infrastructure, policy, and eligible model path', () => {
    const runtimeTruth = truth({
      providers: {
        genx: { enabled: true, runtimeEnabled: true, configured: true, healthStatus: 'configured' },
      },
      capabilities: {
        music_generation: { infrastructureReady: true, liveProven: false },
      },
    })
    const music = capability(runtimeTruth, 'music_generation')

    expect(music.implementationReady).toBe(true)
    expect(music.configured).toBe(true)
    expect(music.infrastructureReady).toBe(true)
    expect(music.policyAllowed).toBe(true)
    expect(music.eligibleProviders).toEqual(['genx'])
    expect(music.eligibleModels.map((model) => model.modelId)).toEqual(expect.arrayContaining(['lyria-3-clip-preview', 'lyria-3-pro-preview']))
    expect(music.executableNow).toBe(true)
    expect(music.liveProven).toBe(false)
    expect(music.classification).toBe('EXECUTABLE_NOT_LIVE_PROVEN')
  })

  it('liveProven only comes from supplied stored proof evidence', () => {
    const notProven = truth({
      providers: { together: { enabled: true, runtimeEnabled: true, configured: true, healthStatus: 'live' } },
      capabilities: { image_generation: { infrastructureReady: true } },
    })
    expect(capability(notProven, 'image_generation').liveProven).toBe(false)

    const proven = truth({
      providers: { together: { enabled: true, runtimeEnabled: true, configured: true, healthStatus: 'live' } },
      capabilities: { image_generation: { infrastructureReady: true, liveProven: true, lastProofAt: '2026-07-10T00:00:00.000Z' } },
    })
    expect(capability(proven, 'image_generation').classification).toBe('LIVE_PROVEN')
    expect(capability(proven, 'image_generation').lastProofAt).toBe('2026-07-10T00:00:00.000Z')
  })

  it('missing provider keys produce configured=false without changing implementation gates', () => {
    const capabilities = getCapabilityRuntimeTruth({
      providers: {
        together: { enabled: true, runtimeEnabled: true, configured: false },
      },
      capabilities: {
        image_generation: { infrastructureReady: true },
      },
    })
    const image = capabilities.find((entry) => entry.capability === 'image_generation')

    expect(image.implementationReady).toBe(true)
    expect(image.configured).toBe(false)
    expect(image.blockedReasons).toContain('credentials_missing')
  })

  it('long-form remains partial and does not claim full multimedia readiness', () => {
    const runtimeTruth = truth()
    const longForm = capability(runtimeTruth, 'long_form_video')

    expect(longForm.classification).toBe('PARTIAL')
    expect(longForm.liveProven).toBe(false)
    expect(longForm.executableNow).toBe(false)
    expect(longForm.blockedReasons).toContain('executor_missing')
  })

  it('adult capabilities remain policy restricted', () => {
    const runtimeTruth = truth()
    expect(capability(runtimeTruth, 'adult_text').classification).toBe('POLICY_RESTRICTED')
    expect(capability(runtimeTruth, 'adult_image').blockedReasons).toContain('provider_policy_restriction')
  })

  it('admin truth route, capability API, dashboard proxy, and audit consume canonical truth', () => {
    const adminTruthRoute = readFileSync('apps/api/src/routes/admin-truth.ts', 'utf8')
    const modelDiscoveryRoute = readFileSync('apps/api/src/routes/admin-model-discovery.ts', 'utf8')
    const dashboardProxy = readFileSync('app/api/admin/truth/route.js', 'utf8')
    const audit = readFileSync('scripts/audit-build-completion-map.mjs', 'utf8')

    expect(adminTruthRoute).toContain('buildAdminRuntimeTruth')
    expect(modelDiscoveryRoute).toContain('buildAdminRuntimeTruth')
    expect(modelDiscoveryRoute).toContain('truth.capabilities')
    expect(dashboardProxy).toContain('/api/admin/truth')
    expect(audit).toContain('getRuntimeTruth')
    expect(audit).toContain('capabilityInventory')
  })

  it('music route still blocks caller provider/model overrides', () => {
    const musicRoute = readFileSync('apps/api/src/routes/admin-music.ts', 'utf8')

    expect(musicRoute).toContain('BLOCKED_OVERRIDE_FIELDS')
    expect(musicRoute).toContain('Provider/model override not allowed')
    expect(musicRoute).toContain('buildAdminRuntimeTruth')
  })
})
