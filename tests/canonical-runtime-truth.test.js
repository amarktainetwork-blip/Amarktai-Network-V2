import { describe, it, expect } from 'vitest'
import { readFileSync } from 'fs'
import {
  getRuntimeTruth,
  getCapabilityRuntimeTruth,
  getProviderRuntimeTruth,
  PROVIDER_KEYS,
} from '../packages/core/src/index.ts'
import { selectCapabilityProofStates } from '../apps/api/src/lib/admin-runtime-truth.ts'

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

const newerProofAt = new Date('2026-07-10T12:00:00.000Z')
const olderProofAt = new Date('2026-07-09T12:00:00.000Z')

function proofJob(overrides = {}) {
  return {
    id: 'job-image-valid',
    appSlug: 'runtime-proof-app',
    capability: 'image_generation',
    status: 'completed',
    completedAt: newerProofAt,
    artifactId: 'artifact-image-valid',
    provider: 'together',
    model: 'black-forest-labs/FLUX.1-schnell',
    output: JSON.stringify({
      artifactId: 'artifact-image-valid',
      artifactUrl: '/api/v1/artifacts/artifact-image-valid/file',
      mimeType: 'image/png',
    }),
    traceId: 'trace-image-valid',
    metadataJson: JSON.stringify({ routingMode: 'balanced' }),
    ...overrides,
  }
}

