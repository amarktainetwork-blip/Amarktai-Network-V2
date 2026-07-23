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

function validStoryboardProof() {
  return {
    job: {
      id: 'job-storyboard', appSlug: 'dashboard-video', capability: 'storyboard_generation', status: 'completed',
      completedAt: '2026-07-22T18:10:00.000Z', artifactId: ARTIFACT_ID, provider: 'internal',
      model: 'planner-storyboard-v1', output: JSON.stringify({ artifactId: ARTIFACT_ID }), traceId: 'trace-storyboard',
    },
    artifact: {
      id: ARTIFACT_ID, appSlug: 'dashboard-video', type: 'document', subType: 'storyboard_generation_plan',
      status: 'completed', provider: 'internal', model: 'planner-storyboard-v1', traceId: 'trace-storyboard',
      mimeType: 'application/json', fileSizeBytes: 4096, storagePath: '/artifacts/storyboard.json', storageUrl: '/api/artifacts/storyboard.json',
      metadata: JSON.stringify({
        evidenceSource: 'internal_planner', liveProviderProof: false, outputChecksum: 'sha256:storyboard',
        providerCallsStarted: false,
        outputValidation: { valid: true, sceneCount: 6, totalDurationSeconds: 30, providerCallsStarted: false },
      }),
    },
  }
}

function validSubtitleProof() {
  return {
    job: {
      id: 'job-subtitle', appSlug: 'dashboard-video', capability: 'subtitle_generation', status: 'completed',
      completedAt: '2026-07-22T18:15:00.000Z', artifactId: ARTIFACT_ID, provider: 'internal',
      model: 'formatter-subtitle-v1', output: JSON.stringify({ artifactId: ARTIFACT_ID }), traceId: 'trace-subtitle',
    },
    artifact: {
      id: ARTIFACT_ID, appSlug: 'dashboard-video', type: 'transcript', subType: 'subtitle_generation_srt',
      status: 'completed', provider: 'internal', model: 'formatter-subtitle-v1', traceId: 'trace-subtitle',
      mimeType: 'application/x-subrip', fileSizeBytes: 512, storagePath: '/artifacts/subtitles.srt', storageUrl: '/api/artifacts/subtitles.srt',
      metadata: JSON.stringify({
        evidenceSource: 'internal_formatter', liveProviderProof: false, outputChecksum: 'sha256:subtitles',
        outputValidation: { valid: true, segmentCount: 2, durationSeconds: 10, timingSource: 'explicit_segments', nonOverlapping: true },
      }),
    },
  }
}

