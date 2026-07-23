import { readFileSync } from 'node:fs'
import { describe, expect, it } from 'vitest'
import {
  STORYBOARD_INTERNAL_MODEL,
  SUBTITLE_INTERNAL_MODEL,
  StoryboardGenerationOutputSchema,
  StoryboardGenerationRequestSchema,
  SubtitleGenerationOutputSchema,
  SubtitleGenerationRequestSchema,
} from '../packages/core/src/storyboard-subtitle-contracts.ts'

const source = (path: string) => readFileSync(path, 'utf8')
const ARTIFACT_ID = 'a0eebc99-9c0b-4ef8-bb6d-6bb9bd380a11'

describe('standalone storyboard contracts', () => {
  it('accepts a governed production brief with deterministic planning options', () => {
    const parsed = StoryboardGenerationRequestSchema.parse({
      brief: 'Create a cinematic thirty-second launch advert for a governed brand.',
      targetDurationSeconds: 30,
      sceneCount: 6,
      aspectRatio: '16:9',
      style: 'cinematic',
      tone: 'professional',
      idempotencyKey: 'storyboard-fixture-1',
    })
    expect(parsed.sceneCount).toBe(6)
    expect(parsed.includeVoiceoverDraft).toBe(true)
    expect(parsed.includeSubtitleDraft).toBe(true)
  })

  it('requires a brief or script and rejects unknown routing fields', () => {
    expect(StoryboardGenerationRequestSchema.safeParse({ idempotencyKey: 'missing-brief' }).success).toBe(false)
    expect(StoryboardGenerationRequestSchema.safeParse({
      brief: 'A valid storyboard brief with enough detail.',
      idempotencyKey: 'blocked-provider',
      provider: 'genx',
    }).success).toBe(false)
  })

  it('validates the final planner artifact contract as non-provider evidence', () => {
    const storyboard = {
      scenes: [
        {
          sceneNumber: 1, title: 'Opening', description: 'Opening scene', visualPrompt: 'Cinematic opening with controlled lighting',
          durationSeconds: 15, transitionIn: 'fade_in', transitionOut: 'cut', status: 'planned',
        },
        {
          sceneNumber: 2, title: 'Close', description: 'Closing scene', visualPrompt: 'Cinematic closing frame with clear call to action',
          durationSeconds: 15, transitionIn: 'cut', transitionOut: 'fade_out', status: 'planned',
        },
      ],
      totalDurationSeconds: 30,
      narrativeFlow: 'Opening to close',
    }
    expect(StoryboardGenerationOutputSchema.parse({
      artifactId: ARTIFACT_ID,
      artifactUrl: `/api/artifacts/${ARTIFACT_ID}/file`,
      mimeType: 'application/json',
      fileSizeBytes: 1024,
      versionHash: 'version-hash',
      totalDurationSeconds: 30,
      sceneCount: 2,
      storyboard,
      outputChecksum: 'checksum',
      evidence: {
        evidenceSource: 'internal_planner', liveProviderProof: false,
        engine: 'planner', model: STORYBOARD_INTERNAL_MODEL, providerCallsStarted: false,
      },
    }).evidence.liveProviderProof).toBe(false)
  })
})

describe('standalone subtitle contracts', () => {
  it('accepts sequential timed scenes and explicit non-overlapping segments', () => {
    expect(SubtitleGenerationRequestSchema.parse({
      format: 'srt',
      scenes: [
        { sceneNumber: 1, subtitleText: 'First scene', durationSeconds: 4 },
        { sceneNumber: 2, subtitleText: 'Second scene', durationSeconds: 6 },
      ],
      idempotencyKey: 'subtitle-scenes-1',
    }).scenes).toHaveLength(2)

    expect(SubtitleGenerationRequestSchema.parse({
      format: 'vtt',
      segments: [
        { text: 'First segment', startTimeSeconds: 0, endTimeSeconds: 2.5 },
        { text: 'Second segment', startTimeSeconds: 2.5, endTimeSeconds: 5 },
      ],
      idempotencyKey: 'subtitle-segments-1',
    }).segments).toHaveLength(2)
  })

  it('rejects ambiguous, overlapping, unordered or provider-selected inputs', () => {
    expect(SubtitleGenerationRequestSchema.safeParse({
      scenes: [{ sceneNumber: 1, subtitleText: 'Scene', durationSeconds: 3 }],
      segments: [{ text: 'Segment', startTimeSeconds: 0, endTimeSeconds: 3 }],
      idempotencyKey: 'ambiguous',
    }).success).toBe(false)
    expect(SubtitleGenerationRequestSchema.safeParse({
      segments: [
        { text: 'First', startTimeSeconds: 0, endTimeSeconds: 4 },
        { text: 'Overlap', startTimeSeconds: 3, endTimeSeconds: 5 },
      ],
      idempotencyKey: 'overlap',
    }).success).toBe(false)
    expect(SubtitleGenerationRequestSchema.safeParse({
      scenes: [{ sceneNumber: 2, subtitleText: 'Wrong number', durationSeconds: 3 }],
      idempotencyKey: 'wrong-number',
    }).success).toBe(false)
    expect(SubtitleGenerationRequestSchema.safeParse({
      scenes: [{ sceneNumber: 1, subtitleText: 'Scene', durationSeconds: 3 }],
      idempotencyKey: 'provider-field',
      model: 'provider/model',
    }).success).toBe(false)
  })

  it('validates downloadable SRT/VTT result evidence', () => {
    const result = SubtitleGenerationOutputSchema.parse({
      artifactId: ARTIFACT_ID,
      artifactUrl: `/api/artifacts/${ARTIFACT_ID}/file`,
      mimeType: 'application/x-subrip',
      fileSizeBytes: 128,
      format: 'srt',
      segmentCount: 2,
      durationSeconds: 5,
      outputChecksum: 'checksum',
      evidence: {
        evidenceSource: 'internal_formatter', liveProviderProof: false,
        engine: 'formatter', model: SUBTITLE_INTERNAL_MODEL, timingSource: 'explicit_segments',
      },
    })
    expect(result.evidence.liveProviderProof).toBe(false)
  })

  it('binds the generic Job route, central worker and authoritative fixture', () => {
    const jobs = source('apps/api/src/routes/jobs.ts')
    const worker = source('apps/worker/src/providers/durable-provider-fallback.ts')
    const fixture = source('scripts/lib/proof-storyboard-subtitle-release-fixture.mjs')
    const runner = source('scripts/proof-release-fixture.mjs')
    expect(jobs).toContain('StoryboardGenerationRequestSchema.safeParse')
    expect(jobs).toContain('SubtitleGenerationRequestSchema.safeParse')
    expect(jobs).toContain("internalExecutionEngine: 'planner'")
    expect(jobs).toContain("internalExecutionEngine: 'formatter'")
    expect(worker).toContain('handleStoryboardGenerationJob')
    expect(worker).toContain('handleSubtitleGenerationJob')
    expect(fixture).toContain('STORYBOARD_SUBTITLE_RELEASE_FIXTURE=PASS')
    expect(fixture).toContain('Cross-app storyboard Job access was not denied')
    expect(fixture).toContain('Cross-app subtitle Artifact access was not denied')
    expect(runner).toContain('proveStoryboardSubtitleReleaseFixture')
    expect(runner).toContain('STORYBOARD_SUBTITLE_RELEASE_FIXTURE=PASS')
  })
})
