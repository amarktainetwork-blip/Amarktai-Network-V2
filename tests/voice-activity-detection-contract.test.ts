import { readFileSync } from 'node:fs'
import { resolve } from 'node:path'
import { describe, expect, it } from 'vitest'
import {
  VoiceActivityDetectionOutputSchema,
  VoiceActivityDetectionRequestSchema,
} from '../packages/core/src/voice-activity-detection-contracts.ts'
import { INTERNAL_EXECUTOR_REGISTRATIONS } from '../packages/core/src/internal-executor-registry.ts'

const root = resolve(import.meta.dirname, '..')
const read = (path: string) => readFileSync(resolve(root, path), 'utf8')
const sourceAudioArtifactId = '11111111-1111-4111-8111-111111111111'

describe('voice activity detection closure', () => {
  it('accepts only bounded provider-neutral source-audio requests', () => {
    const parsed = VoiceActivityDetectionRequestSchema.parse({
      sourceAudioArtifactId,
      idempotencyKey: 'vad-contract-1',
    })
    expect(parsed).toMatchObject({ thresholdDb: -35, minimumSpeechMs: 250, minimumSilenceMs: 300 })
    expect(VoiceActivityDetectionRequestSchema.safeParse({ ...parsed, provider: 'deepinfra' }).success).toBe(false)
    expect(VoiceActivityDetectionRequestSchema.safeParse({ ...parsed, sourceAudioArtifactId: 'https://example.invalid/audio.wav' }).success).toBe(false)
    expect(VoiceActivityDetectionRequestSchema.safeParse({ ...parsed, thresholdDb: -100 }).success).toBe(false)
  })

  it('requires finite ordered speech segments and truthful FFmpeg evidence', () => {
    const output = VoiceActivityDetectionOutputSchema.parse({
      sourceAudioArtifactId,
      durationSeconds: 2,
      speechDurationSeconds: 0.8,
      speechRatio: 0.4,
      segments: [{ startSeconds: 0.2, endSeconds: 1, durationSeconds: 0.8 }],
      thresholdDb: -35,
      minimumSpeechMs: 250,
      minimumSilenceMs: 300,
      evidence: {
        evidenceSource: 'internal_ffmpeg',
        liveProviderProof: false,
        engine: 'ffmpeg',
        filter: 'silencedetect',
        sourceChecksum: 'a'.repeat(64),
        outputValidation: { durationProbed: true, finiteOrderedSegments: true, segmentCount: 1 },
      },
    })
    expect(output.segments).toHaveLength(1)
    expect(VoiceActivityDetectionOutputSchema.safeParse({ ...output, segments: [{ startSeconds: 1, endSeconds: 0.2, durationSeconds: 0.8 }] }).success).toBe(false)
  })

  it('registers and dispatches the internal executor without provider routing', () => {
    const registration = INTERNAL_EXECUTOR_REGISTRATIONS.find((item) => item.capability === 'voice_activity_detection')
    expect(registration).toMatchObject({
      id: 'internal.ffmpeg.voice-activity-detection',
      engine: 'ffmpeg',
      handlerName: 'handleVoiceActivityDetectionJob',
      sourceArtifactRequired: true,
      artifactOutput: null,
      evidenceSource: 'internal_ffmpeg',
    })
    const jobs = read('apps/api/src/routes/jobs.ts')
    const fallback = read('apps/worker/src/providers/durable-provider-fallback.ts')
    const fixture = read('scripts/lib/proof-voice-audio-release-fixture.mjs')
    expect(jobs).toContain('VoiceActivityDetectionRequestSchema.safeParse(input)')
    expect(jobs).toContain("sourceAudioArtifactId")
    expect(jobs).toContain('SOURCE_ARTIFACT_READ_GRANT_REQUIRED')
    expect(fallback).toContain("payload.capability === 'voice_activity_detection'")
    expect(fallback).toContain('handleVoiceActivityDetectionJob')
    expect(fixture).toContain("capability: 'voice_activity_detection'")
    expect(fixture).toContain('VAD idempotency failed')
    expect(fixture).toContain('VAD cross-app source audio was not hidden')
  })
})
