import { readFileSync } from 'node:fs'
import { resolve } from 'node:path'
import { describe, expect, it } from 'vitest'
import {
  INTERNAL_EXECUTOR_REGISTRATIONS,
  getDashboardAppSlug,
  getInternalExecutorRegistration,
  getReleaseCandidateCapabilityKeys,
  getRuntimeTruth,
} from '../packages/core/src/index.ts'
import { normalizeEffectiveRuntimeTruth } from '../packages/core/src/effective-runtime-truth.ts'
import { validateInternalExecutorProof } from '../apps/api/src/lib/internal-executor-proof.ts'

const root = process.cwd()
const source = (path: string) => readFileSync(resolve(root, path), 'utf8')
const ARTIFACT_ID = 'a0eebc99-9c0b-4ef8-bb6d-6bb9bd380a11'

function validAudioProof() {
  return {
    job: {
      id: 'job-audio', appSlug: 'dashboard-capability-lab', capability: 'audio_to_audio', status: 'completed',
      completedAt: '2026-07-22T18:00:00.000Z', artifactId: ARTIFACT_ID, provider: 'internal',
      model: 'ffmpeg-normalize', output: JSON.stringify({ artifactId: ARTIFACT_ID }), traceId: 'trace-audio',
    },
    artifact: {
      id: ARTIFACT_ID, appSlug: 'dashboard-capability-lab', type: 'audio', subType: 'audio_to_audio_normalize',
      status: 'completed', provider: 'internal', model: 'ffmpeg-normalize', traceId: 'trace-audio',
      mimeType: 'audio/wav', fileSizeBytes: 1024, storagePath: '/artifacts/audio.wav', storageUrl: '/api/artifacts/audio.wav',
      metadata: JSON.stringify({
        evidenceSource: 'internal_ffmpeg', liveProviderProof: false,
        outputChecksum: 'sha256:fixture-checksum', sourceArtifactId: 'source-audio-id',
      }),
    },
  }
}

function validImageProof() {
  return {
    job: {
      id: 'job-image', appSlug: 'dashboard-image', capability: 'image_upscale', status: 'completed',
      completedAt: '2026-07-22T18:05:00.000Z', artifactId: ARTIFACT_ID, provider: 'internal',
      model: 'ffmpeg-lanczos', output: JSON.stringify({ artifactId: ARTIFACT_ID }), traceId: 'trace-image',
    },
    artifact: {
      id: ARTIFACT_ID, appSlug: 'dashboard-image', type: 'image', subType: 'image_upscale_lanczos',
      status: 'completed', provider: 'internal', model: 'ffmpeg-lanczos', traceId: 'trace-image',
      mimeType: 'image/png', fileSizeBytes: 2048, storagePath: '/artifacts/image.png', storageUrl: '/api/artifacts/image.png',
      metadata: JSON.stringify({
        evidenceSource: 'internal_ffmpeg', liveProviderProof: false,
        outputChecksum: 'sha256:image-checksum', sourceArtifactId: 'source-image-id',
        outputValidation: { valid: true, width: 640, height: 360, filter: 'lanczos' },
      }),
    },
  }
}

describe('internal atomic executor truth', () => {
  it('registers real FFmpeg audio and image transforms in the release set', () => {
    expect(INTERNAL_EXECUTOR_REGISTRATIONS).toHaveLength(2)
    expect(getInternalExecutorRegistration('audio_to_audio')).toMatchObject({
      id: 'internal.ffmpeg.audio-to-audio', handlerName: 'handleAudioToAudioJob', artifactOutput: 'audio', executionMode: 'queued',
    })
    expect(getInternalExecutorRegistration('image_upscale')).toMatchObject({
      id: 'internal.ffmpeg.image-upscale', handlerName: 'handleImageUpscaleJob', artifactOutput: 'image', executionMode: 'queued',
    })
    expect(getReleaseCandidateCapabilityKeys()).toEqual(expect.arrayContaining(['audio_to_audio', 'image_upscale']))
    expect(getInternalExecutorRegistration('voice_clone')).toBeUndefined()
    expect(getInternalExecutorRegistration('voice_conversion')).toBeUndefined()
  })

  it.each(['audio_to_audio', 'image_upscale'] as const)('projects %s without fake provider, model, or credential blockers', (capability) => {
    const appSlug = getDashboardAppSlug(capability)
    const truth = normalizeEffectiveRuntimeTruth(getRuntimeTruth({
      capabilities: { [capability]: { infrastructureReady: true, policyAllowed: true, locallyProven: true } },
      appGrants: { [appSlug]: { [capability]: true } },
      localStaticEvidence: { [capability]: true },
    }))
    const row = truth.capabilities.find((entry) => entry.capability === capability)
    expect(row).toMatchObject({ classification: 'LOCALLY_PROVEN', implementationReady: true, configured: true, infrastructureReady: true, executableNow: true, locallyProven: true, liveProven: false, eligibleProviders: [], eligibleModels: [] })
    expect(row?.blockedReasons).not.toContain('credentials_missing')
    expect(row?.blockedReasons).not.toContain('no_catalogued_model_claim')
    expect(row?.blockedReasons).not.toContain('no_executor_compatible_catalogued_model')
    const release = truth.releaseReadiness.find((entry) => entry.capability === capability)
    expect(release).toMatchObject({ releaseCandidate: true, executorPresent: true, appGrantPresent: true, readyForDashboardExecution: true, locallyProven: true, liveProven: false })
  })

  it('binds both registries to real central worker dispatch', () => {
    const dispatcher = source('apps/worker/src/providers/durable-provider-fallback.ts')
    const audioHandler = source('apps/worker/src/handlers/voice-audio-handlers.ts')
    const imageHandler = source('apps/worker/src/handlers/image-upscale-handler.ts')
    expect(dispatcher).toContain("payload.capability === 'audio_to_audio'")
    expect(dispatcher).toContain('return handleAudioToAudioJob(payload)')
    expect(dispatcher).toContain("payload.capability === 'image_upscale'")
    expect(dispatcher).toContain('return handleImageUpscaleJob(payload)')
    expect(audioHandler).toContain("evidenceSource: 'internal_ffmpeg'")
    expect(imageHandler).toContain("filter: 'lanczos'")
    expect(imageHandler).toContain("provider: 'internal'")
  })

  it('accepts only complete local evidence and rejects false live-provider claims', () => {
    const audio = validAudioProof()
    expect(validateInternalExecutorProof(audio.job, audio.artifact)).toEqual({ capability: 'audio_to_audio', completedAt: '2026-07-22T18:00:00.000Z' })
    const image = validImageProof()
    expect(validateInternalExecutorProof(image.job, image.artifact)).toEqual({ capability: 'image_upscale', completedAt: '2026-07-22T18:05:00.000Z' })
    expect(validateInternalExecutorProof(image.job, {
      ...image.artifact,
      metadata: JSON.stringify({ evidenceSource: 'internal_ffmpeg', liveProviderProof: true, outputChecksum: 'sha256:image-checksum', sourceArtifactId: 'source-image-id', outputValidation: { valid: true, width: 640, height: 360, filter: 'lanczos' } }),
    })).toBeNull()
  })
})
