import { describe, expect, it } from 'vitest'
import { validateFinalArtifact } from '../apps/worker/src/long-form-assembly.ts'

describe('30-second long-form final artifact validation', () => {
  const validProbe = {
    streams: [{ codec_type: 'video', width: 1280, height: 720 }],
    format: { duration: '30.000' },
  }

  it('accepts a nonempty playable video with probed dimensions and milestone duration', () => {
    expect(validateFinalArtifact({
      probe: validProbe,
      expectedDuration: 30,
      audioRequested: false,
      mimeType: 'video/mp4',
      fileSizeBytes: 1024,
    })).toEqual({ video: true, audio: true, duration: 30, width: 1280, height: 720 })
  })

  it.each([
    ['non-video MIME', { mimeType: 'application/octet-stream' }],
    ['empty bytes', { fileSizeBytes: 0 }],
    ['missing dimensions', { probe: { streams: [{ codec_type: 'video', width: 0, height: 720 }], format: { duration: '30' } } }],
    ['duration outside milestone', { probe: { streams: [{ codec_type: 'video', width: 1280, height: 720 }], format: { duration: '41' } } }],
  ])('rejects %s', (_label, overrides) => {
    expect(() => validateFinalArtifact({
      probe: validProbe,
      expectedDuration: 30,
      audioRequested: false,
      mimeType: 'video/mp4',
      fileSizeBytes: 1024,
      ...overrides,
    })).toThrow('final_artifact_validation_failed')
  })

  it('requires an audio stream only when optional audio was requested', () => {
    expect(() => validateFinalArtifact({
      probe: validProbe,
      expectedDuration: 30,
      audioRequested: true,
      mimeType: 'video/mp4',
      fileSizeBytes: 1024,
    })).toThrow('audio=false')
  })
})
