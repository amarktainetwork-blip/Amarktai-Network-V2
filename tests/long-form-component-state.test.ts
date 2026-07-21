import { describe, expect, it } from 'vitest'
import { classifyLongFormChildJobs, deriveLongFormComponentState, type LongFormJobLike } from '../packages/db/src/long-form-parent-state.ts'

const child = (id: string, capability: string, sceneNumber: number | null, status = 'completed', artifactId: string | null = `${id}-artifact`, metadata: Record<string, unknown> = {}): LongFormJobLike => ({
  id, capability, sceneNumber, status, artifactId, retryCount: 0, error: null, metadataJson: JSON.stringify(metadata),
})

describe('canonical long-form component state', () => {
  it('classifies mixed children without counting voiceover or music as scenes', () => {
    const jobs: LongFormJobLike[] = [
      ...Array.from({ length: 5 }, (_, index) => child(`scene-${index + 1}`, 'video_generation', index + 1, 'completed', `video-${index + 1}`, { longFormVideo: true, sceneNumber: index + 1 })),
      ...Array.from({ length: 5 }, (_, index) => child(`voice-${index + 1}`, 'tts', index + 1, index === 0 ? 'failed' : 'completed', index === 0 ? null : `audio-${index + 1}`, { longFormVoiceover: true, sceneNumber: index + 1 })),
      child('music', 'music_generation', null, 'failed', null, { longFormMusicBed: true }),
    ]
    const classified = classifyLongFormChildJobs(jobs)
    expect(classified.scenes).toHaveLength(5)
    expect(classified.voiceovers).toHaveLength(5)
    expect(classified.musicBeds).toHaveLength(1)
    const state = deriveLongFormComponentState({ parentMetadata: metadata(), children: jobs })
    expect(state.scenes.completedCount).toBe(5)
    expect(state.scenes.failedCount).toBe(0)
    expect(state.voiceover.failedCount).toBe(1)
    expect(state.musicBed.status).toBe('failed')
  })

  it('orders TTS artifacts, links subtitle and music artifacts, and gates assembly', () => {
    const jobs = [
      child('scene-2', 'video_generation', 2, 'completed', 'video-2', { longFormVideo: true, sceneNumber: 2 }),
      child('scene-1', 'video_generation', 1, 'completed', 'video-1', { longFormVideo: true, sceneNumber: 1 }),
      child('voice-2', 'tts', 2, 'completed', 'voice-artifact-2', { longFormVoiceover: true, sceneNumber: 2 }),
      child('voice-1', 'tts', 1, 'completed', 'voice-artifact-1', { longFormVoiceover: true, sceneNumber: 1 }),
      child('music', 'music_generation', null, 'completed', 'music-artifact', { longFormMusicBed: true }),
    ]
    const artifacts = [
      ...['video-1', 'video-2', 'voice-artifact-1', 'voice-artifact-2'].map((id) => ({ id, mimeType: id.startsWith('video') ? 'video/mp4' : 'audio/wav', fileSizeBytes: 10, status: 'completed', metadata: '{}' })),
      { id: 'subtitle-artifact', mimeType: 'application/x-subrip', fileSizeBytes: 10, status: 'completed', metadata: '{}' },
      { id: 'music-artifact', mimeType: 'audio/mpeg', fileSizeBytes: 10, status: 'completed', metadata: JSON.stringify({ duration: 8 }) },
    ]
    const state = deriveLongFormComponentState({ parentMetadata: metadata(), children: jobs, artifacts })
    expect(state.voiceover.artifactIds).toEqual(['voice-artifact-1', 'voice-artifact-2'])
    expect(state.subtitles).toMatchObject({ artifactId: 'subtitle-artifact', format: 'srt', ready: true })
    expect(state.musicBed).toMatchObject({ jobId: 'music', artifactId: 'music-artifact', duration: 8, ready: true })
    expect(state.readyToQueueAssembly).toBe(true)
    expect(state.blockedReasons).toEqual([])
  })

  it('intentionally treats voiceover-enabled scenes without text as requiring no TTS job', () => {
    const base = metadata()
    const parsed = JSON.parse(base)
    parsed.plan.storyboard.scenes[1].voiceoverText = ''
    const jobs = [
      child('scene-1', 'video_generation', 1, 'completed', 'video-1', { longFormVideo: true, sceneNumber: 1 }),
      child('scene-2', 'video_generation', 2, 'completed', 'video-2', { longFormVideo: true, sceneNumber: 2 }),
      child('voice-1', 'tts', 1, 'completed', 'voice-1', { longFormVoiceover: true, sceneNumber: 1 }),
    ]
    const state = deriveLongFormComponentState({ parentMetadata: parsed, children: jobs, artifacts: [{ id: 'voice-1', mimeType: 'audio/wav', fileSizeBytes: 10, status: 'completed', metadata: '{}' }] })
    expect(state.voiceover.expectedCount).toBe(1)
    expect(state.voiceover.ready).toBe(true)
  })

  it('does not complete the parent when a requested component was omitted from the final artifact', () => {
    const jobs: LongFormJobLike[] = [
      child('scene-1', 'video_generation', 1, 'completed', 'video-1', { longFormVideo: true, sceneNumber: 1 }),
      child('scene-2', 'video_generation', 2, 'completed', 'video-2', { longFormVideo: true, sceneNumber: 2 }),
      child('voice-1', 'tts', 1, 'completed', 'voice-1', { longFormVoiceover: true, sceneNumber: 1 }),
      child('voice-2', 'tts', 2, 'completed', 'voice-2', { longFormVoiceover: true, sceneNumber: 2 }),
      child('music', 'music_generation', null, 'completed', 'music-artifact', { longFormMusicBed: true }),
      { ...child('assembly', 'long_form_video', null, 'completed', 'final-artifact', { longFormAssembly: true }), output: JSON.stringify({ finalVideoValidated: true, finalAudioValidated: true, voiceoverIncluded: true, musicBedIncluded: true, subtitlesIncluded: false }) },
    ]
    const artifacts = [
      ...['video-1', 'video-2', 'voice-1', 'voice-2'].map((id) => ({ id, mimeType: id.startsWith('video') ? 'video/mp4' : 'audio/wav', fileSizeBytes: 10, status: 'completed', metadata: '{}' })),
      { id: 'subtitle-artifact', mimeType: 'application/x-subrip', fileSizeBytes: 10, status: 'completed', metadata: '{}' },
      { id: 'music-artifact', mimeType: 'audio/mpeg', fileSizeBytes: 10, status: 'completed', metadata: JSON.stringify({ duration: 8 }) },
      { id: 'final-artifact', mimeType: 'video/mp4', fileSizeBytes: 100, status: 'completed', metadata: JSON.stringify({ finalVideoValidated: true, finalAudioValidated: true, voiceoverIncluded: true, musicBedIncluded: true, subtitlesIncluded: false }) },
    ]
    const missing = deriveLongFormComponentState({ parentMetadata: metadata(), children: jobs, artifacts })
    expect(missing.assembly.requestedComponentsIncluded).toBe(false)
    expect(missing.assembly.ready).toBe(false)
    expect(missing.blockedReasons).toContain('final_artifact_validation_failed')

    jobs[jobs.length - 1]!.output = JSON.stringify({ finalVideoValidated: true, finalAudioValidated: true, voiceoverIncluded: true, musicBedIncluded: true, subtitlesIncluded: true })
    const complete = deriveLongFormComponentState({ parentMetadata: metadata(), children: jobs, artifacts })
    expect(complete.assembly.requestedComponentsIncluded).toBe(true)
    expect(complete.assembly.ready).toBe(true)
  })
})

function metadata(): string {
  return JSON.stringify({
    request: { voiceoverEnabled: true, subtitlesEnabled: true, musicBedEnabled: true },
    plan: { storyboard: { scenes: [
      { sceneNumber: 1, durationSeconds: 4, voiceoverText: 'One' },
      { sceneNumber: 2, durationSeconds: 4, voiceoverText: 'Two' },
    ] } },
    subtitleArtifactId: 'subtitle-artifact', subtitleFormat: 'srt',
  })
}