function proofArtifact(overrides = {}) {
  return {
    id: 'artifact-image-valid',
    appSlug: 'runtime-proof-app',
    type: 'image',
    subType: 'image_generation',
    status: 'completed',
    provider: 'together',
    model: 'black-forest-labs/FLUX.1-schnell',
    traceId: 'trace-image-valid',
    mimeType: 'image/png',
    fileSizeBytes: 1024,
    storagePath: 'runtime-proof-app/image/file.png',
    storageUrl: '/api/v1/artifacts/artifact-image-valid/file',
    metadata: JSON.stringify({
      capability: 'image_generation',
      provider: 'together',
      model: 'black-forest-labs/FLUX.1-schnell',
    }),
    description: 'Together image_generation artifact',
    errorMessage: '',
    ...overrides,
  }
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

  it('long-form is now executable with component-level accuracy', () => {
    const runtimeTruth = truth()
    const longForm = capability(runtimeTruth, 'long_form_video')

    expect(longForm.classification).toBe('EXECUTABLE_NOT_LIVE_PROVEN')
    expect(longForm.liveProven).toBe(false)
    expect(longForm.executableNow).toBe(true)
    expect(longForm.clientImplemented).toBe(false)
    expect(longForm.executorRegistered).toBe(false)
    expect(longForm.routeImplemented).toBe(true)
    expect(longForm.queuePathImplemented).toBe(true)
    expect(longForm.artifactPathImplemented).toBe(true)
    expect(longForm.durableParentReady).toBe(true)
    expect(longForm.durablePlanReady).toBe(true)
    expect(longForm.sceneLinkageReady).toBe(true)
    expect(longForm.sceneSubmissionReady).toBe(true)
    expect(longForm.retryResumeReady).toBe(true)
    expect(longForm.progressTrackingReady).toBe(true)
    expect(longForm.assemblyHandoffReady).toBe(true)
    expect(longForm.fullMultimediaReady).toBe(true)
    expect(longForm.blockedReasons).toContain('executor_missing')
    expect(longForm.blockedReasons).toContain('provider_client_missing')
    expect(longForm.blockedReasons).toContain('no_executable_provider_model_path')
    // Accurate component-level blockers
    expect(longForm.blockedReasons).not.toContain('voiceover_missing')
    expect(longForm.blockedReasons).not.toContain('subtitles_missing')
    expect(longForm.blockedReasons).not.toContain('music_bed_missing')
    expect(longForm.blockedReasons).not.toContain('full_multimedia_not_ready')
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

  it('valid media proof requires a completed matching artifact trace', () => {
    const proofs = selectCapabilityProofStates([proofJob()], [proofArtifact()])

    expect(proofs.image_generation.liveProven).toBe(true)
    expect(proofs.image_generation.lastProofAt).toEqual(newerProofAt)
  })

  it('rejects media proof when artifact is missing, failed, or not linked to the job trace', () => {
    expect(selectCapabilityProofStates([proofJob()], [])).toEqual({})
    expect(selectCapabilityProofStates([proofJob()], [proofArtifact({ status: 'failed' })])).toEqual({})
    expect(selectCapabilityProofStates([proofJob()], [proofArtifact({ traceId: 'trace-other-job' })])).toEqual({})
    expect(selectCapabilityProofStates([proofJob()], [proofArtifact({ appSlug: 'other-app' })])).toEqual({})
  })

  it('rejects media proof when artifact type, subtype, provider, model, or output id do not match', () => {
    expect(selectCapabilityProofStates([proofJob()], [proofArtifact({ type: 'document', mimeType: 'application/json' })])).toEqual({})
    expect(selectCapabilityProofStates([proofJob()], [proofArtifact({ subType: 'video_generation' })])).toEqual({})
    expect(selectCapabilityProofStates([proofJob()], [proofArtifact({ provider: 'genx' })])).toEqual({})
    expect(selectCapabilityProofStates([proofJob()], [proofArtifact({ model: 'other-model' })])).toEqual({})
    expect(selectCapabilityProofStates([proofJob({ output: JSON.stringify({ artifactId: 'other-artifact' }) })], [proofArtifact()])).toEqual({})
  })

  it('rejects placeholder media artifacts and failed jobs', () => {
    expect(selectCapabilityProofStates([proofJob({ status: 'failed' })], [proofArtifact()])).toEqual({})
    expect(selectCapabilityProofStates(
      [proofJob()],
      [proofArtifact({ metadata: JSON.stringify({ source: 'mock fixture' }) })],
    )).toEqual({})
    expect(selectCapabilityProofStates(
      [proofJob({ output: 'Backend integration pending. Real previews will appear here.' })],
      [proofArtifact()],
    )).toEqual({})
  })

  it('uses the newest valid proof and skips newer invalid proof records', () => {
    const newerInvalid = proofJob({ id: 'job-new-invalid', completedAt: newerProofAt, artifactId: null })
    const olderValid = proofJob({
      id: 'job-old-valid',
      completedAt: olderProofAt,
      artifactId: 'artifact-old-valid',
      output: JSON.stringify({ artifactId: 'artifact-old-valid' }),
      traceId: 'trace-old-valid',
    })
    const artifact = proofArtifact({
      id: 'artifact-old-valid',
      traceId: 'trace-old-valid',
      storageUrl: '/api/v1/artifacts/artifact-old-valid/file',
    })

    const proofs = selectCapabilityProofStates([newerInvalid, olderValid], [artifact])
    expect(proofs.image_generation.liveProven).toBe(true)
    expect(proofs.image_generation.lastProofAt).toEqual(olderProofAt)
  })

  it('text proof requires runtime provider, model, trace, and non-placeholder output', () => {
    const validText = proofJob({
      id: 'job-chat-valid',
      capability: 'chat',
      provider: 'groq',
      model: 'llama-3.3-70b-versatile',
      artifactId: null,
      output: 'Groq Brain runtime proof passed.',
      traceId: 'trace-chat-valid',
    })

    const proofs = selectCapabilityProofStates([validText], [])
    expect(proofs.chat.liveProven).toBe(true)
    expect(proofs.chat.lastProofAt).toEqual(newerProofAt)
  })

  it('text proof rejects placeholders and missing trusted execution provenance', () => {
    expect(selectCapabilityProofStates([proofJob({ capability: 'chat', provider: 'groq', model: '', artifactId: null, output: 'real output' })], [])).toEqual({})
    expect(selectCapabilityProofStates([proofJob({ capability: 'chat', provider: 'mimo', model: 'mimo-v2.5', artifactId: null, output: 'real output' })], [])).toEqual({})
    expect(selectCapabilityProofStates([proofJob({ capability: 'chat', provider: 'groq', model: 'llama-3.3-70b-versatile', artifactId: null, output: 'Not implemented yet' })], [])).toEqual({})
    expect(selectCapabilityProofStates([proofJob({ capability: 'chat', provider: 'groq', model: 'llama-3.3-70b-versatile', artifactId: null, traceId: '', output: 'real output' })], [])).toEqual({})
  })

  it('music proof requires a valid audio artifact path before liveProven is true', () => {
    const job = proofJob({
      capability: 'music_generation',
      provider: 'genx',
      model: 'lyria-3-clip-preview',
      artifactId: 'artifact-music-valid',
      output: JSON.stringify({ artifactId: 'artifact-music-valid', mimeType: 'audio/mpeg' }),
      traceId: 'trace-music-valid',
    })
    const validArtifact = proofArtifact({
      id: 'artifact-music-valid',
      type: 'music',
      subType: 'music_generation',
      provider: 'genx',
      model: 'lyria-3-clip-preview',
      traceId: 'trace-music-valid',
      mimeType: 'audio/mpeg',
      storagePath: 'runtime-proof-app/music/file.mp3',
      storageUrl: '/api/v1/artifacts/artifact-music-valid/file',
    })

    expect(selectCapabilityProofStates([job], [validArtifact]).music_generation.liveProven).toBe(true)
    expect(selectCapabilityProofStates([job], [proofArtifact({ ...validArtifact, mimeType: 'application/json', type: 'document' })])).toEqual({})
  })

  it('music remains false without explicit live proof evidence', () => {
    const runtimeTruth = truth({
      providers: {
        genx: { enabled: true, runtimeEnabled: true, configured: true, healthStatus: 'configured' },
      },
      capabilities: {
        music_generation: { infrastructureReady: true },
      },
    })
    const music = capability(runtimeTruth, 'music_generation')

    expect(music.liveProven).toBe(false)
    expect(music.classification).toBe('EXECUTABLE_NOT_LIVE_PROVEN')
  })

})