describe('internal atomic executor truth', () => {
  it('registers FFmpeg, planner and formatter executors in the release set', () => {
    expect(INTERNAL_EXECUTOR_REGISTRATIONS).toHaveLength(5)
    expect(getInternalExecutorRegistration('audio_to_audio')).toMatchObject({
      id: 'internal.ffmpeg.audio-to-audio', handlerName: 'handleAudioToAudioJob', artifactOutput: 'audio',
    })
    expect(getInternalExecutorRegistration('voice_activity_detection')).toMatchObject({
      id: 'internal.ffmpeg.voice-activity-detection', handlerName: 'handleVoiceActivityDetectionJob', artifactOutput: null,
    })
    expect(getInternalExecutorRegistration('image_upscale')).toMatchObject({
      id: 'internal.ffmpeg.image-upscale', handlerName: 'handleImageUpscaleJob', artifactOutput: 'image',
    })
    expect(getInternalExecutorRegistration('storyboard_generation')).toMatchObject({
      id: 'internal.planner.storyboard-generation', handlerName: 'handleStoryboardGenerationJob', artifactOutput: 'document', sourceArtifactRequired: false,
    })
    expect(getInternalExecutorRegistration('subtitle_generation')).toMatchObject({
      id: 'internal.formatter.subtitle-generation', handlerName: 'handleSubtitleGenerationJob', artifactOutput: 'transcript', sourceArtifactRequired: false,
    })
    expect(getReleaseCandidateCapabilityKeys()).toEqual(expect.arrayContaining([
      'audio_to_audio', 'voice_activity_detection', 'image_upscale', 'storyboard_generation', 'subtitle_generation',
    ]))
    expect(getInternalExecutorRegistration('voice_clone')).toBeUndefined()
    expect(getInternalExecutorRegistration('voice_conversion')).toBeUndefined()
  })

  it.each(['audio_to_audio', 'voice_activity_detection', 'image_upscale', 'storyboard_generation', 'subtitle_generation'] as const)(
    'projects %s without fake provider, model, or credential blockers',
    (capability) => {
      const appSlug = getDashboardAppSlug(capability)
      const truth = normalizeEffectiveRuntimeTruth(getRuntimeTruth({
        capabilities: { [capability]: { infrastructureReady: true, policyAllowed: true, locallyProven: true } },
        appGrants: { [appSlug]: { [capability]: true } },
        localStaticEvidence: { [capability]: true },
      }))
      const row = truth.capabilities.find((entry) => entry.capability === capability)
      expect(row).toMatchObject({
        classification: 'LOCALLY_PROVEN', implementationReady: true, configured: true,
        infrastructureReady: true, executableNow: true, locallyProven: true,
        liveProven: false, eligibleProviders: [], eligibleModels: [],
      })
      expect(row?.blockedReasons).not.toContain('credentials_missing')
      expect(row?.blockedReasons).not.toContain('no_catalogued_model_claim')
      expect(row?.blockedReasons).not.toContain('no_executor_compatible_catalogued_model')
      const release = truth.releaseReadiness.find((entry) => entry.capability === capability)
      expect(release).toMatchObject({
        releaseCandidate: true, executorPresent: true, appGrantPresent: true,
        readyForDashboardExecution: true, locallyProven: true, liveProven: false,
      })
    },
  )

  it('binds all internal executors to central worker dispatch', () => {
    const dispatcher = source('apps/worker/src/providers/durable-provider-fallback.ts')
    for (const [capability, handler] of [
      ['audio_to_audio', 'handleAudioToAudioJob'],
      ['voice_activity_detection', 'handleVoiceActivityDetectionJob'],
      ['image_upscale', 'handleImageUpscaleJob'],
      ['storyboard_generation', 'handleStoryboardGenerationJob'],
      ['subtitle_generation', 'handleSubtitleGenerationJob'],
    ]) {
      expect(dispatcher).toContain(`payload.capability === '${capability}'`)
      expect(dispatcher).toContain(`return ${handler}(payload)`)
    }
    const plannerFormatter = source('apps/worker/src/handlers/storyboard-subtitle-handlers.ts')
    expect(plannerFormatter).toContain("evidenceSource: 'internal_planner'")
    expect(plannerFormatter).toContain("evidenceSource: 'internal_formatter'")
    expect(plannerFormatter).toContain('providerCallsStarted: false')
  })

  it('accepts complete local artifact evidence for four operations and rejects false live proof', () => {
    for (const [proof, capability, completedAt] of [
      [validAudioProof(), 'audio_to_audio', '2026-07-22T18:00:00.000Z'],
      [validImageProof(), 'image_upscale', '2026-07-22T18:05:00.000Z'],
      [validStoryboardProof(), 'storyboard_generation', '2026-07-22T18:10:00.000Z'],
      [validSubtitleProof(), 'subtitle_generation', '2026-07-22T18:15:00.000Z'],
    ] as const) {
      expect(validateInternalExecutorProof(proof.job, proof.artifact)).toEqual({ capability, completedAt })
    }
    const subtitle = validSubtitleProof()
    expect(validateInternalExecutorProof(subtitle.job, {
      ...subtitle.artifact,
      metadata: JSON.stringify({
        evidenceSource: 'internal_formatter', liveProviderProof: true, outputChecksum: 'sha256:subtitles',
        outputValidation: { valid: true, segmentCount: 2, durationSeconds: 10, timingSource: 'explicit_segments', nonOverlapping: true },
      }),
    })).toBeNull()
  })
})
