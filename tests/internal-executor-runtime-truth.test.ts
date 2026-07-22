import { readFileSync } from 'node:fs'
import { resolve } from 'node:path'
import { describe, expect, it } from 'vitest'
import {
  INTERNAL_EXECUTOR_REGISTRATIONS,
  getDashboardAppSlug,
  getInternalExecutorRegistration,
  getReleaseCandidateCapabilityKeys,
  getRuntimeTruth,
  normalizeEffectiveRuntimeTruth,
} from '../packages/core/src/index.ts'
import { validateInternalExecutorProof } from '../apps/api/src/lib/internal-executor-proof.ts'

const root = process.cwd()
const source = (path: string) => readFileSync(resolve(root, path), 'utf8')
const ARTIFACT_ID = 'a0eebc99-9c0b-4ef8-bb6d-6bb9bd380a11'

function validProof() {
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

describe('internal atomic executor truth', () => {
  it('registers only the real FFmpeg audio transform and includes it in the release set', () => {
    expect(INTERNAL_EXECUTOR_REGISTRATIONS).toHaveLength(1)
    expect(getInternalExecutorRegistration('audio_to_audio')).toMatchObject({
      id: 'internal.ffmpeg.audio-to-audio',
      engine: 'ffmpeg',
      handlerName: 'handleAudioToAudioJob',
      evidenceSource: 'internal_ffmpeg',
      artifactOutput: 'audio',
      executionMode: 'queued',
    })
    expect(getReleaseCandidateCapabilityKeys()).toContain('audio_to_audio')
    expect(getInternalExecutorRegistration('voice_clone')).toBeUndefined()
    expect(getInternalExecutorRegistration('voice_conversion')).toBeUndefined()
  })

  it('projects internal execution without fake provider, model, or credential blockers', () => {
    const appSlug = getDashboardAppSlug('audio_to_audio')
    const truth = normalizeEffectiveRuntimeTruth(getRuntimeTruth({
      capabilities: {
        audio_to_audio: { infrastructureReady: true, policyAllowed: true, locallyProven: true },
      },
      appGrants: { [appSlug]: { audio_to_audio: true } },
      localStaticEvidence: { audio_to_audio: true },
    }))
    const row = truth.capabilities.find((capability) => capability.capability === 'audio_to_audio')
    expect(row).toMatchObject({
      classification: 'LOCALLY_PROVEN',
      implementationReady: true,
      configured: true,
      infrastructureReady: true,
      executableNow: true,
      locallyProven: true,
      liveProven: false,
      eligibleProviders: [],
      eligibleModels: [],
    })
    expect(row?.executorRegistrationIds).toContain('internal:internal.ffmpeg.audio-to-audio')
    expect(row?.blockedReasons).not.toContain('credentials_missing')
    expect(row?.blockedReasons).not.toContain('no_catalogued_model_claim')
    expect(row?.blockedReasons).not.toContain('no_executor_compatible_catalogued_model')
    const release = truth.releaseReadiness.find((entry) => entry.capability === 'audio_to_audio')
    expect(release).toMatchObject({ releaseCandidate: true, executorPresent: true, appGrantPresent: true, readyForDashboardExecution: true, locallyProven: true, liveProven: false })
  })

  it('binds the registry to the real central worker dispatch and authoritative fixture', () => {
    const dispatcher = source('apps/worker/src/providers/durable-provider-fallback.ts')
    const handler = source('apps/worker/src/handlers/voice-audio-handlers.ts')
    const fixture = source('scripts/lib/proof-voice-audio-release-fixture.mjs')
    expect(dispatcher).toContain("payload.capability === 'audio_to_audio'")
    expect(dispatcher).toContain('return handleAudioToAudioJob(payload)')
    expect(handler).toContain("evidenceSource: 'internal_ffmpeg'")
    expect(handler).toContain("provider: 'internal'")
    expect(fixture).toContain('VOICE_AUDIO_RELEASE_FIXTURE')
  })

  it('accepts only complete local evidence and rejects a false live-provider claim', () => {
    const { job, artifact } = validProof()
    expect(validateInternalExecutorProof(job, artifact)).toEqual({
      capability: 'audio_to_audio', completedAt: '2026-07-22T18:00:00.000Z',
    })
    expect(validateInternalExecutorProof(job, {
      ...artifact,
      metadata: JSON.stringify({
        evidenceSource: 'internal_ffmpeg', liveProviderProof: true,
        outputChecksum: 'sha256:fixture-checksum', sourceArtifactId: 'source-audio-id',
      }),
    })).toBeNull()
  })
})
